# CloverLoop

CloverLoop is a creator-focused website with Supabase authentication, public creator storefronts, private digital-product delivery, and Test Mode paid checkout. Paid checkout is disabled by default and Live Mode is not enabled.

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
   npm test
   npm run typecheck
   npm run lint
   npm run build
   ```

The Supabase URL and public anon/publishable key are required to use email or Google authentication. Storefront image processing, private file cleanup and launch-checklist marketing opt-ins use `SUPABASE_SERVICE_ROLE_KEY` on the server. It is read only by server-only modules; never prefix it with `NEXT_PUBLIC_` or expose it in browser code.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Yes for authentication redirects | Local URL during development (`http://localhost:3000`); production origin is `https://cloverloop.in`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes for authentication | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes for authentication | Supabase public anon/publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | For storefront image processing, file cleanup, checklist opt-ins, free product claims/downloads, and signed founder referral attribution | Server-only Supabase service-role key. Never expose it to client code. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Before launch | Confirmed CloverLoop support address. The Contact page shows a setup notice until provided. |
| `RESEND_API_KEY` | For launch checklist, creator feedback, free and paid product delivery, and programme reminders | Server-only Resend API key used for transactional email delivery. |
| `RESEND_FROM_EMAIL` | For launch checklist, creator feedback, free and paid product delivery, and programme reminders | Verified sender address for transactional email. |
| `RESEND_WEBHOOK_SECRET` | For paid purchase email delivery status | Server-only Resend webhook signing secret for `/api/webhooks/resend`; configure delivery, bounce, failure, and complaint events. |
| `PURCHASE_DOWNLOAD_LINK_SECRET` | For paid purchase download links | Server-only random secret of at least 32 bytes. Keep it stable; changing it invalidates previously emailed download links. |
| `CRON_SECRET` | For Vercel production schedule | Long, random bearer secret used to authorize scheduled Founding Creator expiry/reminders, Razorpay token refresh, webhook queue recovery, and purchase email retries. Configure it as a Vercel production environment variable. |
| `FREE_PRODUCT_LINK_EXPIRY_HOURS` | No | Free product download link expiry in hours (1–168; default 48). |
| `FREE_PRODUCT_MAX_DOWNLOADS` | No | Maximum successful download redirects per claim (1–20; default 3). |
| `RAZORPAY_OAUTH_ENABLED` | No | Must be explicitly set to `true` to enable creator account connections; defaults to `false`. |
| `RAZORPAY_OAUTH_CLIENT_ID` | For Razorpay OAuth | Server-side Razorpay Technology Partner client ID for the configured environment. |
| `RAZORPAY_OAUTH_CLIENT_SECRET` | For Razorpay OAuth | Server-only Razorpay Technology Partner client secret. Never expose it to browser code. |
| `RAZORPAY_OAUTH_MODE` | For Razorpay OAuth | Explicit `test` or `live` mode. Configure the matching development or production client per deployment environment. |
| `RAZORPAY_TOKEN_ENCRYPTION_KEY` | For Razorpay OAuth | Server-only base64-encoded 32-byte AES-256-GCM key, separate from the Razorpay client secret. |
| `RAZORPAY_CHECKOUT_ENABLED` | No | Paid checkout feature gate; keep `false` by default. Only enable for explicitly approved Test Mode checkout. |
| `RAZORPAY_TEST_WEBHOOK_SECRET` | For existing account-scoped webhook compatibility | Server-only signing secret for legacy creator-account webhooks. Keep it separate from the Technology Partner application webhook secret. |
| `RAZORPAY_PARTNER_WEBHOOK_FULFILLMENT_ENABLED` | For Test Mode checkout | Must be explicitly `true` to enable application-level Test Mode webhook fulfillment. |
| `RAZORPAY_PARTNER_WEBHOOK_DIAGNOSTICS` | No | Keep unset or `false`. If `true`, fulfillment and checkout fail closed. |
| `RAZORPAY_PARTNER_TEST_WEBHOOK_SECRET` | For Test Mode checkout | Server-only secret configured on the Technology Partner application's Test Webhook. Must differ from `RAZORPAY_TEST_WEBHOOK_SECRET`. |

The launch-checklist email uses the branded HTML in `src/lib/launch-checklist-email.ts`. Its PDF attachment is `public/downloads/cloverloop-link-in-bio-launch-checklist.pdf`, also served as the fallback download link.

The launch-checklist form continues to use Resend for delivery. When a visitor separately opts in to updates, their email and consent timestamp are stored in the private Supabase `email_subscriptions` table. Apply the migration in `supabase/migrations` before enabling this opt-in.

Set the same environment variables in the Vercel project. Keep `.env.local` private; it is ignored by Git.

### Razorpay Technology Partner OAuth

The authenticated **Dashboard → Settings → Razorpay account** section connects a creator's existing merchant account using Technology Partner OAuth. To test it:

1. Complete Technology Partner application setup with Razorpay and create a development OAuth client.
2. Register the exact development callback URI `${NEXT_PUBLIC_SITE_URL}/api/razorpay/callback`. Razorpay documents `https://localhost` for its Preview flow; verify the exact local redirect URI against your development client's allowlist.
3. Configure `RAZORPAY_OAUTH_ENABLED=true`, the development client ID and secret, `RAZORPAY_OAUTH_MODE=test`, and a separate `RAZORPAY_TOKEN_ENCRYPTION_KEY` in `.env.local`.
4. Generate the encryption key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Store it in a secret manager; do not commit it or share it in chat.
5. Apply Supabase migrations and use **Dashboard → Settings → Connect Razorpay**.

To test OAuth from the production deployment before going live, set these variables in the Vercel **Production** environment:

| Variable | Production test value |
| --- | --- |
| `RAZORPAY_OAUTH_ENABLED` | `true` |
| `RAZORPAY_OAUTH_CLIENT_ID` | Razorpay **Development Client ID** |
| `RAZORPAY_OAUTH_CLIENT_SECRET` | Matching **Development Client Secret** (server-only) |
| `RAZORPAY_OAUTH_MODE` | `test` |
| `NEXT_PUBLIC_SITE_URL` | `https://cloverloop.in` |
| `RAZORPAY_TOKEN_ENCRYPTION_KEY` | Existing base64-encoded 32-byte key; keep it stable for stored tokens |
| `RAZORPAY_CHECKOUT_ENABLED` | `false` |

The callback URI is derived from `NEXT_PUBLIC_SITE_URL`; there is no separate redirect-URI environment variable. It must be registered exactly as `https://cloverloop.in/api/razorpay/callback` on the Development Client. The application uses `https://auth.razorpay.com/authorize` and `https://auth.razorpay.com/token`; the token exchange sends `mode: "test"`.

Do not put Razorpay Production Client credentials in the Vercel Production environment while testing. Keep them out of this deployment's configuration; during an explicitly approved live cutover, replace the client ID and secret together and change the mode to `live`. Redeploy after changing environment variables so the production server uses the updated configuration. The Development Client supports test mode; a Production Client is for live mode. OAuth connection alone does not enable checkout or payments.

Never share credentials with CloverLoop users or place private values in `NEXT_PUBLIC_*` variables. Access and refresh tokens are encrypted server-side; daily token refresh uses the existing Vercel Cron/`CRON_SECRET` pattern.

### Razorpay Test Mode checkout

The new Test Mode fulfillment flow receives the Technology Partner application's `payment.captured` webhook at `https://cloverloop.in/api/webhooks/razorpay`. It verifies the raw-body HMAC with `RAZORPAY_PARTNER_TEST_WEBHOOK_SECRET`, requires the top-level merchant `account_id` to map to an active Test Mode creator OAuth connection, and durably records the event before acknowledging it. A background task then independently retrieves the provider order and payment with that creator's decrypted OAuth token, checks merchant/account, order receipt, payment ID, amount, currency, and captured status, and calls the existing transactional entitlement routine. The webhook payload alone is never treated as proof of payment. Other application webhook events are acknowledged without fulfillment.

Before deploying, apply these migrations through the established Supabase migration workflow; this code change does not apply them to any database:

1. `supabase/migrations/20261113120000_razorpay_test_checkout.sql`
2. `supabase/migrations/20261113210000_razorpay_webhook_registration_lock.sql` (retained for compatibility/rollback)
3. `supabase/migrations/20261114190000_razorpay_partner_webhook_fulfillment.sql`
4. `supabase/migrations/20261114194000_razorpay_purchase_email_delivery.sql`

In the intended Vercel environment, keep the Razorpay OAuth client set to Development credentials and `RAZORPAY_OAUTH_MODE=test`. Set `RAZORPAY_PARTNER_WEBHOOK_FULFILLMENT_ENABLED=true`, `RAZORPAY_PARTNER_WEBHOOK_DIAGNOSTICS=false` (or remove the variable), and set the distinct application-level Test Webhook secret in `RAZORPAY_PARTNER_TEST_WEBHOOK_SECRET`. Keep `RAZORPAY_TEST_WEBHOOK_SECRET` unchanged for any existing account-scoped webhooks. Do not rotate `RAZORPAY_TOKEN_ENCRYPTION_KEY`. Keep `RAZORPAY_CHECKOUT_ENABLED=false` until the migration and Test Mode configuration are reviewed and you explicitly approve checkout testing.

In Razorpay Partners → Applications → CloverLoop → Manage Test Webhook, configure the exact endpoint above and the `payment.captured` event. Set `CRON_SECRET` as a server-only Vercel secret. Vercel's `/api/cron/razorpay-webhook-process` schedule performs daily recovery for interrupted webhook and purchase-email work; a verified capture also schedules immediate post-response fulfillment and email delivery. Recovery after an email delivery failure may therefore be delayed until the next daily run. The existing account-scoped webhook handler and registration code remain for compatibility, but checkout creation and new application-level fulfillment do not depend on registering or fetching account-scoped webhooks.

Configure a Resend webhook to `https://cloverloop.in/api/webhooks/resend` for `email.delivered`, `email.bounced`, `email.failed`, and `email.complained`, then store its signing secret in `RESEND_WEBHOOK_SECRET`. Paid download links are emailed only after server-side capture verification and entitlement creation. Email acceptance and verified delivery are tracked separately; failed delivery is retried by the persisted queue. Set `PURCHASE_DOWNLOAD_LINK_SECRET` to a stable, random server-only secret (at least 32 bytes). The email link carries its signed ticket in the URL fragment; the app strips it before enabling analytics, validates it server-side, and then uses the existing private storage and download-limit safeguards.

For a controlled Test Mode run, enable `RAZORPAY_CHECKOUT_ENABLED=true` only after the above deployment steps. Test with two different OAuth-connected creators, each owning a paid product; complete Test Mode payments and confirm that each webhook event resolves only to the matching creator's order, is independently verified through that creator's OAuth account, and creates one entitlement. Replay an event and confirm no duplicate entitlement. Confirm a failed or non-captured payment grants no download. Inspect Vercel logs for the event type, account ID, payment/order IDs, signature result, and sanitized processing status; logs must not contain OAuth tokens, webhook secrets, or buyer details. The diagnostic-only behavior has been replaced; do not set `RAZORPAY_PARTNER_WEBHOOK_DIAGNOSTICS=true`.

The existing browser verification endpoint only verifies the checkout result and returns a processing state; it never grants an entitlement. The success state does not expose a download link. Paid downloads continue to use the private `product-files` bucket, 60-second signed storage URLs, and existing download-count/link-expiry limits. Free-product claim and download behavior remains separate from paid checkout.

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

The storefront feature adds one public page per creator at `https://cloverloop.in/{username}`. Cover/profile images use the private `storefront-assets` bucket and are cropped and optimized to WebP by an authenticated server action. Product metadata is stored in `storefront_products`; product files use the separate private `product-files` bucket and upload directly from the authenticated browser with a short-lived, owner-scoped upload slot. Public storefront queries return only active product display fields; they never return product-file paths or links.

Each published product has a public page at `/{username}/product/{productId}`, using its stable product UUID. Storefront cards link to these pages instead of collecting buyer details inline. Paid checkout collects full name and email only; phone is neither requested nor required. Published free products can still be claimed without a CloverLoop account, with full name and email collected before a secure Resend download email is sent. Product files remain private in Supabase Storage. Paid checkout is gated off by default and remains Test Mode only. Free-plan limits are enforced server-side: one paid and five free listings per account lifetime; Creator and Pro Creator plans allow unlimited listings.

Claim records are separate from future paid orders. A repeat claim for the same product and email reuses a currently valid link; failed or expired delivery attempts can be retried subject to rate limits. Each link defaults to a 48-hour lifetime and three successful download redirects. Creators can review claim counts, download counts, dates and customer email addresses in **Dashboard → Products**; access is restricted to their own products.

Apply the database migration with the Supabase CLI after linking the project:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migrations create storefront and product tables, RLS policies, private storage buckets, username redirect mapping and a daily `pg_cron` job. Permanent deletion and cleanup of replaced or abandoned images and private product files are processed by `supabase/functions/purge-storefronts/index.ts`. Deploy the function and configure its shared secret before applying the migrations:

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

   The scheduled job runs daily at 03:15 UTC. It hard-deletes storefronts after their 30-day deletion period, releasing usernames only after their assets and private files have been removed. It also removes unreferenced images older than 24 hours, expired product upload slots and retired/deleted product files. Monitor Supabase Edge Function and `pg_cron` logs for failures.

The storefront image pipeline does not require an additional Next.js environment variable. The public site only needs the existing Supabase URL and anon/publishable key. Storefront publish, edit, unpublish and delete actions do not send email notifications.
Account deletion is blocked until a scheduled storefront deletion has completed, so the 30-day retention and username reservation cannot be bypassed.

The free product claim flow uses `SUPABASE_SERVICE_ROLE_KEY` and the existing Resend settings (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) on the server. Apply all migrations with `supabase db push` before enabling it. This includes the explicit service-role table grants required by the claim and download routes. Confirm the configured Resend sender is verified and set `NEXT_PUBLIC_SITE_URL` to the canonical production origin (`https://cloverloop.in`) in Vercel so emailed links resolve to the deployed app. No additional storage bucket or public file access is needed. Download APIs create 60-second signed URLs only after revalidating the claim or purchase, product, storefront and download limit.

## Plans and Founding Creator Programme

The pricing source in `src/lib/pricing-plans.ts` matches these current terms (prices exclude applicable GST; provider processing fees are additional):

| Plan | Monthly price | CloverLoop platform fee | Paid listings | Free listings | Monthly Gross Sales limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Free | ₹0 | 0% up to ₹10,000/month | 1 | 5 lifetime per account | ₹10,000 per calendar month |
| Creator | ₹0 | 4% of Gross Sales | Unlimited | Unlimited | None |
| Pro Creator | ₹2,999 | 0% | Unlimited | Unlimited | None |

The database migrations `20261111190000_creator_plans_and_founding_programme.sql` and `20261111193000_free_monthly_gross_sales_limit.sql` add the audited plan and entitlement structures, referral attribution, programme allocation and subscription records. Free-plan Gross Sales are limited to ₹10,000 per calendar month; reaching that threshold requires an explicitly confirmed upgrade to Creator to continue selling. Creator listings are counted when first activated, not while a product is an unpublished draft. The plan entitlement view determines the effective platform fee and limits; Free-to-Creator activation uses an authenticated database RPC and requires the creator to confirm in the dashboard. Existing listings are not deleted or unpublished.

The Free plan entitlement now exposes the ₹10,000 monthly cap, but sales accumulation and threshold enforcement are not operational: this repository still has no paid checkout or trusted paid-order ledger. Do not treat the upgrade prompt at the sales threshold as live until paid sales are recorded and the cap is enforced server-side.

The referral URL is `https://cloverloop.in/signup?ref=founder`. The `ref=founder` visit is recorded in a signed, HTTP-only cookie and committed server-side after successful account creation; a creator-controlled profile field cannot set the source. Storefront publication triggers one atomic allocation from slots 1–50. The qualification date and original storefront publication date are retained; unpublishing does not revoke a slot. The dashboard shows an allocation confirmation and expiry.

The Vercel cron at `/api/cron/founding-programme` runs daily at 03:00 UTC. Set a high-entropy `CRON_SECRET` and the existing verified Resend sender/API key in Vercel to activate programme expiry and 14-day/3-day reminder delivery. The endpoint is idempotently authorized, records reminder outcomes and releases failed email attempts for retry. The expiry job preserves the Creator plan and unlimited listings; its entitlement calculation restores the 4% fee after six calendar months and never starts a subscription.

The minimal admin page is `/dashboard/admin/founding-creators`. To grant an administrator, use a trusted Supabase Auth Admin operation to set `app_metadata.role` to `admin`; never grant this role via user-editable metadata. Admin RPCs independently enforce that role, audit attribution corrections/enrolments, and do not permit allocations beyond 50.

**Pro Creator billing is not operational.** This repository has no payment provider integration, and no provider was selected or configured. Subscription/webhook tables and the entitlement model are prepared, but the Pro upgrade endpoint explicitly refuses to start billing and no Pro entitlement can activate. Do not mark a subscription active from a browser redirect. Completing Pro billing requires choosing a provider, its merchant approval and server-only credentials, then implementing and verifying provider subscription creation, signed/idempotent webhook processing, renewals, failures, cancellation, and expiry.

## Instagram Comment-to-DM Automations

**This implementation is on hold for the current Vercel plan.** Do not connect accounts or enable automations in production: without the every-minute worker, queued comments will not be processed and no private replies will be sent.

The authenticated dashboard at `/dashboard/instagram-automations` supports Instagram Professional accounts through Meta's official [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/). It requests only `instagram_business_basic`, `instagram_business_manage_comments`, and `instagram_business_manage_messages`; API calls use `graph.instagram.com` and the explicitly configured Graph API version. The integration does not publish content, automate Live comments, or send follow-up messages.

### Meta app setup

1. Create/configure a Meta Business app with Instagram API using Instagram Login and set the approved OAuth redirect URI to `https://cloverloop.in/api/instagram/callback` (use the corresponding local URI during development).
2. Request the three permissions above. Configure the Instagram Webhooks callback as `https://cloverloop.in/api/instagram/webhook`, provide the same high-entropy verify token set in `META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, and subscribe the app to the `comments` field. Enable the webhook's value payloads. CloverLoop subscribes each connected account to `comments` after OAuth succeeds.
3. Configure the Meta app secret, app ID, selected currently supported Graph API version, and a new 32-byte encryption key as environment variables below. Do not reuse the app secret as the encryption key.
4. **On hold:** do not apply the migration or enable this integration in production until a supported background scheduler is available.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `META_INSTAGRAM_APP_ID` | Meta app ID for Instagram Login. |
| `META_INSTAGRAM_APP_SECRET` | Server-only secret used for OAuth and webhook signature verification. |
| `META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Random token configured identically in the Meta webhook dashboard and Vercel. |
| `META_GRAPH_API_VERSION` | Current supported version in `vNN.N` format; select/update it from Meta's versioning documentation rather than relying on a code default. |
| `INSTAGRAM_TOKEN_ENCRYPTION_KEY` | Base64 encoding of a randomly generated 32-byte AES-256-GCM key. Generate with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Keep it server-only and back it up securely; changing it requires reconnecting accounts unless old tokens are re-encrypted first. |
| `NEXT_PUBLIC_SITE_URL` | Canonical app origin used for OAuth callback and CloverLoop links. |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only key used to access RLS-protected integration records. |
| `CRON_SECRET` | Existing bearer secret authorizing the automation worker cron. |

### Privacy, delivery and production access

The migration `20261112100000_instagram_comment_automations.sql` creates RLS-enabled connection, automation, event, and rate-limit tables; browser roles receive no table privileges. Server handlers authenticate the creator and apply ownership filters before every change. Access tokens are encrypted with AES-256-GCM; webhook comment IDs are unique per connected account to deduplicate delivery. Comment text and commenter IDs are retained for 30 days, then cleared while aggregate delivery counts remain. Private replies use the comment ID as the recipient, confirm success only after Meta returns a message ID, and are limited to one reply within seven days. When invoked, the worker processes at most 20 events and retries explicit retryable Meta errors with bounded exponential delay.

**Implementation is on hold.** The current Vercel plan does not support the required every-minute worker schedule, so this repository does not configure or run the Instagram worker cron. Without a compatible scheduler, webhook events can queue but automations will not be processed or replies sent. Do not connect accounts or activate automations in a deployed environment until a supported scheduler is configured and tested. The public webhook and duplicate-event safeguards are implemented, but are not a substitute for the worker.

Once a compatible scheduler is available, configure the worker at `/api/cron/instagram-automations` with the existing `CRON_SECRET`, apply the migration, and complete Meta's production approval process before enabling this feature. Instagram Login supports testing with app-role accounts; external creators require the app in Live mode and Advanced Access/App Review for the permissions and comment webhook access. Meta may also require business verification as part of review. Test OAuth, account webhook subscription, real comment delivery and private replies with Meta-approved production access. Development approval does not imply access for external creators. See Meta's current [permissions](https://developers.facebook.com/docs/permissions/reference), [webhook setup](https://developers.facebook.com/docs/instagram-platform/webhooks/setup), [private reply](https://developers.facebook.com/docs/instagram-platform/private-replies), and [App Review](https://developers.facebook.com/docs/instagram-platform/app-review) guides.

## Routes

### Public

- `/`
- `/{username}` for a published creator storefront
- `/free-product-download` for secure, expiring free-product links
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
- `/dashboard/instagram-automations` for connected Instagram accounts and comment automations
- `/dashboard/storefront`
- `/dashboard/admin/founding-creators` for administrators with the trusted Supabase app metadata role

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

Google Tag Manager container `GTM-K4BMMLN3` loads once from the root layout on each route after hydration; on `/free-product-download`, it waits until the token fragment is removed from the address bar. Google Consent Mode defaults denied. GA4 is not installed separately by the app; configure it in GTM with a Google Tag ID of `G-PS230HQXZY` and require `analytics_storage` consent. Disable the Google Tag's automatic `page_view` (`send_page_view: false`), then send one GA4 `page_view` event from the app's custom `page_view` data-layer event, mapping `page_path` as an event parameter. Do not also use a History Change trigger for page views. The app emits one custom page-view event per route after consent is granted, including the current page when consent is first accepted. Rejecting stores that choice locally, keeps consent denied and pushes no custom events. Other tracked events include navigation, pricing visits and CTAs, signup/login outcomes, Google OAuth initiation, resource views, free-product claim starts/completions, email-send acceptance and download-link use, and the authenticated programme CTA. Customer emails and download tokens are never included in analytics payloads.

## Production and Vercel deployment

1. Push the project to a Git provider and import it into Vercel.
2. Select the Next.js framework preset and keep the standard build command `npm run build`.
3. Configure the production environment variables in Vercel. Set `NEXT_PUBLIC_SITE_URL=https://cloverloop.in`.
4. Add `cloverloop.in` to the Vercel project domains and follow Vercel's DNS instructions. Configure the `www` hostname only if you intend to redirect it to the canonical production domain.
5. Add `https://cloverloop.in/auth/callback` to the Supabase redirect allow list and set the Supabase production Site URL to `https://cloverloop.in`.
6. Configure Google OAuth's authorized origin and Supabase callback as described above.
7. Set the confirmed support email before launch; the Founding Creator Programme uses the in-app referral link rather than an external form.
8. Configure and publish the GTM Google Tag and `page_view` event tag for `G-PS230HQXZY`; test consent and page views with Tag Assistant before validating GA4 Realtime.
9. Run `npm run typecheck`, `npm run lint` and `npm run build`, then deploy.
10. After launch, submit `https://cloverloop.in/sitemap.xml` to Google Search Console.

The sitemap uses the production canonical origin and excludes authentication, utility, and unreviewed legal-draft routes. `robots.txt` references the production sitemap. The Terms and Privacy pages are marked as drafts and must receive qualified legal review before publication.

## Product scope and launch configuration

Creators can manage real product listings and upload private product files. Active products appear in the public storefront catalogue; inactive products do not. Free products can be claimed and delivered through expiring, limited-use email links. Published products have dedicated public detail pages. Razorpay creator OAuth and Test Mode checkout are implemented, but paid checkout remains disabled until `RAZORPAY_CHECKOUT_ENABLED=true` is explicitly approved for Test Mode. Live checkout, refunds, operational Pro subscription billing, commission reconciliation, paid sales analytics, and creator order-management screens are not implemented. Subscription tables and entitlement fields are scaffolding only until their provider flows are implemented.

Before launch, configure Supabase and Google OAuth, apply all migrations, set the cron and Resend variables, verify the support email, and obtain legal review of the Terms and Privacy drafts. Pricing is presented as the agreed intended pricing model; Pro subscription billing and Live Mode checkout are not operational in this implementation.
