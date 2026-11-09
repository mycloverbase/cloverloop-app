export type SocialLink = {
  label: string;
  url: string;
};

export type CreatorProfile = {
  user_id: string;
  display_name: string;
  username: string | null;
  bio: string;
  location: string | null;
  contact_number: string | null;
  social_links: SocialLink[];
  avatar_path: string | null;
  product_announcements: boolean;
  marketing_emails: boolean;
  marketing_consent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatorPlanKey = "free" | "creator" | "pro_creator";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };
