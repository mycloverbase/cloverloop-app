import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { safeInternalPath } from "@/lib/auth-redirect";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  clientIpAddress,
  CREATOR_AGREEMENT_PROOF_COOKIE,
  creatorAgreementIsAccepted,
  recordCreatorAgreementAcceptance,
} from "@/lib/account/creator-agreement-consent";
import {
  FOUNDER_REFERRAL_COOKIE,
  getFounderReferralIssuedAt,
} from "@/lib/referrals/server";

export async function GET(request: NextRequest) {
  const clearAcceptanceProof = (response: NextResponse) => {
    response.cookies.set(CREATOR_AGREEMENT_PROOF_COOKIE, "", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const config = getSupabaseConfig();
  const code = request.nextUrl.searchParams.get("code");
  if (!config || !code) {
    const response = clearAcceptanceProof(NextResponse.redirect(new URL("/login?error=callback", request.url)));
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  const nextPath = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const consentParam = request.nextUrl.searchParams.get("marketing_consent");
  const marketingConsent = consentParam === "1" ? true : consentParam === "0" ? false : null;
  const agreementProof = request.cookies.get(CREATOR_AGREEMENT_PROOF_COOKIE)?.value;
  const response = NextResponse.redirect(new URL(nextPath, request.url));
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const failure = clearAcceptanceProof(NextResponse.redirect(new URL("/login?error=callback", request.url)));
    failure.headers.set("X-Robots-Tag", "noindex, nofollow");
    return failure;
  }
  if (marketingConsent !== null) {
    const { error: consentError } = await supabase.rpc("save_my_marketing_consent", {
      requested_consent: marketingConsent,
    });
    if (consentError) {
      console.error("Could not save marketing consent after authentication.", consentError);
      const failure = clearAcceptanceProof(NextResponse.redirect(new URL("/login?error=consent", request.url)));
      failure.headers.set("X-Robots-Tag", "noindex, nofollow");
      return failure;
    }
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  let agreementAccepted = false;
  if (userError || !user) {
    console.error("Could not verify Creator Agreement acceptance after authentication.", userError);
  } else if (agreementProof) {
    const acceptance = await recordCreatorAgreementAcceptance(
      user,
      agreementProof,
      clientIpAddress(request.headers),
    );
    if (!acceptance.ok) {
      console.error("The Creator Agreement acceptance proof could not be recorded.");
    } else {
      agreementAccepted = await creatorAgreementIsAccepted(supabase);
    }
  } else {
    agreementAccepted = await creatorAgreementIsAccepted(supabase);
  }

  const referralIssuedAt = getFounderReferralIssuedAt(
    request.cookies.get(FOUNDER_REFERRAL_COOKIE)?.value,
  );
  if (referralIssuedAt !== null) {
    const { data: { user: referralUser }, error: referralUserError } = await supabase.auth.getUser();
    const accountCreatedAt = referralUser?.created_at ? Date.parse(referralUser.created_at) : Number.NaN;
    if (referralUserError || !referralUser) {
      console.error("Could not verify the founder referral account.", referralUserError);
      response.headers.set("Location", new URL("/dashboard?referral=save-error", request.url).toString());
    } else if (Number.isFinite(accountCreatedAt) && accountCreatedAt >= referralIssuedAt) {
      const admin = createSupabaseAdminClient();
      if (!admin) {
        console.error("Founder referral attribution could not be stored because Supabase admin access is unavailable.");
        response.headers.set("Location", new URL("/dashboard?referral=save-error", request.url).toString());
      } else {
        const { error: referralError } = await admin.rpc("record_founding_creator_referral", {
          requested_creator_id: referralUser.id,
        });
        if (referralError) {
          console.error("Could not store verified founder referral attribution.", referralError);
          response.headers.set("Location", new URL("/dashboard?referral=save-error", request.url).toString());
        } else {
          response.cookies.set(FOUNDER_REFERRAL_COOKIE, "", {
            httpOnly: true,
            secure: request.nextUrl.protocol === "https:",
            sameSite: "lax",
            path: "/",
            maxAge: 0,
          });
        }
      }
    } else {
      response.cookies.set(FOUNDER_REFERRAL_COOKIE, "", {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
  }
  if (!agreementAccepted) {
    const signupUrl = new URL("/signup", request.url);
    signupUrl.searchParams.set("consent", "required");
    signupUrl.searchParams.set("next", nextPath);
    response.headers.set("Location", signupUrl.toString());
  }
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return clearAcceptanceProof(response);
}
