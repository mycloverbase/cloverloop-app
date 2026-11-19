import { notFound } from "next/navigation";
import { getRazorpayCommissionAuthorisationEmailPreview } from "@/lib/razorpay/commission-authorisation-email";

export const metadata = {
  title: "Razorpay commission email preview | CloverLoop",
  robots: { index: false, follow: false },
};

export default function RazorpayCommissionEmailPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const preview = getRazorpayCommissionAuthorisationEmailPreview();

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <h1>Development-only email preview</h1>
      <p>This uses sample data. It does not send an email or change consent or delivery records.</p>
      <p><strong>Subject:</strong> {preview.subject}</p>
      <iframe
        title="Razorpay commission authorisation email"
        srcDoc={preview.html}
        sandbox=""
        style={{ display: "block", width: "100%", minHeight: 760, border: "1px solid #d3dbc8" }}
      />
      <details style={{ marginTop: 20 }}>
        <summary>Plain-text email preview</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{preview.text}</pre>
      </details>
    </main>
  );
}
