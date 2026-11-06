import type { MetadataRoute } from "next";
import { comparisonArticles } from "@/lib/comparisons";
import { getCategories, getCategoryArticles, getPublishedArticles } from "@/lib/help";
import { getGuideSlugs } from "@/lib/guides";
import { legalPolicyPages } from "@/lib/legal-policies";
import { companyPages, featurePages, PRODUCTION_URL, resourceCards } from "@/lib/site";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

const publishedCompanySlugs = Object.keys(companyPages).filter(
  (slug) =>
    slug !== "terms" && slug !== "privacy" && slug !== "contact" && slug !== "founding-creators" && slug !== "help-center",
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createSupabasePublicClient();
  const storefrontRoutes: string[] = [];
  if (supabase) {
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("published_storefronts")
        .select("username")
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error("Could not load published storefronts for the sitemap.", error);
        throw new Error("Published storefront sitemap entries could not be loaded.");
      }
      const page = (data ?? [])
        .filter((storefront) => typeof storefront.username === "string")
        .map((storefront) => `/${storefront.username}`);
      storefrontRoutes.push(...page);
      if (page.length < pageSize) break;
    }
  }
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
    ...getGuideSlugs().map((slug) => `/guides/${slug}`),
    "/compare",
    ...comparisonArticles.map((article) => `/compare/${article.slug}`),
    ...legalPolicyPages.map((policy) => `/${policy.slug}`),
    ...storefrontRoutes,
  ];
  return [...new Set(routes)].map((route) => ({
    url: `${PRODUCTION_URL}${route === "/" ? "" : route}`,
    changeFrequency:
      route.startsWith("/resources/") || route.startsWith("/guides/") || route.startsWith("/compare") ? "monthly" : "yearly",
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
