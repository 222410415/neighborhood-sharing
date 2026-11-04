"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Bike,
  Camera,
  ChevronDown,
  CookingPot,
  Drill,
  Gamepad2,
  Heart,
  Lamp,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tent,
  Truck,
  WashingMachine,
} from "lucide-react";
import { ImageFrame } from "@/components/ui/image-frame";
import { RangeCalendar, nextRange } from "@/components/ui/range-calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import { fetchFavorites, removeFavorite, saveFavorite } from "@/features/community/community-api";
import {
  fetchPublishedListings,
  type PublicListingItem,
} from "@/features/listings/public-listings-api";
import {
  getPublicMediaUrl,
  isDemoPlaceholderMedia,
} from "@/features/media/media-api";
import { CATEGORIES, RIYADH_NEIGHBORHOODS } from "@/lib/catalogue-options";
import { errorText } from "@/lib/api-client";
import { formatDayRange, riyadhDayEndIso, riyadhDayStartIso } from "@/lib/format";

const categoryIcons = [
  Drill,
  Camera,
  Tent,
  WashingMachine,
  CookingPot,
  Lamp,
  Bike,
  Truck,
];
const categories = CATEGORIES.map((category, index) => ({
  ...category,
  name: category.shortName,
  icon: categoryIcons[index]!,
}));
const neighborhoods = RIYADH_NEIGHBORHOODS;

function ListingCard({
  item,
  dates,
  saved,
  onToggleSave,
}: {
  item: PublicListingItem;
  /** Search dates carried to the item page, so they are not entered twice. */
  dates: string;
  saved: boolean | null;
  onToggleSave: (item: PublicListingItem) => void;
}) {
  const Icon =
    categories.find((category) => category.id === item.categoryId)?.icon ??
    Gamepad2;
  return (
    <article className="item-card">
      <Link href={`/items/${item.id}${dates}`} className="item-card-link">
        <div className="item-card-image">
          {item.primaryMediaId && !isDemoPlaceholderMedia(item.primaryMediaId) ? (
            <ImageFrame
              src={getPublicMediaUrl(item.primaryMediaId, "thumbnail")}
              alt={item.titleEn}
              aspectRatio="square"
              className="!rounded-none !aspect-auto h-full"
              fallback={
                <div className="item-fallback">
                  <Icon aria-hidden="true" />
                </div>
              }
            />
          ) : (
            <div className="item-fallback">
              <Icon aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="item-card-row">
          <h3 className="item-card-title">{item.titleEn}</h3>
          <span className="item-card-price">
            {item.lendingMode === "free" ? (
              "Free"
            ) : (
              <>
                SAR {(item.dailyRateHalalas / 100).toFixed(0)} <small>/ day</small>
              </>
            )}
          </span>
        </div>
        <div className="item-card-location">{item.neighborhoodName}</div>
      </Link>
      {saved !== null && (
        <button
          type="button"
          className="photo-action"
          aria-pressed={saved}
          aria-label={saved ? `Remove ${item.titleEn} from saved items` : `Save ${item.titleEn}`}
          onClick={() => onToggleSave(item)}
        >
          <Heart
            size={19}
            className={saved ? "fill-[var(--nsr-primary)] text-[var(--nsr-primary)]" : ""}
            aria-hidden="true"
          />
        </button>
      )}
    </article>
  );
}

interface CataloguePage {
  items: PublicListingItem[];
  nextCursor: string | null;
  hasMore: boolean;
  scanLimitReached: boolean;
}

/** First page per filter set, kept while the tab is open so returning to Explore is instant. */
const cataloguePages = new Map<string, CataloguePage>();

function ExploreContent() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.get("search") ?? "";
  const category = params.get("category") ?? "";
  const neighborhood = params.get("neighborhood") ?? "";
  const lendingMode = params.get("lendingMode") ?? "";
  const fromDay = params.get("from") ?? "";
  const toDay = params.get("to") ?? "";
  const minPrice = params.get("minPrice") ?? "";
  const maxPrice = params.get("maxPrice") ?? "";
  const [searchInput, setSearchInput] = useState(search);
  const pageKey = params.toString();
  const remembered = cataloguePages.get(pageKey);
  const [scanLimitReached, setScanLimitReached] = useState(remembered?.scanLimitReached ?? false);
  const [items, setItems] = useState<PublicListingItem[]>(remembered?.items ?? []);
  const [loading, setLoading] = useState(!remembered);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(remembered?.nextCursor ?? null);
  const [hasMore, setHasMore] = useState(remembered?.hasMore ?? false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [whenStart, setWhenStart] = useState<string | null>(fromDay || null);
  const [whenEnd, setWhenEnd] = useState<string | null>(toDay || null);
  const [savedIds, setSavedIds] = useState<Set<string> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const whenRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const requestId = useRef(0);
  const hasFilters = Boolean(
    search || category || neighborhood || lendingMode || fromDay || toDay || minPrice || maxPrice,
  );
  const sarToHalalas = (v: string) => (v && !Number.isNaN(Number(v)) ? Math.round(Number(v) * 100) : undefined);

  useEffect(() => setSearchInput(search), [search]);
  useEffect(() => {
    setWhenStart(fromDay || null);
    setWhenEnd(toDay || null);
  }, [fromDay, toDay]);

  useEffect(() => {
    if (!user) {
      setSavedIds(null);
      return;
    }
    let active = true;
    fetchFavorites().then((res) => {
      if (active && res.data) setSavedIds(new Set(res.data.items.map((f) => f.listingId)));
    });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!whenOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!whenRef.current?.contains(event.target as Node)) setWhenOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWhenOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [whenOpen]);

  const load = useCallback(
    async (cursor?: string) => {
      const currentRequest = ++requestId.current;
      const known = cursor ? undefined : cataloguePages.get(pageKey);
      if (cursor) setLoadingMore(true);
      else {
        // A remembered list stays on screen while it refreshes in the background.
        if (known) {
          setItems(known.items);
          setNextCursor(known.nextCursor);
          setHasMore(known.hasMore);
          setScanLimitReached(known.scanLimitReached);
        }
        setLoading(!known);
        setLoadingMore(false);
      }
      setError(false);
      const result = await fetchPublishedListings({
        category: category || undefined,
        neighborhood: neighborhood || undefined,
        lendingMode: lendingMode || undefined,
        search: search || undefined,
        from: fromDay && toDay ? riyadhDayStartIso(fromDay) : undefined,
        to: fromDay && toDay ? riyadhDayEndIso(toDay) : undefined,
        minRate: sarToHalalas(minPrice),
        maxRate: sarToHalalas(maxPrice),
        cursor,
        pageSize: 12,
      });
      if (currentRequest !== requestId.current) return;
      if (cursor) setLoadingMore(false);
      else setLoading(false);
      if (!result) {
        if (!known) setError(true);
        return;
      }
      if (!cursor) {
        cataloguePages.set(pageKey, {
          items: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          scanLimitReached: !!result.scanLimitReached,
        });
      }
      setItems((current) =>
        cursor ? [...current, ...result.items] : result.items,
      );
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setScanLimitReached(!!result.scanLimitReached);
    },
    [pageKey, category, neighborhood, lendingMode, search, fromDay, toDay, minPrice, maxPrice],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const updateFilters = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.push(query ? `/?${query}` : "/", { scroll: false });
  };
  const updateFilter = (key: string, value: string) => updateFilters({ [key]: value });
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    updateFilter("search", searchInput.trim());
    setSearchOpen(false);
  };
  const pickDay = (day: string) => {
    const range = nextRange({ start: whenStart, end: whenEnd }, day);
    setWhenStart(range.start);
    setWhenEnd(range.end);
    if (range.end) {
      updateFilters({ from: range.start, to: range.end });
      setWhenOpen(false);
    }
  };
  const clearDates = () => {
    setWhenStart(null);
    setWhenEnd(null);
    updateFilters({ from: "", to: "" });
    setWhenOpen(false);
  };
  const toggleSave = async (item: PublicListingItem) => {
    if (!savedIds) return;
    const wasSaved = savedIds.has(item.id);
    setSaveError(null);
    const res = wasSaved
      ? await removeFavorite(item.id)
      : await saveFavorite(item.id, { alertEnabled: false, desiredStartAt: null, desiredEndAt: null });
    if (res.error) {
      setSaveError(errorText(res.error, "That item could not be saved."));
      return;
    }
    setSavedIds((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const hasDates = Boolean(fromDay && toDay);
  const whenLabel = hasDates ? formatDayRange(fromDay, toDay) : "Any dates";
  const whereLabel = neighborhoods.find((n) => n.id === neighborhood)?.name ?? "Anywhere in Riyadh";
  const cardDates = hasDates ? `?from=${fromDay}&to=${toDay}` : "";
  const moreFilters = Boolean(lendingMode || minPrice || maxPrice);

  return (
    <>
      <div className="explore-shell">
        <section className="explore-head" aria-labelledby="explore-title">
          <h1 id="explore-title" className="explore-title">
            Borrow it from a neighbor.
          </h1>
          <button
            type="button"
            className="search-summary"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <span className="search-summary-text">
              <strong>{search || "Anything nearby"}</strong>
              <span>
                {whereLabel}, {whenLabel}
              </span>
            </span>
            <span className="search-summary-icon" aria-hidden="true">
              <Search size={20} />
            </span>
          </button>
          <form
            className={`search-panel ${searchOpen ? "search-panel--open" : ""}`}
            onSubmit={submitSearch}
            role="search"
          >
            <div className="search-field search-field--wide">
              <label htmlFor="home-search">What</label>
              <input
                id="home-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="A drill, projector, camping gear..."
              />
            </div>
            <div className="search-field">
              <label htmlFor="home-neighborhood">Where</label>
              <select
                id="home-neighborhood"
                value={neighborhood}
                onChange={(e) => updateFilter("neighborhood", e.target.value)}
              >
                <option value="">Anywhere in Riyadh</option>
                {neighborhoods.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="search-field" ref={whenRef}>
              <span className="search-field-label" id="home-when-label">
                When
              </span>
              <button
                type="button"
                className="search-when"
                aria-labelledby="home-when-label home-when-value"
                aria-expanded={whenOpen}
                onClick={() => setWhenOpen(!whenOpen)}
              >
                <span id="home-when-value">{whenLabel}</span>
              </button>
              {whenOpen && (
                <div className="when-popover" role="group" aria-label="Choose your dates">
                  <RangeCalendar start={whenStart} end={whenEnd} onPick={pickDay} />
                  <div className="when-actions">
                    <span className="text-[13px] text-[var(--nsr-text-secondary)]">
                      {whenStart && !whenEnd ? "Now choose your return day" : "Choose your pickup day"}
                    </span>
                    {(whenStart || hasDates) && (
                      <button type="button" className="text-button" onClick={clearDates}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button className="search-submit" type="submit">
              Search
            </button>
          </form>
        </section>

        <section id="discover" className="results-section" aria-labelledby="discover-title">
          <div className="results-bar">
            <h2 id="discover-title" className="results-title">
              {hasDates && <span className="live-dot" aria-hidden="true" />}
              {hasDates ? "Free on your dates" : "Near you"}
            </h2>
            <button
              type="button"
              className="filter-chip"
              aria-pressed={!category}
              onClick={() => updateFilter("category", "")}
            >
              All
            </button>
            {categories.map(({ id, name }) => (
              <button
                type="button"
                key={id}
                className="filter-chip"
                aria-pressed={category === id}
                onClick={() => updateFilter("category", category === id ? "" : id)}
              >
                {name}
              </button>
            ))}
            <div className="results-actions">
              <button
                type="button"
                className="filter-button"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <SlidersHorizontal size={15} aria-hidden="true" /> Filters{moreFilters ? " (on)" : ""}{" "}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <Link href="/requests" className="filter-button">
                Requests
              </Link>
            </div>
          </div>
          {filtersOpen && (
            <div className="filter-panel">
              <button
                type="button"
                className="filter-chip"
                aria-pressed={lendingMode === "free"}
                onClick={() => updateFilter("lendingMode", lendingMode === "free" ? "" : "free")}
              >
                Free to borrow
              </button>
              <label className="inline-flex items-center gap-2 text-[14px]">
                SAR per day
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder="Min"
                  aria-label="Minimum price per day in SAR"
                  className="w-20"
                  value={minPrice}
                  onChange={(e) => updateFilter("minPrice", e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder="Max"
                  aria-label="Maximum price per day in SAR"
                  className="w-20"
                  value={maxPrice}
                  onChange={(e) => updateFilter("maxPrice", e.target.value)}
                />
              </label>
              {hasFilters && (
                <button
                  type="button"
                  className="clear-button"
                  onClick={() => router.push("/", { scroll: false })}
                >
                  Clear all
                </button>
              )}
            </div>
          )}
          {saveError && (
            <p role="status" className="m-0 text-[14px] text-[var(--nsr-error)]">
              {saveError}
            </p>
          )}
          {loading ? (
            <div className="item-grid">
              {Array.from({ length: 8 }, (_, i) => (
                <div className="item-card" key={i}>
                  <Skeleton className="aspect-[4/3] w-full !rounded-[16px]" />
                  <Skeleton className="h-5 w-4/5" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="catalogue-state">
              <span className="catalogue-state-icon">
                <Sparkles size={24} aria-hidden="true" />
              </span>
              <h3>We couldn’t load nearby items</h3>
              <p>Please try again in a moment.</p>
              <button type="button" className="filter-chip" onClick={() => void load()}>
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="catalogue-state">
              <span className="catalogue-state-icon">
                <Search size={24} aria-hidden="true" />
              </span>
              <h3>
                {scanLimitReached
                  ? "No matches in the part we checked"
                  : hasFilters
                    ? "No matches just yet"
                    : "Your neighborhood collection is growing"}
              </h3>
              {scanLimitReached && nextCursor && (
                <button type="button" className="filter-chip mb-3" onClick={() => void load(nextCursor)}>
                  Keep searching
                </button>
              )}
              <p>
                {hasFilters
                  ? "Try another search or clear your filters to explore more."
                  : "Be the first to share something useful with your neighbors."}
              </p>
              {hasFilters ? (
                <button
                  type="button"
                  className="filter-chip"
                  onClick={() => router.push("/", { scroll: false })}
                >
                  Clear filters
                </button>
              ) : (
                <Link href="/listings/new" className="primary-link">
                  List an item
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="item-grid">
                {items.map((item) => (
                  <ListingCard
                    key={item.id}
                    item={item}
                    dates={cardDates}
                    saved={savedIds ? savedIds.has(item.id) : null}
                    onToggleSave={toggleSave}
                  />
                ))}
              </div>
              {scanLimitReached && (
                <p className="m-0 text-center text-[14px] text-[var(--nsr-text-secondary)]">
                  We checked part of the collection for these filters. Keep searching to see whether more items match.
                </p>
              )}
              {hasMore && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    className="filter-button"
                    disabled={loadingMore}
                    onClick={() => nextCursor && void load(nextCursor)}
                  >
                    {loadingMore ? "Loading..." : scanLimitReached ? "Keep searching" : "Show more items"}{" "}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <footer className="site-footer">
        Neighborhood ·{" "}
        <Link href="/policies" className="underline">
          Policies
        </Link>
      </footer>
    </>
  );
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="explore-shell">
          <Skeleton className="h-[320px] w-full !rounded-[20px]" />
        </div>
      }
    >
      <ExploreContent />
    </Suspense>
  );
}
