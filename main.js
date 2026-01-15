"use strict";

/* =========================
   CONFIG
   ========================= */

// 1) Get your Pexels API key and paste it here FOR LOCAL TESTING ONLY.
//    DO NOT commit your key to GitHub.
const PEXELS_API_KEY = "";

// Pexels endpoints
const API = {
  photos: "https://api.pexels.com/v1/search",
  videos: "https://api.pexels.com/videos/search",
};

const PER_PAGE = 12;
const HISTORY_LIMIT = 5;
const STORAGE_KEY = "mediaExplorerSaved_v1";

/* =========================
   DOM
   ========================= */

const $form = document.querySelector(".js-search-form");
const $input = document.querySelector(".js-search-input");
const $status = document.querySelector(".js-status");
const $grid = document.querySelector(".js-grid");
const $loadMore = document.querySelector(".js-load-more");
const $history = document.querySelector(".js-history");
const $savedGrid = document.querySelector(".js-saved-grid");
const $mediaButtons = document.querySelectorAll(".js-media-btn");

/* =========================
   STATE
   ========================= */

const state = {
  query: "",
  media: "photos", // 'photos' | 'videos'
  page: 1,
  isLoading: false,
  history: [],
  saved: loadSaved(),
  userProvidedKey: null, // Temporary storage for live session key
};

/* =========================
   INIT
   ========================= */

init();

function init() {
  // Render saved on page load
  renderSaved();

  // Form submit
  $form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $input.value.trim();
    if (!q) return;
    startNewSearch(q);
  });

  // Media toggle buttons
  $mediaButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.media;
      if (!next || next === state.media) return;

      state.media = next;
      setActiveMediaButton(next);

      // If there's already a query, re-run it with the new media type.
      if (state.query) startNewSearch(state.query);
    });
  });

  // Load more
  $loadMore.addEventListener("click", () => {
    if (state.isLoading) return;
    if (!state.query) return;

    state.page += 1;
    fetchAndRender({ append: true });
  });

  // Search history (event delegation)
  $history.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-q]");
    if (!btn) return;
    const q = btn.dataset.q;
    if (!q) return;

    $input.value = q;
    startNewSearch(q);
  });

  // Saved actions (event delegation)
  document.addEventListener("click", (e) => {
    const saveBtn = e.target.closest("button[data-action='save']");
    const removeBtn = e.target.closest("button[data-action='remove']");
    const id = e.target.closest("[data-id]")?.dataset?.id;

    if (saveBtn && id) {
      const payload = safeJsonParse(saveBtn.dataset.payload);
      if (!payload) return;
      saveItem(payload);
      return;
    }

    if (removeBtn && id) {
      removeSaved(id);
      return;
    }
  });

  // Initial UI
  setActiveMediaButton(state.media);
  renderHistory();
  setStatus("Search for photos and short videos above.");
}

/* =========================
   CORE FLOW
   ========================= */

function startNewSearch(query) {
  state.query = query;
  state.page = 1;

  addToHistory(query);
  renderHistory();

  clearResults();
  fetchAndRender({ append: false });
}

async function fetchAndRender({ append }) {
  // Logic updated to allow user-provided keys on live site
  let activeKey = PEXELS_API_KEY || state.userProvidedKey;

  if (!activeKey || activeKey.includes("PASTE_YOUR")) {
    const promptKey = prompt(
      "Please enter your Pexels API Key to view live results:"
    );
    if (promptKey) {
      state.userProvidedKey = promptKey;
      activeKey = promptKey;
    } else {
      setStatus("API Key required. Search is disabled.");
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
      key: activeKey, // Pass the active key
    });

    const items = normalizeResults(state.media, data);

    if (!append) clearResults();

    if (items.length === 0 && state.page === 1) {
      setStatus(`No results for "${state.query}". Try a different keyword.`);
      return;
    }

    setStatus(`Showing ${state.media} results for "${state.query}".`);

    renderResults(items);

    // Show Load More if it looks like there could be more data
    if (items.length === PER_PAGE) {
      $loadMore.hidden = false;
    }
  } catch (err) {
    console.error(err);
    if (err.message.includes("401")) {
      state.userProvidedKey = null; // Clear bad key
      setStatus("Invalid API Key. Please refresh and try again.");
    } else {
      setStatus("Something went wrong. Check your connection.");
    }
  } finally {
    state.isLoading = false;
  }
}

/* =========================
   API
   ========================= */

async function fetchPexels({ query, media, page, perPage, key }) {
  const url = new URL(media === "videos" ? API.videos : API.photos);
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: key, // Using dynamic key
    },
  });

  if (!res.ok) {
    throw new Error(`Pexels API error: ${res.status}`);
  }

  return res.json();
}

/* =========================
   NORMALIZATION
   ========================= */

function normalizeResults(media, data) {
  if (media === "videos") {
    const vids = Array.isArray(data?.videos) ? data.videos : [];
    return vids.map((v) => {
      const thumb = v?.image || v?.video_pictures?.[0]?.picture || "";
      return {
        id: `video_${v.id}`,
        media: "videos",
        thumb,
        author: v?.user?.name || "Unknown",
        link: v?.url || "",
      };
    });
  }

  // photos
  const photos = Array.isArray(data?.photos) ? data.photos : [];
  return photos.map((p) => {
    const thumb = p?.src?.large || p?.src?.medium || "";
    const author = p?.photographer || "Unknown";
    const link = p?.url || "";
    return {
      id: `photo_${p.id}`,
      media: "photos",
      thumb,
      author,
      link,
    };
  });
}

/* =========================
   RENDERING
   ========================= */

function renderResults(items) {
  const frag = document.createDocumentFragment();

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = item.id;

    const img = document.createElement("img");
    img.className = "card-media";
    img.src = item.thumb;
    img.alt = `${item.media.slice(0, -1)} by ${item.author}`;

    const body = document.createElement("div");
    body.className = "card-body";

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = `By: ${item.author}`;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const view = document.createElement("a");
    view.href = item.link;
    view.target = "_blank";
    view.rel = "noopener noreferrer";
    view.textContent = "View source";

    let watch = null;
    if (item.media === "videos") {
      watch = document.createElement("a");
      watch.href = item.link;
      watch.target = "_blank";
      watch.rel = "noopener noreferrer";
      watch.textContent = "Watch on Pexels";
    }

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.dataset.action = "save";
    saveBtn.dataset.payload = JSON.stringify(item);
    saveBtn.textContent = isSaved(item.id) ? "Saved" : "Save";
    saveBtn.disabled = isSaved(item.id);

    actions.append(view);
    if (watch) actions.append(watch);
    actions.append(saveBtn);

    body.append(meta, actions);
    card.append(img, body);
    frag.appendChild(card);
  });

  $grid.appendChild(frag);
}

function clearResults() {
  $grid.innerHTML = "";
}

/* =========================
   STATUS
   ========================= */

function setStatus(msg) {
  $status.textContent = msg;
}

/* =========================
   MEDIA TOGGLE UI
   ========================= */

function setActiveMediaButton(media) {
  $mediaButtons.forEach((b) => {
    b.classList.toggle("is-active", b.dataset.media === media);
  });
}

/* =========================
   SEARCH HISTORY
   ========================= */

function addToHistory(q) {
  const lower = q.toLowerCase();
  state.history = state.history.filter((x) => x.toLowerCase() !== lower);

  state.history.unshift(q);

  if (state.history.length > HISTORY_LIMIT) {
    state.history = state.history.slice(0, HISTORY_LIMIT);
  }
}

function renderHistory() {
  if (!state.history.length) {
    $history.innerHTML = "";
    return;
  }

  $history.innerHTML = state.history
    .map(
      (q) =>
        `<button type="button" data-q="${escapeHtml(q)}">${escapeHtml(
          q
        )}</button>`
    )
    .join("");
}

/* =========================
   SAVED (localStorage)
   ========================= */

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
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

  // Updated to use a safer selector method
  const card = Array.from(document.querySelectorAll(".js-grid .card")).find(
    (c) => c.dataset.id === item.id
  );

  if (card) {
    const btn = card.querySelector("button[data-action='save']");
    if (btn) {
      btn.textContent = "Saved";
      btn.disabled = true;
    }
  }
}

function removeSaved(id) {
  state.saved = state.saved.filter((x) => x.id !== id);
  persistSaved();
  renderSaved();
}

function renderSaved() {
  if (!state.saved.length) {
    $savedGrid.innerHTML = `<p class="card-meta">No saved items yet.</p>`;
    return;
  }

  $savedGrid.innerHTML = state.saved
    .map((item) => {
      return `
        <article class="card" data-id="${escapeHtml(item.id)}">
          <img class="card-media" src="${escapeHtml(item.thumb)}"
            alt="${escapeHtml(item.media.slice(0, -1))} by ${escapeHtml(
        item.author
      )}" />
          <div class="card-body">
            <div class="card-meta">By: ${escapeHtml(item.author)}</div>
            <div class="card-actions">
              <a href="${escapeHtml(
                item.link
              )}" target="_blank" rel="noopener noreferrer">View source</a>
              ${
                item.media === "videos"
                  ? `<a href="${escapeHtml(
                      item.link
                    )}" target="_blank" rel="noopener noreferrer">Watch on Pexels</a>`
                  : ""
              }
              <button type="button" data-action="remove">Remove</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

/* =========================
   SMALL HELPERS
   ========================= */

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
