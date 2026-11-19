import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/blog/coaching-business-gst-invoice-india-2026-guide", destination: "/blog/coaching-business-gst-invoice-india-2027-guide", permanent: true },
      { source: "/blog/freelance-designer-sell-client-templates-india-2026-guide", destination: "/blog/freelance-designer-sell-client-templates-india-2027-guide", permanent: true },
      { source: "/blog/how-much-do-content-creators-earn-in-india", destination: "/blog/how-much-do-content-creators-earn-in-india-2027", permanent: true },
      { source: "/blog/indian-creator-economy-statistics", destination: "/blog/indian-creator-economy-statistics-2027", permanent: true },
      { source: "/blog/instagram-reels-cta-sell-pdf-india-2026-guide", destination: "/blog/instagram-reels-cta-sell-pdf-india-2027-guide", permanent: true },
      { source: "/blog/sell-board-exam-notes-pdf-india-2026-guide", destination: "/blog/sell-board-exam-notes-pdf-india-2027-guide", permanent: true },
      { source: "/blog/sell-exam-prep-pdf-india-2026-guide", destination: "/blog/sell-exam-prep-pdf-india-2027-guide", permanent: true },
      { source: "/blog/sell-menu-price-list-sop-pdf-india-2026-guide", destination: "/blog/sell-menu-price-list-sop-pdf-india-2027-guide", permanent: true },
      { source: "/blog/sell-resume-templates-india-2026-guide", destination: "/blog/sell-resume-templates-india-2027-guide", permanent: true },
      { source: "/blog/tuition-teacher-sell-notes-worksheets-upi-india-2026-guide", destination: "/blog/tuition-teacher-sell-notes-worksheets-upi-india-2027-guide", permanent: true },
      { source: "/blog/youtube-shorts-cta-sell-pdf-india-2026-guide", destination: "/blog/youtube-shorts-cta-sell-pdf-india-2027-guide", permanent: true },
      { source: "/guides/best-free-platform-to-sell-digital-products-in-india-2026", destination: "/guides/best-free-platform-to-sell-digital-products-in-india-2027", permanent: true },
      { source: "/guides/digital-products-for-teachers-to-sell-in-india", destination: "/guides/digital-products-for-teachers-to-sell-in-india-2027", permanent: true },
      { source: "/guides/how-to-earn-passive-income-from-digital-products-in-india", destination: "/guides/how-to-earn-passive-income-from-digital-products-in-india-2027", permanent: true },
      { source: "/guides/how-to-sell-exam-prep-pdfs-in-india", destination: "/guides/how-to-sell-exam-prep-pdfs-in-india-2027", permanent: true },
      { source: "/guides/how-to-sell-notes-online-in-india-2026", destination: "/guides/how-to-sell-notes-online-in-india-2027", permanent: true },
      { source: "/resources/best-platform-to-sell-digital-products-india-2026", destination: "/resources/best-platform-to-sell-digital-products-india-2027", permanent: true },
    ];
  },
  outputFileTracingIncludes: {
    "/api/launch-checklist": ["./public/downloads/cloverloop-link-in-bio-launch-checklist.pdf"],
  },
  experimental: {
    agentUpgrade: "security",
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol.slice(0, -1) as "http" | "https",
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: "/storage/v1/object/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
