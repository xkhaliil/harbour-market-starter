import { request, getJSON, HttpError, describe } from "./api.js";

const tbody = document.querySelector(".stalls tbody");
const template = document.querySelector("#row-template");
const tokenForm = document.querySelector(".token-form");
const tokenInput = tokenForm.elements.token;
const tokenStatus = document.querySelector(".token-status");
const status = document.querySelector(".admin-status");
const errorLine = document.querySelector(".admin-error");
const retryButton = document.querySelector(".admin-retry");
const editor = document.querySelector(".stall-editor");
const editorFields = editor.querySelector(".editor-fields");
const editorTitle = document.querySelector("#editor-title");
const editorSubmit = document.querySelector(".editor-submit");
const editorCancel = document.querySelector(".editor-cancel");
const editorError = document.querySelector(".editor-error");
const fieldNames = ["name", "tag", "price", "blurb", "soldOut"];

const state = {
  status: "loading",
  error: "",
  notice: "",
  stalls: [],
  busyIds: new Set(),
  rowErrors: new Map(),
  editorBusy: false,
  editingId: null,
  token: sessionStorage.getItem("harbour-token") ?? "",
};

const auth = () => state.token
  ? { headers: { Authorization: `Bearer ${state.token}` } }
  : {};

function row(stall) {
  const tr = template.content.firstElementChild.cloneNode(true);
  tr.dataset.id = stall.id;
  const busy = state.busyIds.has(stall.id)
    || (state.editorBusy && state.editingId === null)
    || state.editingId === stall.id;
  tr.setAttribute("aria-busy", String(busy));
  tr.querySelector(".name").textContent = stall.name;
  tr.querySelector(".tag").textContent = stall.tag;
  tr.querySelector(".price").textContent = stall.price === 0 ? "free" : `€${stall.price}`;
  tr.querySelector(".blurb").textContent = stall.blurb;
  const box = tr.querySelector(".sold-out");
  box.checked = stall.soldOut;
  box.disabled = busy;
  box.setAttribute("aria-label", `Sold out: ${stall.name}`);
  const rowError = tr.querySelector(".row-error");
  rowError.textContent = state.rowErrors.get(stall.id) ?? "";
  rowError.hidden = !rowError.textContent;
  tr.querySelector(".edit").disabled = busy;
  tr.querySelector(".remove").disabled = busy;
  tr.querySelector(".remove").setAttribute("aria-label", `Remove ${stall.name}`);
  return tr;
}

function render() {
  status.textContent = state.status === "loading"
    ? "Loading stalls…"
    : state.notice || (state.status === "ready" ? `${state.stalls.length} stalls` : "");
  errorLine.textContent = state.error;
  retryButton.hidden = state.status !== "error";
  editorFields.disabled = state.status !== "ready"
    || state.editorBusy
    || (state.editingId !== null && state.busyIds.has(state.editingId));
  editorCancel.hidden = state.editingId === null;
  tbody.setAttribute("aria-busy", String(state.status === "loading" || state.busyIds.size > 0));

  if (state.status === "loading" || state.status === "error" || state.stalls.length === 0) {
    const tr = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "table-message";
    cell.textContent = state.status === "loading"
      ? "Loading stalls…"
      : state.status === "error"
        ? "The stalls could not be loaded."
        : "No stalls yet.";
    tr.append(cell);
    tbody.replaceChildren(tr);
    return;
  }
  tbody.replaceChildren(...state.stalls.map(row));
}

function clearFieldError(name) {
  const input = editor.elements.namedItem(name);
  const message = document.querySelector(`#error-${name}`);
  if (!input || !message) return;
  input.removeAttribute("aria-invalid");
  message.textContent = "";
  message.hidden = true;
}

function clearEditorErrors() {
  for (const name of fieldNames) clearFieldError(name);
  editorError.textContent = "";
  editorError.hidden = true;
}

function resetEditor() {
  editor.reset();
  state.editingId = null;
  editorTitle.textContent = "Add a stall";
  editorSubmit.textContent = "Add stall";
  clearEditorErrors();
}

function removeMissingStall(stall) {
  state.stalls = state.stalls.filter((item) => item.id !== stall.id);
  state.rowErrors.delete(stall.id);
  if (state.editingId === stall.id) resetEditor();
  state.error = "";
  state.notice = `${stall.name} was removed because it no longer exists.`;
}

function showFieldErrors(fields, target, stall) {
  if (target === "row") {
    const message = fields.soldOut ?? Object.values(fields)[0];
    if (stall && message) state.rowErrors.set(stall.id, message);
    else state.error = "The server rejected one or more fields.";
    return;
  }

  let shown = false;
  for (const [name, message] of Object.entries(fields)) {
    const input = editor.elements.namedItem(name);
    const fieldMessage = document.querySelector(`#error-${name}`);
    if (!input || !fieldMessage) continue;
    input.setAttribute("aria-invalid", "true");
    fieldMessage.textContent = message;
    fieldMessage.hidden = false;
    shown = true;
  }
  if (!shown) state.error = "The server rejected one or more fields.";
}

function handleMutationError(error, stall, action, target = "editor") {
  state.notice = "";
  state.error = "";
  if (error instanceof HttpError && error.status === 401) {
    state.error = "Enter a valid token.";
    tokenInput.focus();
    return;
  }
  if (error instanceof HttpError && error.status === 403) {
    state.error = stall
      ? `This token can't edit ${stall.name}.`
      : "This token can't add stalls.";
    return;
  }
  if (error instanceof HttpError && error.status === 404 && stall) {
    removeMissingStall(stall);
    return;
  }
  if (error instanceof HttpError && error.status === 409) {
    state.error = "A stall with that name exists.";
    return;
  }
  if (error instanceof HttpError && error.status === 422 && error.body?.fields) {
    showFieldErrors(error.body.fields, target, stall);
    return;
  }
  state.error = `Could not ${action}: ${describe(error)}.`;
}

function replaceStall(updatedStall) {
  state.stalls = state.stalls.map((stall) => stall.id === updatedStall.id ? updatedStall : stall);
}

async function loadStalls() {
  state.status = "loading";
  state.error = "";
  state.notice = "";
  render();
  try {
    state.stalls = await getJSON("/stalls");
    state.status = "ready";
  } catch (error) {
    state.status = "error";
    state.error = `Could not load stalls: ${describe(error)}.`;
  }
  render();
}

tokenForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.token = tokenInput.value.trim();
  if (state.token) {
    sessionStorage.setItem("harbour-token", state.token);
    tokenStatus.textContent = "Token saved for this tab.";
  } else {
    sessionStorage.removeItem("harbour-token");
    tokenStatus.textContent = "Token cleared for this tab.";
  }
  state.error = "";
  render();
});

retryButton.addEventListener("click", loadStalls);

editor.addEventListener("input", (event) => clearFieldError(event.target.name));
editor.addEventListener("change", (event) => clearFieldError(event.target.name));
editor.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.status !== "ready" || state.editorBusy) return;

  const stall = state.stalls.find((item) => item.id === state.editingId) ?? null;
  const values = new FormData(editor);
  const rawPrice = values.get("price");
  const payload = {
    name: values.get("name").trim(),
    tag: values.get("tag"),
    price: rawPrice === "" ? null : Number(rawPrice),
    blurb: values.get("blurb").trim(),
    soldOut: editor.elements.soldOut.checked,
  };
  clearEditorErrors();
  state.error = "";
  state.notice = "";
  state.editorBusy = true;
  if (stall) state.busyIds.add(stall.id);
  render();

  try {
    if (stall) {
      const updatedStall = await request("PATCH", `/stalls/${encodeURIComponent(stall.id)}`, payload, auth());
      replaceStall(updatedStall);
      state.notice = `${updatedStall.name} updated.`;
    } else {
      const createdStall = await request("POST", "/stalls", payload, auth());
      state.stalls = [...state.stalls, createdStall];
      state.notice = `${createdStall.name} added.`;
    }
    resetEditor();
  } catch (error) {
    handleMutationError(error, stall, stall ? "update the stall" : "add the stall");
  } finally {
    state.editorBusy = false;
    if (stall) state.busyIds.delete(stall.id);
    render();
  }
});

editorCancel.addEventListener("click", () => {
  resetEditor();
  state.error = "";
  state.notice = "";
  render();
});

tbody.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const rowElement = button.closest("tr");
  const stall = state.stalls.find((item) => item.id === rowElement.dataset.id);
  if (!stall || state.busyIds.has(stall.id)) return;

  if (button.classList.contains("edit")) {
    state.editingId = stall.id;
    editorTitle.textContent = `Edit ${stall.name}`;
    editorSubmit.textContent = "Save changes";
    editor.elements.name.value = stall.name;
    editor.elements.tag.value = stall.tag;
    editor.elements.price.value = stall.price;
    editor.elements.blurb.value = stall.blurb;
    editor.elements.soldOut.checked = Boolean(stall.soldOut);
    clearEditorErrors();
    state.error = "";
    state.notice = "";
    render();
    editor.elements.name.focus();
    return;
  }

  if (!button.classList.contains("remove")) return;
  if (!window.confirm(`Remove ${stall.name} from the market?`)) return;

  state.busyIds.add(stall.id);
  state.rowErrors.delete(stall.id);
  state.error = "";
  state.notice = "";
  render();
  try {
    await request("DELETE", `/stalls/${encodeURIComponent(stall.id)}`, undefined, auth());
    state.stalls = state.stalls.filter((item) => item.id !== stall.id);
    state.notice = `${stall.name} removed.`;
  } catch (error) {
    handleMutationError(error, stall, `remove ${stall.name}`, "row");
  } finally {
    state.busyIds.delete(stall.id);
    render();
  }
});

tbody.addEventListener("change", async (event) => {
  const checkbox = event.target.closest(".sold-out");
  if (!checkbox) return;
  const stallId = checkbox.closest("tr").dataset.id;
  const stall = state.stalls.find((item) => item.id === stallId);
  if (!stall || state.busyIds.has(stall.id)) return;

  state.busyIds.add(stall.id);
  state.rowErrors.delete(stall.id);
  state.error = "";
  state.notice = "";
  render();
  try {
    const updatedStall = await request("PATCH", `/stalls/${encodeURIComponent(stall.id)}`, { soldOut: checkbox.checked }, auth());
    replaceStall(updatedStall);
    state.notice = `${updatedStall.name} updated.`;
  } catch (error) {
    if (error instanceof HttpError && error.status === 422 && error.body?.fields?.soldOut) {
      state.rowErrors.set(stall.id, error.body.fields.soldOut);
      state.error = "";
    } else {
      handleMutationError(error, stall, `update ${stall.name}`, "row");
    }
  } finally {
    state.busyIds.delete(stall.id);
    render();
  }
});

if (state.token) {
  tokenInput.value = state.token;
  tokenStatus.textContent = "Using the token saved in this tab.";
}

await loadStalls();
