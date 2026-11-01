import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Get Started for Free",
  description: "Create your CloverLoop account.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Link href="/" className="auth-brand" aria-label="CloverLoop home">
          <Image src="/images/brand/logo.png" alt="CloverLoop" width={156} height={58} priority />
        </Link>
        <div className="auth-heading">
          <span className="eyebrow">Start here</span>
          <h1>Create your account</h1>
          <p>Get started with CloverLoop using email or your Google account.</p>
        </div>
        <Suspense fallback={<div className="auth-loading">Loading account setup…</div>}>
          <AuthForm mode="signup" />
        </Suspense>
        <p className="auth-switch">Already have an account? <Link href="/login">Log in</Link></p>
      </section>
      <aside className="auth-art">
        <Image src="/images/home/creator-community.webp" alt="Creators sharing ideas and working together" width={1376} height={768} priority />
        <p>Give your digital products a home of their own.</p>
      </aside>
    </main>
  );
}
