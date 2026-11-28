"use client";

import { useMemo, useState } from "react";
import { PRODUCT_CATEGORIES } from "@/lib/storefront/product-categories";
import type { StorefrontProductDisplay } from "@/lib/storefront/types";
import { StorefrontProductCard } from "@/components/storefront/storefront-product-card";

function productGroups(products: StorefrontProductDisplay[]) {
  const groups = new Map<string, StorefrontProductDisplay[]>();
  for (const product of products) {
    const group = groups.get(product.subcategory) ?? [];
    group.push(product);
    groups.set(product.subcategory, group);
  }
  return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second));
}

export function ProductCatalog({
  products,
  storefrontUsername,
}: {
  products: StorefrontProductDisplay[];
  storefrontUsername: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSubcategory, setSelectedSubcategory] = useState("all");
  const categoryGroups = useMemo(() => {
    const grouped = new Map<string, StorefrontProductDisplay[]>();
    for (const product of products) {
      const group = grouped.get(product.category) ?? [];
      group.push(product);
      grouped.set(product.category, group);
    }
    return [...grouped.entries()].sort(([first], [second]) => {
      const firstIndex = PRODUCT_CATEGORIES.indexOf(first);
      const secondIndex = PRODUCT_CATEGORIES.indexOf(second);
      if (firstIndex < 0 && secondIndex < 0) return first.localeCompare(second);
      if (firstIndex < 0) return 1;
      if (secondIndex < 0) return -1;
      return firstIndex - secondIndex;
    });
  }, [products]);
  const hasSingleCategory = categoryGroups.length === 1;
  const activeCategory = hasSingleCategory ? categoryGroups[0][0] : selectedCategory;
  const activeCategoryProducts = activeCategory === "all"
    ? products
    : products.filter((product) => product.category === activeCategory);
  const activeSubcategories = [...new Set(activeCategoryProducts.map((product) => product.subcategory))]
    .sort((first, second) => first.localeCompare(second));
  const visibleProducts = selectedSubcategory === "all"
    ? activeCategoryProducts
    : activeCategoryProducts.filter((product) => product.subcategory === selectedSubcategory);
  const orderedProducts = (activeCategory === "all"
    ? categoryGroups.map(([, categoryProducts]) => categoryProducts)
    : [visibleProducts]
  ).flatMap((categoryProducts) =>
    productGroups(categoryProducts.filter((product) => visibleProducts.includes(product)))
      .flatMap(([, groupedProducts]) => groupedProducts),
  );

  function chooseCategory(category: string) {
    setSelectedCategory(category);
    setSelectedSubcategory("all");
  }

  return (
    <div className="storefront-catalog">
      {categoryGroups.length > 1 ? (
        <nav className="storefront-catalog-filters" aria-label="Product categories">
          <button
            type="button"
            className={selectedCategory === "all" ? "selected" : ""}
            aria-pressed={selectedCategory === "all"}
            onClick={() => chooseCategory("all")}
          >
            All <span>{products.length}</span>
          </button>
          {categoryGroups.map(([category, items]) => (
            <button
              type="button"
              className={selectedCategory === category ? "selected" : ""}
              aria-pressed={selectedCategory === category}
              key={category}
              onClick={() => chooseCategory(category)}
            >
              {category} <span>{items.length}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {(selectedCategory !== "all" || hasSingleCategory) && activeSubcategories.length > 1 ? (
        <nav className="storefront-catalog-filters storefront-subcategory-filters" aria-label="Product subcategories">
          <button
            type="button"
            className={selectedSubcategory === "all" ? "selected" : ""}
            aria-pressed={selectedSubcategory === "all"}
            onClick={() => setSelectedSubcategory("all")}
          >
            All <span>{activeCategoryProducts.length}</span>
          </button>
          {activeSubcategories.map((subcategory) => {
            const count = activeCategoryProducts.filter((product) => product.subcategory === subcategory).length;
            return (
              <button
                type="button"
                className={selectedSubcategory === subcategory ? "selected" : ""}
                aria-pressed={selectedSubcategory === subcategory}
                key={subcategory}
                onClick={() => setSelectedSubcategory(subcategory)}
              >
                {subcategory} <span>{count}</span>
              </button>
            );
          })}
        </nav>
      ) : null}

      {visibleProducts.length ? (
        <div className="storefront-product-grid">
          {orderedProducts.map((product) => (
            <StorefrontProductCard
              key={product.id}
              product={product}
              storefrontUsername={storefrontUsername}
            />
          ))}
        </div>
      ) : (
        <p className="storefront-empty-products">No products are currently available.</p>
      )}
    </div>
  );
}
