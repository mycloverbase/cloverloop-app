import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Download,
  FileText,
  Film,
  Layers3,
  LayoutTemplate,
  PackageOpen,
  Presentation,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { PublicCta } from "@/components/public-cta";
import { Breadcrumbs } from "@/components/site-header";
import { TrackLink } from "@/components/track-link";
import { resourceCards } from "@/lib/site";

const digitalProducts = [
  { title: "Templates", body: "Share practical layouts for planning, design, work or study.", icon: LayoutTemplate },
  { title: "Presets & LUTs", body: "Package creative looks with compatibility notes and clear setup instructions.", icon: Sparkles },
  { title: "Guides & PDFs", body: "Turn a process, lesson or area of expertise into a useful reference.", icon: FileText },
  { title: "Bundles", body: "Bring complementary resources together as one clearly described offer.", icon: PackageOpen },
];

const digitalSteps = [
  { title: "Choose your offer", body: "Start with a specific audience need and a useful outcome." },
  { title: "Prepare your digital product", body: "Organise files, instructions, formats and compatibility details." },
  { title: "Set your price", body: "Consider the value, effort, support and costs behind your offer." },
  { title: "Build your audience and prepare to launch", body: "Share useful previews and plan how you will reach interested customers." },
];

const digitalFaqs = [
  {
    question: "What types of digital products can creators sell?",
    answer: "Creators can plan to offer ebooks, PDF guides, templates, presets, LUTs, printables, bundles and other original downloadable resources. CloverLoop's storefront and product-upload features are not live yet.",
  },
  {
    question: "Which file formats will be supported?",
    answer: "The planned maximum is 100 MB per file, but supported file types will be confirmed when uploads are available. Product uploads are not currently live, so no format should be represented as supported today.",
  },
  {
    question: "How will buyers receive digital products?",
    answer: "Automated checkout and file delivery are planned capabilities, not live functionality. Creators should not promise CloverLoop delivery until those features are available.",
  },
  {
    question: "How will secure downloads work?",
    answer: "Configurable download limits and secure links with reasonable expiry are part of the planned product experience. Secure file delivery is not currently operational, so no download-security capability should be represented as live.",
  },
  {
    question: "What platform fees apply?",
    answer: "Free is ₹0/month with 0% on the first ₹10,000 of Gross Sales per calendar month and 4% only on the amount above that allowance. Creator is ₹0/month with a 4% platform fee. Pro Creator is ₹1,499/month with a 2.5% platform fee. Payment-provider charges and applicable taxes are separate. See the full details on the Pricing page.",
  },
  {
    question: "Can creators offer free products?",
    answer: "The Free plan currently includes five free product listings per account for the lifetime of the account. Creator and Pro Creator include unlimited free and paid product listings. Product publishing is not yet live.",
  },
  {
    question: "How will refunds and customer support work?",
    answer: "Creators remain responsible for clear product information, buyer support and their refund obligations under applicable policies and law. CloverLoop's checkout and order-management capabilities are not live; review the published refund policy and terms before making commitments to buyers.",
  },
];

const courseProducts = [
  { title: "Recorded video courses", body: "Plan a sequence of recorded lessons and supporting materials hosted through your chosen service.", icon: Film },
  { title: "Live workshops & cohorts", body: "Organise a time-bound learning experience with sessions, practice and direct interaction.", icon: UsersRound },
  { title: "Downloadable learning resources", body: "Prepare workbooks, lesson notes, templates and reference PDFs to support learning.", icon: Download },
  { title: "Course bundles", body: "Pair learning materials with related templates or guides as a coherent offer; course hosting is not provided by CloverLoop.", icon: Boxes },
];

const courseSteps = [
  { title: "Define your learning outcome", body: "Describe who the course is for and what learners should be able to do." },
  { title: "Plan modules and lessons", body: "Arrange concepts into a clear sequence with a purpose for each lesson." },
  { title: "Prepare videos and supporting resources", body: "Create readable lessons, helpful practice and accessible reference files." },
  { title: "Price and promote your course", body: "Explain the outcome, curriculum, prerequisites, support and access model." },
];

const courseBenefits = [
  { title: "Structured learning paths", body: "A purposeful sequence helps learners understand where to start and what comes next.", icon: Layers3 },
  { title: "Clear lesson organisation", body: "Consistent module and lesson names make a curriculum easier to navigate.", icon: BookOpen },
  { title: "Supporting downloadable resources", body: "Workbooks and reference materials can help learners apply each lesson.", icon: FileText },
  { title: "A consistent learning experience", body: "Set expectations for access, support and practice across your chosen tools.", icon: Presentation },
];

const courseFaqs = [
  { question: "What types of courses can creators offer?", answer: "Creators can plan recorded courses, live workshops, cohorts and related learning resources. CloverLoop is not currently a course-hosting or learning-management system." },
  { question: "Can I sell recorded video courses?", answer: "You can plan a recorded course and explain where lessons are hosted, but CloverLoop does not currently host videos, provide a course player or manage student access." },
  { question: "Where will course videos be hosted?", answer: "Creators will need to choose and describe an appropriate external video or learning service. CloverLoop video hosting is not currently available." },
  { question: "Can I offer free preview lessons?", answer: "You can plan a preview using a service you control. CloverLoop does not currently provide preview-lesson or course-player functionality." },
  { question: "How will students access purchased courses?", answer: "Checkout and student-access management are not live CloverLoop capabilities. Do not promise automated enrolment or course access through CloverLoop." },
  { question: "Can I offer live workshops?", answer: "Creators may plan live workshops or cohorts using their own scheduling and meeting tools. CloverLoop does not currently host webinars or paid calls." },
  { question: "What platform fees apply to courses?", answer: "The published plan rates are Free: 0% on the first ₹10,000 of monthly Gross Sales and 4% only above it; Creator: 4%; Pro Creator: 2.5%. Monthly plan prices are ₹0, ₹0 and ₹1,499 respectively. Payment-provider fees and applicable taxes are separate. See Pricing for plan limits and details." },
  { question: "Do I need GST registration to sell online courses?", answer: "GST registration and tax treatment depend on your turnover, supply, location and applicable provisions or exceptions. This is general information, not tax advice; consult a qualified Indian tax professional about your circumstances." },
];

function GuideCards({ slugs }: { slugs: string[] }) {
  const guides = slugs
    .map((slug) => resourceCards.find((resource) => resource.slug === slug))
    .filter((resource): resource is (typeof resourceCards)[number] => Boolean(resource));

  return (
    <div className="resource-card-grid">
      {guides.map((guide) => (
        <Link href={`/resources/${guide.slug}`} className="resource-card" key={guide.slug}>
          <div className="resource-card-image">
            <Image src={guide.image} alt="" width={1376} height={768} sizes="(max-width: 700px) 100vw, 30vw" />
          </div>
          <span className="eyebrow">{guide.category}</span>
          <h3>{guide.title}</h3>
          <p>{guide.description}</p>
          <span className="resource-card-link">Read the guide <ArrowRight size={15} /></span>
        </Link>
      ))}
    </div>
  );
}

function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <div className="steps-grid">
      {steps.map((step, index) => (
        <article className="step-card" key={step.title}>
          <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </article>
      ))}
    </div>
  );
}

function Faqs({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div className="faq-list">
      {items.map((item) => (
        <details className="faq-item" key={item.question}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function DigitalProductsLandingPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Digital Products" }]} />
      <section className="feature-hero page-width">
        <div className="feature-hero-copy">
          <span className="eyebrow">Digital products</span>
          <h1>A simpler way to sell digital downloads</h1>
          <p>Plan clear product details and access instructions for downloadable products such as ebooks, templates and presets.</p>
          <div className="landing-actions">
            <TrackLink href="/signup" event="signup_click" className="button">Get Started for Free <ArrowRight size={17} /></TrackLink>
            <Link href="/pricing" className="button button-secondary">Explore Pricing</Link>
          </div>
        </div>
        <div className="feature-hero-image">
          <Image src="/images/home/digital-product-collection.webp" alt="Digital product formats including guides, templates and creative downloads" width={1376} height={768} priority sizes="(max-width: 760px) 100vw, 54vw" />
        </div>
      </section>

      <section className="section-space landing-section">
        <div className="page-width">
          <header className="section-heading"><span className="eyebrow">What you can sell</span><h2>Choose a format that fits your work</h2></header>
          <div className="landing-card-grid">
            {digitalProducts.map(({ title, body, icon: Icon }) => (
              <article className="landing-card" key={title}><span className="landing-icon"><Icon size={22} /></span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-space landing-section landing-section-muted">
        <div className="page-width">
          <header className="section-heading"><span className="eyebrow">Start selling in four steps</span><h2>From useful idea to launch plan</h2></header>
          <Steps steps={digitalSteps} />
        </div>
      </section>

      <section className="section-space landing-section">
        <div className="page-width keep-card">
          <div><span className="eyebrow">What you keep</span><h2>Understand the costs behind each sale</h2></div>
          <div>
            <p>Your estimated amount depends on your selected CloverLoop plan, payment-provider processing charges and applicable taxes. Provider fees can vary, and CloverLoop checkout and payment processing are not live yet. Use the calculator to estimate selected costs once your own assumptions are known.</p>
            <Link href="/pricing#earnings-calculator" className="subtle-link">Try the creator earnings calculator <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className="section-space landing-section landing-section-muted">
        <div className="page-width landing-faq">
          <header className="section-heading"><span className="eyebrow">Digital product FAQ</span><h2>Questions about selling downloads</h2></header>
          <Faqs items={digitalFaqs} />
        </div>
      </section>

      <section className="section-space landing-section">
        <div className="page-width">
          <header className="landing-resource-heading"><div><span className="eyebrow">Guides</span><h2>Learn how to build your offer</h2></div></header>
          <GuideCards slugs={["how-to-sell-digital-products-online", "how-to-price-digital-products", "how-to-sell-templates-online"]} />
        </div>
      </section>
      <PublicCta title="Ready to plan your digital product?" />
    </>
  );
}

export function CoursesLandingPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Courses" }]} />
      <section className="feature-hero page-width">
        <div className="feature-hero-copy">
          <span className="eyebrow">Online courses</span>
          <h1>Turn what you know into an online course.</h1>
          <p>Help learners move toward a clear outcome with structured learning, organised lessons and useful educational resources.</p>
          <div className="landing-actions">
            <TrackLink href="/signup" event="signup_click" className="button">Get Started for Free <ArrowRight size={17} /></TrackLink>
            <Link href="/pricing" className="button button-secondary">Explore Pricing</Link>
          </div>
        </div>
        <div className="feature-hero-image">
          <Image src="/images/resources/online-course-ideas.webp" alt="An illustration representing ideas for structured online learning" width={1376} height={768} priority sizes="(max-width: 760px) 100vw, 54vw" />
        </div>
      </section>

      <section className="section-space landing-section">
        <div className="page-width">
          <header className="section-heading"><span className="eyebrow">What you can offer</span><h2>Build an educational offer around your expertise</h2></header>
          <div className="landing-card-grid">
            {courseProducts.map(({ title, body, icon: Icon }) => (
              <article className="landing-card" key={title}><span className="landing-icon"><Icon size={22} /></span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
          <p className="scope-note">Course building, video hosting, a course player, student access management, progress tracking and certificates are not currently available on CloverLoop.</p>
        </div>
      </section>

      <section className="section-space landing-section landing-section-muted">
        <div className="page-width">
          <header className="section-heading"><span className="eyebrow">Start selling in four steps</span><h2>Shape a course learners can follow</h2></header>
          <Steps steps={courseSteps} />
        </div>
      </section>

      <section className="section-space landing-section">
        <div className="page-width">
          <header className="section-heading"><span className="eyebrow">Course-specific benefits</span><h2>Make the learning experience easier to follow</h2></header>
          <div className="landing-card-grid">
            {courseBenefits.map(({ title, body, icon: Icon }) => (
              <article className="landing-card" key={title}><span className="landing-icon"><Icon size={22} /></span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-space landing-section landing-section-muted">
        <div className="page-width landing-faq">
          <header className="section-heading"><span className="eyebrow">Course FAQ</span><h2>Questions about online courses</h2></header>
          <Faqs items={courseFaqs} />
        </div>
      </section>

      <section className="section-space landing-section">
        <div className="page-width">
          <header className="landing-resource-heading"><div><span className="eyebrow">Course guides</span><h2>Plan and prepare your course</h2></div></header>
          <GuideCards slugs={["how-to-create-and-sell-online-course-india", "gst-on-ebooks-and-online-courses-india", "accept-upi-payments-digital-products-razorpay"]} />
        </div>
      </section>
      <PublicCta title="Start with the learning outcome you want to teach." />
    </>
  );
}
