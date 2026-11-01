import type { MetadataRoute } from "next";
import { getCategories, getCategoryArticles, getPublishedArticles } from "@/lib/help";
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
    ...publishedCompanySlugs.map((slug) => `/${slug}`),
    "/resources",
    ...resourceCards.map((resource) => `/resources/${resource.slug}`),
  ];
  return routes.map((route) => ({
    url: `${PRODUCTION_URL}${route === "/" ? "" : route}`,
    changeFrequency: route.startsWith("/resources/") ? "monthly" : "yearly",
    priority: route === "/" ? 1 : route === "/resources" ? 0.8 : 0.7,
  }));
}
