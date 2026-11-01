"use client";

import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

const categories = ["Music", "Education", "Design", "Business", "Finance", "Fitness", "Lifestyle", "Other"];
const products = ["Ebook", "PDF guide", "Presets", "Templates", "Printables", "Music tabs", "Audio files", "Educational resources", "Other"];
const channels = ["Instagram", "YouTube", "Email", "Website", "WhatsApp", "Multiple channels"];

const audienceByCategory: Record<string, string> = {
  Music: "musician",
  Education: "educator",
  Design: "designer",
  Business: "business creator",
  Finance: "finance educator",
  Fitness: "fitness creator",
  Lifestyle: "lifestyle creator",
  Other: "creator",
};

function getIdeaLibrary(category: string, product: string, channel: string) {
  const audience = audienceByCategory[category] ?? "creator";
  const medium: Record<string, string> = {
    Instagram: "an Instagram carousel or short reel",
    YouTube: "a short YouTube video or tutorial",
    Email: "a concise email",
    Website: "a useful page or article on your website",
    WhatsApp: "a helpful WhatsApp message",
    "Multiple channels": "coordinated posts across your selected channels",
  };
  const format = medium[channel] ?? "a useful post";
  return [
    `Demonstrate a real result supported by your ${product.toLowerCase()} in ${format}. A ${audience} could show the process or a clear before-and-after example.`,
    `Teach one practical idea related to your ${product.toLowerCase()} in ${format}, then explain where someone can explore the full resource.`,
    `Create an accurate preview of the ${product.toLowerCase()}: show representative pages, files or examples and clearly explain what is included.`,
    `Describe a specific problem your audience faces and show how the ${product.toLowerCase()} can help with that task.`,
    `Compare the steps in a realistic manual workflow with a workflow supported by your ${product.toLowerCase()}. Keep the comparison specific and honest.`,
    `Share the creation process behind your ${product.toLowerCase()}: explain a design choice, example or research decision that could help a ${audience}.`,
    `Offer a small, useful sample from your ${product.toLowerCase()} so potential customers can judge its style and relevance before deciding.`,
    `Turn a recurring audience question into ${format}, answer it clearly and link to the section of your ${product.toLowerCase()} that covers the topic further.`,
    `Build a related bundle around the same customer need. A ${audience} might pair the ${product.toLowerCase()} with a complementary checklist, guide or template.`,
    `Plan a short series of ${format} for different stages of one audience problem, with each piece pointing to the relevant part of your ${product.toLowerCase()}.`,
  ];
}

export function MarketingIdeasTool() {
  const [category, setCategory] = useState("Music");
  const [product, setProduct] = useState("Ebook");
  const [channel, setChannel] = useState("Instagram");
  const [offset, setOffset] = useState(0);
  const [generated, setGenerated] = useState(false);

  const library = getIdeaLibrary(category, product, channel);
  const ideas = Array.from({ length: 3 }, (_, index) =>
    library[(offset + index) % library.length],
  );

  function generate(nextSet: boolean) {
    if (nextSet) setOffset((current) => (current + 3) % library.length);
    setGenerated(true);
  }

  return (
    <section className="tool-shell">
      <div className="tool-form">
        <label>
          Creator category
          <select value={category} onChange={(event) => { setCategory(event.target.value); setOffset(0); }}>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Product type
          <select value={product} onChange={(event) => setProduct(event.target.value)}>
            {products.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Marketing channel
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            {channels.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <div className="tool-actions">
          <button type="button" className="button" onClick={() => generate(false)}>
            <Sparkles size={16} /> Generate ideas
          </button>
          {generated && (
            <button type="button" className="button button-secondary" onClick={() => generate(true)}>
              <RefreshCw size={16} /> Generate another set
            </button>
          )}
        </div>
      </div>
      {generated ? (
        <div className="generated-ideas" aria-live="polite">
          <h2>Ideas for {category.toLowerCase()} creators</h2>
          <p>For {product.toLowerCase()} on {channel}.</p>
          <ol>{ideas.map((idea, index) => <li key={`${offset}-${index}`}>{idea}</li>)}</ol>
        </div>
      ) : (
        <p className="tool-help">Choose your creator category, product and channel to see practical ideas from the predefined library.</p>
      )}
      <p className="tool-disclosure">Suggestions are selected and adapted locally from a predefined library. No AI service is used.</p>
    </section>
  );
}
