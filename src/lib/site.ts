export const SITE_NAME = "CloverLoop";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://cloverloop.in";
export const PRODUCTION_URL = "https://cloverloop.in";
export const GTM_ID = "GTM-K4BMMLN3";
export const ANALYTICS_CONSENT_KEY = "cloverloop-analytics-consent";

export function canonical(path: string) {
  return `${PRODUCTION_URL}${path === "/" ? "" : path}`;
}

export const publicLinks = {
  features: [
    { label: "Sell Online", href: "/sell-online" },
    { label: "Sell Digital Downloads", href: "/sell-digital-downloads" },
    { label: "Store Builder", href: "/store-builder" },
    { label: "Payment Gateways", href: "/payment-gateways" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Pricing", href: "/pricing" },
    { label: "Help Center", href: "/help-center" },
    { label: "Email Us", href: "/contact" },
    { label: "FAQ", href: "/faq" },
    { label: "Reviews", href: "/reviews" },
    { label: "Sitemap", href: "/sitemap" },
    { label: "Partner Program", href: "/partner-program" },
  ],
  legal: [
    { label: "Terms of Use", href: "/terms" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Refund & Cancellation Policy", href: "/refunds" },
    { label: "Cookie Policy", href: "/cookies" },
    { label: "Disclaimer", href: "/disclaimer" },
  ],
  resources: [
    { label: "Marketing ideas tool", href: "/resources/marketing-ideas-tool" },
    { label: "How to sell digital products online", href: "/resources/how-to-sell-digital-products-online" },
    { label: "Best platform to sell digital products in India", href: "/resources/best-platform-to-sell-digital-products-india-2026" },
    { label: "How to price digital products", href: "/resources/how-to-price-digital-products" },
    { label: "Digital product ideas and templates", href: "/resources/how-to-sell-templates-online" },
    { label: "UPI, Razorpay and payment fees", href: "/resources/accept-upi-payments-digital-products-razorpay" },
    { label: "GST registration for digital product sellers", href: "/resources/do-you-need-gst-registration-to-sell-online" },
    { label: "Digital product earnings calculator", href: "/resources/how-many-sales-to-hit-your-income-goal" },
    { label: "Create and sell an online course", href: "/resources/how-to-create-and-sell-online-course-india" },
    { label: "GST on ebooks and online courses", href: "/resources/gst-on-ebooks-and-online-courses-india" },
    { label: "How to write an ebook", href: "/resources/how-to-write-an-ebook" },
    { label: "How to sell presets", href: "/resources/how-to-sell-presets" },
    { label: "How to sell printables", href: "/resources/how-to-sell-printables" },
    { label: "How to sell ebooks", href: "/resources/how-to-sell-ebooks" },
    { label: "How to sell Canva templates", href: "/resources/how-to-sell-canva-templates" },
    { label: "Online Course Ideas", href: "/resources/online-course-ideas" },
    { label: "Content Creator", href: "/resources/content-creator" },
    { label: "Digital Products", href: "/resources/digital-products" },
    { label: "Resource Hub", href: "/resources" },
  ],
  comparisons: [
    { label: "All platform comparisons", href: "/compare" },
    { label: "CloverLoop vs SuperProfile", href: "/compare/cloverloop-vs-superprofile" },
    { label: "CloverLoop vs Gumroad", href: "/compare/cloverloop-vs-gumroad" },
    { label: "CloverLoop vs Payhip", href: "/compare/cloverloop-vs-payhip" },
    { label: "CloverLoop vs Instamojo", href: "/compare/cloverloop-vs-instamojo" },
  ],
};

const footerResourceHrefs = new Set([
  "/resources/marketing-ideas-tool",
  "/resources/how-to-sell-digital-products-online",
  "/resources/how-to-sell-templates-online",
  "/resources/online-course-ideas",
  "/resources",
]);

export const footerResourceLinks = publicLinks.resources.filter((link) =>
  footerResourceHrefs.has(link.href),
);

export const featurePages = [
  {
    slug: "sell-online",
    title: "Creator Storefronts for Digital Products | CloverLoop",
    description:
      "Explore CloverLoop's creator storefront concept and published plans for digital-product creators.",
    heading: "Plan a direct-to-audience digital product offer",
    intro:
      "Explore a dedicated storefront concept for digital products, with clear published plan pricing for creators.",
    image: "/images/home/digital-product-collection.webp",
    imageAlt: "A collection of digital products for independent creators",
    sections: [
      {
        heading: "A direct destination for your work",
        body: "A dedicated storefront can bring your ebooks, templates, presets, printables and other downloadable resources together in one shareable destination.",
      },
      {
        heading: "Built around creator ownership",
        body: "CloverLoop's published platform commission is separate from processing fees set by Razorpay or another payment provider. Creators pay provider charges separately under the provider's terms.",
      },
      {
        heading: "A clear buying journey",
        body: "Clear product descriptions and delivery instructions help creators explain what buyers can expect.",
      },
    ],
  },
  {
    slug: "sell-digital-downloads",
    title: "Plan Digital Downloads Online | CloverLoop",
    description:
      "Guidance for preparing a clear digital download experience for ebooks, templates, presets and other creator products.",
    heading: "Plan a clear digital download offer",
    intro:
      "Plan clear product details and access instructions for downloadable products such as ebooks, templates and presets.",
    image: "/images/home/digital-product-collection.webp",
    imageAlt: "Digital product formats including guides, templates and creative downloads",
    sections: [
      {
        heading: "Make the download easy to understand",
        body: "Describe the file format, compatibility and included materials so customers can make an informed decision before they buy.",
      },
      {
        heading: "Designed for controlled access",
        body: "Explain how customers can access a digital file, including file type, usage instructions and any access limits.",
      },
      {
        heading: "Make downloads easy to use",
        body: "Choose clear file names and formats, and include simple instructions so customers can use what they purchased.",
      },
    ],
  },
  {
    slug: "store-builder",
    title: "Creator Store Builder | CloverLoop",
    description:
      "Explore a creator-focused storefront concept for presenting digital products in one dedicated place.",
    heading: "Your own storefront, made for your work",
    intro:
      "Plan a dedicated, shareable destination where your audience can learn about what you create.",
    image: "/images/home/storefront-mockup.webp",
    imageAlt: "CloverLoop storefront concept displaying creator digital products",
    sections: [
      {
        heading: "One link for your digital products",
        body: "A central destination can be included in social profiles, video descriptions, websites and other channels where your audience already finds you.",
      },
      {
        heading: "An independent creator destination",
        body: "A shareable address can give your work a consistent identity across the places your audience finds you.",
      },
      {
        heading: "Designed for a direct relationship",
        body: "CloverLoop is designed around independent creator storefronts rather than a central marketplace catalogue, supporting a direct relationship between creators and their audiences.",
      },
    ],
  },
  {
    slug: "payment-gateways",
    title: "Payment Processing and Plan Fees | CloverLoop",
    description:
      "Learn how payment-provider charges are separate from CloverLoop's published plan fees.",
    heading: "Payment and fee information",
    intro:
      "CloverLoop publishes platform plan fees separately from payment-provider processing charges. Razorpay or another provider may charge fees under its own terms; creators pay those charges separately.",
    image: "/images/home/storefront-mockup.webp",
    imageAlt: "Illustration representing a creator storefront",
    sections: [
      {
        heading: "Provider processing charges are separate",
        body: "Razorpay or another payment provider may charge processing fees under its own terms. Those charges are payable separately by the creator and are not included in CloverLoop's platform commission.",
      },
      {
        heading: "CloverLoop plan fees",
        body: "Free is ₹0/month with a 0% platform fee. Creator is ₹0/month with a 4% platform fee; Pro Creator is ₹2,999/month with a 0% platform fee. Payment-provider processing charges are separate.",
      },
    ],
  },
];

export type AboutBlock =
  | { type: "h2" | "h3" | "p" | "strong"; text: string }
  | { type: "ul"; items: { label?: string; text: string }[] }
  | { type: "cta"; text: string; href: string };

type CompanyPageContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

export const companyPages: Record<
  string,
  {
    title: string;
    description: string;
    heading: string;
    paragraphs: string[];
    keywords?: string[];
    blocks?: AboutBlock[];
    sections?: { heading: string; blocks: CompanyPageContentBlock[] }[];
  }
> = {
  about: {
    title: "About CloverLoop | A Platform Built for Independent Creators",
    description:
      "Discover CloverLoop's approach to creator storefronts, digital products, transparent pricing and creator-owned payment arrangements.",
    keywords: [
      "Platform for independent creators",
      "Sell digital products online",
      "creator storefront",
      "digital product platform India",
      "creator monetisation platform",
    ],
    heading: "A more direct home for independent creators",
    paragraphs: [],
    blocks: [
      { type: "h2", text: "A more direct home for independent creators" },
      { type: "p", text: "The internet has made it easier than ever to create, share and build an audience. Independent creators are publishing valuable work across social media, YouTube, blogs, online communities and other digital platforms. From educational resources and ebooks to design templates, presets and creative tools, there is no shortage of knowledge and creativity worth sharing." },
      { type: "p", text: "But turning that work into a sustainable source of income is not always straightforward." },
      { type: "p", text: "Creators often have to navigate multiple platforms, complicated monetisation models, payment arrangements and fragmented ways of delivering digital products. Their audience may belong to them, but the tools they rely on to monetise their work are often spread across different services." },
      { type: "strong", text: "CloverLoop is focused on making that process simpler." },
      { type: "p", text: "CloverLoop's product concept is centred on a more direct way for independent creators to present and sell digital products through creator-owned storefronts. Its approach brings the essential parts of digital product selling into one clear experience while keeping creators in control of their audience relationships and payment arrangements." },
      { type: "h2", text: "Why we are building CloverLoop" },
      { type: "p", text: "We believe that valuable creative work should have a clear path to monetisation." },
      { type: "p", text: "A musician should be able to sell guitar tabs, backing tracks or learning resources. A designer should be able to distribute templates and creative assets. An educator should be able to offer ebooks, guides and downloadable learning material. A content creator should be able to turn their knowledge and expertise into products their audience can access." },
      { type: "p", text: "These creators should not need to build an entire ecommerce operation just to sell a digital file." },
      { type: "p", text: "We see an opportunity to make the process more accessible through creator-focused tools for presenting digital products, shaping a storefront and planning online sales." },
      { type: "p", text: "CloverLoop follows this principle: simplify the infrastructure so creators can focus on what they do best — creating useful work and building meaningful relationships with their audiences." },
      { type: "h2", text: "Built around creator independence" },
      { type: "p", text: "We believe creators should have greater control over how they present and monetise their work." },
      { type: "p", text: "That belief informs three principles behind CloverLoop." },
      { type: "h3", text: "1. Your own storefront, your identity" },
      { type: "p", text: "Your products deserve a dedicated space that represents your work." },
      { type: "p", text: "CloverLoop is designed around the idea of a creator-owned storefront, with a shareable address and a clear way to present digital products to an audience. Instead of relying entirely on marketplace listings or scattered payment links, creators can plan a consistent destination for their digital offerings." },
      { type: "p", text: "Your storefront should be an extension of your creator identity, not just another product listing." },
      { type: "h3", text: "2. Transparent payment arrangements" },
      { type: "p", text: "We believe payment arrangements should be straightforward and easy to understand." },
      { type: "p", text: "Razorpay or other payment-provider processing charges, if applicable, are separate, payable by the creator to the provider, and not included in CloverLoop's platform commission." },
      { type: "p", text: "Creators can compare CloverLoop's published monthly plan prices and platform rates before choosing a plan." },
      { type: "h3", text: "3. Straightforward and transparent pricing" },
      { type: "p", text: "Creators should be able to understand what a platform costs before committing to it." },
      { type: "p", text: "Our pricing model is designed to offer an accessible starting point, with options for creators at different stages of their digital product business." },
      { type: "p", text: "Whether you are experimenting with your first digital product or already have an established audience, CloverLoop aims to provide a clear pricing structure without making the economics difficult to understand." },
      { type: "p", text: "We want creators to know what they pay, why they pay it and how platform charges relate to their sales." },
      { type: "h2", text: "Designed for creators with something to share" },
      { type: "p", text: "CloverLoop is made for a broad range of independent creators, including:" },
      {
        type: "ul",
        items: [
          { label: "Musicians and artists", text: "— guitar tabs, sheet music, backing tracks, presets and learning resources." },
          { label: "Designers and creative professionals", text: "— templates, illustrations, design assets and digital downloads." },
          { label: "Educators and knowledge creators", text: "— ebooks, guides, worksheets, study material and educational resources." },
          { label: "Content creators", text: "— downloadable resources, toolkits, templates and products based on their expertise." },
          { label: "Photographers and visual artists", text: "— presets, editing resources and creative assets." },
          { label: "Independent entrepreneurs", text: "— practical digital products that solve specific problems for a defined audience." },
        ],
      },
      { type: "p", text: "You do not need a large following or an established business to have something worth selling. What matters is having something useful to offer and an audience that values it." },
      { type: "h2", text: "More than a place to sell files" },
      { type: "p", text: "We see digital products as more than downloadable files. They are a way for creators to package their knowledge, experience, creativity and skills into something that can provide value beyond an individual interaction." },
      { type: "p", text: "A tutorial can become a structured learning resource. A creative workflow can become a template. Years of practical experience can become an ebook or guide. A musician's arrangements can become downloadable sheet music or guitar tabs." },
      { type: "p", text: "CloverLoop aims to make it easier to turn these ideas into products and present them through a dedicated storefront." },
      { type: "p", text: "Our broader vision is to support the independent creator economy with practical, accessible infrastructure — without making creators navigate unnecessary complexity just to monetise their work." },
      { type: "h2", text: "Building with creators, not just for creators" },
      { type: "p", text: "We believe the best way to build a useful platform is to understand the people who will use it. That means listening to creators, learning how they currently sell their work, identifying the difficulties they encounter and prioritising the features that genuinely make a difference." },
      { type: "p", text: "We are inviting independent creators to participate in this early journey through our Founding Creator Programme." },
      { type: "p", text: "Creator feedback helps us keep CloverLoop focused on practical tools and real creator requirements." },
      { type: "h2", text: "Our vision" },
      { type: "p", text: "We envision a creator economy where independent individuals have accessible tools to distribute their work, build direct relationships with their audiences and create sustainable income from what they know and make." },
      { type: "p", text: "CloverLoop is one step towards that vision." },
      { type: "p", text: "CloverLoop focuses on digital products and creator-owned storefronts, with simplicity, transparency and independence at its core." },
      { type: "strong", text: "Because what you create should have a place of its own." },
      { type: "h2", text: "Be part of the journey" },
      { type: "p", text: "Whether you are a musician, designer, educator, photographer or content creator, if you have something valuable to share, CloverLoop is made with you in mind." },
      { type: "p", text: "Explore the platform, discover our approach to creator monetisation and join us as a Founding Creator." },
      { type: "strong", text: "Your work. Your audience. Your own storefront." },
      { type: "cta", text: "Get Started for Free", href: "/signup" },
    ],
  },
  "founding-creators": {
    title: "Creator Feedback | CloverLoop",
    description:
      "Share your perspective on the tools independent creators need.",
    heading: "Share your creator perspective",
    paragraphs: [
      "CloverLoop is focused on the needs of independent creators. We value practical feedback about the tools, workflows and experiences that help creators present digital products to their audiences.",
      "Create an account to continue to the next step in the CloverLoop experience.",
    ],
  },
  "help-center": {
    title: "Help Center | CloverLoop",
    description:
      "Find answers about CloverLoop, creator storefronts, pricing and payments.",
    heading: "How can we help?",
    paragraphs: [
      "Find answers to common questions about CloverLoop, creator storefronts, pricing and payments. Visit the FAQ page for answers or contact our support team using the email address listed on the Contact page.",
    ],
  },
  contact: {
    title: "Contact CloverLoop",
    description: "Contact the CloverLoop support team.",
    heading: "Contact CloverLoop",
    paragraphs: [
      "Have a question about CloverLoop? Contact our support team.",
    ],
  },
  reviews: {
    title: "CloverLoop Reviews | Creator Feedback and Experiences",
    description:
      "Explore creator feedback about CloverLoop and learn what to consider when choosing a platform to present and sell digital products.",
    heading: "What Creators Look for in a Digital Product Platform",
    paragraphs: [],
    sections: [
      {
        heading: "Introduction",
        blocks: [
          {
            type: "paragraph",
            text: "Choosing a platform to sell digital products is an important decision for any creator. The right setup should make it clear how products are presented, how customers access their purchases and how the creator manages their digital offerings.",
          },
          {
            type: "paragraph",
            text: "This page is intended to bring creator feedback and experiences together as they become available. Reviews can help other creators understand how a platform fits into real workflows, what they find useful and what they think could be improved.",
          },
        ],
      },
      {
        heading: "What creator feedback can help explain",
        blocks: [
          {
            type: "paragraph",
            text: "A useful review goes beyond a star rating. It describes the creator's context and the task they wanted to complete. For example, feedback may discuss:",
          },
          {
            type: "list",
            ordered: false,
            items: [
              "How easy it is to understand the storefront setup process.",
              "The experience of adding and managing digital products.",
              "How product information and previews are presented.",
              "The usefulness of the platform for different types of digital downloads.",
              "The clarity of payment and settlement information.",
              "The overall experience of managing a digital-product offering.",
            ],
          },
          {
            type: "paragraph",
            text: "Different creators have different requirements. Someone selling templates may evaluate a platform differently from someone distributing ebooks, audio files or educational resources. Reading feedback in context is therefore more useful than relying on a rating alone.",
          },
        ],
      },
      {
        heading: "CloverLoop and digital creators",
        blocks: [
          {
            type: "paragraph",
            text: "CloverLoop is focused on helping creators present and sell digital products through a dedicated online storefront. Digital products can include ebooks, PDFs, templates, learning materials and audio downloads.",
          },
          {
            type: "paragraph",
            text: "When evaluating CloverLoop, consider the product formats you plan to offer, the storefront experience you need and the payment and account information relevant to your situation. Review the platform information and applicable terms before making a decision.",
          },
        ],
      },
      {
        heading: "Share your experience",
        blocks: [
          {
            type: "paragraph",
            text: "Creator feedback is most useful when it is genuine, specific and based on direct experience. If you have used CloverLoop, use the review or feedback option provided on this page, if available, to share what worked for you and what could be better.",
          },
          {
            type: "paragraph",
            text: "Please keep feedback relevant and respectful. Do not include passwords, payment details, private customer information or other sensitive personal data in a review.",
          },
        ],
      },
      {
        heading: "Reviews and transparency",
        blocks: [
          {
            type: "paragraph",
            text: "Only genuine feedback should be presented as a creator review. Reviews, ratings, names, profile details and other endorsements must not be fabricated or implied. Where reviews are displayed, they should accurately reflect the feedback received and be presented in a way that does not mislead visitors.",
          },
          {
            type: "paragraph",
            text: "As creator feedback becomes available, this page can help visitors learn from the experiences of people using CloverLoop for their digital-product work.",
          },
        ],
      },
    ],
  },
  "partner-program": {
    title: "CloverLoop Partner Program | Connect Creators with Digital Commerce",
    description:
      "Explore the CloverLoop Partner Program and learn how to introduce creators to a platform built for selling digital products online.",
    heading: "Build Connections with the CloverLoop Partner Program",
    paragraphs: [],
    sections: [
      {
        heading: "Introduction",
        blocks: [
          {
            type: "paragraph",
            text: "The CloverLoop Partner Program is intended for people and organisations interested in introducing digital creators to CloverLoop. Creators need practical ways to present and sell their digital work online. Partners can help make those tools easier to discover by sharing relevant information with the audiences and communities they already serve.",
          },
          {
            type: "paragraph",
            text: "CloverLoop focuses on digital products such as ebooks, PDFs, templates, learning resources and audio downloads. The platform is designed around the needs of creators who want a dedicated storefront for their digital offerings.",
          },
        ],
      },
      {
        heading: "Who may find the program relevant?",
        blocks: [
          {
            type: "paragraph",
            text: "The program may be relevant to people whose work brings them into contact with creators, independent professionals or digital-product businesses. This can include creator communities, educators, consultants, agencies, service providers and people who publish useful resources for creators.",
          },
          {
            type: "paragraph",
            text: "The most relevant partnerships are based on a genuine connection with the creator audience. A useful introduction explains what CloverLoop does, who it is designed for and where someone can learn more. Partners should describe the platform accurately and avoid making promises about earnings, sales results or business outcomes.",
          },
        ],
      },
      {
        heading: "Why introduce creators to CloverLoop?",
        blocks: [
          {
            type: "paragraph",
            text: "Many creators build an audience through social platforms, newsletters, communities or other channels. A dedicated digital-product storefront can give them another way to present their work and make their products available to customers.",
          },
          {
            type: "paragraph",
            text: "CloverLoop brings the digital-product storefront proposition into one place. Partners can help creators discover this option and direct interested people to CloverLoop's website for further information.",
          },
        ],
      },
      {
        heading: "A straightforward partnership approach",
        blocks: [
          {
            type: "paragraph",
            text: "A useful partnership starts with audience relevance. Consider whether the creators you reach are likely to offer digital downloads, educational resources, templates or other digital products.",
          },
          {
            type: "list",
            ordered: true,
            items: [
              "Explain the platform in clear and accurate terms.",
              "Share the official CloverLoop website or relevant product information.",
              "Let interested creators review the platform and decide whether it suits their needs.",
              "Use the existing CloverLoop partnership contact or application route for partnership-related enquiries.",
            ],
          },
          {
            type: "paragraph",
            text: "Any specific commercial terms, approval requirements, tracking arrangements or partner benefits should be confirmed directly through the official program process. Do not assume that an introduction automatically qualifies for a payment or other reward.",
          },
        ],
      },
      {
        heading: "Interested in partnering with CloverLoop?",
        blocks: [
          {
            type: "paragraph",
            text: "If you work with creators and think CloverLoop may be relevant to your audience, explore the existing partnership enquiry or application option on this page. Review the information provided there and submit an enquiry through the available official route.",
          },
          {
            type: "paragraph",
            text: "We aim to make it easier for creators to discover tools that support their digital-product businesses. Relevant partnerships can help connect those creators with CloverLoop.",
          },
        ],
      },
    ],
  },
};

export const pageTitles: Record<string, { title: string; description: string }> = {
  pricing: {
    title: "CloverLoop Pricing | Clear creator plan fees",
    description:
      "Compare CloverLoop's Free, Creator and Pro Creator plans, including platform transaction fees and monthly pricing.",
  },
  courses: {
    title: "Online Course Planning for Creators | CloverLoop",
    description:
      "Plan a clear online course with structured learning, organised lessons and useful educational resources.",
  },
  faq: {
    title: "Frequently Asked Questions | CloverLoop",
    description:
      "Answers about CloverLoop, creator storefronts, digital products, pricing and payments.",
  },
  sitemap: {
    title: "Sitemap | CloverLoop",
    description: "Browse the public pages and creator resources on CloverLoop.",
  },
};

export const resourceCards = [
  {
    slug: "marketing-ideas-tool",
    title: "Digital Product Marketing Ideas Generator",
    description:
      "Discover promotion ideas based on your creator category, product and marketing channel.",
    image: "/images/resources/marketing-ideas-tool.webp",
    category: "Tools",
  },
  {
    slug: "how-to-write-an-ebook",
    title: "How to Write an Ebook",
    description:
      "Plan, write, edit and design an ebook that helps a defined reader achieve a practical outcome.",
    image: "/images/resources/how-to-write-an-ebook.webp",
    category: "Creating",
  },
  {
    slug: "how-to-sell-presets",
    title: "How to Sell Presets Online",
    description:
      "Package and demonstrate photography, video and music presets with clear compatibility information.",
    image: "/images/resources/how-to-sell-presets.webp",
    category: "Selling",
  },
  {
    slug: "how-to-sell-printables",
    title: "How to Sell Printables Online",
    description:
      "Create and sell planners, worksheets, trackers and other downloadable resources.",
    image: "/images/resources/how-to-sell-printables.webp",
    category: "Selling",
  },
  {
    slug: "how-to-sell-ebooks",
    title: "How to Sell Ebooks Online",
    description:
      "Prepare, price, present and promote an ebook with a clear customer experience.",
    image: "/images/resources/how-to-sell-ebooks.webp",
    category: "Selling",
  },
  {
    slug: "how-to-sell-canva-templates",
    title: "How to Sell Canva Templates Online",
    description:
      "Understand template design, licensing, packaging, customer access and promotion.",
    image: "/images/resources/how-to-sell-canva-templates.webp",
    category: "Selling",
  },
  {
    slug: "online-course-ideas",
    title: "50 Online Course Ideas for Creators",
    description:
      "Explore educational product ideas across music, business, finance, design and technology.",
    image: "/images/resources/online-course-ideas.webp",
    category: "Creating",
  },
  {
    slug: "content-creator",
    title: "Content Creator: Building a Business Beyond Social Media",
    description:
      "Turn audience understanding and expertise into digital product opportunities.",
    image: "/images/resources/content-creator.webp",
    category: "Growing",
  },
  {
    slug: "digital-products",
    title: "Digital Products: A Practical Beginner's Guide",
    description:
      "Understand digital product formats, validate an idea, prepare payment and delivery, and plan a practical first-month launch.",
    image: "/images/resources/digital-products.webp",
    category: "Creating",
  },
  {
    slug: "how-to-sell-digital-products-online",
    title: "How to Sell Digital Products Online: A Beginner's Guide",
    description:
      "Learn how to choose, create, price and promote a digital product, from your first idea to your first customers.",
    image: "/images/resources/digital-products.webp",
    category: "Guides",
  },
  {
    slug: "best-platform-to-sell-digital-products-india-2026",
    title: "Best Platform to Sell Digital Products in India (2026)",
    description:
      "Compare pricing, fees and features across nine platforms for selling digital products in India.",
    image: "/images/resources/digital-products.webp",
    category: "Guides",
  },
  {
    slug: "how-to-price-digital-products",
    title: "How to Price Digital Products: A Creator's Working Method",
    description:
      "Compare pricing methods, calculate fees on a ₹499 product, test a price and plan useful tiers or bundles.",
    image: "/images/resources/how-to-sell-ebooks.webp",
    category: "Guides",
  },
  {
    slug: "how-to-sell-templates-online",
    title: "Digital Product Ideas and Templates: What Can You Actually Sell?",
    description:
      "Explore practical digital-product ideas by profession and choose a format, licence and packaging that solves a real buyer problem.",
    image: "/images/resources/how-to-sell-canva-templates.webp",
    category: "Guides",
  },
  {
    slug: "accept-upi-payments-digital-products-razorpay",
    title: "UPI, Razorpay and Payment Fees: What Creators Really Pay",
    description:
      "Understand merchant UPI, gateway fees, settlement and the practical payment checks digital-product sellers need in India.",
    image: "/images/resources/how-to-sell-ebooks.webp",
    category: "Guides",
  },
  {
    slug: "do-you-need-gst-registration-to-sell-online",
    title: "GST Registration for Digital Product Sellers in India",
    description:
      "Understand the ₹20 lakh Maharashtra services threshold, aggregate turnover, inter-State services, e-commerce rules and creator records.",
    image: "/images/resources/digital-products.webp",
    category: "Guides",
  },
  {
    slug: "how-many-sales-to-hit-your-income-goal",
    title: "Digital Product Earnings Calculator: Work Backwards from Your Income Goal",
    description:
      "Work backwards from a monthly income goal using per-sale fees, GST assumptions, refunds, sales targets and conversion-rate examples.",
    image: "/images/resources/content-creator.webp",
    category: "Guides",
  },
  {
    slug: "how-to-create-and-sell-online-course-india",
    title: "How to Create and Sell an Online Course in India",
    description:
      "Validate a course idea, design lessons around learner progress, compare delivery models, plan pricing and prepare a launch.",
    image: "/images/resources/online-course-ideas.webp",
    category: "Courses",
  },
  {
    slug: "gst-on-ebooks-and-online-courses-india",
    title: "GST on Ebooks and Online Courses in India",
    description:
      "Understand ebook classification, course exemptions, bundled supplies and export-of-service conditions before setting GST at checkout.",
    image: "/images/resources/online-course-ideas.webp",
    category: "Courses",
  },
];

export const faqItems = [
  {
    question: "What is CloverLoop?",
    answer:
      "CloverLoop is designed to help independent creators plan how to present digital products to their audiences through a creator-focused storefront, with transparent plan pricing and creator-owned payment arrangements.",
  },
  {
    question: "Who can use CloverLoop?",
    answer:
      "CloverLoop is for independent creators, educators, musicians, designers, professionals and others who create digital products such as ebooks, PDFs, templates, presets, printables and downloadable files.",
  },
  {
    question: "What kinds of digital products can creators sell?",
    answer:
      "Creators often package ebooks, PDF guides, music tabs, backing tracks, audio resources, presets, templates, printables, educational materials and other downloadable files. Creators are responsible for ensuring that they own or have permission to distribute the content they offer.",
  },
  {
    question: "Will I get my own storefront?",
    answer:
      "CloverLoop is designed around independent creator storefronts: a dedicated, shareable destination for presenting digital products directly to an audience.",
  },
  {
    question: "Who sets payment processing charges?",
    answer:
      "Razorpay or another payment provider sets its own processing charges. Creators pay those charges separately under the provider's terms; they are not included in CloverLoop's platform commission.",
  },
  {
    question: "What are CloverLoop's platform transaction fees?",
    answer:
      "Free has a 0% platform fee, Creator has a 4% platform fee, and Pro Creator has a 0% platform fee with a ₹2,999 monthly subscription. Payment-provider processing charges are separate.",
  },
  {
    question: "Are payment gateway processing fees included in CloverLoop pricing?",
    answer:
      "No. Razorpay or other payment-provider processing charges, if applicable, are payable separately by creators under the provider's terms. They are not included in CloverLoop's platform commission.",
  },
  {
    question: "What are the available plans?",
    answer:
      "Free is ₹0/month with a 0% platform fee and includes one paid and five free product listings per account lifetime. Creator is ₹0/month with a 4% platform fee and unlimited paid and free listings. Pro Creator is ₹2,999/month with a 0% platform fee and unlimited paid and free listings. Provider processing charges are separate.",
  },
  {
    question: "How is the platform transaction fee calculated?",
    answer:
      "The Free plan has a 0% platform fee. Creator has a 4% platform fee, and Pro Creator has a 0% platform fee with a ₹2,999 monthly subscription. Payment-provider processing charges are separate.",
  },
  {
    question: "Does the Free plan have a limit on free products?",
    answer:
      "The published Free plan allowance is one paid and five free product listings per account lifetime. Creator and Pro Creator plan terms include unlimited paid and free product listings.",
  },
  {
    question: "Are free products charged a transaction fee?",
    answer:
      "No platform transaction commission applies to free products. The Free plan has a lifetime account-level limit of one paid and five free product listings.",
  },
  {
    question: "What should I tell buyers about digital product delivery?",
    answer:
      "Clearly describe the product format, how buyers will access it, and any requirements or access limits before purchase.",
  },
  {
    question: "Is CloverLoop a marketplace?",
    answer:
      "No. CloverLoop is designed around independent creator storefronts rather than a central marketplace catalogue, with creators presenting their work directly to their audiences.",
  },
  {
    question: "Can I create an account now?",
    answer:
      "You can register using the available email or Google authentication options. After signing in, your account will guide you through the next onboarding step.",
  },
  {
    question: "What happens after I sign in?",
    answer:
      "Your account provides an onboarding step where you can share your perspective and help CloverLoop understand the needs of independent creators.",
  },
  {
    question: "How can I contact CloverLoop?",
    answer:
      "Use the contact details listed on the Contact page to reach CloverLoop support.",
  },
  {
    question: "Can I sell copyrighted or third-party material?",
    answer:
      "Creators must have the rights and permissions required to distribute the products and included assets. Do not upload or sell material that infringes copyright, trademark, privacy or other third-party rights. Creators should review applicable licences before distributing templates, presets, fonts, photographs, samples or other third-party content.",
  },
  {
    question: "Does CloverLoop guarantee sales or income?",
    answer:
      "No. Sales depend on factors such as product quality, audience fit, pricing, promotion and market demand. CloverLoop does not promise a particular sales volume, income or business result.",
  },
];
