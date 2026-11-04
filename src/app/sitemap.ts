import type { MetadataRoute } from "next";
import { comparisonArticles } from "@/lib/comparisons";
import { getCategories, getCategoryArticles, getPublishedArticles } from "@/lib/help";
import { legalPolicyPages } from "@/lib/legal-policies";
import { companyPages, featurePages, PRODUCTION_URL, resourceCards } from "@/lib/site";

const publishedCompanySlugs = Object.keys(companyPages).filter(
  (slug) =>
    slug !== "terms" && slug !== "privacy" && slug !== "contact" && slug !== "founding-creators" && slug !== "help-center",
);

export default function sitemap(): MetadataRoute.Sitemap {
  const helpRoutes = [
    "/help-center",
    ...getCategories().filter((c) => getCategoryArticles(c.slug).length > 0).map((c) => c.href),
    ...getPublishedArticles().map((a) => a.href),
  ];
  const routes = [
    ...helpRoutes,
    "/",
    ...featurePages.map((page) => `/${page.slug}`),
    "/pricing",
    "/courses",
    ...publishedCompanySlugs.map((slug) => `/${slug}`),
    "/resources",
    ...resourceCards.map((resource) => `/resources/${resource.slug}`),
    "/compare",
    ...comparisonArticles.map((article) => `/compare/${article.slug}`),
    ...legalPolicyPages.map((policy) => `/${policy.slug}`),
  ];
  return routes.map((route) => ({
    url: `${PRODUCTION_URL}${route === "/" ? "" : route}`,
    changeFrequency:
      route.startsWith("/resources/") || route.startsWith("/compare") ? "monthly" : "yearly",
    priority:
      route === "/"
        ? 1
        : route === "/resources" || route === "/compare"
          ? 0.8
          : route.startsWith("/compare/")
            ? 0.75
            : 0.7,
  }));
}
