import type { Metadata } from "next";
import { StorefrontEditor } from "@/components/storefront/storefront-editor";
import { PaymentSetupWarning } from "@/components/dashboard/payment-setup-warning";
import { requireCreatorContext } from "@/lib/account/server";
import { getCreatorStorefront } from "@/lib/storefront/server";
import { getRazorpayCheckoutConnectionStatus } from "@/lib/razorpay/checkout";

export const metadata: Metadata = {
  title: "Storefront | CloverLoop creator dashboard",
  robots: { index: false, follow: false },
};

export default async function CreatorStorefrontPage() {
  const { supabase, user } = await requireCreatorContext();
  const [storefront, paymentConnectionStatus] = await Promise.all([
    getCreatorStorefront(supabase, user.id),
    getRazorpayCheckoutConnectionStatus(user.id),
  ]);

  return (
    <div className="dashboard-page-content">
      {paymentConnectionStatus === "not_connected" ? <PaymentSetupWarning /> : null}
      <StorefrontEditor initialStorefront={storefront} />
    </div>
  );
}
