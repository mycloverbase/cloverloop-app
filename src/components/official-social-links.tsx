import { SocialPlatformIcon } from "@/components/storefront/social-platform-icon";

const profiles = [
  {
    platform: "Instagram",
    key: "NEXT_PUBLIC_CLOVERLOOP_INSTAGRAM_URL",
    host: "instagram.com",
    defaultUrl: "https://www.instagram.com/cloverloop.in",
  },
  {
    platform: "YouTube",
    key: "NEXT_PUBLIC_CLOVERLOOP_YOUTUBE_URL",
    host: "youtube.com",
    defaultUrl: "https://www.youtube.com/@cloverloopin",
  },
  {
    platform: "Facebook",
    key: "NEXT_PUBLIC_CLOVERLOOP_FACEBOOK_URL",
    host: "facebook.com",
    defaultUrl: "https://www.facebook.com/profile.php?id=61596271502595",
  },
  {
    platform: "Threads",
    key: "NEXT_PUBLIC_CLOVERLOOP_THREADS_URL",
    host: "threads.net",
    defaultUrl: "https://www.threads.net/@cloverloop.in",
  },
  {
    platform: "LinkedIn",
    key: "NEXT_PUBLIC_CLOVERLOOP_LINKEDIN_URL",
    host: "linkedin.com",
    defaultUrl: "https://www.linkedin.com/company/cloverloop",
  },
  {
    platform: "X",
    key: "NEXT_PUBLIC_CLOVERLOOP_X_URL",
    host: "x.com",
    defaultUrl: "https://x.com/cloverloopin",
  },
  {
    platform: "TikTok",
    key: "NEXT_PUBLIC_CLOVERLOOP_TIKTOK_URL",
    host: "tiktok.com",
  },
] as const;

function getConfiguredProfiles() {
  return profiles.flatMap((profile) => {
    const rawUrl = process.env[profile.key]?.trim()
      || ("defaultUrl" in profile ? profile.defaultUrl : undefined);
    if (!rawUrl) return [];

    try {
      const url = new URL(rawUrl);
      if (
        url.protocol !== "https:" ||
        (url.hostname !== profile.host && !url.hostname.endsWith(`.${profile.host}`)) ||
        url.username ||
        url.password
      ) {
        console.error("An official CloverLoop social URL has an unexpected destination.", {
          platform: profile.platform,
        });
        return [];
      }
      return [{ platform: profile.platform, url: url.toString() }];
    } catch (error) {
      console.error("An official CloverLoop social URL is invalid.", {
        platform: profile.platform,
        error,
      });
      return [];
    }
  });
}

export function OfficialSocialLinks() {
  const links = getConfiguredProfiles();

  return (
    <section className="contact-social-section" aria-labelledby="contact-social-title">
      <h2 id="contact-social-title">Follow CloverLoop</h2>
      {links.length ? (
        <nav className="storefront-profile-socials" aria-label="CloverLoop social media">
          {links.map(({ platform, url }) => (
            <a
              className="storefront-profile-social-link"
              href={url}
              key={platform}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`CloverLoop on ${platform}`}
              title={`CloverLoop on ${platform}`}
            >
              <SocialPlatformIcon platform={platform} monochrome />
            </a>
          ))}
        </nav>
      ) : (
        <p className="contact-social-missing">
          CloverLoop&apos;s official social media URLs have not been configured yet.
        </p>
      )}
    </section>
  );
}
