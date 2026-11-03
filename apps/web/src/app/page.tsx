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
  Lamp,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tent,
  Truck,
  WashingMachine,
} from "lucide-react";
import { ImageFrame } from "@/components/ui/image-frame";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchPublishedListings,
  type PublicListingItem,
} from "@/features/listings/public-listings-api";
import {
  getPublicMediaUrl,
  isDemoPlaceholderMedia,
} from "@/features/media/media-api";
import { CATEGORIES, RIYADH_NEIGHBORHOODS } from "@/lib/catalogue-options";
import { riyadhDayEndIso, riyadhDayStartIso } from "@/lib/format";

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

function ListingCard({ item }: { item: PublicListingItem }) {
  const Icon =
    categories.find((category) => category.id === item.categoryId)?.icon ??
    Gamepad2;
  return (
    <Link href={`/items/${item.id}`} className="item-card">
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
        <span className="item-badge">
          {item.lendingMode === "free" ? "Free to borrow" : "Rent nearby"}
        </span>
      </div>
      <div className="item-card-body">
        <div className="item-card-category">
          {item.categoryName || "Shared locally"}
        </div>
        <h3 className="item-card-title">{item.titleEn}</h3>
        <div className="item-card-location">
          <MapPin size={13} aria-hidden="true" /> {item.neighborhoodName}
        </div>
        <div className="item-card-footer">
          <span className="item-card-price">
            {item.lendingMode === "free" ? (
              "Free"
            ) : (
              <>
                SAR {(item.dailyRateHalalas / 100).toFixed(0)}{" "}
                <small>/ day</small>
              </>
            )}
          </span>
          <span className="item-card-arrow">
            <ArrowRight size={15} aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}

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
  const [scanLimitReached, setScanLimitReached] = useState(false);
  const [items, setItems] = useState<PublicListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const requestId = useRef(0);
  const hasFilters = Boolean(
    search || category || neighborhood || lendingMode || fromDay || toDay || minPrice || maxPrice,
  );
  const sarToHalalas = (v: string) => (v && !Number.isNaN(Number(v)) ? Math.round(Number(v) * 100) : undefined);

  useEffect(() => setSearchInput(search), [search]);
  const load = useCallback(
    async (cursor?: string) => {
      const currentRequest = ++requestId.current;
      if (cursor) setLoadingMore(true);
      else {
        setLoading(true);
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
        setError(true);
        return;
      }
      setItems((current) =>
        cursor ? [...current, ...result.items] : result.items,
      );
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setScanLimitReached(!!result.scanLimitReached);
    },
    [category, neighborhood, lendingMode, search, fromDay, toDay, minPrice, maxPrice],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.push(query ? `/?${query}` : "/", { scroll: false });
  };
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    updateFilter("search", searchInput.trim());
    document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <div className="explore-shell">
        <section className="hero reveal" aria-label="Discover items near you">
          <div className="hero-content">
            <div className="eyebrow">
              <span className="eyebrow-dot" /> YOUR NEIGHBORHOOD, MORE CONNECTED
            </div>
            <h1>
              Good things are <em>closer</em> than you think.
            </h1>
            <p>
              Borrow a little. Share a lot. Discover useful things from people
              right around the corner.
            </p>
            <div className="hero-caption">
              <span className="hero-caption-line" /> MADE FOR NEIGHBORS IN
              RIYADH
            </div>
          </div>
        </section>

        <form
          className="search-panel reveal reveal-delay"
          onSubmit={submitSearch}
          role="search"
        >
          <div className="search-field">
            <label htmlFor="home-search">What are you looking for?</label>
            <div className="search-field-input">
              <Search size={18} aria-hidden="true" />
              <input
                id="home-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="A drill, projector, camping gear..."
              />
            </div>
          </div>
          <div className="search-field">
            <label htmlFor="home-neighborhood">Your neighborhood</label>
            <div className="search-field-input">
              <MapPin size={18} aria-hidden="true" />
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
          </div>
          <button className="search-submit" type="submit">
            <Search size={18} aria-hidden="true" /> Search
          </button>
        </form>

        <section
          className="category-section reveal reveal-delay-2"
          aria-labelledby="category-title"
        >
          <div className="section-topline">
            <div>
              <p className="section-kicker">A LITTLE BIT OF EVERYTHING</p>
              <h2 id="category-title" className="section-title">
                What can we help you find?
              </h2>
              <p className="section-desc">
                Explore the things your neighbors are sharing.
              </p>
            </div>
          </div>
          <div className="category-grid">
            {categories.map(({ id, name, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={`category-tile ${category === id ? "active" : ""}`}
                aria-pressed={category === id}
                onClick={() =>
                  updateFilter("category", category === id ? "" : id)
                }
              >
                <span className="category-icon">
                  <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
                </span>
                {name}
              </button>
            ))}
          </div>
        </section>

        <section
          id="discover"
          className="results-section"
          aria-labelledby="discover-title"
        >
          <div className="section-topline">
            <div>
              <p className="section-kicker">THE LOCAL COLLECTION</p>
              <h2 id="discover-title" className="section-title">
                Shared around you
              </h2>
              <p className="section-desc">
                Find something useful, meet someone nearby.
              </p>
            </div>
            <div className="results-toolbar">
              <Link href="/requests" className="filter-button">
                Community requests
              </Link>
              <button
                type="button"
                className="filter-button"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <SlidersHorizontal size={15} aria-hidden="true" /> Filters{" "}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
          {filtersOpen && (
            <div className="filter-panel">
              <button
                type="button"
                className={`filter-chip ${lendingMode === "free" ? "active" : ""}`}
                aria-pressed={lendingMode === "free"}
                onClick={() =>
                  updateFilter(
                    "lendingMode",
                    lendingMode === "free" ? "" : "free",
                  )
                }
              >
                Free to borrow
              </button>
              <select
                aria-label="Filter by neighborhood"
                value={neighborhood}
                onChange={(e) => updateFilter("neighborhood", e.target.value)}
              >
                <option value="">All neighborhoods</option>
                {neighborhoods.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-1 text-[13px]">
                Available from
                <input
                  type="date"
                  aria-label="Available from"
                  value={fromDay}
                  onChange={(e) => updateFilter("from", e.target.value)}
                />
              </label>
              <label className="inline-flex items-center gap-1 text-[13px]">
                to
                <input
                  type="date"
                  aria-label="Available until"
                  value={toDay}
                  min={fromDay || undefined}
                  onChange={(e) => updateFilter("to", e.target.value)}
                />
              </label>
              <label className="inline-flex items-center gap-1 text-[13px]">
                SAR/day
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder="min"
                  aria-label="Minimum price per day in SAR"
                  className="w-20"
                  value={minPrice}
                  onChange={(e) => updateFilter("minPrice", e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder="max"
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
                  Clear filters
                </button>
              )}
            </div>
          )}
          {loading ? (
            <div className="item-grid">
              {Array.from({ length: 8 }, (_, i) => (
                <div className="item-card" key={i}>
                  <Skeleton className="!rounded-none aspect-square w-full" />
                  <div className="item-card-body">
                    <Skeleton className="h-4 w-1/2 mb-3" />
                    <Skeleton className="h-6 w-4/5 mb-3" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="catalogue-state">
              <span className="catalogue-state-icon">
                <Sparkles size={25} />
              </span>
              <h3>We couldn’t load nearby items</h3>
              <p>
                Please try again in a moment. Your neighborhood collection will
                appear here when the service is available.
              </p>
              <button
                type="button"
                className="filter-chip"
                onClick={() => void load()}
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="catalogue-state">
              <span className="catalogue-state-icon">
                <Search size={25} />
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
                <Link href="/listings/new" className="header-cta">
                  List an item <ArrowRight size={15} />
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="item-grid">
                {items.map((item) => (
                  <ListingCard key={item.id} item={item} />
                ))}
              </div>
              {scanLimitReached && (
                <p className="mt-6 text-center text-[13px] text-[var(--nsr-text-secondary)]">
                  We checked part of the collection for these filters. Keep searching to see whether more items match.
                </p>
              )}
              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    type="button"
                    className="filter-button"
                    disabled={loadingMore}
                    onClick={() => nextCursor && void load(nextCursor)}
                  >
                    {loadingMore ? "Loading..." : scanLimitReached ? "Keep searching" : "Show more items"}{" "}
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="how-section" aria-labelledby="how-title">
          <p className="section-kicker">SIMPLE BY DESIGN</p>
          <h2 id="how-title" className="section-title">
            Sharing starts close to home.
          </h2>
          <div className="how-grid">
            <div className="how-step">
              <span className="how-number">01</span>
              <div>
                <h3>Find what you need</h3>
                <p>Browse useful items offered by people in your area.</p>
              </div>
            </div>
            <div className="how-step">
              <span className="how-number">02</span>
              <div>
                <h3>Discover the details</h3>
                <p>See the item, location, and lending terms up front.</p>
              </div>
            </div>
            <div className="how-step">
              <span className="how-number">03</span>
              <div>
                <h3>Share something back</h3>
                <p>Give your own rarely used items a second life.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
      <footer className="site-footer">
        Neighborhood · Good things belong together. ·{" "}
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
          <Skeleton className="h-[470px] w-full !rounded-[30px]" />
        </div>
      }
    >
      <ExploreContent />
    </Suspense>
  );
}
