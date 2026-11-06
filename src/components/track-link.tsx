import Link from "next/link";
import type { ComponentProps } from "react";
import type { AnalyticsEvent } from "@/lib/analytics";

type Props = Omit<ComponentProps<typeof Link>, "onClick"> & {
  event: AnalyticsEvent;
  eventValue?: string;
};

export function TrackLink({ event, eventValue, ...props }: Props) {
  return (
    <Link
      {...props}
      data-analytics-event={event}
      data-analytics-event-value={eventValue}
    />
  );
}
