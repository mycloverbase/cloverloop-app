import "server-only";
import { NextResponse } from "next/server";

export function reviewJsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export const reviewTokenErrors: Record<string, { status: number; error: string; state: string }> = {
  RVINV: { status: 404, error: "This review link is invalid. Use the link from your review invitation email.", state: "invalid" },
  RVEXP: { status: 410, error: "This review link has expired.", state: "expired" },
  RVUSE: { status: 409, error: "A review has already been submitted for this purchase.", state: "used" },
  RVINE: { status: 403, error: "This purchase is no longer eligible for a review.", state: "ineligible" },
};
