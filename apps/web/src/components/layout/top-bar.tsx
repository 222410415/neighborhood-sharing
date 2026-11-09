"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, CircleUserRound, Plus, Search } from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Menu } from "@/components/ui/menu";
import { useUnreadCount } from "@/features/notifications/use-unread-count";
import { useRoles } from "@/features/roles/use-roles";

const ACTIVITY_PATHS = ["/activity", "/bookings", "/messages", "/notifications"];

export function TopBar() {
  const { user, logOut, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const roles = useRoles();
  const unread = useUnreadCount();
  const displayName =
    user?.displayName ?? user?.email?.split("@")[0] ?? "Neighbor";
  const newItemPath = user ? "/listings/new" : "/sign-in?return=/listings/new";
  const inActivity = ACTIVITY_PATHS.some((path) => pathname.startsWith(path));
  const unreadBadge = unread > 0 && (
    <span className="nav-count" aria-hidden="true">
      {unread > 99 ? "99+" : unread}
    </span>
  );
  const activityLabel = unread > 0 ? `Activity, ${unread} unread` : "Activity";

  const handleSignOut = async () => {
    await logOut();
    router.push("/");
  };

  return (
    <>
      <header className="site-header sticky top-0 z-40">
        <div className="site-header-inner">
          <Link href="/" className="brand" aria-label="Neighborhood home">
            <img src="/brand/mark.png" alt="" className="brand-mark" />
            <span className="brand-name">neighborhood</span>
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
              Explore
            </Link>
            {user && (
              <Link
                href="/activity"
                aria-label={activityLabel}
                aria-current={inActivity ? "page" : undefined}
              >
                Activity {unreadBadge}
              </Link>
            )}
          </nav>
          <div className="header-actions">
            {!loading && !user && (
              <Link href="/sign-in" className="header-signin">
                Sign in
              </Link>
            )}
            <Link
              href="/requests"
              className="header-cta"
              aria-current={pathname.startsWith("/requests") ? "page" : undefined}
            >
              Community requests
            </Link>
            <Link href={newItemPath} className="header-cta">
              List an item
            </Link>
            {loading ? (
              <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--nsr-divider)]" />
            ) : (
              user && (
                <Menu
                  label={`Account menu for ${displayName}`}
                  trigger={<AvatarInitials name={displayName} size="md" />}
                  items={[
                    { label: "Profile", onClick: () => router.push("/profile") },
                    { label: "My listings", onClick: () => router.push("/my-listings") },
                    { label: "Saved items", onClick: () => router.push("/favorites") },
                    { label: "Community requests", onClick: () => router.push("/requests") },
                    { label: "Your reports", onClick: () => router.push("/reports") },
                    { label: "Policies", onClick: () => router.push("/policies") },
                    ...(roles?.isAdmin
                      ? [{ label: "Admin workspace", onClick: () => router.push("/admin") }]
                      : []),
                    { label: "Sign out", onClick: handleSignOut, danger: true },
                  ]}
                />
              )
            )}
          </div>
        </div>
      </header>

      <nav className="tab-bar" aria-label="Mobile navigation">
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
          <Search size={22} aria-hidden="true" /> Explore
        </Link>
        {user && (
          <Link
            href="/activity"
            aria-label={activityLabel}
            aria-current={inActivity ? "page" : undefined}
          >
            <Activity size={22} aria-hidden="true" /> Activity {unreadBadge}
          </Link>
        )}
        <Link
          href={newItemPath}
          aria-current={pathname === "/listings/new" ? "page" : undefined}
        >
          <Plus size={22} aria-hidden="true" /> List
        </Link>
        <Link
          href={user ? "/profile" : "/sign-in"}
          aria-current={pathname.startsWith("/profile") || pathname === "/sign-in" ? "page" : undefined}
        >
          <CircleUserRound size={22} aria-hidden="true" /> {user ? "Profile" : "Sign in"}
        </Link>
      </nav>
    </>
  );
}
