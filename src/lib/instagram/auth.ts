import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";

export type InstagramRequestContext =
  | { ok: true; userId: string; admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>> }
  | { ok: false; response: NextResponse };

export async function getInstagramRequestContext(): Promise<InstagramRequestContext> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Instagram services are not configured." }, { status: 503 }),
    };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sign in to manage Instagram automations." }, { status: 401 }),
    };
  }
  if (!(await creatorAgreementIsAccepted(supabase))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Accept the Creator Agreement before managing Instagram automations." },
        { status: 403 },
      ),
    };
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Instagram services are temporarily unavailable." }, { status: 503 }),
    };
  }
  return { ok: true, userId: user.id, admin };
}

export async function checkInstagramRateLimit(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  creatorId: string,
  bucket: string,
  maximum: number,
  windowSeconds = 60,
): Promise<boolean | null> {
  const { data, error } = await admin.rpc("check_instagram_rate_limit", {
    requested_creator_id: creatorId,
    requested_bucket: bucket,
    requested_maximum: maximum,
    requested_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("Could not check Instagram request rate limits.", error);
    return null;
  }
  return data === true;
}

export async function markInstagramConnectionRequiresReauthorization(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  connectionId: string,
): Promise<void> {
  const { error: connectionError } = await admin
    .from("instagram_connections")
    .update({ connection_status: "reauthorization_required" })
    .eq("id", connectionId)
    .eq("connection_status", "connected");
  if (connectionError) {
    console.error("Could not mark an Instagram connection for reauthorization.", connectionError);
  }
  const { error: pauseError } = await admin
    .from("instagram_automations")
    .update({ status: "paused" })
    .eq("instagram_connection_id", connectionId)
    .eq("status", "active");
  if (pauseError) console.error("Could not pause automations for an Instagram connection requiring reauthorization.", pauseError);
}

export function isSameOriginRequest(request: Request): boolean {
  const requestOrigin = request.headers.get("origin");
  const expectedOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return Boolean(requestOrigin && expectedOrigin && requestOrigin === expectedOrigin);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
