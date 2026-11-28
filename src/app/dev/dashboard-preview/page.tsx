import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import sharp from "sharp";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { PaymentSetupWarning } from "@/components/dashboard/payment-setup-warning";
import { ProfileEditor } from "@/components/dashboard/profile-editor";
import { RazorpayConnectionCard } from "@/components/dashboard/razorpay-connection-card";
import {
  AccountBasicsForm,
  AccountDeletionForm,
  NotificationPreferencesForm,
  PasswordChangeForm,
} from "@/components/dashboard/settings-forms";
import { ProductManager } from "@/components/storefront/product-manager";
import { StorefrontEditor } from "@/components/storefront/storefront-editor";
import DashboardHelpPage from "@/app/dashboard/help/page";
import { InstagramAutomations } from "@/components/dashboard/instagram-automations";
import { CreatorReviews } from "@/components/reviews/creator-reviews";
import type { CreatorProfile } from "@/lib/account/types";
import type { CreatorEntitlements } from "@/lib/account/entitlements";
import { PRODUCT_SUBCATEGORIES } from "@/lib/storefront/product-categories";
import { getRazorpayApplicationReadiness } from "@/lib/razorpay/oauth";
import {
  DEFAULT_STOREFRONT_CUSTOMIZATION,
  type CreatorStorefrontProduct,
  type StorefrontDisplay,
} from "@/lib/storefront/types";

export const metadata = {
  title: "Dashboard preview | CloverLoop",
  robots: { index: false, follow: false },
};

const now = "2026-11-20T10:00:00.000Z";

const profile: CreatorProfile = {
  user_id: "preview-user",
  display_name: "Aanya Mehra",
  username: "aanya",
  bio: "Illustrator and art educator from Pune making practical workbooks and templates.",
  location: "Pune",
  contact_number: null,
  social_links: [{ label: "Instagram", url: "https://instagram.com" }],
  avatar_path: "preview",
  product_announcements: true,
  marketing_emails: false,
  marketing_consent_at: null,
  created_at: now,
  updated_at: now,
};

const entitlements: CreatorEntitlements = {
  plan: "creator",
  monthlyPricePaise: 0,
  platformFeePercentage: 4,
  paidProductLimit: null,
  freeProductLimit: null,
  cumulativeGrossSalesLimitPaise: null,
  founderAllocationNumber: null,
  founderActivatedAt: null,
  founderExpiresAt: null,
  founderStatus: null,
  subscriptionStatus: null,
  nextBillingAt: null,
};

const sampleProducts: CreatorStorefrontProduct[] = [
  ["p1", "Sketch Daily: 30-Day Drawing Workbook", "Education & Learning", "Worksheets", 49900, "/images/resources/how-to-write-an-ebook.webp", true],
  ["p2", "Monsoon Light Lightroom Presets", "Design & Creativity", "Presets", 29900, "/images/resources/how-to-sell-presets.webp", true],
  ["p3", "Brand Kit Templates", "Design & Creativity", "Templates", 79900, "/images/resources/how-to-sell-canva-templates.webp", false],
  ["p4", "Weekly Creative Planner", "Productivity", "Planners", 0, "/images/resources/how-to-sell-printables.webp", true],
].map(([id, name, category, subcategory, pricePaise, coverImageUrl, isActive]) => ({
  id: id as string,
  name: name as string,
  description: "A practical digital product with clear instructions and an instant download.",
  category: category as string,
  subcategory: subcategory as string,
  productType: "digital" as const,
  isFree: pricePaise === 0,
  pricePaise: pricePaise as number,
  coverImageUrl: coverImageUrl as string,
  storefrontId: "preview-store",
  coverImagePath: "preview",
  isActive: isActive as boolean,
  fileName: "product.pdf",
  fileSize: 4_200_000,
  fileMimeType: "application/pdf",
  firstListedAt: now,
  countedAsFree: pricePaise === 0,
  countedAsPaid: pricePaise !== 0,
  createdAt: now,
}));

async function sampleAvatar() {
  const source = await readFile(path.join(process.cwd(), "public/images/home/creator-community.webp"));
  const buffer = await sharp(source).extract({ left: 560, top: 190, width: 200, height: 200 }).resize(240, 240).webp().toBuffer();
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

export default async function DashboardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const page = query.page ?? "overview";
  const empty = query.state === "empty";
  const avatarUrl = await sampleAvatar();
  const products = empty ? [] : sampleProducts;

  const storefront: StorefrontDisplay | null = empty ? null : {
    id: "preview-store",
    user_id: "preview-user",
    store_name: "Aanya Mehra",
    username: "aanya",
    description: "Illustrator and art educator from Pune. I make practical workbooks, presets and templates.",
    profile_image_path: "preview",
    banner_image_path: null,
    theme: (query.theme as StorefrontDisplay["theme"]) ?? "minimal",
    customization: { ...DEFAULT_STOREFRONT_CUSTOMIZATION, products: [] },
    status: "draft",
    published_at: null,
    unpublished_at: null,
    deleted_at: null,
    delete_after: null,
    created_at: now,
    updated_at: now,
    profileImageUrl: avatarUrl,
    bannerImageUrl: null,
    products,
  };

  let content: React.ReactNode;
  if (page === "storefront") {
    content = (
      <div className="dashboard-page-content">
        <PaymentSetupWarning />
        <StorefrontEditor initialStorefront={storefront} />
      </div>
    );
  } else if (page === "products") {
    content = (
      <div className="dashboard-page-content">
        <ProductManager
          storefrontId={storefront?.id ?? null}
          storefrontUsername={storefront?.username ?? null}
          storefrontStatus={storefront?.status ?? null}
          initialProducts={products}
          subcategoryOptions={Object.entries(PRODUCT_SUBCATEGORIES).flatMap(([category, names]) =>
            names.map((name) => ({ category, name })),
          )}
          paidProductLimit={null}
          freeProductLimit={null}
          initialFreeListingCount={1}
          initialPaidListingCount={3}
        />
      </div>
    );
  } else if (page === "profile") {
    content = (
      <div className="dashboard-page-content">
        <header className="dashboard-page-heading">
          <div>
            <span className="eyebrow">Creator account</span>
            <h1>My Profile</h1>
            <p>Manage your creator identity, profile picture and social links.</p>
          </div>
        </header>
        <ProfileEditor profile={profile} avatarUrl={avatarUrl} />
      </div>
    );
  } else if (page === "settings") {
    content = (
      <div className="dashboard-page-content">
        <header className="dashboard-page-heading">
          <div>
            <span className="eyebrow">Account</span>
            <h1>Settings</h1>
            <p>Manage your account details, sign-in security and communication preferences.</p>
          </div>
        </header>
        <div className="dashboard-stack">
          <RazorpayConnectionCard
            readiness={getRazorpayApplicationReadiness("FOUR_PERCENT")}
            connection={null}
            applicationKey="FOUR_PERCENT"
            creatorEmail="aanya@example.com"
            initialBusinessName="Aanya Mehra"
            statusMessage={undefined}
            statusServiceAvailable
          />
          <AccountBasicsForm email="aanya@example.com" />
          <PasswordChangeForm email="aanya@example.com" providers={["email"]} />
          <NotificationPreferencesForm profile={profile} />
          <AccountDeletionForm />
        </div>
      </div>
    );
  } else if (page === "reviews") {
    content = (
      <CreatorReviews
        reviews={empty ? [] : [
          ["Priya S.", 5, "Exactly what I needed to get back into a daily drawing habit.", "p1", null],
          ["Rohan K.", 4, "Clear and practical. Would love a second volume.", "p1", null],
          ["Spam Account", 1, "Visit my site for cheap presets!!!", "p2", "open"],
          ["Meera", 5, "", "p2", null],
        ].map(([reviewerName, rating, body, productId, reportStatus], index) => ({
          id: `review-${index}`,
          productId: productId as string,
          productName: productId === "p1" ? "Sketch Daily: 30-Day Drawing Workbook" : "Monsoon Light Lightroom Presets",
          productUrl: `/aanya/product/${productId}`,
          reviewerName: reviewerName as string,
          rating: rating as number,
          body: body as string,
          status: "published" as const,
          submittedAt: new Date(Date.UTC(2026, 10, 24 - index * 2)).toISOString(),
          reportStatus: reportStatus as "open" | null,
        }))}
      />
    );
  } else if (page === "help") {
    content = <DashboardHelpPage />;
  } else if (page === "instagram") {
    content = <InstagramAutomations oauthResult={null} />;
  } else {
    content = (
      <DashboardOverview
        name="Aanya Mehra"
        avatarUrl={avatarUrl}
        storefront={storefront ? { status: storefront.status, username: storefront.username } : null}
        razorpayNeedsAttention={false}
        showOnboardingCard={!empty}
        onboardingCompletedCount={empty ? 0 : 4}
        salesPeriod="last_28_days"
        salesOverview={empty ? { revenue: "₹0.00", sales: "0" } : { revenue: "₹12,480.00", sales: "26" }}
        entitlements={entitlements}
        profileUsername="aanya"
        profileBio={profile.bio}
        productCount={products.length}
        usernameMessage=""
        reviewSummary={empty ? { count: 0, average: null } : { count: 12, average: 4.6 }}
        checklist={[
          { label: "Add your display name", complete: true },
          { label: "Choose a unique username", complete: true },
          { label: "Write a short bio", complete: true },
          { label: "Upload a profile picture", complete: !empty },
          { label: "Add a website or social link", complete: false },
        ]}
      />
    );
  }

  return (
    <DashboardShell creatorName="Aanya Mehra" email="aanya@example.com" avatarUrl={avatarUrl} isAdmin={false}>
      {content}
    </DashboardShell>
  );
}
