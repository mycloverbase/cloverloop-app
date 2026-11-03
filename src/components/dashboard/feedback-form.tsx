"use client";

import { useState, useTransition, type FormEvent } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { submitCreatorFeedbackAction } from "@/app/dashboard/actions";

export function FeedbackForm() {
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setError("");
    const data = new FormData();
    data.set("category", category);
    data.set("message", message);
    startTransition(async () => {
      try {
        const result = await submitCreatorFeedbackAction(data);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setFeedback(result.message);
        setMessage("");
      } catch (submitError) {
        console.error("Could not submit creator feedback.", submitError);
        setError("Your feedback could not be submitted. Check your connection and try again.");
      }
    });
  }

  return (
    <form id="feedback" className="dashboard-card dashboard-form-card" onSubmit={submit}>
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-card-label">Your voice matters</span>
          <h2>Send feedback</h2>
        </div>
      </div>
      <label className="dashboard-field dashboard-field-narrow">
        <span>Topic</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="general">General</option>
          <option value="account">Account</option>
          <option value="product">Product</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label className="dashboard-field">
        <span>Feedback</span>
        <textarea
          rows={5}
          minLength={10}
          maxLength={2000}
          required
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Tell us what you think or how we can improve."
        />
        <small>{message.length}/2,000 characters</small>
      </label>
      {error && <p className="dashboard-message dashboard-message-error" role="alert">{error}</p>}
      {feedback && <p className="dashboard-message dashboard-message-success" role="status">{feedback}</p>}
      <div className="dashboard-form-actions">
        <span>Please do not include passwords or private payment information.</span>
        <button type="submit" className="button" disabled={isPending || message.trim().length < 10}>
          {isPending ? <LoaderCircle className="spin" size={17} /> : <Send size={16} aria-hidden="true" />}
          Send feedback
        </button>
      </div>
    </form>
  );
}
