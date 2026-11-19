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
  const activeCategoryProducts = selectedCategory === "all"
    ? products
    : products.filter((product) => product.category === selectedCategory);
  const activeSubcategories = [...new Set(activeCategoryProducts.map((product) => product.subcategory))]
    .sort((first, second) => first.localeCompare(second));
  const visibleProducts = selectedSubcategory === "all"
    ? activeCategoryProducts
    : activeCategoryProducts.filter((product) => product.subcategory === selectedSubcategory);
  const visibleCategoryGroups = selectedCategory === "all"
    ? categoryGroups
    : [[selectedCategory, visibleProducts] as [string, StorefrontProductDisplay[]]];

  function chooseCategory(category: string) {
    setSelectedCategory(category);
    setSelectedSubcategory("all");
  }

  return (
    <div className="storefront-catalog">
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

      {selectedCategory !== "all" ? (
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
        <div className="storefront-catalog-groups">
          {visibleCategoryGroups.map(([category, categoryProducts]) => {
            const groups = selectedSubcategory === "all"
              ? productGroups(categoryProducts)
              : [[selectedSubcategory, categoryProducts] as [string, StorefrontProductDisplay[]]];
            return (
              <section className="storefront-catalog-category" key={category} aria-label={category}>
                {selectedCategory === "all" ? <h3>{category}</h3> : null}
                {groups.map(([subcategory, groupedProducts]) => (
                  <section className="storefront-catalog-subcategory" key={`${category}-${subcategory}`}>
                    {selectedSubcategory === "all" ? (
                      <h4>{subcategory}<span>{groupedProducts.length}</span></h4>
                    ) : null}
                    <div className="storefront-product-grid">
                      {groupedProducts.map((product) => (
                        <StorefrontProductCard
                          key={product.id}
                          product={product}
                          storefrontUsername={storefrontUsername}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <p className="storefront-empty-products">No products are currently available.</p>
      )}
    </div>
  );
}
