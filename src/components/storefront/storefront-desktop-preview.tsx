"use client";

import { useEffect, useState } from "react";
import { PublicStorefront, type StorefrontView } from "@/components/storefront/public-storefront";

export function StorefrontDesktopPreview({ channelId }: { channelId: string }) {
  const [store, setStore] = useState<StorefrontView | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel(channelId);
    channel.onmessage = (event: MessageEvent<{ type?: string; store?: StorefrontView }>) => {
      if (event.data?.type === "store" && event.data.store) setStore(event.data.store);
    };
    channel.postMessage({ type: "ready" });
    return () => channel.close();
  }, [channelId]);

  if (store) return <PublicStorefront store={store} />;

  return (
    <main className="storefront-preview-loading" aria-live="polite">
      <p>Loading desktop storefront preview…</p>
    </main>
  );
}
