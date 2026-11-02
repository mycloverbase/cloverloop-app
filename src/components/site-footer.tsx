import Image from "next/image";
import Link from "next/link";
import { publicLinks } from "@/lib/site";

const groups = [
  { title: "Features", links: publicLinks.features },
  { title: "Company", links: publicLinks.company },
  { title: "Resources", links: publicLinks.resources },
  { title: "Compare Platforms", links: publicLinks.comparisons },
  { title: "Legal", links: publicLinks.legal },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page-width">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" aria-label="CloverLoop home">
              <Image src="/images/brand/logo.png" alt="CloverLoop" width={152} height={56} />
            </Link>
            <p>Your audience. Your products. Your own storefront.</p>
          </div>
          {groups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}><Link href={link.href}>{link.label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} CloverLoop. All rights reserved.</span>
          <span>Made for independent creators.</span>
        </div>
      </div>
    </footer>
  );
}
