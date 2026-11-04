import { ArrowRight } from "lucide-react";
import { TrackLink } from "@/components/track-link";

export function PublicCta({
  title = "Give your digital products a dedicated home.",
  body = "Plan how to present your work and connect it with the people who value it.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="cta-section">
      <div className="page-width cta-inner">
        <div>
          <span className="eyebrow">A home for your work</span>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        <TrackLink href="/signup" event="signup_click" className="button button-light">
          Get Started for Free <ArrowRight size={17} />
        </TrackLink>
      </div>
    </section>
  );
}
