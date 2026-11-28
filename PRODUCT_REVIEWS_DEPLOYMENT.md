# Product reviews and review invitations: deployment guide

Verified-buyer reviews for CloverLoop products. Every successful paid order gets one review
invitation email 5 days after payment. Buyers review through a private, single-use link without
signing in. Reviews appear on public product pages and in the creator dashboard. Moderation is
admin-only.

## How it works

| Step | Where |
|---|---|
| Order becomes `paid` → invitation scheduled for `paid_at + 5 days` | Trigger `enqueue_product_review_invitation` on `razorpay_checkout_orders` |
| Historical paid orders → invitations backfilled from their original `paid_at` | One-time `insert … select` in the migration |
| Daily cron claims due invitations, attaches a token hash, sends via Resend | `GET /api/cron/review-invitations` → `processReviewInvitationQueue` |
| Resend delivery events (delivered, bounced, failed, complained) | `POST /api/webhooks/resend` → `record_resend_review_invitation_event` |
| Buyer opens `https://cloverloop.in/review#token=…` | `/review` page → `POST /api/reviews/invitation` |
| Buyer submits a rating (1–5), an optional review (≤ 2,000 characters) and a display name (≤ 60) | `POST /api/reviews/submit` → `submit_product_review` |
| Public product page shows the average, count, distribution and reviews | Views `product_review_summaries` and `published_product_reviews` |
| Creator views reviews and reports abuse | `/dashboard/reviews` → `report_product_review` |
| Admin hides, restores or dismisses reports | `/dashboard/admin/reviews` → `admin_moderate_product_review` |

### Eligibility and policy (enforced in the database, not the browser)

- **Order state:** only `razorpay_checkout_orders.order_status = 'paid'` counts. Payment is confirmed by the existing verified Razorpay webhook and verification lifecycle; a checkout redirect never counts.
- **Refunds:** an order is ineligible once a processed refund covers its full amount. Partial refunds remain eligible, because the existing refund lifecycle doesn't revoke the buyer's download access.
  - Known limitation: Razorpay refund events store the latest refund amount, not a running total. Several partial refunds that add up to the full amount are only caught if a single refund covers the whole order.
- **One invitation per order:** each order contains one product, so this is one invitation per product purchased. A unique key on `order_id` prevents duplicate invitations.
- **One review per buyer per product:** buyers are identified by the SHA-256 hash of their lower-cased email.
  - If the buyer has already reviewed the product from an earlier purchase, later invitations are skipped (`already_reviewed`).
  - Those later links show "already reviewed".
- **Tokens:**
  - Each token is an HMAC of the invitation ID and delivery generation using `REVIEW_TOKEN_SECRET`.
  - Only the SHA-256 hash is stored.
  - Tokens expire after 60 days and are single-use: a successful submission sets `token_used_at`.
  - The token lives in the URL fragment, so it never reaches server logs or `Referer` headers.
- **Verified Purchase label:** reviews can only be created by `submit_product_review`, which re-checks eligibility, so every public review is a verified purchase.
- **Privacy:** public views expose only the display name, rating, text and date. Emails, order IDs and buyer keys are never public.
- **Environment isolation:** invitations are only processed for the active `RAZORPAY_OAUTH_MODE` (`test` or `live`). Test-mode orders never email anyone from a live deployment.

### Delivery, retries and idempotency

- Each run claims up to `REVIEW_INVITATION_BATCH_SIZE` invitations (default 25, max 100). Claims use `FOR UPDATE SKIP LOCKED` with a 5-minute lease.
- Sends are sequential, about 600 ms apart, which stays under Resend's default rate of 2 requests per second.
- The token hash is stored **before** the email is sent, so a link in a delivered email always resolves.
- Resend requests use the `Idempotency-Key` header `review-invitation-<id>-<generation>`. A retried attempt within the same generation can't create a second email.
- Transient failures back off (15 min, 30 min, 1 h … up to 24 h). After 6 attempts the invitation is skipped with `delivery_failed`.
- A Resend `email.failed` event bumps the delivery generation, which issues a new key and token and retries after 1 hour.
- Bounces are skipped (`delivery_failed`) and complaints are suppressed. Neither is retried.
- Before each batch, invitations are re-checked:
  - Refunded, unpaid, deleted-product and already-reviewed purchases are skipped.
  - Temporarily unpublished products are deferred by a day, for up to 30 days.

## Required environment variables

Set these in every Vercel environment where reviews should work.

| Variable | Required | Notes |
|---|---|---|
| `REVIEW_TOKEN_SECRET` | Yes | Random string of at least 32 characters, e.g. `openssl rand -base64 48`. **Rotating it invalidates every unsent and unused review link.** |
| `REVIEW_INVITATIONS_ENABLED` | Yes | `true` enables sending. Anything else makes the cron a safe no-op. |
| `REVIEW_INVITATION_BATCH_SIZE` | No | Invitations per cron run. Default 25, maximum 100. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Existing | Reused from purchase emails. |
| `RESEND_WEBHOOK_SECRET` | Recommended | Existing. Enables delivered, bounce and complaint tracking. |
| `RAZORPAY_OAUTH_MODE` | Existing | `test` or `live`. Selects which orders are invited. |
| `CRON_SECRET` | Existing | Authorises Vercel Cron. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Existing | Shown in the email footer and used as reply-to. |

## Deployment steps

1. **Apply the migration** `supabase/migrations/20261128120000_product_reviews.sql`:
   ```bash
   supabase link --project-ref <project-ref>   # once per machine
   supabase db push                            # applies pending migrations
   ```
   - The migration also backfills invitations for every existing paid order.
   - It sends nothing by itself.
2. **Deploy the application** with `REVIEW_TOKEN_SECRET` set and `REVIEW_INVITATIONS_ENABLED=false`.
   - Product pages show the reviews section, with an empty state until reviews exist.
   - The dashboard gains a **Reviews** page.
3. **Confirm the cron job.** `vercel.json` now schedules `/api/cron/review-invitations` daily at `05:30 UTC` (11:00 IST).
   - It returns `{ skipped: true }` while disabled.
   - Vercel Hobby allows daily crons only. On Pro you can run it hourly (`0 * * * *`) to drain a large backlog faster.
4. **Check the Resend webhook.** The existing webhook endpoint (`/api/webhooks/resend`) handles review invitations automatically.
   - It routes by the `cloverloop_review_invitation_id` tag.
   - Keep the `email.delivered`, `email.bounced`, `email.failed` and `email.complained` events enabled.
5. **Test in a test-mode deployment** (`RAZORPAY_OAUTH_MODE=test`) before enabling live delivery. See the checklist below.
6. **Enable production delivery** by setting `REVIEW_INVITATIONS_ENABLED=true` in the live environment.
   - The backfill drains gradually at `REVIEW_INVITATION_BATCH_SIZE` per run, oldest purchases first.

### Triggering a run manually

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<deployment>/api/cron/review-invitations
# → {"environment":"test","reviewInvitations":{"claimed":3,"accepted":3,"failed":0}}
```

### Useful SQL (Supabase SQL editor, service role)

```sql
-- Invitation pipeline health
select environment, status, skip_reason, count(*)
  from public.product_review_invitations
 group by 1, 2, 3 order by 1, 2, 3;

-- Make one test invitation due immediately (test environment only)
update public.product_review_invitations
   set next_attempt_at = now()
 where environment = 'test' and status = 'scheduled' and order_id = '<order uuid>';

-- Published reviews per product
select * from public.product_review_summaries order by review_count desc;
```

## Test checklist

Automated coverage is in `tests/product-reviews.test.ts`, which runs with `npm test`:
- token determinism and hashing
- input validation
- email content and escaping
- throttled, idempotent sending
- lease loss
- cron authorisation
- API status mapping
- Resend webhook routing

Database behaviour needs a real Supabase project, so verify it in the test environment:

1. Complete a test-mode purchase. A row appears in `product_review_invitations` with `eligible_at = paid_at + 5 days`.
2. Move `next_attempt_at` to `now()` and trigger the cron. The status goes `accepted`, then `delivered` once the Resend webhook arrives.
3. Open the emailed link on desktop and on mobile. Submit a rating with and without text. The review appears on the product page with **Verified Purchase**, and the average and count update.
4. Reuse the same link. It shows "already submitted"; the database raises `RVUSE` and returns HTTP 409.
5. Buy the same product again with the same email and make the invitation due. It's skipped with `already_reviewed`.
6. Fully refund a different test order before its invitation is due. It's skipped with `refunded`, and its link (if already sent) shows "can't be reviewed".
7. Leave an order unpaid or failed. No invitation is created.
8. Report a review from `/dashboard/reviews`. It appears in `/dashboard/admin/reviews`; hide it there and it disappears from the product page.
9. Confirm a signed-in creator can't insert or update `product_reviews`. Only select is granted, and writes go through definer functions.
10. Confirm the anon role can read the review views but not `product_review_invitations` or `product_reviews`.

## Files

- Migration: `supabase/migrations/20261128120000_product_reviews.sql`
- Server logic: `src/lib/reviews/` (tokens, validation, invitation email and queue, public read model, API helpers)
- Routes:
  - `src/app/review/page.tsx`
  - `src/app/api/reviews/{invitation,submit}/route.ts`
  - `src/app/api/cron/review-invitations/route.ts`
  - `src/app/api/webhooks/resend/route.ts` (routing)
- UI:
  - `src/components/reviews/` (product page section, star rating, submission flow, creator dashboard, styles)
  - `src/app/dashboard/reviews/`
  - `src/app/dashboard/admin/reviews/`
