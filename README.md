# CloverLoop

CloverLoop is a creator-focused marketing website with Supabase authentication and a minimal authenticated onboarding experience. The public website describes the intended product architecture; it does not implement creator commerce, checkout, payments, product management or digital delivery.

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

The Supabase URL and public anon/publishable key are required to use email or Google authentication. Do not add a service-role key to this project or expose one in browser code.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Yes for authentication redirects | Local URL during development (`http://localhost:3000`); production origin is `https://cloverloop.in`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes for authentication | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes for authentication | Supabase public anon/publishable key. |
| `NEXT_PUBLIC_FOUNDING_CREATOR_FORM_URL` | For the dashboard programme CTA | External Google Form URL. It is intentionally not hardcoded. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Before launch | Confirmed CloverLoop support address. The Contact page shows a setup notice until provided. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional | GA4 measurement ID. Analytics loads only after analytics consent. |
| `NEXT_PUBLIC_GTM_ID` | Optional | Google Tag Manager container ID. GTM loads only after analytics consent. |

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

Enable the Email provider in **Authentication → Providers**. Configure email confirmation according to the launch policy. When confirmation is enabled, new users receive a confirmation message and continue to `/dashboard` after completing the callback. Configure the email templates in Supabase; no email-delivery vendor integration is included in this sprint.

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

## Routes

### Public

- `/`
- `/sell-online`
- `/sell-digital-downloads`
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

### Authentication

- `/login`
- `/signup`
- `/forgot-password`
- `/auth/callback`
- `/dashboard`

Login, signup, password reset, auth callback and dashboard responses are noindex. The dashboard route is protected by Supabase session verification and redirects unauthenticated visitors to `/login`.

## Content and assets

- The complete eight educational article bodies are in `content/resources/` as structured JSON; article metadata is stored alongside, separately from the article blocks.
- The source Word document is `image assets/CloverLoop_Content_and_SEO_Master_Document.docx`.
- To refresh article JSON from that Word source, run `powershell -ExecutionPolicy Bypass -File tools/import-content.ps1`.
- The tool page and Resource Hub are implemented with reusable templates and source copy in `src/app/resources/`.
- The Marketing Ideas Tool is a local, predefined generator; it does not use an AI API.
- `content/asset-inventory.json` records dimensions, alpha channel, source file sizes and usage for every supplied asset. Original source files remain in `image assets/`.
- Raster illustrations in `public/images/home/` and `public/images/resources/` are optimized WebP copies. The supplied logo and favicon source PNGs are kept intact.
- To regenerate optimized WebP copies from the supplied images, copy the originals into their mapped `public/images/` folders and run `npm run optimize:assets`. The optimizer corrects the storefront URL in the homepage hero image. An illustration containing a legacy URL and unsupported payment/dashboard UI is deliberately excluded from the public site.

All article reading-time estimates are calculated from the actual words rendered from their article blocks. No author or publication date is emitted because none was approved in the supplied editorial source.

## Analytics and cookie consent

GA4 and GTM are optional. If either ID is configured, its script is loaded only after the visitor selects **Allow analytics**. Rejecting optional analytics stores that choice locally and prevents those scripts from loading. Tracked events include page views, navigation, pricing visits and CTAs, signup/login outcomes, Google OAuth initiation, resource views and the authenticated programme CTA. Authentication credentials and tokens are never included in analytics payloads.

## Production and Vercel deployment

1. Push the project to a Git provider and import it into Vercel.
2. Select the Next.js framework preset and keep the standard build command `npm run build`.
3. Configure the production environment variables in Vercel. Set `NEXT_PUBLIC_SITE_URL=https://cloverloop.in`.
4. Add `cloverloop.in` to the Vercel project domains and follow Vercel's DNS instructions. Configure the `www` hostname only if you intend to redirect it to the canonical production domain.
5. Add `https://cloverloop.in/auth/callback` to the Supabase redirect allow list and set the Supabase production Site URL to `https://cloverloop.in`.
6. Configure Google OAuth's authorized origin and Supabase callback as described above.
7. Set the confirmed support email and external Founding Creator form URL before launch.
8. Add GA4/GTM IDs only if they are needed; verify the cookie-consent experience before enabling tags.
9. Run `npm run typecheck`, `npm run lint` and `npm run build`, then deploy.
10. After launch, submit `https://cloverloop.in/sitemap.xml` to Google Search Console.

The sitemap uses the production canonical origin and excludes authentication, utility, and unreviewed legal-draft routes. `robots.txt` references the production sitemap. The Terms and Privacy pages are marked as drafts and must receive qualified legal review before publication.

## Product scope and launch configuration

This sprint does **not** implement product upload, checkout, Razorpay connectivity, payment verification, digital file delivery, earnings, sales analytics, subscriptions, monthly commission invoicing, or creator management. Marketing copy describes these as intended architecture and planned capabilities rather than live integrations.

Before launch, configure Supabase and Google OAuth, confirm the support email and programme form, and obtain legal review of the Terms and Privacy drafts. Pricing is presented as the agreed intended pricing model; subscriptions and payment processing are not operational in this implementation.
