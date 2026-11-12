"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, LoaderCircle, MessageCircle, Pause, Play, Plus, Trash2 } from "lucide-react";

type Connection = {
  id: string;
  instagram_user_id: string;
  instagram_username: string;
  token_expires_at: string;
  granted_scopes: string[];
  connection_status: "connected" | "reauthorization_required" | "disconnected";
  connected_at: string;
};

type Media = {
  id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type: string;
  permalink: string;
  caption?: string;
  timestamp: string;
};

type ProductLink = { id: string; name: string; url: string };
type Automation = {
  id: string;
  instagram_connection_id: string;
  instagram_username: string;
  connection_status: string;
  name: string;
  media_id: string;
  media_type: Media["media_type"];
  media_permalink: string;
  media_caption: string;
  trigger_keywords: string[];
  match_type: "whole_word" | "exact_comment";
  reply_message: string;
  target_product_id: string | null;
  status: "active" | "paused";
  total_comments_received: number;
  total_comments_matched: number;
  total_messages_sent: number;
  total_messages_failed: number;
  recentFailures: Array<{ code: string | null; message: string | null; createdAt: string }>;
};

type ApiResult<T> = T & { error?: string };
type AutomationForm = {
  name: string;
  mediaId: string;
  keywords: string;
  matchType: "whole_word" | "exact_comment";
  replyMessage: string;
  targetProductId: string;
};

const resultMessages: Record<string, string> = {
  connected: "Instagram is connected and comment notifications are enabled.",
  cancelled: "Instagram authorization was cancelled.",
  "setup-error": "Instagram connection setup is incomplete. Contact your administrator.",
  "state-error": "The Instagram sign-in expired or could not be verified. Please try again.",
  "permission-error": "Instagram did not grant all permissions required for comment replies.",
  "professional-account-required": "Connect an Instagram Business or Creator account.",
  "account-in-use": "This Instagram account is already connected to another CloverLoop creator.",
  "webhook-subscription-error": "The account was connected, but Instagram comment notifications could not be enabled. Check Meta permissions and reconnect.",
  "connection-error": "Instagram could not complete the connection. Please try again.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload)) {
    const message = isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : "Instagram automations could not be updated.";
    throw new Error(message);
  }
  return payload as ApiResult<T>;
}

function emptyForm(): AutomationForm {
  return {
    name: "",
    mediaId: "",
    keywords: "",
    matchType: "whole_word" as const,
    replyMessage: "",
    targetProductId: "",
  };
}

function productOrStorefrontLink(targetProductId: string | null, products: ProductLink[], storefrontUrl: string | null) {
  return targetProductId
    ? products.find((product) => product.id === targetProductId)?.url ?? null
    : storefrontUrl;
}

export function InstagramAutomations({ oauthResult }: { oauthResult: string | null }) {
  const [configured, setConfigured] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [products, setProducts] = useState<ProductLink[]>([]);
  const [storefrontUrl, setStorefrontUrl] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(oauthResult ? resultMessages[oauthResult] ?? "" : "");
  const [error, setError] = useState("");

  const selectedMedia = useMemo(() => media.find((item) => item.id === form.mediaId), [form.mediaId, media]);
  const selectedLink = useMemo(
    () => productOrStorefrontLink(form.targetProductId || null, products, storefrontUrl),
    [form.targetProductId, products, storefrontUrl],
  );

  const loadPage = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError("");
    try {
      const [connectionData, automationData] = await Promise.all([
        requestJson<{ configured: boolean; connections: Connection[] }>("/api/instagram/connections"),
        requestJson<{ automations: Automation[] }>("/api/instagram/automations"),
      ]);
      setConfigured(connectionData.configured);
      setConnections(connectionData.connections);
      setAutomations(automationData.automations);
      const firstConnected = connectionData.connections.find((item) => item.connection_status === "connected");
      setMediaLoading(Boolean(firstConnected));
      if (!connectionData.connections.some((item) => item.connection_status === "connected")) {
        setMedia([]);
        setProducts([]);
        setStorefrontUrl(null);
      }
      setConnectionId((current) =>
        connectionData.connections.some((item) => item.id === current && item.connection_status === "connected")
          ? current
          : firstConnected?.id ?? "",
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Instagram automations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      requestJson<{ configured: boolean; connections: Connection[] }>("/api/instagram/connections"),
      requestJson<{ automations: Automation[] }>("/api/instagram/automations"),
    ]).then(([connectionData, automationData]) => {
      if (!active) return;
      setConfigured(connectionData.configured);
      setConnections(connectionData.connections);
      setAutomations(automationData.automations);
      const firstConnected = connectionData.connections.find((item) => item.connection_status === "connected");
      setConnectionId((current) =>
        connectionData.connections.some((item) => item.id === current && item.connection_status === "connected")
          ? current
          : firstConnected?.id ?? "",
      );
      setMediaLoading(Boolean(firstConnected));
      if (!firstConnected) {
        setMedia([]);
        setProducts([]);
        setStorefrontUrl(null);
      }
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Instagram automations could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!connectionId) return;
    let active = true;
    void requestJson<{
      media: Media[];
      products: ProductLink[];
      storefrontUrl: string | null;
    }>(`/api/instagram/media?connectionId=${encodeURIComponent(connectionId)}`)
      .then((data) => {
        if (!active) return;
        setMedia(data.media);
        setProducts(data.products);
        setStorefrontUrl(data.storefrontUrl);
      })
      .catch((mediaError: unknown) => {
        if (!active) return;
        setMedia([]);
        setProducts([]);
        setStorefrontUrl(null);
        setError(mediaError instanceof Error ? mediaError.message : "Instagram posts could not be loaded.");
        void loadPage();
      })
      .finally(() => {
        if (active) setMediaLoading(false);
      });
    return () => { active = false; };
  }, [connectionId, loadPage]);

  async function disconnect(connection: Connection) {
    if (!window.confirm(`Disconnect @${connection.instagram_username}? Its active automations will be paused.`)) return;
    setError("");
    try {
      const result = await requestJson<{ disconnected: boolean; warning: string | null }>("/api/instagram/connections", {
        method: "DELETE",
        body: JSON.stringify({ connectionId: connection.id }),
      });
      if (result.warning) setError(result.warning);
      else setMessage(`@${connection.instagram_username} was disconnected.`);
      await loadPage();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Instagram could not be disconnected.");
    }
  }

  function beginEdit(automation: Automation) {
    setEditingId(automation.id);
    if (connectionId !== automation.instagram_connection_id) {
      setMediaLoading(true);
      setMedia([]);
      setProducts([]);
      setStorefrontUrl(null);
    }
    setConnectionId(automation.instagram_connection_id);
    setForm({
      name: automation.name,
      mediaId: automation.media_id,
      keywords: automation.trigger_keywords.join(", "),
      matchType: automation.match_type,
      replyMessage: automation.reply_message,
      targetProductId: automation.target_product_id ?? "",
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
  }

  async function saveAutomation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chosenMedia = media.find((item) => item.id === form.mediaId);
    if (!chosenMedia) {
      setError("Select an eligible Instagram post or Reel.");
      return;
    }
    const keywords = form.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        connectionId,
        name: form.name,
        mediaId: chosenMedia.id,
        mediaType: chosenMedia.media_type,
        mediaPermalink: chosenMedia.permalink,
        mediaCaption: chosenMedia.caption ?? "",
        keywords,
        matchType: form.matchType,
        replyMessage: form.replyMessage,
        targetProductId: form.targetProductId || null,
        status: "active",
      };
      await requestJson(
        editingId ? `/api/instagram/automations/${encodeURIComponent(editingId)}` : "/api/instagram/automations",
        { method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setMessage(editingId ? "Automation updated." : "Automation created and activated.");
      resetForm();
      await loadPage();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Instagram automation could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(automation: Automation) {
    setError("");
    try {
      await requestJson(`/api/instagram/automations/${encodeURIComponent(automation.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          connectionId: automation.instagram_connection_id,
          name: automation.name,
          mediaId: automation.media_id,
          mediaType: automation.media_type,
          mediaPermalink: automation.media_permalink,
          mediaCaption: automation.media_caption,
          keywords: automation.trigger_keywords,
          matchType: automation.match_type,
          replyMessage: automation.reply_message,
          targetProductId: automation.target_product_id,
          status: automation.status === "active" ? "paused" : "active",
        }),
      });
      setMessage(automation.status === "active" ? "Automation paused." : "Automation activated.");
      await loadPage();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Automation status could not be changed.");
    }
  }

  async function deleteAutomation(automation: Automation) {
    if (!window.confirm(`Delete “${automation.name}”? This cannot be undone.`)) return;
    setError("");
    try {
      await requestJson(`/api/instagram/automations/${encodeURIComponent(automation.id)}`, { method: "DELETE" });
      setMessage("Automation deleted.");
      if (editingId === automation.id) resetForm();
      await loadPage();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Automation could not be deleted.");
    }
  }

  const activeConnections = connections.filter((item) => item.connection_status === "connected");
  return (
    <div className="dashboard-page-content instagram-automation-page">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Marketing</span>
          <h1>Instagram Automations</h1>
          <p>Send one permitted private reply when someone comments a matching keyword on your post or Reel.</p>
        </div>
      </header>

      {message ? <p className="dashboard-message dashboard-message-success" role="status">{message}</p> : null}
      {error ? <p className="dashboard-message dashboard-message-warning" role="alert">{error}</p> : null}

      <section className="instagram-connection-card" aria-labelledby="instagram-connection-title">
        <div className="instagram-section-heading">
          <div>
            <h2 id="instagram-connection-title"><MessageCircle size={20} /> Instagram account</h2>
            <p>Connect an Instagram Business or Creator account using Meta’s official sign-in.</p>
          </div>
          {configured ? (
            <form action="/api/instagram/connect">
              <button className="button" type="submit"><MessageCircle size={17} /> Connect Instagram</button>
            </form>
          ) : (
            <span className="instagram-status-pill paused">Setup required</span>
          )}
        </div>
        {!configured ? (
          <p className="instagram-help-text">Meta app credentials and token encryption are not configured. Connection is unavailable until setup is complete.</p>
        ) : null}
        {loading ? <p className="instagram-help-text"><LoaderCircle className="instagram-spin" size={16} /> Loading account status…</p> : null}
        {connections.map((connection) => (
          <div className="instagram-connected-account" key={connection.id}>
            <div>
              <strong>@{connection.instagram_username}</strong>
              <span>Account ID {connection.instagram_user_id}</span>
              <span className={`instagram-status-pill ${connection.connection_status === "connected" ? "active" : "paused"}`}>
                {connection.connection_status === "connected" ? "Connected" : "Reconnect required"}
              </span>
            </div>
            <div className="instagram-account-actions">
              {connection.connection_status !== "connected" ? (
                <form action="/api/instagram/connect">
                  <button className="subtle-link-button" type="submit">Reconnect <ArrowRight size={15} /></button>
                </form>
              ) : null}
              <button className="subtle-link-button" type="button" onClick={() => void disconnect(connection)}>Disconnect</button>
            </div>
          </div>
        ))}
        {!loading && connections.length === 0 ? <p className="instagram-empty-state">No Instagram account connected yet.</p> : null}
      </section>

      {activeConnections.length ? (
        <section className="instagram-automation-builder" aria-labelledby="instagram-builder-title">
          <div className="instagram-section-heading">
            <div>
              <h2 id="instagram-builder-title">{editingId ? "Edit automation" : "Create an automation"}</h2>
              <p>Choose the post, keyword and CloverLoop link for the private reply.</p>
            </div>
          </div>
          <form onSubmit={saveAutomation}>
            <div className="instagram-form-grid">
              <label>
                Instagram account
                <select value={connectionId} onChange={(event) => {
                  setMediaLoading(true);
                  setMedia([]);
                  setProducts([]);
                  setStorefrontUrl(null);
                  setConnectionId(event.target.value);
                  setForm((current) => ({ ...current, mediaId: "" }));
                }} required>
                  {activeConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>@{connection.instagram_username}</option>
                  ))}
                </select>
              </label>
              <label>
                Automation name
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={80} required />
              </label>
              <label className="instagram-form-wide">
                Instagram post or Reel
                <select value={form.mediaId} onChange={(event) => setForm((current) => ({ ...current, mediaId: event.target.value }))} required disabled={mediaLoading || !media.length}>
                  <option value="">{mediaLoading ? "Loading your posts…" : media.length ? "Select an eligible post or Reel" : "No eligible posts available"}</option>
                  {media.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.media_product_type === "REELS" ? "Reel" : item.media_type} · {new Date(item.timestamp).toLocaleDateString()} · {(item.caption || item.media_type).slice(0, 65)}
                    </option>
                  ))}
                </select>
                {selectedMedia ? <a className="subtle-link" href={selectedMedia.permalink} target="_blank" rel="noreferrer">Preview selected post <ArrowRight size={14} /></a> : null}
              </label>
              <label className="instagram-form-wide">
                Trigger keywords
                <input value={form.keywords} onChange={(event) => setForm((current) => ({ ...current, keywords: event.target.value }))} placeholder="GUIDE, WORKSHEET" required />
                <span>Use commas between up to 10 keywords. Matching ignores case, surrounding spaces and matches inside larger words.</span>
              </label>
              <label>
                Match rule
                <select value={form.matchType} onChange={(event) => setForm((current) => ({ ...current, matchType: event.target.value as "whole_word" | "exact_comment" }))}>
                  <option value="whole_word">Keyword appears as a whole word (recommended)</option>
                  <option value="exact_comment">Comment exactly equals a keyword</option>
                </select>
              </label>
              <label>
                Link to include
                <select value={form.targetProductId} onChange={(event) => setForm((current) => ({ ...current, targetProductId: event.target.value }))}>
                  <option value="">My storefront</option>
                  {products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}
                </select>
                {!storefrontUrl ? <span>Publish your storefront to enable a link.</span> : null}
              </label>
              <label className="instagram-form-wide">
                Private reply
                <textarea value={form.replyMessage} onChange={(event) => setForm((current) => ({ ...current, replyMessage: event.target.value }))} maxLength={900} rows={4} required placeholder="Thanks for your interest! Here's the guide you asked for:" />
                <span>The chosen CloverLoop URL is appended automatically. Up to 1,000 characters total. No follow-up DMs are sent.</span>
              </label>
            </div>
            <div className="instagram-reply-preview">
              <strong>Message preview</strong>
              <p>{form.replyMessage.trim() || "Your message will appear here."}</p>
              {selectedLink ? <a href={selectedLink} target="_blank" rel="noreferrer">{selectedLink}</a> : <span>Publish your storefront to add a link.</span>}
            </div>
            <div className="instagram-form-actions">
              <button className="button" type="submit" disabled={saving || mediaLoading || !storefrontUrl}>
                {saving ? <LoaderCircle className="instagram-spin" size={16} /> : <Plus size={16} />}
                {saving ? "Saving…" : editingId ? "Save changes" : "Save and activate"}
              </button>
              {editingId ? <button className="subtle-link-button" type="button" onClick={resetForm}>Cancel editing</button> : null}
            </div>
          </form>
          <p className="instagram-conflict-note">If several active automations match one comment, only the oldest automation sends a reply. Identical active keywords for the same post are blocked.</p>
        </section>
      ) : null}

      <section className="instagram-automation-list" aria-labelledby="instagram-automation-list-title">
        <div className="instagram-section-heading">
          <div>
            <h2 id="instagram-automation-list-title">Your automations</h2>
            <p>Delivery counts increase only after Instagram confirms the private reply.</p>
          </div>
        </div>
        {automations.length === 0 && !loading ? (
          <p className="instagram-empty-state">No automations yet. Connect an account and create your first one.</p>
        ) : null}
        {automations.map((automation) => (
          <article className="instagram-automation-row" key={automation.id}>
            <div className="instagram-automation-row-main">
              <div className="instagram-automation-title">
                <h3>{automation.name}</h3>
                <span className={`instagram-status-pill ${automation.status === "active" ? "active" : "paused"}`}>
                  {automation.status === "active" ? "Active" : "Paused"}
                </span>
                {automation.connection_status !== "connected" ? <span className="instagram-status-pill paused">Reconnect account</span> : null}
              </div>
              <p>@{automation.instagram_username} · {automation.media_type === "VIDEO" ? "Video / Reel" : automation.media_type}</p>
              <p>Keywords: <strong>{automation.trigger_keywords.join(", ")}</strong></p>
              <a className="subtle-link" href={automation.media_permalink} target="_blank" rel="noreferrer">View Instagram post <ArrowRight size={14} /></a>
            </div>
            <div className="instagram-automation-stats" aria-label="Automation performance">
              <span><strong>{automation.total_comments_received}</strong> received</span>
              <span><strong>{automation.total_comments_matched}</strong> matched</span>
              <span><strong>{automation.total_messages_sent}</strong> replies sent</span>
              <span><strong>{automation.total_messages_failed}</strong> failed</span>
            </div>
            <div className="instagram-automation-actions">
              <button type="button" className="subtle-link-button" onClick={() => void changeStatus(automation)} disabled={automation.connection_status !== "connected"}>
                {automation.status === "active" ? <Pause size={15} /> : <Play size={15} />}
                {automation.status === "active" ? "Pause" : "Activate"}
              </button>
              <button type="button" className="subtle-link-button" onClick={() => beginEdit(automation)}>Edit</button>
              <button type="button" className="subtle-link-button danger" onClick={() => void deleteAutomation(automation)}><Trash2 size={15} /> Delete</button>
            </div>
            {automation.recentFailures.length ? (
              <div className="instagram-automation-failures">
                <strong>Recent delivery issues</strong>
                {automation.recentFailures.map((failure, index) => (
                  <p key={`${failure.createdAt}-${index}`}>{failure.message ?? failure.code ?? "Private reply failed"}</p>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
      <p className="instagram-policy-note">
        One private reply per comment, sent only within seven days. Instagram Live comments are not automated.
        A private reply does not authorize follow-up messages. Development/testing is limited to Meta app-role accounts until the app has production approval.
      </p>
    </div>
  );
}
