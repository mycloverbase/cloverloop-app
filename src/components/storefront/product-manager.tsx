"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  Check,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileImage,
  GraduationCap,
  LoaderCircle,
  Package,
  Plus,
  Power,
  Trash2,
  X,
} from "lucide-react";
import {
  createProductDraftAction,
  deleteProductAction,
  prepareProductFileUploadAction,
  saveProductAction,
} from "@/app/dashboard/products/actions";
import { ImageCropUploader } from "@/components/storefront/image-crop-uploader";
import { StorefrontProductCard } from "@/components/storefront/public-storefront";
import type { CreatorPlanKey } from "@/lib/account/types";
import {
  PRODUCT_FILE_ACCEPT,
  validateProductFileMetadata,
} from "@/lib/storefront/product-files";
import { uploadProductFile } from "@/lib/storefront/product-upload";
import type { CreatorStorefrontProduct } from "@/lib/storefront/types";

type ProductForm = {
  id: string | null;
  name: string;
  description: string;
  category: string;
  coverImagePath: string | null;
  coverImageUrl: string | null;
  isFree: boolean;
  productType: ProductTypeOption;
  price: string;
  isActive: boolean;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  file: File | null;
  firstListedAt: string | null;
  countedAsFree: boolean;
  countedAsPaid: boolean;
  createdAt: string | null;
};

type ProductTypeOption = "digital" | "course" | "subscription" | "session";
type ProductField = "name" | "description" | "price" | "file";

const productCategories = [
  "Education & Learning",
  "Music",
  "Business & Finance",
  "Design & Creativity",
  "Marketing",
  "Technology",
  "Productivity",
  "Lifestyle",
  "Health & Fitness",
  "Other",
];

const productTypes: {
  id: ProductTypeOption;
  name: string;
  description: string;
  icon: typeof Package;
  available: boolean;
}[] = [
  { id: "digital", name: "Digital Product", description: "Sell downloadable files such as PDFs, eBooks, music, templates, images and documents.", icon: Package, available: true },
  { id: "course", name: "Course", description: "Sell structured educational content and learning materials.", icon: GraduationCap, available: false },
  { id: "subscription", name: "Subscription", description: "Offer recurring access to exclusive content or resources.", icon: BookOpen, available: false },
  { id: "session", name: "Book 1:1 Session", description: "Allow customers to book consultations, coaching sessions or appointments.", icon: CalendarClock, available: false },
];

type ProductManagerProps = {
  storefrontId: string | null;
  storefrontUsername: string | null;
  storefrontStatus: string | null;
  initialProducts: CreatorStorefrontProduct[];
  plan: CreatorPlanKey;
  initialFreeListingCount: number;
  initialPaidListingCount: number;
};

function blankForm(): ProductForm {
  return {
    id: null,
    name: "",
    description: "",
    category: "",
    coverImagePath: null,
    coverImageUrl: null,
    isFree: false,
    productType: "digital",
    price: "",
    isActive: false,
    fileName: null,
    fileSize: null,
    fileMimeType: null,
    file: null,
    firstListedAt: null,
    countedAsFree: false,
    countedAsPaid: false,
    createdAt: null,
  };
}

function formFromProduct(product: CreatorStorefrontProduct): ProductForm {
  return {
    ...blankForm(),
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category ?? "",
    coverImagePath: product.coverImagePath,
    coverImageUrl: product.coverImageUrl,
    isFree: product.isFree,
    productType: "digital",
    price: product.isFree ? "" : (product.pricePaise / 100).toFixed(2),
    isActive: product.isActive,
    fileName: product.fileName,
    fileSize: product.fileSize,
    fileMimeType: product.fileMimeType,
    firstListedAt: product.firstListedAt,
    countedAsFree: product.countedAsFree,
    countedAsPaid: product.countedAsPaid,
    createdAt: product.createdAt,
  };
}

function parsePrice(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const price = Number(value);
  const pricePaise = Math.round(price * 100);
  return Number.isSafeInteger(pricePaise) && pricePaise > 0 ? pricePaise : null;
}

function rupeePrice(pricePaise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(pricePaise / 100);
}

function formatFileSize(size: number | null) {
  if (size === null) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProductManager({
  storefrontId,
  storefrontUsername,
  storefrontStatus,
  initialProducts,
  plan,
  initialFreeListingCount,
  initialPaidListingCount,
}: ProductManagerProps) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [freeListingCount, setFreeListingCount] = useState(initialFreeListingCount);
  const [paidListingCount, setPaidListingCount] = useState(initialPaidListingCount);
  const [form, setForm] = useState<ProductForm | null>(null);
  const [preview, setPreview] = useState<CreatorStorefrontProduct | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProductField, string>>>({});
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const productFormRef = useRef<HTMLFormElement>(null);
  const shouldScrollToNewForm = useRef(false);

  const limitedPlan = plan === "free";
  const canCreateLeadMagnet = !limitedPlan || freeListingCount < 5;
  const canCreatePaidProduct = !limitedPlan || paidListingCount < 1;
  const percentage = (count: number, limit: number) => Math.min(100, Math.round((count / limit) * 100));

  useEffect(() => {
    if (!form || !shouldScrollToNewForm.current) return;
    shouldScrollToNewForm.current = false;
    window.requestAnimationFrame(() => {
      const heading = productFormRef.current?.querySelector<HTMLElement>(".product-editor-heading");
      if (!heading) return;
      const stickyHeader = document.querySelector<HTMLElement>(".dashboard-topbar");
      const topOffset = Math.max(stickyHeader?.getBoundingClientRect().bottom ?? 0, 0) + 12;
      const scrollDistance = heading.getBoundingClientRect().top - topOffset;
      if (scrollDistance > 0) window.scrollBy({ top: scrollDistance, behavior: "smooth" });
    });
  }, [form]);

  function startCreate() {
    setError("");
    setFormError("");
    setFieldErrors({});
    setFeedback("");
    shouldScrollToNewForm.current = true;
    setForm(blankForm());
  }

  function startEdit(product: CreatorStorefrontProduct) {
    setError("");
    setFormError("");
    setFieldErrors({});
    setFeedback("");
    setForm(formFromProduct(product));
  }

  function closeForm() {
    setForm(null);
    setError("");
    setFormError("");
    setFieldErrors({});
    setUploadProgress(null);
  }

  function patchForm(update: Partial<ProductForm>) {
    setForm((current) => current ? { ...current, ...update } : current);
    setFormError("");
    setFieldErrors((current) => {
      const next = { ...current };
      if ("name" in update) delete next.name;
      if ("description" in update) delete next.description;
      if ("price" in update || "isFree" in update) delete next.price;
      if ("file" in update) delete next.file;
      return next;
    });
  }

  function rejectForm(message: string, field?: ProductField) {
    setFormError(message);
    if (field) {
      setFieldErrors((current) => ({ ...current, [field]: message }));
      window.requestAnimationFrame(() => {
        const element = document.querySelector<HTMLElement>(`[data-product-field="${field}"]`);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
        element?.focus({ preventScroll: true });
      });
    } else {
      setFieldErrors({});
      window.requestAnimationFrame(() => formErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  }

  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    if (!storefrontId) {
      rejectForm("Create and save your storefront before adding products.");
      return;
    }
    if (storefrontStatus === "deletion_pending") {
      rejectForm("This storefront is scheduled for deletion and cannot be changed.");
      return;
    }
    if (form.productType !== "digital") {
      rejectForm("This product type is not available yet. Choose Digital Product to create a downloadable listing.");
      return;
    }
    if (!form.name.trim() || form.name.trim().length > 100) {
      rejectForm("Product name is required. Enter a name of 100 characters or fewer before saving.", "name");
      return;
    }
    if (!form.description.trim() || form.description.trim().length > 5000) {
      rejectForm("Product description is required and must be 5,000 characters or fewer.", "description");
      return;
    }
    const pricePaise = form.isFree ? 0 : parsePrice(form.price);
    if (!form.isFree && pricePaise === null) {
      rejectForm("Enter a valid selling price in INR, greater than ₹0 with up to two decimal places.", "price");
      return;
    }
    if (
      limitedPlan &&
      ((form.isFree && !form.countedAsFree && freeListingCount >= 5) ||
        (!form.isFree && !form.countedAsPaid && paidListingCount >= 1))
    ) {
      rejectForm(form.isFree
        ? "You have reached the Lead Magnet listing limit on your current plan. Upgrade to Creator to add more listings."
        : "You have reached the Paid Product listing limit on your current plan. Upgrade to Creator to add more listings.");
      return;
    }
    if (!form.id && !form.file) {
      rejectForm("Please upload a product file before saving.", "file");
      return;
    }
    const fileMetadata = form.file
      ? validateProductFileMetadata(form.file.name, form.file.size, form.file.type)
      : null;
    if (fileMetadata && !fileMetadata.ok) {
      rejectForm(fileMetadata.message, "file");
      return;
    }

    setBusy(true);
    setError("");
    setFormError("");
    setFieldErrors({});
    setFeedback("");
    try {
      const input = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category.trim() || null,
        isFree: form.isFree,
        pricePaise: pricePaise ?? 0,
        coverImagePath: form.coverImagePath,
        isActive: form.isActive,
      };
      let productId = form.id;
      if (!productId) {
        const draft = await createProductDraftAction(storefrontId, input);
        if (!draft.ok || !draft.productId) {
          rejectForm(draft.ok ? "The product draft could not be created. Please try again." : draft.message);
          return;
        }
        productId = draft.productId;
        patchForm({ id: productId });
      }

      if (form.file && fileMetadata?.ok) {
        const uploadSlot = await prepareProductFileUploadAction(
          productId,
          fileMetadata.value.fileName,
          fileMetadata.value.size,
          fileMetadata.value.mimeType,
        );
        if (!uploadSlot.ok || !uploadSlot.uploadPath) {
          rejectForm(uploadSlot.ok ? "A secure upload could not be started. Please try again." : uploadSlot.message);
          return;
        }
        setUploadProgress(0);
        await uploadProductFile(form.file, uploadSlot.uploadPath, fileMetadata.value, setUploadProgress);
      }

      const result = await saveProductAction(productId, input);
      if (!result.ok) {
        rejectForm(result.message);
        return;
      }
      const now = new Date().toISOString();
      const saved: CreatorStorefrontProduct = {
        id: productId,
        storefrontId,
        name: input.name,
        description: input.description,
        category: input.category,
        productType: "digital",
        isFree: input.isFree,
        pricePaise: input.pricePaise,
        coverImagePath: form.coverImagePath,
        coverImageUrl: form.coverImageUrl,
        isActive: input.isActive,
        fileName: form.file ? fileMetadata?.ok ? fileMetadata.value.fileName : form.file.name : form.fileName,
        fileSize: form.file ? form.file.size : form.fileSize,
        fileMimeType: form.file ? fileMetadata?.ok ? fileMetadata.value.mimeType : form.file.type : form.fileMimeType,
        firstListedAt: form.firstListedAt ?? now,
        countedAsFree: form.countedAsFree || input.isFree,
        countedAsPaid: form.countedAsPaid || !input.isFree,
        createdAt: form.createdAt ?? now,
      };
      setProducts((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      if (!form.countedAsFree && saved.countedAsFree) setFreeListingCount((count) => count + 1);
      if (!form.countedAsPaid && saved.countedAsPaid) setPaidListingCount((count) => count + 1);
      setForm(null);
      setUploadProgress(null);
      setFeedback(result.message);
      router.refresh();
    } catch (saveError) {
      console.error("Could not save product in the dashboard.", saveError);
      rejectForm(saveError instanceof Error ? saveError.message : "The product could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(product: CreatorStorefrontProduct) {
    if (!product.fileName) {
      setError("Upload a product file before activating this product.");
      return;
    }
    setBusy(true);
    setError("");
    setFeedback("");
    const result = await saveProductAction(product.id, {
      name: product.name,
      description: product.description,
      category: product.category,
      isFree: product.isFree,
      pricePaise: product.pricePaise,
      coverImagePath: product.coverImagePath,
      isActive: !product.isActive,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setProducts((current) => current.map((item) =>
      item.id === product.id ? { ...item, isActive: !item.isActive } : item,
    ));
    setFeedback(result.message);
    router.refresh();
  }

  async function deleteProduct(product: CreatorStorefrontProduct) {
    if (!window.confirm(`Delete "${product.name}"? This removes it from your storefront.`)) return;
    setBusy(true);
    setError("");
    setFeedback("");
    const result = await deleteProductAction(product.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setProducts((current) => current.filter((item) => item.id !== product.id));
    setFeedback(result.message);
    router.refresh();
  }

  return (
    <div className="product-manager">
      <header className="product-manager-heading">
        <div>
          <span className="dashboard-eyebrow">Creator dashboard</span>
          <h1>Products</h1>
          <p>Manage digital products displayed on your public storefront.</p>
        </div>
        <div className="product-manager-heading-actions">
          {storefrontUsername && storefrontStatus === "published" ? (
            <Link className="dashboard-small-button" href={`/${storefrontUsername}`} target="_blank">
              View storefront
            </Link>
          ) : null}
          <button
            className="dashboard-small-button"
            type="button"
            onClick={startCreate}
            disabled={!storefrontId || storefrontStatus === "deletion_pending" || busy}
          >
            <Plus size={16} aria-hidden="true" /> Add product
          </button>
        </div>
      </header>

      <section className="product-usage-grid" aria-label="Product listing allowance">
        <article className="product-usage-card">
          <div className="product-usage-heading">
            <span className="product-usage-icon"><CreditCard size={17} aria-hidden="true" /></span>
            <div><strong>Paid products</strong><span>{limitedPlan ? `${paidListingCount}/1` : `${paidListingCount} listed`}</span></div>
          </div>
          {limitedPlan ? <div className="product-usage-track" role="progressbar" aria-label="Paid Product listing allowance" aria-valuemin={0} aria-valuemax={1} aria-valuenow={Math.min(paidListingCount, 1)}><span style={{ width: `${percentage(paidListingCount, 1)}%` }} /></div> : null}
          <p>{limitedPlan ? "One lifetime listing on your current plan." : "Unlimited listings on your current plan."}</p>
        </article>
        <article className="product-usage-card">
          <div className="product-usage-heading">
            <span className="product-usage-icon"><Download size={17} aria-hidden="true" /></span>
            <div><strong>Lead Magnets</strong><span>{limitedPlan ? `${freeListingCount}/5` : `${freeListingCount} listed`}</span></div>
          </div>
          {limitedPlan ? <div className="product-usage-track" role="progressbar" aria-label="Lead Magnet lifetime listing allowance" aria-valuemin={0} aria-valuemax={5} aria-valuenow={Math.min(freeListingCount, 5)}><span style={{ width: `${percentage(freeListingCount, 5)}%` }} /></div> : null}
          <p>{limitedPlan ? "Five listings per account lifetime, not a monthly quota." : "Unlimited listings on your current plan."}</p>
        </article>
        {limitedPlan && (!canCreateLeadMagnet || !canCreatePaidProduct) ? (
          <div className="product-usage-warning" role="status">
            <AlertCircle size={18} aria-hidden="true" />
            <span>You have reached a product listing limit on your current plan. Upgrade to add more listings.</span>
            <Link href="/dashboard#creator-upgrade">View upgrade options</Link>
          </div>
        ) : null}
      </section>
      {!storefrontId ? (
        <div className="product-manager-empty">
          <h2>Set up your storefront first</h2>
          <p>Products are shown on your creator storefront. Save your storefront details before adding listings.</p>
          <Link className="dashboard-small-button" href="/dashboard/storefront">Set up storefront</Link>
        </div>
      ) : null}
      {storefrontStatus === "deletion_pending" ? (
        <div className="product-manager-alert" role="status">This storefront is scheduled for deletion; product changes are disabled.</div>
      ) : null}
      {error ? (
        <div className="product-manager-alert error" role="alert">
          {error}
          {error.includes("Upgrade to Creator") ? (
            <p><Link href="/dashboard#creator-upgrade">Upgrade to Creator</Link></p>
          ) : null}
        </div>
      ) : null}
      {feedback ? <div className="product-manager-alert success" role="status">{feedback}</div> : null}

      {form ? (
        <form ref={productFormRef} className="product-editor-panel product-creation-form" onSubmit={saveForm} noValidate>
          <div className="product-editor-heading">
            <div>
              <span className="dashboard-eyebrow">{form.id ? "Edit listing" : "New listing"}</span>
              <h2>{form.id ? "Update product" : "Add a product"}</h2>
            </div>
            <button type="button" className="dashboard-icon-button" onClick={closeForm} disabled={busy} aria-label="Close product form">
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          <section className="product-form-section" aria-labelledby="product-information-title">
            <div className="product-form-section-heading">
              <span className="product-form-step">01</span>
              <div><h3 id="product-information-title">Product information</h3><p>Give your product a clear name and useful details.</p></div>
            </div>
            <div className="product-information-grid">
              <label className="dashboard-field">
                <span>Product name <em>Required</em></span>
                <input
                  maxLength={100}
                  value={form.name}
                  onChange={(event) => patchForm({ name: event.target.value })}
                  disabled={busy}
                  data-product-field="name"
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "product-name-error" : undefined}
                />
                {fieldErrors.name ? <small id="product-name-error" className="product-field-error">{fieldErrors.name}</small> : null}
              </label>
              <label className="dashboard-field">
                <span>Product description <em>Required</em></span>
                <textarea
                  maxLength={5000}
                  rows={4}
                  value={form.description}
                  onChange={(event) => patchForm({ description: event.target.value })}
                  disabled={busy}
                  data-product-field="description"
                  aria-invalid={Boolean(fieldErrors.description)}
                  aria-describedby={fieldErrors.description ? "product-description-error" : "product-description-count"}
                />
                <small id="product-description-count">{form.description.length}/5,000 characters</small>
                {fieldErrors.description ? <small id="product-description-error" className="product-field-error">{fieldErrors.description}</small> : null}
              </label>
              <label className="dashboard-field">
                <span>Category <em>Optional</em></span>
                <select
                  value={form.category}
                  onChange={(event) => patchForm({ category: event.target.value })}
                  disabled={busy}
                >
                  <option value="">Select a category</option>
                  {productCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="product-form-section" aria-labelledby="product-appearance-title">
            <div className="product-form-section-heading">
              <span className="product-form-step">02</span>
              <div><h3 id="product-appearance-title">Product appearance</h3><p>A cover image helps your product stand out.</p></div>
            </div>
            <div className="product-cover-upload-area">
              <ImageCropUploader
                kind="product"
                storefrontId={storefrontId}
                imageUrl={form.coverImageUrl}
                onUploaded={(path, url) => patchForm({ coverImagePath: path, coverImageUrl: url })}
                onRemove={() => patchForm({ coverImagePath: null, coverImageUrl: null })}
                onError={(message) => setFormError(message)}
              />
            </div>
          </section>

          <section className="product-form-section" aria-labelledby="product-type-title">
            <div className="product-form-section-heading">
              <span className="product-form-step">03</span>
              <div><h3 id="product-type-title">Product type</h3><p>Choose the format you want to offer.</p></div>
            </div>
            <div className="product-choice-grid product-type-grid" role="group" aria-label="Product type">
              {productTypes.map(({ id, name, description, icon: Icon, available }) => (
                <button
                  type="button"
                  key={id}
                  className={`product-choice-tile${form.productType === id ? " selected" : ""}${!available ? " unavailable" : ""}`}
                  aria-pressed={form.productType === id}
                  onClick={() => patchForm({ productType: id })}
                  disabled={busy}
                >
                  <span className="product-choice-icon"><Icon size={20} aria-hidden="true" /></span>
                  <strong>{name}</strong>
                  <small>{description}</small>
                  {!available ? <span className="product-coming-soon">Coming soon</span> : null}
                  {form.productType === id ? <Check className="product-choice-check" size={17} aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
            {form.productType !== "digital" ? (
              <p className="product-type-notice" role="status">
                Course, subscription, and booking delivery are not supported yet. You can explore these product types, but only Digital Product listings can be saved today.
              </p>
            ) : null}
          </section>

          {form.productType === "digital" ? (
            <section className="product-form-section product-content-section" aria-labelledby="product-content-title">
              <div className="product-form-section-heading">
                <span className="product-form-step">04</span>
                <div><h3 id="product-content-title">Product content</h3><p>Upload the file customers will receive.</p></div>
              </div>
              <div className="product-content-fields">
                <div className="product-file-field">
                  <label className="dashboard-field" htmlFor="product-file-upload">
                    <span>Product file <em>Required for new products</em></span>
                    <input
                      id="product-file-upload"
                      type="file"
                      accept={PRODUCT_FILE_ACCEPT}
                      onChange={(event) => patchForm({ file: event.target.files?.[0] ?? null })}
                      disabled={busy}
                      data-product-field="file"
                      aria-invalid={Boolean(fieldErrors.file)}
                      aria-describedby={fieldErrors.file ? "product-file-error" : "product-file-help"}
                    />
                    {form.fileName ? (
                      <small>Current file: {form.fileName}{form.fileSize !== null ? ` · ${formatFileSize(form.fileSize)}` : ""}</small>
                    ) : null}
                    {form.file ? <small>Selected file: {form.file.name} · {formatFileSize(form.file.size)}</small> : null}
                    <small id="product-file-help">PDF, MP3, DOC, DOCX and more. Maximum 100 MB.</small>
                    {fieldErrors.file ? <small id="product-file-error" className="product-field-error">{fieldErrors.file}</small> : null}
                  </label>
                  {uploadProgress !== null ? (
                    <div className="product-upload-progress" role="status" aria-live="polite">
                      <div><span>Uploading product file</span><strong>{uploadProgress}%</strong></div>
                      <progress max={100} value={uploadProgress} />
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <section className="product-form-section" aria-labelledby="product-pricing-title">
            <div className="product-form-section-heading">
              <span className="product-form-step">05</span>
              <div><h3 id="product-pricing-title">Pricing</h3><p>Choose how customers will access your product.</p></div>
            </div>
            <div className="product-choice-grid product-pricing-grid" role="group" aria-label="Product pricing">
              <button type="button" className={`product-choice-tile${!form.isFree ? " selected" : ""}`} aria-pressed={!form.isFree} onClick={() => patchForm({ isFree: false })} disabled={busy}>
                <span className="product-choice-icon"><CreditCard size={20} aria-hidden="true" /></span>
                <strong>Paid Product</strong>
                <small>Sell your product at a fixed price.</small>
                {!form.isFree ? <Check className="product-choice-check" size={17} aria-hidden="true" /> : null}
              </button>
              <button type="button" className={`product-choice-tile${form.isFree ? " selected" : ""}`} aria-pressed={form.isFree} onClick={() => patchForm({ isFree: true })} disabled={busy}>
                <span className="product-choice-icon"><Download size={20} aria-hidden="true" /></span>
                <strong>Lead Magnet</strong>
                <small>Offer it at no cost to attract and engage your audience.</small>
                {form.isFree ? <Check className="product-choice-check" size={17} aria-hidden="true" /> : null}
              </button>
            </div>
            {!form.isFree ? (
              <label className="dashboard-field product-price-field">
                <span>Selling price (INR) <em>Required</em></span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) => patchForm({ price: event.target.value })}
                  disabled={busy}
                  data-product-field="price"
                  aria-invalid={Boolean(fieldErrors.price)}
                  aria-describedby={fieldErrors.price ? "product-price-error" : undefined}
                />
                {fieldErrors.price ? <small id="product-price-error" className="product-field-error">{fieldErrors.price}</small> : null}
              </label>
            ) : (
              <p className="product-manager-note">Lead Magnets are delivered through customer email claims.</p>
            )}
          </section>

          <section className="product-form-section product-visibility-section" aria-labelledby="product-visibility-title">
            <div className="product-form-section-heading">
              <span className="product-form-step">06</span>
              <div><h3 id="product-visibility-title">Visibility</h3><p>Choose whether this listing is shown on your storefront.</p></div>
            </div>
            <label className="dashboard-field product-visibility-field">
              <span>Listing status</span>
              <select value={form.isActive ? "active" : "inactive"} onChange={(event) => patchForm({ isActive: event.target.value === "active" })} disabled={busy}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </section>

          <div className="product-editor-footer">
            {formError ? (
              <div className="product-form-error" ref={formErrorRef} role="alert" aria-live="assertive">
                <AlertCircle size={19} aria-hidden="true" />
                <div><strong>Unable to save product</strong><p>{formError}</p></div>
                {formError.includes("listing limit") || formError.includes("listing lifetime") ? <Link href="/dashboard#creator-upgrade">Upgrade plan</Link> : null}
              </div>
            ) : null}
            <div className="product-editor-footer-actions">
              <button className="dashboard-small-button" type="button" onClick={closeForm} disabled={busy}>Cancel</button>
              <button className="dashboard-small-button product-save-button" type="submit" disabled={busy || form.productType !== "digital"}>
                {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null}
                {busy ? "Saving…" : "Save Product"}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {products.length ? (
        <section className="product-list" aria-label="Your products">
          {products.map((product) => (
            <article className="product-list-card" key={product.id}>
              <div className="product-list-cover-wrap">
                <div className="product-list-cover">
                {product.coverImageUrl ? (
                  <Image src={product.coverImageUrl} alt="" width={300} height={225} unoptimized />
                ) : (
                    <div className="product-list-placeholder" aria-hidden="true"><FileImage size={34} strokeWidth={1.5} /></div>
                )}
                </div>
                <span className={product.isActive && product.fileName ? "product-status active product-image-status" : "product-status product-image-status"}>
                  {!product.fileName ? "Draft" : product.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="product-list-copy">
                <div className="product-list-title-row">
                  <h2>{product.name}</h2>
                </div>
                <p>{product.description}</p>
                <div className="product-list-classification">
                  <span>{product.isFree ? "Lead Magnet" : "Paid Product"}</span>
                  {product.category ? <span>{product.category}</span> : null}
                </div>
                <div className="product-list-details">
                  <strong>{product.isFree ? "No cost" : rupeePrice(product.pricePaise)}</strong>
                  <span className="product-file-details" title={product.fileName ?? "File required"}>
                    {product.fileName ?? "File required"}
                    {product.fileSize !== null ? ` · ${formatFileSize(product.fileSize)}` : ""}
                  </span>
                </div>
                <div className="product-list-actions">
                  <button type="button" className="dashboard-small-button" onClick={() => startEdit(product)} disabled={busy}>
                    <Edit3 size={15} aria-hidden="true" /><span>Edit</span>
                  </button>
                  <button type="button" className="dashboard-small-button" onClick={() => setPreview(product)}>
                    <Eye size={15} aria-hidden="true" /><span>Preview</span>
                  </button>
                  <button
                    type="button"
                    className="dashboard-small-button"
                    onClick={() => void toggleActive(product)}
                    disabled={busy || !product.fileName || storefrontStatus === "deletion_pending"}
                  >
                    <Power size={15} aria-hidden="true" /><span>{product.isActive ? "Deactivate" : "Activate"}</span>
                  </button>
                  <button
                    type="button"
                    className="dashboard-danger-button"
                    onClick={() => void deleteProduct(product)}
                    disabled={busy || storefrontStatus === "deletion_pending"}
                  >
                    <Trash2 size={15} aria-hidden="true" /><span>Delete</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : storefrontId ? (
        <div className="product-manager-empty">
          <h2>No products yet</h2>
          <p>Add your first digital product to show it in the storefront catalogue.</p>
          <button className="dashboard-small-button" type="button" onClick={startCreate} disabled={storefrontStatus === "deletion_pending"}>
            <Plus size={16} aria-hidden="true" /> Add product
          </button>
        </div>
      ) : null}

      {preview ? (
        <div className="product-preview-backdrop" role="presentation" onClick={() => setPreview(null)}>
          <section
            className="product-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="product-editor-heading">
              <div>
                <span className="dashboard-eyebrow">Product preview</span>
                <h2 id="product-preview-title">{preview.name}</h2>
              </div>
              <button type="button" className="dashboard-icon-button" onClick={() => setPreview(null)} aria-label="Close preview">
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="product-preview-card">
              <StorefrontProductCard product={preview} />
            </div>
          </section>
        </div>
      ) : null}

    </div>
  );
}
