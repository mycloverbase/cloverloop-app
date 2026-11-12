import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const CREATOR_AGREEMENT_ID = "creator_agreement";
export const CREATOR_AGREEMENT_VERSION = "1.0";
export const CREATOR_AGREEMENT_PROOF_COOKIE = "cloverloop-creator-agreement-proof";

type AcceptanceProof = {
  agreementId: typeof CREATOR_AGREEMENT_ID;
  version: typeof CREATOR_AGREEMENT_VERSION;
  acceptedAt: string;
  ageConfirmed: true;
  nonce: string;
};

function signingKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

export function createCreatorAgreementAcceptanceProof(): string | null {
  const key = signingKey();
  if (!key) return null;

  const proof: AcceptanceProof = {
    agreementId: CREATOR_AGREEMENT_ID,
    version: CREATOR_AGREEMENT_VERSION,
    acceptedAt: new Date().toISOString(),
    ageConfirmed: true,
    nonce: randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(proof)).toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function parseAcceptanceProof(value: unknown): AcceptanceProof | null {
  const key = signingKey();
  if (!key || typeof value !== "string") return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  const expected = createHmac("sha256", key).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("agreementId" in parsed) ||
    parsed.agreementId !== CREATOR_AGREEMENT_ID ||
    !("version" in parsed) ||
    parsed.version !== CREATOR_AGREEMENT_VERSION ||
    !("acceptedAt" in parsed) ||
    typeof parsed.acceptedAt !== "string" ||
    !Number.isFinite(Date.parse(parsed.acceptedAt)) ||
    !("ageConfirmed" in parsed) ||
    parsed.ageConfirmed !== true ||
    !("nonce" in parsed) ||
    typeof parsed.nonce !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(parsed.nonce)
  ) {
    return null;
  }
  return parsed as AcceptanceProof;
}

export function clientIpAddress(headers: Headers): string | null {
  const realIp = headers.get("x-real-ip")?.trim();
  const forwardedIp = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = realIp || forwardedIp || "";
  return isIP(candidate) ? candidate : null;
}

export async function recordCreatorAgreementAcceptance(
  user: User,
  proofValue: unknown,
  ipAddress: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const proof = parseAcceptanceProof(proofValue);
  if (!proof) return { ok: false, message: "Please review and accept the current Creator Agreement." };

  const accountCreatedAt = Date.parse(user.created_at);
  const acceptedAt = Date.parse(proof.acceptedAt);
  if (!Number.isFinite(accountCreatedAt) || acceptedAt < accountCreatedAt - 15 * 60 * 1000) {
    return { ok: false, message: "This acceptance could not be matched to the new account. Please accept again." };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false, message: "Agreement acceptance could not be recorded. Please try again later." };
  }

  const { data: existing, error: existingError } = await admin
    .from("creator_agreement_acceptances")
    .select("id")
    .eq("user_id", user.id)
    .eq("agreement_id", CREATOR_AGREEMENT_ID)
    .eq("version", CREATOR_AGREEMENT_VERSION)
    .maybeSingle();
  if (existingError) {
    console.error("Could not check for an existing Creator Agreement acceptance.", existingError);
    return { ok: false, message: "Agreement acceptance could not be verified. Please try again." };
  }
  if (existing) return { ok: true };

  const { error: insertError } = await admin.from("creator_agreement_acceptances").insert({
    user_id: user.id,
    agreement_id: CREATOR_AGREEMENT_ID,
    version: CREATOR_AGREEMENT_VERSION,
    accepted_at: proof.acceptedAt,
    acceptance_status: "accepted",
    age_confirmed: proof.ageConfirmed,
    ip_address: ipAddress,
  });
  if (!insertError) return { ok: true };
  if (insertError.code === "23505") return { ok: true };

  console.error("Could not record Creator Agreement acceptance.", insertError);
  return { ok: false, message: "Agreement acceptance could not be recorded. Please try again later." };
}

export async function creatorAgreementIsAccepted(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_my_creator_agreement_status");
  if (error) {
    console.error("Could not verify Creator Agreement acceptance.", error);
    return false;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return typeof row === "object" &&
    row !== null &&
    "accepted" in row &&
    row.accepted === true;
}
