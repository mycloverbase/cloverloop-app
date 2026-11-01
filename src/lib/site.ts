export const SITE_NAME = "CloverLoop";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://cloverloop.in";
export const PRODUCTION_URL = "https://cloverloop.in";

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
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
    { label: "Reviews", href: "/reviews" },
    { label: "Sitemap", href: "/sitemap" },
    { label: "Partner Program", href: "/partner-program" },
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
};

export const featurePages = [
  {
    slug: "sell-online",
    title: "Sell Directly to Your Audience | CloverLoop",
    description:
      "Sell digital products directly to the people who follow your work with a dedicated creator storefront.",
    heading: "Sell digital products directly to your audience",
    intro:
      "Sell digital products directly to the people who follow your work. CloverLoop is designed to give independent creators a dedicated storefront, a clear way to present downloadable products and a planned payment model built around each creator's own payment gateway account.",
    image: "/images/home/digital-product-collection.webp",
    imageAlt: "A collection of digital products for independent creators",
    sections: [
      {
        heading: "A direct destination for your work",
        body: "Bring your ebooks, templates, presets, printables and other downloadable resources together in a storefront you can share with your audience.",
      },
      {
        heading: "Built around creator ownership",
        body: "The planned payment model connects each creator's own Razorpay account. Customer payments are processed through that account and settled by Razorpay directly to the creator.",
      },
      {
        heading: "A clear buying journey",
        body: "Present what each product includes, who it is for and how customers can access it. The planned experience includes secure digital delivery and configurable download limits.",
      },
    ],
  },
  {
    slug: "sell-digital-downloads",
    title: "Sell Digital Downloads Online | CloverLoop",
    description:
      "Plan a clear digital download experience for ebooks, templates, presets and other creator products.",
    heading: "A simpler way to sell digital downloads",
    intro:
      "Turn your knowledge and creative work into downloadable products. The planned product supports files up to 100 MB each, secure download links and configurable download limits. Supported file types and final delivery settings should be confirmed in the product interface when implemented.",
    image: "/images/home/digital-product-collection.webp",
    imageAlt: "Digital product formats including guides, templates and creative downloads",
    sections: [
      {
        heading: "Make the download easy to understand",
        body: "Describe the file format, compatibility and included materials so customers can make an informed decision before they buy.",
      },
      {
        heading: "Designed for controlled access",
        body: "The intended delivery model includes configurable download limits and secure links with a reasonable expiry. Checkout, payment verification and file delivery are not implemented in this sprint.",
      },
      {
        heading: "Files sized for digital products",
        body: "The planned maximum file size is 100 MB per file. Confirm supported formats and final limits in the product interface when the selling platform is implemented.",
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
      "Give your audience a dedicated place to explore what you create. The planned storefront URL format is CloverLoop.in/creatorname, allowing creators to share one destination across social profiles, video descriptions, websites and other channels.",
    image: "/images/home/storefront-mockup.webp",
    imageAlt: "CloverLoop storefront concept displaying creator digital products",
    sections: [
      {
        heading: "One link for your digital products",
        body: "Share a central destination from your social profiles, video descriptions, website and other channels where your audience already finds you.",
      },
      {
        heading: "An independent creator destination",
        body: "The planned storefront keeps a creator's work together under a shareable address such as cloverloop.in/creatorname.",
      },
      {
        heading: "Designed for a direct relationship",
        body: "CloverLoop is centred on independent storefronts rather than a central marketplace catalogue. Creators share their storefront directly with their audience.",
      },
    ],
  },
  {
    slug: "payment-gateways",
    title: "Creator-owned Payments | CloverLoop",
    description:
      "Understand CloverLoop's planned creator-owned Razorpay payment architecture and separate monthly platform commission.",
    heading: "Payments designed around your own account",
    intro:
      "CloverLoop's planned payment architecture lets each creator connect their own Razorpay account. Customer payments are processed through the creator's account and settled directly to the creator's bank account by Razorpay under its settlement rules. CloverLoop calculates its platform commission separately and invoices it monthly. Razorpay processing charges are additional.",
    image: "/images/home/storefront-mockup.webp",
    imageAlt: "Illustration representing the planned creator-owned payment flow",
    sections: [
      {
        heading: "How the planned payment flow works",
        body: "A customer pays through the creator's connected Razorpay account. Razorpay processes the payment and settles proceeds directly to the creator's bank account according to the creator's Razorpay arrangement. CloverLoop does not centrally collect or hold creator sales proceeds.",
      },
      {
        heading: "Platform commission is separate",
        body: "CloverLoop calculates commission on successful paid transactions according to the creator's plan and invoices it monthly. This fee is not automatically deducted from a customer's payment. Razorpay processing fees are additional.",
      },
      {
        heading: "Planned architecture, not a live integration",
        body: "The Razorpay integration, checkout, payment verification and digital delivery are not implemented in this marketing website sprint. This page describes the intended architecture, not a currently available payment service.",
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
      "Discover CloverLoop, a platform being built to help independent creators sell digital products through their own storefronts with transparent pricing and creator-owned payment arrangements.",
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
      { type: "strong", text: "CloverLoop is being built to make that process simpler." },
      { type: "p", text: "We are creating a platform that gives independent creators a more direct way to present, distribute and sell their digital products through their own storefronts. Our aim is to bring the essential parts of digital product selling together in one straightforward experience, while keeping creators in control of their audience relationships and payment arrangements." },
      { type: "h2", text: "Why we are building CloverLoop" },
      { type: "p", text: "We believe that valuable creative work should have a clear path to monetisation." },
      { type: "p", text: "A musician should be able to sell guitar tabs, backing tracks or learning resources. A designer should be able to distribute templates and creative assets. An educator should be able to offer ebooks, guides and downloadable learning material. A content creator should be able to turn their knowledge and expertise into products their audience can access." },
      { type: "p", text: "These creators should not need to build an entire ecommerce operation just to sell a digital file." },
      { type: "p", text: "We see an opportunity to make the process more accessible by providing the infrastructure required to present digital products, manage a creator-owned storefront and facilitate online sales." },
      { type: "p", text: "CloverLoop is being developed around this idea: simplify the infrastructure so creators can focus on what they do best — creating useful work and building meaningful relationships with their audiences." },
      { type: "h2", text: "Built around creator independence" },
      { type: "p", text: "We believe creators should have greater control over how they present and monetise their work." },
      { type: "p", text: "That belief informs three principles behind CloverLoop." },
      { type: "h3", text: "1. Your own storefront, your identity" },
      { type: "p", text: "Your products deserve a dedicated space that represents your work." },
      { type: "p", text: "CloverLoop is designed to give each creator their own storefront, with a shareable address and a place to present digital products directly to their audience. Instead of relying entirely on marketplace listings or scattered payment links, creators can build a consistent destination for their digital offerings." },
      { type: "p", text: "The intention is simple: your storefront should be an extension of your creator identity, not just another product listing." },
      { type: "h3", text: "2. Transparent payment arrangements" },
      { type: "p", text: "We believe payment arrangements should be straightforward and easy to understand." },
      { type: "p", text: "CloverLoop is designed around a creator-owned payment account model. Creators connect their own payment gateway account, such as Razorpay, to process customer transactions. Eligible sales proceeds are settled by the payment provider directly to the creator's registered bank account." },
      { type: "p", text: "CloverLoop's platform commission is handled separately through monthly invoicing. Payment gateway processing charges are additional and governed by the provider's terms." },
      { type: "p", text: "This approach is intended to provide greater clarity about how customer payments, payment gateway charges and platform fees are handled." },
      { type: "h3", text: "3. Straightforward and transparent pricing" },
      { type: "p", text: "Creators should be able to understand what a platform costs before committing to it." },
      { type: "p", text: "Our pricing model is designed to offer an accessible starting point, with options for creators at different stages of their digital product business." },
      { type: "p", text: "Whether you are experimenting with your first digital product or already have an established audience, CloverLoop aims to provide a clear pricing structure without making the economics difficult to understand." },
      { type: "p", text: "We want creators to know what they pay, why they pay it and how platform charges relate to their sales." },
      { type: "h2", text: "Designed for creators with something to share" },
      { type: "p", text: "CloverLoop is being built for a broad range of independent creators, including:" },
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
      { type: "p", text: "CloverLoop is currently in its early development and validation phase." },
      { type: "p", text: "We believe the best way to build a useful platform is to understand the people who will use it. That means listening to creators, learning how they currently sell their work, identifying the difficulties they encounter and prioritising the features that genuinely make a difference." },
      { type: "p", text: "We are inviting independent creators to participate in this early journey through our Founding Creator Programme." },
      { type: "p", text: "Their feedback will help us refine the platform's experience, evaluate our assumptions and make informed decisions about what we build next." },
      { type: "p", text: "We do not want to build another platform filled with features that creators do not need. We want to solve real problems, make the experience practical and develop CloverLoop around actual creator requirements." },
      { type: "h2", text: "Our vision" },
      { type: "p", text: "We envision a creator economy where independent individuals have accessible tools to distribute their work, build direct relationships with their audiences and create sustainable income from what they know and make." },
      { type: "p", text: "CloverLoop is one step towards that vision." },
      { type: "p", text: "We are starting with digital products and creator-owned storefronts, with a focus on simplicity, transparency and independence. As we learn from creators and validate the platform, we intend to keep improving the experience around their needs." },
      { type: "strong", text: "Because what you create should have a place of its own." },
      { type: "h2", text: "Be part of the journey" },
      { type: "p", text: "Whether you are a musician, designer, educator, photographer or content creator, if you have something valuable to share, CloverLoop is being built with you in mind." },
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
      "CloverLoop is being built around the needs of independent creators. We value practical feedback about the tools, workflows and experiences that help creators present digital products to their audiences.",
      "Create an account to continue to the next step in the CloverLoop experience.",
    ],
  },
  "help-center": {
    title: "Help Center | CloverLoop",
    description:
      "Find answers about CloverLoop, creator storefronts, pricing and the planned payment model.",
    heading: "How can we help?",
    paragraphs: [
      "Find answers to common questions about CloverLoop, creator storefronts, pricing and the planned payment model. Visit the FAQ page for answers or contact our support team using the email address listed on the Contact page.",
    ],
  },
  contact: {
    title: "Contact CloverLoop",
    description: "Contact the CloverLoop support team.",
    heading: "Contact CloverLoop",
    paragraphs: [
      "Have a question about CloverLoop? Contact our support team using the confirmed support email listed below.",
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
      "Referral tracking, commissions and rewards are not described as available programme features.",
    ],
  },
  terms: {
    title: "Terms of Service | CloverLoop",
    description: "Draft terms of service for CloverLoop, pending legal review.",
    heading: "Terms of Service",
    paragraphs: [
      "Draft for legal review. These terms are an initial outline and are not ready for publication as a binding agreement. Qualified counsel must review and approve the terms before launch.",
      "CloverLoop is intended to provide independent creators with storefront and digital product infrastructure. Creators are responsible for the content they provide and must have the rights and permissions required to distribute it.",
      "Descriptions of payment connectivity and digital delivery on this site refer to planned capabilities. The Razorpay integration, payment processing, product management and digital delivery are not implemented in this sprint.",
      "The intended pricing model applies platform commission to successful paid transactions and invoices it monthly. Razorpay processing fees are separate and governed by the creator's own Razorpay arrangement. Final terms, consumer policies, refunds, liability and governing-law provisions require legal review.",
    ],
  },
  privacy: {
    title: "Privacy Policy | CloverLoop",
    description: "Draft privacy notice for CloverLoop, pending legal review.",
    heading: "Privacy Policy",
    paragraphs: [
      "Draft for legal review. This initial privacy notice must be reviewed by qualified counsel and updated with confirmed operational details before publication.",
      "CloverLoop uses Supabase authentication for account registration and sign-in. Registration may involve an email address and authentication credentials managed through Supabase. Do not send passwords or authentication tokens to analytics.",
      "Analytics services such as Google Analytics 4 or Google Tag Manager are optional and should only load after the visitor gives the required consent. Cookie preferences are stored so the site can respect the visitor's choice.",
      "The final notice must explain the personal data collected, purposes and legal basis, service providers, retention periods, user rights, international transfers where applicable, contact details and how users can make a privacy request. These details require confirmation before launch.",
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
      "Answers about CloverLoop, creator storefronts, digital products, pricing and the planned payment architecture.",
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
      "CloverLoop is a creator-focused platform designed to help independent creators establish their own digital storefronts and sell downloadable products directly to their audiences. The planned platform combines storefront presentation, payment connectivity and digital product delivery in one creator-oriented experience.",
  },
  {
    question: "Who can use CloverLoop?",
    answer:
      "CloverLoop is intended for independent creators, educators, musicians, designers, professionals and other people who create digital products. The product should be suitable for creators who want to sell resources such as ebooks, PDFs, templates, presets, printables and other downloadable files.",
  },
  {
    question: "What kinds of digital products can creators sell?",
    answer:
      "The intended product categories include ebooks, PDF guides, music tabs, backing tracks, audio resources, presets, templates, printables, educational materials and other downloadable digital files. Creators are responsible for ensuring that they own or have permission to distribute the content they sell.",
  },
  {
    question: "Will I get my own storefront?",
    answer:
      "The planned model gives each creator an independent storefront with a shareable URL in the format cloverloop.in/creatorname. The storefront is intended to provide a central destination where an audience can explore a creator's digital products.",
  },
  {
    question: "Do I need my own Razorpay account?",
    answer:
      "Yes. Under CloverLoop's planned payment architecture, each creator connects their own Razorpay account. Customer payments are processed through that creator's account rather than being collected into a central CloverLoop merchant account.",
  },
  {
    question: "Who receives the customer's payment?",
    answer:
      "Razorpay processes the payment through the creator's connected account and settles the proceeds directly to the creator's bank account according to Razorpay's settlement rules and the creator's account configuration. CloverLoop does not centrally collect or hold creator sales proceeds.",
  },
  {
    question: "How does CloverLoop charge its platform fee?",
    answer:
      "CloverLoop calculates its platform commission on successful paid transactions and invoices the creator monthly. The commission is separate from the customer's payment and is not automatically deducted from the payment by CloverLoop.",
  },
  {
    question: "Are Razorpay processing fees included in CloverLoop pricing?",
    answer:
      "No. Razorpay processing charges are additional and are governed by the creator's own Razorpay arrangement. They are separate from CloverLoop's subscription and platform transaction fees.",
  },
  {
    question: "What are the available plans?",
    answer:
      "The intended plans are Free, Creator and Pro Creator. Free costs ₹0 per month with 0% platform transaction fee, one paid product and five free product listings. Creator costs ₹0 per month with a 3% platform transaction fee and unlimited paid and free products and free downloads. Pro Creator costs ₹10,000 per month with a 2% platform transaction fee and unlimited paid and free products and free downloads.",
  },
  {
    question: "How is the platform transaction fee calculated?",
    answer:
      "The platform transaction fee is calculated on successful paid transactions according to the creator's plan. Free products do not attract platform transaction commission. The applicable commission is invoiced monthly.",
  },
  {
    question: "Does the Free plan have a limit on free products?",
    answer:
      "The Free plan allows one paid product and five free product listings. The Creator and Pro Creator plans are intended to include unlimited paid and free products and unlimited free product downloads.",
  },
  {
    question: "Are free products charged a transaction fee?",
    answer:
      "No. Free products do not incur CloverLoop's platform transaction commission. Usage limits apply according to the selected plan.",
  },
  {
    question: "What is the maximum file size?",
    answer:
      "The intended maximum file size is 100 MB per file. The final supported file types and any additional limits should be stated in the product interface when the selling platform is implemented.",
  },
  {
    question: "Can creators set download limits?",
    answer:
      "The planned product includes configurable download limits and secure download links that expire after a reasonable period. These are intended product capabilities and should not be presented as operational during the marketing-site-only implementation sprint.",
  },
  {
    question: "How does digital product delivery work?",
    answer:
      "The intended experience is that customers receive access to the digital files after a successful purchase is verified. Secure links and configurable download limits are part of the planned delivery approach. The actual checkout, verification and delivery workflow are not implemented in the current website sprint.",
  },
  {
    question: "Is CloverLoop a marketplace?",
    answer:
      "CloverLoop is positioned around independent creator storefronts rather than a central marketplace catalogue. Each creator is intended to share their own storefront directly with their audience.",
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
    question: "Does CloverLoop currently process payments?",
    answer:
      "The public website explains the planned payment architecture. The Razorpay integration and live payment processing are not part of the current marketing website implementation. Do not treat a public product description as confirmation that the integration is active.",
  },
  {
    question: "How can I contact CloverLoop?",
    answer:
      "Use the support email address configured for CloverLoop on the Contact page. The production email address must be confirmed before launch; do not substitute an address belonging to another business.",
  },
  {
    question: "Can I sell copyrighted or third-party material?",
    answer:
      "Creators must have the rights and permissions required to distribute the products and included assets. Do not upload or sell material that infringes copyright, trademark, privacy or other third-party rights. Creators should review applicable licences before distributing templates, presets, fonts, photographs, samples or other third-party content.",
  },
  {
    question: "Does CloverLoop guarantee sales or income?",
    answer:
      "No. CloverLoop provides planned storefront and digital product infrastructure. Sales depend on factors such as product quality, audience fit, pricing, promotion and market demand. The platform must not promise a particular sales volume, income or business result.",
  },
];
