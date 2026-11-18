# Dual Razorpay Application Deployment Checklist

This rollout adds application-aware OAuth without replacing the existing ZERO_FEE application. Do not enable the FOUR_PERCENT production credentials until the test-mode gates below pass and Razorpay confirms the application configuration.

## 1. Razorpay configuration

- [ ] Confirm both applications belong to the same Technology Partner MID.
- [ ] Leave the existing ZERO_FEE application and its commission configuration unchanged.
- [ ] Confirm the Creator application applies the agreed 4% platform commission plus applicable GST, separately from standard Razorpay gateway charges.
- [ ] Register the exact callback URL `https://<production-host>/api/razorpay/callback` in both applications. Use the same host as `NEXT_PUBLIC_SITE_URL`.
- [ ] Configure each application's webhook URL as `https://<production-host>/api/webhooks/razorpay`, if Razorpay permits the shared endpoint.
- [ ] Configure separate webhook secrets for each application and environment.
- [ ] Confirm each application can authorize a merchant already connected through the other application. Until confirmed, treat a plan migration as pending reconnection; do not assume the previous authorization transfers.
- [ ] Confirm the Creator application has the correct fee configuration and that its Test Mode values do not change production settings.

Razorpay's OAuth documentation identifies an application by its `client_id`. The integration therefore stores/reports the selected application's client ID as its application ID. Verify that value against the application details in the Razorpay dashboard before relying on it in compliance correspondence.

## 2. Environment variables

Set secrets in the server environment only. Prefer mode-specific variables; the generic app-specific forms are supported, but mode-specific credentials reduce accidental Test/Live mixing.

| Purpose | Test variable | Live variable |
|---|---|---|
| ZERO_FEE OAuth client ID | `RAZORPAY_ZERO_FEE_TEST_CLIENT_ID` | `RAZORPAY_ZERO_FEE_LIVE_CLIENT_ID` |
| ZERO_FEE OAuth client secret | `RAZORPAY_ZERO_FEE_TEST_CLIENT_SECRET` | `RAZORPAY_ZERO_FEE_LIVE_CLIENT_SECRET` |
| ZERO_FEE webhook secret | `RAZORPAY_ZERO_FEE_TEST_WEBHOOK_SECRET` | `RAZORPAY_ZERO_FEE_LIVE_WEBHOOK_SECRET` |
| FOUR_PERCENT OAuth client ID | `RAZORPAY_FOUR_PERCENT_TEST_CLIENT_ID` | `RAZORPAY_FOUR_PERCENT_LIVE_CLIENT_ID` |
| FOUR_PERCENT OAuth client secret | `RAZORPAY_FOUR_PERCENT_TEST_CLIENT_SECRET` | `RAZORPAY_FOUR_PERCENT_LIVE_CLIENT_SECRET` |
| FOUR_PERCENT webhook secret | `RAZORPAY_FOUR_PERCENT_TEST_WEBHOOK_SECRET` | `RAZORPAY_FOUR_PERCENT_LIVE_WEBHOOK_SECRET` |

Also configure and verify:

- [ ] `RAZORPAY_OAUTH_MODE=test` in Preview/Test deployments and `live` only in Production after approval.
- [ ] `NEXT_PUBLIC_SITE_URL` matches the deployed site origin and registered callback.
- [ ] `RAZORPAY_TOKEN_ENCRYPTION_KEY` remains the existing valid base64-encoded 32-byte key. Do not rotate it as part of this deployment.
- [ ] `RAZORPAY_PARTNERSHIPS_EMAIL` is the approved Razorpay recipient for Creator commission authorization email.
- [ ] `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured and the sender is verified in Resend.
- [ ] Optionally set `RAZORPAY_COMMISSION_EMAIL_ALERT_TO` for terminal email delivery failures.
- [ ] Existing `RAZORPAY_OAUTH_CLIENT_ID`, `RAZORPAY_OAUTH_CLIENT_SECRET`, and `RAZORPAY_PARTNER_WEBHOOK_SECRET` remain configured as ZERO_FEE-only compatibility fallbacks until legacy deployments and connections are verified.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` remain configured for server-side RPCs and cron routes.

Do not set the FOUR_PERCENT Live credentials until the production application, fee, callback, and webhook configuration have been validated by Razorpay and CloverLoop.

## 3. Database and application deployment

1. Back up the database and apply `supabase/migrations/20261118190000_razorpay_dual_applications.sql` to a staging database first.
2. Verify the migration completes and the service-role RPCs, RLS restrictions, triggers, and indexes are present.
3. Confirm existing connection rows are retained and are marked ZERO_FEE without forcing reconnection.
4. Deploy the application after the migration is applied. OAuth callbacks and order creation depend on the new database columns and RPCs.
5. In staging, verify a plan transition to a different application records a pending migration. It must not be marked complete until the new OAuth connection is saved.
6. Confirm the `/api/cron/razorpay-token-refresh` and `/api/cron/razorpay-webhook-process` schedules are active. The token refresh remains daily; the webhook processor also drains the authorization email outbox.

The local Supabase CLI could not validate the migration in this environment because Docker/Podman is unavailable. Do not skip staging database validation.

## 4. Test-mode release gates

- [ ] Run `npm run typecheck`.
- [ ] Run the Razorpay regression suites: `npx vitest run tests/razorpay-oauth.test.ts tests/razorpay-checkout-webhook.test.ts tests/razorpay-webhook-fulfillment.test.ts tests/razorpay-checkout.test.ts tests/razorpay-webhook-cron.test.ts tests/razorpay-webhook-registration.test.ts`.
- [ ] Verify Free, active Founding Creator, and Pro Creator select ZERO_FEE; standard Creator at 4% selects FOUR_PERCENT; unsupported or inconsistent entitlements fail closed.
- [ ] Test one OAuth connect for each plan in Test Mode. Confirm state is single-use, creator-bound, application-bound, and rejected if the plan changes before callback.
- [ ] Test Creator commission consent capture and successful post-OAuth authorization email, including the registered creator as CC. Verify no consent/email is created for 0% plans or failed/abandoned OAuth.
- [ ] Simulate Resend failure and verify retry, terminal failure alert, delivery status, and message ID behavior without deleting consent.
- [ ] Verify both application webhook signatures, invalid signatures, duplicate event IDs, authorization revocation, and delayed/refund event handling.
- [ ] Verify token refresh uses each app's own credentials and that revoked/expired connections require reconnection.
- [ ] Verify transaction snapshots preserve application, plan, rate, and commission amount across subsequent plan changes; confirm checkout does not independently deduct the 4%.
- [ ] Confirm the Creator Test Mode application reports the configured 4% add-on and that 0% applications report no CloverLoop add-on. Standard gateway charges remain separate.
- [ ] Do not run live payments or enable FOUR_PERCENT Live credentials without explicit release approval.

## 5. Production enablement

- [ ] Obtain Razorpay confirmation for application configuration and cross-application reauthorization behavior.
- [ ] Review the staging migration, test results, webhook signatures, email recipient/content, and cron execution.
- [ ] Add FOUR_PERCENT Live OAuth credentials and webhook secret only after all gates pass.
- [ ] Perform a non-financial production configuration/smoke check before inviting Creator Plan merchants to connect.
- [ ] Monitor pending migrations, application/entitlement mismatches, failed webhook processing, token refresh failures, and authorization email delivery status.

## 6. Rollback

- Before any FOUR_PERCENT production connection is created, remove/disable the FOUR_PERCENT Live credentials and stop Creator Plan onboarding through that application. Keep the additive database migration in place.
- Do not delete consent, email, migration, connection-history, or transaction-history records. Do not manually relabel an application or commission rate to make the connection appear consistent.
- If FOUR_PERCENT connections already exist, do not roll back to code that only understands ZERO_FEE. Keep application-aware handling deployed, pause new Creator connections if needed, and coordinate a verified Razorpay reconnection/remediation plan.
- Never switch a Creator account to ZERO_FEE as a fallback while Razorpay may still apply the 4% configuration. Preserve pending/remediation status until the actual Razorpay application assignment is verified.
