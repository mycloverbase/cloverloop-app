"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUpRight, Menu, UserRound } from "lucide-react";
import { TrackLink } from "@/components/track-link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SiteHeader() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    const supabase = createSupabaseBrowserClient();
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Could not check the current CloverLoop sign-in state.", error);
        return;
      }
      setIsAuthenticated(Boolean(data.session?.user));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="site-header">
      <div className="page-width header-inner">
        <Link href="/" className="brand-link" aria-label="CloverLoop home">
          <Image
            src="/images/brand/logo.png"
            alt="CloverLoop"
            width={154}
            height={57}
            priority
            className="brand-image"
          />
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <details className="nav-dropdown">
            <summary>
              Features <ArrowDown size={14} />
            </summary>
            <div className="dropdown-panel">
              <Link href="/sell-digital-downloads">Digital Products</Link>
              <Link href="/courses">Courses</Link>
            </div>
          </details>
          <Link href="/pricing">Pricing</Link>
          <Link href="/resources">Resources</Link>
          <Link href="/about">About</Link>
        </nav>
        <div className="header-actions">
          {isAuthenticated ? (
            <Link href="/dashboard" className="button header-cta">
              <UserRound size={16} aria-hidden="true" /> Profile
            </Link>
          ) : (
            <>
              <TrackLink href="/login" event="login_click" className="login-link">
                Login
              </TrackLink>
              <TrackLink
                href="/signup"
                event="signup_click"
                className="button header-cta"
              >
                Get Started for Free <ArrowUpRight size={16} />
              </TrackLink>
            </>
          )}
        </div>
        <details className="mobile-nav">
          <summary aria-label="Open menu">
            <Menu size={23} />
          </summary>
          <nav aria-label="Mobile navigation">
            <Link href="/sell-digital-downloads">Digital Products</Link>
            <Link href="/courses">Courses</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/resources">Resources</Link>
            <Link href="/about">About</Link>
            {isAuthenticated ? (
              <Link href="/dashboard" className="button"><UserRound size={17} aria-hidden="true" /> Profile</Link>
            ) : (
              <>
                <TrackLink href="/login" event="login_click">Login</TrackLink>
                <TrackLink href="/signup" event="signup_click" className="button">
                  Get Started for Free
                </TrackLink>
              </>
            )}
          </nav>
        </details>
      </div>
    </header>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="breadcrumbs page-width" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
