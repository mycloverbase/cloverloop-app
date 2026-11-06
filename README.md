# CloverLoop

CloverLoop is a creator-focused website with Supabase authentication and creator storefront setup and publishing. Storefronts support branding, public profile sections and non-purchasable sample product cards; the app does not implement checkout, payment processing, product management or digital delivery.

Production domain: **https://cloverloop.in**

## Requirements

- Node.js 20.9 or later
- npm
- A Supabase project for account authentication

## Local setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set the required Supabase variables. For local work, use:

   ```dotenv
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SUPABASE_SERVICE_ROLE_KEY
   ```

   Change `NEXT_PUBLIC_SITE_URL` from `https://cloverloop.in` to `http://localhost:3000` for local authentication redirects.

3. Configure the Supabase redirect URLs as described in [Supabase and Google OAuth setup](#supabase-and-google-oauth-setup).

4. Start the development server:

   ```sh
   npm run dev
   ```

5. Run checks and create a production build:

   ```sh
   npm run typecheck
   npm run lint
   npm run build
   ```

The Supabase URL and public anon/publishable key are required to use email or Google authentication. Storefront image uploads and launch-checklist marketing opt-ins require `SUPABASE_SERVICE_ROLE_KEY` on the server. It is read only by server-only modules; never prefix it with `NEXT_PUBLIC_` or expose it in browser code.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Yes for authentication redirects | Local URL during development (`http://localhost:3000`); production origin is `https://cloverloop.in`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes for authentication | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes for authentication | Supabase public anon/publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | For storefront image uploads and checklist opt-ins | Server-only Supabase service-role key used for image uploads and writing consented emails to `email_subscriptions`. Never expose it to client code. |
| `NEXT_PUBLIC_FOUNDING_CREATOR_FORM_URL` | For the dashboard programme CTA | External Google Form URL. It is intentionally not hardcoded. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Before launch | Confirmed CloverLoop support address. The Contact page shows a setup notice until provided. |
| `RESEND_API_KEY` | For the launch checklist | Server-only Resend API key used to email the branded launch checklist and PDF attachment. |
| `RESEND_FROM_EMAIL` | For the launch checklist | Verified sender address for checklist email. |

The launch-checklist email uses the branded HTML in `src/lib/launch-checklist-email.ts`. Its PDF attachment is `public/downloads/cloverloop-link-in-bio-launch-checklist.pdf`, also served as the fallback download link.

The launch-checklist form continues to use Resend for delivery. When a visitor separately opts in to updates, their email and consent timestamp are stored in the private Supabase `email_subscriptions` table. Apply the migration in `supabase/migrations` before enabling this opt-in.

Set the same environment variables in the Vercel project. Keep `.env.local` private; it is ignored by Git.

## Supabase and Google OAuth setup

### Supabase authentication URLs

In the Supabase dashboard, open **Authentication → URL Configuration**:

- Set the local development Site URL to `http://localhost:3000`.
- For production, set the Site URL to `https://cloverloop.in`.
- Add these redirect URLs to the allow list:
  - `http://localhost:3000/auth/callback`
  - `https://cloverloop.in/auth/callback`
- If Vercel preview deployments need authentication, add the exact preview callback URLs you use. Do not make redirect allow-list entries broader than necessary.

The application returns OAuth and email-authentication callbacks to `/auth/callback`. The callback exchanges the one-time authorization code for a Supabase session and only accepts a local, relative `next` destination.

### Email and password

Enable the Email provider in **Authentication → Providers**. Configure email confirmation according to the launch policy. When confirmation is enabled, new users receive a confirmation message and continue to `/dashboard` after completing the callback. Configure the authentication email templates in Supabase. The separate launch-checklist form uses Resend for delivery and Supabase for its optional marketing opt-ins.

Password reset requests return to `/auth/callback?next=/forgot-password`. Supabase must allow the callback URL above. The reset page accepts a new password only after the recovery callback has established a session.

### Google OAuth

1. In Google Cloud Console, create an OAuth 2.0 **Web application** client.
2. Add the relevant application origins to **Authorized JavaScript origins**:
   - `http://localhost:3000`
   - `https://cloverloop.in`
3. Add the Supabase OAuth callback shown in the Supabase Google provider setup to **Authorized redirect URIs**. It has this form:
   - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. In Supabase, enable **Authentication → Providers → Google** and paste the Google client ID and client secret there.
5. Ensure the Supabase redirect allow list includes the CloverLoop `/auth/callback` URLs above.

Google credentials belong in the Supabase provider configuration; do not put a Google client secret in a `NEXT_PUBLIC_*` environment variable.

## Creator storefront setup

The storefront feature adds one public page per creator at `https://cloverloop.in/{username}`. It uses a private `storefront-assets` Supabase Storage bucket; uploaded JPG, PNG and WebP files are cropped and optimized to WebP by the authenticated server action. The service-role key is used only by the Supabase Edge Function and must never be added to Vercel or `.env.local`.

Apply the database migration with the Supabase CLI after linking the project:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migration creates the storefront tables, RLS policies, private storage bucket, username redirect mapping and a daily `pg_cron` job. Permanent deletion and cleanup of replaced or abandoned images are processed by `supabase/functions/purge-storefronts/index.ts`. Deploy the function and configure its shared secret before applying the migration:

1. Generate a high-entropy secret and set it for the Edge Function:

   ```sh
   supabase secrets set STOREFRONT_PURGE_SECRET=YOUR_RANDOM_SECRET
   supabase functions deploy purge-storefronts
   ```

2. In the Supabase SQL Editor, store the project URL and the same secret in Vault before running `supabase db push`:

   ```sql
   select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'supabase_url');
   select vault.create_secret('YOUR_RANDOM_SECRET', 'storefront_purge_secret');
   ```

   The scheduled job runs daily at 03:15 UTC. It hard-deletes storefronts after their 30-day deletion period, releasing usernames only after their assets have been removed. It also removes unreferenced uploads older than 24 hours. Monitor Supabase Edge Function and `pg_cron` logs for failures.

No additional Next.js environment variable is required. The public site only needs the existing Supabase URL and anon/publishable key. Storefront publish, edit, unpublish and delete actions do not send email notifications.
Account deletion is blocked until a scheduled storefront deletion has completed, so the 30-day retention and username reservation cannot be bypassed.

## Routes

### Public

- `/`
- `/{username}` for a published creator storefront
- `/sell-online`
- `/sell-digital-downloads`
- `/courses`
- `/store-builder`
- `/payment-gateways`
- `/pricing`
- `/founding-creators`
- `/about`
- `/help-center`
- `/contact`
- `/faq`
- `/terms`
- `/privacy`
- `/reviews`
- `/sitemap`
- `/partner-program`
- `/resources`
- `/resources/marketing-ideas-tool`
- `/resources/how-to-write-an-ebook`
- `/resources/how-to-sell-presets`
- `/resources/how-to-sell-printables`
- `/resources/how-to-sell-ebooks`
- `/resources/how-to-sell-canva-templates`
- `/resources/online-course-ideas`
- `/resources/content-creator`
- `/resources/digital-products`
- `/resources/how-to-sell-digital-products-online`
- `/resources/how-to-price-digital-products`
- `/resources/how-to-sell-templates-online`
- `/resources/accept-upi-payments-digital-products-razorpay`
- `/resources/do-you-need-gst-registration-to-sell-online`
- `/resources/how-many-sales-to-hit-your-income-goal`
- `/resources/how-to-create-and-sell-online-course-india`
- `/resources/gst-on-ebooks-and-online-courses-india`

### Authentication

- `/login`
- `/signup`
- `/forgot-password`
- `/auth/callback`
- `/dashboard`
- `/dashboard/storefront`

Login, signup, password reset, auth callback and dashboard responses are noindex. The dashboard route is protected by Supabase session verification and redirects unauthenticated visitors to `/login`.

## Content and assets

- Educational article bodies, metadata and canonical URLs are stored as structured JSON in `content/resources/`. The eight new guide drafts use the supplied CloverLoop Content Guides document; existing articles also draw on `image assets/CloverLoop_Content_and_SEO_Master_Document.docx`.
- To refresh the existing articles imported from the master document, run `powershell -ExecutionPolicy Bypass -File tools/import-content.ps1`. The eight newer guide drafts are maintained in their JSON files and are not imported by that script.
- The tool page and Resource Hub are implemented with reusable templates and source copy in `src/app/resources/`.
- The Marketing Ideas Tool is a local, predefined generator; it does not use an AI API.
- `content/asset-inventory.json` records dimensions, alpha channel, source file sizes and usage for every supplied asset. Original source files remain in `image assets/`.
- Raster illustrations in `public/images/home/` and `public/images/resources/` are optimized WebP copies. The supplied logo and favicon source PNGs are kept intact.
- To regenerate optimized WebP copies from the supplied images, copy the originals into their mapped `public/images/` folders and run `npm run optimize:assets`. The optimizer corrects the storefront URL in the homepage hero image. An illustration containing a legacy URL and unsupported payment/dashboard UI is deliberately excluded from the public site.

All article reading-time estimates are calculated from the actual words rendered from their article blocks. No author or publication date is emitted because none was approved in the supplied editorial source.

## Analytics and cookie consent

Google Tag Manager container `GTM-K4BMMLN3` loads once from the root layout on every route with Google Consent Mode defaults denied. GA4 is not installed separately by the app; configure it in GTM with a Google Tag ID of `G-PS230HQXZY` and require `analytics_storage` consent. Disable the Google Tag's automatic `page_view` (`send_page_view: false`), then send one GA4 `page_view` event from the app's custom `page_view` data-layer event, mapping `page_path` as an event parameter. Do not also use a History Change trigger for page views. The app emits one custom page-view event per route after consent is granted, including the current page when consent is first accepted. Rejecting stores that choice locally, keeps consent denied and pushes no custom events. Other tracked events include navigation, pricing visits and CTAs, signup/login outcomes, Google OAuth initiation, resource views and the authenticated programme CTA. Authentication credentials and tokens are never included in analytics payloads.

## Production and Vercel deployment

1. Push the project to a Git provider and import it into Vercel.
2. Select the Next.js framework preset and keep the standard build command `npm run build`.
3. Configure the production environment variables in Vercel. Set `NEXT_PUBLIC_SITE_URL=https://cloverloop.in`.
4. Add `cloverloop.in` to the Vercel project domains and follow Vercel's DNS instructions. Configure the `www` hostname only if you intend to redirect it to the canonical production domain.
5. Add `https://cloverloop.in/auth/callback` to the Supabase redirect allow list and set the Supabase production Site URL to `https://cloverloop.in`.
6. Configure Google OAuth's authorized origin and Supabase callback as described above.
7. Set the confirmed support email and external Founding Creator form URL before launch.
8. Configure and publish the GTM Google Tag and `page_view` event tag for `G-PS230HQXZY`; test consent and page views with Tag Assistant before validating GA4 Realtime.
9. Run `npm run typecheck`, `npm run lint` and `npm run build`, then deploy.
10. After launch, submit `https://cloverloop.in/sitemap.xml` to Google Search Console.

The sitemap uses the production canonical origin and excludes authentication, utility, and unreviewed legal-draft routes. `robots.txt` references the production sitemap. The Terms and Privacy pages are marked as drafts and must receive qualified legal review before publication.

## Product scope and launch configuration

Storefronts are presentation-only. Sample product cards are marked “Coming Soon” and cannot be opened or purchased. The app does **not** implement checkout, Razorpay connectivity, payment verification, digital file delivery, earnings, sales analytics, subscriptions, monthly commission invoicing, or order management. Marketing copy describes these as intended architecture and planned capabilities rather than live integrations.

Before launch, configure Supabase and Google OAuth, confirm the support email and programme form, and obtain legal review of the Terms and Privacy drafts. Pricing is presented as the agreed intended pricing model; subscriptions and payment processing are not operational in this implementation.
