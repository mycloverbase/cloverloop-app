import { NextResponse } from "next/server";
import { getSearchIndex } from "@/lib/help";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(getSearchIndex());
}
