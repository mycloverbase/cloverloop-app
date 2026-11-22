"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CreditCard,
  FileImage,
  LoaderCircle,
  Link2,
  MessageCircle,
  Package,
  Receipt,
  Send,
  Store,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SocialPlatformIcon } from "@/components/storefront/social-platform-icon";
import {
  CREATOR_SUPPORT_CATEGORIES,
  MAX_SUPPORT_ATTACHMENT_BYTES,
  MAX_SUPPORT_ATTACHMENTS,
  MAX_SUPPORT_INFORMATION_LENGTH,
  type CreatorSupportCategory,
  type CreatorSupportCategoryId,
} from "@/lib/creator-support";
import {
  createCreatorSupportRequestAction,
  deleteCreatorSupportAttachmentAction,
} from "@/app/dashboard/help/actions";

type SupportAttachment = {
  id: string;
  path: string | null;
  previewUrl: string;
  fileName: string;
  size: number;
  status: "uploading" | "uploaded" | "error";
  progress: number;
  error?: string;
};

type FlowPhase = "categories" | "notice" | "questions" | "screenshots" | "review" | "success";

const categoryIcons: Record<CreatorSupportCategoryId, LucideIcon> = {
  products: Package,
  storefront: Store,
  payments_payouts: CreditCard,
  account_profile: UserRound,
  plans_billing: Receipt,
  instagram_automation: Link2,
  technical_issues: Wrench,
  other_questions: MessageCircle,
};

function uploadScreenshot(
  file: File,
  onProgress: (progress: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", "/api/dashboard/support-attachments");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      let response: { ok?: boolean; path?: string; message?: string };
      try {
        response = JSON.parse(request.responseText) as typeof response;
      } catch {
        reject(new Error("The screenshot upload response could not be read."));
        return;
      }
      if (request.status < 200 || request.status >= 300 || !response.ok || !response.path) {
        reject(new Error(response.message || "The screenshot could not be uploaded."));
        return;
      }
      resolve(response.path);
    });
    request.addEventListener("error", () => reject(new Error("The screenshot could not be uploaded. Check your connection and try again.")));
    request.send(formData);
  });
}

function categoryById(categoryId: CreatorSupportCategoryId | null): CreatorSupportCategory | null {
  return CREATOR_SUPPORT_CATEGORIES.find((category) => category.id === categoryId) ?? null;
}

export function CreatorSupportFlow() {
  const [phase, setPhase] = useState<FlowPhase>("categories");
  const [categoryId, setCategoryId] = useState<CreatorSupportCategoryId | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [editingAnswers, setEditingAnswers] = useState(false);
  const [attachments, setAttachments] = useState<SupportAttachment[]>([]);
  const [additionalInformation, setAdditionalInformation] = useState("");
  const [reference, setReference] = useState("");
  const [notificationWarning, setNotificationWarning] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const attachmentsRef = useRef(attachments);
  const previewUrls = useRef(new Set<string>());

  const category = categoryById(categoryId);
  const currentQuestion = category?.questions[questionIndex] ?? null;

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
  }, []);

  function chooseCategory(nextCategoryId: CreatorSupportCategoryId) {
    if (categoryId !== nextCategoryId) {
      setAnswers({});
      setAdditionalInformation("");
      setQuestionIndex(0);
      setEditingAnswers(false);
    }
    setCategoryId(nextCategoryId);
    setError("");
    setPhase("notice");
  }

  function continueQuestion() {
    if (!category || !currentQuestion || !answers[currentQuestion.id]) return;
    setError("");
    if (questionIndex < category.questions.length - 1) {
      setQuestionIndex(questionIndex + 1);
      return;
    }
    if (editingAnswers) {
      setEditingAnswers(false);
      setPhase("review");
    } else {
      setPhase("screenshots");
    }
  }

  function goBackFromQuestion() {
    if (questionIndex > 0) {
      setQuestionIndex(questionIndex - 1);
      return;
    }
    if (editingAnswers) {
      setEditingAnswers(false);
      setPhase("review");
    } else {
      setPhase("notice");
    }
  }

  async function addFiles(fileList: FileList | File[]) {
    setError("");
    const selectedFiles = Array.from(fileList);
    const availableSlots = MAX_SUPPORT_ATTACHMENTS - attachmentsRef.current.length;
    if (selectedFiles.length > availableSlots) {
      setError(`You can attach up to ${MAX_SUPPORT_ATTACHMENTS} screenshots.`);
    }

    for (const file of selectedFiles.slice(0, Math.max(availableSlots, 0))) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        setError(`${file.name}: use a PNG, JPG or WebP screenshot.`);
        continue;
      }
      if (!file.size || file.size > MAX_SUPPORT_ATTACHMENT_BYTES) {
        setError(`${file.name}: each screenshot must be 5 MB or smaller.`);
        continue;
      }

      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      const attachment: SupportAttachment = {
        id,
        path: null,
        previewUrl,
        fileName: file.name,
        size: file.size,
        status: "uploading",
        progress: 0,
      };
      attachmentsRef.current = [...attachmentsRef.current, attachment];
      setAttachments((current) => [...current, attachment]);

      try {
        const path = await uploadScreenshot(file, (progress) => {
          setAttachments((current) => current.map((item) =>
            item.id === id ? { ...item, progress } : item,
          ));
        });
        setAttachments((current) => current.map((item) =>
          item.id === id ? { ...item, path, status: "uploaded", progress: 100 } : item,
        ));
      } catch (uploadError) {
        const message = uploadError instanceof Error
          ? uploadError.message
          : "The screenshot could not be uploaded. Please try again.";
        setAttachments((current) => current.map((item) =>
          item.id === id ? { ...item, status: "error", error: message } : item,
        ));
        setError(message);
      }
    }
  }

  async function removeAttachment(attachment: SupportAttachment) {
    if (attachment.status === "uploading" || removingId) return;
    setError("");
    setRemovingId(attachment.id);
    if (attachment.path) {
      try {
        const result = await deleteCreatorSupportAttachmentAction(attachment.path);
        if (!result.ok) {
          setError(result.message);
          setRemovingId(null);
          return;
        }
      } catch (removeError) {
        console.error("Could not remove a creator support screenshot.", removeError);
        setError("The screenshot could not be removed. Please try again.");
        setRemovingId(null);
        return;
      }
    }
    URL.revokeObjectURL(attachment.previewUrl);
    previewUrls.current.delete(attachment.previewUrl);
    const remaining = attachmentsRef.current.filter((item) => item.id !== attachment.id);
    attachmentsRef.current = remaining;
    setAttachments(remaining);
    setRemovingId(null);
  }

  async function submitRequest() {
    if (!category || attachments.some((attachment) => attachment.status !== "uploaded") || busy) return;
    setBusy(true);
    setError("");
    setNotificationWarning("");
    try {
      const result = await createCreatorSupportRequestAction({
        category: category.id,
        answers,
        additionalInformation,
        attachmentPaths: attachments.flatMap((attachment) => attachment.path ? [attachment.path] : []),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setReference(result.reference);
      setNotificationWarning(result.notificationWarning ?? "");
      setPhase("success");
    } catch (submitError) {
      console.error("Could not submit a creator support request.", submitError);
      setError("Your support request could not be submitted. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "success") {
    return (
      <section className="support-flow-card dashboard-card" aria-live="polite">
        <div className="support-success-icon"><Check size={26} aria-hidden="true" /></div>
        <span className="eyebrow">Support request received</span>
        <h2>Your request has been submitted</h2>
        <p>We&apos;ve received your support request. Our team will review the details and get back to you.</p>
        <div className="support-request-reference">
          <span>Support reference</span>
          <strong>{reference}</strong>
        </div>
        {notificationWarning ? (
          <p className="dashboard-message dashboard-message-warning" role="status">
            {notificationWarning}
          </p>
        ) : null}
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            for (const url of previewUrls.current) URL.revokeObjectURL(url);
            previewUrls.current.clear();
            attachmentsRef.current = [];
            setPhase("categories");
            setCategoryId(null);
            setAnswers({});
            setAttachments([]);
            setAdditionalInformation("");
            setReference("");
            setNotificationWarning("");
            setQuestionIndex(0);
          }}
        >
          Start another request
        </button>
      </section>
    );
  }

  return (
    <section className="support-flow-section" aria-labelledby="support-flow-title">
      <header className="support-flow-heading">
        <span className="eyebrow">Guided support</span>
        <h2 id="support-flow-title">Get help with an issue</h2>
        <p>Choose a topic and we&apos;ll guide you through a few questions.</p>
      </header>

      {phase === "categories" ? (
        <div className="support-category-grid">
          {CREATOR_SUPPORT_CATEGORIES.map((item) => {
            const Icon = categoryIcons[item.id];
            return (
              <button
                type="button"
                key={item.id}
                className={`support-category-card${categoryId === item.id ? " selected" : ""}`}
                aria-pressed={categoryId === item.id}
                onClick={() => chooseCategory(item.id)}
              >
                <span className="support-category-icon">
                  {item.id === "instagram_automation"
                    ? <SocialPlatformIcon platform="Instagram" monochrome />
                    : <Icon size={20} aria-hidden="true" />}
                </span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}

      {phase === "notice" && category ? (
        <div className="support-flow-card dashboard-card" role="region" aria-labelledby="support-notice-title">
          <div className="support-notice">
            <FileImage size={20} aria-hidden="true" />
            <div>
              <h3 id="support-notice-title">Before you continue</h3>
              <p>
                If you&apos;re reporting a technical issue or an error, please keep a screenshot handy.
                It will help our support team understand and resolve the issue faster.
              </p>
              <small>You can continue without a screenshot.</small>
            </div>
          </div>
          <div className="support-flow-actions">
            <button type="button" className="button button-secondary" onClick={() => setPhase("categories")}>
              <ArrowLeft size={16} aria-hidden="true" /> Choose a different issue
            </button>
            <button type="button" className="button" onClick={() => {
              setQuestionIndex(0);
              setPhase("questions");
            }}>
              Continue to questions <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {phase === "questions" && category && currentQuestion ? (
        <div className="support-flow-card dashboard-card" aria-live="polite">
          <div className="support-question-progress">
            <div>
              <span>Question {questionIndex + 1} of {category.questions.length}</span>
              <span>{category.title}</span>
            </div>
            <div className="support-question-progress-track" role="progressbar" aria-label="Question progress" aria-valuemin={1} aria-valuemax={category.questions.length} aria-valuenow={questionIndex + 1}>
              <span style={{ width: `${((questionIndex + 1) / category.questions.length) * 100}%` }} />
            </div>
          </div>
          <h3 className="support-question-title">{currentQuestion.prompt}</h3>
          <div className="support-answer-options" role="group" aria-label={currentQuestion.prompt}>
            {currentQuestion.options.map((option) => (
              <button
                type="button"
                key={option}
                className={`support-answer-option${answers[currentQuestion.id] === option ? " selected" : ""}`}
                aria-pressed={answers[currentQuestion.id] === option}
                onClick={() => setAnswers((current) => ({ ...current, [currentQuestion.id]: option }))}
              >
                <span aria-hidden="true" />
                {option}
              </button>
            ))}
          </div>
          <p className="support-related-guide">
            <BookOpen size={15} aria-hidden="true" />
            <Link href={category.guide.href}>Related guide: {category.guide.label}</Link>
          </p>
          <div className="support-flow-actions">
            <button type="button" className="button button-secondary" onClick={goBackFromQuestion}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <button
              type="button"
              className="button"
              onClick={continueQuestion}
              disabled={!answers[currentQuestion.id]}
            >
              Continue <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
          {!editingAnswers ? (
            <button type="button" className="support-change-category" onClick={() => setPhase("categories")}>
              Change issue category
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === "screenshots" && category ? (
        <div className="support-flow-card dashboard-card">
          <div className="support-question-progress">
            <div>
              <span>Optional evidence</span>
              <span>{category.title}</span>
            </div>
            <div className="support-question-progress-track" aria-hidden="true">
              <span style={{ width: "100%" }} />
            </div>
          </div>
          <h3 className="support-question-title">Attach a screenshot (optional)</h3>
          <p className="support-upload-description">
            Upload a screenshot showing the issue you&apos;re experiencing. Please hide any sensitive
            information before uploading.
          </p>
          <div
            className={`support-dropzone${dragging ? " dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void addFiles(event.dataTransfer.files);
            }}
          >
            <FileImage size={24} aria-hidden="true" />
            <strong>Drop screenshots here</strong>
            <span>or choose PNG, JPG or WebP images · up to 5 MB each · max 3</span>
            <label className="button button-secondary">
              Choose screenshots
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={attachments.length >= MAX_SUPPORT_ATTACHMENTS}
                onChange={(event) => {
                  if (event.currentTarget.files) void addFiles(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          {attachments.length ? (
            <ul className="support-attachment-list" aria-label="Screenshot uploads">
              {attachments.map((attachment) => (
                <li className="support-attachment-card" key={attachment.id}>
                  <div className="support-attachment-preview">
                    <Image src={attachment.previewUrl} alt="" fill unoptimized sizes="96px" />
                  </div>
                  <div className="support-attachment-details">
                    <strong>{attachment.fileName}</strong>
                    <small>{(attachment.size / (1024 * 1024)).toFixed(1)} MB</small>
                    {attachment.status === "uploading" ? (
                      <div className="support-upload-progress" aria-label={`Uploading ${attachment.progress}%`}>
                        <span style={{ width: `${attachment.progress}%` }} />
                      </div>
                    ) : attachment.error ? (
                      <small className="support-attachment-error">{attachment.error}</small>
                    ) : (
                      <small className="support-attachment-ready"><Check size={13} aria-hidden="true" /> Uploaded privately</small>
                    )}
                  </div>
                  <button
                    type="button"
                    className="support-attachment-remove"
                    aria-label={`Remove ${attachment.fileName}`}
                    title="Remove screenshot"
                    disabled={attachment.status === "uploading" || removingId === attachment.id}
                    onClick={() => void removeAttachment(attachment)}
                  >
                    {removingId === attachment.id
                      ? <LoaderCircle className="spin" size={17} aria-hidden="true" />
                      : <Trash2 size={17} aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="support-flow-actions">
            <button type="button" className="button button-secondary" onClick={() => {
              setQuestionIndex(category.questions.length - 1);
              setPhase("questions");
            }}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <button
              type="button"
              className="button"
              disabled={attachments.some((attachment) => attachment.status !== "uploaded") || Boolean(removingId)}
              onClick={() => {
                setError("");
                setPhase("review");
              }}
            >
              {attachments.length ? "Review request" : "Continue without a screenshot"}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {phase === "review" && category ? (
        <div className="support-flow-card dashboard-card">
          <span className="eyebrow">Final review</span>
          <h3 className="support-question-title">Review your support request</h3>
          <dl className="support-review-list">
            <div>
              <dt>Issue category</dt>
              <dd>{category.title}</dd>
              <button type="button" onClick={() => setPhase("categories")}>Change</button>
            </div>
            {category.questions.map((question, index) => (
              <div key={question.id}>
                <dt>{question.prompt}</dt>
                <dd>{answers[question.id]}</dd>
                <button type="button" onClick={() => {
                  setQuestionIndex(index);
                  setEditingAnswers(true);
                  setPhase("questions");
                }}>
                  Edit
                </button>
              </div>
            ))}
            <div>
              <dt>Screenshots</dt>
              <dd>{attachments.length ? `${attachments.length} attached` : "None attached"}</dd>
              <button type="button" onClick={() => setPhase("screenshots")}>Edit</button>
            </div>
          </dl>
          {attachments.length ? (
            <div className="support-review-attachments">
              {attachments.map((attachment) => (
                <div className="support-review-attachment" key={attachment.id}>
                  <div className="support-attachment-preview">
                    <Image src={attachment.previewUrl} alt="" fill unoptimized sizes="96px" />
                  </div>
                  <span>{attachment.fileName}</span>
                </div>
              ))}
            </div>
          ) : null}
          <label className="dashboard-field">
            <span>Anything else we should know? <small>Optional</small></span>
            <textarea
              rows={4}
              maxLength={MAX_SUPPORT_INFORMATION_LENGTH}
              value={additionalInformation}
              onChange={(event) => setAdditionalInformation(event.target.value)}
              placeholder="Share any other details that may help us understand the issue."
            />
            <small>{additionalInformation.length}/{MAX_SUPPORT_INFORMATION_LENGTH} characters. Do not include passwords, API keys, payment credentials or other sensitive information.</small>
          </label>
          {error ? <p className="dashboard-message dashboard-message-error" role="alert">{error}</p> : null}
          <div className="support-flow-actions">
            <button type="button" className="button button-secondary" disabled={busy} onClick={() => setPhase("screenshots")}>
              <ArrowLeft size={16} aria-hidden="true" /> Go back
            </button>
            <button type="button" className="button" disabled={busy} onClick={() => void submitRequest()}>
              {busy ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              {busy ? "Submitting…" : "Submit support request"}
            </button>
          </div>
        </div>
      ) : null}

      {error && phase !== "review" ? <p className="dashboard-message dashboard-message-error" role="alert">{error}</p> : null}
    </section>
  );
}
