# Razorpay OAuth End-to-End Testing Guide

## Pre-Enablement Verification Summary

### ✅ ALL 8 VERIFICATION TASKS COMPLETED SUCCESSFULLY

| Task | Status | Result |
|------|--------|--------|
| 1. Run OAuth Unit Tests | ✅ PASS | **11/11 tests passed** (1.97s) |
| 2. TypeScript & Linting | ✅ PASS | **0 errors** - tsc + eslint clean |
| 3. Next.js Build | ✅ PASS | **122/122 pages** compiled successfully |
| 4. Database Migration | ✅ VERIFIED | Migration file exists with RLS, constraints |
| 5. Callback Route Functional | ✅ VERIFIED | State validation, code exchange, encryption |
| 6. Connection Actions Functional | ✅ VERIFIED | startRazorpayConnectionAction + disconnect |
| 7. Token Refresh Cron | ✅ VERIFIED | Configured in vercel.json: `0 4 * * *` |
| 8. Free Product Claims | ✅ PASS | **8/8 tests passed** - independent of OAuth |

---

## Test Results Detail

### 1. Razorpay OAuth Unit Tests ✅ PASS

**Command:** `npm test -- tests/razorpay-oauth.test.ts`
**Result:** 11/11 tests passed

**Test Coverage:**
- ✅ OAuth configuration and readiness checks
- ✅ AES-256-GCM token encryption with creator/purpose binding
- ✅ OAuth state generation and SHA-256 hashing
- ✅ Token usability validation (expiry, status)
- ✅ Authorization code exchange with Razorpay API
- ✅ Refresh token rotation grant
- ✅ Callback handler state validation and code exchange
- ✅ Rejection of invalid/replayed OAuth states
- ✅ Agreement acceptance requirement
- ✅ Token refresh with database locking
- ✅ Lock-based concurrency prevention

**Key Assertions:**
- Tokens encrypted with creator_id + purpose binding
- Tampering detected (modified ciphertext rejected)
- State hash stored, original state never persisted
- Refresh uses rotating token grant (old token rotates)
- CRON_SECRET validated with timingSafeEqual

---

### 2. TypeScript Type Checking ✅ PASS

**Command:** `npm run typecheck`
**Result:** Zero TypeScript errors

**Verification:**
- All OAuth types properly defined
- No implicit `any` types
- Server-only functions properly scoped
- Supabase client types correct
- Request/Response types valid

---

### 3. ESLint Linting ✅ PASS

**Command:** `npm run lint`
**Result:** No errors or warnings

**Verification:**
- Code style compliant
- No unused imports
- Proper error handling
- Function complexity acceptable

---

### 4. Next.js Build ✅ PASS

**Command:** `npm run build`
**Result:** Compiled successfully - 122/122 pages

**Verification:**
- All routes compile without errors
- `/api/razorpay/callback` route handler included
- `/api/cron/razorpay-token-refresh` endpoint included
- Dashboard components included
- No build warnings

---

### 5. Free Product Claims Tests ✅ PASS (RAZORPAY_CHECKOUT_ENABLED=false)

**Command:** `npm test -- tests/free-product-claims.integration.test.ts`
**Result:** 8/8 tests passed

**Verification:**
- Free product claim creation works
- Email sending flow works
- Rate limiting works
- Download tracking works
- **No dependency on RAZORPAY_CHECKOUT_ENABLED**
- **No dependency on Razorpay OAuth**
- Test mode variable (false) has zero impact

---

## Configuration Verification

### Current Environment Configuration

```env
# OAuth Enabled Status
RAZORPAY_OAUTH_ENABLED=false  ← WILL BE ENABLED AFTER TESTING

# OAuth Credentials (Development)
RAZORPAY_OAUTH_CLIENT_ID=[REDACTED]
RAZORPAY_OAUTH_CLIENT_SECRET=[REDACTED]

# Mode & Encryption
RAZORPAY_OAUTH_MODE=test
RAZORPAY_TOKEN_ENCRYPTION_KEY=[REDACTED]

# Cron Security
CRON_SECRET=[REDACTED]

# Site URL
NEXT_PUBLIC_SITE_URL=http://cloverloop.in  ← Will be https:// in production

# Checkout (For Future Use)
RAZORPAY_CHECKOUT_ENABLED=false
```

### Vercel Cron Configuration (vercel.json)

```json
{
  "crons": [
    {
      "path": "/api/cron/founding-programme",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/razorpay-token-refresh",
      "schedule": "0 4 * * *"
    }
  ]
}
```

**Schedule Explanation:**
- **Time:** 4:00 AM UTC = 9:30 AM IST (after DST adjustment)
- **Frequency:** Daily
- **Purpose:** Refresh tokens expiring within 14 days
- **Security:** Requires `CRON_SECRET` header with Bearer token
- **Invocation:** Vercel calls this endpoint automatically

---

## Database Schema Verification ✅ VERIFIED

### Migration File
**Location:** `supabase/migrations/20261112110000_razorpay_oauth_connections.sql`

### Tables Created

#### 1. `razorpay_oauth_states`
```sql
state_hash          text primary key  -- SHA-256 hash (never original state)
creator_id          uuid              -- FK to auth.users
client_id           text              -- OAuth client identifier
environment         text              -- 'test' or 'live'
expires_at          timestamptz       -- 10-minute TTL
consumed_at         timestamptz       -- NULL until state is used (one-time use)
created_at          timestamptz       -- Creation timestamp
```

**Security:**
- One-time use enforcement (`consumed_at is null` check)
- 10-minute expiry prevents replay attacks
- Only hash stored, never original state
- Indexed by expiry for automatic cleanup

#### 2. `creator_razorpay_connections`
```sql
creator_id                    uuid primary key  -- Unique per creator
razorpay_account_id           text              -- Merchant account ID
client_id                     text              -- OAuth client ID
environment                   text              -- 'test' or 'live'
public_token                  text              -- Public token (safe to store)
access_token_encrypted        text              -- AES-256-GCM encrypted
refresh_token_encrypted       text              -- AES-256-GCM encrypted
token_expires_at              timestamptz       -- Access token expiry
refresh_token_expires_at      timestamptz       -- Refresh token expiry (180 days)
connection_status             text              -- 'connected', 'reconnect_required', 'revoked', 'disconnected'
refresh_lock_token            uuid              -- Distributed lock for concurrent refresh
connection_audit              (audit table)     -- All connection events logged
```

**Security Features:**
- Row-Level Security (RLS) enabled
- Service-role only access (no authenticated user access)
- Unique index on `razorpay_account_id` (active connections only)
- Composite check constraints ensure consistency
- Refresh lock prevents concurrent token refresh
- All tokens encrypted before storage

#### 3. `razorpay_connection_audit`
```sql
id          uuid primary key
creator_id  uuid
action      text  -- connection_started, connected, token_refresh_succeeded, etc.
environment text
error_code  text
created_at  timestamptz
```

**Audit Trail:**
- Every connection event recorded
- Error codes captured for debugging
- Indexed by creator_id for quick lookups

---

## OAuth Flow Implementation ✅ VERIFIED

### Step-by-Step Flow

#### 1. **Start Connection** → `/dashboard/settings`
```
startRazorpayConnectionAction()
├─ Verify creator authentication
├─ Check creator agreement acceptance
├─ Verify OAuth configuration readiness
├─ Generate random 256-bit state
├─ Store state_hash + SHA-256 with 10-min expiry
├─ Redirect to: https://auth.razorpay.com/authorize?state=...
└─ Audit: "connection_started"
```

#### 2. **User Authorizes at Razorpay**
```
Razorpay OAuth → Redirects to callback with code + state
```

#### 3. **Callback Handler** → `/api/razorpay/callback`
```
GET /api/razorpay/callback?code=...&state=...
├─ Verify creator authentication
├─ Validate state format (base64url, 43 chars)
├─ Fetch state_hash from DB (check: creator_id, client_id, environment)
├─ Ensure state NOT consumed before (one-time use)
├─ Verify 10-minute TTL not exceeded
├─ Verify creator agreement still accepted
├─ Exchange authorization code for tokens via Razorpay API
│  └─ POST https://auth.razorpay.com/token
│     ├─ grant_type: authorization_code
│     ├─ client_id + client_secret (server-side, never exposed)
│     ├─ redirect_uri must match exactly
│     └─ mode: test (never 'live' for dev credentials)
├─ Encrypt access token (AES-256-GCM with creator_id + "access" AAD)
├─ Encrypt refresh token (AES-256-GCM with creator_id + "refresh" AAD)
├─ Save encrypted tokens to DB with 7-day access + 180-day refresh TTL
├─ Audit: "connected"
└─ Redirect: /dashboard/settings?razorpay=connected
```

**Security Layers:**
- State validated before code exchange (CSRF protection)
- Creator ID binding (cross-creator replay prevention)
- Client ID & environment validation (client isolation)
- One-time state consumption (replay prevention)
- Creator agreement re-validation (consent gate)
- Tokens encrypted immediately after exchange
- Code exchange server-side (never client-side)
- No tokens in response, logs, or URLs

#### 4. **Token Refresh** (Scheduled via Cron)
```
Vercel Cron → GET /api/cron/razorpay-token-refresh
│            (with Authorization: Bearer <CRON_SECRET>)
├─ Validate CRON_SECRET with timingSafeEqual
├─ Query tokens expiring within 14 days
├─ For each token:
│  ├─ Claim token with distributed lock (prevent concurrent refresh)
│  ├─ Decrypt refresh token using creator_id
│  ├─ Call Razorpay token endpoint with refresh_token grant
│  │  └─ grant_type: refresh_token (rotating token grant)
│  ├─ Receive new access + refresh token pair
│  ├─ Encrypt new tokens
│  ├─ Update DB with new pair + new expiry
│  ├─ Release lock
│  └─ Audit: "token_refresh_succeeded" or "reconnect_required"
└─ Return: { refreshed: N, failed: N, reconnectRequired: N }
```

**Refresh Features:**
- Distributed lock prevents concurrent refresh
- Rotating token grant (old refresh token rotates)
- Lock expires after 5 minutes if not released
- Gracefully handles refresh_token expiry (sets reconnect flag)
- No token data in response/logs
- Per-token-pair state management

#### 5. **Disconnect**
```
disconnectRazorpayConnectionAction()
├─ Load creator's current connection
├─ Revoke access token with Razorpay
├─ Revoke refresh token with Razorpay
├─ Mark connection as "disconnected"
├─ Clear all tokens from DB
├─ Audit: "disconnected" (or "disconnection_revocation_failed" if remote fails)
└─ Redirect: /dashboard/settings?razorpay=disconnected
```

**Revocation:**
- Best-effort remote revocation (graceful failure)
- Local disconnect even if remote revocation fails
- User warned if remote revocation could not be confirmed
- Can reconnect immediately after disconnect

---

## Security Highlights ✅

### Encryption
- **Algorithm:** AES-256-GCM
- **Key Length:** 256 bits (32 bytes)
- **IV:** 12 bytes, cryptographically random
- **Auth Tag:** 16 bytes, prevents tampering
- **AAD (Additional Authenticated Data):** `cloverloop-razorpay:{creatorId}:{purpose}:v1`
  - Purpose: "access" vs "refresh" (separate encryption)
  - Creator ID: binds token to creator (cross-creator decryption fails)
  - Version: allows future algorithm changes

**Result:** Tokens encrypted as `v1.{iv}.{tag}.{encrypted}`

### CSRF Protection
- **State:** 256-bit random value (base64url encoded)
- **Hash:** SHA-256 digest (hash stored, not original state)
- **Storage:** Only hash persisted in database
- **Validation:** Original state hashed and compared to stored hash
- **TTL:** 10 minutes (short window minimizes attack surface)
- **One-time Use:** Consumed state prevents replay

### Distributed Locking (Token Refresh)
- **Lock Mechanism:** UUID-based distributed lock
- **Lock TTL:** 5 minutes (prevents deadlock)
- **Scope:** Per creator-environment pair
- **Guarantee:** Only one concurrent refresh per creator
- **Failure Recovery:** Locks auto-expire

### Creator Isolation
- **Database RLS:** All tables have RLS enabled
- **Access Control:** Service-role only (no authenticated user access)
- **Server-Side Only:** Encryption/decryption happens server-side
- **Creator Binding:** AAD includes creator_id
- **Audit Trail:** Every action logged per creator
- **Unique Constraints:** Creator can't use same account twice

### API Security
- **No Token Leakage:** Tokens never in response bodies, URLs, or logs
- **Status Only:** Log messages contain only error codes/status
- **CRON_SECRET:[REDACTED]
- **Cache Control:** Responses include `Cache-Control: no-store, private`
- **Robots Exclusion:** `X-Robots-Tag: noindex, nofollow`

---

## Steps to Perform First OAuth Connection

### Prerequisites
✅ All environment variables configured in Vercel:
- `RAZORPAY_OAUTH_ENABLED` (currently `false` - will enable)
- `RAZORPAY_OAUTH_CLIENT_ID` (Development)
- `RAZORPAY_OAUTH_CLIENT_SECRET` (Development)
- `RAZORPAY_OAUTH_MODE=test`
- `RAZORPAY_TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET`

✅ Database migration applied to Supabase

✅ Creator account created and logged in

### Test Creator Preparation

1. **Create a test creator account** (if not already created)
   - Sign up at https://cloverloop.in/sign-up
   - Complete creator profile
   - Accept creator agreement at `/creator-agreement/accept`
   - Verify dashboard access at `/dashboard/settings`

2. **Prepare test Razorpay merchant account**
   - Log in to Razorpay Dashboard (test account): https://dashboard.razorpay.com/
   - Verify you have a test merchant account (not a live account)
   - Note the merchant ID (you'll see it during OAuth)

### First OAuth Connection Flow (Step-by-Step)

#### Step 1: Enable OAuth in Vercel
```bash
# In Vercel Dashboard → Environment Variables
RAZORPAY_OAUTH_ENABLED=true  ← Change from false to true
```
- **Wait:** 2-3 minutes for Vercel deployment to complete
- **Verify:** Visit https://cloverloop.in/dashboard/settings and check for OAuth card

#### Step 2: Navigate to Razorpay Connection Card
```
1. Open: https://cloverloop.in/dashboard/settings
2. Scroll to "Payments setup" section
3. Card title: "Razorpay account"
4. Look for: "Connect Razorpay" button
```

#### Step 3: Initiate OAuth Connection
```
1. Click "Connect Razorpay" button
2. Browser redirects to: https://auth.razorpay.com/authorize?state=...&client_id=...
3. You'll see Razorpay OAuth consent screen
```

#### Step 4: Authorize at Razorpay
```
On Razorpay OAuth screen:
1. Log in with your Razorpay test account credentials
2. Click "Authorize" to grant CloverLoop read_write access
3. Browser redirects back to: https://cloverloop.in/api/razorpay/callback?code=...&state=...
```

#### Step 5: Callback Processing
```
OAuth Callback Handler Does:
1. ✅ Validates your creator session
2. ✅ Validates OAuth state (CSRF check)
3. ✅ Exchanges authorization code for tokens
4. ✅ Encrypts tokens with your creator_id
5. ✅ Stores encrypted tokens in database
6. ✅ Redirects to: /dashboard/settings?razorpay=connected
```

#### Step 6: Verify Connection
```
At https://cloverloop.in/dashboard/settings:

Success State (green message):
├─ Message: "Your Razorpay account is connected."
├─ Merchant Account ID: acc_[xxxxx]  ← Your merchant ID
├─ Environment: test  ← Confirms test mode
├─ Token Expires: [Date] [Time]  ← Access token expiry
├─ Last Refreshed: [Date] [Time] or "Not yet refreshed"
└─ Button: "Disconnect Razorpay" (red button)

Error States:
├─ "state-error" → State validation failed (retry)
├─ "authorization-denied" → You denied authorization at Razorpay
├─ "exchange-error" → Code exchange with Razorpay failed (retry)
├─ "account-in-use" → This merchant account already connected to another creator
└─ "already-connected" → You have an active connection (disconnect first)
```

### Verification Checklist After Connection

- [ ] ✅ Connection status shows "connected" (green)
- [ ] ✅ Merchant account ID displayed (acc_xxx)
- [ ] ✅ Environment shows "test" (NOT "live")
- [ ] ✅ Token expiry date is ~7 days from now
- [ ] ✅ Disconnect button appears and is clickable
- [ ] ✅ No tokens visible in browser DevTools Network tab
- [ ] ✅ No tokens visible in Vercel/Supabase logs

### Test Token Refresh (Wait for Cron or Manual Test)

#### Option A: Wait for Automatic Cron
```
Next scheduled refresh: 4:00 AM UTC (daily)
Expected behavior:
├─ Vercel calls: GET /api/cron/razorpay-token-refresh
├─ Endpoint validates CRON_SECRET
├─ Queries tokens expiring within 14 days
├─ Finds your test connection (not expiring yet, but will succeed anyway)
├─ Calls Razorpay token endpoint with refresh_token grant
├─ Receives new access + refresh token pair
├─ Encrypts and stores new pair
└─ Audit log records: "token_refresh_succeeded"
```

#### Option B: Manual Cron Test (Verify Endpoint Works)
```bash
# Call the cron endpoint with CRON_SECRET
curl -X GET "https://cloverloop.in/api/cron/razorpay-token-refresh" \
  -H "Authorization: Bearer qiUzPhaDOnNkAo7e3pmNrcbUULhcFAmn2VcwrxCoy+c=" \
  -H "Content-Type: application/json"

# Expected Response (200 OK):
{
  "refreshed": 0,
  "failed": 0,
  "reconnectRequired": 0
}

# Or if your token is within 14-day window:
{
  "refreshed": 1,
  "failed": 0,
  "reconnectRequired": 0
}
```

### Test Disconnect

```
1. Navigate to: https://cloverloop.in/dashboard/settings
2. Click "Disconnect Razorpay" button
3. Handler does:
   ├─ Calls Razorpay API to revoke access token
   ├─ Calls Razorpay API to revoke refresh token
   ├─ Updates DB status to "disconnected"
   ├─ Clears all tokens from DB
   └─ Redirects to: /dashboard/settings?razorpay=disconnected

4. Verify:
   ├─ Message: "Your Razorpay connection is disconnected." (green)
   ├─ No merchant account ID shown
   ├─ Button changes to: "Connect Razorpay" (can reconnect immediately)
```

### Test Reconnect

```
1. Click "Connect Razorpay" button again
2. Repeat OAuth flow (goes back to Razorpay consent screen)
3. Authorize again
4. New connection created (different token pair, same merchant account)
```

---

## Outstanding Issues & Recommendations

### ⚠️ Issue #1: Test vs Live Connections
**Severity:** MEDIUM
**Current State:** Database schema allows only one connection per creator_id (primary key)
**Impact:** Creator can't have both test AND live connections simultaneously

**Options:**
- ✅ **Option A (Recommended):** Accept current behavior - enforce one connection at a time
- ✅ **Option B:** Migrate schema to support (creator_id, environment) composite key

**No action required** for current testing - this is fine for dev/test purposes.

### ⚠️ Issue #2: Cron Endpoint Missing Readiness Check
**Severity:** LOW
**Current State:** Token refresh continues even if `RAZORPAY_OAUTH_ENABLED=false`
**Recommendation:** Add readiness check in cron handler (not critical for testing)

---

## Success Criteria ✅

Your OAuth implementation is **PRODUCTION-READY** when:

1. ✅ First OAuth connection succeeds (this guide shows how)
2. ✅ Test merchant account connects in test mode
3. ✅ Token refresh completes without errors
4. ✅ Disconnect revokes tokens locally and remotely
5. ✅ Reconnect creates new connection with new token pair
6. ✅ No sensitive data exposed in logs/responses
7. ✅ Creator isolation enforced (test creator can't see other creators' connections)
8. ✅ Free product claims work independently (not affected by OAuth enablement)

---

## Next Steps

### To Enable OAuth (When Ready)

1. **In Vercel Dashboard:**
   ```
   Environment Variables → Update
   RAZORPAY_OAUTH_ENABLED: false → true
   ```

2. **Wait for deployment:** 2-3 minutes

3. **Follow this guide:** Perform first OAuth connection test

4. **Verify:** All success criteria met

5. **Monitor Supabase:** Check audit logs in `razorpay_connection_audit` table

---

## Support & Debugging

### View Audit Trail
```sql
-- In Supabase SQL Editor
SELECT * FROM razorpay_connection_audit
  WHERE creator_id = 'YOUR_CREATOR_ID'
  ORDER BY created_at DESC
  LIMIT 10;
```

### Check Active Connections
```sql
SELECT
  creator_id,
  razorpay_account_id,
  environment,
  connection_status,
  token_expires_at,
  last_refreshed_at
FROM creator_razorpay_connections
WHERE creator_id = 'YOUR_CREATOR_ID';
```

### Monitor Vercel Logs
```
Vercel Dashboard → Deployments → Functions → /api/razorpay/callback
                                          → /api/cron/razorpay-token-refresh
```

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/razorpay/oauth.ts` | Core OAuth encryption, state, token handling |
| `src/app/api/razorpay/callback/route.ts` | OAuth callback handler (state validation, code exchange) |
| `src/app/api/cron/razorpay-token-refresh/route.ts` | Scheduled token refresh cron job |
| `src/app/dashboard/razorpay/actions.ts` | Connection start/disconnect actions |
| `src/components/dashboard/razorpay-connection-card.tsx` | UI component for connection display |
| `supabase/migrations/20261112110000_razorpay_oauth_connections.sql` | Database schema |
| `tests/razorpay-oauth.test.ts` | Comprehensive unit tests |
| `vercel.json` | Cron schedule configuration |

---

**Generated:** 2026-11-13 14:10 UTC
**Status:** ✅ All verification tasks completed successfully
**Ready for OAuth enablement and testing**
