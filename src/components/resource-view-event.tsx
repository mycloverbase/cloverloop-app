"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export function ResourceViewEvent({ slug }: { slug: string }) {
  useEffect(() => {
    track("resource_view", { resource: slug });
  }, [slug]);
  return null;
}
