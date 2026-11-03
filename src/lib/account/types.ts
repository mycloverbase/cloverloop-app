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
  instagram_url: string | null;
  youtube_url: string | null;
  website_url: string | null;
  social_links: SocialLink[];
  avatar_path: string | null;
  product_announcements: boolean;
  marketing_emails: boolean;
  created_at: string;
  updated_at: string;
};

export type CreatorPlanKey = "free" | "creator" | "pro_creator";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };
