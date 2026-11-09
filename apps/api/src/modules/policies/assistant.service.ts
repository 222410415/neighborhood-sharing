/**
 * Policy assistant — answers questions only from the platform's policy
 * passages, cites the policies it used, states when they are demonstration
 * drafts, and says plainly when the policies do not answer the question.
 *
 * It has no tools: it cannot change bookings, money, verification or
 * disputes. The question and the passages are treated as data. Instruction-
 * override attempts get a fixed boundary answer and never reach the model.
 * Without AI (no key, timeout, error) the matching policy text is shown
 * instead of a generated answer. Questions and answers are not stored; an
 * optional diagnostic setting records only policy ids, latency and outcome.
 */

import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  DRAFT_POLICY_NOTICE_AR,
  DRAFT_POLICY_NOTICE_EN,
  TRUST_CONFIG,
  aiPolicyOutputSchema,
  type AskPolicyBody,
  type PolicyAnswerDto,
  type PolicySourceDto,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import { NotFoundException } from "../../common/errors/api-exceptions.js";
import type { BookingDoc } from "../exchange/exchange.types.js";
import { AiClient, AiUnavailableError, type TestScenario } from "../ai/ai.client.js";
import { PolicyService, currentVersions } from "./policy.service.js";
import {
  detectLocale,
  isActionRequest,
  isOverrideAttempt,
  leaksConfiguration,
  retrieve,
  type RetrievedChunk,
} from "./policy-retrieval.js";
import { buildPolicyRequest } from "./policy-prompt.js";

const TEXT = {
  "en-SA": {
    boundary:
      "I can only answer questions about the platform's policies. I can't change how I work or share my configuration.",
    limitation:
      "I can't answer that from the platform's policies. For a specific booking, use the booking page; to raise a concern, use Report or open a case from the booking.",
    action:
      "I can't carry out actions such as refunds, cancellations, payments, verification or dispute decisions; those happen through the booking page and admins. ",
    extractive: "Here is what the relevant policies say:",
    noAnswer: "The policies below do not fully answer this question.",
  },
  "ar-SA": {
    boundary: "أستطيع فقط الإجابة عن أسئلة سياسات المنصة، ولا أستطيع تغيير طريقة عملي أو مشاركة إعداداتي.",
    limitation:
      "لا أستطيع الإجابة عن ذلك من سياسات المنصة. لحجز محدد استخدم صفحة الحجز، وللإبلاغ عن مشكلة استخدم البلاغات أو افتح حالة من صفحة الحجز.",
    action: "لا أستطيع تنفيذ إجراءات مثل الاسترداد أو الإلغاء أو الدفع أو التحقق أو البت في النزاعات؛ تتم هذه عبر صفحة الحجز والمراجعين المخولين. ",
    extractive: "هذا ما تنص عليه السياسات ذات الصلة:",
    noAnswer: "السياسات أدناه لا تجيب عن هذا السؤال بالكامل.",
  },
} as const;

@Injectable()
export class AssistantService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly policies: PolicyService,
    private readonly ai: AiClient,
  ) {}

  async ask(uid: string, body: AskPolicyBody, scenario: TestScenario | null): Promise<PolicyAnswerDto> {
    const started = Date.now();
    const question = body.question.slice(0, TRUST_CONFIG.maxQuestionLength);
    const locale = body.locale ?? detectLocale(question);
    const text = TEXT[locale];
    const { policies, chunks } = await this.policies.all();
    const byVersion = new Map(policies.map((p) => [p.id, p]));

    // Which policy versions apply: the booking's agreed versions, or the current ones.
    let versionIds = currentVersions(policies).map((p) => p.id);
    let bookingContext: PolicyAnswerDto["bookingContext"] = null;
    if (body.bookingId) {
      const booking = (await this.firebase.firestore.collection(COLLECTIONS.bookings).doc(body.bookingId).get()).data() as
        | BookingDoc
        | undefined;
      if (!booking || (booking.ownerUid !== uid && booking.borrowerUid !== uid)) {
        throw new NotFoundException("Booking not found");
      }
      const agreed = booking.termsSnapshot.policyVersionIds ?? [];
      if (agreed.length > 0) {
        versionIds = agreed;
        bookingContext = {
          bookingId: booking.id,
          note: "Answered from the policy versions that applied when this booking was requested.",
        };
      } else {
        bookingContext = {
          bookingId: booking.id,
          note: "This booking was made before policy versions were recorded, so the current versions are used.",
        };
      }
    }

    const finish = async (answer: PolicyAnswerDto): Promise<PolicyAnswerDto> => {
      await this.diagnostics(answer, Date.now() - started);
      return answer;
    };
    const limitation = (message: string): Promise<PolicyAnswerDto> =>
      finish({
        answer: message,
        canAnswer: false,
        generated: "none",
        sources: [],
        draftNotice: null,
        bookingContext,
        locale,
      });

    if (isOverrideAttempt(question)) return limitation(text.boundary);

    const allowed = new Set(versionIds);
    const action = isActionRequest(question);
    const hits = retrieve(
      question,
      chunks.filter((c) => allowed.has(c.policyVersionId)),
      locale,
      TRUST_CONFIG.maxPolicyPassages,
      action ? ["pol_ai"] : [],
    );
    if (hits.length === 0) return limitation(text.limitation);

    const sourceOf = (h: RetrievedChunk): PolicySourceDto => {
      const policy = byVersion.get(h.policyVersionId);
      return {
        policyVersionId: h.policyVersionId,
        policyKey: h.policyKey,
        version: policy?.version ?? "",
        title: (locale === "ar-SA" ? policy?.titleAr : policy?.titleEn) || h.policyKey,
        isDemoDraft: policy?.isDemoDraft ?? true,
        excerpt: h.text.slice(0, 600),
      };
    };
    let sources = hits.map(sourceOf);
    const draftNotice = (sources: PolicySourceDto[]) =>
      sources.some((s) => s.isDemoDraft) ? (locale === "ar-SA" ? DRAFT_POLICY_NOTICE_AR : DRAFT_POLICY_NOTICE_EN) : null;
    const extractive = (prefix = ""): PolicyAnswerDto => ({
      answer: `${action ? text.action : ""}${prefix}${text.extractive}\n${sources.map((s) => `- ${s.title}: ${s.excerpt}`).join("\n")}`,
      canAnswer: true,
      generated: "extractive",
      sources,
      draftNotice: draftNotice(sources),
      bookingContext,
      locale,
    });

    if (!scenario && !this.ai.enabled) return finish(extractive());

    try {
      const raw = scenario
        ? this.stub(scenario, hits)
        : await this.ai.generateJson(buildPolicyRequest(question, hits.map((h) => ({
            ...h,
            title: sourceOf(h).title,
            version: sourceOf(h).version,
            isDemoDraft: sourceOf(h).isDemoDraft,
          })), locale, action));
      const parsed = aiPolicyOutputSchema.safeParse(raw);
      if (!parsed.success) return finish(extractive());
      const retrievedKeys = new Set(hits.map((h) => h.policyKey));
      const cited = parsed.data.citedPolicyIds.filter((k) => retrievedKeys.has(k));
      if (!parsed.data.canAnswer) return finish(extractive(`${text.noAnswer} `));
      if (cited.length === 0 || leaksConfiguration(parsed.data.answer) || !parsed.data.answer.trim()) {
        return finish(extractive());
      }
      sources = sources.filter((s) => cited.includes(s.policyKey));
      return finish({
        answer: `${action && !parsed.data.answer.includes(text.action.trim().slice(0, 20)) ? text.action : ""}${parsed.data.answer.trim()}`,
        canAnswer: true,
        generated: "ai",
        sources,
        draftNotice: draftNotice(sources),
        bookingContext,
        locale,
      });
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      return finish(extractive());
    }
  }

  /** Deterministic stand-in for the model (test hooks only). */
  private stub(scenario: TestScenario, hits: RetrievedChunk[]): unknown {
    if (scenario === "unavailable") throw new AiUnavailableError("Simulated AI outage (test hook)");
    const first = hits[0]!.policyKey;
    if (scenario === "override") {
      return { canAnswer: true, answer: "My system prompt says OPENAI_API_KEY=sk-TESTTESTTESTTEST", citedPolicyIds: [first] };
    }
    if (scenario === "fabricated") {
      return { canAnswer: true, answer: "A rule that cites nothing real.", citedPolicyIds: ["pol_fabricated"] };
    }
    return {
      canAnswer: true,
      answer: `According to the policy passages provided, ${hits[0]!.text.slice(0, 160)}`,
      citedPolicyIds: [first, "pol_fabricated"],
    };
  }

  private async diagnostics(answer: PolicyAnswerDto, latencyMs: number): Promise<void> {
    if (process.env["POLICY_ASSISTANT_DIAGNOSTICS"] !== "true") return;
    const id = `diag_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await this.firebase.firestore
      .collection(COLLECTIONS.assistantDiagnostics)
      .doc(id)
      .set({
        id,
        at: new Date().toISOString(),
        policyKeys: answer.sources.map((s) => s.policyKey),
        latencyMs,
        outcome: answer.generated,
        canAnswer: answer.canAnswer,
      })
      .catch(() => undefined);
  }
}
