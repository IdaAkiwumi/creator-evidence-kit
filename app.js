"use strict";

const $ = id => document.getElementById(id);

/* ================================================================
   Creator Evidence Kit
   ================================================================ */

const SCHEMA_NAME = "creator-evidence-kit";
const SCHEMA_VERSION = 2;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 20;
const THEME_KEY = "creator_evidence_kit_theme";
const EVIDENCE_DRAFT_KEY = "creator_evidence_kit_evidence_draft_v1";
const EVIDENCE_LIBRARY_KEY = "creator_evidence_kit_evidence_library_v1";
const DEFAULT_CREATOR_KEY = "creator_evidence_kit_default_creator_v1";
const EVIDENCE_EXPORT_SCHEMA = "creator-evidence-kit-evidence";
const SITE_TITLE = "Creator Evidence Kit";

const THUMBNAIL_MAX_DIMENSION = 400;
const THUMBNAIL_JPEG_QUALITY = 0.6;
const AHASH_SIMILARITY_THRESHOLD = 8;
const AHASH_DUPLICATE_THRESHOLD = 4;

const LICENSING_LABELS = {
  undecided: "Undecided",
  not_available: "Not available for AI licensing",
  contact_me: "Contact me about AI licensing"
};

const EVIDENCE_CATEGORIES = {
  creator_declaration: "Creator declaration",
  dataset_index_reference: "Dataset index reference",
  company_acknowledgment: "Company acknowledgment",
  other_source: "Other source"
};

/* ---------- State ---------- */
let works = [];
let editingWorkId = null;
let hasUnsavedChanges = false;
let defaultCreator = "";

let selectedImages = [];
let primaryImageIndex = 0;
let existingImagesCleared = false;
let evidenceEntries = [];

let batchState = null;
let batchProcessing = false;

let selectedWorkIds = new Set();

/* ---------- Toast ---------- */
let toastTimer = null;
function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ""; }, 3400);
}

/* ---------- Theme ---------- */
function getPreferredTheme() {
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

function applyTheme(theme, isUserAction = false) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = $("themeToggleBtn");
  const status = $("themeAriaStatus");
  if (btn) {
    btn.setAttribute("aria-checked", theme === "dark" ? "true" : "false");
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
  if (status) status.textContent = `Theme: ${theme === "dark" ? "Dark" : "Light"} mode.`;
  const meta = $("metaThemeColor");
  if (meta) meta.setAttribute("content", theme === "dark" ? "#12151c" : "#f4f6f9");
  if (isUserAction) showToast(`Switched to ${theme === "dark" ? "Dark" : "Light"} mode`);
}

function initThemeToggle() {
  const current = document.documentElement.getAttribute("data-theme") || getPreferredTheme();
  applyTheme(current, false);
  const btn = $("themeToggleBtn");
  if (btn) {
    btn.addEventListener("click", e => {
      const active = document.documentElement.getAttribute("data-theme") || "light";
      const clickedLight = Boolean(e.target.closest(".opt-light"));
      const clickedDark = Boolean(e.target.closest(".opt-dark"));
      let next;
      if (clickedLight && active !== "light") next = "light";
      else if (clickedDark && active !== "dark") next = "dark";
      else next = active === "dark" ? "light" : "dark";
      applyTheme(next, true);
    });
  }
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
      applyTheme(e.matches ? "dark" : "light", false);
    });
  }
}

/* ---------- Unsaved warning ---------- */
function markUnsaved() { hasUnsavedChanges = true; }
function markSaved() { hasUnsavedChanges = false; }

window.addEventListener("beforeunload", e => {
  if (hasUnsavedChanges && works.length > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ---------- Utility ---------- */
function generateId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}_${window.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isValidUrl(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch { return false; }
}

function escapeForCsv(value) {
  if (value === null || value === undefined) return "";
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
  if (/[",\n\r]/.test(str)) str = '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function todayLocalIso() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateForDisplay(dateStr) {
  if (!dateStr) return "Not provided";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return dateStr; }
}

function titleFromFilename(filename) {
  if (!filename) return "";
  const name = filename.replace(/\.[^/.]+$/, "");
  return name.replace(/[_-]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function sanitizeForFilename(str) {
  return String(str || "").trim()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function exifDateToIso(exifDate) {
  if (!exifDate || typeof exifDate !== "string") return "";
  const match = exifDate.match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return "";
}

/* ---------- Default creator persistence ---------- */
function loadDefaultCreator() {
  try { defaultCreator = localStorage.getItem(DEFAULT_CREATOR_KEY) || ""; }
  catch { defaultCreator = ""; }
}

function updateDefaultCreator(creator) {
  if (!creator || !creator.trim()) return;
  defaultCreator = creator.trim();
  try { localStorage.setItem(DEFAULT_CREATOR_KEY, defaultCreator); } catch {}
}

function detectDefaultCreatorFromWorks(list) {
  const counts = new Map();
  for (const w of list || []) {
    const c = (w.creator || "").trim();
    if (!c) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  let best = "", bestCount = 0;
  for (const [c, n] of counts) {
    if (n > bestCount) { best = c; bestCount = n; }
  }
  return best;
}

function buildExportFilename(ext) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const creator = sanitizeForFilename(
    defaultCreator ||
    (works[0] && works[0].creator) ||
    ""
  );
  const base = "creator-evidence-kit";
  if (creator) return `${base}-${creator}-${dateStr}.${ext}`;
  return `${base}-${dateStr}.${ext}`;
}

/* ---------- SHA-256 ---------- */
async function computeSha256(file) {
  if (!window.isSecureContext) throw new Error("This page is not in a secure context. Fingerprinting requires HTTPS or localhost.");
  if (!(window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === "function")) {
    throw new Error("This browser does not support the Web Crypto API needed for fingerprinting.");
  }
  const buffer = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Thumbnail + aHash ---------- */
function aHashFromImageElement(img) {
  try {
    const size = 8;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
      pixels.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    let hash = "";
    for (let i = 0; i < 64; i += 4) {
      let nibble = 0;
      for (let j = 0; j < 4; j++) {
        if (pixels[i + j] > avg) nibble |= (1 << j);
      }
      hash += nibble.toString(16);
    }
    return hash;
  } catch { return null; }
}

function aHashFromDataUrl(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(aHashFromImageElement(img));
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function hammingDistance(hex1, hex2) {
  if (!hex1 || !hex2 || hex1.length !== hex2.length) return 999;
  let dist = 0;
  for (let i = 0; i < hex1.length; i++) {
    let x = parseInt(hex1[i], 16) ^ parseInt(hex2[i], 16);
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
}

function imageThumbAndHash(file) {
  return new Promise(resolve => {
    let url = null;
    try { url = URL.createObjectURL(file); } catch { return resolve({ thumbnailDataUrl: null, aHash: null }); }
    const img = new Image();
    let settled = false;
    const finish = (thumb, hash) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { URL.revokeObjectURL(url); } catch {}
      resolve({ thumbnailDataUrl: thumb, aHash: hash });
    };
    const timer = setTimeout(() => finish(null, null), 5000);
    img.onload = () => {
      try {
        const nw = img.naturalWidth || img.width || 1;
        const nh = img.naturalHeight || img.height || 1;
        const ratio = Math.min(1, THUMBNAIL_MAX_DIMENSION / Math.max(nw, nh));
        const w = Math.max(1, Math.round(nw * ratio));
        const h = Math.max(1, Math.round(nh * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null, null);
        ctx.drawImage(img, 0, 0, w, h);
        let thumb = null;
        try { thumb = canvas.toDataURL("image/jpeg", THUMBNAIL_JPEG_QUALITY); }
        catch {
          try { thumb = canvas.toDataURL("image/png"); } catch { thumb = null; }
        }
        const hash = aHashFromImageElement(img);
        finish(thumb, hash);
      } catch { finish(null, null); }
    };
    img.onerror = () => finish(null, null);
    try { img.src = url; } catch { finish(null, null); }
  });
}

/* ---------- EXIF ---------- */
async function readImageMetadata(file) {
  const metadata = { title: null, creator: null, date: null, description: null, copyright: null, camera: null, software: null };
  if (window.exifr && typeof window.exifr.parse === "function") {
    try {
      const exif = await window.exifr.parse(file, {
        tiff: true, exif: true, xmp: true, icc: false,
        translateKeys: true, translateValues: true, reviveValues: true
      });
      if (exif) {
        const tag = (named, numeric) => {
          const v = exif[named] !== undefined ? exif[named] : exif[String(numeric)];
          return v === undefined || v === null ? null : v;
        };
        metadata.creator = tag("Artist", 315) || null;
        metadata.title = tag("Title", 269) || tag("title", 269) || null;
        metadata.description = tag("ImageDescription", 270) || tag("description", 270) || tag("Description", 270) || null;
        const exifDate = tag("DateTimeOriginal", 36867) || tag("DateTime", 306) || tag("CreateDate", 306) || tag("ModifyDate", 306) || null;
        if (exifDate) {
          if (exifDate instanceof Date) metadata.date = exifDate.toISOString().slice(0, 10);
          else if (typeof exifDate === "string") metadata.date = exifDateToIso(exifDate);
        }
        metadata.copyright = tag("Copyright", 33432) || null;
        const make = tag("Make", 271);
        const model = tag("Model", 272);
        metadata.camera = make && model ? `${make} ${model}`.trim() : (model || make || null);
        metadata.software = tag("Software", 305) || null;
      }
    } catch (err) { console.warn("EXIF reading failed: - app.js:346", err); }
  }
  if (!metadata.title) metadata.title = titleFromFilename(file.name);
  return metadata;
}

/* ---------- Media handling ---------- */
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "ogv"];

function isVideoFile(file) {
  if (file.type && file.type.startsWith("video/")) return true;
  const ext = (file.name || "").split(".").pop().toLowerCase();
  return !file.type && VIDEO_EXTENSIONS.includes(ext);
}

function isSupportedMediaFile(file) {
  if (file.type && file.type.startsWith("image/")) return true;
  if (file.type && file.type.startsWith("video/")) return true;
  if (!file.type) {
    const ext = (file.name || "").split(".").pop().toLowerCase();
    return ["jpg", "jpeg", "png", "webp", "gif", "tif", "tiff", "svg", ...VIDEO_EXTENSIONS].includes(ext);
  }
  return false;
}

function captureVideoThumbnail(file, timeoutMs = 4000) {
  return new Promise(resolve => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
    const finish = dataUrl => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(dataUrl);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.addEventListener("loadeddata", () => {
      const target = Number.isFinite(video.duration) && video.duration > 1
        ? Math.min(video.duration / 2, 1) : 0;
      video.currentTime = target;
    });
    video.addEventListener("seeked", () => {
      try {
        const scale = 320 / Math.max(video.videoWidth || 320, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((video.videoWidth || 320) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || 180) * scale));
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.7));
      } catch { finish(null); }
    });
    video.addEventListener("error", () => finish(null));
    video.src = objectUrl;
  });
}

async function processMediaFile(file) {
  const isVideo = isVideoFile(file);
  const sha256 = await computeSha256(file).catch(() => null);
  const exif = isVideo ? null : await readImageMetadata(file).catch(() => null);

  let thumbnail = null;
  let thumbnailDataUrl = null;
  let objectUrl = null;
  let aHash = null;

  if (isVideo) {
    thumbnail = await captureVideoThumbnail(file);
    thumbnailDataUrl = thumbnail;
    if (thumbnail) aHash = await aHashFromDataUrl(thumbnail);
  } else {
    objectUrl = URL.createObjectURL(file);
    const result = await imageThumbAndHash(file);
    thumbnailDataUrl = result.thumbnailDataUrl;
    aHash = result.aHash;
  }

  return {
    id: generateId("mf"),
    file,
    meta: {
      filename: file.name,
      byte_size: file.size,
      mime_type: file.type || "unknown",
      sha256,
      algorithm: "SHA-256"
    },
    exif,
    objectUrl,
    thumbnail,
    thumbnailDataUrl,
    aHash,
    isVideo,
    isPrimary: false
  };
}

/* ---------- Duplicate detection ---------- */
function buildExistingHashes(options = {}) {
  const excludeWorkId = options.excludeWorkId || null;
  const shas = new Set();
  const ahashEntries = [];
  for (const w of works) {
    if (excludeWorkId && w.id === excludeWorkId) continue;
    for (const img of (w.images || [])) {
      if (img.sha256) shas.add(img.sha256);
      if (img.ahash) {
        ahashEntries.push({ ahash: img.ahash, filename: img.filename || "", workTitle: w.title || "" });
      }
    }
  }
  return { shas, ahashEntries };
}

function buildCurrentSelectionHashes() {
  const shas = new Set();
  const ahashEntries = [];
  for (const img of selectedImages) {
    if (img.meta && img.meta.sha256) shas.add(img.meta.sha256);
    if (img.aHash) ahashEntries.push({ ahash: img.aHash, filename: img.meta?.filename || "" });
  }
  if (batchState) {
    for (const g of batchState.groups) {
      for (const f of g.files) {
        if (f.meta && f.meta.sha256) shas.add(f.meta.sha256);
        if (f.aHash) ahashEntries.push({ ahash: f.aHash, filename: f.meta?.filename || "" });
      }
    }
  }
  return { shas, ahashEntries };
}

function findDuplicatesAndSimilar(processed, options = {}) {
  const existing = buildExistingHashes({ excludeWorkId: options.excludeWorkId });
  const current = buildCurrentSelectionHashes();

  const exact = [];
  const similar = [];
  const seenInUpload = new Set();

  for (const p of processed) {
    if (!p.meta || !p.meta.sha256) continue;

    if (existing.shas.has(p.meta.sha256)) {
      exact.push({ file: p, where: "collection" });
      continue;
    }
    if (current.shas.has(p.meta.sha256)) {
      exact.push({ file: p, where: "selection" });
      continue;
    }
    if (seenInUpload.has(p.meta.sha256)) {
      exact.push({ file: p, where: "upload" });
      continue;
    }
    seenInUpload.add(p.meta.sha256);

    if (p.aHash) {
      let matched = false;
      for (const entry of existing.ahashEntries) {
        if (hammingDistance(p.aHash, entry.ahash) <= AHASH_DUPLICATE_THRESHOLD) {
          similar.push({ file: p, match: entry, where: "collection" });
          matched = true;
          break;
        }
      }
      if (matched) continue;
      for (const entry of current.ahashEntries) {
        if (hammingDistance(p.aHash, entry.ahash) <= AHASH_DUPLICATE_THRESHOLD) {
          similar.push({ file: p, match: entry, where: "selection" });
          break;
        }
      }
    }
  }
  return { exact, similar };
}

function describeWhere(where) {
  if (where === "collection") return "already in your collection";
  if (where === "selection") return "already selected";
  if (where === "upload") return "duplicate in this upload";
  return "";
}

function confirmSkipExactDuplicates(exact) {
  if (!exact || exact.length === 0) return false;
  const shown = exact.slice(0, 5).map(d =>
    `  • ${d.file.meta.filename} (${describeWhere(d.where)})`
  ).join("\n");
  const more = exact.length > 5 ? `\n  …and ${exact.length - 5} more` : "";
  const message =
    `${exact.length} file${exact.length === 1 ? "" : "s"} appear to already exist:\n\n` +
    `${shown}${more}\n\n` +
    `Click OK to skip ${exact.length === 1 ? "it" : "them"}.\n` +
    `Click Cancel to include ${exact.length === 1 ? "it" : "them"} anyway.`;
  return window.confirm(message);
}

function notifySimilar(similar) {
  if (!similar || similar.length === 0) return;
  const count = similar.length;
  const firstName = similar[0].file.meta.filename;
  const firstMatch = similar[0].match?.filename || "";
  if (count === 1) {
    showToast(`"${firstName}" looks visually similar to ${firstMatch ? `"${firstMatch}"` : "an existing file"}. Review before saving.`);
  } else {
    showToast(`${count} files look visually similar to existing records. Review before saving.`);
  }
}

/* ---------- Single-work selection ---------- */
async function handleImageSelection(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;
  if (files.length > MAX_FILES) {
    showToast(`Too many files selected. Maximum is ${MAX_FILES} files per work.`);
    return;
  }
  const oversized = files.filter(f => f.size > MAX_FILE_BYTES);
  if (oversized.length > 0) showToast(`Some files are too large (over 50 MB). They were skipped.`);
  const notImages = files.filter(f => !isSupportedMediaFile(f));
  if (notImages.length > 0) showToast(`${notImages.length} unsupported ${notImages.length === 1 ? "file was" : "files were"} skipped.`);

  const validFiles = files.filter(f => f.size <= MAX_FILE_BYTES && isSupportedMediaFile(f));
  if (validFiles.length === 0) { resetImageSelection(); return; }

  const notice = $("autofillNotice");
  const noticeText = $("autofillText");
  if (notice) notice.hidden = false;

  existingImagesCleared = false;
  let processed = [];

  for (let i = 0; i < validFiles.length; i++) {
    if (noticeText) noticeText.textContent = `Processing file ${i + 1} of ${validFiles.length}…`;
    try {
      const p = await processMediaFile(validFiles[i]);
      processed.push(p);
    } catch (err) {
      console.warn(`Failed to process ${validFiles[i].name}: - app.js:596`, err);
    }
  }

  const { exact, similar } = findDuplicatesAndSimilar(processed, {
    excludeWorkId: editingWorkId || null
  });

  if (exact.length > 0) {
    const skip = confirmSkipExactDuplicates(exact);
    if (skip) {
      processed = processed.filter(p => !exact.some(d => d.file === p));
      showToast(`${exact.length} duplicate${exact.length === 1 ? "" : "s"} skipped.`);
    }
  }

  if (similar.length > 0) notifySimilar(similar);

  processed.forEach((p, i) => { p.isPrimary = i === 0; });
  selectedImages = processed;
  primaryImageIndex = 0;

  const existingWrap = $("existingImagesWrap");
  if (existingWrap) existingWrap.hidden = true;

  autoFillFromMetadata();
  renderThumbnails();

  const filledFields = getAutoFilledFields();
  const hasVideoOnly = selectedImages.length > 0 && selectedImages.every(img => img.isVideo);
  if (noticeText) {
    if (selectedImages.length === 0) {
      noticeText.textContent = "No files to add after duplicate check.";
    } else if (filledFields.length > 0) {
      noticeText.textContent = `Auto-filled from image metadata: ${filledFields.join(", ")}. Review and adjust as needed.`;
    } else if (hasVideoOnly) {
      noticeText.textContent = `Videos are attached with a fingerprint. Fill in the work details manually.`;
    } else {
      noticeText.textContent = `No metadata found in your images. Fill in the fields manually.`;
    }
  }

  markUnsaved();
  if (selectedImages.length > 0) showToast(`${selectedImages.length} file${selectedImages.length === 1 ? "" : "s"} added`);
}

function getAutoFilledFields() {
  const fields = [];
  if (selectedImages.length === 0) return fields;
  const primary = selectedImages[primaryImageIndex] || selectedImages[0];
  if (!primary || !primary.exif) return fields;
  const exif = primary.exif;
  const titleInput = $("workTitle");
  const creatorInput = $("workCreator");
  const dateInput = $("workDate");
  const descInput = $("workDescription");
  if (exif.title && titleInput && !titleInput.dataset.userEdited) fields.push("title");
  if (exif.creator && creatorInput && !creatorInput.dataset.userEdited) fields.push("creator");
  if (exif.date && dateInput && !dateInput.dataset.userEdited) fields.push("date");
  if (exif.description && descInput && !descInput.dataset.userEdited) fields.push("description");
  return fields;
}

function autoFillFromMetadata() {
  if (selectedImages.length === 0) return;
  const primary = selectedImages[primaryImageIndex] || selectedImages[0];
  if (!primary || !primary.exif) return;
  const exif = primary.exif;
  const titleInput = $("workTitle");
  if (exif.title && titleInput && !titleInput.dataset.userEdited) titleInput.value = exif.title;
  const creatorInput = $("workCreator");
  if (exif.creator && creatorInput && !creatorInput.dataset.userEdited) creatorInput.value = exif.creator;
  const dateInput = $("workDate");
  if (exif.date && dateInput && !dateInput.dataset.userEdited) dateInput.value = exif.date;
  const descInput = $("workDescription");
  if (exif.description && descInput && !descInput.dataset.userEdited) descInput.value = exif.description;
}

function renderThumbnails() {
  const wrap = $("thumbnailsWrap");
  const grid = $("thumbnailsGrid");
  if (!wrap || !grid) return;
  grid.replaceChildren();
  if (selectedImages.length === 0) { wrap.hidden = true; return; }
  wrap.hidden = false;

  selectedImages.forEach((img, index) => {
    const card = document.createElement("div");
    card.className = `thumbnail-card${index === primaryImageIndex ? " primary" : ""}${img.isVideo ? " video" : ""}${img.isVideo && !img.thumbnail ? " no-preview" : ""}`;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");

    const thumb = document.createElement("img");
    thumb.src = img.objectUrl || img.thumbnail || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%23d4d9e2'/%3E%3C/svg%3E";
    thumb.alt = img.meta.filename;
    thumb.loading = "lazy";
    card.appendChild(thumb);

    if (img.isVideo) {
      const b = document.createElement("span");
      b.className = "thumbnail-type"; b.textContent = "Video";
      card.appendChild(b);
    }
    if (index === primaryImageIndex) {
      const b = document.createElement("span");
      b.className = "thumbnail-badge"; b.textContent = "Primary";
      card.appendChild(b);
    }

    const name = document.createElement("span");
    name.className = "thumbnail-filename";
    name.textContent = img.meta.filename;
    name.title = img.meta.filename;
    card.appendChild(name);

    const fp = document.createElement("span");
    fp.className = "thumbnail-fingerprint";
    fp.textContent = img.meta.sha256 ? "✓ Fingerprinted" : "No fingerprint";
    card.appendChild(fp);

    const setPrimary = () => {
      if (primaryImageIndex !== index) {
        primaryImageIndex = index;
        selectedImages.forEach((img2, i) => { img2.isPrimary = i === index; });
        renderThumbnails();
        autoFillFromMetadata();
        showToast(`Primary file set to ${img.meta.filename}`);
      }
    };
    card.addEventListener("click", setPrimary);
    card.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrimary(); }
    });

    grid.appendChild(card);
  });
}

function renderExistingImages(work) {
  const wrap = $("existingImagesWrap");
  const grid = $("existingImagesGrid");
  if (!wrap || !grid) return;
  grid.replaceChildren();
  const images = (work && work.images) || [];
  if (images.length === 0 || existingImagesCleared) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const primaryIdx = Math.max(0, images.findIndex(img => img.is_primary));

  images.forEach((img, index) => {
    const card = document.createElement("div");
    card.className = `thumbnail-card${index === primaryIdx ? " primary" : ""}`;
    if (img.thumbnail_data_url) {
      const thumb = document.createElement("img");
      thumb.src = img.thumbnail_data_url;
      thumb.alt = `Saved preview of ${img.filename}`;
      thumb.loading = "lazy";
      card.appendChild(thumb);
    } else {
      const ph = document.createElement("div");
      ph.className = "thumbnail-placeholder";
      ph.textContent = "No preview stored with this export";
      card.appendChild(ph);
    }
    if (index === primaryIdx) {
      const b = document.createElement("span");
      b.className = "thumbnail-badge"; b.textContent = "Primary";
      card.appendChild(b);
    }
    const name = document.createElement("span");
    name.className = "thumbnail-filename";
    name.textContent = img.filename || "(unnamed)";
    card.appendChild(name);
    const fp = document.createElement("span");
    fp.className = "thumbnail-fingerprint";
    fp.textContent = img.sha256 ? "✓ Fingerprinted" : "";
    card.appendChild(fp);
    grid.appendChild(card);
  });
}

function resetImageSelection() {
  selectedImages.forEach(img => { if (img.objectUrl) URL.revokeObjectURL(img.objectUrl); });
  selectedImages = [];
  primaryImageIndex = 0;
  existingImagesCleared = false;
  const wrap = $("thumbnailsWrap");
  const notice = $("autofillNotice");
  const existingWrap = $("existingImagesWrap");
  const existingGrid = $("existingImagesGrid");
  if (wrap) wrap.hidden = true;
  if (notice) notice.hidden = true;
  if (existingWrap) existingWrap.hidden = true;
  if (existingGrid) existingGrid.replaceChildren();
  const input = $("workImages");
  if (input) input.value = "";
  ["workTitle", "workCreator", "workDate", "workDescription"].forEach(id => {
    const el = $(id);
    if (el) delete el.dataset.userEdited;
  });
}

/* ---------- Evidence ---------- */
function addEvidenceEntry(entry = null) {
  const id = entry && entry.id ? entry.id : generateId("ev");
  evidenceEntries.push({
    id,
    category: entry && entry.category ? entry.category : "creator_declaration",
    source_url: entry ? entry.source_url || "" : "",
    observed_at: entry ? entry.observed_at || "" : todayLocalIso(),
    entity: entry ? entry.entity || "" : "",
    notes: entry ? entry.notes || "" : ""
  });
  renderEvidenceEntries();
  scheduleEvidenceDraftSave();
}

function removeEvidenceEntry(id) {
  evidenceEntries = evidenceEntries.filter(e => e.id !== id);
  renderEvidenceEntries();
  scheduleEvidenceDraftSave();
}

function renderEvidenceEntries() {
  const container = $("evidenceContainer");
  if (!container) return;
  container.replaceChildren();
  evidenceEntries.forEach((entry, index) => {
    const card = document.createElement("div");
    card.className = "evidence-card";
    card.dataset.evidenceId = entry.id;

    const header = document.createElement("div");
    header.className = "evidence-header";
    const h4 = document.createElement("h4");
    h4.textContent = `Evidence ${index + 1}`;
    header.appendChild(h4);
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn danger small";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      removeEvidenceEntry(entry.id);
      showToast("Evidence entry removed");
    });
    header.appendChild(removeBtn);
    card.appendChild(header);

    const c1 = document.createElement("div");
    c1.className = "controls";
    const catLabel = document.createElement("label");
    catLabel.textContent = "Category";
    const catSelect = document.createElement("select");
    Object.entries(EVIDENCE_CATEGORIES).forEach(([val, label]) => {
      const opt = document.createElement("option");
      opt.value = val; opt.textContent = label;
      if (entry.category === val) opt.selected = true;
      catSelect.appendChild(opt);
    });
    catSelect.addEventListener("change", () => { entry.category = catSelect.value; scheduleEvidenceDraftSave(); });
    catLabel.appendChild(catSelect);
    c1.appendChild(catLabel);
    card.appendChild(c1);

    const c2 = document.createElement("div");
    c2.className = "controls";
    const urlLabel = document.createElement("label");
    urlLabel.textContent = "Source URL (optional)";
    const urlInput = document.createElement("input");
    urlInput.type = "url";
    urlInput.value = entry.source_url || "";
    urlInput.placeholder = "https://…";
    urlInput.addEventListener("input", () => { entry.source_url = urlInput.value.trim(); scheduleEvidenceDraftSave(); });
    urlLabel.appendChild(urlInput);
    c2.appendChild(urlLabel);

    const dateLabel = document.createElement("label");
    dateLabel.textContent = "Date observed (optional)";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = entry.observed_at || "";
    dateInput.addEventListener("input", () => { entry.observed_at = dateInput.value; scheduleEvidenceDraftSave(); });
    dateLabel.appendChild(dateInput);
    c2.appendChild(dateLabel);
    card.appendChild(c2);

    const c3 = document.createElement("div");
    c3.className = "controls";
    const entityLabel = document.createElement("label");
    entityLabel.textContent = "Dataset or company name (optional)";
    const entityInput = document.createElement("input");
    entityInput.type = "text";
    entityInput.value = entry.entity || "";
    entityInput.placeholder = "For example: LAION-5B, OpenAI";
    entityInput.addEventListener("input", () => { entry.entity = entityInput.value.trim(); scheduleEvidenceDraftSave(); });
    entityLabel.appendChild(entityInput);
    c3.appendChild(entityLabel);
    card.appendChild(c3);

    const c4 = document.createElement("div");
    c4.className = "controls";
    const notesLabel = document.createElement("label");
    notesLabel.textContent = "Notes (what does this source show?)";
    const notesTextarea = document.createElement("textarea");
    notesTextarea.value = entry.notes || "";
    notesTextarea.placeholder = "Describe what you observed at this source.";
    notesTextarea.addEventListener("input", () => { entry.notes = notesTextarea.value; scheduleEvidenceDraftSave(); });
    notesLabel.appendChild(notesTextarea);
    c4.appendChild(notesLabel);
    card.appendChild(c4);

    container.appendChild(card);
  });
}

let storageCheckResult = null;
function isStorageAvailable() {
  if (storageCheckResult === null) {
    try {
      const k = "__creator_evidence_kit_probe__";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      storageCheckResult = true;
    } catch { storageCheckResult = false; }
  }
  return storageCheckResult;
}

function buildEvidenceExport() {
  return {
    schema: EVIDENCE_EXPORT_SCHEMA, version: 1,
    entries: evidenceEntries.map(e => ({
      category: e.category || "other_source",
      source_url: e.source_url || "",
      observed_at: e.observed_at || "",
      entity: e.entity || "",
      notes: e.notes || ""
    }))
  };
}

function normalizeEvidenceJson(parsed) {
  let entries = null;
  if (Array.isArray(parsed)) entries = parsed;
  else if (parsed && typeof parsed === "object" && Array.isArray(parsed.entries)) {
    if (parsed.schema && parsed.schema !== EVIDENCE_EXPORT_SCHEMA) throw new Error("That JSON was not exported by the Copy evidence button.");
    entries = parsed.entries;
  } else {
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.works)) throw new Error("That is a full collection export. Use the Import JSON button at the top.");
    throw new Error("That does not look like saved evidence entries.");
  }
  return entries.map((e, i) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) throw new Error(`Entry ${i + 1} is not valid.`);
    if (e.category != null && !EVIDENCE_CATEGORIES[e.category]) throw new Error(`Entry ${i + 1} has an unknown category.`);
    const clean = { category: e.category || "other_source", source_url: "", observed_at: "", entity: "", notes: "" };
    ["source_url", "observed_at", "entity", "notes"].forEach(k => {
      if (e[k] != null && typeof e[k] !== "string") throw new Error(`Entry ${i + 1} has an invalid ${k}.`);
      clean[k] = e[k] || "";
    });
    if (clean.observed_at && !/^\d{4}-\d{2}-\d{2}$/.test(clean.observed_at)) throw new Error(`Entry ${i + 1} has an invalid date.`);
    if (clean.source_url && !isValidUrl(clean.source_url)) throw new Error(`Entry ${i + 1} has an invalid source URL.`);
    return clean;
  });
}

function extractFirstUrl(text) {
  const m = String(text).match(/https?:\/\/[^\s"'<>]+/i);
  if (!m) return "";
  return m[0].replace(/[.,;:)\]}]+$/, "");
}

function parsePlainTextEvidence(text) {
  return { category: "other_source", source_url: extractFirstUrl(text), observed_at: todayLocalIso(), entity: "", notes: text };
}

function parseEvidencePaste(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return { kind: "empty" };
  let parsed = null, looksLikeJson = true;
  try { parsed = JSON.parse(text); } catch { looksLikeJson = false; }
  if (looksLikeJson) {
    try {
      const entries = normalizeEvidenceJson(parsed);
      if (entries.length === 0) return { kind: "empty" };
      return { kind: "evidence", entries };
    } catch (err) { return { kind: "invalid", error: err.message }; }
  }
  return { kind: "text", entry: parsePlainTextEvidence(text) };
}

let evidenceDraftTimer = null;
function scheduleEvidenceDraftSave() {
  if (evidenceDraftTimer) clearTimeout(evidenceDraftTimer);
  evidenceDraftTimer = setTimeout(saveEvidenceDraft, 400);
}
let evidenceSaveFailed = false;

function saveEvidenceDraft() {
  if (!isStorageAvailable()) { updateEvidenceStorageStatus(); return; }
  try {
    if (evidenceEntries.length === 0) {
      window.localStorage.removeItem(EVIDENCE_DRAFT_KEY);
      evidenceSaveFailed = false;
    } else {
      const text = JSON.stringify(buildEvidenceExport());
      window.localStorage.setItem(EVIDENCE_DRAFT_KEY, text);
      evidenceSaveFailed = window.localStorage.getItem(EVIDENCE_DRAFT_KEY) !== text;
    }
  } catch { evidenceSaveFailed = true; }
  updateEvidenceStorageStatus();
}

function clearEvidenceDraft() {
  try { window.localStorage.removeItem(EVIDENCE_DRAFT_KEY); } catch {}
  updateEvidenceStorageStatus();
}

function restoreEvidenceDraft() {
  if (!isStorageAvailable()) return 0;
  try {
    const raw = window.localStorage.getItem(EVIDENCE_DRAFT_KEY);
    if (!raw) return 0;
    const entries = normalizeEvidenceJson(JSON.parse(raw));
    if (entries.length === 0) return 0;
    evidenceEntries = entries.map(e => ({ ...e, id: generateId("ev") }));
    return evidenceEntries.length;
  } catch { return 0; }
}

function evidenceContentKey(e) { return `${e.source_url || ""}|${e.entity || ""}|${e.notes || ""}`; }

function getEvidenceLibrary() {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(EVIDENCE_LIBRARY_KEY);
    if (!raw) return [];
    return normalizeEvidenceJson(JSON.parse(raw));
  } catch { return []; }
}

function addToEvidenceLibrary(entries) {
  if (!entries || entries.length === 0) return true;
  if (!isStorageAvailable()) return false;
  try {
    const library = getEvidenceLibrary();
    const seen = new Set(library.map(evidenceContentKey));
    entries.forEach(e => {
      const key = evidenceContentKey(e);
      if (key === "||") return;
      if (!seen.has(key)) { library.push(e); seen.add(key); }
    });
    const trimmed = library.slice(-100);
    window.localStorage.setItem(EVIDENCE_LIBRARY_KEY, JSON.stringify({ schema: EVIDENCE_EXPORT_SCHEMA, version: 1, entries: trimmed }));
    return true;
  } catch { evidenceSaveFailed = true; return false; }
}

function collectReusableEvidence() {
  const seen = new Set();
  const list = [];
  const push = e => {
    const key = evidenceContentKey(e);
    if (key === "||" || seen.has(key)) return;
    seen.add(key); list.push(e);
  };
  works.forEach(w => (w.evidence || []).forEach(push));
  getEvidenceLibrary().forEach(push);
  return list;
}

function renderReusePanel() {
  const panel = $("evidenceReusePanel");
  if (!panel || panel.hidden) return;
  panel.replaceChildren();
  const help = document.createElement("p");
  help.className = "reuse-help";
  help.textContent = "Adding an entry starts a new observation dated today.";
  panel.appendChild(help);
  const list = collectReusableEvidence();
  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No saved evidence yet.";
    panel.appendChild(empty);
    return;
  }
  list.slice(0, 20).forEach(e => {
    const item = document.createElement("div");
    item.className = "reuse-item";
    const label = document.createElement("div");
    label.className = "reuse-label";
    const cat = document.createElement("span");
    cat.className = "reuse-cat";
    cat.textContent = EVIDENCE_CATEGORIES[e.category] || "Other source";
    const main = document.createElement("span");
    main.className = "reuse-main";
    main.textContent = e.entity || e.source_url || (e.notes || "").slice(0, 80);
    label.appendChild(cat);
    label.appendChild(main);
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn small";
    addBtn.textContent = "Add";
    addBtn.addEventListener("click", () => {
      const { id, ...rest } = e;
      addEvidenceEntry({ ...rest, observed_at: todayLocalIso() });
      showToast("Evidence added with today's date.");
    });
    item.appendChild(label);
    item.appendChild(addBtn);
    panel.appendChild(item);
  });
}

async function copyEvidenceJson() {
  if (evidenceEntries.length === 0) { showToast("No evidence entries to copy yet."); return; }
  const text = JSON.stringify(buildEvidenceExport(), null, 2);
  let copied = false;
  let clipboardApi = null;
  try { clipboardApi = navigator.clipboard; } catch { clipboardApi = null; }
  if (clipboardApi && typeof clipboardApi.writeText === "function") {
    try { await clipboardApi.writeText(text); copied = true; } catch { copied = false; }
  }
  if (!copied) {
    try {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      copied = document.execCommand("copy");
      helper.remove();
    } catch { copied = false; }
  }
  if (copied) showToast("Evidence entries copied.");
  else showEvidenceCopyFallback(text);
}

function showEvidenceCopyFallback(text) {
  const wrap = $("evidenceCopyFallback");
  if (!wrap) { showToast("Could not copy automatically."); return; }
  wrap.hidden = false;
  const area = $("evidenceCopyFallbackText");
  if (area) { area.value = text; area.focus(); area.select(); }
  showToast("Clipboard was blocked. Select the text below and copy it manually.");
}

function handleEvidencePaste() {
  const box = $("evidencePasteBox");
  const status = $("evidencePasteStatus");
  if (!box) return;
  const result = parseEvidencePaste(box.value);
  if (status) { status.hidden = true; status.textContent = ""; }
  if (result.kind === "empty") { showToast("Paste a link, a note, or saved evidence first."); return; }
  if (result.kind === "invalid") {
    if (status) { status.textContent = `Could not use that paste: ${result.error} Nothing was changed.`; status.hidden = false; }
    return;
  }
  if (result.kind === "evidence") {
    result.entries.forEach(e => addEvidenceEntry(e));
    if (status) {
      status.textContent = `Restored ${result.entries.length} entries. Their dates were kept.`;
      status.hidden = false;
    }
    box.value = "";
    return;
  }
  addEvidenceEntry(result.entry);
  if (status) {
    status.textContent = "Added as an evidence entry dated today.";
    status.hidden = false;
  }
  box.value = "";
}

function parseWorkDetailsPaste(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return { url: "", description: "" };
  const url = extractFirstUrl(text);
  let description = text;
  if (url) {
    const lines = text.split("\n").filter(line => line.trim() !== url);
    description = lines.join("\n").trim();
  }
  return { url, description };
}

function handleWorkDetailsPaste() {
  const box = $("workDetailsPasteBox");
  const status = $("workDetailsPasteStatus");
  if (!box) return;
  const parsed = parseWorkDetailsPaste(box.value);
  if (status) { status.hidden = true; status.textContent = ""; }
  if (!parsed.url && !parsed.description) { showToast("Paste a description or a link first."); return; }
  const filled = [], skipped = [];
  const urlInput = $("workUrl");
  if (parsed.url && urlInput) {
    if (urlInput.value.trim() === "") {
      urlInput.value = parsed.url;
      urlInput.dispatchEvent(new Event("input"));
      filled.push("Publication URL");
    } else skipped.push("Publication URL (already filled)");
  }
  const descInput = $("workDescription");
  if (parsed.description && descInput) {
    if (descInput.value.trim() === "") {
      descInput.value = parsed.description;
      descInput.dataset.userEdited = "true";
      filled.push("Description");
    } else skipped.push("Description (already filled)");
  }
  if (filled.length === 0 && skipped.length > 0) {
    if (status) { status.textContent = `Nothing filled: ${skipped.join(" and ")} were left unchanged.`; status.hidden = false; }
    return;
  }
  if (status) {
    const parts = [`Filled: ${filled.join(" and ")}.`];
    if (skipped.length > 0) parts.push(`Left unchanged: ${skipped.join(" and ")}.`);
    status.textContent = parts.join(" ");
    status.hidden = false;
  }
  box.value = "";
}

function updateEvidenceStorageStatus() {
  const el = $("evidenceStorageStatus");
  if (!el) return;
  if (!isStorageAvailable()) { el.textContent = "Browser saving is unavailable here. Use Copy evidence to keep your entries."; return; }
  if (evidenceSaveFailed) { el.textContent = "Browser saving stopped working. Use Copy evidence or Export JSON to keep a copy."; return; }
  let draftCount = 0;
  try {
    const raw = window.localStorage.getItem(EVIDENCE_DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.entries)) draftCount = parsed.entries.length;
    }
  } catch {}
  el.textContent = draftCount > 0
    ? `Evidence entries are saved in this browser. ${draftCount} in your current draft.`
    : "Evidence entries you add are saved in this browser.";
}

function clearSavedEvidence() {
  try {
    window.localStorage.removeItem(EVIDENCE_DRAFT_KEY);
    window.localStorage.removeItem(EVIDENCE_LIBRARY_KEY);
  } catch {}
  updateEvidenceStorageStatus();
  const panel = $("evidenceReusePanel");
  if (panel && !panel.hidden) renderReusePanel();
  showToast("Saved evidence cleared from this browser");
}

/* ---------- Batch mode ---------- */
function stemForFilename(name) {
  if (!name) return "";
  let stem = name.replace(/\.[^.]+$/, "");
  stem = stem.replace(/[\s_\-.()\[\]]*(?:copy|final|edited|export|version|v)?\s*\d+\s*$/i, "");
  stem = stem.replace(/[\s_\-.()\[\]]+$/, "");
  return stem.trim().toLowerCase();
}

function suggestGroupTitle(files) {
  if (!files || files.length === 0) return "Untitled";
  if (files.length === 1) return titleFromFilename(files[0].meta.filename) || "Untitled";
  const stems = Array.from(new Set(files.map(f => stemForFilename(f.meta.filename)).filter(Boolean)));
  if (stems.length === 1) return titleFromFilename(stems[0] + ".jpg") || "Untitled";
  return titleFromFilename(files[0].meta.filename) || "Untitled";
}

function groupBatchFiles(processed) {
  const stemGroups = new Map();
  for (const f of processed) {
    const stem = stemForFilename(f.meta.filename);
    if (!stemGroups.has(stem)) stemGroups.set(stem, []);
    stemGroups.get(stem).push(f);
  }
  const groups = [];
  const singles = [];
  for (const [, files] of stemGroups) {
    if (files.length > 1) groups.push(files);
    else singles.push(files[0]);
  }
  const used = new Set();
  for (let i = 0; i < singles.length; i++) {
    if (used.has(i)) continue;
    const cluster = [singles[i]];
    used.add(i);
    if (singles[i].aHash) {
      for (let j = i + 1; j < singles.length; j++) {
        if (used.has(j) || !singles[j].aHash) continue;
        if (hammingDistance(singles[i].aHash, singles[j].aHash) <= AHASH_SIMILARITY_THRESHOLD) {
          cluster.push(singles[j]);
          used.add(j);
        }
      }
    }
    groups.push(cluster);
  }
  return groups;
}

function enterBatchMode() {
  const formSection = $("workFormSection");
  const batchSection = $("batchSection");
  if (formSection) formSection.hidden = true;
  if (batchSection) {
    batchSection.hidden = false;
    batchSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const batchImages = $("batchImages");
  if (batchImages) batchImages.value = "";
  const batchCreator = $("batchCreator");
  if (batchCreator) batchCreator.value = defaultCreator || "";
  const batchLicensing = $("batchLicensing");
  if (batchLicensing) batchLicensing.value = "not_available";
  const batchProgress = $("batchProgress");
  if (batchProgress) batchProgress.hidden = true;
  const batchSettings = $("batchSettings");
  if (batchSettings) batchSettings.hidden = true;
  const batchActions = $("batchActions");
  if (batchActions) batchActions.hidden = true;
  const batchMergeAll = $("batchMergeAllBtn");
  if (batchMergeAll) batchMergeAll.hidden = true;
  const batchActionsBar = $("batchActionsBar");
  if (batchActionsBar) batchActionsBar.hidden = true;
  const batchGroups = $("batchGroups");
  if (batchGroups) batchGroups.replaceChildren();
  batchState = { groups: [], selectedFileIds: new Set() };
  requestAnimationFrame(() => { if (batchImages) batchImages.focus(); });
}

function exitBatchMode() {
  if (batchState) {
    for (const g of batchState.groups) {
      for (const f of g.files) {
        if (f.objectUrl) URL.revokeObjectURL(f.objectUrl);
      }
    }
  }
  batchState = null;
  const formSection = $("workFormSection");
  const batchSection = $("batchSection");
  if (batchSection) batchSection.hidden = true;
  if (formSection) formSection.hidden = false;
  requestAnimationFrame(() => { if ($("formHeading")) $("formHeading").focus(); });
}

async function handleBatchFileSelection(fileList) {
  if (batchProcessing) return;
  const files = Array.from(fileList);
  if (files.length === 0) return;
  batchProcessing = true;

  const validFiles = files.filter(f => f.size <= MAX_FILE_BYTES && isSupportedMediaFile(f));
  const skipped = files.length - validFiles.length;
  if (skipped > 0) showToast(`${skipped} file${skipped === 1 ? " was" : "s were"} skipped.`);
  if (validFiles.length === 0) { batchProcessing = false; return; }

  const progress = $("batchProgress");
  const progressText = $("batchProgressText");
  if (progress) progress.hidden = false;

  let processed = [];
  for (let i = 0; i < validFiles.length; i++) {
    if (progressText) progressText.textContent = `Processing file ${i + 1} of ${validFiles.length}…`;
    try {
      const p = await processMediaFile(validFiles[i]);
      processed.push(p);
    } catch (err) { console.warn(`Failed to process ${validFiles[i].name}: - app.js:1366`, err); }
  }
  if (progress) progress.hidden = true;
  batchProcessing = false;

  if (processed.length === 0) { showToast("No files could be processed."); return; }

  const { exact, similar } = findDuplicatesAndSimilar(processed, { excludeWorkId: null });

  if (exact.length > 0) {
    const skip = confirmSkipExactDuplicates(exact);
    if (skip) {
      processed = processed.filter(p => !exact.some(d => d.file === p));
      showToast(`${exact.length} duplicate${exact.length === 1 ? "" : "s"} skipped.`);
    }
  }

  if (similar.length > 0) notifySimilar(similar);

  if (processed.length === 0) {
    showToast("All selected files were duplicates. Nothing new to add.");
    return;
  }

  const newGroups = groupBatchFiles(processed);
  if (!batchState) batchState = { groups: [], selectedFileIds: new Set() };
  if (!batchState.selectedFileIds) batchState.selectedFileIds = new Set();
  for (const g of newGroups) {
    batchState.groups.push({
      id: generateId("bg"),
      title: suggestGroupTitle(g),
      files: g
    });
  }

  const batchSettings = $("batchSettings");
  if (batchSettings) batchSettings.hidden = false;
  const batchActions = $("batchActions");
  if (batchActions) batchActions.hidden = false;
  const batchMergeAll = $("batchMergeAllBtn");
  if (batchMergeAll) batchMergeAll.hidden = batchState.groups.length <= 1;
  const batchImages = $("batchImages");
  if (batchImages) batchImages.value = "";

  renderBatchGroups();
}

function setFileSelected(fileId, selected) {
  if (!batchState) return;
  if (!batchState.selectedFileIds) batchState.selectedFileIds = new Set();
  if (selected) batchState.selectedFileIds.add(fileId);
  else batchState.selectedFileIds.delete(fileId);
  const checkbox = document.querySelector(`.batch-thumb-check[data-file-id="${CSS.escape(fileId)}"]`);
  if (checkbox) {
    const card = checkbox.closest(".batch-thumb");
    if (card) card.classList.toggle("selected", selected);
  }
  updateBatchActionsBar();
}

function countSelectedFiles() {
  if (!batchState || !batchState.selectedFileIds) return 0;
  const existing = new Set();
  for (const g of batchState.groups) for (const f of g.files) existing.add(f.id);
  let n = 0;
  for (const id of batchState.selectedFileIds) if (existing.has(id)) n++;
  return n;
}

function updateBatchActionsBar() {
  const bar = $("batchActionsBar");
  if (!bar) return;
  const count = countSelectedFiles();
  bar.hidden = count === 0;
  if (count === 0) return;

  const countEl = $("batchSelCount");
  if (countEl) countEl.textContent = `${count} file${count === 1 ? "" : "s"} selected`;

  const dropdown = $("batchMoveInto");
  if (dropdown) {
    const current = dropdown.value;
    dropdown.innerHTML = '<option value="">Move into…</option>';
    batchState.groups.forEach((g, idx) => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = `Work ${idx + 1} — ${g.title || "Untitled"}`;
      dropdown.appendChild(opt);
    });
    if (current && Array.from(dropdown.options).some(o => o.value === current)) {
      dropdown.value = current;
    }
  }
}

function extractSelectedToNewGroup() {
  if (!batchState) return;
  const ids = batchState.selectedFileIds;
  const count = countSelectedFiles();
  if (!count || !ids) return;

  const extracted = [];
  for (const g of batchState.groups) {
    g.files = g.files.filter(f => {
      if (ids.has(f.id)) { extracted.push(f); return false; }
      return true;
    });
  }
  batchState.groups = batchState.groups.filter(g => g.files.length > 0);

  if (extracted.length > 0) {
    batchState.groups.push({
      id: generateId("bg"),
      title: suggestGroupTitle(extracted),
      files: extracted
    });
  }
  ids.clear();
  renderBatchGroups();
  showToast(`Moved ${extracted.length} file${extracted.length === 1 ? "" : "s"} to a new work.`);
}

function moveSelectedInto(groupId) {
  if (!batchState || !groupId) return;
  const ids = batchState.selectedFileIds;
  const count = countSelectedFiles();
  if (!count || !ids) return;
  const target = batchState.groups.find(g => g.id === groupId);
  if (!target) return;

  const moved = [];
  for (const g of batchState.groups) {
    if (g === target) continue;
    g.files = g.files.filter(f => {
      if (ids.has(f.id)) { moved.push(f); return false; }
      return true;
    });
  }
  target.files.push(...moved);
  batchState.groups = batchState.groups.filter(g => g.files.length > 0);

  const previousTitle = target.title;
  if (!target.title || target.title === "Untitled") {
    target.title = suggestGroupTitle(target.files);
  }

  ids.clear();
  renderBatchGroups();
  if (moved.length > 0) {
    showToast(`Moved ${moved.length} file${moved.length === 1 ? "" : "s"} into "${previousTitle || target.title}".`);
  }
}

function removeSelectedFiles() {
  if (!batchState) return;
  const ids = batchState.selectedFileIds;
  const count = countSelectedFiles();
  if (!count || !ids) return;
  if (!window.confirm(`Remove ${count} file${count === 1 ? "" : "s"} from this batch? They will not be saved.`)) return;

  let removed = 0;
  for (const g of batchState.groups) {
    g.files = g.files.filter(f => {
      if (ids.has(f.id)) {
        if (f.objectUrl) URL.revokeObjectURL(f.objectUrl);
        removed++;
        return false;
      }
      return true;
    });
  }
  batchState.groups = batchState.groups.filter(g => g.files.length > 0);
  ids.clear();
  renderBatchGroups();
  showToast(`Removed ${removed} file${removed === 1 ? "" : "s"}.`);
}

function renderBatchGroups() {
  const container = $("batchGroups");
  if (!container) return;
  container.replaceChildren();

  const groups = (batchState && batchState.groups) || [];
  if (groups.length === 0) {
    const saveBtn = $("batchSaveBtn");
    if (saveBtn) { saveBtn.textContent = "Save 0 works"; saveBtn.disabled = true; }
    updateBatchActionsBar();
    return;
  }

  groups.forEach((group, gIdx) => {
    if (group.files.length === 0) return;
    const card = document.createElement("div");
    card.className = "batch-group";

    const header = document.createElement("div");
    header.className = "batch-group-header";

    const titleLabel = document.createElement("label");
    titleLabel.className = "batch-title-label";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = `Work ${gIdx + 1} title`;
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = group.title || "";
    titleInput.maxLength = 200;
    titleInput.className = "batch-title";
    titleInput.addEventListener("input", () => { group.title = titleInput.value; updateBatchSaveState(); });
    titleLabel.appendChild(titleSpan);
    titleLabel.appendChild(titleInput);
    header.appendChild(titleLabel);

    const actions = document.createElement("div");
    actions.className = "batch-group-actions";

    if (group.files.length > 1) {
      const splitBtn = document.createElement("button");
      splitBtn.type = "button";
      splitBtn.className = "btn ghost small";
      splitBtn.textContent = "Split into separate works";
      splitBtn.addEventListener("click", () => {
        const newGroups = group.files.map(f => ({
          id: generateId("bg"),
          title: titleFromFilename(f.meta.filename) || "Untitled",
          files: [f]
        }));
        batchState.groups.splice(gIdx, 1, ...newGroups);
        renderBatchGroups();
      });
      actions.appendChild(splitBtn);
    }

    if (groups.length > 1) {
      const mergeLabel = document.createElement("label");
      mergeLabel.className = "batch-merge";
      const mergeSpan = document.createElement("span");
      mergeSpan.textContent = "Merge into";
      const mergeSelect = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "—";
      mergeSelect.appendChild(blank);
      groups.forEach((_, otherIdx) => {
        if (otherIdx === gIdx) return;
        const opt = document.createElement("option");
        opt.value = String(otherIdx);
        opt.textContent = `Work ${otherIdx + 1}`;
        mergeSelect.appendChild(opt);
      });
      mergeSelect.addEventListener("change", () => {
        const targetIdx = parseInt(mergeSelect.value, 10);
        if (isNaN(targetIdx) || targetIdx === gIdx) return;
        const target = batchState.groups[targetIdx];
        if (!target) return;
        const suggestedBefore = suggestGroupTitle(group.files);
        target.files.push(...group.files);
        batchState.groups.splice(gIdx, 1);
        if (!target.title || target.title === suggestedBefore || target.title === "Untitled") {
          target.title = suggestGroupTitle(target.files);
        }
        renderBatchGroups();
        showToast(`Merged into Work ${targetIdx + 1}.`);
      });
      mergeLabel.appendChild(mergeSpan);
      mergeLabel.appendChild(mergeSelect);
      actions.appendChild(mergeLabel);
    }

    header.appendChild(actions);
    card.appendChild(header);

    const thumbs = document.createElement("div");
    thumbs.className = "batch-thumbs";

    group.files.forEach((file, fIdx) => {
      const thumbCard = document.createElement("div");
      thumbCard.className = "batch-thumb";
      if (batchState.selectedFileIds && batchState.selectedFileIds.has(file.id)) {
        thumbCard.classList.add("selected");
      }

      const thumbImg = document.createElement("img");
      thumbImg.src = file.objectUrl || file.thumbnail || file.thumbnailDataUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23d4d9e2'/%3E%3C/svg%3E";
      thumbImg.alt = file.meta.filename;
      thumbImg.loading = "lazy";
      thumbCard.appendChild(thumbImg);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "batch-thumb-check";
      checkbox.dataset.fileId = file.id;
      checkbox.checked = !!(batchState.selectedFileIds && batchState.selectedFileIds.has(file.id));
      checkbox.setAttribute("aria-label", `Select ${file.meta.filename}`);
      checkbox.addEventListener("click", (e) => e.stopPropagation());
      checkbox.addEventListener("change", () => {
        setFileSelected(file.id, checkbox.checked);
      });
      thumbCard.appendChild(checkbox);

      const nameEl = document.createElement("span");
      nameEl.className = "batch-thumb-name";
      nameEl.textContent = file.meta.filename;
      nameEl.title = file.meta.filename;
      thumbCard.appendChild(nameEl);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "batch-thumb-remove";
      removeBtn.setAttribute("aria-label", `Remove ${file.meta.filename}`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (file.objectUrl) URL.revokeObjectURL(file.objectUrl);
        if (batchState.selectedFileIds) batchState.selectedFileIds.delete(file.id);
        group.files.splice(fIdx, 1);
        if (group.files.length === 0) batchState.groups.splice(gIdx, 1);
        renderBatchGroups();
      });
      thumbCard.appendChild(removeBtn);

      thumbCard.addEventListener("click", () => {
        const newChecked = !checkbox.checked;
        checkbox.checked = newChecked;
        setFileSelected(file.id, newChecked);
      });

      thumbs.appendChild(thumbCard);
    });

    card.appendChild(thumbs);
    container.appendChild(card);
  });

  updateBatchActionsBar();
  updateBatchSaveState();
}

function updateBatchSaveState() {
  const saveBtn = $("batchSaveBtn");
  const hint = $("batchSaveHint");
  if (!saveBtn) return;
  const groups = batchState ? batchState.groups.filter(g => g.files.length > 0) : [];
  const count = groups.length;
  saveBtn.textContent = `Save ${count} work${count === 1 ? "" : "s"}`;
  const creator = ($("batchCreator")?.value || "").trim();
  const invalidGroups = groups.filter(g => !(g.title || "").trim() || !g.files.length);
  saveBtn.disabled = count === 0 || !creator || invalidGroups.length > 0;
  if (hint) {
    if (!creator) hint.textContent = "Enter a creator name to enable saving.";
    else if (invalidGroups.length > 0) hint.textContent = "Every work needs a title.";
    else hint.textContent = "";
  }
}

async function saveBatchWorks() {
  if (!batchState) return;
  const groups = batchState.groups.filter(g => g.files.length > 0);
  if (groups.length === 0) { showToast("No works to save."); return; }
  const creator = ($("batchCreator")?.value || "").trim();
  if (!creator) { showToast("Please enter the creator name."); $("batchCreator")?.focus(); return; }
  const licensing = $("batchLicensing")?.value || "not_available";
  const now = new Date().toISOString();
  const savedIds = [];

  for (const group of groups) {
    const files = group.files;
    const imagesForRecord = files.map((img, index) => ({
      ...img.meta,
      is_primary: index === 0,
      thumbnail_data_url: img.thumbnailDataUrl || img.thumbnail || null,
      ahash: img.aHash || null
    }));
    const title = (group.title || suggestGroupTitle(files)).trim() || "Untitled";
    const newWork = {
      id: generateId("w"),
      title, creator, description: "", url: "",
      date: todayLocalIso(), licensing,
      images: imagesForRecord, evidence: [],
      created_at: now, updated_at: now, is_sample: false
    };
    works.push(newWork);
    savedIds.push(newWork.id);
  }

  updateDefaultCreator(creator);
  markUnsaved();

  for (const g of batchState.groups) {
    for (const f of g.files) {
      if (f.objectUrl) URL.revokeObjectURL(f.objectUrl);
    }
  }
  batchState = null;

  const formSection = $("workFormSection");
  const batchSection = $("batchSection");
  if (batchSection) batchSection.hidden = true;
  if (formSection) formSection.hidden = false;

  renderCollection();
  updateSummaryBar();
  showToast(`Saved ${groups.length} work${groups.length === 1 ? "" : "s"} to your collection.`);

  requestAnimationFrame(() => {
    for (const id of savedIds) {
      const card = document.querySelector(`[data-work-id="${id}"]`);
      if (!card) continue;
      card.classList.add("card-flash");
      setTimeout(() => card.classList.remove("card-flash"), 1600);
    }
  });
}

/* ---------- Bulk edit / selection helpers ---------- */
function updateBulkBar() {
  const bar = $("collectionBulkBar");
  if (!bar) return;

  const existingIds = new Set(works.map(w => w.id));
  for (const id of Array.from(selectedWorkIds)) {
    if (!existingIds.has(id)) selectedWorkIds.delete(id);
  }

  const count = selectedWorkIds.size;
  bar.hidden = count === 0;

  const countEl = $("bulkCount");
  if (countEl) countEl.textContent = `${count} selected`;

  if (count === 0) {
    // Reset field values so the next selection starts fresh
    if ($("bulkCreator")) $("bulkCreator").value = "";
    if ($("bulkLicensing")) $("bulkLicensing").value = "";
    if ($("bulkEvidenceCategory")) $("bulkEvidenceCategory").value = "creator_declaration";
    if ($("bulkEvidenceUrl")) $("bulkEvidenceUrl").value = "";
    if ($("bulkEvidenceEntity")) $("bulkEvidenceEntity").value = "";
    if ($("bulkEvidenceNotes")) $("bulkEvidenceNotes").value = "";
    if ($("bulkApplyBtn")) $("bulkApplyBtn").disabled = true;

    // Collapse the evidence panel to keep the next open compact
    const details = document.querySelector(".bulk-evidence-details");
    if (details) details.open = false;
  } else {
    updateBulkApplyState();
  }
}

function updateSelectAllState() {
  const el = $("selectAllWorks");
  if (!el) return;
  const total = works.length;
  const selected = works.filter(w => selectedWorkIds.has(w.id)).length;
  el.checked = total > 0 && selected === total;
  el.indeterminate = selected > 0 && selected < total;
  el.disabled = total === 0;
}

function updateBulkApplyState() {
  const creatorVal = ($("bulkCreator")?.value || "").trim();
  const licensingVal = $("bulkLicensing")?.value || "";
  const btn = $("bulkApplyBtn");
  if (btn) btn.disabled = !creatorVal && !licensingVal;
}

function bulkApplyChanges() {
  if (selectedWorkIds.size === 0) return;
  const newCreator = ($("bulkCreator")?.value || "").trim();
  const newLicensing = $("bulkLicensing")?.value || "";
  if (!newCreator && !newLicensing) {
    showToast("Type a new creator name or pick a licensing option, then click Apply.");
    return;
  }

  const affectedIds = Array.from(selectedWorkIds);
  const wasEditing = editingWorkId && selectedWorkIds.has(editingWorkId);
  const count = affectedIds.length;
  const now = new Date().toISOString();

  works = works.map(w => {
    if (!selectedWorkIds.has(w.id)) return w;
    const patch = { updated_at: now };
    if (newCreator) patch.creator = newCreator;
    if (newLicensing) patch.licensing = newLicensing;
    return { ...w, ...patch };
  });

  if (newCreator) updateDefaultCreator(newCreator);

  if (wasEditing) {
    if (newCreator) {
      const creatorInput = $("workCreator");
      if (creatorInput) creatorInput.value = newCreator;
    }
    if (newLicensing) {
      const licensingSelect = $("workLicensing");
      if (licensingSelect) licensingSelect.value = newLicensing;
    }
  }

  markUnsaved();
  selectedWorkIds.clear();
  $("bulkCreator").value = "";
  $("bulkLicensing").value = "";
  renderCollection();
  updateSummaryBar();
  showToast(`Updated ${count} work${count === 1 ? "" : "s"}.`);

  requestAnimationFrame(() => {
    for (const id of affectedIds) {
      const card = document.querySelector(`[data-work-id="${id}"]`);
      if (!card) continue;
      card.classList.add("card-flash");
      setTimeout(() => card.classList.remove("card-flash"), 1600);
    }
  });
}

function bulkAddEvidenceToSelected() {
  if (selectedWorkIds.size === 0) return;

  const category = $("bulkEvidenceCategory")?.value || "creator_declaration";
  const sourceUrl = ($("bulkEvidenceUrl")?.value || "").trim();
  const entity = ($("bulkEvidenceEntity")?.value || "").trim();
  const notes = ($("bulkEvidenceNotes")?.value || "").trim();

  if (!sourceUrl && !entity && !notes) {
    showToast("Add at least a URL, entity, or note before adding evidence.");
    return;
  }
  if (sourceUrl && !isValidUrl(sourceUrl)) {
    showToast("Source URL must start with http:// or https://");
    return;
  }

  const affectedIds = Array.from(selectedWorkIds);
  const count = affectedIds.length;
  const now = new Date().toISOString();
  const observedAt = todayLocalIso();
  const newEntries = [];

  works = works.map(w => {
    if (!selectedWorkIds.has(w.id)) return w;
    const entry = {
      id: generateId("ev"),
      category,
      source_url: sourceUrl,
      observed_at: observedAt,
      entity,
      notes
    };
    newEntries.push(entry);
    return {
      ...w,
      evidence: [...(w.evidence || []), entry],
      updated_at: now
    };
  });

  // Refresh the form if the currently-edited work was in the selection
  if (editingWorkId && selectedWorkIds.has(editingWorkId)) {
    const updated = works.find(w => w.id === editingWorkId);
    if (updated) {
      evidenceEntries = (updated.evidence || []).map(e => ({ ...e }));
      renderEvidenceEntries();
    }
  }

  addToEvidenceLibrary(newEntries);

  markUnsaved();
  $("bulkEvidenceUrl").value = "";
  $("bulkEvidenceEntity").value = "";
  $("bulkEvidenceNotes").value = "";

  renderCollection();
  updateSummaryBar();
  showToast(`Added evidence to ${count} work${count === 1 ? "" : "s"}.`);

  requestAnimationFrame(() => {
    for (const id of affectedIds) {
      const card = document.querySelector(`[data-work-id="${id}"]`);
      if (!card) continue;
      card.classList.add("card-flash");
      setTimeout(() => card.classList.remove("card-flash"), 1600);
    }
  });
}

function bulkDeleteSelected() {
  if (selectedWorkIds.size === 0) return;
  const count = selectedWorkIds.size;
  if (!window.confirm(`Delete ${count} work${count === 1 ? "" : "s"}? This cannot be undone.`)) return;

  const wasEditing = editingWorkId && selectedWorkIds.has(editingWorkId);
  works = works.filter(w => !selectedWorkIds.has(w.id));
  if (wasEditing) clearForm();
  selectedWorkIds.clear();
  markUnsaved();
  renderCollection();
  updateSummaryBar();
  showToast(`Deleted ${count} work${count === 1 ? "" : "s"}.`);
}

function bulkClearSelection() {
  selectedWorkIds.clear();
  renderCollection();
}

/* ---------- Form handling ---------- */
function clearForm() {
  editingWorkId = null;
  evidenceEntries = [];
  existingImagesCleared = false;
  resetImageSelection();
  clearEvidenceDraft();

  const form = $("workForm");
  if (form) form.reset();

  const dateInput = $("workDate");
  if (dateInput) dateInput.value = todayLocalIso();

  const creatorInput = $("workCreator");
  if (creatorInput && defaultCreator) creatorInput.value = defaultCreator;

  ["workTitleError", "workCreatorError", "workUrlError"].forEach(id => {
    const el = $(id); if (el) el.hidden = true;
  });
  ["workTitle", "workCreator", "workUrl"].forEach(id => {
    const el = $(id); if (el) el.removeAttribute("aria-invalid");
  });

  renderEvidenceEntries();
  $("formHeading").textContent = "Add a work";
  $("submitWorkBtn").textContent = "Save work";
  $("cancelEditBtn").hidden = true;
}

function loadWorkIntoForm(work) {
  editingWorkId = work.id;
  evidenceEntries = (work.evidence || []).map(e => ({ ...e }));
  resetImageSelection();
  existingImagesCleared = false;

  $("workTitle").value = work.title;
  $("workCreator").value = work.creator;
  $("workDescription").value = work.description || "";
  $("workUrl").value = work.url || "";
  $("workDate").value = work.date || "";
  $("workLicensing").value = work.licensing;

  if (work.images && work.images.length > 0) {
    const notice = $("autofillNotice");
    const noticeText = $("autofillText");
    notice.hidden = false;
    noticeText.textContent = `This work has ${work.images.length} saved file${work.images.length === 1 ? "" : "s"}. Previews below. New files will replace them.`;
    $("thumbnailsWrap").hidden = true;
    renderExistingImages(work);
  }
  renderEvidenceEntries();
  $("formHeading").textContent = "Edit work";
  $("submitWorkBtn").textContent = "Update work";
  $("cancelEditBtn").hidden = false;
  $("workFormSection").scrollIntoView({ behavior: "smooth", block: "start" });
  $("workTitle").focus();
}

function validateForm() {
  let isValid = true;
  const errors = {};
  const title = $("workTitle").value.trim();
  const creator = $("workCreator").value.trim();
  const url = $("workUrl").value.trim();
  if (!title) { errors.title = "Please enter a title for this work."; isValid = false; }
  if (!creator) { errors.creator = "Please enter the creator or rights holder name."; isValid = false; }
  if (url && !isValidUrl(url)) { errors.url = "Please enter a valid URL starting with http:// or https://, or leave this field empty."; isValid = false; }

  const titleError = $("workTitleError");
  const creatorError = $("workCreatorError");
  const urlError = $("workUrlError");

  if (errors.title) { titleError.textContent = errors.title; titleError.hidden = false; $("workTitle").setAttribute("aria-invalid", "true"); }
  else { titleError.hidden = true; $("workTitle").removeAttribute("aria-invalid"); }
  if (errors.creator) { creatorError.textContent = errors.creator; creatorError.hidden = false; $("workCreator").setAttribute("aria-invalid", "true"); }
  else { creatorError.hidden = true; $("workCreator").removeAttribute("aria-invalid"); }
  if (errors.url) { urlError.textContent = errors.url; urlError.hidden = false; $("workUrl").setAttribute("aria-invalid", "true"); }
  else { urlError.hidden = true; $("workUrl").removeAttribute("aria-invalid"); }

  return isValid;
}

function handleFormSubmit(event) {
  event.preventDefault();
  if (!validateForm()) { showToast("Please fix the highlighted fields"); return; }
  const now = new Date().toISOString();

  let imagesForRecord;
  if (selectedImages.length > 0) {
    imagesForRecord = selectedImages.map((img, index) => ({
      ...img.meta,
      is_primary: index === primaryImageIndex,
      thumbnail_data_url: img.thumbnailDataUrl || img.thumbnail || null,
      ahash: img.aHash || null
    }));
  } else if (editingWorkId) {
    const existing = works.find(w => w.id === editingWorkId);
    imagesForRecord = existingImagesCleared ? [] : ((existing && existing.images) || []);
  } else imagesForRecord = [];

  const workData = {
    title: $("workTitle").value.trim(),
    creator: $("workCreator").value.trim(),
    description: $("workDescription").value.trim(),
    url: $("workUrl").value.trim(),
    date: $("workDate").value,
    licensing: $("workLicensing").value,
    images: imagesForRecord,
    evidence: evidenceEntries.map(e => ({ ...e }))
  };

  updateDefaultCreator(workData.creator);

  let savedWorkId = null;
  if (editingWorkId) {
    savedWorkId = editingWorkId;
    const index = works.findIndex(w => w.id === editingWorkId);
    if (index !== -1) {
      works[index] = { ...works[index], ...workData, updated_at: now };
      showToast("Work updated");
    }
  } else {
    const newWork = {
      id: generateId("w"), ...workData,
      created_at: now, updated_at: now, is_sample: false
    };
    works.push(newWork);
    savedWorkId = newWork.id;
    showToast("Work added to collection");
  }

  const librarySaved = addToEvidenceLibrary(workData.evidence);
  if (workData.evidence.length > 0 && !librarySaved && isStorageAvailable()) {
    showToast("Saved, but evidence was not kept for reuse in this browser. Use Export JSON to keep a copy.");
  }

  markUnsaved();
  clearForm();
  renderCollection();
  updateSummaryBar();

  if (savedWorkId) {
    requestAnimationFrame(() => {
      const card = document.querySelector(`[data-work-id="${savedWorkId}"]`);
      if (!card) return;
      card.classList.add("card-flash");
      setTimeout(() => card.classList.remove("card-flash"), 1600);
      try { card.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch {}
    });
  }
}

/* ---------- Collection rendering ---------- */
function renderCollection() {
  const grid = $("collectionGrid");
  const empty = $("collectionEmpty");
  if (!grid) return;
  grid.replaceChildren();

  if (works.length === 0) {
    if (empty) empty.hidden = false;
    updateBulkBar();
    updateSelectAllState();
    return;
  }
  if (empty) empty.hidden = true;

  works.forEach(work => {
    const card = document.createElement("article");
    card.className = "collection-card";
    if (selectedWorkIds.has(work.id)) card.classList.add("selected");
    card.dataset.workId = work.id;

    const header = document.createElement("div");
    header.className = "card-header";

    const checkLabel = document.createElement("label");
    checkLabel.className = "card-select";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedWorkIds.has(work.id);
    checkbox.setAttribute("aria-label", `Select "${work.title}"`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedWorkIds.add(work.id);
      else selectedWorkIds.delete(work.id);
      card.classList.toggle("selected", checkbox.checked);
      updateBulkBar();
      updateSelectAllState();
    });
    checkLabel.appendChild(checkbox);
    header.appendChild(checkLabel);

    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = work.title;
    header.appendChild(title);

    const sampleTag = document.createElement("span");
    sampleTag.className = "card-tag";
    sampleTag.textContent = work.is_sample ? "Example" : "Record";
    header.appendChild(sampleTag);
    card.appendChild(header);

    const imagesForPreview = work.images || [];
    const primaryImage = imagesForPreview.find(img => img.is_primary) || imagesForPreview[0];
    if (primaryImage && primaryImage.thumbnail_data_url) {
      const preview = document.createElement("img");
      preview.className = "card-preview";
      preview.src = primaryImage.thumbnail_data_url;
      preview.alt = `Preview of ${primaryImage.filename || "primary file"}`;
      preview.loading = "lazy";
      card.appendChild(preview);
    }

    const creator = document.createElement("p");
    creator.className = "card-creator";
    creator.textContent = work.creator;
    card.appendChild(creator);

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const licTag = document.createElement("span");
    licTag.className = "card-tag";
    licTag.textContent = LICENSING_LABELS[work.licensing] || work.licensing;
    meta.appendChild(licTag);
    if (work.evidence && work.evidence.length > 0) {
      const evTag = document.createElement("span");
      evTag.className = "card-tag evidence";
      evTag.textContent = `${work.evidence.length} evidence ${work.evidence.length === 1 ? "entry" : "entries"}`;
      meta.appendChild(evTag);
    }
    const imageCount = (work.images || []).length;
    if (imageCount > 0) {
      const fpTag = document.createElement("span");
      fpTag.className = "card-tag fingerprint";
      fpTag.textContent = imageCount === 1 ? "Fingerprint recorded" : `${imageCount} images fingerprinted`;
      meta.appendChild(fpTag);
    }
    card.appendChild(meta);

    if (primaryImage && primaryImage.sha256) {
      const fp = document.createElement("p");
      fp.className = "card-fingerprint";
      fp.textContent = `SHA-256: ${primaryImage.sha256}`;
      card.appendChild(fp);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn small";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => { loadWorkIntoForm(work); });
    actions.appendChild(editBtn);
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn danger small";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (window.confirm(`Delete "${work.title}"? This cannot be undone.`)) {
        works = works.filter(w => w.id !== work.id);
        if (editingWorkId === work.id) clearForm();
        selectedWorkIds.delete(work.id);
        markUnsaved();
        renderCollection();
        updateSummaryBar();
        showToast("Work deleted");
      }
    });
    actions.appendChild(deleteBtn);
    card.appendChild(actions);
    grid.appendChild(card);
  });

  updateBulkBar();
  updateSelectAllState();
}

function updateSummaryBar() {
  const totalWorks = works.length;
  const totalEvidence = works.reduce((sum, w) => sum + (w.evidence || []).length, 0);
  const totalFingerprints = works.reduce((sum, w) => sum + (w.images || []).filter(img => img.sha256).length, 0);
  $("hitWorks").textContent = totalWorks;
  $("hitEvidence").textContent = totalEvidence;
  $("hitFingerprints").textContent = totalFingerprints;
}

/* ---------- Export ---------- */
function buildExportPayload() {
  return {
    schema: SCHEMA_NAME, version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    site: SITE_TITLE,
    works: works.map(w => ({ ...w }))
  };
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportJson() {
  if (works.length === 0) { showToast("Nothing to export yet."); return; }
  const payload = buildExportPayload();
  const json = JSON.stringify(payload, null, 2);
  const filename = buildExportFilename("json");
  downloadFile(json, filename, "application/json");
  markSaved();
  showToast(`JSON exported: ${filename}`);
}

function exportCsv() {
  if (works.length === 0) { showToast("Nothing to export yet."); return; }
  const headers = ["Title","Creator","Description","Publication URL","Publication date","AI licensing preference","Image count","Primary image filename","Primary image SHA-256","Evidence count","Evidence categories"];
  const rows = [headers.map(h => escapeForCsv(h)).join(",")];
  works.forEach(work => {
    const images = work.images || [];
    const primaryImage = images.find(img => img.is_primary) || images[0];
    const cats = [...new Set((work.evidence || []).map(e => EVIDENCE_CATEGORIES[e.category] || e.category))].join("; ");
    const row = [work.title, work.creator, work.description || "", work.url || "", work.date || "",
      LICENSING_LABELS[work.licensing] || work.licensing, images.length,
      primaryImage ? primaryImage.filename : "", primaryImage ? primaryImage.sha256 : "",
      (work.evidence || []).length, cats];
    rows.push(row.map(cell => escapeForCsv(cell)).join(","));
  });
  const filename = buildExportFilename("csv");
  downloadFile("\uFEFF" + rows.join("\n"), filename, "text/csv;charset=utf-8");
  showToast(`CSV exported: ${filename}`);
}

/* ---------- Print ---------- */
function printReport() {
  if (works.length === 0) { showToast("Nothing to print yet."); return; }
  const report = $("printReport");
  report.replaceChildren();
  const h1 = document.createElement("h1");
  h1.textContent = "Creator Evidence Kit Report";
  report.appendChild(h1);
  const meta = document.createElement("p");
  meta.className = "print-meta";
  meta.textContent = `Generated ${new Date().toLocaleString("en-US")} · ${works.length} work${works.length === 1 ? "" : "s"}`;
  report.appendChild(meta);

  works.forEach(work => {
    const div = document.createElement("div");
    div.className = "print-work";
    const h2 = document.createElement("h2");
    h2.textContent = work.title;
    div.appendChild(h2);
    const addLine = (label, value) => {
      const p = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = label + ": ";
      p.appendChild(strong);
      p.appendChild(document.createTextNode(value || "Not provided"));
      div.appendChild(p);
    };
    addLine("Creator", work.creator);
    addLine("Description", work.description);
    addLine("Publication URL", work.url);
    addLine("Publication date", formatDateForDisplay(work.date));
    addLine("AI licensing preference", LICENSING_LABELS[work.licensing]);
    const images = work.images || [];
    if (images.length > 0) {
      addLine("Image count", String(images.length));
      const p = images.find(img => img.is_primary) || images[0];
      if (p) {
        addLine("Primary image filename", p.filename);
        const fpP = document.createElement("p");
        const fpStrong = document.createElement("strong");
        fpStrong.textContent = "SHA-256 fingerprint: ";
        fpP.appendChild(fpStrong);
        const code = document.createElement("code");
        code.textContent = p.sha256 || "Not calculated";
        fpP.appendChild(code);
        div.appendChild(fpP);
      }
    }
    if (work.evidence && work.evidence.length > 0) {
      const evDiv = document.createElement("div");
      evDiv.className = "print-evidence";
      const h = document.createElement("p");
      const s = document.createElement("strong");
      s.textContent = `Evidence entries (${work.evidence.length})`;
      h.appendChild(s); evDiv.appendChild(h);
      work.evidence.forEach((ev, i) => {
        const p = document.createElement("p");
        p.textContent = `${i + 1}. ${EVIDENCE_CATEGORIES[ev.category] || ev.category}` +
          (ev.entity ? ` — ${ev.entity}` : "") +
          (ev.source_url ? ` (Source: ${ev.source_url})` : "") +
          (ev.observed_at ? ` (Observed: ${ev.observed_at})` : "") +
          (ev.notes ? ` — ${ev.notes}` : "");
        evDiv.appendChild(p);
      });
      div.appendChild(evDiv);
    }
    report.appendChild(div);
  });
  window.print();
}

/* ---------- Import ---------- */
function validateImportPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("The file does not contain a valid JSON object.");
  if (payload.schema !== SCHEMA_NAME) throw new Error(`This file was not exported by Creator Evidence Kit.`);
  if (payload.version !== SCHEMA_VERSION) {
    if (payload.version === 1) normalizeV1Payload(payload);
    else throw new Error(`Unsupported file version ${payload.version}.`);
  }
  if (!Array.isArray(payload.works)) throw new Error("The file does not contain a valid works array.");
  payload.works.forEach((w, i) => {
    if (!w || typeof w !== "object") throw new Error(`Work at position ${i + 1} is not valid.`);
    if (typeof w.title !== "string" || !w.title.trim()) throw new Error(`Work at position ${i + 1} is missing a title.`);
    if (typeof w.creator !== "string" || !w.creator.trim()) throw new Error(`Work at position ${i + 1} is missing a creator name.`);
    if (w.licensing && !LICENSING_LABELS[w.licensing]) throw new Error(`Work at position ${i + 1} has an unknown licensing preference.`);
    if (w.evidence && !Array.isArray(w.evidence)) throw new Error(`Work at position ${i + 1} has an invalid evidence array.`);
    if (w.images && !Array.isArray(w.images)) throw new Error(`Work at position ${i + 1} has an invalid images array.`);
  });
  return true;
}

function normalizeV1Payload(payload) {
  payload.version = SCHEMA_VERSION;
  payload.works.forEach(w => {
    if (w.image && !w.images) w.images = [{ ...w.image, is_primary: true }];
    delete w.image;
  });
}

function handleImportFile(file) {
  const statusEl = $("importStatus");
  if (statusEl) { statusEl.className = "import-status"; statusEl.textContent = ""; }
  if (!file) return;
  if (file.size > 100 * 1024 * 1024) {
    if (statusEl) { statusEl.className = "import-status error"; statusEl.textContent = "File is too large. Import files should be under 100 MB."; }
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const payload = JSON.parse(e.target.result);
      validateImportPayload(payload);
      const incomingCount = payload.works.length;
      const hasExisting = works.length > 0;
      let mode;
      if (hasExisting) {
        mode = window.confirm(
          `You have ${works.length} existing work${works.length === 1 ? "" : "s"}.\n\n` +
          `The file contains ${incomingCount} work${incomingCount === 1 ? "" : "s"}.\n\n` +
          `Click OK to REPLACE your current collection with the imported records.\n` +
          `Click Cancel to keep both (MERGE).`
        ) ? "replace" : "merge";
      } else mode = "replace";

      if (mode === "replace") {
        works = payload.works.map(w => ({ ...w }));
        selectedWorkIds.clear();
      } else {
        const existingIds = new Set(works.map(w => w.id));
        let added = 0, skipped = 0;
        payload.works.forEach(w => {
          if (existingIds.has(w.id)) skipped++;
          else { works.push({ ...w }); added++; }
        });
        showToast(`Imported: ${added} added, ${skipped} skipped`);
      }

      const detected = detectDefaultCreatorFromWorks(works);
      if (detected) {
        updateDefaultCreator(detected);
        const creatorInput = $("workCreator");
        if (creatorInput) creatorInput.value = detected;
        const batchCreator = $("batchCreator");
        if (batchCreator) batchCreator.value = detected;
      }

      markUnsaved();
      clearForm();
      renderCollection();
      updateSummaryBar();

      if (statusEl) {
        statusEl.className = "import-status success";
        statusEl.textContent = `Successfully imported ${incomingCount} work${incomingCount === 1 ? "" : "s"} (${mode}). Image previews are shown on each record.` +
          (detected ? ` Creator pre-filled as "${detected}". Use the collection checkboxes to bulk-edit.` : "");
      }
    } catch (err) {
      if (statusEl) { statusEl.className = "import-status error"; statusEl.textContent = `Import failed: ${err.message} Your existing collection is unchanged.`; }
    }
  };
  reader.onerror = () => {
    if (statusEl) { statusEl.className = "import-status error"; statusEl.textContent = "Could not read the file. Please try again."; }
  };
  reader.readAsText(file);
}

/* ---------- Sample records ---------- */
function loadSampleRecords() {
  if (works.length > 0) {
    if (!window.confirm("This will REPLACE your current collection with clearly labeled example records. Continue?")) return;
  }
  const now = new Date().toISOString();
  works = [
    {
      id: generateId("w"),
      title: "Golden Hour Portrait (Example)",
      creator: "Example Artist",
      description: "A fictional example portrait photograph.",
      url: "https://example.com/portfolio/golden-hour",
      date: "2023-06-15",
      licensing: "not_available",
      images: [],
      evidence: [{
        id: generateId("ev"),
        category: "dataset_index_reference",
        source_url: "https://example.com/dataset-search",
        observed_at: "2025-01-10",
        entity: "Example Dataset Index",
        notes: "This is a fictional example. Replace with your own findings."
      }],
      created_at: now, updated_at: now, is_sample: true
    },
    {
      id: generateId("w"),
      title: "Chesapeake Bay Sunrise (Example)",
      creator: "Example Photographer",
      description: "A fictional example landscape photograph.",
      url: "", date: "2022-11-03", licensing: "contact_me",
      images: [],
      evidence: [{
        id: generateId("ev"),
        category: "creator_declaration",
        source_url: "",
        observed_at: "2025-02-20",
        entity: "",
        notes: "This is a fictional example. Replace with your own notes."
      }],
      created_at: now, updated_at: now, is_sample: true
    }
  ];
  selectedWorkIds.clear();
  markUnsaved();
  clearForm();
  renderCollection();
  updateSummaryBar();
  showToast("Example records loaded.");
}

/* ---------- Share menu ---------- */
function getShareUrl() {
  return location.origin + location.pathname;
}

function openShareMenu() {
  const shareBtn = $("shareBtn");
  const shareMenu = $("shareMenu");
  if (!shareBtn || !shareMenu) return;
  const url = getShareUrl();
  const title = document.title || "Creator Evidence Kit";
  const text = `Creator Evidence Kit — ${url}`;

  const setHref = (sel, href) => {
    const el = shareMenu.querySelector(sel);
    if (el) el.href = href;
  };
  setHref('[data-share="linkedin"]', `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`);
  setHref('[data-share="twitter"]', `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`);
  setHref('[data-share="bluesky"]', `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`);
  setHref('[data-share="facebook"]', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
  setHref('[data-share="email"]', `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`);

  shareMenu.hidden = false;
  shareBtn.setAttribute("aria-expanded", "true");
}

function closeShareMenu() {
  const shareBtn = $("shareBtn");
  const shareMenu = $("shareMenu");
  if (shareBtn) shareBtn.setAttribute("aria-expanded", "false");
  if (shareMenu) shareMenu.hidden = true;
}

async function copyAppLink() {
  const url = getShareUrl();
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      copied = true;
    }
  } catch {}
  if (!copied) {
    try {
      const helper = document.createElement("textarea");
      helper.value = url;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      copied = document.execCommand("copy");
      helper.remove();
    } catch {}
  }
  if (copied) showToast("Link copied to clipboard");
  else showToast("Could not copy. Your browser blocked clipboard access.");
}

function wireShareMenu() {
  const shareBtn = $("shareBtn");
  const shareMenu = $("shareMenu");
  if (!shareBtn || !shareMenu) return;

  shareBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = shareBtn.getAttribute("aria-expanded") === "true";
    if (isOpen) closeShareMenu();
    else openShareMenu();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".share-wrap")) closeShareMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeShareMenu();
  });

  shareMenu.querySelectorAll("[data-share]").forEach(el => {
    el.addEventListener("click", async (e) => {
      const type = el.dataset.share;
      if (type === "copy") {
        e.preventDefault();
        await copyAppLink();
        closeShareMenu();
      }
    });
  });
}

/* ---------- Event wiring ---------- */
function initEventListeners() {
  const form = $("workForm");
  if (form) {
    form.addEventListener("submit", handleFormSubmit);
    form.addEventListener("keydown", e => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        try { form.requestSubmit(); } catch { form.dispatchEvent(new Event("submit", { cancelable: true })); }
      }
    });
  }

  const imagesInput = $("workImages");
  if (imagesInput) imagesInput.addEventListener("change", e => {
    const files = e.target.files;
    if (files && files.length > 0) handleImageSelection(files);
  });

  const clearImagesBtn = $("clearImagesBtn");
  if (clearImagesBtn) clearImagesBtn.addEventListener("click", () => {
    selectedImages.forEach(img => { if (img.objectUrl) URL.revokeObjectURL(img.objectUrl); });
    selectedImages = [];
    primaryImageIndex = 0;
    const wrap = $("thumbnailsWrap");
    const notice = $("autofillNotice");
    const input = $("workImages");
    if (wrap) wrap.hidden = true;
    if (notice) notice.hidden = true;
    if (input) input.value = "";
    if (editingWorkId && !existingImagesCleared) {
      const work = works.find(w => w.id === editingWorkId);
      if (work && work.images && work.images.length > 0) {
        renderExistingImages(work);
        showToast("New selection removed. Saved files are still on this work.");
        return;
      }
    }
    showToast("All files removed");
  });

  const clearExistingBtn = $("clearExistingImagesBtn");
  if (clearExistingBtn) clearExistingBtn.addEventListener("click", () => {
    if (!editingWorkId) return;
    if (!window.confirm("Remove the saved files from this work? Their previews and fingerprints will be cleared when you save.")) return;
    existingImagesCleared = true;
    const wrap = $("existingImagesWrap");
    if (wrap) wrap.hidden = true;
    showToast("Saved files will be removed when you save the work");
  });

  ["workTitle", "workCreator", "workDate", "workDescription"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", () => { el.dataset.userEdited = "true"; });
  });

  const addEvidenceBtn = $("addEvidenceBtn");
  if (addEvidenceBtn) addEvidenceBtn.addEventListener("click", () => { addEvidenceEntry(); });
  const copyEvidenceBtn = $("copyEvidenceBtn");
  if (copyEvidenceBtn) copyEvidenceBtn.addEventListener("click", copyEvidenceJson);
  const copyFallbackClose = $("evidenceCopyFallbackClose");
  if (copyFallbackClose) copyFallbackClose.addEventListener("click", () => {
    const wrap = $("evidenceCopyFallback"); if (wrap) wrap.hidden = true;
  });
  const reuseEvidenceBtn = $("reuseEvidenceBtn");
  if (reuseEvidenceBtn) reuseEvidenceBtn.addEventListener("click", () => {
    const panel = $("evidenceReusePanel");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderReusePanel();
  });

  const workDetailsPasteBtn = $("workDetailsPasteBtn");
  if (workDetailsPasteBtn) workDetailsPasteBtn.addEventListener("click", handleWorkDetailsPaste);
  const workDetailsPasteBox = $("workDetailsPasteBox");
  if (workDetailsPasteBox) workDetailsPasteBox.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleWorkDetailsPaste(); }
  });

  const savingInfoBtn = $("savingInfoBtn");
  if (savingInfoBtn) {
    savingInfoBtn.addEventListener("click", () => {
      const expanded = savingInfoBtn.getAttribute("aria-expanded") === "true";
      savingInfoBtn.setAttribute("aria-expanded", String(!expanded));
      const tip = $("savingInfoTip");
      if (tip) tip.classList.toggle("open", !expanded);
    });
    savingInfoBtn.addEventListener("blur", () => {
      savingInfoBtn.setAttribute("aria-expanded", "false");
      const tip = $("savingInfoTip");
      if (tip) tip.classList.remove("open");
    });
  }

  const evidencePasteBtn = $("evidencePasteBtn");
  if (evidencePasteBtn) evidencePasteBtn.addEventListener("click", handleEvidencePaste);
  const evidencePasteBox = $("evidencePasteBox");
  if (evidencePasteBox) evidencePasteBox.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleEvidencePaste(); }
  });

  const clearSavedEvidenceBtn = $("clearSavedEvidenceBtn");
  if (clearSavedEvidenceBtn) clearSavedEvidenceBtn.addEventListener("click", () => {
    if (window.confirm("Clear saved evidence entries and the reuse list from this browser? Works in your collection are not affected.")) clearSavedEvidence();
  });

  const cancelEditBtn = $("cancelEditBtn");
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", () => { clearForm(); showToast("Edit cancelled"); });

  const startNewBtn = $("startNewWorkBtn");
  if (startNewBtn) startNewBtn.addEventListener("click", () => {
    clearForm();
    $("workFormSection").scrollIntoView({ behavior: "smooth", block: "start" });
    $("workImages").focus();
  });

  const startBatchBtn = $("startBatchBtn");
  if (startBatchBtn) startBatchBtn.addEventListener("click", enterBatchMode);
  const startBatchInlineBtn = $("startBatchInlineBtn");
  if (startBatchInlineBtn) startBatchInlineBtn.addEventListener("click", enterBatchMode);
  const batchCancelBtn = $("batchCancelBtn");
  if (batchCancelBtn) batchCancelBtn.addEventListener("click", exitBatchMode);
  const batchCancelBtn2 = $("batchCancelBtn2");
  if (batchCancelBtn2) batchCancelBtn2.addEventListener("click", exitBatchMode);
  const batchSaveBtn = $("batchSaveBtn");
  if (batchSaveBtn) batchSaveBtn.addEventListener("click", saveBatchWorks);

  const batchImages = $("batchImages");
  if (batchImages) batchImages.addEventListener("change", e => {
    const files = e.target.files;
    if (files && files.length > 0) handleBatchFileSelection(files);
  });

  const batchCreator = $("batchCreator");
  if (batchCreator) batchCreator.addEventListener("input", updateBatchSaveState);

  const batchMergeAllBtn = $("batchMergeAllBtn");
  if (batchMergeAllBtn) batchMergeAllBtn.addEventListener("click", () => {
    if (!batchState || batchState.groups.length <= 1) return;
    const files = [];
    for (const g of batchState.groups) files.push(...g.files);
    batchState.groups = [{
      id: generateId("bg"),
      title: suggestGroupTitle(files),
      files
    }];
    if (batchState.selectedFileIds) batchState.selectedFileIds.clear();
    renderBatchGroups();
    batchMergeAllBtn.hidden = true;
  });

  const batchExtractBtn = $("batchExtractBtn");
  if (batchExtractBtn) batchExtractBtn.addEventListener("click", extractSelectedToNewGroup);
  const batchMoveInto = $("batchMoveInto");
  if (batchMoveInto) {
    batchMoveInto.addEventListener("change", (e) => {
      const groupId = e.target.value;
      if (groupId) {
        moveSelectedInto(groupId);
        e.target.value = "";
      }
    });
  }
  const batchRemoveSelectedBtn = $("batchRemoveSelectedBtn");
  if (batchRemoveSelectedBtn) batchRemoveSelectedBtn.addEventListener("click", removeSelectedFiles);
  const batchClearSelBtn = $("batchClearSelBtn");
  if (batchClearSelBtn) batchClearSelBtn.addEventListener("click", () => {
    if (batchState && batchState.selectedFileIds) batchState.selectedFileIds.clear();
    renderBatchGroups();
  });

  // Bulk edit wiring
  const selectAllWorks = $("selectAllWorks");
  if (selectAllWorks) {
    selectAllWorks.addEventListener("change", (e) => {
      const checked = e.target.checked;
      selectedWorkIds.clear();
      if (checked) {
        works.forEach(w => selectedWorkIds.add(w.id));
      }
      renderCollection();
    });
  }

  const bulkCreator = $("bulkCreator");
  if (bulkCreator) bulkCreator.addEventListener("input", updateBulkApplyState);

  const bulkLicensing = $("bulkLicensing");
  if (bulkLicensing) bulkLicensing.addEventListener("change", updateBulkApplyState);

  const bulkApplyBtn = $("bulkApplyBtn");
  if (bulkApplyBtn) bulkApplyBtn.addEventListener("click", bulkApplyChanges);

  const bulkDeleteBtn = $("bulkDeleteBtn");
  if (bulkDeleteBtn) bulkDeleteBtn.addEventListener("click", bulkDeleteSelected);

  const bulkClearBtn = $("bulkClearBtn");
  if (bulkClearBtn) bulkClearBtn.addEventListener("click", bulkClearSelection);

  const bulkEvidenceAddBtn = $("bulkEvidenceAddBtn");
  if (bulkEvidenceAddBtn) bulkEvidenceAddBtn.addEventListener("click", bulkAddEvidenceToSelected);

  const loadSamplesBtn = $("loadSamplesBtn");
  if (loadSamplesBtn) loadSamplesBtn.addEventListener("click", loadSampleRecords);

  const exportJsonBtn = $("exportJsonBtn");
  if (exportJsonBtn) exportJsonBtn.addEventListener("click", exportJson);
  const exportCsvBtn = $("exportCsvBtn");
  if (exportCsvBtn) exportCsvBtn.addEventListener("click", exportCsv);
  const printBtn = $("printReportBtn");
  if (printBtn) printBtn.addEventListener("click", printReport);

  const importFile = $("importFile");
  if (importFile) importFile.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) { handleImportFile(file); importFile.value = ""; }
  });

  const urlInput = $("workUrl");
  if (urlInput) urlInput.addEventListener("blur", () => {
    const val = urlInput.value.trim();
    if (val && !isValidUrl(val)) {
      const err = $("workUrlError");
      err.textContent = "Please enter a URL starting with http:// or https://, or leave this field empty.";
      err.hidden = false;
      urlInput.setAttribute("aria-invalid", "true");
    } else {
      $("workUrlError").hidden = true;
      urlInput.removeAttribute("aria-invalid");
    }
  });

  wireShareMenu();
}

/* ---------- Boot ---------- */
function start() {
  initThemeToggle();
  initEventListeners();
  loadDefaultCreator();

  const dateInput = $("workDate");
  if (dateInput) dateInput.value = todayLocalIso();

  if (defaultCreator) {
    const creatorInput = $("workCreator");
    if (creatorInput) creatorInput.value = defaultCreator;
    const batchCreator = $("batchCreator");
    if (batchCreator) batchCreator.value = defaultCreator;
  }

  const restored = restoreEvidenceDraft();
  renderEvidenceEntries();
  updateEvidenceStorageStatus();
  const clearSavedEvidenceBtn = $("clearSavedEvidenceBtn");
  if (clearSavedEvidenceBtn && isStorageAvailable()) clearSavedEvidenceBtn.hidden = false;
  if (restored > 0) showToast(`Restored ${restored} evidence ${restored === 1 ? "entry" : "entries"} saved in this browser`);

  renderCollection();
  updateSummaryBar();

  if (!window.isSecureContext || !(window.crypto && window.crypto.subtle)) {
    const notice = $("autofillNotice");
    const noticeText = $("autofillText");
    if (notice) notice.hidden = false;
    if (noticeText) noticeText.textContent = "Note: Fingerprinting is unavailable here (needs HTTPS or localhost). You can still record work details without fingerprints.";
  }
  if (typeof window.exifr === "undefined - app.js:2887") console.warn("exifr library not loaded. Metadata auto-fill will be limited.");
}

start();