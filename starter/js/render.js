import { describe } from "./api.js";
import { state, visibleStalls } from "./state.js";

const template = document.querySelector("#stall-template");
const list = document.querySelector(".vendor-list");
const filters = document.querySelector(".filters"); // module scope: main.js has its own
const count = document.querySelector(".filter-count");
const savedCount = document.querySelector(".saved-count");
const search = document.querySelector("#vendor-search");
const loadStatus = document.querySelector(".load-status");
const errorMessage = document.querySelector(".load-error [role=alert]");
const retryButton = document.querySelector(".load-error button");

// Data in, element out
function card(stall) {
  const li = template.content.firstElementChild.cloneNode(true);
  li.dataset.id = stall.id;
  li.dataset.tag = stall.tag;

  const article = li.querySelector(".vendor-card");
  article.classList.toggle("featured", Boolean(stall.featured));
  article.classList.toggle("sold-out", Boolean(stall.soldOut)); // Boolean: a missing key is undefined, and toggle(name, undefined) flips

  li.querySelector(".tag").textContent = stall.tag;
  li.querySelector("h3").textContent = stall.name;
  li.querySelector(".blurb").textContent = stall.blurb;
  li.querySelector(".price").textContent = stall.price === 0 ? "free" : `from €${stall.price}`;
  li.querySelector(".badge").hidden = !stall.soldOut;
  li.querySelector(".rating").textContent = stall.rating == null
    ? "No reviews yet"
    : `★ ${stall.rating} · ${stall.reviewCount} ${stall.reviewCount === 1 ? "review" : "reviews"}`;

  const isSaved = state.saved.has(stall.id);
  const save = li.querySelector(".save");
  save.setAttribute("aria-pressed", String(isSaved));
  save.setAttribute("aria-label", `Save ${stall.name}`);
  save.textContent = isSaved ? "♥" : "♡";
  const reviews = li.querySelector(".reviews-open");
  reviews.setAttribute("aria-label", `Reviews for ${stall.name}`);
  return li;
}

// Draws everything that depends on state. Safe to call any number of times.
export function render() {
  const visible = visibleStalls();
  list.setAttribute("aria-busy", String(state.status === "loading"));
  loadStatus.textContent = state.status === "loading"
    ? "Loading the vendors…"
    : state.status === "ready"
      ? `${state.stalls.length} ${state.stalls.length === 1 ? "stall" : "stalls"}`
      : "";
  errorMessage.textContent = state.error ? `Could not load the vendors: ${describe(state.error)}.` : "";
  errorMessage.hidden = !state.error;
  retryButton.hidden = !state.error;

  if (state.status === "loading") {
    const loading = document.createElement("li");
    loading.className = "empty";
    loading.textContent = "Loading the vendors…";
    list.replaceChildren(loading);
  } else if (state.status === "error") {
    list.replaceChildren();
  } else if (visible.length) {
    list.replaceChildren(...visible.map(card));
  } else {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = state.stalls.length
      ? `No stall matches “${state.query}”.`
      : "No stalls yet.";
    list.replaceChildren(empty);
  }

  for (const button of filters.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === state.tag));
  }
  count.textContent = visible.length === state.stalls.length ? "" : `${visible.length} of ${state.stalls.length} stalls`;
  savedCount.textContent = state.saved.size ? `♥ ${state.saved.size} saved` : "";

  // Controls are part of the page too: draw them from state
  // (only when different: rewriting the box you're typing in can move the cursor)
  if (search.value !== state.query) search.value = state.query;
}
