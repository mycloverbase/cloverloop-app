export const SITE_NAME = "CloverLoop";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://cloverloop.in";
export const PRODUCTION_URL = "https://cloverloop.in";
export const GTM_ID = "GTM-K4BMMLN3";

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

export const featurePages = [
  {
    slug: "sell-online",
    title: "Sell Directly to Your Audience | CloverLoop",
    description:
      "Learn about CloverLoop storefronts and published plans for digital-product creators.",
    heading: "Sell digital products directly to your audience",
    intro:
      "Explore a dedicated storefront concept for digital products, with clear published plan pricing for creators.",
    image: "/images/home/digital-product-collection.webp",
    imageAlt: "A collection of digital products for independent creators",
    sections: [
      {
        heading: "A direct destination for your work",
        body: "Bring your ebooks, templates, presets, printables and other downloadable resources together in a storefront you can share with your audience.",
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
    title: "Sell Digital Downloads Online | CloverLoop",
    description:
      "Guidance for preparing a clear digital download experience for ebooks, templates, presets and other creator products.",
    heading: "A simpler way to sell digital downloads",
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
      "Give your audience one dedicated place to explore your digital products with an independent storefront.",
    heading: "Your own storefront, made for your work",
    intro:
      "Give your audience a dedicated place to explore what you create at a shareable CloverLoop.in/creatorname address.",
    image: "/images/home/storefront-mockup.webp",
    imageAlt: "CloverLoop storefront concept displaying creator digital products",
    sections: [
      {
        heading: "One link for your digital products",
        body: "Share a central destination from your social profiles, video descriptions, website and other channels where your audience already finds you.",
      },
      {
        heading: "An independent creator destination",
        body: "Bring your work together under a shareable address such as cloverloop.in/creatorname.",
      },
      {
        heading: "Designed for a direct relationship",
        body: "CloverLoop is centred on independent storefronts rather than a central marketplace catalogue. Creators share their storefront directly with their audience.",
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
        body: "Free is ₹0/month with 0% commission on the first ₹10,000 of Gross Sales per calendar month and 4% only on incremental Gross Sales above that amount. The allowance resets on the first day of each calendar month (IST), and sales are not stopped after it is used. Creator is ₹0/month with a 4% platform fee; Pro Creator is ₹1,499/month with a 2.5% platform fee.",
      },
    ],
  },
];

export type AboutBlock =
  | { type: "h2" | "h3" | "p" | "strong"; text: string }
  | { type: "ul"; items: { label?: string; text: string }[] }
  | { type: "cta"; text: string; href: string };

export const companyPages: Record<
  string,
  {
    title: string;
    description: string;
    heading: string;
    paragraphs: string[];
    keywords?: string[];
    blocks?: AboutBlock[];
  }
> = {
  about: {
    title: "About CloverLoop | A Platform Built for Independent Creators",
    description:
      "Discover how CloverLoop helps independent creators sell digital products through their own storefronts with transparent pricing and creator-owned payment arrangements.",
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
      { type: "strong", text: "CloverLoop makes that process simpler." },
      { type: "p", text: "CloverLoop gives independent creators a more direct way to present, distribute and sell digital products through their own storefronts. It brings the essential parts of digital product selling together in one straightforward experience, while keeping creators in control of their audience relationships and payment arrangements." },
      { type: "h2", text: "Why we are building CloverLoop" },
      { type: "p", text: "We believe that valuable creative work should have a clear path to monetisation." },
      { type: "p", text: "A musician should be able to sell guitar tabs, backing tracks or learning resources. A designer should be able to distribute templates and creative assets. An educator should be able to offer ebooks, guides and downloadable learning material. A content creator should be able to turn their knowledge and expertise into products their audience can access." },
      { type: "p", text: "These creators should not need to build an entire ecommerce operation just to sell a digital file." },
      { type: "p", text: "We see an opportunity to make the process more accessible by providing the infrastructure required to present digital products, manage a creator-owned storefront and facilitate online sales." },
      { type: "p", text: "CloverLoop follows this principle: simplify the infrastructure so creators can focus on what they do best — creating useful work and building meaningful relationships with their audiences." },
      { type: "h2", text: "Built around creator independence" },
      { type: "p", text: "We believe creators should have greater control over how they present and monetise their work." },
      { type: "p", text: "That belief informs three principles behind CloverLoop." },
      { type: "h3", text: "1. Your own storefront, your identity" },
      { type: "p", text: "Your products deserve a dedicated space that represents your work." },
      { type: "p", text: "CloverLoop is designed to give each creator their own storefront, with a shareable address and a place to present digital products directly to their audience. Instead of relying entirely on marketplace listings or scattered payment links, creators can build a consistent destination for their digital offerings." },
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
    title: "Creator Reviews | CloverLoop",
    description: "Creator feedback for CloverLoop.",
    heading: "Creator feedback",
    paragraphs: [
      "Creator feedback will be published here as it becomes available. We do not publish fabricated reviews or testimonials.",
    ],
  },
  "partner-program": {
    title: "Partner Program | CloverLoop",
    description:
      "Explore potential collaborations with communities, educators and organisations that support independent creators.",
    heading: "Partner with CloverLoop",
    paragraphs: [
      "We are interested in exploring collaborations with communities, educators and organisations that support independent creators. Contact CloverLoop to discuss a potential partnership.",
    ],
  },
};

export const pageTitles: Record<string, { title: string; description: string }> = {
  pricing: {
    title: "CloverLoop Pricing | Clear creator plan fees",
    description:
      "Compare CloverLoop's Free, Creator and Pro Creator plans, including platform transaction fees and monthly pricing.",
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
    title: "Digital Products: A Guide to Creating and Selling",
    description:
      "Explore product types and learn how to move from an idea to a clear, useful offer.",
    image: "/images/resources/digital-products.webp",
    category: "Creating",
  },
];

export const faqItems = [
  {
    question: "What is CloverLoop?",
    answer:
      "CloverLoop helps independent creators establish their own digital storefronts and sell downloadable products directly to their audiences, with creator-owned payments and secure digital delivery.",
  },
  {
    question: "Who can use CloverLoop?",
    answer:
      "CloverLoop is for independent creators, educators, musicians, designers, professionals and others who create digital products such as ebooks, PDFs, templates, presets, printables and downloadable files.",
  },
  {
    question: "What kinds of digital products can creators sell?",
    answer:
      "Creators can offer ebooks, PDF guides, music tabs, backing tracks, audio resources, presets, templates, printables, educational materials and other downloadable files. Creators are responsible for ensuring that they own or have permission to distribute the content they sell.",
  },
  {
    question: "Will I get my own storefront?",
    answer:
      "Yes. Each creator gets an independent storefront with a shareable URL in the format cloverloop.in/creatorname, where an audience can explore their digital products.",
  },
  {
    question: "Who sets payment processing charges?",
    answer:
      "Razorpay or another payment provider sets its own processing charges. Creators pay those charges separately under the provider's terms; they are not included in CloverLoop's platform commission.",
  },
  {
    question: "What are CloverLoop's platform transaction fees?",
    answer:
      "Free is 0% on the first ₹10,000 of Gross Sales per calendar month and 4% only on incremental Gross Sales above that allowance. Creator is 4%, and Pro Creator is 2.5%. Payment-provider processing charges are separate.",
  },
  {
    question: "Are payment gateway processing fees included in CloverLoop pricing?",
    answer:
      "No. Razorpay or other payment-provider processing charges, if applicable, are payable separately by creators under the provider's terms. They are not included in CloverLoop's platform commission.",
  },
  {
    question: "What are the available plans?",
    answer:
      "Free is ₹0/month, with 1 paid and 5 free product listings per account lifetime. Its platform fee is 0% on the first ₹10,000 of Gross Sales per calendar month and 4% only on incremental Gross Sales above that allowance. The allowance resets on the first day of each calendar month (IST), and sales are not stopped after it is used. Creator is ₹0/month with a 4% platform fee, unlimited paid and free listings, and no monthly Gross Sales limit. Pro Creator is ₹1,499/month with a 2.5% platform fee, unlimited paid and free listings, and no monthly Gross Sales limit. Provider processing charges are separate.",
  },
  {
    question: "How is the platform transaction fee calculated?",
    answer:
      "For the Free plan, 0% applies to the first ₹10,000 of Gross Sales in each calendar month and 4% only to incremental Gross Sales above ₹10,000. The allowance resets on the first day of the month (IST), and sales continue after it is used. Creator is 4% and Pro Creator is 2.5%, with no monthly Gross Sales limits.",
  },
  {
    question: "Does the Free plan have a limit on free products?",
    answer:
      "Yes. Free includes one paid product and five free product listings as a lifetime account-level limit. Creator and Pro Creator include unlimited paid and free product listings.",
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
      "No. CloverLoop is built around independent creator storefronts rather than a central marketplace catalogue. Each creator shares their storefront directly with their audience.",
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
