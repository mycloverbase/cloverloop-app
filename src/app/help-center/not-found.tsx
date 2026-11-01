import Link from "next/link";

export default function HelpNotFound() {
  return (
    <section className="not-found page-width">
      <span className="eyebrow">404 · Article not found</span>
      <h1>We couldn&apos;t find that help article</h1>
      <p>The link may be incorrect, or the article may not be published.</p>
      <Link href="/help-center" className="button">Back to the Help Centre</Link>
    </section>
  );
}
