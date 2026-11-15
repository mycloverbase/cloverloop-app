"use client";

import { useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { SocialPlatformIcon } from "@/components/storefront/social-platform-icon";
import {
  STOREFRONT_SOCIAL_PLATFORMS,
  type StorefrontSocialLink,
} from "@/lib/storefront/types";

function socialUrlPrefix(platform: string): string {
  const prefixes: Record<string, string> = {
    Instagram: "https://www.instagram.com/",
    YouTube: "https://www.youtube.com/@",
    Facebook: "https://www.facebook.com/",
    LinkedIn: "https://www.linkedin.com/in/",
    X: "https://x.com/",
    TikTok: "https://www.tiktok.com/@",
    Pinterest: "https://www.pinterest.com/",
    Threads: "https://www.threads.net/@",
    Twitch: "https://www.twitch.tv/",
  };
  return prefixes[platform] ?? "";
}

export function SocialLinksEditor({
  links,
  onChange,
  disabled = false,
}: {
  links: StorefrontSocialLink[];
  onChange: (links: StorefrontSocialLink[]) => void;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function addSocialLink(platform: (typeof STOREFRONT_SOCIAL_PLATFORMS)[number]) {
    if (disabled || links.length >= 10) return;
    onChange([
      ...links,
      {
        id: crypto.randomUUID(),
        platform,
        label: platform,
        url: socialUrlPrefix(platform),
      },
    ]);
    setPickerOpen(false);
  }

  function updateSocialLink(id: string, key: "label" | "url", value: string) {
    onChange(links.map((link) => link.id === id ? { ...link, [key]: value } : link));
  }

  return (
    <>
      <section className="storefront-step-fields" aria-labelledby="storefront-social-form-title">
        <div className="storefront-step-intro storefront-step-intro-row">
          <div>
            <h3 id="storefront-social-form-title">Link your social channels</h3>
            <p>Add up to ten links. External links open in a new tab.</p>
          </div>
          <button
            type="button"
            className="dashboard-small-button"
            onClick={() => setPickerOpen(true)}
            disabled={disabled || links.length >= 10}
          >
            <Plus size={16} aria-hidden="true" /> Add social link
          </button>
        </div>
        {links.length ? (
          <div className="storefront-social-editor-list">
            {links.map((link, index) => (
              <div className="storefront-social-editor-row" key={link.id}>
                {link.platform === "Other" ? (
                  <input
                    className="storefront-social-name-input"
                    aria-label="Social channel name"
                    placeholder="Social channel name"
                    maxLength={40}
                    value={link.label}
                    disabled={disabled}
                    onChange={(event) => updateSocialLink(link.id, "label", event.target.value)}
                  />
                ) : null}
                <label className="storefront-social-link-field">
                  <span className="storefront-social-link-icon">
                    {link.platform === "Other"
                      ? <Link2 size={19} aria-hidden="true" />
                      : <SocialPlatformIcon platform={link.platform} />}
                  </span>
                  <input
                    type="url"
                    inputMode="url"
                    aria-label={`${link.platform === "Other" ? link.label || "Social" : link.platform} profile link`}
                    placeholder={socialUrlPrefix(link.platform) || "https://"}
                    value={link.url}
                    disabled={disabled}
                    onChange={(event) => updateSocialLink(link.id, "url", event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="dashboard-icon-button"
                  aria-label={`Remove social link ${index + 1}`}
                  onClick={() => onChange(links.filter((item) => item.id !== link.id))}
                  disabled={disabled}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="storefront-empty-editor">
            <p>No social links added yet. This section is optional.</p>
          </div>
        )}
      </section>
      {pickerOpen ? (
        <div
          className="storefront-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPickerOpen(false);
          }}
        >
          <section className="storefront-social-picker" role="dialog" aria-modal="true" aria-labelledby="storefront-social-picker-title">
            <div className="storefront-dialog-heading">
              <div>
                <span className="dashboard-card-label">Social links</span>
                <h2 id="storefront-social-picker-title">Choose a social channel</h2>
              </div>
              <button type="button" className="dashboard-icon-button" onClick={() => setPickerOpen(false)} aria-label="Close social channel picker">×</button>
            </div>
            <div className="storefront-social-picker-options">
              {STOREFRONT_SOCIAL_PLATFORMS.map((platform) => (
                <button key={platform} type="button" onClick={() => addSocialLink(platform)}>
                  {platform === "Other"
                    ? <Link2 size={19} aria-hidden="true" />
                    : <SocialPlatformIcon platform={platform} />}
                  <span>{platform}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
