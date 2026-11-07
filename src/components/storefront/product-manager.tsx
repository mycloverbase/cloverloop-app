"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Edit3, Eye, LoaderCircle, Plus, Power, Trash2, X } from "lucide-react";
import {
  createProductDraftAction,
  deleteProductAction,
  prepareProductFileUploadAction,
  saveProductAction,
} from "@/app/dashboard/products/actions";
import { ImageCropUploader } from "@/components/storefront/image-crop-uploader";
import { StorefrontProductCard } from "@/components/storefront/public-storefront";
import { getCreatorPlan } from "@/lib/account/plans";
import type { CreatorPlanKey } from "@/lib/account/types";
import {
  PRODUCT_FILE_ACCEPT,
  validateProductFileMetadata,
} from "@/lib/storefront/product-files";
import { uploadProductFile } from "@/lib/storefront/product-upload";
import type { CreatorStorefrontProduct, StorefrontProductDisplay } from "@/lib/storefront/types";

type ProductForm = {
  id: string | null;
  name: string;
  description: string;
  category: string;
  coverImagePath: string | null;
  coverImageUrl: string | null;
  isFree: boolean;
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

function previewProduct(form: ProductForm): StorefrontProductDisplay {
  return {
    id: form.id ?? "product-preview",
    name: form.name.trim() || "Product name",
    description: form.description.trim() || "Your product description will appear here.",
    category: form.category.trim() || null,
    productType: "digital",
    isFree: form.isFree,
    pricePaise: form.isFree ? 0 : parsePrice(form.price) ?? 0,
    coverImageUrl: form.coverImageUrl,
  };
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
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const canCreateFree = plan !== "free" || freeListingCount < 5;
  const canCreatePaid = plan !== "free" || paidListingCount < 1;
  const limitedPlan = getCreatorPlan(plan) === "free";

  function startCreate() {
    setError("");
    setFeedback("");
    setForm(blankForm());
  }

  function startEdit(product: CreatorStorefrontProduct) {
    setError("");
    setFeedback("");
    setForm(formFromProduct(product));
  }

  function closeForm() {
    setForm(null);
    setError("");
    setUploadProgress(null);
  }

  function patchForm(update: Partial<ProductForm>) {
    setForm((current) => current ? { ...current, ...update } : current);
  }

  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    if (!storefrontId) {
      setError("Create and save your storefront before adding products.");
      return;
    }
    if (storefrontStatus === "deletion_pending") {
      setError("This storefront is scheduled for deletion and cannot be changed.");
      return;
    }
    if (!form.name.trim() || form.name.trim().length > 100) {
      setError("Product name is required and must be 100 characters or fewer.");
      return;
    }
    if (!form.description.trim() || form.description.trim().length > 5000) {
      setError("Product description is required and must be 5,000 characters or fewer.");
      return;
    }
    const pricePaise = form.isFree ? 0 : parsePrice(form.price);
    if (!form.isFree && pricePaise === null) {
      setError("Enter a valid selling price greater than ₹0, with up to two decimal places.");
      return;
    }
    if (
      limitedPlan &&
      ((form.isFree && !form.countedAsFree && freeListingCount >= 5) ||
        (!form.isFree && !form.countedAsPaid && paidListingCount >= 1))
    ) {
      setError(form.isFree
        ? "Your Free plan has reached its five free product listings per account lifetime."
        : "Your Free plan has reached its one paid product listing per account lifetime.");
      return;
    }
    if (!form.id && !form.file) {
      setError("Upload a product file before creating the product.");
      return;
    }
    const fileMetadata = form.file
      ? validateProductFileMetadata(form.file.name, form.file.size, form.file.type)
      : null;
    if (fileMetadata && !fileMetadata.ok) {
      setError(fileMetadata.message);
      return;
    }

    setBusy(true);
    setError("");
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
          setError(draft.ok ? "The product draft could not be created." : draft.message);
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
          setError(uploadSlot.ok ? "A secure upload could not be started." : uploadSlot.message);
          return;
        }
        setUploadProgress(0);
        await uploadProductFile(form.file, uploadSlot.uploadPath, fileMetadata.value, setUploadProgress);
      }

      const result = await saveProductAction(productId, input);
      if (!result.ok) {
        setError(result.message);
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
      setError(saveError instanceof Error ? saveError.message : "The product could not be saved. Please try again.");
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

  const limitNotice = limitedPlan
    ? `Free plan usage: ${paidListingCount}/1 paid and ${freeListingCount}/5 free lifetime listings.`
    : "Your plan includes unlimited product listings.";

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
            disabled={!storefrontId || storefrontStatus === "deletion_pending" || busy || (!canCreateFree && !canCreatePaid)}
          >
            <Plus size={16} aria-hidden="true" /> Add product
          </button>
        </div>
      </header>

      <p className="product-manager-plan-note">{limitNotice}</p>
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
      {error ? <div className="product-manager-alert error" role="alert">{error}</div> : null}
      {feedback ? <div className="product-manager-alert success" role="status">{feedback}</div> : null}

      {form ? (
        <form className="product-editor-panel" onSubmit={saveForm}>
          <div className="product-editor-heading">
            <div>
              <span className="dashboard-eyebrow">{form.id ? "Edit listing" : "New listing"}</span>
              <h2>{form.id ? "Update product" : "Add a product"}</h2>
            </div>
            <button type="button" className="dashboard-icon-button" onClick={closeForm} disabled={busy} aria-label="Close product form">
              <X size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="product-editor-grid">
            <div>
              <label className="dashboard-field">
                <span>Product name <em>Required</em></span>
                <input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(event) => patchForm({ name: event.target.value })}
                  disabled={busy}
                />
              </label>
              <label className="dashboard-field">
                <span>Product description <em>Required</em></span>
                <textarea
                  required
                  maxLength={5000}
                  rows={6}
                  value={form.description}
                  onChange={(event) => patchForm({ description: event.target.value })}
                  disabled={busy}
                />
                <small>{form.description.length}/5,000 characters</small>
              </label>
              <label className="dashboard-field">
                <span>Category <em>Optional</em></span>
                <input
                  maxLength={50}
                  value={form.category}
                  onChange={(event) => patchForm({ category: event.target.value })}
                  disabled={busy}
                />
              </label>
              <label className="dashboard-field">
                <span>Product file <em>PDF, MP3, DOC, DOCX and more · max 100 MB</em></span>
                <input
                  type="file"
                  accept={PRODUCT_FILE_ACCEPT}
                  onChange={(event) => patchForm({ file: event.target.files?.[0] ?? null })}
                  disabled={busy}
                />
                {form.fileName ? (
                  <small>Current file: {form.fileName}{form.fileSize !== null ? ` · ${formatFileSize(form.fileSize)}` : ""}</small>
                ) : null}
                {form.file ? <small>Replacement: {form.file.name} · {formatFileSize(form.file.size)}</small> : null}
              </label>
              {uploadProgress !== null ? (
                <div className="product-upload-progress" role="status" aria-live="polite">
                  <div><span>Uploading product file</span><strong>{uploadProgress}%</strong></div>
                  <progress max={100} value={uploadProgress} />
                </div>
              ) : null}
            </div>

            <div>
              <span className="product-editor-field-title">Cover image <em>Optional</em></span>
              <ImageCropUploader
                kind="product"
                storefrontId={storefrontId}
                imageUrl={form.coverImageUrl}
                onUploaded={(path, url) => patchForm({ coverImagePath: path, coverImageUrl: url })}
              />
              <label className="dashboard-field">
                <span>Product type</span>
                <input value="Digital product" readOnly />
              </label>
              <label className="dashboard-field">
                <span>Product price type <em>Required</em></span>
                <select
                  value={form.isFree ? "free" : "paid"}
                  onChange={(event) => patchForm({
                    isFree: event.target.value === "free",
                    price: event.target.value === "free" ? "" : form.price,
                  })}
                  disabled={busy}
                >
                  <option value="paid">Paid product</option>
                  <option value="free">Free product</option>
                </select>
              </label>
              {!form.isFree ? (
                <label className="dashboard-field">
                  <span>Selling price (INR) <em>Required</em></span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    required
                    value={form.price}
                    onChange={(event) => patchForm({ price: event.target.value })}
                    disabled={busy}
                  />
                </label>
              ) : (
                <p className="product-manager-note">Free delivery is not enabled. Visitors will see a “coming soon” message.</p>
              )}
              <label className="dashboard-field">
                <span>Visibility <em>Required</em></span>
                <select
                  value={form.isActive ? "active" : "inactive"}
                  onChange={(event) => patchForm({ isActive: event.target.value === "active" })}
                  disabled={busy}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
          </div>

          <div className="product-editor-preview">
            <h3>Storefront preview</h3>
            <div className="product-editor-preview-card">
              <StorefrontProductCard product={previewProduct(form)} />
            </div>
          </div>
          <div className="product-editor-footer">
            <button className="dashboard-small-button" type="button" onClick={closeForm} disabled={busy}>Cancel</button>
            <button className="dashboard-small-button product-save-button" type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null}
              {busy ? "Saving…" : "Save product"}
            </button>
          </div>
        </form>
      ) : null}

      {products.length ? (
        <section className="product-list" aria-label="Your products">
          {products.map((product) => (
            <article className="product-list-card" key={product.id}>
              <div className="product-list-cover">
                {product.coverImageUrl ? (
                  <Image src={product.coverImageUrl} alt="" width={300} height={225} unoptimized />
                ) : (
                  <div aria-hidden="true" />
                )}
              </div>
              <div className="product-list-copy">
                <div className="product-list-title-row">
                  <h2>{product.name}</h2>
                  <span className={product.isActive ? "product-status active" : "product-status"}>
                    {!product.fileName ? "Draft" : product.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p>{product.description}</p>
                <div className="product-list-details">
                  <strong>{product.isFree ? "Free" : rupeePrice(product.pricePaise)}</strong>
                  {product.category ? <span>{product.category}</span> : null}
                  <span>{product.fileName ? product.fileName : "File required"}</span>
                  {product.fileSize !== null ? <span>{formatFileSize(product.fileSize)}</span> : null}
                </div>
                <div className="product-list-actions">
                  <button type="button" className="dashboard-small-button" onClick={() => startEdit(product)} disabled={busy}>
                    <Edit3 size={15} aria-hidden="true" /> Edit
                  </button>
                  <button type="button" className="dashboard-small-button" onClick={() => setPreview(product)}>
                    <Eye size={15} aria-hidden="true" /> Preview
                  </button>
                  <button
                    type="button"
                    className="dashboard-small-button"
                    onClick={() => void toggleActive(product)}
                    disabled={busy || !product.fileName || storefrontStatus === "deletion_pending"}
                  >
                    <Power size={15} aria-hidden="true" /> {product.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className="dashboard-danger-button"
                    onClick={() => void deleteProduct(product)}
                    disabled={busy || storefrontStatus === "deletion_pending"}
                  >
                    <Trash2 size={15} aria-hidden="true" /> Delete
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
                <span className="dashboard-eyebrow">Storefront preview</span>
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

      {!canCreateFree || !canCreatePaid ? (
        <p className="product-manager-note">
          {plan === "free"
            ? "A Free plan product type has reached its lifetime listing limit. Upgrade your plan for unlimited listings."
            : null}
        </p>
      ) : null}
    </div>
  );
}
