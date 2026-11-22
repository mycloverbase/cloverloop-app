"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  LoaderCircle,
  Store,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  checkStorefrontUsernameAction,
  publishStorefrontAction,
  saveStorefrontAction,
} from "@/app/dashboard/storefront/actions";
import { saveCreatorOnboardingProgressAction } from "@/app/onboarding/actions";
import { ProductManager } from "@/components/storefront/product-manager";
import { ImageCropUploader } from "@/components/storefront/image-crop-uploader";
import { SocialPlatformIcon } from "@/components/storefront/social-platform-icon";
import { SectionManager, StorefrontPreviewFrame } from "@/components/storefront/storefront-editor";
import { SocialLinksEditor } from "@/components/storefront/social-links-editor";
import type { CreatorStorefrontProduct, StorefrontDisplay, StorefrontDraftInput, StorefrontSection } from "@/lib/storefront/types";
import {
  DEFAULT_STOREFRONT_CUSTOMIZATION,
  storefrontUsernameFromName,
} from "@/lib/storefront/types";
import { parseStorefrontDraft } from "@/lib/storefront/validation";
import { track } from "@/lib/analytics";

const stepNames = [
  "Store identity",
  "Storefront images",
  "About you",
  "First product",
  "Social channels",
  "Personalise",
  "Review and publish",
] as const;

type ProgressState = {
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  version: number;
  startedAt: string | null;
  completedAt: string | null;
};

type Props = {
  creatorName: string;
  creatorUsername: string | null;
  creatorBio: string;
  creatorAvatarPath: string | null;
  creatorAvatarUrl: string | null;
  initialStorefront: StorefrontDisplay | null;
  initialProgress: ProgressState;
  subcategoryOptions: { category: string; name: string }[];
  paidProductLimit: number | null;
  freeProductLimit: number | null;
  initialPaidListingCount: number;
  initialFreeListingCount: number;
  referralError: boolean;
};

function suggestedUsername(name: string, preferred: string | null): string {
  if (preferred && /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/i.test(preferred)) {
    return preferred.toLowerCase();
  }
  const fromName = storefrontUsernameFromName(name).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  return fromName.length >= 3 ? fromName : "creator-store";
}

function draftFromProps(props: Props): StorefrontDraftInput {
  const store = props.initialStorefront;
  return {
    storeName: store?.store_name ?? props.creatorName,
    username: store?.username ?? suggestedUsername(props.creatorName, props.creatorUsername),
    description: store?.description ?? props.creatorBio,
    profileImagePath: store?.profile_image_path ?? props.creatorAvatarPath,
    bannerImagePath: store?.banner_image_path ?? null,
    theme: store?.theme ?? "minimal",
    customization: store
      ? { ...store.customization, products: [] }
      : DEFAULT_STOREFRONT_CUSTOMIZATION,
  };
}

function mergeSteps(...groups: number[][]): number[] {
  return [...new Set(groups.flat())].filter((step) => Number.isInteger(step) && step >= 1 && step <= 7).sort();
}

export function CreatorOnboardingWizard(props: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => draftFromProps(props));
  const draftRef = useRef(draft);
  const [storefrontId, setStorefrontId] = useState(props.initialStorefront?.id ?? null);
  const [profileUrl, setProfileUrl] = useState(
    props.initialStorefront?.profileImageUrl ?? props.creatorAvatarUrl,
  );
  const [bannerUrl, setBannerUrl] = useState(props.initialStorefront?.bannerImageUrl ?? null);
  const [products, setProducts] = useState(props.initialStorefront?.products ?? []);
  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(
    Boolean(
      props.initialStorefront &&
      props.initialStorefront.username !== storefrontUsernameFromName(props.initialStorefront.store_name),
    ),
  );
  const [hasActivePaidProduct, setHasActivePaidProduct] = useState(() =>
    (props.initialStorefront?.products ?? []).some(
      (product) => product.isActive && !product.isFree && product.pricePaise > 0,
    ),
  );
  const initiallyComplete = [
    props.initialStorefront?.store_name.trim() && props.initialStorefront.username.trim() ? 1 : 0,
    draftFromProps(props).profileImagePath ? 2 : 0,
    (props.initialStorefront?.description ?? props.creatorBio).trim() ? 3 : 0,
    (props.initialStorefront?.products ?? []).some(
      (product) => product.isActive && !product.isFree && product.pricePaise > 0,
    ) ? 4 : 0,
    draftFromProps(props).customization.socialLinks.length ? 5 : 0,
    props.initialStorefront && (
      props.initialStorefront.theme !== "minimal" ||
      props.initialStorefront.customization.primaryColor !== DEFAULT_STOREFRONT_CUSTOMIZATION.primaryColor ||
      props.initialStorefront.customization.accentColor !== DEFAULT_STOREFRONT_CUSTOMIZATION.accentColor ||
      props.initialStorefront.customization.backgroundColor !== DEFAULT_STOREFRONT_CUSTOMIZATION.backgroundColor ||
      props.initialStorefront.customization.bannerStyle !== DEFAULT_STOREFRONT_CUSTOMIZATION.bannerStyle ||
      props.initialStorefront.customization.sectionOrder.some((section, index) =>
        section !== DEFAULT_STOREFRONT_CUSTOMIZATION.sectionOrder[index],
      ) ||
      props.initialStorefront.customization.hiddenSections.length > 0
    ) ? 6 : 0,
  ].filter(Boolean);
  const [completedSteps, setCompletedSteps] = useState(() =>
    mergeSteps(props.initialProgress.completedSteps, initiallyComplete),
  );
  const [skippedSteps, setSkippedSteps] = useState(() =>
    props.initialProgress.skippedSteps.filter((step) => !initiallyComplete.includes(step)),
  );
  const [currentStep, setCurrentStep] = useState(props.initialProgress.currentStep);
  const [version, setVersion] = useState(props.initialProgress.version);
  const [started, setStarted] = useState(Boolean(props.initialProgress.startedAt));
  const [welcomeVisible, setWelcomeVisible] = useState(!props.initialProgress.startedAt);
  const [saving, setSaving] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [publishedUrl, setPublishedUrl] = useState(
    props.initialStorefront?.status === "published" && props.initialStorefront.username
      ? `https://cloverloop.in/${props.initialStorefront.username}`
      : null,
  );
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const savedSteps = useMemo(
    () => new Set(mergeSteps(completedSteps)),
    [completedSteps],
  );
  const validUsername = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/i.test(draft.username);
  const identityComplete = Boolean(draft.storeName.trim()) && validUsername;
  const profileImageComplete = Boolean(draft.profileImagePath);
  const requiredChecks = [
    { step: 1, label: "Store name and unique username", complete: identityComplete },
    { step: 2, label: "Profile picture", complete: profileImageComplete },
    { step: 4, label: "At least one active paid product", complete: hasActivePaidProduct },
  ];
  const canPublish = requiredChecks.every((item) => item.complete);
  const completedCount = [
    identityComplete || savedSteps.has(1),
    profileImageComplete || savedSteps.has(2),
    Boolean(draft.description.trim()) || savedSteps.has(3),
    hasActivePaidProduct || savedSteps.has(4),
    draft.customization.socialLinks.length > 0 || savedSteps.has(5),
    savedSteps.has(6),
    Boolean(publishedUrl) || savedSteps.has(7),
  ].filter(Boolean).length;
  const previewStore = useMemo(() => ({
    store_name: draft.storeName || "Your store name",
    username: draft.username || "your-store",
    description: draft.description,
    profileImageUrl: profileUrl,
    bannerImageUrl: bannerUrl,
    theme: draft.theme,
    products: products.filter((product) => product.isActive),
    customization: { ...draft.customization, products: [] },
  }), [draft, profileUrl, bannerUrl, products]);

  useEffect(() => {
    if (!started || welcomeVisible) return;
    track("creator_onboarding_step_viewed", {
      step: String(currentStep),
      step_name: stepNames[currentStep - 1],
    });
  }, [currentStep, started, welcomeVisible]);

  useEffect(() => () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
  }, []);

  function applyDraft(update: (current: StorefrontDraftInput) => StorefrontDraftInput) {
    const next = update(draftRef.current);
    draftRef.current = next;
    setDraft(next);
    setError("");
    setFeedback("");
    setDraftSaveState("unsaved");
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (next.storeName.trim() && /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/i.test(next.username)) {
      draftTimer.current = setTimeout(() => {
        void enqueueDraftSave();
      }, 650);
    }
  }

  function enqueueDraftSave(): Promise<boolean> {
    const save = async () => {
      const input = draftRef.current;
      if (!parseStorefrontDraft(input).ok) {
        setDraftSaveState("unsaved");
        return false;
      }
      setDraftSaveState("saving");
      try {
        const result = await saveStorefrontAction(input);
        if (!result.ok) {
          setDraftSaveState("error");
          setError(result.message);
          return false;
        }
        if (result.storefrontId) setStorefrontId(result.storefrontId);
        if (result.path && result.imageUrl && draftRef.current.profileImagePath !== result.path) {
          const next = { ...draftRef.current, profileImagePath: result.path };
          draftRef.current = next;
          setDraft(next);
          setProfileUrl(result.imageUrl);
        }
        setDraftSaveState("saved");
        setError("");
        return true;
      } catch (saveError) {
        console.error("Could not autosave creator onboarding storefront changes.", saveError);
        setDraftSaveState("error");
        setError("Your storefront changes could not be saved. Check your connection and try again.");
        return false;
      }
    };
    const queuedSave = draftSaveQueue.current.then(save, save);
    draftSaveQueue.current = queuedSave;
    return queuedSave;
  }

  async function saveDraftNow(): Promise<boolean> {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    const parsed = parseStorefrontDraft(draftRef.current);
    if (!parsed.ok) {
      setError(parsed.message);
      return false;
    }
    return enqueueDraftSave();
  }

  async function persistProgress(
    nextStep: number,
    nextCompleted: number[],
    nextSkipped: number[],
    options: { markStarted?: boolean; markCompleted?: boolean } = {},
  ): Promise<boolean> {
    const completed = mergeSteps(nextCompleted);
    const skipped = mergeSteps(nextSkipped).filter((step) => !completed.includes(step));
    let result;
    try {
      result = await saveCreatorOnboardingProgressAction({
        currentStep: nextStep,
        completedSteps: completed,
        skippedSteps: skipped,
        version,
        started: options.markStarted,
        completed: options.markCompleted,
      });
    } catch (saveError) {
      console.error("Could not save creator onboarding progress.", saveError);
      setError("Your onboarding progress could not be saved. Check your connection and try again.");
      return false;
    }
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setVersion(result.version);
    setCurrentStep(nextStep);
    setCompletedSteps(completed);
    setSkippedSteps(skipped);
    setError("");
    return true;
  }

  async function beginOnboarding() {
    setSaving(true);
    setError("");
    try {
      const result = await saveCreatorOnboardingProgressAction({
        currentStep: 1,
        completedSteps,
        skippedSteps,
        version,
        started: true,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setVersion(result.version);
      setCurrentStep(1);
      setStarted(true);
      setWelcomeVisible(false);
      track("creator_onboarding_started");
    } catch (startError) {
      console.error("Could not start creator onboarding.", startError);
      setError("Your storefront setup could not be started. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function continueLater() {
    setSaving(true);
    setError("");
    try {
      if (started) {
        const saved = await saveDraftNow();
        if (!saved) {
          setError("Your latest storefront changes could not be saved. Resolve the issue before leaving so your work is not lost.");
          return;
        }
      }
      const result = await persistProgress(currentStep, completedSteps, skippedSteps);
      if (!result) return;
      if (started) track("creator_onboarding_abandoned", { step: String(currentStep) });
      router.push("/dashboard");
    } catch (continueError) {
      console.error("Could not save creator onboarding before leaving.", continueError);
      setError("Your setup could not be saved before leaving. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function continueStep() {
    setSaving(true);
    setError("");
    setFeedback("");
    let completed = completedSteps;
    let skipped = skippedSteps;
    if (currentStep === 1) {
      let availability;
      try {
        availability = await checkStorefrontUsernameAction(draftRef.current.username);
      } catch (availabilityError) {
        console.error("Could not check the onboarding storefront username.", availabilityError);
        setError("Username availability could not be checked. Please try again.");
        setSaving(false);
        return;
      }
      if (!availability.ok) {
        setError(availability.message);
        setSaving(false);
        return;
      }
      if (!await saveDraftNow()) {
        setSaving(false);
        return;
      }
      completed = mergeSteps(completed, [1]);
      skipped = skipped.filter((step) => step !== 1);
    } else if (currentStep === 2) {
      if (!draftRef.current.profileImagePath) {
        setError("Add a profile picture before continuing. You can change it later.");
        setSaving(false);
        return;
      }
      if (!await saveDraftNow()) {
        setSaving(false);
        return;
      }
      completed = mergeSteps(completed, [2]);
      skipped = skipped.filter((step) => step !== 2);
    } else if (currentStep === 3) {
      if (!await saveDraftNow()) {
        setSaving(false);
        return;
      }
      completed = mergeSteps(completed, [3]);
      skipped = skipped.filter((step) => step !== 3);
    } else if (currentStep === 4) {
      if (!await saveDraftNow()) {
        setSaving(false);
        return;
      }
      if (hasActivePaidProduct) {
        completed = mergeSteps(completed, [4]);
        skipped = skipped.filter((step) => step !== 4);
      }
    } else if (currentStep === 5) {
      if (!await saveDraftNow()) {
        setSaving(false);
        return;
      }
      completed = mergeSteps(completed, [5]);
      skipped = skipped.filter((step) => step !== 5);
    } else if (currentStep === 6) {
      if (!await saveDraftNow()) {
        setSaving(false);
        return;
      }
      completed = mergeSteps(completed, [6]);
      skipped = skipped.filter((step) => step !== 6);
    }
    const saved = await persistProgress(Math.min(currentStep + 1, 7), completed, skipped);
    setSaving(false);
    if (saved && currentStep < 7) {
      if (completed.includes(currentStep)) {
        track("creator_onboarding_step_completed", {
          step: String(currentStep),
          step_name: stepNames[currentStep - 1],
        });
      }
    }
  }

  async function skipOptionalStep() {
    if (![3, 5, 6].includes(currentStep)) return;
    setSaving(true);
    setError("");
    if (currentStep === 5 && !parseStorefrontDraft(draftRef.current).ok) {
      const restoredDraft = {
        ...draftRef.current,
        customization: {
          ...draftRef.current.customization,
          socialLinks: props.initialStorefront?.customization.socialLinks ?? [],
        },
      };
      draftRef.current = restoredDraft;
      setDraft(restoredDraft);
      if (draftTimer.current) clearTimeout(draftTimer.current);
    }
    const draftSaved = await saveDraftNow();
    if (!draftSaved) {
      setSaving(false);
      return;
    }
    const skipped = mergeSteps(skippedSteps, [currentStep]);
    const completed = completedSteps.filter((step) => step !== currentStep);
    const saved = await persistProgress(currentStep + 1, completed, skipped);
    setSaving(false);
    if (saved) {
      track("creator_onboarding_step_skipped", {
        step: String(currentStep),
        step_name: stepNames[currentStep - 1],
      });
    }
  }

  async function goBack() {
    if (currentStep <= 1 || saving) return;
    setSaving(true);
    setError("");
    if (!await saveDraftNow()) {
      setSaving(false);
      return;
    }
    await persistProgress(currentStep - 1, completedSteps, skippedSteps);
    setSaving(false);
  }

  function setStorefrontImage(kind: "profile" | "banner", path: string, url: string) {
    applyDraft((current) => ({
      ...current,
      ...(kind === "profile" ? { profileImagePath: path } : { bannerImagePath: path }),
    }));
    if (kind === "profile") setProfileUrl(url);
    else setBannerUrl(url);
  }

  function updateCustomization<K extends keyof StorefrontDraftInput["customization"]>(
    key: K,
    value: StorefrontDraftInput["customization"][K],
  ) {
    applyDraft((current) => ({
      ...current,
      customization: { ...current.customization, [key]: value },
    }));
  }

  function moveSection(section: StorefrontSection, direction: -1 | 1) {
    const order = [...draftRef.current.customization.sectionOrder];
    const index = order.indexOf(section);
    const destination = index + direction;
    if (destination < 0 || destination >= order.length) return;
    [order[index], order[destination]] = [order[destination], order[index]];
    updateCustomization("sectionOrder", order);
  }

  function reorderSections(dragged: StorefrontSection, dropped: StorefrontSection) {
    if (dragged === dropped) return;
    const order = [...draftRef.current.customization.sectionOrder];
    const from = order.indexOf(dragged);
    const to = order.indexOf(dropped);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, ...order.splice(from, 1));
    updateCustomization("sectionOrder", order);
  }

  async function publishStorefront() {
    if (!canPublish || saving) return;
    setSaving(true);
    setError("");
    setFeedback("");
    const savedDraft = await saveDraftNow();
    if (!savedDraft) {
      setSaving(false);
      return;
    }
    track("creator_onboarding_publish_attempted");
    let result;
    try {
      result = await publishStorefrontAction();
    } catch (publishError) {
      console.error("Could not publish the creator storefront from onboarding.", publishError);
      setError("Your storefront could not be published. Please try again.");
      setSaving(false);
      return;
    }
    if (!result.ok) {
      setError(result.message);
      setSaving(false);
      return;
    }
    const url = result.url ?? `https://cloverloop.in/${draftRef.current.username}`;
    setPublishedUrl(url);
    const completed = mergeSteps(completedSteps, [7]);
    try {
      const progressResult = await saveCreatorOnboardingProgressAction({
        currentStep: 7,
        completedSteps: completed,
        skippedSteps,
        version,
        started: true,
        completed: true,
      });
      if (progressResult.ok) {
        setVersion(progressResult.version);
        setCompletedSteps(completed);
      } else {
        console.error("The storefront was published but onboarding completion could not be recorded.", progressResult.message);
        setFeedback("Your storefront is live. Your onboarding record could not be updated, but your storefront is published.");
      }
    } catch (progressError) {
      console.error("The storefront was published but onboarding completion could not be recorded.", progressError);
      setFeedback("Your storefront is live. Your onboarding record could not be updated, but your storefront is published.");
    }
    track("creator_onboarding_storefront_published");
    setSaving(false);
  }

  function trackProductCreated(product: CreatorStorefrontProduct) {
    setProducts((current) => [product, ...current.filter((item) => item.id !== product.id)]);
    if (product.isActive && !product.isFree && product.pricePaise > 0) {
      setHasActivePaidProduct(true);
    }
  }

  function removeProductFromPreview(productId: string) {
    const next = products.filter((product) => product.id !== productId);
    setProducts(next);
    setHasActivePaidProduct(next.some(
      (product) => product.isActive && !product.isFree && product.pricePaise > 0,
    ));
  }

  async function copyPublishedUrl() {
    if (!publishedUrl) return;
    try {
      await navigator.clipboard.writeText(publishedUrl);
      setFeedback("Storefront URL copied.");
      setError("");
    } catch (copyError) {
      console.error("Could not copy the published storefront URL.", copyError);
      setError("The URL could not be copied. Select and copy it manually.");
    }
  }

  const publicUrl = `https://cloverloop.in/${draft.username || "your-store"}`;
  const welcome = welcomeVisible && !publishedUrl;

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header">
        <Link className="onboarding-brand" href="/dashboard" aria-label="CloverLoop dashboard">
          <Store size={23} aria-hidden="true" />
          <span>CloverLoop</span>
        </Link>
        {props.referralError ? (
          <p className="dashboard-message dashboard-message-warning" role="status">
            Your account is ready, but referral attribution could not be saved. Contact CloverLoop support before publishing.
          </p>
        ) : null}
        {!welcome && !publishedUrl ? (
          <button type="button" className="onboarding-later-link" onClick={() => void continueLater()} disabled={saving}>
            Continue later
          </button>
        ) : null}
      </header>

      {publishedUrl ? (
        <section className="onboarding-complete dashboard-card" aria-labelledby="onboarding-complete-title">
          <span className="onboarding-success-icon"><Check size={26} aria-hidden="true" /></span>
          <span className="eyebrow">Storefront published</span>
          <h1 id="onboarding-complete-title">Your storefront is live!</h1>
          <p>Share your new storefront with your audience and start showcasing your work.</p>
          <label className="onboarding-published-url">
            <span>Public storefront URL</span>
            <input readOnly value={publishedUrl} />
          </label>
          <div className="onboarding-complete-actions">
            <button type="button" className="button button-secondary" onClick={() => void copyPublishedUrl()}>Copy URL</button>
            <Link className="button button-secondary" href={publishedUrl} target="_blank" rel="noopener noreferrer">
              Visit storefront <ExternalLink size={16} aria-hidden="true" />
            </Link>
            <Link className="button" href="/dashboard">Go to dashboard <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
          {feedback ? <p className="dashboard-message dashboard-message-success" role="status">{feedback}</p> : null}
          {error ? <p className="dashboard-message dashboard-message-error" role="alert">{error}</p> : null}
        </section>
      ) : welcome ? (
        <section className="onboarding-welcome dashboard-card" aria-labelledby="onboarding-welcome-title">
          <span className="eyebrow">Creator onboarding</span>
          <h1 id="onboarding-welcome-title">Let&apos;s set up your creator storefront</h1>
          <p>
            Create your own page to showcase your work and sell digital products. We&apos;ll guide you through everything you need to get started.
          </p>
          <div className="onboarding-welcome-meta">
            <span>About 5–10 minutes</span>
            <span>Progress saves automatically</span>
          </div>
          <ol className="onboarding-welcome-steps">
            {stepNames.map((name, index) => (
              <li key={name}><span>{index + 1}</span>{name}</li>
            ))}
          </ol>
          <div className="onboarding-welcome-actions">
            <button type="button" className="button" onClick={() => void beginOnboarding()} disabled={saving}>
              {saving ? <LoaderCircle className="spin" size={17} /> : null}
              Set up my storefront <ArrowRight size={17} aria-hidden="true" />
            </button>
            <button type="button" className="onboarding-later-link" onClick={() => void continueLater()} disabled={saving}>
              Continue later
            </button>
          </div>
          {error ? <p className="dashboard-message dashboard-message-error" role="alert">{error}</p> : null}
        </section>
      ) : (
        <>
          <section className="onboarding-progress" aria-label={`Step ${currentStep} of 7`}>
            <div className="onboarding-progress-copy">
              <span>Step {currentStep} of 7</span>
              <span>{completedCount} of 7 completed</span>
            </div>
            <div className="onboarding-progress-track" role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={7} aria-valuenow={completedCount}>
              <span style={{ width: `${(completedCount / 7) * 100}%` }} />
            </div>
            <div className="onboarding-step-name">{stepNames[currentStep - 1]}</div>
          </section>

          <section className="onboarding-card dashboard-card" aria-live="polite">
            {currentStep === 1 ? (
              <div className="onboarding-step">
                <span className="eyebrow">Step 1 · Store identity</span>
                <h1>Give your storefront an identity</h1>
                <p>Choose how visitors will recognise and find your creator page.</p>
                <div className="onboarding-fields">
                  <label className="dashboard-field">
                    <span>Store name <em>Required</em></span>
                    <input
                      autoComplete="organization"
                      maxLength={80}
                      value={draft.storeName}
                      onChange={(event) => {
                        const storeName = event.target.value;
                        applyDraft((current) => ({
                          ...current,
                          storeName,
                          username: !usernameManuallyEdited
                            ? suggestedUsername(storeName, null)
                            : current.username,
                        }));
                      }}
                    />
                  </label>
                  <label className="dashboard-field">
                    <span>Store username <em>Required</em></span>
                    <div className="storefront-url-field">
                      <span>cloverloop.in/</span>
                      <input
                        minLength={3}
                        maxLength={30}
                        pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,28}[A-Za-z0-9]"
                        autoComplete="off"
                        value={draft.username}
                        onChange={(event) => {
                          setUsernameManuallyEdited(true);
                          applyDraft((current) => ({
                            ...current,
                            username: event.target.value.toLowerCase(),
                          }));
                        }}
                        aria-describedby="onboarding-username-help"
                      />
                    </div>
                    <small id="onboarding-username-help">Use 3–30 letters, numbers, hyphens or underscores. We&apos;ll check availability before you continue.</small>
                  </label>
                  <div className="onboarding-identity-preview">
                    {profileUrl ? (
                      <Image src={profileUrl} alt="" width={64} height={64} unoptimized />
                    ) : (
                      <span aria-hidden="true">{(draft.storeName.trim()[0] ?? "C").toUpperCase()}</span>
                    )}
                    <div>
                      <strong>{draft.storeName || "Your store name"}</strong>
                      <span>@{draft.username || "your-store"}</span>
                      <small>{publicUrl}</small>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="onboarding-step">
                <span className="eyebrow">Step 2 · Storefront images</span>
                <h1>Make your storefront recognisable</h1>
                <p>Add a profile picture and a banner to give your storefront a visual identity.</p>
                {!storefrontId ? (
                  <p className="dashboard-message dashboard-message-warning" role="status">
                    Save your store identity first to enable image uploads.
                  </p>
                ) : (
                  <div className="storefront-image-settings onboarding-image-settings">
                    <div>
                      <span className="storefront-field-title">Profile picture <em>Required</em></span>
                      <ImageCropUploader
                        kind="profile"
                        storefrontId={storefrontId}
                        imageUrl={profileUrl}
                        autoSave
                        onUploaded={(path, url) => setStorefrontImage("profile", path, url)}
                        onRemove={() => {
                          setProfileUrl(null);
                          applyDraft((current) => ({ ...current, profileImagePath: null }));
                        }}
                      />
                    </div>
                    <div>
                      <span className="storefront-field-title">Banner image <em>Optional</em></span>
                      <ImageCropUploader
                        kind="banner"
                        storefrontId={storefrontId}
                        imageUrl={bannerUrl}
                        autoSave
                        onUploaded={(path, url) => setStorefrontImage("banner", path, url)}
                        onRemove={() => {
                          setBannerUrl(null);
                          applyDraft((current) => ({ ...current, bannerImagePath: null }));
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="onboarding-step">
                <span className="eyebrow">Step 3 · About you · Optional</span>
                <h1>Tell visitors about yourself</h1>
                <p>Help visitors understand who you are, what you create and why they should follow your work.</p>
                <label className="dashboard-field">
                  <span>About / bio <em>Optional · up to 1,200 characters</em></span>
                  <textarea
                    rows={6}
                    maxLength={1200}
                    placeholder="I’m a music producer creating original compositions, backing tracks and learning resources for independent musicians."
                    value={draft.description}
                    onChange={(event) => applyDraft((current) => ({ ...current, description: event.target.value }))}
                    aria-describedby="onboarding-bio-count"
                  />
                  <small id="onboarding-bio-count">{draft.description.length}/1,200 characters</small>
                </label>
                <div className="onboarding-bio-preview" aria-label="Bio preview">
                  <span>About preview</span>
                  <p>{draft.description || "Your bio will appear here. The example above is only a placeholder and won’t be saved."}</p>
                </div>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="onboarding-step onboarding-product-step">
                <span className="eyebrow">Step 4 · First product</span>
                <h1>Add something to sell</h1>
                <p>Your storefront needs at least one active paid product before it can be published. Create your first digital product here.</p>
                <div className="onboarding-product-requirement" role={hasActivePaidProduct ? "status" : "note"}>
                  {hasActivePaidProduct ? <Check size={18} aria-hidden="true" /> : null}
                  <span>
                    {hasActivePaidProduct
                      ? "You have an active paid product. This publishing requirement is complete."
                      : "An active paid product is required to publish. You can explore the other setup steps first and return here before publishing."}
                  </span>
                </div>
                <ProductManager
                  storefrontId={storefrontId}
                  storefrontUsername={draft.username}
                  storefrontStatus={props.initialStorefront?.status ?? "draft"}
                  initialProducts={products}
                  subcategoryOptions={props.subcategoryOptions}
                  paidProductLimit={props.paidProductLimit}
                  freeProductLimit={props.freeProductLimit}
                  initialPaidListingCount={props.initialPaidListingCount}
                  initialFreeListingCount={props.initialFreeListingCount}
                  onCreateStarted={() => track("creator_onboarding_product_creation_started")}
                  onProductSaved={trackProductCreated}
                  onProductDeleted={removeProductFromPreview}
                  onFirstPaidProductCreated={() => {
                    setHasActivePaidProduct(true);
                    setCompletedSteps((current) => mergeSteps(current, [4]));
                    track("creator_onboarding_first_paid_product_created");
                  }}
                />
              </div>
            ) : null}

            {currentStep === 5 ? (
              <div className="onboarding-step">
                <span className="eyebrow">Step 5 · Social channels · Optional</span>
                <h1>Connect with your audience</h1>
                <p>Let visitors discover more of your work through your social media channels.</p>
                <SocialLinksEditor
                  links={draft.customization.socialLinks}
                  onChange={(socialLinks) => updateCustomization("socialLinks", socialLinks)}
                />
                <div className="onboarding-social-preview">
                  <span>Storefront preview</span>
                  {draft.customization.socialLinks.length ? (
                    <div>
                      {draft.customization.socialLinks.map((link) => (
                        <span className="onboarding-social-preview-link" key={link.id} title={link.label}>
                          {link.platform === "Other"
                            ? link.label.slice(0, 1).toUpperCase()
                            : <SocialPlatformIcon platform={link.platform} />}
                        </span>
                      ))}
                    </div>
                  ) : <p>Add social channels or skip this step for now.</p>}
                </div>
              </div>
            ) : null}

            {currentStep === 6 ? (
              <div className="onboarding-step onboarding-customize-step">
                <span className="eyebrow">Step 6 · Personalise · Optional</span>
                <h1>Make it yours</h1>
                <p>Choose a look for your storefront. CloverLoop’s Minimal theme is ready to use if you want to skip customisation.</p>
                <fieldset className="storefront-theme-picker">
                  <legend>Storefront theme</legend>
                  <div className="storefront-theme-options">
                    {([
                      ["minimal", "Minimal", "Open space, quiet borders and a centered profile."],
                      ["editorial", "Editorial", "A structured, text-led layout with strong typographic hierarchy."],
                      ["bold", "Bold", "A high-contrast creator header and expressive card grid."],
                    ] as const).map(([theme, title, description]) => (
                      <label className={draft.theme === theme ? "selected" : ""} key={theme}>
                        <input
                          type="radio"
                          name="onboarding-storefront-theme"
                          value={theme}
                          checked={draft.theme === theme}
                          onChange={() => applyDraft((current) => ({ ...current, theme }))}
                        />
                        <span className={`storefront-theme-swatch storefront-theme-swatch-${theme}`} aria-hidden="true" />
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="storefront-color-settings">
                  <legend>Store colours</legend>
                  <label>Primary colour<input type="color" value={draft.customization.primaryColor} onChange={(event) => updateCustomization("primaryColor", event.target.value)} /></label>
                  <label>Accent colour<input type="color" value={draft.customization.accentColor} onChange={(event) => updateCustomization("accentColor", event.target.value)} /></label>
                  <label>Background colour<input type="color" value={draft.customization.backgroundColor} onChange={(event) => updateCustomization("backgroundColor", event.target.value)} /></label>
                </fieldset>
                <SectionManager
                  draft={draft}
                  locked={false}
                  onVisibilityChange={(section, visible) => {
                    const hidden = new Set(draftRef.current.customization.hiddenSections);
                    if (visible) hidden.delete(section);
                    else hidden.add(section);
                    updateCustomization("hiddenSections", [...hidden]);
                  }}
                  onMove={moveSection}
                  onDrop={reorderSections}
                  onBannerStyleChange={(style) => updateCustomization("bannerStyle", style)}
                />
                <div className="onboarding-live-preview">
                  <h2>Live preview</h2>
                  <StorefrontPreviewFrame store={previewStore} device="desktop" />
                </div>
              </div>
            ) : null}

            {currentStep === 7 ? (
              <div className="onboarding-step onboarding-review-step">
                <span className="eyebrow">Step 7 · Review and publish</span>
                <h1>Your storefront is ready</h1>
                <p>Review your storefront before making it publicly available.</p>
                <div className="onboarding-review-summary">
                  <div><strong>{draft.storeName || "Your store name"}</strong><span>@{draft.username || "your-store"}</span></div>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer">{publicUrl}<ExternalLink size={15} aria-hidden="true" /></a>
                </div>
                <div className="storefront-preview-controls" role="group" aria-label="Preview device">
                  <button type="button" className={previewDevice === "desktop" ? "selected" : ""} onClick={() => setPreviewDevice("desktop")}>Desktop preview</button>
                  <button type="button" className={previewDevice === "mobile" ? "selected" : ""} onClick={() => setPreviewDevice("mobile")}>Mobile preview</button>
                </div>
                <StorefrontPreviewFrame store={previewStore} device={previewDevice} />
                <div className="onboarding-checklist" aria-labelledby="onboarding-checklist-title">
                  <h2 id="onboarding-checklist-title">Publishing checklist</h2>
                  {requiredChecks.map((item) => (
                    <div className={item.complete ? "complete" : "missing"} key={item.step}>
                      {item.complete ? <Check size={16} aria-hidden="true" /> : <span aria-hidden="true">!</span>}
                      <span>{item.label}</span>
                      {!item.complete ? (
                        <button type="button" onClick={() => void persistProgress(item.step, completedSteps, skippedSteps)}>
                          Go to step {item.step}
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <p>Bio, banner, social links and theme customisation are optional.</p>
                </div>
                <button type="button" className="button onboarding-publish-button" onClick={() => void publishStorefront()} disabled={!canPublish || saving}>
                  {saving ? <LoaderCircle className="spin" size={17} /> : null}
                  Publish my storefront <ArrowRight size={17} aria-hidden="true" />
                </button>
                {!canPublish ? <p className="onboarding-publish-note">Complete the required items above before publishing.</p> : null}
              </div>
            ) : null}

            {error ? <p className="dashboard-message dashboard-message-error" role="alert">{error}</p> : null}
            {feedback ? <p className="dashboard-message dashboard-message-success" role="status">{feedback}</p> : null}
            {currentStep < 7 ? (
              <footer className="onboarding-navigation">
                <button type="button" className="button button-secondary" onClick={() => void goBack()} disabled={currentStep === 1 || saving}>
                  <ArrowLeft size={17} aria-hidden="true" /> Back
                </button>
                <div className="onboarding-save-status" role="status">
                  {draftSaveState === "saving" ? "Saving changes…" : draftSaveState === "error" ? "Changes not saved" : draftSaveState === "unsaved" ? "Saving automatically…" : "All changes saved"}
                </div>
                <div className="onboarding-navigation-actions">
                  {[3, 5, 6].includes(currentStep) ? (
                    <button type="button" className="onboarding-skip-link" onClick={() => void skipOptionalStep()} disabled={saving}>Skip for now</button>
                  ) : null}
                  <button type="button" className="button" onClick={() => void continueStep()} disabled={saving}>
                    {saving ? <LoaderCircle className="spin" size={17} /> : null}
                    {currentStep === 4 && !hasActivePaidProduct ? "Explore other steps" : "Continue"}
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                </div>
              </footer>
            ) : null}
          </section>
        </>
      )}
      <footer className="onboarding-page-footer">CloverLoop · Your creator storefront, your way.</footer>
    </main>
  );
}
