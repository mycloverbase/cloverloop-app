import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Mail, MessageSquareText } from "lucide-react";
import { FeedbackForm } from "@/components/dashboard/feedback-form";
import { SUPPORT_EMAIL } from "@/lib/help";

export const metadata: Metadata = {
  title: "Help and support | CloverLoop",
  robots: { index: false, follow: false },
};

export default function DashboardHelpPage() {
  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Help &amp; support</span>
          <h1>How can we help?</h1>
          <p>Find an answer, explore creator resources or contact the CloverLoop team.</p>
        </div>
      </header>

      <section className="dashboard-support-links" aria-label="Support resources">
        <Link className="dashboard-card dashboard-support-link-card" href="/faq">
          <span className="dashboard-support-icon"><MessageSquareText size={22} aria-hidden="true" /></span>
          <span>
            <strong>Frequently asked questions</strong>
            <small>Get answers about plans, accounts and the platform.</small>
          </span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
        <Link className="dashboard-card dashboard-support-link-card" href="/resources">
          <span className="dashboard-support-icon"><BookOpen size={22} aria-hidden="true" /></span>
          <span>
            <strong>Creator resources</strong>
            <small>Browse practical guides and ideas for your creator business.</small>
          </span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
        {SUPPORT_EMAIL ? (
          <a className="dashboard-card dashboard-support-link-card" href={`mailto:${SUPPORT_EMAIL}`}>
            <span className="dashboard-support-icon"><Mail size={22} aria-hidden="true" /></span>
            <span>
              <strong>Contact support</strong>
              <small>{SUPPORT_EMAIL}</small>
            </span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        ) : (
          <Link className="dashboard-card dashboard-support-link-card" href="/contact">
            <span className="dashboard-support-icon"><Mail size={22} aria-hidden="true" /></span>
            <span>
              <strong>Contact support</strong>
              <small>Visit our contact page</small>
            </span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        )}
      </section>

      <FeedbackForm />
    </div>
  );
}
