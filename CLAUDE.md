# CloverLoop — CLAUDE.md

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.4.6 — App Router, Server Actions |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database / Auth / Storage | Supabase (Postgres, Row-Level Security, Storage buckets) |
| Edge Functions | Supabase Edge Functions (`supabase/functions/`) |
| Payments | Razorpay (checkout, webhooks, OAuth for creator accounts) |
| Email | Resend (transactional; via `src/lib/resend/`) |
| Icons | Lucide React |
| Analytics | Vercel Analytics + Google Tag Manager |
| Testing | Vitest (`tests/**/*.test.ts`) |
| Deployment | Vercel (`vercel.json`) |
| Image optimisation | Sharp + Next.js AVIF/WebP pipeline |

## Key folders

```
src/
  app/
    (auth)/            # Login / signup pages
    [slug]/            # Creator storefront public pages (cloverloop.in/:username)
    api/               # Next.js route handlers
      checkout/        # Razorpay checkout initiation
      reviews/         # Buyer review token lookup and submission
      razorpay/        # OAuth & webhook endpoints
      webhooks/        # Supabase / Resend webhooks
      cron/            # Scheduled jobs
    dashboard/         # Creator dashboard (requires auth)
      admin/           # Admin-only panel
      storefront/      # Publish / manage storefront
      products/        # Product CRUD
      razorpay/        # Connect Razorpay account
      reviews/         # Creator review list and reporting
    storefront-preview/  # Unauthenticated storefront preview
    blog/ guides/ resources/ compare/  # SEO content pages
  components/
    dashboard/         # Dashboard UI components
    storefront/        # Public storefront UI
    onboarding/        # Onboarding flow components
  lib/
    supabase/          # Supabase client helpers (client|server|admin|public).ts
    razorpay/          # Checkout, OAuth, webhook fulfilment, emails
    storefront/        # Storefront business logic + product uploads
    dashboard/         # Admin & sales overview queries
    resend/            # Email webhook signature
    account/           # Account-level utilities
    site.ts            # Shared site constants, page copy, FAQ data
supabase/
  migrations/          # Postgres migrations (run via Supabase CLI)
  functions/           # Edge Functions (Deno)
tests/                 # Vitest unit + integration tests
content/               # Markdown blog / guide source files
tools/                 # Node scripts (asset optimiser)
public/                # Static assets (images, downloads)
```

## Environment variables

Required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Razorpay, Resend, and other secrets are added as needed for the features under test.

## Commands

```bash
npm run dev          # Start local dev server (Next.js fast refresh)
npm run build        # Production build
npm start            # Serve production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit (no emit, type-check only)
npm test             # Vitest unit + integration tests
npm run optimize:assets  # Compress/convert images in public/
```

## Routing conventions

- **`src/app/[slug]/`** — public creator storefront; `:slug` is the creator's chosen username.
- **`src/app/dashboard/`** — authenticated area; protected by Supabase session middleware (`src/proxy.ts`).
- **Server Actions** live in `actions.ts` files co-located with their route segment.
- **API routes** (`route.ts`) are used for Razorpay webhooks, OAuth callbacks, and cron handlers that must run outside the React render cycle.

## Supabase clients

Four helpers in `src/lib/supabase/`:

| File | Use |
|---|---|
| `client.ts` | Browser-side (React components) |
| `server.ts` | Server Components, Server Actions |
| `admin.ts` | Service-role operations (admin routes, cron) |
| `public.ts` | Unauthenticated reads (storefronts, public pages) |

## Styling

- `src/app/globals.css` is the large legacy stylesheet. `src/app/platform-polish.css` (imported right after it in the root layout) is the consistency layer for dashboard, auth and buyer pages.
- `src/app/home.css` styles the homepage only (scoped under `.home`).
- `src/components/storefront/storefront-themes.css` holds the public storefront themes (minimal, editorial, bold). Selectors start with `main.storefront-shell` / `main.storefront-theme-*` so they win over legacy rules. Editor previews render the real `PublicStorefront` in an iframe with copied styles, so previews always match.
- Stores without a banner use `DEFAULT_STOREFRONT_BANNER_URL` (`public/images/storefront/default-banner.webp`), tinted to the store's accent colour.

## Development previews

Dev-only pages (404 outside `next dev`) render real components with sample data — useful because the dashboard needs auth against a remote Supabase project:

- `/dev/storefront-themes?theme=minimal|editorial|bold&palette=default|plum|clay|ink|mono&view=product&banner=custom&avatar=none&products=none&reviews=none`
- `/dev/dashboard-preview?page=overview|storefront|products|reviews|profile|settings|help|instagram&state=empty`

## Product reviews

Verified-buyer reviews with automated invitations 5 days after payment. Schema, RLS and all eligibility rules live in `supabase/migrations/20261128120000_product_reviews.sql`; app code is in `src/lib/reviews/`, `src/components/reviews/` and `/api/reviews/*`. Deployment, env vars (`REVIEW_TOKEN_SECRET`, `REVIEW_INVITATIONS_ENABLED`, `REVIEW_INVITATION_BATCH_SIZE`) and the test checklist are in `PRODUCT_REVIEWS_DEPLOYMENT.md`.

## Notes

- **Next.js version** — this project runs Next.js **16**, which has breaking changes from earlier versions. Read `node_modules/next/dist/docs/` before modifying framework-level config (see `AGENTS.md`).
- **Server Actions body limit** — set to `11 MB` in `next.config.ts` to support product file uploads.
- **Razorpay OAuth** — creators connect their own Razorpay account; payments flow directly to them. See `src/lib/razorpay/oauth.ts`.
- **Reserved usernames** — `src/lib/storefront/reserved-usernames.ts` blocks slug conflicts with app routes.
- **Tests** — integration tests that touch Supabase are in `*.integration.test.ts`; they expect a local Supabase stack or suitable test credentials.
