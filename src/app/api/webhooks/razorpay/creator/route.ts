import { POST as handleRazorpayWebhook } from "../route";

export async function POST(request: Request) {
  return handleRazorpayWebhook(request);
}
