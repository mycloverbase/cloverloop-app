"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { LoaderCircle, Plus, Trash2, Upload, UserRound, X } from "lucide-react";
import { saveCreatorAvatarAction, saveCreatorProfileAction } from "@/app/dashboard/actions";
import { useDashboardUnsavedChanges } from "@/components/dashboard/dashboard-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CreatorProfile, SocialLink } from "@/lib/account/types";

type ProfileForm = {
  displayName: string;
  username: string;
  bio: string;
  location: string;
  contactNumber: string;
  socialLinks: SocialLink[];
};

function formFromProfile(profile: CreatorProfile): ProfileForm {
  return {
    displayName: profile.display_name,
    username: profile.username ?? "",
    bio: profile.bio,
    location: profile.location ?? "",
    contactNumber: profile.contact_number ?? "",
    socialLinks: profile.social_links,
  };
}

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The cropped image could not be prepared."));
    }, "image/webp", 0.9);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected image could not be opened."));
    image.src = source;
  });
}

export function ProfileEditor({
  profile,
  avatarUrl,
}: {
  profile: CreatorProfile;
  avatarUrl: string | null;
}) {
  const [form, setForm] = useState(() => formFromProfile(profile));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(formFromProfile(profile)));
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const setHasUnsavedChanges = useDashboardUnsavedChanges("profile-editor");
  const snapshot = useMemo(() => JSON.stringify(form), [form]);
  const isDirty = snapshot !== savedSnapshot;

  useEffect(() => {
    setHasUnsavedChanges(isDirty);
    return () => setHasUnsavedChanges(false);
  }, [isDirty, setHasUnsavedChanges]);

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setError("");
    const submitted = JSON.stringify(form);
    const data = new FormData();
    data.set("display_name", form.displayName);
    data.set("username", form.username);
    data.set("bio", form.bio);
    data.set("location", form.location);
    data.set("contact_number", form.contactNumber);
    data.set("social_links", JSON.stringify(form.socialLinks));
    startTransition(async () => {
      try {
        const result = await saveCreatorProfileAction(data);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setSavedSnapshot(submitted);
        setFeedback(result.message);
      } catch (saveError) {
        console.error("Could not save creator profile.", saveError);
        setError("Your profile could not be saved. Check your connection and try again.");
      }
    });
  }

  function addSocialLink() {
    if (form.socialLinks.length >= 10) return;
    update("socialLinks", [...form.socialLinks, { label: "", url: "" }]);
  }

  function updateSocialLink(index: number, key: keyof SocialLink, value: string) {
    update(
      "socialLinks",
      form.socialLinks.map((link, currentIndex) =>
        currentIndex === index ? { ...link, [key]: value } : link,
      ),
    );
  }

  function removeSocialLink(index: number) {
    update("socialLinks", form.socialLinks.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <div className="dashboard-stack">
      <ProfileAvatarEditor
        userId={profile.user_id}
        avatarPath={profile.avatar_path}
        avatarUrl={avatarUrl}
      />

      <form className="dashboard-card dashboard-form-card" onSubmit={submit}>
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-card-label">Public profile details</span>
            <h2>Creator information</h2>
          </div>
          <p>Your name, username, About and social links are shared with your storefront.</p>
        </div>

        <div className="dashboard-form-grid">
          <label className="dashboard-field">
            <span>Profile / store name</span>
            <input
              name="display_name"
              maxLength={80}
              autoComplete="name"
              required
              value={form.displayName}
              onChange={(event) => update("displayName", event.target.value)}
            />
          </label>
          <label className="dashboard-field">
            <span>Username</span>
            <div className="dashboard-username-input">
              <span aria-hidden="true">@</span>
              <input
                name="username"
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,28}[A-Za-z0-9]"
                autoComplete="username"
                required
                value={form.username}
                onChange={(event) => update("username", event.target.value.toLowerCase())}
                aria-describedby="username-hint"
              />
            </div>
            <small id="username-hint">3–30 letters, numbers, underscores or hyphens. Usernames are unique.</small>
          </label>
        </div>

        <label className="dashboard-field">
          <span>About / bio</span>
          <textarea
            name="bio"
            rows={4}
            maxLength={1200}
            value={form.bio}
            onChange={(event) => update("bio", event.target.value)}
            aria-describedby="bio-count"
          />
          <small id="bio-count">{form.bio.length}/1,200 characters</small>
        </label>

        <label className="dashboard-field dashboard-field-narrow">
          <span>Location <em>Optional</em></span>
          <input
            name="location"
            maxLength={80}
            autoComplete="address-level2"
            value={form.location}
            onChange={(event) => update("location", event.target.value)}
          />
        </label>

        <label className="dashboard-field dashboard-field-narrow">
          <span>Contact number <em>Optional</em></span>
          <input
            name="contact_number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={24}
            placeholder="+91 98765 43210"
            value={form.contactNumber}
            onChange={(event) => update("contactNumber", event.target.value)}
            aria-describedby="contact-number-hint"
          />
          <small id="contact-number-hint">Include your country code if applicable. This is only visible in your account.</small>
        </label>

        <fieldset className="dashboard-fieldset">
          <legend>Social links</legend>
          <div className="dashboard-social-links">
            <div className="dashboard-social-heading">
              <div>
                <strong>Additional links</strong>
                <small>Add up to ten social or portfolio links.</small>
              </div>
              <button
                type="button"
                className="dashboard-small-button"
                onClick={addSocialLink}
                disabled={form.socialLinks.length >= 10}
              >
                <Plus size={16} aria-hidden="true" /> Add link
              </button>
            </div>
            {form.socialLinks.map((link, index) => (
              <div className="dashboard-form-grid dashboard-social-row" key={`social-${index}`}>
                <label className="dashboard-field">
                  <span>Link label</span>
                  <input
                    maxLength={40}
                    value={link.label}
                    onChange={(event) => updateSocialLink(index, "label", event.target.value)}
                    placeholder="Portfolio"
                  />
                </label>
                <label className="dashboard-field dashboard-social-url">
                  <span>URL</span>
                  <div className="dashboard-input-with-button">
                    <input
                      type="url"
                      inputMode="url"
                      value={link.url}
                      onChange={(event) => updateSocialLink(index, "url", event.target.value)}
                      placeholder="https://example.com"
                    />
                    <button
                      type="button"
                      className="dashboard-icon-button"
                      onClick={() => removeSocialLink(index)}
                      aria-label={`Remove ${link.label || "additional"} link`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        {error && <p className="dashboard-message dashboard-message-error" role="alert">{error}</p>}
        {feedback && <p className="dashboard-message dashboard-message-success" role="status">{feedback}</p>}
        <div className="dashboard-form-actions">
          <span>{isDirty ? "You have unsaved changes." : "Your profile is up to date."}</span>
          <button type="submit" className="button" disabled={isPending || !isDirty}>
            {isPending ? <LoaderCircle className="spin" size={17} /> : null}
            Save profile
          </button>
        </div>
      </form>
    </div>
  );
}

function ProfileAvatarEditor({
  userId,
  avatarPath,
  avatarUrl,
}: {
  userId: string;
  avatarPath: string | null;
  avatarUrl: string | null;
}) {
  const [currentPath, setCurrentPath] = useState(avatarPath);
  const [currentUrl, setCurrentUrl] = useState(avatarUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const previewSize = 224;
  const scale = dimensions
    ? Math.max(previewSize / dimensions.width, previewSize / dimensions.height) * zoom
    : previewSize;
  const renderedWidth = dimensions ? dimensions.width * scale : previewSize;
  const renderedHeight = dimensions ? dimensions.height * scale : previewSize;

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    setMessage("");
    setError("");
    setZoom(1);
    setHorizontal(50);
    setVertical(50);
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setPreviewUrl(null);
      setDimensions(null);
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setPreviewUrl(null);
      setDimensions(null);
      setError("Choose an image smaller than 5 MB.");
      return;
    }
    setDimensions(null);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function uploadCroppedImage() {
    if (!previewUrl || !dimensions) return;
    setError("");
    setMessage("");
    startTransition(async () => {
      let uploadedPath: string | null = null;
      let profileSaved = false;
      try {
        const image = await loadImage(previewUrl);
        const cropSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
        const cropX = (image.naturalWidth - cropSize) * (horizontal / 100);
        const cropY = (image.naturalHeight - cropSize) * (vertical / 100);
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image editing is not available in this browser.");
        context.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, 512, 512);
        const blob = await blobFromCanvas(canvas);
        const supabase = createSupabaseBrowserClient();
        const path = `${userId}/${crypto.randomUUID()}.webp`;
        const { error: uploadError } = await supabase.storage
          .from("creator-avatars")
          .upload(path, blob, { contentType: "image/webp", cacheControl: "3600", upsert: false });
        if (uploadError) throw new Error("The profile image could not be uploaded. Please try again.");
        uploadedPath = path;
        const { data: signedUrl, error: signedUrlError } = await supabase.storage
          .from("creator-avatars")
          .createSignedUrl(path, 60 * 60 * 12);
        if (signedUrlError) throw new Error("The uploaded image could not be prepared for preview.");
        const result = await saveCreatorAvatarAction(path);
        if (!result.ok) throw new Error(result.message);
        profileSaved = true;
        setCurrentPath(path);
        setCurrentUrl(signedUrl.signedUrl);
        setPreviewUrl(null);
        setDimensions(null);
        setMessage("Profile image updated.");
        if (currentPath && currentPath !== path) {
          const { error: removeError } = await supabase.storage
            .from("creator-avatars")
            .remove([currentPath]);
          if (removeError) {
            console.error("Could not remove the replaced creator avatar.", removeError);
            setMessage("Profile image updated. The previous image could not be removed; contact support for help.");
          }
        }
      } catch (uploadError) {
        if (uploadedPath && !profileSaved) {
          try {
            const supabase = createSupabaseBrowserClient();
            const { error: cleanupError } = await supabase.storage
              .from("creator-avatars")
              .remove([uploadedPath]);
            if (cleanupError) console.error("Could not clean up an incomplete avatar upload.", cleanupError);
          } catch (cleanupError) {
            console.error("Could not clean up an incomplete avatar upload.", cleanupError);
          }
        }
        setError(uploadError instanceof Error ? uploadError.message : "The profile image could not be saved.");
      }
    });
  }

  function deleteAvatar() {
    if (!currentPath) return;
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const result = await saveCreatorAvatarAction(null);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setCurrentPath(null);
        setCurrentUrl(null);
        const { error: removeError } = await supabase.storage
          .from("creator-avatars")
          .remove([currentPath]);
        if (removeError) {
          console.error("Could not remove the creator avatar.", removeError);
          setMessage("Profile picture removed from your account, but its stored file could not be deleted. Contact support.");
          return;
        }
        setMessage("Profile image removed.");
      } catch (removeError) {
        console.error("Could not remove creator profile image.", removeError);
        setError("The profile image could not be removed. Check your connection and try again.");
      }
    });
  }

  return (
    <section className="dashboard-card dashboard-avatar-card" aria-labelledby="profile-picture-title">
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-card-label">Profile picture</span>
          <h2 id="profile-picture-title">Your photo</h2>
        </div>
        <p>JPG, PNG or WebP, up to 5 MB. Your image is stored privately with access restricted to your account.</p>
      </div>
      <div className="dashboard-avatar-editor">
        <div className="dashboard-avatar-preview" aria-label="Profile picture preview">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="Crop preview"
              width={Math.max(1, Math.round(renderedWidth))}
              height={Math.max(1, Math.round(renderedHeight))}
              unoptimized
              onLoad={(event) => setDimensions({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })}
              style={{
                width: `${renderedWidth}px`,
                height: `${renderedHeight}px`,
                left: `${-(renderedWidth - previewSize) * (horizontal / 100)}px`,
                top: `${-(renderedHeight - previewSize) * (vertical / 100)}px`,
              }}
            />
          ) : currentUrl ? (
            <Image src={currentUrl} alt="Current profile picture" width={112} height={112} />
          ) : (
            <UserRound size={38} aria-hidden="true" />
          )}
        </div>
        <div className="dashboard-avatar-controls">
          <label className="dashboard-small-button dashboard-file-button">
            <Upload size={16} aria-hidden="true" />
            {currentPath ? "Choose a new photo" : "Choose a photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} />
          </label>
          {previewUrl && (
            <div className="dashboard-crop-controls">
              <label>
                Zoom
                <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
              </label>
              <label>
                Horizontal crop
                <input type="range" min="0" max="100" value={horizontal} onChange={(event) => setHorizontal(Number(event.target.value))} />
              </label>
              <label>
                Vertical crop
                <input type="range" min="0" max="100" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} />
              </label>
              <div className="dashboard-inline-actions">
                <button type="button" className="dashboard-small-button" disabled={isPending} onClick={uploadCroppedImage}>
                  {isPending ? <LoaderCircle className="spin" size={16} /> : null}
                  Save cropped image
                </button>
                <button type="button" className="dashboard-icon-button" onClick={() => {
                  setPreviewUrl(null);
                  setDimensions(null);
                }} aria-label="Cancel image crop">
                  <X size={17} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
          {currentPath && !previewUrl && (
            <button type="button" className="dashboard-text-danger" onClick={deleteAvatar} disabled={isPending}>
              <Trash2 size={15} aria-hidden="true" /> Remove photo
            </button>
          )}
        </div>
      </div>
      {error && <p className="dashboard-message dashboard-message-error" role="alert">{error}</p>}
      {message && <p className="dashboard-message dashboard-message-success" role="status">{message}</p>}
    </section>
  );
}
