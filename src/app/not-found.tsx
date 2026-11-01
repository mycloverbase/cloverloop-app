import Link from "next/link";
import { PublicLayout } from "@/components/public-layout";

export default function NotFound() {
  return (
    <PublicLayout>
      <section className="not-found page-width">
        <span className="eyebrow">404 · Page not found</span>
        <h1>We couldn&apos;t find that page</h1>
        <p>The link may be incorrect, or the page may have moved.</p>
        <Link href="/" className="button">Return to the homepage</Link>
      </section>
    </PublicLayout>
  );
}
