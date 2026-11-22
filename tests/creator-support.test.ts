import { describe, expect, it } from "vitest";
import {
  CREATOR_SUPPORT_CATEGORIES,
  parseCreatorSupportSubmission,
} from "@/lib/creator-support";

const USER_ID = "c9c8b242-30d2-48f2-a0dc-6126f7a64008";

function validInput(
  categoryId: (typeof CREATOR_SUPPORT_CATEGORIES)[number]["id"],
): {
  category: (typeof CREATOR_SUPPORT_CATEGORIES)[number]["id"];
  answers: Record<string, string>;
  additionalInformation: string;
  attachmentPaths: string[];
} {
  const category = CREATOR_SUPPORT_CATEGORIES.find((item) => item.id === categoryId)!;
  return {
    category: categoryId,
    answers: Object.fromEntries(category.questions.map((question) => [
      question.id,
      String(question.options[0]),
    ])),
    additionalInformation: "I noticed this while setting things up.",
    attachmentPaths: [
      `${USER_ID}/fb814cc8-8235-47f3-914a-7acb1830af15.webp`,
    ],
  };
}

describe("creator support request validation", () => {
  it("defines a tailored question flow for all eight support categories", () => {
    expect(CREATOR_SUPPORT_CATEGORIES).toHaveLength(8);
    for (const category of CREATOR_SUPPORT_CATEGORIES) {
      expect(category.questions.length).toBeGreaterThan(0);
      expect(new Set(category.questions.map((question) => question.id)).size).toBe(category.questions.length);
    }
  });

  it("accepts category-specific choices and own private attachment paths", () => {
    const result = parseCreatorSupportSubmission(validInput("products"), USER_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.category).toBe("products");
      expect(result.value.answers[0].question).toBe("What are you having trouble with?");
      expect(result.value.attachmentPaths).toHaveLength(1);
    }
  });

  it("rejects incomplete or unrecognized guided answers", () => {
    const incomplete = validInput("technical_issues");
    delete incomplete.answers.technical_repro;
    expect(parseCreatorSupportSubmission(incomplete, USER_ID).ok).toBe(false);

    const invalid = validInput("products");
    invalid.answers.product_issue = "A made-up answer.";
    expect(parseCreatorSupportSubmission(invalid, USER_ID).ok).toBe(false);
  });

  it("rejects attachments outside the creator's private storage folder", () => {
    const input = validInput("other_questions");
    input.attachmentPaths = ["another-user/fb814cc8-8235-47f3-914a-7acb1830af15.webp"];
    expect(parseCreatorSupportSubmission(input, USER_ID).ok).toBe(false);
  });

  it("enforces attachment and additional-information limits", () => {
    const tooMany = validInput("other_questions");
    tooMany.attachmentPaths = Array.from({ length: 4 }, (_, index) =>
      `${USER_ID}/fb814cc8-8235-47f3-914a-7acb1830af1${index}.webp`,
    );
    expect(parseCreatorSupportSubmission(tooMany, USER_ID).ok).toBe(false);

    const tooLong = validInput("other_questions");
    tooLong.additionalInformation = "x".repeat(2001);
    expect(parseCreatorSupportSubmission(tooLong, USER_ID).ok).toBe(false);
  });
});
