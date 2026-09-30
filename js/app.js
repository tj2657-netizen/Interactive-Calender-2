// Sunny Days 2026 — plans, notes, and photos saved in this browser.

const YEAR = 2026;
const STORAGE_KEY = "sunny-days-2026";
const MAX_PHOTOS = 6;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const HOLIDAYS = {
  "2026-01-01": { name: "New Year's Day", emoji: "🎉" },
  "2026-02-14": { name: "Valentine's Day", emoji: "💌" },
  "2026-03-17": { name: "St. Patrick's Day", emoji: "☘️" },
  "2026-04-01": { name: "April Fools' Day", emoji: "🃏" },
  "2026-04-22": { name: "Earth Day", emoji: "🌍" },
  "2026-10-31": { name: "Halloween", emoji: "🎃" },
  "2026-12-24": { name: "Christmas Eve", emoji: "⭐" },
  "2026-12-25": { name: "Christmas Day", emoji: "🎄" },
  "2026-12-31": { name: "New Year's Eve", emoji: "✨" }
};

const todayDate = new Date();
const opening = todayDate.getFullYear() === YEAR ? todayDate : new Date(YEAR, 0, 1);

const state = {
  month: opening.getMonth(),
  selected: toKey(opening),
  editingId: null,
  uploading: false,
  store: {},
  saved: "{}"
};

const dom = {
  grid: document.getElementById("calendar-grid"),
  monthLabel: document.getElementById("month-label"),
  monthSummary: document.getElementById("month-summary"),
  monthPills: document.getElementById("month-pills"),
  prev: document.getElementById("prev-month"),
  next: document.getElementById("next-month"),
  today: document.getElementById("today-btn"),
  panel: document.getElementById("day-panel"),
  agendaTitle: document.getElementById("agenda-title"),
  agendaCount: document.getElementById("agenda-count"),
  agendaList: document.getElementById("agenda-list"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightbox-img"),
  lightboxCaption: document.getElementById("lightbox-caption"),
  toast: document.getElementById("toast")
};

let toastTimer = 0;
let toldStorageFull = false;
let lastFocus = null;

function toKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function normalizeTime(value) {
  const match = /^(\d{2}):(\d{2})/.exec(value || "");
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${match[1]}:${match[2]}`;
}

function formatTime(value) {
  const time = normalizeTime(value);
  if (!time) return "Anytime";
  let hour = Number(time.slice(0, 2));
  const minute = time.slice(3);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

function eventLabel(event) {
  return event.time ? `${formatTime(event.time)} ${event.title}` : event.title;
}

function compareEvents(a, b) {
  if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
  if (a.time && !b.time) return -1;
  if (!a.time && b.time) return 1;
  return a.title.localeCompare(b.title);
}

function blankEntry() {
  return { note: "", events: [], photos: [] };
}

function isBlank(entry) {
  return !entry.note.trim() && entry.events.length === 0 && entry.photos.length === 0;
}

function getEntry(key) {
  return state.store[key] || blankEntry();
}

function ensureEntry(key) {
  if (!state.store[key]) state.store[key] = blankEntry();
  return state.store[key];
}

function sanitizeEvent(event) {
  if (!event || typeof event !== "object") return null;
  const title = typeof event.title === "string" ? event.title.trim().slice(0, 80) : "";
  if (!title) return null;
  const detail = typeof event.detail === "string" ? event.detail.trim().slice(0, 240) : "";
  const id = typeof event.id === "string" && event.id ? event.id : uid();
  return { id, title, time: normalizeTime(event.time), detail };
}

function sanitizePhoto(photo) {
  if (!photo || typeof photo !== "object") return null;
  const dataUrl = typeof photo.dataUrl === "string" ? photo.dataUrl : "";
  if (!dataUrl.startsWith("data:image/") || dataUrl.length > 500000) return null;
  const id = typeof photo.id === "string" && photo.id ? photo.id : uid();
  const name = typeof photo.name === "string" && photo.name ? photo.name.slice(0, 120) : "photo";
  return { id, name, dataUrl };
}

function sanitize(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const store = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || fromKey(key).getFullYear() !== YEAR) return;
    if (!value || typeof value !== "object") return;
    const note = typeof value.note === "string" ? value.note.slice(0, 500) : "";
    const events = Array.isArray(value.events) ? value.events.map(sanitizeEvent).filter(Boolean) : [];
    const photos = Array.isArray(value.photos) ? value.photos.map(sanitizePhoto).filter(Boolean) : [];
    const entry = { note, events, photos };
    if (!isBlank(entry)) store[key] = entry;
  });
  return store;
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return sanitize(JSON.parse(raw));
  } catch (error) {
    return {};
  }
}

function persist() {
  try {
    const json = JSON.stringify(state.store);
    localStorage.setItem(STORAGE_KEY, json);
    state.saved = json;
    toldStorageFull = false;
    return true;
  } catch (error) {
    state.store = state.saved ? JSON.parse(state.saved) : {};
    if (!toldStorageFull) {
      toldStorageFull = true;
      toast("This browser's storage is full. Remove a photo and try again.");
    }
    return false;
  }
}

function toast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("is-on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => dom.toast.classList.remove("is-on"), 2400);
}

function buildCells(month) {
  const firstWeekday = new Date(YEAR, month, 1).getDay();
  return Array.from({ length: 42 }, (_, index) => new Date(YEAR, month, index - firstWeekday + 1));
}

function monthStats(month) {
  const stats = { days: 0, events: 0, notes: 0, photos: 0 };
  Object.entries(state.store).forEach(([key, entry]) => {
    const date = fromKey(key);
    if (date.getFullYear() !== YEAR || date.getMonth() !== month || isBlank(entry)) return;
    stats.days += 1;
    stats.events += entry.events.length;
    if (entry.note.trim()) stats.notes += 1;
    stats.photos += entry.photos.length;
  });
  return stats;
}

function statsLine(stats) {
  if (!stats.days) return "Nothing planned yet";
  const parts = [];
  if (stats.events) parts.push(plural(stats.events, "plan"));
  if (stats.notes) parts.push(plural(stats.notes, "note"));
  if (stats.photos) parts.push(plural(stats.photos, "photo"));
  return parts.join(" · ");
}

function monthKeys(month) {
  return Object.keys(state.store)
    .filter((key) => {
      const date = fromKey(key);
      return date.getFullYear() === YEAR && date.getMonth() === month && !isBlank(state.store[key]);
    })
    .sort();
}

function dayLabel(date, entry, holiday, events, isToday, isOutside) {
  const parts = [`${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`];
  if (isToday) parts.push("today");
  if (isOutside) parts.push("in another month");
  if (holiday) parts.push(holiday.name);
  if (events.length) parts.push(events.map(eventLabel).join(", "));
  if (entry.note.trim()) parts.push("note");
  if (entry.photos.length) parts.push(plural(entry.photos.length, "photo"));
  return parts.join(", ");
}

function pipsHtml(entry) {
  const pips = [];
  if (entry.events.length) pips.push('<span class="pip pip-event"></span>');
  if (entry.note.trim()) pips.push('<span class="pip pip-note"></span>');
  if (entry.photos.length) pips.push('<span class="pip pip-photo"></span>');
  return pips.join("");
}

function renderCell(date) {
  const key = toKey(date);
  if (date.getFullYear() !== YEAR) {
    return `<div class="day is-outside is-disabled"><span class="num">${date.getDate()}</span></div>`;
  }

  const entry = getEntry(key);
  const holiday = HOLIDAYS[key];
  const events = entry.events.slice().sort(compareEvents);
  const todayKey = toKey(new Date());
  const isToday = key === todayKey;
  const isSelected = key === state.selected;
  const isOutside = date.getMonth() !== state.month;
  const hasContent = events.length > 0 || Boolean(entry.note.trim()) || entry.photos.length > 0;
  const preview = events.length
    ? `${events[0].time ? `${formatTime(events[0].time)} ` : ""}${events[0].title}`
    : entry.note.trim() || (holiday ? holiday.name : "");
  const more = events.length > 1 ? events.length - 1 : 0;
  const classes = [
    "day",
    isOutside ? "is-outside" : "",
    isToday ? "is-today" : "",
    isSelected ? "is-selected" : "",
    date.getDay() === 0 || date.getDay() === 6 ? "is-weekend" : "",
    hasContent ? "has-content" : ""
  ].filter(Boolean).join(" ");

  return `
    <button
      type="button"
      class="${classes}"
      data-action="select-day"
      data-date="${key}"
      aria-pressed="${isSelected ? "true" : "false"}"
      aria-label="${escapeHtml(dayLabel(date, entry, holiday, events, isToday, isOutside))}"
      ${isToday ? 'aria-current="date"' : ""}
    >
      <span class="day-top">
        <span class="num">${date.getDate()}</span>
        ${holiday ? `<span class="badge" title="${escapeHtml(holiday.name)}">${holiday.emoji}</span>` : ""}
      </span>
      <span class="preview-row">
        <span class="preview">${escapeHtml(preview)}</span>
        ${more ? `<span class="more">+${more}</span>` : ""}
      </span>
      <span class="pips">${pipsHtml(entry)}</span>
    </button>
  `;
}

function renderCalendar() {
  const stats = monthStats(state.month);
  dom.monthLabel.textContent = `${MONTHS[state.month]} 2026`;
  dom.monthSummary.textContent = statsLine(stats);
  dom.prev.disabled = state.month === 0;
  dom.next.disabled = state.month === 11;
  dom.grid.setAttribute("aria-label", `Days in ${MONTHS[state.month]} 2026`);
  dom.monthPills.innerHTML = MONTHS.map((name, index) => `
    <button
      type="button"
      class="month-pill${index === state.month ? " is-current" : ""}"
      data-action="go-month"
      data-month="${index}"
      aria-label="${name}"
      aria-pressed="${index === state.month ? "true" : "false"}"
    >${name.slice(0, 3)}</button>
  `).join("");
  dom.grid.innerHTML = buildCells(state.month).map(renderCell).join("");
}

function renderPlan(event) {
  return `
    <article class="plan${state.editingId === event.id ? " is-editing" : ""}">
      <div>
        <p class="plan-time">${escapeHtml(formatTime(event.time))}</p>
        <h4 class="plan-title">${escapeHtml(event.title)}</h4>
        ${event.detail ? `<p class="plan-detail">${escapeHtml(event.detail)}</p>` : ""}
      </div>
      <div class="plan-actions">
        <button type="button" class="ghost" data-action="edit-event" data-id="${escapeHtml(event.id)}" aria-label="Edit ${escapeHtml(event.title)}">Edit</button>
        <button type="button" class="ghost" data-action="delete-event" data-id="${escapeHtml(event.id)}" aria-label="Remove ${escapeHtml(event.title)}">Remove</button>
      </div>
    </article>
  `;
}

function renderPanel() {
  const date = fromKey(state.selected);
  const entry = getEntry(state.selected);
  const holiday = HOLIDAYS[state.selected];
  const editing = entry.events.find((event) => event.id === state.editingId) || null;
  if (state.editingId && !editing) state.editingId = null;
  const events = entry.events.slice().sort(compareEvents);
  const plansHtml = events.map(renderPlan).join("");
  const titleValue = editing ? escapeHtml(editing.title) : "";
  const timeValue = editing ? escapeHtml(editing.time) : "";
  const detailValue = editing ? escapeHtml(editing.detail) : "";
  const photosHtml = entry.photos.map((photo, index) => `
    <figure class="polaroid">
      <button type="button" class="photo-open" data-action="open-photo" data-id="${escapeHtml(photo.id)}" aria-label="View photo ${index + 1} of ${entry.photos.length}">
        <img src="${photo.dataUrl}" alt="" />
      </button>
      <button type="button" class="ghost photo-remove" data-action="delete-photo" data-id="${escapeHtml(photo.id)}" aria-label="Remove photo ${index + 1}">Remove</button>
    </figure>
  `).join("");

  dom.panel.setAttribute("aria-label", `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`);
  dom.panel.innerHTML = `
    <div class="panel-body">
      <header class="panel-head">
        <p class="panel-kicker">${WEEKDAYS[date.getDay()]}</p>
        <h2>${MONTHS[date.getMonth()]} ${date.getDate()}</h2>
        ${holiday ? `<p class="sticker-banner">${holiday.emoji} ${escapeHtml(holiday.name)}</p>` : ""}
        ${date.getMonth() !== state.month ? `<button type="button" class="ghost" data-action="show-month">Show ${MONTHS[date.getMonth()]}</button>` : ""}
      </header>

      <div class="block">
        <h3>Plans${events.length ? ` (${events.length})` : ""}</h3>
        ${plansHtml ? `<div class="plan-list">${plansHtml}</div>` : '<p class="empty-copy">No plans on this day yet.</p>'}
        <form id="event-form" class="event-form">
          <h3>${editing ? "Edit this plan" : "Add a plan"}</h3>
          <label class="field field-title">
            <span>What's happening?</span>
            <input name="planTitle" type="text" maxlength="80" required placeholder="Picnic, rehearsal, birthday..." value="${titleValue}" autocomplete="off" />
          </label>
          <label class="field field-time">
            <span>Time</span>
            <input name="planTime" type="time" value="${timeValue}" />
          </label>
          <label class="field field-detail">
            <span>Detail</span>
            <input name="planDetail" type="text" maxlength="240" placeholder="Optional" value="${detailValue}" autocomplete="off" />
          </label>
          <div class="form-actions">
            <button type="submit" class="primary">${editing ? "Save plan" : "Add plan"}</button>
            ${editing ? '<button type="button" class="ghost" data-action="cancel-edit">Cancel</button>' : ""}
          </div>
        </form>
      </div>

      <div class="block">
        <label class="sticky">
          <span class="sticky-label">Sticky note</span>
          <textarea id="day-note" maxlength="500" placeholder="A reminder, a list, a little thought...">${escapeHtml(entry.note)}</textarea>
        </label>
      </div>

      <div class="block">
        <h3>Photos (${entry.photos.length}/${MAX_PHOTOS})</h3>
        <label class="drop">
          <input id="photo-input" class="file-input" type="file" accept="image/*" multiple ${state.uploading ? "disabled" : ""} />
          <span class="drop-title">${state.uploading ? "Pinning..." : "Pin a photo"}</span>
          <span class="drop-help">${state.uploading ? "Hang on while the picture shrinks to fit." : "Click or drop images. Up to 6 per day."}</span>
        </label>
        ${photosHtml ? `<div class="photo-grid">${photosHtml}</div>` : ""}
      </div>
    </div>
  `;
}

function renderAgendaItem(key) {
  const date = fromKey(key);
  const entry = state.store[key];
  const events = entry.events.slice().sort(compareEvents);
  const eventHtml = events.map((event) => `
    <li>
      <span class="when">${escapeHtml(formatTime(event.time))}</span>
      <span class="what">${escapeHtml(event.title)}</span>
      ${event.detail ? `<span class="extra">${escapeHtml(event.detail)}</span>` : ""}
    </li>
  `).join("");
  const noteHtml = entry.note.trim()
    ? `<p class="agenda-note"><span>Note</span>${escapeHtml(entry.note.trim())}</p>`
    : "";
  const photoHtml = entry.photos.map((photo, index) => `
    <button type="button" class="thumb" data-action="open-photo" data-id="${escapeHtml(photo.id)}" aria-label="Open photo ${index + 1} from ${MONTHS[date.getMonth()]} ${date.getDate()}">
      <img src="${photo.dataUrl}" alt="" />
    </button>
  `).join("");

  return `
    <article class="agenda-item${key === state.selected ? " is-current" : ""}">
      <button type="button" class="date-stamp" data-action="select-day" data-date="${key}" aria-label="Open ${MONTHS[date.getMonth()]} ${date.getDate()}">
        <span class="stamp-wd">${WEEKDAYS[date.getDay()].slice(0, 3)}</span>
        <span class="stamp-num">${date.getDate()}</span>
      </button>
      <div>
        ${eventHtml ? `<ul class="agenda-plans">${eventHtml}</ul>` : ""}
        ${noteHtml}
        ${photoHtml ? `<div class="agenda-photos">${photoHtml}</div>` : ""}
      </div>
    </article>
  `;
}

function renderAgenda() {
  const stats = monthStats(state.month);
  dom.agendaTitle.textContent = `${MONTHS[state.month]} schedule`;
  dom.agendaCount.textContent = statsLine(stats);
  const keys = monthKeys(state.month);
  if (!keys.length) {
    dom.agendaList.innerHTML = `
      <div class="agenda-empty">
        <div class="empty-sticker" aria-hidden="true">🌞</div>
        <p>Nothing saved in ${MONTHS[state.month]} yet.</p>
        <p class="empty-copy">Pick a day and add a plan, a note, or a photo.</p>
      </div>
    `;
    return;
  }
  dom.agendaList.innerHTML = keys.map(renderAgendaItem).join("");
}

function render() {
  document.title = `${MONTHS[state.month]} 2026 · Sunny Days`;
  renderCalendar();
  renderPanel();
  renderAgenda();
}

function shiftMonth(delta) {
  const next = state.month + delta;
  if (next < 0 || next > 11) return;
  state.month = next;
  render();
}

function goToday() {
  const now = new Date();
  state.editingId = null;
  if (now.getFullYear() === YEAR) {
    state.month = now.getMonth();
    state.selected = toKey(now);
  } else {
    state.month = 0;
    state.selected = "2026-01-01";
    toast("Showing January 2026.");
  }
  render();
}

function selectDay(key) {
  const date = fromKey(key);
  if (date.getFullYear() !== YEAR) return;
  const shouldScroll = state.selected !== key && window.matchMedia("(max-width: 900px)").matches;
  state.selected = key;
  state.month = date.getMonth();
  state.editingId = null;
  render();
  if (shouldScroll) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    dom.panel.scrollIntoView({ behavior, block: "start" });
  }
}

function saveNote(value) {
  const key = state.selected;
  if (!state.store[key] && !value.trim()) return;
  const entry = ensureEntry(key);
  entry.note = value.slice(0, 500);
  if (isBlank(entry)) delete state.store[key];
  if (!persist()) {
    render();
    return;
  }
  renderCalendar();
  renderAgenda();
}

function saveEvent(form) {
  const title = form.elements.planTitle.value.trim();
  const time = normalizeTime(form.elements.planTime.value);
  const detail = form.elements.planDetail.value.trim();
  if (!title) {
    toast("Give the plan a name first.");
    form.elements.planTitle.focus();
    return;
  }

  const wasEditing = Boolean(state.editingId);
  const entry = ensureEntry(state.selected);
  if (wasEditing) {
    const event = entry.events.find((item) => item.id === state.editingId);
    if (!event) {
      state.editingId = null;
      renderPanel();
      return;
    }
    event.title = title.slice(0, 80);
    event.time = time;
    event.detail = detail.slice(0, 240);
    state.editingId = null;
  } else {
    entry.events.push({
      id: uid(),
      title: title.slice(0, 80),
      time,
      detail: detail.slice(0, 240)
    });
  }
  entry.events.sort(compareEvents);

  if (!persist()) {
    render();
    return;
  }
  toast(wasEditing ? "Plan saved." : "Plan added.");
  render();
}

function deleteEvent(id) {
  const entry = state.store[state.selected];
  if (!entry) return;
  entry.events = entry.events.filter((event) => event.id !== id);
  if (state.editingId === id) state.editingId = null;
  if (isBlank(entry)) delete state.store[state.selected];
  if (!persist()) {
    render();
    return;
  }
  toast("Plan removed.");
  render();
}

function deletePhoto(id) {
  const entry = state.store[state.selected];
  if (!entry) return;
  entry.photos = entry.photos.filter((photo) => photo.id !== id);
  if (isBlank(entry)) delete state.store[state.selected];
  if (!persist()) {
    render();
    return;
  }
  toast("Photo removed.");
  render();
}

function findPhoto(id) {
  const lists = Object.values(state.store);
  for (let index = 0; index < lists.length; index += 1) {
    const photo = lists[index].photos.find((item) => item.id === id);
    if (photo) return photo;
  }
  return null;
}

function openLightbox(id) {
  const photo = findPhoto(id);
  if (!photo) return;
  lastFocus = document.activeElement;
  dom.lightboxImg.src = photo.dataUrl;
  dom.lightboxImg.alt = photo.name || "Pinned photo";
  dom.lightboxCaption.textContent = photo.name && photo.name !== "photo" ? photo.name : "";
  dom.lightbox.hidden = false;
  document.body.classList.add("lightbox-open");
  const closeButton = dom.lightbox.querySelector(".lightbox-close");
  if (closeButton) closeButton.focus();
}

function closeLightbox() {
  if (dom.lightbox.hidden) return;
  dom.lightbox.hidden = true;
  dom.lightboxImg.removeAttribute("src");
  dom.lightboxCaption.textContent = "";
  document.body.classList.remove("lightbox-open");
  if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
}

function drawToJpeg(source) {
  const largest = Math.max(source.width, source.height) || 1;
  const scale = Math.min(1, 960 / largest);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  if (typeof source.close === "function") source.close();
  let quality = 0.72;
  let url = canvas.toDataURL("image/jpeg", quality);
  while (url.length > 280000 && quality > 0.45) {
    quality -= 0.08;
    url = canvas.toDataURL("image/jpeg", quality);
  }
  return url;
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    image.src = url;
  });
}

async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    return drawToJpeg(bitmap);
  } catch (error) {
    const image = await loadImageElement(file);
    return drawToJpeg(image);
  }
}

async function addPhotos(files) {
  const list = [...files];
  if (!list.length || state.uploading) {
    if (state.uploading) toast("Still pinning the last photo.");
    return;
  }

  const key = state.selected;
  const room = MAX_PHOTOS - getEntry(key).photos.length;
  if (room <= 0) {
    toast("This day already has 6 photos.");
    return;
  }

  state.uploading = true;
  renderPanel();
  let added = 0;
  let skipped = 0;

  for (let index = 0; index < list.length; index += 1) {
    const file = list[index];
    if (added >= room || !file.type.startsWith("image/") || file.size > MAX_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    try {
      const dataUrl = await compressImage(file);
      ensureEntry(key).photos.push({
        id: uid(),
        name: file.name || "photo",
        dataUrl
      });
      added += 1;
    } catch (error) {
      skipped += 1;
    }
  }

  state.uploading = false;
  if (added && !persist()) {
    render();
    return;
  }
  if (!added) toast("Those files could not be pinned. Try a smaller image.");
  else if (skipped) toast(`Pinned ${plural(added, "photo")}. ${plural(skipped, "file")} skipped.`);
  else toast(`Pinned ${plural(added, "photo")}.`);
  render();
}

function hasFiles(event) {
  const types = event.dataTransfer && event.dataTransfer.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

function onClick(event) {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const action = trigger.dataset.action;
  if (action === "select-day") selectDay(trigger.dataset.date);
  if (action === "go-month") {
    const month = Number(trigger.dataset.month);
    if (month >= 0 && month <= 11) {
      state.month = month;
      render();
    }
  }
  if (action === "show-month") {
    state.month = fromKey(state.selected).getMonth();
    render();
  }
  if (action === "edit-event") {
    state.editingId = trigger.dataset.id;
    renderPanel();
    const input = dom.panel.querySelector("[name=planTitle]");
    if (input) {
      input.focus();
      input.select();
    }
  }
  if (action === "cancel-edit") {
    state.editingId = null;
    renderPanel();
  }
  if (action === "delete-event") deleteEvent(trigger.dataset.id);
  if (action === "delete-photo") deletePhoto(trigger.dataset.id);
  if (action === "open-photo") openLightbox(trigger.dataset.id);
  if (action === "close-lightbox") closeLightbox();
}

function onSubmit(event) {
  if (event.target.id !== "event-form") return;
  event.preventDefault();
  saveEvent(event.target);
}

function onNoteInput(event) {
  if (event.target.id !== "day-note") return;
  saveNote(event.target.value);
}

function onFileChange(event) {
  if (event.target.id !== "photo-input") return;
  const files = [...event.target.files];
  event.target.value = "";
  addPhotos(files);
}

function onDragOver(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  const zone = event.target.closest(".drop");
  document.querySelectorAll(".drop.is-drag").forEach((element) => {
    if (element !== zone) element.classList.remove("is-drag");
  });
  if (zone) zone.classList.add("is-drag");
}

function onDragLeave(event) {
  const zone = event.target.closest(".drop");
  if (!zone || zone.contains(event.relatedTarget)) return;
  zone.classList.remove("is-drag");
}

function onDrop(event) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  document.querySelectorAll(".drop.is-drag").forEach((element) => element.classList.remove("is-drag"));
  if (!event.target.closest(".drop")) return;
  addPhotos([...event.dataTransfer.files]);
}

function onKeyDown(event) {
  if (event.key === "Escape") {
    closeLightbox();
    if (state.editingId) {
      state.editingId = null;
      renderPanel();
    }
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest("input, textarea")) return;
  if (!dom.lightbox.hidden) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    shiftMonth(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    shiftMonth(1);
  }
}

function init() {
  state.store = loadStore();
  state.saved = JSON.stringify(state.store);
  dom.prev.addEventListener("click", () => shiftMonth(-1));
  dom.next.addEventListener("click", () => shiftMonth(1));
  dom.today.addEventListener("click", goToday);
  document.body.addEventListener("click", onClick);
  document.body.addEventListener("submit", onSubmit);
  document.body.addEventListener("input", onNoteInput);
  document.body.addEventListener("change", onFileChange);
  document.body.addEventListener("dragover", onDragOver);
  document.body.addEventListener("dragleave", onDragLeave);
  document.body.addEventListener("drop", onDrop);
  document.addEventListener("keydown", onKeyDown);
  dom.lightbox.addEventListener("click", (event) => {
    if (event.target === dom.lightbox) closeLightbox();
  });
  render();
}

init();
