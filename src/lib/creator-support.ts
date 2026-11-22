export const MAX_SUPPORT_ATTACHMENTS = 3;
export const MAX_SUPPORT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_SUPPORT_INFORMATION_LENGTH = 2000;

const behaviorOptions = [
  "I see an error message.",
  "The action gets stuck.",
  "Nothing happens when I click.",
  "I cannot find the option.",
  "Something else.",
] as const;

const timingOptions = [
  "Just now.",
  "Today.",
  "A few days ago.",
  "Since I created my account.",
] as const;

const reproduceOptions = [
  "Yes, every time.",
  "Sometimes.",
  "It happened once.",
  "Not sure.",
] as const;

export const CREATOR_SUPPORT_CATEGORIES = [
  {
    id: "products",
    title: "Products",
    description: "Products, digital files, covers and listing limits.",
    guide: { label: "How to add a digital product", href: "/help-center/managing-products/how-to-add-a-digital-product" },
    questions: [
      {
        id: "product_issue",
        prompt: "What are you having trouble with?",
        options: [
          "Adding a new product.",
          "Uploading a digital file.",
          "Editing an existing product.",
          "Product image or cover.",
          "Product activation.",
          "Listing limits.",
          "Something else.",
        ],
      },
      {
        id: "product_behavior",
        prompt: "What happens when you try?",
        options: behaviorOptions,
      },
      {
        id: "product_timing",
        prompt: "When did you first notice this issue?",
        options: timingOptions,
      },
      {
        id: "product_repro",
        prompt: "Can you reproduce the issue?",
        options: reproduceOptions,
      },
    ],
  },
  {
    id: "storefront",
    title: "Storefront",
    description: "Store identity, images, customisation and publishing.",
    guide: { label: "Setting up your storefront", href: "/help-center/creating-your-storefront/setting-up-your-storefront" },
    questions: [
      {
        id: "storefront_area",
        prompt: "Which part of your storefront do you need help with?",
        options: [
          "Creating or updating my storefront.",
          "Store name or username.",
          "Profile picture or banner.",
          "Customisation or layout.",
          "Publishing or visibility.",
          "Something else.",
        ],
      },
      {
        id: "storefront_behavior",
        prompt: "What happens when you try?",
        options: [
          ...behaviorOptions.slice(0, 4),
          "My changes are not showing on the storefront.",
          "Something else.",
        ],
      },
      {
        id: "storefront_timing",
        prompt: "When did you first notice this issue?",
        options: timingOptions,
      },
    ],
  },
  {
    id: "payments_payouts",
    title: "Payments & Payouts",
    description: "Razorpay setup, payments, settlements and refunds.",
    guide: { label: "Payments and settlements", href: "/help-center/payments-and-settlements" },
    questions: [
      {
        id: "payment_area",
        prompt: "What do you need help with?",
        options: [
          "Connecting Razorpay.",
          "A payment failure.",
          "A customer payment issue.",
          "Settlements or payouts.",
          "A refund.",
          "A transaction.",
          "Something else.",
        ],
      },
      {
        id: "payment_behavior",
        prompt: "Which best describes what happened?",
        options: [
          "I could not complete the setup or payment.",
          "The payment is pending or failed.",
          "The customer paid, but the order does not show it.",
          "A settlement or refund has not arrived.",
          "I see an unexpected transaction status.",
          "Something else.",
        ],
      },
      {
        id: "payment_timing",
        prompt: "When did you first notice this issue?",
        options: timingOptions,
      },
    ],
  },
  {
    id: "account_profile",
    title: "Account & Profile",
    description: "Sign-in, verification, profile details and account access.",
    guide: { label: "Account and security", href: "/help-center/account-and-security" },
    questions: [
      {
        id: "account_area",
        prompt: "Which account task are you trying to complete?",
        options: [
          "Signing up or logging in.",
          "Verifying my email.",
          "Changing my username.",
          "Updating profile information.",
          "Recovering account access.",
          "Deleting my account.",
          "Something else.",
        ],
      },
      {
        id: "account_behavior",
        prompt: "What is getting in the way?",
        options: [
          "I see an error message.",
          "I did not receive an email.",
          "I cannot access the right account.",
          "My changes are not being saved.",
          "I cannot find the option.",
          "Something else.",
        ],
      },
    ],
  },
  {
    id: "plans_billing",
    title: "Plans & Billing",
    description: "Plan features, fees, upgrades and billing questions.",
    guide: { label: "Understanding CloverLoop pricing", href: "/help-center/pricing-and-platform-fees/understanding-cloverloop-pricing" },
    questions: [
      {
        id: "billing_area",
        prompt: "What would you like help understanding?",
        options: [
          "Plan features or allowances.",
          "Platform transaction fees.",
          "Upgrading or downgrading.",
          "A subscription payment.",
          "A billing issue.",
          "Something else.",
        ],
      },
      {
        id: "billing_behavior",
        prompt: "Which best describes your question?",
        options: [
          "A charge or fee looks unexpected.",
          "I cannot change my plan.",
          "My plan has not updated.",
          "I need help understanding an allowance.",
          "Something else.",
        ],
      },
    ],
  },
  {
    id: "instagram_automation",
    title: "Instagram Automation",
    description: "Instagram connection, permissions and automations.",
    guide: { label: "Troubleshooting common issues", href: "/help-center/troubleshooting/common-cloverloop-issues" },
    questions: [
      {
        id: "instagram_area",
        prompt: "Which part of Instagram automation needs attention?",
        options: [
          "Connecting Instagram.",
          "Account permissions.",
          "Setting up an automation.",
          "An automation is not working.",
          "Something else.",
        ],
      },
      {
        id: "instagram_behavior",
        prompt: "What happens when you try?",
        options: [
          "I see an error message.",
          "The connection does not finish.",
          "The automation does not run.",
          "It runs but does the wrong thing.",
          "I cannot find the option.",
          "Something else.",
        ],
      },
      {
        id: "instagram_timing",
        prompt: "When did you first notice this issue?",
        options: timingOptions,
      },
    ],
  },
  {
    id: "technical_issues",
    title: "Technical Issues",
    description: "Loading problems, errors and features that are not working.",
    guide: { label: "Troubleshooting common issues", href: "/help-center/troubleshooting/common-cloverloop-issues" },
    questions: [
      {
        id: "technical_symptom",
        prompt: "What are you experiencing?",
        options: [
          "Something is not loading.",
          "I see an unexpected error.",
          "A button or feature is not working.",
          "A page is displaying incorrectly.",
          "Something else.",
        ],
      },
      {
        id: "technical_behavior",
        prompt: "What happens when you try?",
        options: [
          "I see an error message.",
          "The page or action gets stuck.",
          "Nothing happens when I click.",
          "It works sometimes, but not always.",
          "Not sure.",
        ],
      },
      {
        id: "technical_timing",
        prompt: "When did you first notice this issue?",
        options: timingOptions,
      },
      {
        id: "technical_repro",
        prompt: "Can you reproduce the issue?",
        options: reproduceOptions,
      },
    ],
  },
  {
    id: "other_questions",
    title: "Other Questions",
    description: "General questions, feature requests and business enquiries.",
    guide: { label: "Browse frequently asked questions", href: "/faq" },
    questions: [
      {
        id: "other_topic",
        prompt: "What would you like to discuss?",
        options: [
          "A general question.",
          "A feature request.",
          "A business enquiry.",
          "Something else.",
        ],
      },
    ],
  },
] as const;

export type CreatorSupportCategory = (typeof CREATOR_SUPPORT_CATEGORIES)[number];
export type CreatorSupportCategoryId = CreatorSupportCategory["id"];
export type CreatorSupportAnswer = { question: string; answer: string };

type SupportValidation<T> = { ok: true; value: T } | { ok: false; message: string };

export type ParsedCreatorSupportSubmission = {
  category: CreatorSupportCategoryId;
  answers: CreatorSupportAnswer[];
  additionalInformation: string;
  attachmentPaths: string[];
};

export function isCreatorSupportAttachmentPath(path: unknown, userId: string): path is string {
  if (typeof path !== "string") return false;
  const userPathPattern = new RegExp(
    `^${userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.webp$`,
    "i",
  );
  return userPathPattern.test(path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCreatorSupportSubmission(
  input: unknown,
  userId: string,
): SupportValidation<ParsedCreatorSupportSubmission> {
  if (!isRecord(input)) {
    return { ok: false, message: "Your support request could not be validated. Please try again." };
  }

  const category = CREATOR_SUPPORT_CATEGORIES.find((item) => item.id === input.category);
  if (!category) {
    return { ok: false, message: "Choose an issue category before submitting." };
  }
  if (!isRecord(input.answers)) {
    return { ok: false, message: "Answer the guided questions before submitting." };
  }

  const answers: CreatorSupportAnswer[] = [];
  for (const question of category.questions) {
    const answer = input.answers[question.id];
    if (
      typeof answer !== "string" ||
      !(question.options as readonly string[]).includes(answer)
    ) {
      return { ok: false, message: "Complete each support question before submitting." };
    }
    answers.push({ question: question.prompt, answer });
  }
  if (Object.keys(input.answers).length !== category.questions.length) {
    return { ok: false, message: "Your support answers could not be validated. Please review them." };
  }

  const additionalInformation = input.additionalInformation;
  if (
    typeof additionalInformation !== "string" ||
    additionalInformation.trim().length > MAX_SUPPORT_INFORMATION_LENGTH
  ) {
    return { ok: false, message: "Additional information must be 2,000 characters or fewer." };
  }

  const attachmentPaths = input.attachmentPaths;
  if (
    !Array.isArray(attachmentPaths) ||
    attachmentPaths.length > MAX_SUPPORT_ATTACHMENTS ||
    attachmentPaths.some((path) => typeof path !== "string") ||
    new Set(attachmentPaths).size !== attachmentPaths.length
  ) {
    return { ok: false, message: "Remove unsupported screenshots and try again." };
  }
  if (attachmentPaths.some((path) => !isCreatorSupportAttachmentPath(path, userId))) {
    return { ok: false, message: "One or more screenshots could not be verified. Please upload them again." };
  }

  return {
    ok: true,
    value: {
      category: category.id,
      answers,
      additionalInformation: additionalInformation.trim(),
      attachmentPaths,
    },
  };
}
