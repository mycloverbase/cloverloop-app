"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ImagePlus, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { uploadStorefrontImageAction } from "@/app/dashboard/storefront/actions";
import type { StorefrontImageKind } from "@/lib/storefront/types";

const imageLimits: Record<StorefrontImageKind, number> = {
  profile: 5 * 1024 * 1024,
  banner: 10 * 1024 * 1024,
  product: 10 * 1024 * 1024,
};

const cropRatios: Record<StorefrontImageKind, number> = {
  profile: 1,
  banner: 3,
  product: 4 / 3,
};

const outputSizes: Record<StorefrontImageKind, { width: number; height: number }> = {
  profile: { width: 512, height: 512 },
  banner: { width: 1800, height: 600 },
  product: { width: 960, height: 720 },
};

const labels: Record<StorefrontImageKind, string> = {
  profile: "Profile image",
  banner: "Banner image",
  product: "Cover image",
};

type CropRect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type CropHandle = { x: -1 | 1; y: -1 | 1 };
type DragState = {
  mode: "image" | "move" | "resize";
  startX: number;
  startY: number;
  crop: CropRect;
  pan: Point;
  handle?: CropHandle;
};
type StageSize = { width: number; height: number };

function cropPixels(crop: CropRect, size: StageSize) {
  return {
    x: crop.x * size.width,
    y: crop.y * size.height,
    width: crop.width * size.width,
    height: crop.height * size.height,
  };
}

function clampPan(pan: Point, imageWidth: number, imageHeight: number, crop: CropRect) {
  return {
    x: Math.max(crop.x + crop.width - imageWidth, Math.min(crop.x, pan.x)),
    y: Math.max(crop.y + crop.height - imageHeight, Math.min(crop.y, pan.y)),
  };
}

function drawCrop(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  crop: CropRect,
  stage: StageSize,
  pan: Point,
  scale: number,
  output: { width: number; height: number },
) {
  const context = canvas.getContext("2d");
  if (!context || !scale) return false;

  const frame = cropPixels(crop, stage);
  const imageX = pan.x * stage.width;
  const imageY = pan.y * stage.height;
  const sourceX = (frame.x - imageX) / scale;
  const sourceY = (frame.y - imageY) / scale;
  const sourceWidth = frame.width / scale;
  const sourceHeight = frame.height / scale;

  canvas.width = output.width;
  canvas.height = output.height;
  context.clearRect(0, 0, output.width, output.height);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    output.width,
    output.height,
  );
  return true;
}

export function ImageCropUploader({
  kind,
  storefrontId,
  imageUrl,
  onUploaded,
  onRemove,
  onError,
  autoSave = false,
}: {
  kind: StorefrontImageKind;
  storefrontId: string | null;
  imageUrl: string | null;
  onUploaded: (path: string, url: string) => void;
  onRemove?: () => void;
  onError?: (message: string) => void;
  autoSave?: boolean;
}) {
  const fileInputId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [pan, setPan] = useState<Point | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const aspectRatio = cropRatios[kind];
  const outputSize = outputSizes[kind];
  const limitInMb = kind === "profile" ? 5 : 10;
  const isBusy = isProcessing || isPending;
  const imageScale = loadedImage && stageSize.width && stageSize.height
    ? Math.max(
      stageSize.width / loadedImage.naturalWidth,
      stageSize.height / loadedImage.naturalHeight,
    )
    : 0;
  const defaultCrop = useMemo(() => {
    if (!loadedImage || !stageSize.width || !stageSize.height) return null;
      const width = Math.min(stageSize.width * 0.88, stageSize.height * aspectRatio * 0.84);
      const height = width / aspectRatio;
      return {
        x: (stageSize.width - width) / 2 / stageSize.width,
        y: (stageSize.height - height) / 2 / stageSize.height,
        width: width / stageSize.width,
        height: height / stageSize.height,
      };
  }, [loadedImage, stageSize.width, stageSize.height, aspectRatio]);
  const activeCrop = crop ?? defaultCrop;
  const activePan = useMemo(() => {
    if (pan) return pan;
    return loadedImage && imageScale && stageSize.width && stageSize.height
      ? {
      x: (stageSize.width - loadedImage.naturalWidth * imageScale) / 2 / stageSize.width,
      y: (stageSize.height - loadedImage.naturalHeight * imageScale) / 2 / stageSize.height,
    }
      : { x: 0, y: 0 };
  }, [pan, loadedImage, imageScale, stageSize.width, stageSize.height]);
  const displayedImage = loadedImage && imageScale
    ? {
      width: loadedImage.naturalWidth * imageScale,
      height: loadedImage.naturalHeight * imageScale,
      x: activePan.x * stageSize.width,
      y: activePan.y * stageSize.height,
    }
    : null;
  const selectedCrop = activeCrop && stageSize.width && stageSize.height
    ? cropPixels(activeCrop, stageSize)
    : null;

  const cancelCrop = useCallback(() => {
    if (isBusy) return;
    setSelectedFile(null);
    setSelectedUrl(null);
    setLoadedImage(null);
    setCrop(null);
    setError("");
    onError?.("");
  }, [isBusy, onError]);

  useEffect(() => {
    if (!selectedUrl) return;
    return () => URL.revokeObjectURL(selectedUrl);
  }, [selectedUrl]);

  useEffect(() => {
    if (!selectedUrl) return;
    const image = new window.Image();
    image.onload = () => setLoadedImage(image);
    image.onerror = () => {
      const message = "This image could not be opened. Choose another JPG, PNG or WebP file.";
      setError(message);
      onError?.(`Image upload failed. ${message}`);
    };
    image.src = selectedUrl;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [selectedUrl, onError]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !selectedFile) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [selectedFile]);

  useEffect(() => {
    if (!selectedFile) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isBusy) cancelCrop();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedFile, isBusy, cancelCrop]);

  useEffect(() => {
    if (!loadedImage || !activeCrop || !stageSize.width || !stageSize.height || !previewCanvasRef.current) return;
    drawCrop(
      previewCanvasRef.current,
      loadedImage,
      activeCrop,
      stageSize,
      activePan,
      imageScale,
      outputSize,
    );
  }, [loadedImage, activeCrop, stageSize, activePan, imageScale, outputSize]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setSelectedFile(null);
    setSelectedUrl(null);
    setLoadedImage(null);
    setCrop(null);
    setPan(null);
    setError("");
    onError?.("");
    setMessage("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      const message = "Choose a JPG, PNG or WebP image.";
      setError(message);
      onError?.(`Image upload failed. ${message}`);
      return;
    }
    if (file.size > imageLimits[kind]) {
      const message = `Choose an image no larger than ${limitInMb} MB.`;
      setError(message);
      onError?.(`Image upload failed. ${message}`);
      return;
    }
    setSelectedFile(file);
    setSelectedUrl(URL.createObjectURL(file));
  }

  function startDrag(
    event: ReactPointerEvent<HTMLElement>,
    mode: DragState["mode"],
    handle?: CropHandle,
  ) {
    if (!activeCrop || !stageRef.current || !displayedImage || !selectedCrop) return;
    event.preventDefault();
    event.stopPropagation();
    stageRef.current.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      crop: activeCrop,
      pan: { x: displayedImage.x, y: displayedImage.y },
      ...(handle ? { handle } : {}),
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !stageSize.width || !stageSize.height || !displayedImage) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const original = cropPixels(drag.crop, stageSize);
    let nextCrop = drag.crop;

    if (drag.mode === "move") {
      const x = Math.max(0, Math.min(stageSize.width - original.width, original.x + dx));
      const y = Math.max(0, Math.min(stageSize.height - original.height, original.y + dy));
      nextCrop = {
        ...drag.crop,
        x: x / stageSize.width,
        y: y / stageSize.height,
      };
    } else if (drag.mode === "resize" && drag.handle) {
      const { x: handleX, y: handleY } = drag.handle;
      const widthDelta = Math.abs(dx) >= Math.abs(dy * aspectRatio)
        ? handleX * dx
        : handleY * dy * aspectRatio;
      const maxWidth = Math.min(
        handleX < 0 ? original.x + original.width : stageSize.width - original.x,
        (handleY < 0 ? original.y + original.height : stageSize.height - original.y) * aspectRatio,
      );
      const minWidth = Math.min(
        Math.min(stageSize.width, stageSize.height * aspectRatio) * 0.22,
        maxWidth,
      );
      const width = Math.max(minWidth, Math.min(maxWidth, original.width + widthDelta));
      const height = width / aspectRatio;
      const x = handleX < 0 ? original.x + original.width - width : original.x;
      const y = handleY < 0 ? original.y + original.height - height : original.y;
      nextCrop = {
        x: x / stageSize.width,
        y: y / stageSize.height,
        width: width / stageSize.width,
        height: height / stageSize.height,
      };
    }

    setCrop(nextCrop);
    const frame = cropPixels(nextCrop, stageSize);
    const nextPan = drag.mode === "image"
      ? clampPan(
        { x: drag.pan.x + dx, y: drag.pan.y + dy },
        displayedImage.width,
        displayedImage.height,
        frame,
      )
      : clampPan(drag.pan, displayedImage.width, displayedImage.height, frame);
    setPan({ x: nextPan.x / stageSize.width, y: nextPan.y / stageSize.height });
  }

  async function uploadImage() {
    if (!loadedImage || !activeCrop || !selectedFile || !storefrontId || !previewCanvasRef.current) return;
    setError("");
    onError?.("");
    setMessage("");
    setIsProcessing(true);
    try {
      const rendered = drawCrop(
        previewCanvasRef.current,
        loadedImage,
        activeCrop,
        stageSize,
        activePan,
        imageScale,
        outputSize,
      );
      if (!rendered) throw new Error("The cropped image preview could not be generated.");
      const blob = await new Promise<Blob>((resolve, reject) => {
        previewCanvasRef.current?.toBlob(
          (result) => result ? resolve(result) : reject(new Error("The cropped image could not be encoded.")),
          "image/webp",
          0.9,
        );
      });
      if (blob.size > imageLimits[kind]) {
        setError(`The cropped image is too large to upload. Choose a smaller source image (maximum ${limitInMb} MB).`);
        setIsProcessing(false);
        return;
      }

      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("storefront_id", storefrontId);
      formData.set("image", new File([blob], `${kind}-cropped.webp`, { type: blob.type }));
      startTransition(async () => {
        try {
          const result = await uploadStorefrontImageAction(formData);
          if (!result.ok) {
            setError(result.message);
            onError?.(`Image upload failed. ${result.message}`);
            return;
          }
          if (!result.path || !result.imageUrl) {
            const message = "The uploaded image could not be prepared for preview. Please try again.";
            setError(message);
            onError?.(`Image upload failed. ${message}`);
            return;
          }
          onUploaded(result.path, result.imageUrl);
          onError?.("");
          setSelectedFile(null);
          setSelectedUrl(null);
          setLoadedImage(null);
          setCrop(null);
          setMessage(autoSave
            ? "Image uploaded. Your onboarding will save this image automatically."
            : "Image uploaded. Save your changes to apply it.");
        } catch (uploadError) {
          console.error("Could not upload a storefront image.", uploadError);
          const message = "Image upload failed. Check your connection and try again with a supported image format.";
          setError(message);
          onError?.(message);
        } finally {
          setIsProcessing(false);
        }
      });
    } catch (cropError) {
      console.error("Could not prepare a cropped storefront image.", cropError);
      const message = "The cropped image could not be prepared. Adjust the crop and try again.";
      setError(message);
      onError?.(message);
      setIsProcessing(false);
    }
  }

  function removeImage() {
    setError("");
    onError?.("");
    setMessage("");
    onRemove?.();
  }

  return (
    <div className="storefront-image-uploader">
      <div className="storefront-image-preview" style={{ aspectRatio: `${aspectRatio}` }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`${labels[kind]} preview`} />
        ) : (
          <span className="storefront-image-empty">
            {kind === "product" ? <ImagePlus size={27} aria-hidden="true" /> : null}
            {kind === "product" ? "Upload cover image" : kind === "profile" ? "Add a profile image" : "Add a banner image"}
          </span>
        )}
      </div>
      <label className="storefront-file-picker" htmlFor={fileInputId}>
        <Upload size={16} aria-hidden="true" />
        {imageUrl ? "Change image" : kind === "product" ? "Upload cover image" : "Choose image"}
      </label>
      <input
        id={fileInputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={chooseFile}
        disabled={isBusy}
        aria-describedby={`${fileInputId}-help`}
      />
      <small id={`${fileInputId}-help`}>JPG, PNG or WebP. Maximum {limitInMb} MB.</small>

      {selectedFile ? (
        <div className="storefront-crop-backdrop">
          <section
            className="storefront-crop-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${fileInputId}-crop-title`}
          >
            <header className="storefront-crop-dialog-header">
              <div>
                <h3 id={`${fileInputId}-crop-title`}>Adjust {labels[kind].toLowerCase()}</h3>
                <p>Drag the image or crop frame. Resize the frame to refine your composition.</p>
              </div>
              <button
                type="button"
                className="storefront-crop-close"
                onClick={cancelCrop}
                disabled={isBusy}
                aria-label="Cancel image crop"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <div className="storefront-crop-workspace">
              <div className="storefront-crop-editor">
                <div
                  ref={stageRef}
                  className={`storefront-crop-stage storefront-crop-stage-${kind}`}
                  onPointerDown={(event) => startDrag(event, "image")}
                  onPointerMove={moveDrag}
                  onPointerUp={() => { dragRef.current = null; }}
                  onPointerCancel={() => { dragRef.current = null; }}
                  style={{ aspectRatio: kind === "banner" ? "3 / 2" : "4 / 3" }}
                  aria-label="Image crop area"
                >
                  {displayedImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="storefront-crop-source"
                      src={selectedUrl ?? ""}
                      alt=""
                      draggable={false}
                      style={{
                        width: displayedImage.width,
                        height: displayedImage.height,
                        left: displayedImage.x,
                        top: displayedImage.y,
                      }}
                    />
                  ) : null}
                  {selectedCrop ? (
                    <div
                      className="storefront-crop-selection"
                      onPointerDown={(event) => startDrag(event, "move")}
                      style={{
                        left: selectedCrop.x,
                        top: selectedCrop.y,
                        width: selectedCrop.width,
                        height: selectedCrop.height,
                      }}
                      role="group"
                      aria-label="Crop selection. Drag to move."
                    >
                      {([
                        { x: -1, y: -1, label: "top left" },
                        { x: 1, y: -1, label: "top right" },
                        { x: -1, y: 1, label: "bottom left" },
                        { x: 1, y: 1, label: "bottom right" },
                      ] as const).map((handle) => (
                        <button
                          key={handle.label}
                          type="button"
                          className={`storefront-crop-handle storefront-crop-handle-${handle.label.replace(" ", "-")}`}
                          aria-label={`Resize crop from ${handle.label}`}
                          onPointerDown={(event) => startDrag(event, "resize", handle)}
                        />
                      ))}
                    </div>
                  ) : null}
                  {!loadedImage ? <span className="storefront-crop-loading">Preparing image preview…</span> : null}
                </div>

                <small className="storefront-crop-hint">Drag the image or frame to reposition. Resize the frame to refine the crop; the result is saved exactly as previewed.</small>
              </div>

              <aside className="storefront-crop-final">
                <strong>Final image</strong>
                <canvas
                  ref={previewCanvasRef}
                  className={`storefront-crop-result storefront-crop-result-${kind}`}
                  style={{ aspectRatio: `${aspectRatio}` }}
                  aria-label={`Preview of the final ${labels[kind].toLowerCase()}`}
                />
              </aside>
            </div>

            {error ? <p className="dashboard-message dashboard-message-error" role="alert">{error}</p> : null}
            <footer className="storefront-crop-actions">
              {!storefrontId ? <small>Save your store name and username before uploading images.</small> : <span />}
              <div>
                <button type="button" className="dashboard-small-button" onClick={cancelCrop} disabled={isBusy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="dashboard-small-button storefront-crop-save"
                  onClick={() => void uploadImage()}
                  disabled={isBusy || !loadedImage || !activeCrop || !storefrontId}
                >
                  {isBusy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} aria-hidden="true" />}
                  {isBusy ? "Saving image…" : "Save & upload"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}

      {onRemove && imageUrl ? (
        <button type="button" className="dashboard-small-button storefront-remove-image" onClick={removeImage} disabled={isBusy}>
          <Trash2 size={15} aria-hidden="true" /> Remove image
        </button>
      ) : null}
      {error && !selectedFile ? <p className="dashboard-message dashboard-message-error" role="alert">{error}</p> : null}
      {message ? <p className="dashboard-message dashboard-message-success" role="status">{message}</p> : null}
    </div>
  );
}
