import Link from "next/link";

export function PaymentSetupWarning() {
  return (
    <p className="dashboard-message dashboard-message-warning">
      Paid product payments are unavailable until you connect Razorpay.{" "}
      <Link href="/dashboard/settings">Complete Payment Setup in Settings</Link>.
    </p>
  );
}
