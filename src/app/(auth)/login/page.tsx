import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your CloverLoop account.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Link href="/" className="auth-brand" aria-label="CloverLoop home">
          <Image src="/images/brand/logo.png" alt="CloverLoop" width={156} height={58} priority />
        </Link>
        <div className="auth-heading">
          <span className="eyebrow">Welcome back</span>
          <h1>Log in to CloverLoop</h1>
          <p>Continue to your CloverLoop onboarding.</p>
        </div>
        <Suspense fallback={<div className="auth-loading">Loading sign-in…</div>}>
          <AuthForm mode="login" />
        </Suspense>
        <p className="auth-switch">New to CloverLoop? <Link href="/signup">Create an account</Link></p>
      </section>
      <aside className="auth-art">
        <Image src="/images/home/creator-community.webp" alt="Creators sharing ideas and working together" width={1376} height={768} priority />
        <p>Your audience. Your products. Your own storefront.</p>
      </aside>
    </main>
  );
}
