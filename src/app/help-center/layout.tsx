import type { ReactNode } from "react";
import { HelpHeader } from "@/components/help/help-header";
import { SiteFooter } from "@/components/site-footer";

export default function HelpCenterLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <HelpHeader />
      <main className="help-main">{children}</main>
      <SiteFooter />
    </>
  );
}
