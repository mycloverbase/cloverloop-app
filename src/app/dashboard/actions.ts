"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult, SocialLink } from "@/lib/account/types";

type AuthenticatedClient =
  | { ok: true; supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>; userId: string }
  | { ok: false; result: ActionResult };

async function getAuthenticatedClient(): Promise<AuthenticatedClient> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, result: { ok: false, message: "Account services are not configured." } };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (error) console.error("Could not verify an account action.", error);
    return { ok: false, result: { ok: false, message: "Please sign in again to continue." } };
  }
  return { ok: true, supabase, userId: user.id };
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

function optionalUrl(
  value: string,
  label: string,
  allowedHosts?: string[],
): Validation<string | null> {
  if (!value) return { ok: true, value: null };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: `Enter a valid ${label} URL starting with https://.` };
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    return { ok: false, message: `Enter a valid ${label} URL.` };
  }
  if (
    allowedHosts &&
    !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  ) {
    return { ok: false, message: `Use a URL hosted by ${allowedHosts.join(" or ")}.` };
  }
  return { ok: true, value: url.toString() };
}

function parseSocialLinks(value: string): Validation<SocialLink[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { ok: false, message: "Check the additional social links and try again." };
  }
  if (!Array.isArray(parsed) || parsed.length > 5) {
    return { ok: false, message: "Add no more than five additional social links." };
  }
  const links: SocialLink[] = [];
  for (const entry of parsed) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("label" in entry) ||
      !("url" in entry) ||
      typeof entry.label !== "string" ||
      typeof entry.url !== "string"
    ) {
      return { ok: false, message: "Check the additional social links and try again." };
    }
    const label = entry.label.trim();
    const url = optionalUrl(entry.url.trim(), "social link");
    if (!label || label.length > 40 || !url.ok || !url.value) {
      return { ok: false, message: "Each additional social link needs a label and valid URL." };
    }
    links.push({ label, url: url.value });
  }
  return { ok: true, value: links };
}

function profileInput(formData: FormData) {
  const displayName = readText(formData, "display_name");
  const username = readText(formData, "username").toLowerCase();
  const bio = readText(formData, "bio");
  const location = readText(formData, "location");
  const contactNumber = readText(formData, "contact_number");
  if (!displayName || displayName.length > 80) {
    return { ok: false as const, message: "Display name is required and must be 80 characters or fewer." };
  }
  if (!/^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/.test(username)) {
    return { ok: false as const, message: "Username must be 3–30 characters using letters, numbers, underscores or hyphens." };
  }
  if (bio.length > 280) return { ok: false as const, message: "Bio must be 280 characters or fewer." };
  if (location.length > 80) return { ok: false as const, message: "Location must be 80 characters or fewer." };
  if (
    contactNumber &&
    (
      contactNumber.length > 24 ||
      !/^\+?[0-9][0-9\s().-]*$/.test(contactNumber) ||
      contactNumber.replace(/\D/g, "").length < 7 ||
      contactNumber.replace(/\D/g, "").length > 15
    )
  ) {
    return { ok: false as const, message: "Enter a valid contact number with 7–15 digits." };
  }

  const instagram = optionalUrl(readText(formData, "instagram_url"), "Instagram", ["instagram.com"]);
  const youtube = optionalUrl(readText(formData, "youtube_url"), "YouTube", ["youtube.com", "youtu.be"]);
  const website = optionalUrl(readText(formData, "website_url"), "website");
  const links = parseSocialLinks(readText(formData, "social_links") || "[]");
  if (!instagram.ok) return instagram;
  if (!youtube.ok) return youtube;
  if (!website.ok) return website;
  if (!links.ok) return links;

  return {
    ok: true as const,
    value: {
      display_name: displayName,
      username,
      bio,
      location: location || null,
      contact_number: contactNumber || null,
      instagram_url: instagram.value,
      youtube_url: youtube.value,
      website_url: website.value,
      social_links: links.value,
    },
  };
}

function usernameSaveResult(error: { code?: string } | null): ActionResult | null {
  if (!error) return null;
  if (error.code === "23505") {
    return { ok: false, message: "That username is already taken. Try another one." };
  }
  if (error.code === "23514") {
    return { ok: false, message: "Some profile details did not pass validation. Review them and try again." };
  }
  console.error("Could not save creator account data.", error);
  return { ok: false, message: "Your changes could not be saved. Please try again." };
}

export async function saveCreatorProfileAction(formData: FormData): Promise<ActionResult> {
  const parsed = profileInput(formData);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const auth = await getAuthenticatedClient();
  if (!auth.ok) return auth.result;

  const { error } = await auth.supabase.from("creator_profiles").upsert(
    { user_id: auth.userId, ...parsed.value },
    { onConflict: "user_id" },
  );
  const failure = usernameSaveResult(error);
  return failure ?? { ok: true, message: "Profile saved." };
}

export async function saveProfileBasicsAction(formData: FormData): Promise<ActionResult> {
  const displayName = readText(formData, "display_name");
  const username = readText(formData, "username").toLowerCase();
  if (!displayName || displayName.length > 80) {
    return { ok: false, message: "Display name is required and must be 80 characters or fewer." };
  }
  if (!/^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/.test(username)) {
    return { ok: false, message: "Username must be 3–30 characters using letters, numbers, underscores or hyphens." };
  }
  const auth = await getAuthenticatedClient();
  if (!auth.ok) return auth.result;

  const { data, error } = await auth.supabase
    .from("creator_profiles")
    .update({ display_name: displayName, username })
    .eq("user_id", auth.userId)
    .select("user_id")
    .maybeSingle();
  const failure = usernameSaveResult(error);
  if (!failure && !data) return { ok: false, message: "Your profile could not be found. Reload and try again." };
  return failure ?? { ok: true, message: "Account details saved." };
}

export async function saveNotificationPreferencesAction(formData: FormData): Promise<ActionResult> {
  const auth = await getAuthenticatedClient();
  if (!auth.ok) return auth.result;
  const { data, error } = await auth.supabase
    .from("creator_profiles")
    .update({
      product_announcements: formData.get("product_announcements") === "on",
      marketing_emails: formData.get("marketing_emails") === "on",
    })
    .eq("user_id", auth.userId)
    .select("user_id")
    .maybeSingle();
  if (error) {
    console.error("Could not save notification preferences.", error);
    return { ok: false, message: "Notification preferences could not be saved. Please try again." };
  }
  if (!data) return { ok: false, message: "Your profile could not be found. Reload and try again." };
  return { ok: true, message: "Notification preferences saved." };
}

export async function saveCreatorAvatarAction(avatarPath: string | null): Promise<ActionResult> {
  const auth = await getAuthenticatedClient();
  if (!auth.ok) return auth.result;
  if (
    avatarPath !== null &&
    (!avatarPath.startsWith(`${auth.userId}/`) ||
      avatarPath.includes("..") ||
      !/^[0-9a-f-]{36}\.webp$/i.test(avatarPath.slice(auth.userId.length + 1)))
  ) {
    return { ok: false, message: "That profile image could not be saved." };
  }
  const { data, error } = await auth.supabase
    .from("creator_profiles")
    .update({ avatar_path: avatarPath })
    .eq("user_id", auth.userId)
    .select("user_id")
    .maybeSingle();
  if (error) {
    console.error("Could not save the creator avatar path.", error);
    return { ok: false, message: "The profile image could not be saved. Please try again." };
  }
  if (!data) return { ok: false, message: "Your profile could not be found. Reload and try again." };
  return { ok: true, message: "Profile image updated." };
}

export async function submitCreatorFeedbackAction(formData: FormData): Promise<ActionResult> {
  const category = readText(formData, "category");
  const message = readText(formData, "message");
  if (!["general", "account", "product", "other"].includes(category)) {
    return { ok: false, message: "Choose a feedback topic." };
  }
  if (message.length < 10 || message.length > 2000) {
    return { ok: false, message: "Feedback must be between 10 and 2,000 characters." };
  }
  const auth = await getAuthenticatedClient();
  if (!auth.ok) return auth.result;
  const { error } = await auth.supabase.from("creator_feedback").insert({
    user_id: auth.userId,
    category,
    message,
  });
  if (error) {
    console.error("Could not submit creator feedback.", error);
    return { ok: false, message: "Your feedback could not be submitted. Please try again." };
  }
  return { ok: true, message: "Thank you. Your feedback has been submitted." };
}

export async function deleteCreatorAccountAction(confirmation: string): Promise<ActionResult> {
  if (confirmation !== "DELETE") {
    return { ok: false, message: "Type DELETE to confirm account deletion." };
  }
  const auth = await getAuthenticatedClient();
  if (!auth.ok) return auth.result;
  const { data: storefront, error: storefrontError } = await auth.supabase
    .from("creator_storefronts")
    .select("status")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (storefrontError) {
    console.error("Could not check the storefront before account deletion.", storefrontError);
    return { ok: false, message: "Your storefront status could not be checked. Please try again." };
  }
  if (storefront) {
    return {
      ok: false,
      message: "Schedule storefront deletion and wait until its 30-day deletion period is complete before deleting your account.",
    };
  }
  const { data: profile, error: profileError } = await auth.supabase
    .from("creator_profiles")
    .select("avatar_path")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError) {
    console.error("Could not load the profile before account deletion.", profileError);
    return { ok: false, message: "Account deletion could not be started. Please try again." };
  }
  if (profile?.avatar_path) {
    const { error: avatarError } = await auth.supabase.storage
      .from("creator-avatars")
      .remove([profile.avatar_path]);
    if (avatarError) {
      console.error("Could not remove the creator avatar before account deletion.", avatarError);
      return { ok: false, message: "Your profile image could not be removed. Account deletion was not completed." };
    }
  }
  const { error } = await auth.supabase.rpc("delete_my_account");
  if (error) {
    console.error("Could not delete the creator account.", error);
    return {
      ok: false,
      message: "Account deletion could not be completed. If you had a profile image, it may have been removed; please try again or contact support.",
    };
  }
  return { ok: true, message: "Your account has been deleted." };
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Account services are not configured.");
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Could not sign out: ${error.message}`);
  redirect("/login");
}
