"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu as MenuIcon, Plus } from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Menu } from "@/components/ui/menu";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useRoles } from "@/features/roles/use-roles";

export function TopBar() {
  const { user, logOut, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const roles = useRoles();
  const displayName =
    user?.displayName ?? user?.email?.split("@")[0] ?? "Neighbor";

  const handleSignOut = async () => {
    await logOut();
    router.push("/");
  };

  return (
    <header className="site-header sticky top-0 z-40">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="Neighborhood home">
          <img src="/brand/mark.png" alt="" className="brand-mark" />
          <span className="brand-name">
            neighborhood<span style={{ color: "#23836d" }}>.</span>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
            Explore
          </Link>
          {user && (
            <>
              <Link
                href="/my-listings"
                aria-current={pathname === "/my-listings" ? "page" : undefined}
              >
                My listings
              </Link>
              <Link
                href="/bookings"
                aria-current={pathname.startsWith("/bookings") ? "page" : undefined}
              >
                Bookings
              </Link>
              <Link
                href="/messages"
                aria-current={pathname.startsWith("/messages") ? "page" : undefined}
              >
                Messages
              </Link>
            </>
          )}
        </nav>
        <div className="header-actions">
          {loading ? (
            <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--nsr-divider)]" />
          ) : user ? (
            <>
            <NotificationBell />
            <Menu
              trigger={
                <span className="flex items-center gap-2">
                  <AvatarInitials name={displayName} size="sm" />
                  <span className="hidden sm:inline text-sm font-semibold">
                    {displayName.split(" ")[0]}
                  </span>
                </span>
              }
              items={[
                { label: "Profile", onClick: () => router.push("/profile") },
                { label: "Saved items", onClick: () => router.push("/favorites") },
                { label: "Community requests", onClick: () => router.push("/requests") },
                { label: "Notifications", onClick: () => router.push("/notifications") },
                { label: "Your reports", onClick: () => router.push("/reports") },
                { label: "Policies", onClick: () => router.push("/policies") },
                ...(roles?.isReviewer
                  ? [{ label: "Review workspace", onClick: () => router.push("/admin") }]
                  : []),
                { label: "Sign out", onClick: handleSignOut, danger: true },
              ]}
            />
            </>
          ) : (
            <Link href="/sign-in" className="header-signin">
              Sign in
            </Link>
          )}
          <Link
            href={user ? "/listings/new" : "/sign-in?return=/listings/new"}
            className="header-cta"
          >
            <Plus size={16} /> List an item
          </Link>
          <button
            type="button"
            className="mobile-menu-button"
            aria-label="Toggle navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <MenuIcon size={21} />
          </button>
        </div>
      </div>
      {mobileMenuOpen && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <Link href="/" onClick={() => setMobileMenuOpen(false)}>
            Explore items
          </Link>
          {user && (
            <>
              <Link href="/my-listings" onClick={() => setMobileMenuOpen(false)}>
                My listings
              </Link>
              <Link href="/bookings" onClick={() => setMobileMenuOpen(false)}>
                Bookings
              </Link>
              <Link href="/messages" onClick={() => setMobileMenuOpen(false)}>
                Messages
              </Link>
              <Link href="/favorites" onClick={() => setMobileMenuOpen(false)}>
                Saved items
              </Link>
              <Link href="/requests" onClick={() => setMobileMenuOpen(false)}>
                Community requests
              </Link>
              <Link href="/notifications" onClick={() => setMobileMenuOpen(false)}>
                Notifications
              </Link>
              <Link href="/policies" onClick={() => setMobileMenuOpen(false)}>
                Policies
              </Link>
              {roles?.isReviewer && (
                <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                  Review workspace
                </Link>
              )}
            </>
          )}
          <Link
            href={user ? "/listings/new" : "/sign-in?return=/listings/new"}
            onClick={() => setMobileMenuOpen(false)}
          >
            List an item
          </Link>
          {!user && (
            <Link href="/sign-in" onClick={() => setMobileMenuOpen(false)}>
              Sign in
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
