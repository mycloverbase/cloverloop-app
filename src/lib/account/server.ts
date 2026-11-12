import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import type { CreatorProfile, SocialLink } from "@/lib/account/types";

type AccountSupabaseClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseSocialLinks(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.label !== "string" || typeof entry.url !== "string") {
      return [];
    }
    return [{ label: entry.label, url: entry.url }];
  });
}

function parseProfile(value: unknown): CreatorProfile {
  if (!isRecord(value) || typeof value.user_id !== "string") {
    throw new Error("The creator profile returned by Supabase is invalid.");
  }
  return {
    user_id: value.user_id,
    display_name: textOr(value.display_name, ""),
    username: nullableText(value.username),
    bio: textOr(value.bio, ""),
    location: nullableText(value.location),
    contact_number: nullableText(value.contact_number),
    social_links: parseSocialLinks(value.social_links),
    avatar_path: nullableText(value.avatar_path),
    product_announcements: value.product_announcements !== false,
    marketing_emails: value.marketing_emails === true,
    marketing_consent_at: nullableText(value.marketing_consent_at),
    created_at: textOr(value.created_at, ""),
    updated_at: textOr(value.updated_at, ""),
  };
}

function metadataString(user: User, keys: string[]): string | null {
  for (const key of keys) {
    const value = user.user_metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function getCreatorName(displayName: string, email: string): string {
  return displayName.trim() || email.split("@")[0]?.trim() || "Creator";
}

function validUsername(value: string | null): string | null {
  if (!value) return null;
  const username = value.toLowerCase();
  return username.length >= 3 &&
    username.length <= 30 &&
    /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/.test(username)
    ? username
    : null;
}

async function loadProfile(client: AccountSupabaseClient, userId: string): Promise<CreatorProfile | null> {
  const { data, error } = await client
    .from("creator_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Could not load creator profile.", error);
    throw new Error("Your creator profile could not be loaded. Please try again.");
  }
  return data ? parseProfile(data) : null;
}

export async function ensureCreatorProfile(
  client: AccountSupabaseClient,
  user: User,
): Promise<CreatorProfile> {
  const existing = await loadProfile(client, user.id);
  if (existing) return existing;

  const metadataName = metadataString(user, ["display_name", "full_name", "name"]);
  const displayName = (metadataName ?? user.email?.split("@")[0] ?? "Creator").slice(0, 80);
  const username = validUsername(metadataString(user, ["storefront_username", "username"]));
  const seed = {
    user_id: user.id,
    display_name: displayName,
    username,
    ...(typeof user.user_metadata?.marketing_emails === "boolean"
      ? {
          marketing_emails: user.user_metadata.marketing_emails,
          marketing_consent_at:
            typeof user.user_metadata.marketing_consent_at === "string"
              ? user.user_metadata.marketing_consent_at
              : null,
        }
      : {}),
  };

  const { error: insertError } = await client.from("creator_profiles").insert(seed);
  if (insertError && insertError.code === "23505" && username) {
    const { error: retryError } = await client.from("creator_profiles").insert({
      ...seed,
      username: null,
    });
    if (retryError && retryError.code !== "23505") {
      console.error("Could not create creator profile.", retryError);
      throw new Error("Your creator profile could not be created. Please try again.");
    }
  } else if (insertError && insertError.code !== "23505") {
    console.error("Could not create creator profile.", insertError);
    throw new Error("Your creator profile could not be created. Please try again.");
  }

  const created = await loadProfile(client, user.id);
  if (!created) throw new Error("Your creator profile could not be created. Please try again.");
  return created;
}

export async function requireCreatorContext() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=configuration");

  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fdashboard");
  if (error) {
    console.error("Could not verify the creator session.", error);
    throw new Error("Your session could not be verified. Please sign in again.");
  }
  if (!(await creatorAgreementIsAccepted(supabase))) {
    redirect("/creator-agreement/accept?next=%2Fdashboard");
  }

  const profile = await ensureCreatorProfile(supabase, user);
  return { supabase, user, profile };
}

export async function getAvatarSignedUrl(
  client: AccountSupabaseClient,
  avatarPath: string | null,
): Promise<string | null> {
  if (!avatarPath) return null;
  const { data, error } = await client.storage
    .from("creator-avatars")
    .createSignedUrl(avatarPath, 60 * 60 * 12);
  if (error) {
    console.error("Could not create a signed avatar URL.", error);
    return null;
  }
  return data.signedUrl;
}
