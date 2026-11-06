"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Settings,
  Store,
  Tag,
  UserRound,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { logoutAction } from "@/app/dashboard/actions";

type DashboardShellProps = {
  creatorName: string;
  email: string;
  avatarUrl: string | null;
  children: ReactNode;
};

type UnsavedChangesContextValue = {
  setUnsavedChanges: (source: string, value: boolean) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/storefront", label: "Storefront", icon: Store },
  { href: "/dashboard/profile", label: "My Profile", icon: UserRound },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/help", label: "Help & Support", icon: CircleHelp },
  { href: "/pricing", label: "Pricing", icon: Tag },
];

export function useDashboardUnsavedChanges(source: string) {
  const context = useContext(UnsavedChangesContext);
  if (!context) throw new Error("Dashboard unsaved-change state is unavailable.");
  return useCallback(
    (value: boolean) => context.setUnsavedChanges(source, value),
    [context, source],
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
}

export function DashboardShell({ creatorName, email, avatarUrl, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [unsavedSources, setUnsavedSources] = useState<Set<string>>(() => new Set());
  const setUnsavedChanges = useCallback((source: string, value: boolean) => {
    setUnsavedSources((current) => {
      const next = new Set(current);
      if (value) next.add(source);
      else next.delete(source);
      return next.size === current.size && [...next].every((item) => current.has(item))
        ? current
        : next;
    });
  }, []);
  const unsavedContext = useMemo(() => ({ setUnsavedChanges }), [setUnsavedChanges]);
  const hasUnsavedChanges = unsavedSources.size > 0;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  function confirmNavigation(event: MouseEvent<HTMLDivElement>) {
    if (!hasUnsavedChanges) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a");
    if (!link || link.target === "_blank" || link.origin !== window.location.origin) return;
    if (!window.confirm("You have unsaved changes. Leave this page and discard them?")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setUnsavedSources(new Set());
  }

  return (
    <UnsavedChangesContext.Provider value={unsavedContext}>
      <div className="creator-dashboard" onClickCapture={confirmNavigation}>
        <header className="dashboard-topbar">
          <Link href="/dashboard" className="dashboard-brand" aria-label="CloverLoop dashboard">
            <Image src="/images/brand/logo.png" alt="CloverLoop" width={143} height={54} priority />
            <span>Creator studio</span>
          </Link>
          <details className="dashboard-account-menu">
            <summary aria-label={`Account menu for ${creatorName}`}>
              {avatarUrl ? (
                <Image className="dashboard-avatar" src={avatarUrl} alt="" width={38} height={38} />
              ) : (
                <span className="dashboard-avatar dashboard-avatar-fallback" aria-hidden="true">
                  {initials(creatorName)}
                </span>
              )}
              <span className="dashboard-account-name">{creatorName}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <div className="dashboard-account-popover">
              <p className="dashboard-account-email">{email}</p>
              <Link href="/dashboard/profile">My Profile</Link>
              <Link href="/dashboard/settings">Settings</Link>
              <Link href="/dashboard/help">Help &amp; Support</Link>
              <Link href="/pricing">Pricing</Link>
              <form action={logoutAction} onSubmit={(event) => {
                if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Log out and discard them?")) {
                  event.preventDefault();
                }
              }}>
                <button type="submit"><LogOut size={16} /> Log out</button>
              </form>
            </div>
          </details>
        </header>
        <div className="dashboard-frame">
          <aside className="dashboard-sidebar">
            <div className="dashboard-sidebar-identity">
              {avatarUrl ? (
                <Image className="dashboard-avatar" src={avatarUrl} alt="" width={42} height={42} />
              ) : (
                <span className="dashboard-avatar dashboard-avatar-fallback" aria-hidden="true">
                  {initials(creatorName)}
                </span>
              )}
              <div>
                <strong>{creatorName}</strong>
                <span>Creator account</span>
              </div>
            </div>
            <nav aria-label="Creator dashboard">
              {navigation.map(({ href, label, icon: Icon }) => {
                const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={active ? "dashboard-nav-link active" : "dashboard-nav-link"}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="dashboard-sidebar-footer">
              <Link href="/">Visit CloverLoop</Link>
            </div>
          </aside>
          <main className="dashboard-main" id="dashboard-main">
            {children}
          </main>
        </div>
      </div>
    </UnsavedChangesContext.Provider>
  );
}
