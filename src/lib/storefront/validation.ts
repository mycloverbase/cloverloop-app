import {
  STOREFRONT_SECTIONS,
  STOREFRONT_SOCIAL_PLATFORMS,
  type StorefrontCustomization,
  type StorefrontDraftInput,
  type StorefrontSection,
  type StorefrontTheme,
} from "@/lib/storefront/types";

type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length <= maximum ? value.trim() : null;
}

function validUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseStorefrontDraft(value: unknown): Validation<StorefrontDraftInput> {
  if (!isRecord(value) || !isRecord(value.customization)) {
    return { ok: false, message: "Some storefront details are missing. Review the form and try again." };
  }

  const storeName = text(value.storeName, 80);
  const username = text(value.username, 30)?.toLowerCase();
  const description = text(value.description, 1200);
  const profileImagePath =
    value.profileImagePath === null || typeof value.profileImagePath === "string"
      ? value.profileImagePath
      : undefined;
  const bannerImagePath =
    value.bannerImagePath === null || typeof value.bannerImagePath === "string"
      ? value.bannerImagePath
      : undefined;
  const theme = value.theme;
  const source = value.customization;

  if (!storeName || !storeName.trim()) {
    return { ok: false, message: "Enter a store name." };
  }
  if (!username || !/^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/.test(username)) {
    return { ok: false, message: "Use 3–30 letters, numbers, hyphens or underscores for your username." };
  }
  if (description === null) {
    return { ok: false, message: "Your store description must be 1,200 characters or fewer." };
  }
  if (
    profileImagePath === undefined ||
    (profileImagePath !== null && typeof profileImagePath !== "string") ||
    bannerImagePath === undefined ||
    (bannerImagePath !== null && typeof bannerImagePath !== "string")
  ) {
    return { ok: false, message: "The selected storefront images are invalid." };
  }
  if (!["minimal", "editorial", "bold"].includes(String(theme))) {
    return { ok: false, message: "Choose one of the available storefront themes." };
  }

  const primaryColor = text(source.primaryColor, 7);
  const accentColor = text(source.accentColor, 7);
  const backgroundColor = text(source.backgroundColor, 7);
  if (
    !primaryColor || !/^#[0-9a-f]{6}$/i.test(primaryColor) ||
    !accentColor || !/^#[0-9a-f]{6}$/i.test(accentColor) ||
    !backgroundColor || !/^#[0-9a-f]{6}$/i.test(backgroundColor)
  ) {
    return { ok: false, message: "Choose valid primary, accent and background colours." };
  }

  if (!["grid", "list"].includes(String(source.productLayout))) {
    return { ok: false, message: "Choose a valid product card layout." };
  }
  if (!["wide", "compact"].includes(String(source.bannerStyle))) {
    return { ok: false, message: "Choose a valid banner display style." };
  }

  const sectionIds = STOREFRONT_SECTIONS.map((section) => section.id);
  const sectionOrder = source.sectionOrder;
  const hiddenSections = source.hiddenSections;
  if (
    !Array.isArray(sectionOrder) ||
    sectionOrder.length !== sectionIds.length ||
    sectionOrder.some((section) => typeof section !== "string" || !sectionIds.includes(section as StorefrontSection)) ||
    new Set(sectionOrder).size !== sectionIds.length ||
    !Array.isArray(hiddenSections) ||
    hiddenSections.some((section) => typeof section !== "string" || !sectionIds.includes(section as StorefrontSection)) ||
    new Set(hiddenSections).size !== hiddenSections.length
  ) {
    return { ok: false, message: "The storefront section order is invalid." };
  }

  if (!Array.isArray(source.products) || source.products.length > 3) {
    return { ok: false, message: "Add no more than three sample product cards." };
  }
  const products: StorefrontCustomization["products"] = [];
  for (const item of source.products) {
    if (!isRecord(item)) return { ok: false, message: "Check each sample product card and try again." };
    const id = text(item.id, 80);
    const title = text(item.title, 80);
    const description = text(item.description, 240);
    const category = text(item.category, 50);
    const coverImagePath = text(item.coverImagePath, 200);
    if (!id || !title || !category || !coverImagePath || description === null) {
      return {
        ok: false,
        message: "Each sample card needs a title, category, short description and uploaded cover image.",
      };
    }
    products.push({ id, title, description, category, coverImagePath });
  }

  if (!Array.isArray(source.socialLinks) || source.socialLinks.length > 10) {
    return { ok: false, message: "Add no more than ten social media links." };
  }
  const socialLinks: StorefrontCustomization["socialLinks"] = [];
  for (const item of source.socialLinks) {
    if (!isRecord(item)) return { ok: false, message: "Check each social link and try again." };
    const id = text(item.id, 80);
    const platform = text(item.platform, 40);
    const label = text(item.label, 40);
    const rawUrl = text(item.url, 2048);
    const url = rawUrl ? validUrl(rawUrl) : null;
    if (
      !id ||
      !platform ||
      !STOREFRONT_SOCIAL_PLATFORMS.includes(platform as (typeof STOREFRONT_SOCIAL_PLATFORMS)[number]) ||
      !label ||
      !rawUrl ||
      !url
    ) {
      return { ok: false, message: "Each social link needs a platform, label and valid HTTP or HTTPS URL." };
    }
    socialLinks.push({ id, platform, label, url });
  }

  const publicEmail = text(source.publicEmail, 254);
  if (
    publicEmail === null ||
    (publicEmail !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicEmail))
  ) {
    return { ok: false, message: "Enter a valid public business email address or leave it blank." };
  }

  return {
    ok: true,
    value: {
      storeName: storeName.trim(),
      username,
      description,
      profileImagePath,
      bannerImagePath,
      theme: theme as StorefrontTheme,
      customization: {
        primaryColor,
        accentColor,
        backgroundColor,
        productLayout: source.productLayout as StorefrontCustomization["productLayout"],
        bannerStyle: source.bannerStyle as StorefrontCustomization["bannerStyle"],
        sectionOrder: sectionOrder as StorefrontSection[],
        hiddenSections: hiddenSections as StorefrontSection[],
        products,
        socialLinks,
        publicEmail,
      },
    },
  };
}

export function safeImageCrop(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
