import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  FOUNDER_REFERRAL_COOKIE,
  getFounderReferralIssuedAt,
} from "@/lib/referrals/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const cookieStore = await cookies();
  const referralIssuedAt = getFounderReferralIssuedAt(
    cookieStore.get(FOUNDER_REFERRAL_COOKIE)?.value,
  );
  if (referralIssuedAt === null) {
    return NextResponse.json({ attributed: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Referral attribution is temporarily unavailable." }, { status: 503 });
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  const accountCreatedAt = user?.created_at ? Date.parse(user.created_at) : Number.NaN;
  if (userError || !user) {
    console.error("Could not verify an account for founder referral attribution.", userError);
    return NextResponse.json({ error: "Referral attribution could not be verified." }, { status: 401 });
  }
  if (!Number.isFinite(accountCreatedAt) || accountCreatedAt < referralIssuedAt) {
    cookieStore.delete(FOUNDER_REFERRAL_COOKIE);
    return NextResponse.json({ attributed: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    console.error("Founder referral attribution could not be stored because Supabase admin access is unavailable.");
    return NextResponse.json({ error: "Referral attribution is temporarily unavailable." }, { status: 503 });
  }
  const { error } = await admin.rpc("record_founding_creator_referral", {
    requested_creator_id: user.id,
  });
  if (error) {
    console.error("Could not store verified founder referral attribution.", error);
    return NextResponse.json({ error: "Referral attribution is temporarily unavailable." }, { status: 503 });
  }
  cookieStore.delete(FOUNDER_REFERRAL_COOKIE);
  return NextResponse.json({ attributed: true }, { headers: { "Cache-Control": "no-store" } });
}
