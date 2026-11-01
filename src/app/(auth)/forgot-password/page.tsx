import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Reset the password for your CloverLoop account.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Link href="/" className="auth-brand" aria-label="CloverLoop home">
          <Image src="/images/brand/logo.png" alt="CloverLoop" width={156} height={58} priority />
        </Link>
        <div className="auth-heading">
          <span className="eyebrow">Account recovery</span>
          <h1>Reset your password</h1>
          <p>Enter your account email and we&apos;ll send a secure reset link.</p>
        </div>
        <ForgotPasswordForm />
        <p className="auth-switch"><Link href="/login">Back to login</Link></p>
      </section>
      <aside className="auth-art">
        <Image src="/images/home/creator-community.webp" alt="Creators sharing ideas and working together" width={1376} height={768} priority />
      </aside>
    </main>
  );
}
