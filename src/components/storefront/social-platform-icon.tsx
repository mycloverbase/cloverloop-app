import {
  siFacebook,
  siInstagram,
  siPinterest,
  siThreads,
  siTiktok,
  siTwitch,
  siX,
  siYoutube,
} from "simple-icons";
import { Link2 } from "lucide-react";

const icons = {
  facebook: siFacebook,
  instagram: siInstagram,
  pinterest: siPinterest,
  threads: siThreads,
  tiktok: siTiktok,
  twitch: siTwitch,
  x: siX,
  youtube: siYoutube,
};

export function SocialPlatformIcon({
  platform,
  monochrome = false,
}: {
  platform: string;
  monochrome?: boolean;
}) {
  const key = platform.toLowerCase();
  const icon = icons[key as keyof typeof icons];
  if (!icon && key === "linkedin") {
    return (
      <span
        className="storefront-linkedin-icon"
        aria-hidden="true"
        style={{ color: monochrome ? "currentColor" : "#0a66c2" }}
      >
        in
      </span>
    );
  }
  if (!icon) return <Link2 size={19} strokeWidth={2} aria-hidden="true" />;

  return (
    <svg
      aria-hidden="true"
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill={monochrome ? "currentColor" : `#${icon.hex}`}
      focusable="false"
    >
      <path d={icon.path} />
    </svg>
  );
}
