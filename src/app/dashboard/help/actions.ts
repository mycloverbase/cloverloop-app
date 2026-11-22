"use server";

import { revalidatePath } from "next/cache";
import { creatorAgreementIsAccepted } from "@/lib/account/creator-agreement-consent";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CREATOR_SUPPORT_CATEGORIES,
  isCreatorSupportAttachmentPath,
  parseCreatorSupportSubmission,
} from "@/lib/creator-support";

export type CreatorSupportActionResult =
  | { ok: true; reference: string; notificationWarning?: string }
  | { ok: false; message: string };

async function getCreatorSupportUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false as const, message: "Support services are not configured." };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (error) console.error("Could not verify a creator support request.", error);
    return { ok: false as const, message: "Please sign in again before submitting a support request." };
  }
  if (!(await creatorAgreementIsAccepted(supabase))) {
    return { ok: false as const, message: "Accept the Creator Agreement before contacting support." };
  }
  return { ok: true as const, supabase, user };
}

export async function createCreatorSupportRequestAction(
  input: unknown,
): Promise<CreatorSupportActionResult> {
  const auth = await getCreatorSupportUser();
  if (!auth.ok) return auth;

  const parsed = parseCreatorSupportSubmission(input, auth.user.id);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  if (parsed.value.attachmentPaths.length) {
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return { ok: false, message: "Private screenshot storage is not configured. Please try again later." };
    }
    for (const path of parsed.value.attachmentPaths) {
      const fileName = path.split("/").pop();
      const { data: files, error } = await admin.storage
        .from("support-attachments")
        .list(auth.user.id, { limit: 10, search: fileName });
      if (error) {
        console.error("Could not verify a creator support attachment.", { code: error.name });
        return { ok: false, message: "A screenshot could not be verified. Please remove it and upload it again." };
      }
      if (!files?.some((file) => file.name === fileName)) {
        return { ok: false, message: "A screenshot could not be found. Please remove it and upload it again." };
      }
    }
  }

  const category = CREATOR_SUPPORT_CATEGORIES.find((item) => item.id === parsed.value.category);
  if (!category) {
    return { ok: false, message: "Choose an issue category before submitting." };
  }
  const { data: requestReference, error: insertError } = await auth.supabase.rpc(
    "create_my_creator_support_request",
    {
      requested_category: parsed.value.category,
      requested_answers: parsed.value.answers,
      requested_additional_information: parsed.value.additionalInformation,
      requested_attachment_paths: parsed.value.attachmentPaths,
    },
  );
  if (insertError || typeof requestReference !== "string" || !/^CL-[A-F0-9]{16}$/.test(requestReference)) {
    if (insertError) console.error("Could not save a creator support request.", { code: insertError.code });
    return { ok: false, message: "Your support request could not be saved. Please try again." };
  }

  let notificationWarning: string | undefined;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "info@cloverloop.in";
  if (!apiKey || !from) {
    console.error("Support request email delivery is not configured.", {
      apiKeyConfigured: Boolean(apiKey),
      senderConfigured: Boolean(from),
    });
    notificationWarning = "Your request was saved, but the support team could not be notified by email. Please email info@cloverloop.in and include your reference.";
  } else {
    const answersText = parsed.value.answers
      .map((answer) => `${answer.question}\n${answer.answer}`)
      .join("\n\n");
    const attachmentText = parsed.value.attachmentPaths.length
      ? `Private screenshot references:\n${parsed.value.attachmentPaths.join("\n")}`
      : "No screenshots attached.";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [supportEmail],
          ...(auth.user.email ? { reply_to: auth.user.email } : {}),
          subject: `Support request ${requestReference}: ${category.title}`,
          text: [
            `Reference: ${requestReference}`,
            `Category: ${category.title}`,
            `Creator account: ${auth.user.email ?? "Email unavailable"}`,
            "",
            answersText,
            "",
            parsed.value.additionalInformation
              ? `Additional information:\n${parsed.value.additionalInformation}`
              : "No additional information.",
            "",
            attachmentText,
          ].join("\n"),
        }),
      });
      if (!response.ok) {
        console.error("The email provider rejected a creator support notification.", { status: response.status });
        notificationWarning = "Your request was saved, but the support team could not be notified by email. Please email info@cloverloop.in and include your reference.";
      }
    } catch (emailError) {
      console.error("Could not send a creator support notification.", emailError);
      notificationWarning = "Your request was saved, but the support team could not be notified by email. Please email info@cloverloop.in and include your reference.";
    }
  }

  revalidatePath("/dashboard/help");
  return {
    ok: true,
    reference: requestReference,
    ...(notificationWarning ? { notificationWarning } : {}),
  };
}

export async function deleteCreatorSupportAttachmentAction(
  path: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = await getCreatorSupportUser();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!isCreatorSupportAttachmentPath(path, auth.user.id)) {
    return { ok: false, message: "This screenshot could not be verified." };
  }

  const { data: attachedRequests, error: requestError } = await auth.supabase
    .from("creator_support_requests")
    .select("id")
    .eq("user_id", auth.user.id)
    .contains("attachment_paths", [path])
    .limit(1);
  if (requestError) {
    console.error("Could not check whether a support screenshot is already attached to a request.", {
      code: requestError.code,
    });
    return { ok: false, message: "The screenshot could not be removed right now. Please try again." };
  }
  if (attachedRequests?.length) {
    return { ok: false, message: "This screenshot is already attached to a submitted request." };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Private screenshot storage is not configured." };
  const { error } = await admin.storage.from("support-attachments").remove([path]);
  if (error) {
    console.error("Could not remove a creator support screenshot.", { code: error.name });
    return { ok: false, message: "The screenshot could not be removed. Please try again." };
  }
  return { ok: true };
}
