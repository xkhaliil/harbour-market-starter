import { describe, getJSON, postJSON, request } from "./api.js";
import { state } from "./state.js";
import { render } from "./render.js";

const OWNED_REVIEWS_KEY = "harbour-market-owned-reviews";

function readOwnedReviewIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(OWNED_REVIEWS_KEY) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function setupReviews() {
  const list = document.querySelector(".vendor-list");
  const dialog = document.querySelector(".reviews-dialog");
  const stallName = document.querySelector("#reviews-stall");
  const status = document.querySelector(".reviews-status");
  const errorMessage = document.querySelector(".reviews-error");
  const retryButton = document.querySelector(".reviews-retry");
  const reviewList = document.querySelector(".review-list");
  const form = document.querySelector(".review-form");
  const fields = form.querySelector(".review-fields");
  const formMessage = document.querySelector(".review-form-error");
  const submitButton = document.querySelector(".review-submit");
  const ownedReviewIds = readOwnedReviewIds();
  const deletingIds = new Set();
  const ratingRefreshVersions = new Map();
  let activeStall = null;
  let reviews = [];
  let loadState = "idle";
  let loadError = null;
  let actionError = "";
  let requestVersion = 0;
  let posting = false;

  function persistOwnedReviewIds() {
    try {
      localStorage.setItem(OWNED_REVIEWS_KEY, JSON.stringify([...ownedReviewIds]));
    } catch (error) {
      console.error(error);
    }
  }

  function clearFieldError(name) {
    const input = form.elements.namedItem(name);
    const message = document.querySelector(`#review-${name}-error`);
    if (!input || !message) return;
    input.removeAttribute("aria-invalid");
    message.textContent = "";
    message.hidden = true;
  }

  function clearFieldErrors() {
    for (const name of ["author", "rating", "text"]) clearFieldError(name);
  }

  async function updateStallRating(stallId, currentReviews) {
    const stall = state.stalls.find((item) => item.id === stallId);
    if (!stall) return;
    stall.reviewCount = currentReviews.length;
    stall.rating = currentReviews.length
      ? Math.round(currentReviews.reduce((sum, review) => sum + review.rating, 0) / currentReviews.length * 10) / 10
      : null;
    const version = (ratingRefreshVersions.get(stallId) ?? 0) + 1;
    ratingRefreshVersions.set(stallId, version);
    render();

    try {
      const refreshedStall = await getJSON(`/stalls/${encodeURIComponent(stallId)}`);
      if (ratingRefreshVersions.get(stallId) !== version) return;
      const currentStall = state.stalls.find((item) => item.id === stallId);
      if (!currentStall) return;
      currentStall.rating = refreshedStall.rating;
      currentStall.reviewCount = refreshedStall.reviewCount;
      render();
    } catch {
      // The review list already provides a usable fallback when chaos fails this refresh.
    }
  }

  function createReviewItem(review) {
    const item = document.createElement("li");
    item.className = "review-item";

    const meta = document.createElement("div");
    meta.className = "review-meta";
    const author = document.createElement("strong");
    author.textContent = review.author;
    const rating = document.createElement("span");
    rating.className = "review-rating";
    rating.textContent = `★ ${review.rating}`;
    const time = document.createElement("time");
    time.dateTime = review.createdAt;
    const date = new Date(review.createdAt);
    time.textContent = Number.isNaN(date.valueOf()) ? "" : date.toLocaleString();
    meta.append(author, rating, time);

    const text = document.createElement("p");
    text.className = "review-text";
    text.textContent = review.text;
    item.append(meta, text);

    if (ownedReviewIds.has(review.id)) {
      const remove = document.createElement("button");
      remove.className = "review-delete";
      remove.type = "button";
      remove.dataset.reviewId = review.id;
      remove.setAttribute("aria-label", `Delete your review by ${review.author}`);
      remove.disabled = deletingIds.size > 0;
      remove.textContent = deletingIds.has(review.id) ? "Deleting…" : "Delete review";
      item.append(remove);
    }
    return item;
  }

  function renderDialog() {
    stallName.textContent = activeStall?.name ?? "";
    status.textContent = loadState === "loading"
      ? "Loading reviews…"
      : loadState === "ready"
        ? `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}`
        : "";
    errorMessage.textContent = loadError
      ? `Could not load reviews: ${describe(loadError)}.`
      : actionError;
    errorMessage.hidden = !loadError && !actionError;
    retryButton.hidden = loadState !== "error";
    reviewList.setAttribute("aria-busy", String(loadState === "loading"));
    reviewList.replaceChildren();

    if (loadState === "loading") {
      const loading = document.createElement("li");
      loading.className = "review-empty";
      loading.textContent = "Loading reviews…";
      reviewList.append(loading);
    } else if (loadState === "ready" && reviews.length === 0) {
      const empty = document.createElement("li");
      empty.className = "review-empty";
      empty.textContent = "No reviews yet: be the first.";
      reviewList.append(empty);
    } else if (loadState === "ready") {
      reviewList.append(...reviews.map(createReviewItem));
    }

    fields.disabled = posting || loadState !== "ready";
    submitButton.disabled = posting || loadState !== "ready";
  }

  async function loadReviews(stall) {
    const version = ++requestVersion;
    activeStall = stall;
    loadState = "loading";
    loadError = null;
    actionError = "";
    reviews = [];
    renderDialog();

    try {
      const result = await getJSON(`/stalls/${encodeURIComponent(stall.id)}/reviews`);
      if (version !== requestVersion || activeStall?.id !== stall.id) return;
      reviews = result;
      loadState = "ready";
    } catch (error) {
      if (version !== requestVersion || activeStall?.id !== stall.id) return;
      loadError = error;
      loadState = "error";
    }
    renderDialog();
  }

  list.addEventListener("click", (event) => {
    const button = event.target.closest(".reviews-open");
    if (!button) return;
    const stallId = button.closest(".stall").dataset.id;
    const stall = state.stalls.find((item) => item.id === stallId);
    if (!stall) return;
    if (!dialog.open) dialog.showModal();
    loadReviews(stall);
  });

  document.querySelector(".reviews-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    requestVersion += 1;
    activeStall = null;
    loadState = "idle";
  });
  retryButton.addEventListener("click", () => {
    if (activeStall) loadReviews(activeStall);
  });

  form.addEventListener("input", (event) => clearFieldError(event.target.name));
  form.addEventListener("change", (event) => clearFieldError(event.target.name));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeStall || posting || loadState !== "ready") return;

    const stall = activeStall;
    const existingReviews = [...reviews];
    const data = new FormData(form);
    const payload = {
      author: data.get("author"),
      rating: Number(data.get("rating")),
      text: data.get("text"),
    };
    clearFieldErrors();
    formMessage.textContent = "";
    formMessage.hidden = true;
    actionError = "";
    posting = true;
    renderDialog();

    try {
      const review = await postJSON(`/stalls/${encodeURIComponent(stall.id)}/reviews`, payload);
      ownedReviewIds.add(review.id);
      persistOwnedReviewIds();
      const updatedReviews = [review, ...existingReviews];
      updateStallRating(stall.id, updatedReviews);
      if (activeStall?.id === stall.id && dialog.open) {
        reviews = updatedReviews;
        form.reset();
        formMessage.hidden = true;
        renderDialog();
      }
    } catch (error) {
      if (activeStall?.id !== stall.id || !dialog.open) return;
      if (error.status === 422 && error.body?.fields) {
        let shownField = false;
        for (const [name, message] of Object.entries(error.body.fields)) {
          const input = form.elements.namedItem(name);
          const fieldMessage = document.querySelector(`#review-${name}-error`);
          if (!input || !fieldMessage) continue;
          input.setAttribute("aria-invalid", "true");
          fieldMessage.textContent = message;
          fieldMessage.hidden = false;
          shownField = true;
        }
        if (!shownField) {
          formMessage.textContent = "Please check the review fields and try again.";
          formMessage.hidden = false;
        }
      } else {
        formMessage.textContent = `Could not post the review: ${describe(error)}. Your entries were kept.`;
        formMessage.hidden = false;
      }
    } finally {
      posting = false;
      renderDialog();
    }
  });

  reviewList.addEventListener("click", async (event) => {
    const button = event.target.closest(".review-delete");
    if (!button || !activeStall || deletingIds.size > 0 || !ownedReviewIds.has(button.dataset.reviewId)) return;

    const stall = activeStall;
    const reviewId = button.dataset.reviewId;
    const remainingReviews = reviews.filter((review) => review.id !== reviewId);
    deletingIds.add(reviewId);
    actionError = "";
    renderDialog();

    try {
      await request("DELETE", `/reviews/${encodeURIComponent(reviewId)}`);
      ownedReviewIds.delete(reviewId);
      persistOwnedReviewIds();
      updateStallRating(stall.id, remainingReviews);
      if (activeStall?.id === stall.id) reviews = remainingReviews;
    } catch (error) {
      if (activeStall?.id === stall.id) actionError = `Could not delete the review: ${describe(error)}.`;
    } finally {
      deletingIds.delete(reviewId);
      renderDialog();
    }
  });
}