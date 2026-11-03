/**
 * Policy retrieval for the assistant: keyword and topic matching over the
 * small policy set (no vector database). Pure functions, unit tested.
 * English and Arabic are both handled; Arabic is normalised (diacritics,
 * alef/ya/ta-marbuta variants) before matching.
 */

export interface PolicyChunk {
  id: string;
  policyVersionId: string;
  policyKey: string;
  locale: "en-SA" | "ar-SA";
  text: string;
}

export interface RetrievedChunk extends PolicyChunk {
  score: number;
}

const EN_STOPWORDS = new Set(
  "a an the and or of to in on for with at by from is are was were be been being do does did can could should would will may might must i me my we our you your it its this that these those what which who whom when where why how if then than there here about into over under after before during up down out off not no yes as so very just also any all some such own same".split(
    " ",
  ),
);
const AR_STOPWORDS = new Set(
  "في من على الى إلى عن مع هل ما ماذا متى كيف لماذا هذا هذه ذلك تلك التي الذي او أو و ثم قد لا لم لن ان أن إن كان يكون انا أنا نحن هو هي هم انت أنت عند بعد قبل كل اي أي".split(" "),
);

/** Words that point to a policy even when the policy text uses other words. */
const TOPICS: Record<string, string[]> = {
  pol_deposit: ["deposit", "refundable", "تامين", "التامين", "عربون", "ضمان", "وديعه"],
  pol_payment: [
    "pay", "payment", "paid", "card", "bank", "money", "transfer",
    "دفع", "الدفع", "ادفع", "يدفع", "دفعه", "بطاقه", "بطاقتي", "بنك",
  ],
  pol_pricing: ["price", "cost", "fee", "fees", "tax", "hour", "hours", "day", "days", "billed", "bill", "charge", "سعر", "رسوم", "ضريبه", "ساعه", "يوم"],
  pol_booking: [
    "request", "book", "booking", "reserve", "reservation", "accept", "accepted", "pending", "pay",
    "حجز", "طلب", "قبول", "ادفع",
  ],
  pol_cancellation: ["cancel", "cancellation", "withdraw", "penalty", "الغاء", "إلغاء", "الإلغاء"],
  pol_return: ["return", "returned", "extend", "extension", "late", "overdue", "ارجاع", "إرجاع", "تمديد", "تاخير"],
  pol_handover: ["collect", "collection", "pickup", "handover", "condition", "accessory", "accessories", "missing", "استلام", "حاله", "ملحقات"],
  pol_disputes: ["dispute", "damage", "damaged", "broken", "report", "complaint", "issue", "conduct", "نزاع", "تلف", "بلاغ", "شكوى"],
  pol_privacy: ["address", "phone", "location", "privacy", "contact", "map", "number", "عنوان", "هاتف", "خصوصيه", "موقع", "رقم"],
  pol_reviews: ["review", "reviews", "rating", "rate", "feedback", "تقييم", "مراجعه"],
  pol_eligibility: ["account", "age", "eligible", "eligibility", "lend", "borrow", "verification", "verified", "حساب", "عمر", "اعاره", "استعاره"],
  pol_ai: ["ai", "assistant", "chatbot", "bot", "recommendation", "insurance", "approve", "decide", "ذكاء", "مساعد", "تامين شامل"],
};

const OVERRIDE_PATTERNS = [
  /ignore (all |any |the )?(previous|prior|above|earlier|your)? ?(instructions|rules|prompt)/i,
  /(system|hidden|developer) (prompt|message|instructions)/i,
  /reveal|print|show me (your|the) (prompt|instructions|config|configuration|key|secret)/i,
  /api[\s_-]?key|secret key|environment variable|\.env\b/i,
  /jailbreak|developer mode|act as|pretend (to be|you are)|you are now/i,
  /تجاهل.*(التعليمات|الأوامر|القواعد)/,
  /(اكشف|اعرض).*(التعليمات|الإعدادات|المفتاح)/,
];

const ACTION_PATTERNS = [
  /\b(refund|release|return) (my|the) (deposit|money)\b/i,
  /\b(refund|cancel|approve|verify|confirm|accept|decline|pay|transfer) (me|my|it|this|the booking|my booking|now)\b/i,
  /\b(do it|right now|immediately)\b/i,
  /\bverify (me|my identity)\b/i,
  /(أعد|اعد|استرد|ألغ|الغ|وافق|ادفع|أكد).*(الآن|حالا|حالاً|لي|التأمين|حجزي)/,
];

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(word: string): string {
  if (/^[a-z]+$/.test(word) && word.length > 4) {
    return word.replace(/(ing|ed|es|s)$/, "");
  }
  // Arabic: drop the definite article for matching.
  return word.startsWith("ال") && word.length > 3 ? word.slice(2) : word;
}

export function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length > 1 && !EN_STOPWORDS.has(w) && !AR_STOPWORDS.has(w))
    .map(stem);
}

export function detectLocale(text: string): "en-SA" | "ar-SA" {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin ? "ar-SA" : "en-SA";
}

export function isOverrideAttempt(question: string): boolean {
  return OVERRIDE_PATTERNS.some((p) => p.test(question));
}

export function isActionRequest(question: string): boolean {
  return ACTION_PATTERNS.some((p) => p.test(question));
}

/** Topic keys the question points to. */
export function topicsOf(question: string): string[] {
  const words = new Set(tokens(question));
  const raw = normalize(question);
  return Object.entries(TOPICS)
    .filter(([, keywords]) => keywords.some((k) => words.has(stem(normalize(k))) || (k.includes(" ") && raw.includes(normalize(k)))))
    .map(([key]) => key);
}

/**
 * Up to `max` chunks, one per policy, preferring the question's language.
 * Score = shared words + 3 for each topic match; zero-score chunks are dropped.
 */
export function retrieve(
  question: string,
  chunks: PolicyChunk[],
  locale: "en-SA" | "ar-SA",
  max: number,
  mustInclude: string[] = [],
): RetrievedChunk[] {
  const q = new Set(tokens(question));
  const topics = new Set([...topicsOf(question), ...mustInclude]);
  const scored = chunks.map((c) => {
    const overlap = new Set(tokens(c.text).filter((t) => q.has(t))).size;
    const score = overlap + (topics.has(c.policyKey) ? 3 : 0) + (mustInclude.includes(c.policyKey) ? 5 : 0);
    return { ...c, score };
  });
  const best = new Map<string, RetrievedChunk>();
  for (const c of scored) {
    if (c.score <= 0) continue;
    const current = best.get(c.policyKey);
    const better =
      !current ||
      (c.locale === locale && current.locale !== locale) ||
      (c.locale === current.locale && c.score > current.score);
    if (better) best.set(c.policyKey, c);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.policyKey.localeCompare(b.policyKey)).slice(0, max);
}

/** Reject generated text that tries to expose configuration. */
export function leaksConfiguration(text: string): boolean {
  return /api[\s_-]?key|system prompt|openai_|\bsk-[0-9A-Za-z_-]{10,}|process\.env/i.test(text);
}
