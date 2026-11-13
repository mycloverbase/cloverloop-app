"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

export function RazorpayActionButton({
  className,
  disabled = false,
  label,
  pendingLabel,
}: {
  className: string;
  disabled?: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : null}
      <span aria-live="polite">{pending ? pendingLabel : label}</span>
    </button>
  );
}
