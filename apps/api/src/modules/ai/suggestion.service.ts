/**
 * Related-item suggestions ("You might also need").
 *
 * The server picks up to 20 eligible candidates: published, not the item
 * itself, not owned by the viewer, same or complementary category, same city,
 * and available for the dates when dates are given. The AI model may rank up to 4
 * of them; every returned id is checked against the candidate set and the
 * rest are discarded. Without AI (no key, timeout, error) the answer is the
 * ordinary fallback: same-category items, same neighborhood first, labelled
 * "Similar items" with no AI label. A short cache never skips eligibility.
 */

import { Injectable } from "@nestjs/common";
import { TRUST_CONFIG, type SuggestionItemDto, type SuggestionsDto } from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import { NotFoundException } from "../../common/errors/api-exceptions.js";
import type { ListingDocument } from "../listings/listing.repository.js";
import { PublicListingRepository } from "../listings/public-listing.repository.js";
import { AiClient, AiUnavailableError, type TestScenario } from "./ai.client.js";
import {
  buildSuggestionRequest,
  validateSuggestions,
  type ModelRequest,
  type SuggestionCandidate,
} from "./suggestion-prompt.js";

/** Categories that are often used together (draft mapping). */
const COMPLEMENTARY: Record<string, string[]> = {
  cat_tools: ["cat_moving", "cat_cleaning"],
  cat_electronics: ["cat_party"],
  cat_camping: ["cat_sports", "cat_kitchen"],
  cat_cleaning: ["cat_tools", "cat_moving"],
  cat_kitchen: ["cat_party", "cat_camping"],
  cat_party: ["cat_kitchen", "cat_electronics"],
  cat_sports: ["cat_camping"],
  cat_moving: ["cat_tools", "cat_cleaning"],
};

const AI_LABEL = "AI-assisted suggestions. Check each item's details and availability before booking.";
const FALLBACK_LABEL = "Similar items";

interface CacheEntry {
  picks: { id: string; reason: string }[];
  expiresAt: number;
}

export interface SuggestionResult extends SuggestionsDto {
  /** Only with AI test hooks: the exact request that would be sent to the model. */
  debugPayload?: ModelRequest;
}

@Injectable()
export class SuggestionService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly firebase: FirebaseService,
    private readonly catalogue: PublicListingRepository,
    private readonly ai: AiClient,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  private async labels() {
    const [cats, hoods] = await Promise.all([
      this.db.collection(COLLECTIONS.categories).get(),
      this.db.collection(COLLECTIONS.neighborhoods).get(),
    ]);
    return {
      category: new Map(cats.docs.map((d) => [d.id, (d.data()["nameEn"] as string) ?? ""])),
      hoodName: new Map(hoods.docs.map((d) => [d.id, (d.data()["nameEn"] as string) ?? ""])),
      hoodCity: new Map(hoods.docs.map((d) => [d.id, (d.data()["cityId"] as string) ?? ""])),
    };
  }

  async suggest(
    listingId: string,
    viewerUid: string | undefined,
    dates: { from?: string; to?: string },
    scenario: TestScenario | null,
    testIds: string[] = [],
  ): Promise<SuggestionResult> {
    const sourceSnap = await this.db.collection(COLLECTIONS.listings).doc(listingId).get();
    const source = sourceSnap.exists ? (sourceSnap.data() as ListingDocument) : null;
    if (!source || source.status !== "published") throw new NotFoundException("Listing not found");

    const labels = await this.labels();
    const sourceCity = labels.hoodCity.get(source.neighborhoodId);
    const related = new Set([source.categoryId, ...(COMPLEMENTARY[source.categoryId] ?? [])]);

    const published = (await this.db.collection(COLLECTIONS.listings).where("status", "==", "published").limit(400).get())
      .docs.map((d) => d.data() as ListingDocument);
    let pool = published.filter(
      (l) =>
        l.id !== source.id &&
        (!viewerUid || l.ownerUid !== viewerUid) &&
        related.has(l.categoryId) &&
        (!sourceCity || labels.hoodCity.get(l.neighborhoodId) === sourceCity),
    );
    pool.sort(
      (a, b) =>
        Number(b.categoryId === source.categoryId) - Number(a.categoryId === source.categoryId) ||
        Number(b.neighborhoodId === source.neighborhoodId) - Number(a.neighborhoodId === source.neighborhoodId) ||
        a.id.localeCompare(b.id),
    );
    if (dates.from && dates.to) {
      const checked = await Promise.all(
        pool.slice(0, 40).map(async (l) => ((await this.catalogue.availableFor(l, dates.from!, dates.to!, viewerUid)) ? l : null)),
      );
      pool = checked.filter((l): l is ListingDocument => !!l);
    }
    const candidates = pool.slice(0, TRUST_CONFIG.maxSuggestionCandidates);
    const byId = new Map(candidates.map((c) => [c.id, c]));

    const toItem = (l: ListingDocument, reason: string | null): SuggestionItemDto => ({
      id: l.id,
      titleEn: l.titleEn,
      categoryId: l.categoryId,
      categoryName: labels.category.get(l.categoryId) ?? "",
      neighborhoodName: labels.hoodName.get(l.neighborhoodId) ?? "",
      lendingMode: l.lendingMode,
      dailyRateHalalas: l.lendingMode === "free" ? 0 : l.dailyRateHalalas,
      depositHalalas: l.depositHalalas,
      primaryMediaId: l.primaryMediaId,
      reason,
    });
    const now = new Date().toISOString();
    const fallback = (): SuggestionResult => ({
      listingId,
      source: "category",
      label: FALLBACK_LABEL,
      items: candidates
        .filter((c) => c.categoryId === source.categoryId)
        .slice(0, TRUST_CONFIG.maxSuggestions)
        .map((c) => toItem(c, null)),
      generatedAt: now,
    });

    if (candidates.length === 0) return fallback();

    const request = buildSuggestionRequest(
      {
        titleEn: source.titleEn,
        categoryName: labels.category.get(source.categoryId) ?? "",
        descriptionEn: source.descriptionEn ?? "",
        includedAccessories: source.includedAccessories ?? [],
      },
      candidates.map(
        (c): SuggestionCandidate => ({
          id: c.id,
          titleEn: c.titleEn,
          categoryName: labels.category.get(c.categoryId) ?? "",
          neighborhoodName: labels.hoodName.get(c.neighborhoodId) ?? "",
          lendingMode: c.lendingMode,
          dailyRateHalalas: c.dailyRateHalalas,
          condition: c.condition,
        }),
      ),
    );
    const withDebug = (r: SuggestionResult): SuggestionResult => (scenario ? { ...r, debugPayload: request } : r);

    // Cached picks are filtered by the current candidate set (eligibility is never skipped).
    const cacheKey = `${listingId}|${viewerUid ?? ""}|${dates.from ?? ""}|${dates.to ?? ""}`;
    const cached = !scenario ? this.cache.get(cacheKey) : undefined;
    let picks: { id: string; reason: string }[] | null = null;
    if (cached && cached.expiresAt > Date.now()) {
      picks = cached.picks.filter((p) => byId.has(p.id));
    } else if (scenario || this.ai.enabled) {
      try {
        const raw = scenario ? this.stub(scenario, candidates, testIds, source.id) : await this.ai.generateJson(request);
        picks = validateSuggestions(raw, new Set(byId.keys()), TRUST_CONFIG.maxSuggestions);
        if (!scenario) {
          this.cache.set(cacheKey, { picks, expiresAt: Date.now() + TRUST_CONFIG.suggestionCacheSeconds * 1000 });
        }
      } catch (err) {
        if (!(err instanceof AiUnavailableError)) throw err;
        picks = null;
      }
    }

    if (!picks || picks.length === 0) return withDebug(fallback());
    return withDebug({
      listingId,
      source: "ai",
      label: AI_LABEL,
      items: picks.map((p) => toItem(byId.get(p.id)!, p.reason || null)),
      generatedAt: now,
    });
  }

  /** Deterministic stand-in for the model (test hooks only). */
  private stub(scenario: TestScenario, candidates: ListingDocument[], testIds: string[], sourceId: string): unknown {
    if (scenario === "unavailable") throw new AiUnavailableError("Simulated AI outage (test hook)");
    const valid = candidates.slice(0, 2).map((c) => ({ id: c.id, reason: "Often used together (test stub)." }));
    if (scenario === "fabricated") {
      return {
        suggestions: [
          { id: "itm_fabricated-by-model", reason: "Invented id that must be discarded." },
          { id: sourceId, reason: "The item itself must be discarded." },
          ...testIds.map((id) => ({ id, reason: "Ineligible id that must be discarded." })),
          ...valid,
        ],
      };
    }
    return { suggestions: valid };
  }
}
