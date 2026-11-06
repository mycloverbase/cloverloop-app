import { PRODUCTION_URL } from "@/lib/site";

const checklistPdfUrl = `${PRODUCTION_URL}/downloads/cloverloop-link-in-bio-launch-checklist.pdf`;
const unsubscribeUrl = "mailto:info@cloverloop.in?subject=Unsubscribe";

const emailHtml = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Your link-in-bio store launch checklist</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0;mso-table-rspace:0}
  img{border:0;-ms-interpolation-mode:bicubic;display:block}
  a{color:#1B4332}
  @media only screen and (max-width:620px){
    .wrap{width:100%!important}
    .pad{padding-left:22px!important;padding-right:22px!important}
    h1{font-size:26px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#F3F1E4;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F3F1E4;">One page, six steps. It’s attached to this email.&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3F1E4" style="background-color:#F3F1E4;">
<tr><td align="center" style="padding:28px 12px 36px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

<tr><td class="pad" style="padding:0 4px 22px;">
<a href="https://cloverloop.in" style="text-decoration:none;"><img src="{{logo_url}}" alt="CloverLoop" width="160" style="width:160px;height:auto;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#1B4332;"></a>
</td></tr>

<tr><td bgcolor="#FBFAF5" style="background-color:#FBFAF5;border:1px solid #D3DBC8;border-top:4px solid #A8C5A0;border-radius:14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="pad" style="padding:32px 36px 8px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14382B;">
<h1 style="margin:0 0 16px;font-size:30px;line-height:1.15;font-weight:600;letter-spacing:-0.02em;color:#14382B;">Your launch checklist is attached</h1>
<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#14382B;">Hi there,</p>
<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#14382B;">Thanks for asking for the link-in-bio store launch checklist. You’ll find it attached to this email as a one-page PDF.</p>
<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#14382B;">Print it, or keep it open on your phone and tick items off as you go.</p>
</td></tr>

<tr><td class="pad" style="padding:18px 36px 4px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#4F6157;">
Can’t see the attachment? <a href="{{checklist_pdf_url}}" style="color:#1B4332;font-weight:600;">Download the checklist</a>.
</td></tr>

<tr><td class="pad" style="padding:22px 36px 6px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="#1B4332" style="background-color:#1B4332;border-radius:10px;mso-padding-alt:14px 26px;">
<a href="https://cloverloop.in" style="display:inline-block;padding:14px 26px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:1;color:#F3F1E4;text-decoration:none;">Explore CloverLoop</a>
</td></tr></table>
</td></tr>

<tr><td class="pad" style="padding:20px 36px 34px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#14382B;">
<p style="margin:0 0 14px;">CloverLoop helps creators sell digital products such as ebooks, PDFs, guides, templates and audio files.</p>
<p style="margin:0;">Questions? Reply to this email.<br>The CloverLoop team</p>
</td></tr>
</table>
</td></tr>

<tr><td class="pad" align="center" style="padding:22px 24px 0;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#4F6157;">
You’re receiving this email because you asked for the free launch checklist on <a href="https://cloverloop.in" style="color:#4F6157;">cloverloop.in</a>.<br>
If you also chose to get product and creator updates, you can <a href="{{unsubscribe_url}}" style="color:#4F6157;">unsubscribe</a> at any time.<br>
CloverLoop, info@cloverloop.in
</td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

export function getLaunchChecklistEmailHtml() {
  return emailHtml
    .replaceAll("{{logo_url}}", `${PRODUCTION_URL}/images/brand/logo.png`)
    .replaceAll("{{checklist_pdf_url}}", checklistPdfUrl)
    .replaceAll("{{unsubscribe_url}}", unsubscribeUrl);
}

export const launchChecklistEmailText = `Hi there,

Thanks for asking for the link-in-bio store launch checklist. You’ll find it attached to this email as a one-page PDF.

Print it, or keep it open on your phone and tick items off as you go.

Can’t see the attachment? Download the checklist: ${checklistPdfUrl}

Explore CloverLoop: https://cloverloop.in

Questions? Reply to this email.
The CloverLoop team

If you also chose to get product and creator updates, email info@cloverloop.in with the subject “Unsubscribe” to opt out.`;
