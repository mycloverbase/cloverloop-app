(() => {
  const bootstrap = document.currentScript;
  if (!(bootstrap instanceof HTMLScriptElement)) {
    console.error("Google Tag Manager bootstrap script could not read its configuration.");
    return;
  }

  const { gtmId, consentKey } = bootstrap.dataset;
  if (!gtmId || !consentKey) {
    console.error("Google Tag Manager bootstrap script is missing its configuration.");
    return;
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500,
  });

  try {
    if (window.localStorage.getItem(consentKey) === "accepted") {
      gtag("consent", "update", { analytics_storage: "granted" });
    }
  } catch (error) {
    console.warn("Unable to read analytics consent preference.", error);
  }

  window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  document.head.appendChild(script);
})();
