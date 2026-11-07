"use client";

import { useEffect, useId, useState, useTransition, type ChangeEvent } from "react";
import { LoaderCircle, Trash2, Upload } from "lucide-react";
import { uploadStorefrontImageAction } from "@/app/dashboard/storefront/actions";
import type { StorefrontImageKind } from "@/lib/storefront/types";

const imageLimits: Record<StorefrontImageKind, number> = {
  profile: 5 * 1024 * 1024,
  banner: 10 * 1024 * 1024,
  product: 10 * 1024 * 1024,
};

const labels: Record<StorefrontImageKind, string> = {
  profile: "Profile image",
  banner: "Banner image",
  product: "Cover image",
};

export function ImageCropUploader({
  kind,
  storefrontId,
  imageUrl,
  onUploaded,
  onRemove,
}: {
  kind: StorefrontImageKind;
  storefrontId: string | null;
  imageUrl: string | null;
  onUploaded: (path: string, url: string) => void;
  onRemove?: () => void;
}) {
  const fileInputId = useId();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const previewUrl = selectedUrl ?? imageUrl;
  const aspectRatio = kind === "profile" ? "1" : kind === "banner" ? "3" : "4 / 3";
  const limitInMb = kind === "profile" ? 5 : 10;

  useEffect(() => {
    if (!selectedUrl) return;
    return () => URL.revokeObjectURL(selectedUrl);
  }, [selectedUrl]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setSelectedFile(null);
    setSelectedUrl(null);
    setError("");
    setMessage("");
    setZoom(1);
    setHorizontal(50);
    setVertical(50);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > imageLimits[kind]) {
      setError(`Choose an image no larger than ${limitInMb} MB.`);
      return;
    }
    setSelectedFile(file);
    setSelectedUrl(URL.createObjectURL(file));
  }

  function uploadImage() {
    if (!selectedFile || !storefrontId) return;
    setError("");
    setMessage("");
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("storefront_id", storefrontId);
    formData.set("image", selectedFile);
    formData.set("zoom", String(zoom));
    formData.set("horizontal", String(horizontal));
    formData.set("vertical", String(vertical));
    startTransition(async () => {
      try {
        const result = await uploadStorefrontImageAction(formData);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (!result.path || !result.signedUrl) {
          setError("The uploaded image could not be prepared for preview. Please try again.");
          return;
        }
        onUploaded(result.path, result.signedUrl);
        setSelectedFile(null);
        setSelectedUrl(null);
        setMessage("Image uploaded. Save your changes to apply it.");
      } catch (uploadError) {
        console.error("Could not upload a storefront image.", uploadError);
        setError("The image could not be uploaded. Check your connection and try again.");
      }
    });
  }

  function removeImage() {
    setSelectedFile(null);
    setSelectedUrl(null);
    setError("");
    setMessage("");
    onRemove?.();
  }

  return (
    <div className="storefront-image-uploader">
      <div className="storefront-image-preview" style={{ aspectRatio }}>
        {previewUrl ? (
          // The local object URL is only used for the creator's crop preview.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`${labels[kind]} crop preview`}
            style={{
              objectFit: "cover",
              objectPosition: `${horizontal}% ${vertical}%`,
              transform: `scale(${zoom})`,
            }}
          />
        ) : (
          <span>{kind === "profile" ? "Add a profile image" : `Add a ${kind} image`}</span>
        )}
      </div>
      <label className="storefront-file-picker" htmlFor={fileInputId}>
        <Upload size={16} aria-hidden="true" />
        Choose image
      </label>
      <input
        id={fileInputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={chooseFile}
        disabled={isPending}
        aria-describedby={`${fileInputId}-help`}
      />
      <small id={`${fileInputId}-help`}>JPG, PNG or WebP. Maximum {limitInMb} MB.</small>

      {selectedFile ? (
        <div className="storefront-crop-controls">
          <label>
            Zoom
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
          <label>
            Reposition horizontally
            <input
              type="range"
              min="0"
              max="100"
              value={horizontal}
              onChange={(event) => setHorizontal(Number(event.target.value))}
            />
          </label>
          <label>
            Reposition vertically
            <input
              type="range"
              min="0"
              max="100"
              value={vertical}
              onChange={(event) => setVertical(Number(event.target.value))}
            />
          </label>
          <button type="button" className="dashboard-small-button" onClick={uploadImage} disabled={isPending || !storefrontId}>
            {isPending ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} aria-hidden="true" />}
            Upload cropped image
          </button>
          {!storefrontId ? <small>Save your store name and username before uploading images.</small> : null}
        </div>
      ) : null}

      {onRemove && imageUrl ? (
        <button type="button" className="dashboard-small-button storefront-remove-image" onClick={removeImage} disabled={isPending}>
          <Trash2 size={15} aria-hidden="true" /> Remove image
        </button>
      ) : null}
      {error ? <p className="dashboard-message dashboard-message-error" role="alert">{error}</p> : null}
      {message ? <p className="dashboard-message dashboard-message-success" role="status">{message}</p> : null}
    </div>
  );
}
