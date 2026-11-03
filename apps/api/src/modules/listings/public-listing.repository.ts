/**
 * Public listing repository — read-only queries for published listings.
 *
 * Sprint 3: filters that are equalities (status, category, neighborhood,
 * lending mode) run in Firestore; search, price range and date availability
 * are applied to bounded batches in memory. Results follow document id order
 * with a stable cursor. Each request scans at most a fixed number of
 * documents; if that budget runs out before the page is full, the response
 * says so (scanLimitReached) instead of claiming there are no more matches.
 * None of these queries needs a composite index.
 */

import { Injectable } from "@nestjs/common";
import { FieldPath } from "firebase-admin/firestore";
import { TRUST_CONFIG, toMillis } from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import type { ListingDocument } from "./listing.repository.js";
import { CalendarGuardService } from "../exchange/calendar-guard.service.js";
import { buildQuote } from "../bookings/quote.service.js";

export interface PublicListingSummary {
  id: string;
  slug: string;
  ownerUid: string;
  categoryId: string;
  neighborhoodId: string;
  titleEn: string;
  titleAr?: string;
  condition: string;
  lendingMode: "free" | "paid";
  currency: string;
  dailyRateHalalas: number;
  depositHalalas: number;
  primaryMediaId: string | null;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  /** True when the scan budget ran out before the page was full. */
  scanLimitReached?: boolean;
}

export interface CatalogueOptions {
  category?: string;
  neighborhood?: string;
  lendingMode?: string;
  search?: string;
  from?: string;
  to?: string;
  minRate?: number;
  maxRate?: number;
  cursor?: string;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;
const BATCH_SIZE = 60;

function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeCursor(cursor?: string): string | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as { after?: unknown };
    return typeof parsed.after === "string" && parsed.after.length > 0 ? parsed.after : null;
  } catch {
    return null;
  }
}

function encodeCursor(afterId: string): string {
  return Buffer.from(JSON.stringify({ after: afterId }), "utf-8").toString("base64url");
}

export function toSummary(data: ListingDocument): PublicListingSummary {
  return {
    id: data.id,
    slug: data.slug,
    ownerUid: data.ownerUid,
    categoryId: data.categoryId,
    neighborhoodId: data.neighborhoodId,
    titleEn: data.titleEn,
    titleAr: data.titleAr,
    condition: data.condition,
    lendingMode: data.lendingMode,
    currency: data.currency,
    dailyRateHalalas: data.dailyRateHalalas,
    depositHalalas: data.depositHalalas,
    primaryMediaId: data.primaryMediaId,
    createdAt: data.createdAt,
  };
}

@Injectable()
export class PublicListingRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly calendar: CalendarGuardService,
  ) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.listings);
  }

  /** Bookable for the whole requested period right now (transactions recheck when booking). */
  async availableFor(listing: ListingDocument, from: string, to: string, viewerUid?: string): Promise<boolean> {
    const now = new Date().toISOString();
    // A period that starts today is checked from now on.
    const start = toMillis(from) <= Date.now() ? new Date(Date.now() + 5 * 60_000).toISOString() : from;
    if (toMillis(to) <= toMillis(start)) return false;
    const calendar = await this.calendar.snapshot(listing.id);
    return buildQuote(listing, start, to, calendar, viewerUid, now).available;
  }

  async getPublishedListings(opts: CatalogueOptions): Promise<PaginatedResult<PublicListingSummary>> {
    const pageSize = Math.min(Math.max(opts.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const search = opts.search ? normalizeSearch(opts.search) : "";
    const dates = opts.from && opts.to ? { from: opts.from, to: opts.to } : null;

    let base = this.collection.where("status", "==", "published");
    if (opts.category) base = base.where("categoryId", "==", opts.category);
    if (opts.neighborhood) base = base.where("neighborhoodId", "==", opts.neighborhood);
    if (opts.lendingMode) base = base.where("lendingMode", "==", opts.lendingMode);
    const ordered = base.orderBy(FieldPath.documentId());

    const matchesSync = (d: ListingDocument): boolean => {
      if (search && !(d.searchTokens ?? []).includes(search)) return false;
      const rate = d.lendingMode === "free" ? 0 : d.dailyRateHalalas;
      if (opts.minRate !== undefined && rate < opts.minRate) return false;
      if (opts.maxRate !== undefined && rate > opts.maxRate) return false;
      return true;
    };

    const items: PublicListingSummary[] = [];
    let after = decodeCursor(opts.cursor);
    let scanned = 0;
    let exhausted = false;
    let lastConsumed: string | null = after;

    outer: while (items.length < pageSize && scanned < TRUST_CONFIG.catalogueScanBudget) {
      const limit = Math.min(BATCH_SIZE, TRUST_CONFIG.catalogueScanBudget - scanned);
      const query = after ? ordered.startAfter(after).limit(limit) : ordered.limit(limit);
      const snap = await query.get();
      const docs = snap.docs.map((d) => d.data() as ListingDocument);
      if (docs.length < limit) exhausted = true;
      if (docs.length === 0) break;

      const candidates = docs.map((d) => ({ doc: d, ok: matchesSync(d) }));
      if (dates) {
        await Promise.all(
          candidates
            .filter((c) => c.ok)
            .map(async (c) => {
              c.ok = await this.availableFor(c.doc, dates.from, dates.to);
            }),
        );
      }
      for (const c of candidates) {
        scanned++;
        lastConsumed = c.doc.id;
        if (c.ok) items.push(toSummary(c.doc));
        if (items.length >= pageSize) {
          // Docs after this one in the batch are read again by the next page.
          const consumedAll = c === candidates[candidates.length - 1];
          if (consumedAll && exhausted) lastConsumed = null;
          break outer;
        }
      }
      after = docs[docs.length - 1]!.id;
      if (exhausted) {
        lastConsumed = null;
        break;
      }
    }

    const budgetHit = !exhausted && items.length < pageSize && scanned >= TRUST_CONFIG.catalogueScanBudget;
    const hasMore = lastConsumed !== null && !(exhausted && items.length < pageSize);
    return {
      items,
      nextCursor: hasMore && lastConsumed ? encodeCursor(lastConsumed) : null,
      hasMore,
      scanLimitReached: budgetHit,
    };
  }

  /**
   * Get a single published listing by ID.
   */
  async getPublishedById(id: string): Promise<ListingDocument | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data() as ListingDocument;
    if (data.status !== "published") return null;
    return data;
  }
}
