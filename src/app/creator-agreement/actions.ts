"use server";

import { cookies, headers } from "next/headers";
import {
  clientIpAddress,
  createCreatorAgreementAcceptanceProof,
  CREATOR_AGREEMENT_PROOF_COOKIE,
  creatorAgreementIsAccepted,
  recordCreatorAgreementAcceptance,
} from "@/lib/account/creator-agreement-consent";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProofResult = { ok: true } | { ok: false; message: string };
type ActionResult = { ok: true; message: string } | { ok: false; message: string };

export async function issueCreatorAgreementAcceptanceProofAction(
  agreementAccepted: boolean,
  ageConfirmed: boolean,
): Promise<ProofResult> {
  if (agreementAccepted !== true) {
    return { ok: false, message: "Please accept the Creator Agreement to continue." };
  }
  if (ageConfirmed !== true) {
    return { ok: false, message: "Please confirm that you are at least 18 years old to continue." };
  }
  const proof = createCreatorAgreementAcceptanceProof();
  if (!proof) {
    return { ok: false, message: "Signup consent services are unavailable. Please try again later." };
  }
  const cookieStore = await cookies();
  cookieStore.set(CREATOR_AGREEMENT_PROOF_COOKIE, proof, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true };
}

export async function recordCreatorAgreementAcceptanceAction(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Agreement acceptance services are not configured." };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (error) console.error("Could not verify the account for agreement acceptance.", error);
    return { ok: false, message: "Please sign in again to accept the Creator Agreement." };
  }
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const proof = cookieStore.get(CREATOR_AGREEMENT_PROOF_COOKIE)?.value;
  if (!proof) {
    return { ok: false, message: "Please review and accept the current Creator Agreement." };
  }
  const result = await recordCreatorAgreementAcceptance(
    user,
    proof,
    clientIpAddress(requestHeaders),
  );
  if (result.ok) cookieStore.delete(CREATOR_AGREEMENT_PROOF_COOKIE);
  return result.ok
    ? { ok: true, message: "Creator Agreement acceptance recorded." }
    : result;
}

export async function acceptCreatorAgreementAction(
  agreementAccepted: boolean,
  ageConfirmed: boolean,
): Promise<ActionResult> {
  if (agreementAccepted !== true) {
    return { ok: false, message: "Please accept the Creator Agreement to continue." };
  }
  if (ageConfirmed !== true) {
    return { ok: false, message: "Please confirm that you are at least 18 years old to continue." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Agreement acceptance services are not configured." };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (error) console.error("Could not verify the account for agreement acceptance.", error);
    return { ok: false, message: "Please sign in again to accept the Creator Agreement." };
  }

  const alreadyAccepted = await creatorAgreementIsAccepted(supabase);
  if (alreadyAccepted) return { ok: true, message: "Creator Agreement already accepted." };

  const proof = createCreatorAgreementAcceptanceProof();
  if (!proof) {
    return { ok: false, message: "Agreement acceptance services are unavailable. Please try again later." };
  }
  const requestHeaders = await headers();
  const result = await recordCreatorAgreementAcceptance(
    user,
    proof,
    clientIpAddress(requestHeaders),
  );
  if (result.ok) {
    const cookieStore = await cookies();
    cookieStore.delete(CREATOR_AGREEMENT_PROOF_COOKIE);
  }
  return result.ok
    ? { ok: true, message: "Creator Agreement acceptance recorded." }
    : result;
}
