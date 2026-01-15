"use strict";

const PEXELS_API_KEY = ""; // Paste your key here for local testing

const API = {
  photos: "https://api.pexels.com/v1/search",
  videos: "https://api.pexels.com/videos/search",
};

const PER_PAGE = 12;
const HISTORY_LIMIT = 5;
const STORAGE_KEY = "mediaExplorerSaved_v1";

const $form = document.querySelector(".js-search-form");
const $input = document.querySelector(".js-search-input");
const $status = document.querySelector(".js-status");
const $grid = document.querySelector(".js-grid");
const $loadMore = document.querySelector(".js-load-more");
const $history = document.querySelector(".js-history");
const $savedGrid = document.querySelector(".js-saved-grid");
const $mediaButtons = document.querySelectorAll(".js-media-btn");

const state = {
  query: "",
  media: "photos",
  page: 1,
  isLoading: false,
  history: [],
  saved: loadSaved(),
  userProvidedKey: null,
};

init();

function init() {
  renderSaved();
  $form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $input.value.trim();
    if (!q) return;
    startNewSearch(q);
  });
  $mediaButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.media;
      if (!next || next === state.media) return;
      state.media = next;
      setActiveMediaButton(next);
      if (state.query) startNewSearch(state.query);
    });
  });
  $loadMore.addEventListener("click", () => {
    if (state.isLoading || !state.query) return;
    state.page += 1;
    fetchAndRender({ append: true });
  });
  $history.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-q]");
    if (!btn) return;
    $input.value = btn.dataset.q;
    startNewSearch(btn.dataset.q);
  });
  document.addEventListener("click", (e) => {
    const saveBtn = e.target.closest("button[data-action='save']");
    const removeBtn = e.target.closest("button[data-action='remove']");
    const id = e.target.closest("[data-id]")?.dataset?.id;
    if (saveBtn && id) {
      const payload = safeJsonParse(saveBtn.dataset.payload);
      if (payload) saveItem(payload);
    }
    if (removeBtn && id) removeSaved(id);
  });
  setActiveMediaButton(state.media);
  renderHistory();
  setStatus("Search for photos and short videos above.");
}

function startNewSearch(query) {
  state.query = query;
  state.page = 1;
  addToHistory(query);
  renderHistory();
  clearResults();
  fetchAndRender({ append: false });
}

async function fetchAndRender({ append }) {
  let activeKey = PEXELS_API_KEY || state.userProvidedKey;
  if (!activeKey || activeKey.includes("PASTE_YOUR")) {
    const promptKey = prompt("Please enter your Pexels API Key:");
    if (promptKey) {
      state.userProvidedKey = promptKey;
      activeKey = promptKey;
    } else {
      setStatus("API Key required.");
      return;
    }
  }
  state.isLoading = true;
  setStatus("Loading…");
  $loadMore.hidden = true;
  try {
    const data = await fetchPexels({
      query: state.query,
      media: state.media,
      page: state.page,
      perPage: PER_PAGE,
      key: activeKey,
    });
    const items = normalizeResults(state.media, data);
    if (!append) clearResults();
    if (items.length === 0 && state.page === 1) {
      setStatus(`No results for "${state.query}".`);
      return;
    }
    setStatus(`Showing results for "${state.query}".`);
    renderResults(items);
    if (items.length === PER_PAGE) $loadMore.hidden = false;
  } catch (err) {
    console.error(err);
    setStatus("Error fetching data. Check your API key.");
  } finally {
    state.isLoading = false;
  }
}

async function fetchPexels({ query, media, page, perPage, key }) {
  const url = new URL(media === "videos" ? API.videos : API.photos);
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  const res = await fetch(url.toString(), { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Status: ${res.status}`);
  return res.json();
}

function normalizeResults(media, data) {
  const list = media === "videos" ? data.videos || [] : data.photos || [];
  return list.map((item) => ({
    id: `${media}_${item.id}`,
    media,
    thumb:
      media === "videos"
        ? item.image || item.video_pictures?.[0]?.picture
        : item.src.large,
    author: media === "videos" ? item.user.name : item.photographer,
    link: item.url,
  }));
}

function renderResults(items) {
  const frag = document.createDocumentFragment();
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = item.id;
    card.innerHTML = `
      <img class="card-media" src="${item.thumb}" alt="Media by ${item.author}">
      <div class="card-body">
        <div class="card-meta">By: ${item.author}</div>
        <div class="card-actions">
          <a href="${item.link}" target="_blank">View</a>
          <a href="${
            item.link
          }" target="_blank" style="color: green;">Download</a>
          <button type="button" data-action="save" ${
            isSaved(item.id) ? "disabled" : ""
          }>${isSaved(item.id) ? "Saved" : "Save"}</button>
        </div>
      </div>`;
    frag.appendChild(card);
  });
  $grid.appendChild(frag);
}

function renderSaved() {
  if (!state.saved.length) {
    $savedGrid.innerHTML = `<p>No saved items yet.</p>`;
    return;
  }
  $savedGrid.innerHTML = state.saved
    .map(
      (item) => `
    <article class="card" data-id="${item.id}">
      <img class="card-media" src="${item.thumb}" />
      <div class="card-body">
        <div class="card-meta">By: ${item.author}</div>
        <div class="card-actions">
          <a href="${item.link}" target="_blank">View</a>
          <a href="${item.link}" target="_blank" style="color: green;">Download</a>
          <button type="button" data-action="remove">Remove</button>
        </div>
      </div>
    </article>`
    )
    .join("");
}

function clearResults() {
  $grid.innerHTML = "";
}
function setStatus(msg) {
  $status.textContent = msg;
}
function setActiveMediaButton(media) {
  $mediaButtons.forEach((b) =>
    b.classList.toggle("is-active", b.dataset.media === media)
  );
}
function addToHistory(q) {
  state.history = [
    q,
    ...state.history.filter((x) => x.toLowerCase() !== q.toLowerCase()),
  ].slice(0, HISTORY_LIMIT);
}
function renderHistory() {
  $history.innerHTML = state.history
    .map(
      (q) =>
        `<button type="button" data-q="${escapeHtml(q)}">${escapeHtml(
          q
        )}</button>`
    )
    .join("");
}
function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}
function persistSaved() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saved));
}
function isSaved(id) {
  return state.saved.some((x) => x.id === id);
}
function saveItem(item) {
  if (isSaved(item.id)) return;
  state.saved.unshift(item);
  persistSaved();
  renderSaved();
}
function removeSaved(id) {
  state.saved = state.saved.filter((x) => x.id !== id);
  persistSaved();
  renderSaved();
}
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[
        m
      ])
  );
}
