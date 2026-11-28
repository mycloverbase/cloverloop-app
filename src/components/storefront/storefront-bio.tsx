"use client";

import { useEffect, useRef, useState } from "react";

export function StorefrontBio({ description }: { description: string }) {
  const bioRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const collapsedText = description.replace(/\s*\n+\s*/g, " ");
  const hasParagraphs = collapsedText !== description;

  useEffect(() => {
    const bio = bioRef.current;
    if (!bio) return;

    const measureOverflow = () => {
      if (!expanded) setCanExpand(hasParagraphs || bio.scrollHeight > bio.clientHeight + 1);
    };

    const observer = new ResizeObserver(measureOverflow);
    observer.observe(bio);
    const frame = requestAnimationFrame(measureOverflow);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [description, expanded, hasParagraphs]);

  return (
    <div className="storefront-profile-bio-wrap">
      <p
        ref={bioRef}
        className={`storefront-profile-bio${expanded ? " is-expanded" : ""}`}
      >
        {expanded ? description : collapsedText}
      </p>
      {canExpand ? (
        <button
          type="button"
          className="storefront-profile-bio-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}
