import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { TrackLink } from "@/components/track-link";

export function HelpHeader() {
  return (
    <header className="site-header help-header">
      <div className="page-width header-inner">
        <Link href="/help-center" className="brand-link" aria-label="CloverLoop Help Centre">
          <Image src="/images/brand/logo.png" alt="CloverLoop" width={154} height={57} priority className="brand-image" />
        </Link>
        <Link href="/" className="help-back-link">
          <ArrowLeft size={16} aria-hidden="true" /> <span>Back to website</span>
        </Link>
        <div className="header-actions help-header-actions">
          <TrackLink href="/login" event="login_click" className="login-link">Login</TrackLink>
          <TrackLink href="/signup" event="signup_click" className="button header-cta">
            Get Started for Free <ArrowUpRight size={16} aria-hidden="true" />
          </TrackLink>
        </div>
      </div>
    </header>
  );
}
