"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { track, type AnalyticsEvent } from "@/lib/analytics";

type Props = ComponentProps<typeof Link> & {
  event: AnalyticsEvent;
  eventValue?: string;
};

export function TrackLink({ event, eventValue, onClick, ...props }: Props) {
  return (
    <Link
      {...props}
      onClick={(clickEvent) => {
        track(event, eventValue ? { target: eventValue } : {});
        onClick?.(clickEvent);
      }}
    />
  );
}
