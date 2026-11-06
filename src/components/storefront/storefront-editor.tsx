"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, GripVertical, LoaderCircle, Plus, Share2, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  checkStorefrontUsernameAction,
  deleteStorefrontAction,
  publishStorefrontAction,
  saveStorefrontAction,
  unpublishStorefrontAction,
} from "@/app/dashboard/storefront/actions";
import { ImageCropUploader } from "@/components/storefront/image-crop-uploader";
import { PublicStorefront } from "@/components/storefront/public-storefront";
import { useDashboardUnsavedChanges } from "@/components/dashboard/dashboard-shell";
import {
  DEFAULT_STOREFRONT_CUSTOMIZATION,
  STOREFRONT_PRODUCT_CATEGORIES,
  STOREFRONT_SECTIONS,
  STOREFRONT_SOCIAL_PLATFORMS,
  type StorefrontCustomization,
  type StorefrontDisplay,
  type StorefrontDraftInput,
  type StorefrontImageKind,
  type StorefrontProductCard,
  type StorefrontSection,
  type StorefrontSocialLink,
  type StorefrontTheme,
} from "@/lib/storefront/types";
import { parseStorefrontDraft } from "@/lib/storefront/validation";
import { storefrontUsernameFromName } from "@/lib/storefront/types";

const steps = [
  "Store identity",
  "Store branding",
  "About",
  "Product showcase",
  "Social links",
  "Contact",
  "Preview & publish",
];

type DialogAction = "publish" | "unpublish" | "delete" | null;
type DevicePreview = "desktop" | "mobile";

function draftFromStorefront(storefront: StorefrontDisplay | null): StorefrontDraftInput {
  if (!storefront) {
    return {
      storeName: "",
      username: "",
      description: "",
      profileImagePath: null,
      bannerImagePath: null,
      theme: "minimal",
      customization: DEFAULT_STOREFRONT_CUSTOMIZATION,
    };
  }
  return {
    storeName: storefront.store_name,
    username: storefront.username,
    description: storefront.description,
    profileImagePath: storefront.profile_image_path,
    bannerImagePath: storefront.banner_image_path,
    theme: storefront.theme,
    customization: storefront.customization,
  };
}

function isCompleteProduct(product: StorefrontProductCard) {
  return Boolean(product.title.trim() && product.category.trim() && product.coverImagePath);
}

function inputForSnapshot(draft: StorefrontDraftInput): StorefrontDraftInput {
  return {
    ...draft,
    customization: {
      ...draft.customization,
      products: draft.customization.products.map(({ id, title, description, category, coverImagePath }) => ({
        id,
        title,
        description,
        category,
        coverImagePath,
      })),
    },
  };
}

function inputForSave(draft: StorefrontDraftInput): StorefrontDraftInput {
  const snapshot = inputForSnapshot(draft);
  return {
    ...snapshot,
    customization: {
      ...snapshot.customization,
      products: snapshot.customization.products.filter(isCompleteProduct),
    },
  };
}

function isIdentityDifferent(draft: StorefrontDraftInput, snapshot: string) {
  if (!snapshot) return true;
  try {
    const saved = JSON.parse(snapshot) as StorefrontDraftInput;
    return draft.storeName !== saved.storeName || draft.username !== saved.username;
  } catch {
    return true;
  }
}

function optionalCompletion(draft: StorefrontDraftInput) {
  return [
    Boolean(draft.description.trim()),
    Boolean(draft.bannerImagePath),
    draft.customization.products.some(isCompleteProduct),
    draft.customization.socialLinks.length > 0,
    Boolean(draft.customization.publicEmail.trim()),
  ].filter(Boolean).length;
}

export function StorefrontEditor({ initialStorefront }: { initialStorefront: StorefrontDisplay | null }) {
  const [draft, setDraft] = useState(() => draftFromStorefront(initialStorefront));
  const draftRef = useRef(draft);
  const initialSnapshot = JSON.stringify(inputForSave(draft));
  const savedSnapshotRef = useRef(initialStorefront ? initialSnapshot : "");
  const [savedSnapshot, setSavedSnapshot] = useState(initialStorefront ? initialSnapshot : "");
  const [storefrontId, setStorefrontId] = useState(initialStorefront?.id ?? null);
  const [status, setStatus] = useState<StorefrontDisplay["status"]>(initialStorefront?.status ?? "draft");
  const [deleteAfter, setDeleteAfter] = useState(initialStorefront?.delete_after ?? null);
  const [profileUrl, setProfileUrl] = useState(initialStorefront?.profileImageUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState(initialStorefront?.bannerImageUrl ?? null);
  const [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<DevicePreview>("desktop");
  const [dialogAction, setDialogAction] = useState<DialogAction>(null);
  const [copied, setCopied] = useState(false);
  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(
    Boolean(initialStorefront && initialStorefront.username !== storefrontUsernameFromName(initialStorefront.store_name)),
  );
  const setHasUnsavedChanges = useDashboardUnsavedChanges("storefront-editor");
  const serializedDraft = useMemo(() => JSON.stringify(inputForSnapshot(draft)), [draft]);
  const isDirty = serializedDraft !== savedSnapshot;
  const locked = status === "deletion_pending";
  const completion = optionalCompletion(draft);
  const publicUrl = `https://cloverloop.in/${draft.username || "your-store"}`;

  const previewStore = useMemo(() => ({
    store_name: draft.storeName || "Your store name",
    username: draft.username || "your-store",
    description: draft.description,
    profileImageUrl: profileUrl,
    bannerImageUrl: bannerUrl,
    theme: draft.theme,
    customization: {
      ...draft.customization,
      products: draft.customization.products.map((product) => ({
        ...product,
        coverImageUrl: product.coverImageUrl ?? null,
      })),
    },
  }), [draft, profileUrl, bannerUrl]);

  const changeDraft = useCallback((update: (current: StorefrontDraftInput) => StorefrontDraftInput) => {
    setDraft((current) => {
      const next = update(current);
      draftRef.current = next;
      return next;
    });
  }, []);

  const saveDraft = useCallback(async (showFeedback: boolean): Promise<boolean> => {
    const input = inputForSave(draftRef.current);
    const validation = parseStorefrontDraft(input);
    if (!validation.ok) {
      if (showFeedback) setError(validation.message);
      return false;
    }
    setError("");
    try {
      const result = await saveStorefrontAction(input);
      if (!result.ok) {
        setError(result.message);
        return false;
      }
      if (result.storefrontId) setStorefrontId(result.storefrontId);
      const savedSnapshot = JSON.stringify(input);
      savedSnapshotRef.current = savedSnapshot;
      setSavedSnapshot(savedSnapshot);
      if (showFeedback) {
        setFeedback(
          input.customization.products.length < draftRef.current.customization.products.length
            ? "Your store identity is saved. Finish each sample card and upload its cover image to save it."
            : result.message,
        );
      }
      return true;
    } catch (saveError) {
      console.error("Could not save the storefront.", saveError);
      setError("Your storefront could not be saved. Check your connection and try again.");
      return false;
    }
  }, []);

  useEffect(() => {
    setHasUnsavedChanges(isDirty);
    return () => setHasUnsavedChanges(false);
  }, [isDirty, setHasUnsavedChanges]);

  useEffect(() => {
    if (!storefrontId || locked || !isDirty || isIdentityDifferent(draft, savedSnapshotRef.current)) return;
    const input = inputForSave(draft);
    if (JSON.stringify(input) === savedSnapshotRef.current || !parseStorefrontDraft(input).ok) return;
    const timer = window.setTimeout(() => {
      void saveDraft(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [draft, isDirty, locked, saveDraft, storefrontId]);

  function updateCustomization<K extends keyof StorefrontCustomization>(
    key: K,
    value: StorefrontCustomization[K],
  ) {
    changeDraft((current) => ({
      ...current,
      customization: { ...current.customization, [key]: value },
    }));
    setFeedback("");
    setError("");
  }

  async function continueFromIdentity() {
    setFeedback("");
    setError("");
    if (!draftRef.current.storeName.trim()) {
      setError("Enter a store name to continue.");
      return;
    }
    if (!draftRef.current.username.trim()) {
      setError("Add at least one letter, number, hyphen or underscore to your username.");
      return;
    }
    setBusy(true);
    try {
      const availability = await checkStorefrontUsernameAction(draftRef.current.username);
      if (!availability.ok) {
        setError(availability.message);
        return;
      }
      const saved = await saveDraft(true);
      if (saved) setStep(1);
    } catch (checkError) {
      console.error("Could not continue storefront identity setup.", checkError);
      setError("Username availability could not be checked. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveExplicitly() {
    setBusy(true);
    setFeedback("");
    await saveDraft(true);
    setBusy(false);
  }

  async function handleConfirmedAction() {
    if (!dialogAction) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      if (dialogAction === "publish") {
        const saved = await saveDraft(false);
        if (!saved) return;
        const result = await publishStorefrontAction();
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setStatus("published");
        setFeedback(result.url ? `Your storefront is live at ${result.url}` : result.message);
      } else if (dialogAction === "unpublish") {
        const result = await unpublishStorefrontAction();
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setStatus("unpublished");
        setFeedback(result.message);
      } else {
        const result = await deleteStorefrontAction();
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setStatus("deletion_pending");
        setDeleteAfter(
          result.deleteAfter ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        );
        setFeedback(result.message);
      }
      setDialogAction(null);
    } catch (actionError) {
      console.error("Could not complete the storefront action.", actionError);
      setError("The storefront action could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyStorefrontUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setFeedback("Storefront URL copied.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      console.error("Could not copy the storefront URL.", copyError);
      setError("The URL could not be copied. Select and copy it manually.");
    }
  }

  async function shareStorefront() {
    if (!navigator.share) {
      await copyStorefrontUrl();
      return;
    }

    try {
      await navigator.share({
        title: `${draft.storeName} | CloverLoop`,
        text: `Visit ${draft.storeName} on CloverLoop.`,
        url: publicUrl,
      });
      setFeedback("Storefront shared.");
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      console.error("Could not share the storefront URL.", shareError);
      setError("The storefront could not be shared. Copy the URL to share it manually.");
    }
  }

  function setImage(kind: StorefrontImageKind, path: string, url: string) {
    if (kind === "profile") {
      changeDraft((current) => ({ ...current, profileImagePath: path }));
      setProfileUrl(url);
    } else if (kind === "banner") {
      changeDraft((current) => ({ ...current, bannerImagePath: path }));
      setBannerUrl(url);
    }
  }

  function addProduct() {
    if (draft.customization.products.length >= 3) return;
    const product: StorefrontProductCard = {
      id: crypto.randomUUID(),
      title: "",
      description: "",
      category: STOREFRONT_PRODUCT_CATEGORIES[0],
      coverImagePath: "",
    };
    updateCustomization("products", [...draft.customization.products, product]);
  }

  function updateProduct(id: string, key: keyof StorefrontProductCard, value: string) {
    updateCustomization(
      "products",
      draft.customization.products.map((product) =>
        product.id === id ? { ...product, [key]: value } : product,
      ),
    );
  }

  function removeProduct(id: string) {
    updateCustomization("products", draft.customization.products.filter((product) => product.id !== id));
  }

  function addSocialLink() {
    if (draft.customization.socialLinks.length >= 10) return;
    const platform = STOREFRONT_SOCIAL_PLATFORMS[0];
    const link: StorefrontSocialLink = {
      id: crypto.randomUUID(),
      platform,
      label: platform,
      url: "",
    };
    updateCustomization("socialLinks", [...draft.customization.socialLinks, link]);
  }

  function updateSocialLink(id: string, key: keyof StorefrontSocialLink, value: string) {
    updateCustomization(
      "socialLinks",
      draft.customization.socialLinks.map((link) => {
        if (link.id !== id) return link;
        if (key === "platform" && value !== "Other") return { ...link, platform: value, label: value };
        return { ...link, [key]: value };
      }),
    );
  }

  function moveSection(section: StorefrontSection, direction: -1 | 1) {
    const order = [...draft.customization.sectionOrder];
    const index = order.indexOf(section);
    const destination = index + direction;
    if (destination < 0 || destination >= order.length) return;
    [order[index], order[destination]] = [order[destination], order[index]];
    updateCustomization("sectionOrder", order);
  }

  function reorderSections(dragged: StorefrontSection, dropped: StorefrontSection) {
    if (dragged === dropped) return;
    const order = [...draft.customization.sectionOrder];
    const from = order.indexOf(dragged);
    const to = order.indexOf(dropped);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, ...order.splice(from, 1));
    updateCustomization("sectionOrder", order);
  }

  const optionalLabel = `${completion} of 5 optional fields complete`;
  const isPublished = status === "published";

  return (
    <div className="storefront-management">
      <header className="dashboard-page-heading storefront-management-heading">
        <div>
          <span className="eyebrow">Creator storefront</span>
          <h1>Storefront</h1>
          <p>Set up one shareable page for your creator identity and upcoming work.</p>
        </div>
        {storefrontId && status !== "deletion_pending" ? (
          <button type="button" className="button button-secondary" onClick={() => setPreviewOpen(true)}>
            Preview
          </button>
        ) : null}
      </header>

      <section className="dashboard-card storefront-status-card" aria-label="Storefront status">
        <div>
          <span className="dashboard-card-label">Status</span>
          <strong className={`storefront-status storefront-status-${status}`}>
            {status === "published" ? "Published" :
              status === "unpublished" ? "Unpublished" :
                status === "deletion_pending" ? "Deletion scheduled" : storefrontId ? "Draft" : "Not set up"}
          </strong>
          {storefrontId ? (
            <div className="storefront-current-url-row">
              <p className="storefront-current-url">{publicUrl}</p>
              {isPublished ? (
                <button type="button" className="dashboard-small-button" onClick={() => void shareStorefront()}>
                  <Share2 size={16} aria-hidden="true" /> Share
                </button>
              ) : null}
            </div>
          ) : (
            <p>Choose your store name and URL to begin.</p>
          )}
          {status === "deletion_pending" && deleteAfter ? (
            <p className="storefront-delete-note">
              This storefront cannot be restored and will be permanently deleted after{" "}
              {new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date(deleteAfter))}.
            </p>
          ) : null}
        </div>
        {storefrontId && status !== "deletion_pending" ? (
          <div className="storefront-status-actions">
            <button type="button" className="dashboard-small-button" onClick={() => void copyStorefrontUrl()}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? "Copied" : "Copy URL"}
            </button>
            {isPublished ? (
              <>
                <a className="dashboard-small-button" href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} aria-hidden="true" /> Open storefront
                </a>
                <button type="button" className="dashboard-small-button" onClick={() => setDialogAction("unpublish")}>
                  Unpublish
                </button>
              </>
            ) : null}
            <button type="button" className="dashboard-small-button storefront-delete-link" onClick={() => setDialogAction("delete")}>
              <Trash2 size={15} aria-hidden="true" /> Delete storefront
            </button>
          </div>
        ) : null}
      </section>

      {status === "deletion_pending" ? (
        <p className="dashboard-message dashboard-message-warning" role="status">
          Your storefront is unavailable while deletion is pending. Restoration is not available.
        </p>
      ) : (
        <>
          <section className="storefront-wizard-card dashboard-card">
            <div className="storefront-wizard-top">
              <div>
                <span className="dashboard-card-label">Setup progress</span>
                <h2>{steps[step]}</h2>
              </div>
              <span className="storefront-optional-progress">{optionalLabel}</span>
            </div>
            <div className="storefront-progress-track" role="progressbar" aria-label="Storefront setup progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}>
              <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
            </div>
            <nav className="storefront-step-nav" aria-label="Storefront setup steps">
              {steps.map((label, index) => (
                <button
                  type="button"
                  key={label}
                  className={index === step ? "active" : ""}
                  aria-current={index === step ? "step" : undefined}
                  onClick={() => setStep(index)}
                >
                  <span>{index + 1}</span>{label}
                </button>
              ))}
            </nav>
            <label className="storefront-mobile-step-picker">
              <span>Go to step</span>
              <select value={step} onChange={(event) => setStep(Number(event.target.value))}>
                {steps.map((label, index) => (
                  <option key={label} value={index}>{index + 1}. {label}</option>
                ))}
              </select>
            </label>

            <div className="storefront-step-content">
              {step === 0 ? (
                <section className="storefront-step-fields" aria-labelledby="storefront-identity-title">
                  <div className="storefront-step-intro">
                    <h3 id="storefront-identity-title">Choose your store identity</h3>
                    <p>Your store name is shown to visitors. We create a URL from that name, which you can edit.</p>
                  </div>
                  <label className="dashboard-field">
                    <span>Store name <em>Required</em></span>
                    <input
                      value={draft.storeName}
                      maxLength={80}
                      autoComplete="organization"
                      disabled={locked}
                      onChange={(event) => {
                        const storeName = event.target.value;
                        changeDraft((current) => ({
                          ...current,
                          storeName,
                          username: usernameManuallyEdited ? current.username : storefrontUsernameFromName(storeName),
                        }));
                        setError("");
                        setFeedback("");
                      }}
                    />
                  </label>
                  <label className="dashboard-field">
                    <span>Store username <em>Required</em></span>
                    <div className="storefront-url-field">
                      <span>cloverloop.in/</span>
                      <input
                        value={draft.username}
                        maxLength={30}
                        autoComplete="off"
                        disabled={locked}
                        onChange={(event) => {
                          setUsernameManuallyEdited(true);
                          changeDraft((current) => ({ ...current, username: event.target.value.toLowerCase() }));
                          setError("");
                          setFeedback("");
                        }}
                        aria-describedby="storefront-username-help"
                      />
                    </div>
                    <small id="storefront-username-help">1–30 letters, numbers, hyphens or underscores. Availability is checked when you continue.</small>
                  </label>
                  <p className="storefront-identity-note">Your display name stays exactly as entered. A changed username permanently redirects old storefront links.</p>
                </section>
              ) : null}

              {step === 1 ? (
                <section className="storefront-step-fields" aria-labelledby="storefront-branding-title">
                  <div className="storefront-step-intro">
                    <h3 id="storefront-branding-title">Make the storefront yours</h3>
                    <p>Your profile image is required to publish. The banner and theme are optional.</p>
                  </div>
                  <div className="storefront-image-settings">
                    <div>
                      <span className="storefront-field-title">Profile image <em>Required</em></span>
                      <ImageCropUploader
                        kind="profile"
                        storefrontId={storefrontId}
                        imageUrl={profileUrl}
                        onUploaded={(path, url) => setImage("profile", path, url)}
                      />
                    </div>
                    <div>
                      <span className="storefront-field-title">Banner image <em>Optional</em></span>
                      <ImageCropUploader
                        kind="banner"
                        storefrontId={storefrontId}
                        imageUrl={bannerUrl}
                        onUploaded={(path, url) => setImage("banner", path, url)}
                        onRemove={() => {
                          changeDraft((current) => ({ ...current, bannerImagePath: null }));
                          setBannerUrl(null);
                        }}
                      />
                    </div>
                  </div>
                  <fieldset className="storefront-theme-picker" disabled={locked}>
                    <legend>Storefront theme</legend>
                    <div className="storefront-theme-options">
                      {([
                        ["minimal", "Minimal", "Open space, quiet borders and a centered profile."],
                        ["editorial", "Editorial", "A structured, text-led layout with strong typographic hierarchy."],
                        ["bold", "Bold", "A high-contrast creator header and expressive card grid."],
                      ] as [StorefrontTheme, string, string][]).map(([theme, title, description]) => (
                        <label className={draft.theme === theme ? "selected" : ""} key={theme}>
                          <input
                            type="radio"
                            name="storefront-theme"
                            value={theme}
                            checked={draft.theme === theme}
                            onChange={() => changeDraft((current) => ({ ...current, theme }))}
                          />
                          <span className={`storefront-theme-swatch storefront-theme-swatch-${theme}`} aria-hidden="true" />
                          <strong>{title}</strong>
                          <small>{description}</small>
                        </label>
                      ))}
                    </div>
                    <p className="storefront-inline-note">Changes appear in Preview before you publish them.</p>
                  </fieldset>
                  <fieldset className="storefront-color-settings" disabled={locked}>
                    <legend>Store colours</legend>
                    <label>
                      Primary colour
                      <input type="color" value={draft.customization.primaryColor} onChange={(event) => updateCustomization("primaryColor", event.target.value)} />
                    </label>
                    <label>
                      Accent colour
                      <input type="color" value={draft.customization.accentColor} onChange={(event) => updateCustomization("accentColor", event.target.value)} />
                    </label>
                    <label>
                      Background colour
                      <input type="color" value={draft.customization.backgroundColor} onChange={(event) => updateCustomization("backgroundColor", event.target.value)} />
                    </label>
                  </fieldset>
                </section>
              ) : null}

              {step === 2 ? (
                <section className="storefront-step-fields" aria-labelledby="storefront-about-form-title">
                  <div className="storefront-step-intro">
                    <h3 id="storefront-about-form-title">Tell visitors about your work</h3>
                    <p>This description is optional and appears in your storefront and search preview.</p>
                  </div>
                  <label className="dashboard-field">
                    <span>Store description <em>Optional</em></span>
                    <textarea
                      rows={7}
                      maxLength={1200}
                      value={draft.description}
                      disabled={locked}
                      onChange={(event) => changeDraft((current) => ({ ...current, description: event.target.value }))}
                      aria-describedby="storefront-description-count"
                    />
                    <small id="storefront-description-count">{draft.description.length}/1,200 characters</small>
                  </label>
                </section>
              ) : null}

              {step === 3 ? (
                <section className="storefront-step-fields" aria-labelledby="storefront-products-form-title">
                  <div className="storefront-step-intro storefront-step-intro-row">
                    <div>
                      <h3 id="storefront-products-form-title">Add sample product cards</h3>
                      <p>These are visual previews only. They are not clickable and cannot be purchased.</p>
                    </div>
                    <button type="button" className="dashboard-small-button" onClick={addProduct} disabled={locked || draft.customization.products.length >= 3}>
                      <Plus size={16} aria-hidden="true" /> Add sample card
                    </button>
                  </div>
                  {draft.customization.products.length ? (
                    <div className="storefront-product-editor-list">
                      {draft.customization.products.map((product, index) => (
                        <article className="storefront-product-editor" key={product.id}>
                          <div className="storefront-product-editor-heading">
                            <strong>Sample card {index + 1}</strong>
                            <button type="button" className="dashboard-icon-button" onClick={() => removeProduct(product.id)} aria-label={`Remove sample card ${index + 1}`} disabled={locked}>
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                          <div className="storefront-product-editor-grid">
                            <div>
                              <span className="storefront-field-title">Cover image <em>Required</em></span>
                              <ImageCropUploader
                                kind="product"
                                storefrontId={storefrontId}
                                imageUrl={product.coverImageUrl ?? null}
                                onUploaded={(path, url) => {
                                  changeDraft((current) => ({
                                    ...current,
                                    customization: {
                                      ...current.customization,
                                      products: current.customization.products.map((item) =>
                                        item.id === product.id ? { ...item, coverImagePath: path, coverImageUrl: url } : item,
                                      ),
                                    },
                                  }));
                                }}
                              />
                            </div>
                            <div className="storefront-product-fields">
                              <label className="dashboard-field">
                                <span>Product title <em>Required</em></span>
                                <input maxLength={80} value={product.title} disabled={locked} onChange={(event) => updateProduct(product.id, "title", event.target.value)} />
                              </label>
                              <label className="dashboard-field">
                                <span>Short description <em>Optional</em></span>
                                <textarea rows={3} maxLength={240} value={product.description} disabled={locked} onChange={(event) => updateProduct(product.id, "description", event.target.value)} />
                              </label>
                              <label className="dashboard-field">
                                <span>Category <em>Required</em></span>
                                <select
                                  value={STOREFRONT_PRODUCT_CATEGORIES.includes(product.category as (typeof STOREFRONT_PRODUCT_CATEGORIES)[number]) ? product.category : "__custom"}
                                  disabled={locked}
                                  onChange={(event) => updateProduct(product.id, "category", event.target.value === "__custom" ? "" : event.target.value)}
                                >
                                  {STOREFRONT_PRODUCT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                                  <option value="__custom">Custom category…</option>
                                </select>
                                {!STOREFRONT_PRODUCT_CATEGORIES.includes(product.category as (typeof STOREFRONT_PRODUCT_CATEGORIES)[number]) ? (
                                  <input
                                    className="storefront-custom-category"
                                    maxLength={50}
                                    placeholder="Enter a category"
                                    value={product.category}
                                    disabled={locked}
                                    onChange={(event) => updateProduct(product.id, "category", event.target.value)}
                                  />
                                ) : null}
                              </label>
                            </div>
                          </div>
                          <p className="storefront-coming-soon-help">A “Coming Soon” label is shown automatically.</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="storefront-empty-editor">
                      <p>No sample cards added. Your published page will show a helpful empty state.</p>
                    </div>
                  )}
                  <label className="dashboard-field storefront-layout-control">
                    <span>Product card layout</span>
                    <select value={draft.customization.productLayout} disabled={locked} onChange={(event) => updateCustomization("productLayout", event.target.value as StorefrontCustomization["productLayout"])}>
                      <option value="grid">Grid</option>
                      <option value="list">List</option>
                    </select>
                  </label>
                </section>
              ) : null}

              {step === 4 ? (
                <section className="storefront-step-fields" aria-labelledby="storefront-social-form-title">
                  <div className="storefront-step-intro storefront-step-intro-row">
                    <div>
                      <h3 id="storefront-social-form-title">Link your social channels</h3>
                      <p>Add up to ten links. External links open in a new tab.</p>
                    </div>
                    <button type="button" className="dashboard-small-button" onClick={addSocialLink} disabled={locked || draft.customization.socialLinks.length >= 10}>
                      <Plus size={16} aria-hidden="true" /> Add social link
                    </button>
                  </div>
                  {draft.customization.socialLinks.length ? (
                    <div className="storefront-social-editor-list">
                      {draft.customization.socialLinks.map((link, index) => (
                        <div className="storefront-social-editor-row" key={link.id}>
                          <label className="dashboard-field">
                            <span>Platform</span>
                            <select
                              value={link.platform}
                              disabled={locked}
                              onChange={(event) => updateSocialLink(link.id, "platform", event.target.value)}
                            >
                              {STOREFRONT_SOCIAL_PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}
                            </select>
                          </label>
                          {link.platform === "Other" ? (
                            <label className="dashboard-field">
                              <span>Platform name</span>
                              <input maxLength={40} value={link.label} disabled={locked} onChange={(event) => updateSocialLink(link.id, "label", event.target.value)} />
                            </label>
                          ) : null}
                          <label className="dashboard-field storefront-social-url-field">
                            <span>URL</span>
                            <input type="url" inputMode="url" placeholder="https://" value={link.url} disabled={locked} onChange={(event) => updateSocialLink(link.id, "url", event.target.value)} />
                          </label>
                          <button type="button" className="dashboard-icon-button" aria-label={`Remove social link ${index + 1}`} onClick={() => updateCustomization("socialLinks", draft.customization.socialLinks.filter((item) => item.id !== link.id))} disabled={locked}>
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="storefront-empty-editor"><p>No social links added yet. This step is optional.</p></div>
                  )}
                  <SectionManager
                    draft={draft}
                    locked={locked}
                    onVisibilityChange={(section, visible) => {
                      const hidden = new Set(draft.customization.hiddenSections);
                      if (visible) hidden.delete(section);
                      else hidden.add(section);
                      updateCustomization("hiddenSections", [...hidden]);
                    }}
                    onMove={moveSection}
                    onDrop={reorderSections}
                    onBannerStyleChange={(style) => updateCustomization("bannerStyle", style)}
                  />
                </section>
              ) : null}

              {step === 5 ? (
                <section className="storefront-step-fields" aria-labelledby="storefront-contact-form-title">
                  <div className="storefront-step-intro">
                    <h3 id="storefront-contact-form-title">Choose a public contact address</h3>
                    <p>This is separate from your CloverLoop login email. Visitors only see a Contact button that opens their email app.</p>
                  </div>
                  <label className="dashboard-field dashboard-field-narrow">
                    <span>Public business email <em>Optional</em></span>
                    <input
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      value={draft.customization.publicEmail}
                      disabled={locked}
                      onChange={(event) => updateCustomization("publicEmail", event.target.value)}
                      placeholder="hello@example.com"
                    />
                  </label>
                  <SectionManager
                    draft={draft}
                    locked={locked}
                    onVisibilityChange={(section, visible) => {
                      const hidden = new Set(draft.customization.hiddenSections);
                      if (visible) hidden.delete(section);
                      else hidden.add(section);
                      updateCustomization("hiddenSections", [...hidden]);
                    }}
                    onMove={moveSection}
                    onDrop={reorderSections}
                    onBannerStyleChange={(style) => updateCustomization("bannerStyle", style)}
                  />
                </section>
              ) : null}

              {step === 6 ? (
                <section className="storefront-step-fields storefront-final-preview" aria-labelledby="storefront-final-title">
                  <div className="storefront-step-intro">
                    <h3 id="storefront-final-title">Preview your storefront</h3>
                    <p>Check both screen sizes. Optional details can stay blank; a store name, username and profile image are required to publish.</p>
                  </div>
                  <div className="storefront-preview-controls" role="group" aria-label="Preview device">
                    <button type="button" className={previewDevice === "desktop" ? "selected" : ""} onClick={() => setPreviewDevice("desktop")}>Desktop</button>
                    <button type="button" className={previewDevice === "mobile" ? "selected" : ""} onClick={() => setPreviewDevice("mobile")}>Mobile</button>
                  </div>
                  <StorefrontPreviewFrame store={previewStore} device={previewDevice} />
                  <div className="storefront-publish-checklist">
                    <strong>Before publishing</strong>
                    <span className={draft.storeName.trim() ? "complete" : ""}><Check size={15} /> Store name</span>
                    <span className={draft.username.trim() ? "complete" : ""}><Check size={15} /> Store username</span>
                    <span className={draft.profileImagePath ? "complete" : ""}><Check size={15} /> Profile image</span>
                  </div>
                  <p className="storefront-final-note">Sample cards are marked Coming Soon, cannot be opened and do not accept payments.</p>
                </section>
              ) : null}
            </div>

            {error ? <p className="dashboard-message dashboard-message-error" role="alert">{error}</p> : null}
            {feedback ? <p className="dashboard-message dashboard-message-success" role="status">{feedback}</p> : null}
            <div className="storefront-wizard-actions">
              <span>{isDirty ? "Unsaved changes" : storefrontId ? "Changes save automatically" : "Save your store identity to begin"}</span>
              <div>
                {storefrontId ? (
                  <button type="button" className="button button-secondary" onClick={() => void saveExplicitly()} disabled={busy || !isDirty}>
                    {busy ? <LoaderCircle className="spin" size={16} /> : null} Save
                  </button>
                ) : null}
                {step > 0 ? <button type="button" className="button button-secondary" onClick={() => setStep((current) => current - 1)} disabled={busy}>Back</button> : null}
                {step < 6 ? (
                  <button type="button" className="button" onClick={() => step === 0 ? void continueFromIdentity() : setStep((current) => current + 1)} disabled={busy || (step === 0 && !draft.storeName.trim())}>
                    {busy && step === 0 ? <LoaderCircle className="spin" size={16} /> : null}
                    {step === 0 ? "Continue" : "Continue"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      if (!draft.storeName.trim() || !draft.username.trim() || !draft.profileImagePath) {
                        setError("Add a store name, username and profile image before publishing.");
                        return;
                      }
                      setDialogAction("publish");
                    }}
                    disabled={busy || !storefrontId}
                  >
                    {isPublished ? "Publish changes" : status === "unpublished" ? "Republish storefront" : "Publish storefront"}
                  </button>
                )}
              </div>
            </div>
          </section>

          {storefrontId ? (
            <div className="storefront-management-footer">
              <Link href="/dashboard">Back to dashboard</Link>
              <span>Storefront changes do not send email notifications.</span>
            </div>
          ) : null}
        </>
      )}

      {previewOpen ? (
        <div className="storefront-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPreviewOpen(false);
        }}>
          <section className="storefront-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="storefront-preview-title">
            <div className="storefront-dialog-heading">
              <div><span className="dashboard-card-label">Live design preview</span><h2 id="storefront-preview-title">Preview storefront</h2></div>
              <button type="button" className="dashboard-icon-button" onClick={() => setPreviewOpen(false)} aria-label="Close preview">×</button>
            </div>
            <div className="storefront-preview-controls" role="group" aria-label="Preview device">
              <button type="button" className={previewDevice === "desktop" ? "selected" : ""} onClick={() => setPreviewDevice("desktop")}>Desktop</button>
              <button type="button" className={previewDevice === "mobile" ? "selected" : ""} onClick={() => setPreviewDevice("mobile")}>Mobile</button>
            </div>
            <StorefrontPreviewFrame store={previewStore} device={previewDevice} />
          </section>
        </div>
      ) : null}

      {dialogAction ? (
        <div className="storefront-dialog-backdrop">
          <section className="storefront-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="storefront-confirm-title">
            <div className="storefront-dialog-heading">
              <div>
                <span className="dashboard-card-label">Confirm action</span>
                <h2 id="storefront-confirm-title">
                  {dialogAction === "publish" ? "Publish your storefront?" :
                    dialogAction === "unpublish" ? "Unpublish your storefront?" : "Delete your storefront?"}
                </h2>
              </div>
            </div>
            <p>
              {dialogAction === "publish"
                ? "Your storefront will be public immediately at the URL below. You can unpublish it at any time."
                : dialogAction === "unpublish"
                  ? "Visitors will see a standard 404 at your storefront URL until you publish it again."
                  : "Your storefront will become unavailable now. Its username stays reserved for 30 days, then its data and images are permanently deleted. There is no restore option."}
            </p>
            {dialogAction === "publish" ? <code>{publicUrl}</code> : null}
            <div className="storefront-dialog-actions">
              <button type="button" className="button button-secondary" onClick={() => setDialogAction(null)} disabled={busy}>Cancel</button>
              <button type="button" className={dialogAction === "delete" ? "button storefront-danger-button" : "button"} onClick={() => void handleConfirmedAction()} disabled={busy}>
                {busy ? <LoaderCircle className="spin" size={16} /> : null}
                {dialogAction === "publish" ? "Confirm and publish" :
                dialogAction === "unpublish" ? "Unpublish storefront" : "Schedule deletion"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SectionManager({
  draft,
  locked,
  onVisibilityChange,
  onMove,
  onDrop,
  onBannerStyleChange,
}: {
  draft: StorefrontDraftInput;
  locked: boolean;
  onVisibilityChange: (section: StorefrontSection, visible: boolean) => void;
  onMove: (section: StorefrontSection, direction: -1 | 1) => void;
  onDrop: (dragged: StorefrontSection, dropped: StorefrontSection) => void;
  onBannerStyleChange: (style: StorefrontCustomization["bannerStyle"]) => void;
}) {
  const draggedSection = useRef<StorefrontSection | null>(null);
  return (
    <fieldset className="storefront-section-manager" disabled={locked}>
      <legend>Storefront sections</legend>
      <p>Drag sections to reorder them, or use the move buttons. Hidden sections stay in your settings.</p>
      <div className="storefront-section-list">
        {draft.customization.sectionOrder.map((section, index) => {
          const item = STOREFRONT_SECTIONS.find((candidate) => candidate.id === section);
          if (!item) return null;
          const visible = !draft.customization.hiddenSections.includes(section);
          return (
            <div
              className="storefront-section-row"
              key={section}
              draggable={!locked}
              onDragStart={() => { draggedSection.current = section; }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedSection.current) onDrop(draggedSection.current, section);
                draggedSection.current = null;
              }}
            >
              <span className="storefront-drag-handle" aria-hidden="true"><GripVertical size={17} /></span>
              <label>
                <input type="checkbox" checked={visible} onChange={(event) => onVisibilityChange(section, event.target.checked)} />
                <span>{item.label}</span>
              </label>
              <div>
                <button type="button" className="dashboard-icon-button" onClick={() => onMove(section, -1)} disabled={index === 0} aria-label={`Move ${item.label} up`}>
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button type="button" className="dashboard-icon-button" onClick={() => onMove(section, 1)} disabled={index === draft.customization.sectionOrder.length - 1} aria-label={`Move ${item.label} down`}>
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <label className="dashboard-field storefront-banner-style">
        <span>Banner display style</span>
        <select value={draft.customization.bannerStyle} onChange={(event) => onBannerStyleChange(event.target.value as StorefrontCustomization["bannerStyle"])}>
          <option value="wide">Wide</option>
          <option value="compact">Compact</option>
        </select>
      </label>
    </fieldset>
  );
}

function StorefrontPreviewFrame({
  store,
  device,
}: {
  store: Parameters<typeof PublicStorefront>[0]["store"];
  device: DevicePreview;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewRoot, setPreviewRoot] = useState<HTMLElement | null>(null);
  const onFrameLoad = useCallback(() => {
    const frameDocument = iframeRef.current?.contentDocument;
    const root = frameDocument?.getElementById("storefront-preview-root");
    if (!frameDocument || !root) return;

    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((source) => {
      const stylesheet = frameDocument.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = source.href;
      stylesheet.media = source.media;
      frameDocument.head.append(stylesheet);
    });
    document.querySelectorAll("style").forEach((source) => {
      const style = frameDocument.createElement("style");
      style.media = source.media;
      style.textContent = source.textContent;
      frameDocument.head.append(style);
    });
    setPreviewRoot(root);
  }, []);

  return (
    <div className={`storefront-preview-frame storefront-preview-${device}`}>
      <iframe
        ref={iframeRef}
        title={`${device === "mobile" ? "Mobile" : "Desktop"} storefront preview`}
        width={device === "mobile" ? 390 : 1024}
        height={720}
        srcDoc={'<!doctype html><html><head></head><body style="margin:0"><div id="storefront-preview-root"></div></body></html>'}
        onLoad={onFrameLoad}
      />
      {previewRoot ? createPortal(<PublicStorefront store={store} />, previewRoot) : null}
    </div>
  );
}
