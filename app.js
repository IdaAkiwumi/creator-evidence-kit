"use strict";

const $ = id => document.getElementById(id);

/* ================================================================
   Creator Evidence Kit
   A free, local-only tool for visual artists, photographers,
   illustrators, and videographers to document creative work and
   organize evidence of possible AI training use.
   ================================================================ */

/* ---------- Config ---------- */
const SCHEMA_NAME = "creator-evidence-kit";
const SCHEMA_VERSION = 2;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB tested limit
const MAX_FILES = 20; // Maximum images per work
const THEME_KEY = "creator_evidence_kit_theme";
const EVIDENCE_DRAFT_KEY = "creator_evidence_kit_evidence_draft_v1";
const EVIDENCE_LIBRARY_KEY = "creator_evidence_kit_evidence_library_v1";
const EVIDENCE_EXPORT_SCHEMA = "creator-evidence-kit-evidence";
const SITE_TITLE = "Creator Evidence Kit";
const SITE_BLURB = "Document your creative work and organize evidence of possible AI use.";

/* Thumbnails embedded in exported JSON so previews survive import.
   These are small compressed copies, not the original files. */
const THUMBNAIL_MAX_DIMENSION = 400;
const THUMBNAIL_JPEG_QUALITY = 0.6;

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

/* Multi-image selection state */
let selectedImages = []; // Array of { file, meta, exif, objectUrl, thumbnail, thumbnailDataUrl, isVideo, isPrimary }
let primaryImageIndex = 0;

/* Tracks whether the user explicitly cleared saved images on an edited work,
   so that saving without selecting new files does not silently delete them. */
let existingImagesCleared = false;

/* Evidence entries currently in the form */
let evidenceEntries = [];

/* ---------- Toast ---------- */
let toastTimer = null;
function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ""; }, 3400);
}

/* ---------- Theme Switcher ---------- */
function getPreferredTheme() {
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
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
  if (status) {
    status.textContent = `Theme: ${theme === "dark" ? "Dark" : "Light"} mode.`;
  }

  const meta = $("metaThemeColor");
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#12151c" : "#f4f6f9");
  }

  if (isUserAction) {
    showToast(`Switched to ${theme === "dark" ? "Dark" : "Light"} mode`);
  }
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

/* ---------- Unsaved changes warning ---------- */
function markUnsaved() {
  hasUnsavedChanges = true;
}

function markSaved() {
  hasUnsavedChanges = false;
}

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
  } catch {
    return false;
  }
}

function escapeForCsv(value) {
  if (value === null || value === undefined) return "";
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (/[",\n\r]/.test(str)) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
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
  } catch {
    return dateStr;
  }
}

function titleFromFilename(filename) {
  if (!filename) return "";
  const name = filename.replace(/\.[^/.]+$/, "");
  return name.replace(/[_-]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function exifDateToIso(exifDate) {
  if (!exifDate || typeof exifDate !== "string") return "";
  const match = exifDate.match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return "";
}

/* ---------- SHA-256 Fingerprinting ---------- */
async function computeSha256(file) {
  if (!window.isSecureContext) {
    throw new Error("This page is not in a secure context. Fingerprinting requires HTTPS or localhost.");
  }
  if (!(window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === "function")) {
    throw new Error("This browser does not support the Web Crypto API needed for fingerprinting.");
  }
  const buffer = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Thumbnail generation (for export persistence) ---------- */
/* Compress an image file to a small JPEG data URL. Returns null on failure
   (SVGs, corrupt files, oversized dimensions) so callers can fall back to no
   preview. Never throws. */
async function generateImageThumbnailDataUrl(file, maxDimension = THUMBNAIL_MAX_DIMENSION, quality = THUMBNAIL_JPEG_QUALITY) {
  if (!file || !file.size) return null;
  // Only attempt for images
  const looksLikeImage = (file.type && file.type.startsWith("image/")) ||
    (!file.type && /\.(jpe?g|png|webp|gif|bmp|tiff?|svg)$/i.test(file.name || ""));
  if (!looksLikeImage) return null;

  return new Promise(resolve => {
    let url = null;
    try {
      url = URL.createObjectURL(file);
    } catch {
      return resolve(null);
    }
    const img = new Image();
    let settled = false;
    const finish = dataUrl => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { URL.revokeObjectURL(url); } catch {}
      resolve(dataUrl);
    };
    const timer = setTimeout(() => finish(null), 5000);
    img.onload = () => {
      try {
        const nw = img.naturalWidth || img.width || 1;
        const nh = img.naturalHeight || img.height || 1;
        const ratio = Math.min(1, maxDimension / Math.max(nw, nh));
        const w = Math.max(1, Math.round(nw * ratio));
        const h = Math.max(1, Math.round(nh * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(img, 0, 0, w, h);
        let dataUrl = null;
        try {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        } catch {
          // Tainted canvas (SVG with external refs): try SVG raw as fallback
          try { dataUrl = canvas.toDataURL("image/png"); } catch { dataUrl = null; }
        }
        finish(dataUrl);
      } catch {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    try {
      img.src = url;
    } catch {
      finish(null);
    }
  });
}

/* ---------- EXIF / Metadata Reading ---------- */
async function readImageMetadata(file) {
  const metadata = {
    title: null,
    creator: null,
    date: null,
    description: null,
    copyright: null,
    camera: null,
    software: null
  };

  if (window.exifr && typeof window.exifr.parse === "function") {
    try {
      const exif = await window.exifr.parse(file, {
        tiff: true,
        exif: true,
        xmp: true,
        icc: false,
        translateKeys: true,
        translateValues: true,
        reviveValues: true
      });

      if (exif) {
        const tag = (named, numeric) => {
          const v = exif[named] !== undefined ? exif[named] : exif[String(numeric)];
          return v === undefined || v === null ? null : v;
        };

        metadata.creator = tag("Artist", 315) || null;
        metadata.title = tag("Title", 269) || tag("title", 269) || null;
        metadata.description = tag("ImageDescription", 270) || tag("description", 270) || tag("Description", 270) || null;

        const exifDate = tag("DateTimeOriginal", 36867)
          || tag("DateTime", 306)
          || tag("CreateDate", 306)
          || tag("ModifyDate", 306)
          || null;
        if (exifDate) {
          if (exifDate instanceof Date) {
            metadata.date = exifDate.toISOString().slice(0, 10);
          } else if (typeof exifDate === "string") {
            metadata.date = exifDateToIso(exifDate);
          }
        }

        metadata.copyright = tag("Copyright", 33432) || null;

        const make = tag("Make", 271);
        const model = tag("Model", 272);
        metadata.camera = make && model
          ? `${make} ${model}`.trim()
          : (model || make || null);

        metadata.software = tag("Software", 305) || null;
      }
    } catch (err) {
      console.warn("EXIF reading failed: - app.js:337", err);
    }
  }

  if (!metadata.title) {
    metadata.title = titleFromFilename(file.name);
  }

  return metadata;
}

/* ---------- Multi-file handling (images and videos) ---------- */

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
        ? Math.min(video.duration / 2, 1)
        : 0;
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
      } catch {
        finish(null);
      }
    });
    video.addEventListener("error", () => finish(null));
    video.src = objectUrl;
  });
}

async function handleImageSelection(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;

  if (files.length > MAX_FILES) {
    showToast(`Too many files selected. Maximum is ${MAX_FILES} files per work.`);
    return;
  }

  const oversized = files.filter(f => f.size > MAX_FILE_BYTES);
  if (oversized.length > 0) {
    showToast(`Some files are too large (over 50 MB). They were skipped.`);
  }

  const notImages = files.filter(f => !isSupportedMediaFile(f));
  if (notImages.length > 0) {
    showToast(`${notImages.length} unsupported ${notImages.length === 1 ? "file was" : "files were"} skipped. Only images and videos can be attached to a work.`);
  }

  const validFiles = files.filter(f => f.size <= MAX_FILE_BYTES && isSupportedMediaFile(f));
  if (validFiles.length === 0) {
    resetImageSelection();
    return;
  }

  const notice = $("autofillNotice");
  const noticeText = $("autofillText");
  notice.hidden = false;
  noticeText.textContent = `Processing ${validFiles.length} file${validFiles.length === 1 ? "" : "s"}…`;

  // New selection replaces existing
  existingImagesCleared = false;
  selectedImages = [];
  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    const noticeText2 = $("autofillText");
    if (noticeText2) noticeText2.textContent = `Processing file ${i + 1} of ${validFiles.length}…`;

    try {
      const sha256 = await computeSha256(file);
      const isVideo = isVideoFile(file);
      const exif = isVideo ? null : await readImageMetadata(file);
      let thumbnail = null;
      let thumbnailDataUrl = null;
      let objectUrl = null;
      if (isVideo) {
        thumbnail = await captureVideoThumbnail(file);
        thumbnailDataUrl = thumbnail; // captured frame is already a data URL
      } else {
        objectUrl = URL.createObjectURL(file);
        thumbnailDataUrl = await generateImageThumbnailDataUrl(file);
      }

      selectedImages.push({
        file: file,
        meta: {
          filename: file.name,
          byte_size: file.size,
          mime_type: file.type || "unknown",
          sha256: sha256,
          algorithm: "SHA-256"
        },
        exif: exif,
        objectUrl: objectUrl,
        thumbnail: thumbnail,
        thumbnailDataUrl: thumbnailDataUrl,
        isVideo: isVideo,
        isPrimary: i === 0
      });
    } catch (err) {
      console.warn(`Failed to process ${file.name}: - app.js:483`, err);
      const isVideo = isVideoFile(file);
      let thumbnail = null;
      let thumbnailDataUrl = null;
      let objectUrl = null;
      try {
        if (isVideo) {
          thumbnail = await captureVideoThumbnail(file);
          thumbnailDataUrl = thumbnail;
        } else {
          objectUrl = URL.createObjectURL(file);
          thumbnailDataUrl = await generateImageThumbnailDataUrl(file);
        }
      } catch {
        // Keep the file even without a preview
      }
      selectedImages.push({
        file: file,
        meta: {
          filename: file.name,
          byte_size: file.size,
          mime_type: file.type || "unknown",
          sha256: null,
          algorithm: "SHA-256"
        },
        exif: null,
        objectUrl: objectUrl,
        thumbnail: thumbnail,
        thumbnailDataUrl: thumbnailDataUrl,
        isVideo: isVideo,
        isPrimary: i === 0
      });
    }
  }

  primaryImageIndex = 0;

  // Hide existing (if we were editing one)
  const existingWrap = $("existingImagesWrap");
  if (existingWrap) existingWrap.hidden = true;

  autoFillFromMetadata();
  renderThumbnails();

  const filledFields = getAutoFilledFields();
  const hasVideoOnly = selectedImages.length > 0 && selectedImages.every(img => img.isVideo);
  if (filledFields.length > 0) {
    noticeText.textContent = `Auto-filled from image metadata: ${filledFields.join(", ")}. Review and adjust as needed.`;
  } else if (hasVideoOnly) {
    noticeText.textContent = `Videos are attached with a fingerprint. Fill in the work details manually — videos carry no image metadata to auto-fill.`;
  } else {
    noticeText.textContent = `No metadata found in your images. Fill in the fields manually, or check that your images have EXIF data.`;
  }

  markUnsaved();
  showToast(`${validFiles.length} file${validFiles.length === 1 ? "" : "s"} processed`);
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
  if (exif.title && titleInput && !titleInput.dataset.userEdited) {
    titleInput.value = exif.title;
  }

  const creatorInput = $("workCreator");
  if (exif.creator && creatorInput && !creatorInput.dataset.userEdited) {
    creatorInput.value = exif.creator;
  }

  const dateInput = $("workDate");
  if (exif.date && dateInput && !dateInput.dataset.userEdited) {
    dateInput.value = exif.date;
  }

  const descInput = $("workDescription");
  if (exif.description && descInput && !descInput.dataset.userEdited) {
    descInput.value = exif.description;
  }
}

function renderThumbnails() {
  const wrap = $("thumbnailsWrap");
  const grid = $("thumbnailsGrid");
  if (!wrap || !grid) return;

  grid.replaceChildren();

  if (selectedImages.length === 0) {
    wrap.hidden = true;
    return;
  }

  wrap.hidden = false;

  selectedImages.forEach((img, index) => {
    const card = document.createElement("div");
    card.className = `thumbnail-card${index === primaryImageIndex ? " primary" : ""}${img.isVideo ? " video" : ""}${img.isVideo && !img.thumbnail ? " no-preview" : ""}`;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute(
      "aria-label",
      `${img.meta.filename}${img.isVideo ? " (video)" : ""}${index === primaryImageIndex ? " (primary file)" : ""}. Click to make this the primary file.`
    );

    const thumb = document.createElement("img");
    thumb.src = img.objectUrl || img.thumbnail || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%23d4d9e2'/%3E%3C/svg%3E";
    thumb.alt = img.isVideo
      ? (img.thumbnail ? `Frame from video ${img.meta.filename}` : `Video ${img.meta.filename} (preview unavailable)`)
      : `Thumbnail of ${img.meta.filename}`;
    thumb.loading = "lazy";
    card.appendChild(thumb);

    if (img.isVideo) {
      const videoBadge = document.createElement("span");
      videoBadge.className = "thumbnail-type";
      videoBadge.textContent = "Video";
      card.appendChild(videoBadge);
    }
    if (index === primaryImageIndex) {
      const badge = document.createElement("span");
      badge.className = "thumbnail-badge";
      badge.textContent = "Primary";
      card.appendChild(badge);
    }

    const name = document.createElement("span");
    name.className = "thumbnail-filename";
    name.textContent = img.meta.filename;
    name.title = img.meta.filename;
    card.appendChild(name);

    if (img.isVideo && !img.thumbnail) {
      const noPreview = document.createElement("span");
      noPreview.className = "thumbnail-nopreview";
      noPreview.textContent = "Preview unavailable — file attached with fingerprint";
      card.appendChild(noPreview);
    }

    const fp = document.createElement("span");
    fp.className = "thumbnail-fingerprint";
    fp.textContent = img.meta.sha256 ? "✓ Fingerprinted" : "No fingerprint";
    card.appendChild(fp);

    const setPrimary = () => {
      if (primaryImageIndex !== index) {
        primaryImageIndex = index;
        selectedImages.forEach((img2, i) => {
          img2.isPrimary = i === index;
        });
        renderThumbnails();
        autoFillFromMetadata();
        showToast(`Primary file set to ${img.meta.filename}`);
      }
    };

    card.addEventListener("click", setPrimary);
    card.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setPrimary();
      }
    });

    grid.appendChild(card);
  });
}

/* Render images saved on an existing work (loaded via Edit) with previews.
   Uses the stored thumbnail_data_url; falls back to a placeholder for older
   exports that predate this feature. */
function renderExistingImages(work) {
  const wrap = $("existingImagesWrap");
  const grid = $("existingImagesGrid");
  if (!wrap || !grid) return;

  grid.replaceChildren();
  const images = (work && work.images) || [];

  if (images.length === 0 || existingImagesCleared) {
    wrap.hidden = true;
    return;
  }

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
      const placeholder = document.createElement("div");
      placeholder.className = "thumbnail-placeholder";
      placeholder.textContent = "No preview stored with this export";
      card.appendChild(placeholder);
    }

    if (index === primaryIdx) {
      const badge = document.createElement("span");
      badge.className = "thumbnail-badge";
      badge.textContent = "Primary";
      card.appendChild(badge);
    }

    const name = document.createElement("span");
    name.className = "thumbnail-filename";
    name.textContent = img.filename || "(unnamed)";
    name.title = img.filename || "";
    card.appendChild(name);

    const fp = document.createElement("span");
    fp.className = "thumbnail-fingerprint";
    fp.textContent = img.sha256 ? "✓ Fingerprinted" : "";
    card.appendChild(fp);

    grid.appendChild(card);
  });
}

function resetImageSelection() {
  selectedImages.forEach(img => {
    if (img.objectUrl) {
      URL.revokeObjectURL(img.objectUrl);
    }
  });
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

/* ---------- Evidence entries in form ---------- */
function addEvidenceEntry(entry = null) {
  const id = entry && entry.id ? entry.id : generateId("ev");
  evidenceEntries.push({
    id: id,
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

    const controls1 = document.createElement("div");
    controls1.className = "controls";
    const catLabel = document.createElement("label");
    catLabel.textContent = "Category";
    const catSelect = document.createElement("select");
    Object.entries(EVIDENCE_CATEGORIES).forEach(([val, label]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      if (entry.category === val) opt.selected = true;
      catSelect.appendChild(opt);
    });
    catSelect.addEventListener("change", () => { entry.category = catSelect.value; scheduleEvidenceDraftSave(); });
    catLabel.appendChild(catSelect);
    controls1.appendChild(catLabel);
    card.appendChild(controls1);

    const controls2 = document.createElement("div");
    controls2.className = "controls";
    const urlLabel = document.createElement("label");
    urlLabel.textContent = "Source URL (optional)";
    const urlInput = document.createElement("input");
    urlInput.type = "url";
    urlInput.value = entry.source_url || "";
    urlInput.placeholder = "https://…";
    urlInput.addEventListener("input", () => { entry.source_url = urlInput.value.trim(); scheduleEvidenceDraftSave(); });
    urlLabel.appendChild(urlInput);
    controls2.appendChild(urlLabel);

    const dateLabel = document.createElement("label");
    dateLabel.textContent = "Date observed (optional)";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = entry.observed_at || "";
    dateInput.addEventListener("input", () => { entry.observed_at = dateInput.value; scheduleEvidenceDraftSave(); });
    dateLabel.appendChild(dateInput);
    controls2.appendChild(dateLabel);
    card.appendChild(controls2);

    const controls3 = document.createElement("div");
    controls3.className = "controls";
    const entityLabel = document.createElement("label");
    entityLabel.textContent = "Dataset or company name (optional)";
    const entityInput = document.createElement("input");
    entityInput.type = "text";
    entityInput.value = entry.entity || "";
    entityInput.placeholder = "For example: LAION-5B, OpenAI";
    entityInput.addEventListener("input", () => { entry.entity = entityInput.value.trim(); scheduleEvidenceDraftSave(); });
    entityLabel.appendChild(entityInput);
    controls3.appendChild(entityLabel);
    card.appendChild(controls3);

    const controls4 = document.createElement("div");
    controls4.className = "controls";
    const notesLabel = document.createElement("label");
    notesLabel.textContent = "Notes (what does this source show?)";
    const notesTextarea = document.createElement("textarea");
    notesTextarea.value = entry.notes || "";
    notesTextarea.placeholder = "Describe what you observed at this source.";
    notesTextarea.addEventListener("input", () => { entry.notes = notesTextarea.value; scheduleEvidenceDraftSave(); });
    notesLabel.appendChild(notesTextarea);
    controls4.appendChild(notesLabel);
    card.appendChild(controls4);

    container.appendChild(card);
  });
}

/* ---------- Evidence: browser saving, copy/paste, reuse ---------- */
let storageCheckResult = null;

function isStorageAvailable() {
  if (storageCheckResult === null) {
    try {
      const probeKey = "__creator_evidence_kit_probe__";
      window.localStorage.setItem(probeKey, "1");
      window.localStorage.removeItem(probeKey);
      storageCheckResult = true;
    } catch {
      storageCheckResult = false;
    }
  }
  return storageCheckResult;
}

function buildEvidenceExport() {
  return {
    schema: EVIDENCE_EXPORT_SCHEMA,
    version: 1,
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
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.entries)) {
    if (parsed.schema && parsed.schema !== EVIDENCE_EXPORT_SCHEMA) {
      throw new Error("That JSON was not exported by the Copy evidence button.");
    }
    entries = parsed.entries;
  } else {
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.works)) {
      throw new Error("That is a full collection export. Use the Import section under Save and reopen to open it.");
    }
    throw new Error("That does not look like saved evidence entries.");
  }
  return entries.map((e, i) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) {
      throw new Error(`Entry ${i + 1} is not valid.`);
    }
    if (e.category != null && !EVIDENCE_CATEGORIES[e.category]) {
      throw new Error(`Entry ${i + 1} has an unknown category.`);
    }
    const clean = {
      category: e.category || "other_source",
      source_url: "",
      observed_at: "",
      entity: "",
      notes: ""
    };
    ["source_url", "observed_at", "entity", "notes"].forEach(k => {
      if (e[k] != null && typeof e[k] !== "string") {
        throw new Error(`Entry ${i + 1} has an invalid ${k}.`);
      }
      clean[k] = e[k] || "";
    });
    if (clean.observed_at && !/^\d{4}-\d{2}-\d{2}$/.test(clean.observed_at)) {
      throw new Error(`Entry ${i + 1} has a date that is not in YYYY-MM-DD format.`);
    }
    if (clean.source_url && !isValidUrl(clean.source_url)) {
      throw new Error(`Entry ${i + 1} has a source URL that is not a valid http(s) link.`);
    }
    return clean;
  });
}

function extractFirstUrl(text) {
  const match = String(text).match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return "";
  return match[0].replace(/[.,;:)\]}]+$/, "");
}

function parsePlainTextEvidence(text) {
  return {
    category: "other_source",
    source_url: extractFirstUrl(text),
    observed_at: todayLocalIso(),
    entity: "",
    notes: text
  };
}

function parseEvidencePaste(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return { kind: "empty" };

  let parsed = null;
  let looksLikeJson = true;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    looksLikeJson = false;
  }

  if (looksLikeJson) {
    try {
      const entries = normalizeEvidenceJson(parsed);
      if (entries.length === 0) return { kind: "empty" };
      return { kind: "evidence", entries: entries };
    } catch (err) {
      return { kind: "invalid", error: err.message };
    }
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
  if (!isStorageAvailable()) {
    updateEvidenceStorageStatus();
    return;
  }
  try {
    if (evidenceEntries.length === 0) {
      window.localStorage.removeItem(EVIDENCE_DRAFT_KEY);
      evidenceSaveFailed = false;
    } else {
      const text = JSON.stringify(buildEvidenceExport());
      window.localStorage.setItem(EVIDENCE_DRAFT_KEY, text);
      evidenceSaveFailed = window.localStorage.getItem(EVIDENCE_DRAFT_KEY) !== text;
    }
  } catch {
    evidenceSaveFailed = true;
  }
  updateEvidenceStorageStatus();
}

function clearEvidenceDraft() {
  try {
    window.localStorage.removeItem(EVIDENCE_DRAFT_KEY);
  } catch {
  }
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
  } catch {
    return 0;
  }
}

function evidenceContentKey(e) {
  return `${e.source_url || ""}|${e.entity || ""}|${e.notes || ""}`;
}

function getEvidenceLibrary() {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(EVIDENCE_LIBRARY_KEY);
    if (!raw) return [];
    return normalizeEvidenceJson(JSON.parse(raw));
  } catch {
    return [];
  }
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
      if (!seen.has(key)) {
        library.push(e);
        seen.add(key);
      }
    });
    const trimmed = library.slice(-100);
    window.localStorage.setItem(EVIDENCE_LIBRARY_KEY, JSON.stringify({
      schema: EVIDENCE_EXPORT_SCHEMA,
      version: 1,
      entries: trimmed
    }));
    return true;
  } catch {
    evidenceSaveFailed = true;
    return false;
  }
}

function collectReusableEvidence() {
  const seen = new Set();
  const list = [];
  const push = e => {
    const key = evidenceContentKey(e);
    if (key === "||" || seen.has(key)) return;
    seen.add(key);
    list.push(e);
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
  help.textContent = "Adding an entry starts a new observation dated today. Change the date if you observed it earlier.";
  panel.appendChild(help);

  const list = collectReusableEvidence();
  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No saved evidence yet. Evidence entries from works you save will appear here for reuse.";
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
    const dateEl = document.createElement("span");
    dateEl.className = "reuse-date";
    dateEl.textContent = e.observed_at ? `observed ${e.observed_at}` : "";
    label.appendChild(cat);
    label.appendChild(main);
    if (dateEl.textContent) label.appendChild(dateEl);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn small";
    addBtn.textContent = "Add";
    addBtn.addEventListener("click", () => {
      const { id, ...rest } = e;
      addEvidenceEntry({ ...rest, observed_at: todayLocalIso() });
      showToast("Evidence added with today's date. Edit the date if you observed this earlier.");
    });

    item.appendChild(label);
    item.appendChild(addBtn);
    panel.appendChild(item);
  });
}

async function copyEvidenceJson() {
  if (evidenceEntries.length === 0) {
    showToast("No evidence entries to copy yet. Add one first.");
    return;
  }
  const text = JSON.stringify(buildEvidenceExport(), null, 2);

  let copied = false;
  let clipboardApi = null;
  try {
    clipboardApi = navigator.clipboard;
  } catch {
    clipboardApi = null;
  }
  if (clipboardApi && typeof clipboardApi.writeText === "function") {
    try {
      await clipboardApi.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
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
    } catch {
      copied = false;
    }
  }

  if (copied) {
    showToast("Evidence entries copied. Paste them into the box below to restore them later.");
  } else {
    showEvidenceCopyFallback(text);
  }
}

function showEvidenceCopyFallback(text) {
  const wrap = $("evidenceCopyFallback");
  if (!wrap) {
    showToast("Could not copy automatically. Your browser blocked clipboard access.");
    return;
  }
  wrap.hidden = false;
  const area = $("evidenceCopyFallbackText");
  if (area) {
    area.value = text;
    area.focus();
    area.select();
  }
  showToast("Clipboard was blocked. Select the text below and copy it manually.");
}

function handleEvidencePaste() {
  const box = $("evidencePasteBox");
  const status = $("evidencePasteStatus");
  if (!box) return;

  const result = parseEvidencePaste(box.value);

  if (status) {
    status.hidden = true;
    status.textContent = "";
  }

  if (result.kind === "empty") {
    showToast("Paste a link, a note, or saved evidence first.");
    return;
  }

  if (result.kind === "invalid") {
    if (status) {
      status.textContent = `Could not use that paste: ${result.error} Nothing was changed.`;
      status.hidden = false;
    }
    return;
  }

  if (result.kind === "evidence") {
    result.entries.forEach(e => addEvidenceEntry(e));
    if (status) {
      status.textContent = `Restored ${result.entries.length} evidence ${result.entries.length === 1 ? "entry" : "entries"} from saved evidence. Their dates were kept.`;
      status.hidden = false;
    }
    box.value = "";
    return;
  }

  addEvidenceEntry(result.entry);
  if (status) {
    status.textContent = "Added as an evidence entry dated today. Review the fields and adjust anything that is wrong.";
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
  return { url: url, description: description };
}

function handleWorkDetailsPaste() {
  const box = $("workDetailsPasteBox");
  const status = $("workDetailsPasteStatus");
  if (!box) return;

  const parsed = parseWorkDetailsPaste(box.value);

  if (status) {
    status.hidden = true;
    status.textContent = "";
  }

  if (!parsed.url && !parsed.description) {
    showToast("Paste a description or a link first.");
    return;
  }

  const filled = [];
  const skipped = [];

  const urlInput = $("workUrl");
  if (parsed.url && urlInput) {
    if (urlInput.value.trim() === "") {
      urlInput.value = parsed.url;
      urlInput.dispatchEvent(new Event("input"));
      filled.push("Publication URL");
    } else {
      skipped.push("Publication URL (already filled)");
    }
  }

  const descInput = $("workDescription");
  if (parsed.description && descInput) {
    if (descInput.value.trim() === "") {
      descInput.value = parsed.description;
      descInput.dataset.userEdited = "true";
      filled.push("Description");
    } else {
      skipped.push("Description (already filled)");
    }
  }

  if (filled.length === 0 && skipped.length > 0) {
    if (status) {
      status.textContent = `Nothing filled: ${skipped.join(" and ")} were left unchanged.`;
      status.hidden = false;
    }
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

  if (!isStorageAvailable()) {
    el.textContent = "Browser saving is unavailable here. Use Copy evidence to keep your entries between visits.";
    return;
  }

  if (evidenceSaveFailed) {
    el.textContent = "Browser saving stopped working (storage may be full or blocked). Use Copy evidence or Export JSON to keep a portable copy.";
    return;
  }

  let draftCount = 0;
  try {
    const raw = window.localStorage.getItem(EVIDENCE_DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.entries)) draftCount = parsed.entries.length;
    }
  } catch {
  }
  el.textContent = draftCount > 0
    ? `Evidence entries are saved in this browser. ${draftCount} in your current draft.`
    : "Evidence entries you add are saved in this browser.";
}

function clearSavedEvidence() {
  try {
    window.localStorage.removeItem(EVIDENCE_DRAFT_KEY);
    window.localStorage.removeItem(EVIDENCE_LIBRARY_KEY);
  } catch {
  }
  updateEvidenceStorageStatus();
  const panel = $("evidenceReusePanel");
  if (panel && !panel.hidden) renderReusePanel();
  showToast("Saved evidence cleared from this browser");
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

  ["workTitleError", "workCreatorError", "workUrlError"].forEach(id => {
    const el = $(id);
    if (el) el.hidden = true;
  });
  ["workTitle", "workCreator", "workUrl"].forEach(id => {
    const el = $(id);
    if (el) el.removeAttribute("aria-invalid");
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

  if (!title) {
    errors.title = "Please enter a title for this work.";
    isValid = false;
  }

  if (!creator) {
    errors.creator = "Please enter the creator or rights holder name.";
    isValid = false;
  }

  if (url && !isValidUrl(url)) {
    errors.url = "Please enter a valid URL starting with http:// or https://, or leave this field empty.";
    isValid = false;
  }

  const titleError = $("workTitleError");
  const creatorError = $("workCreatorError");
  const urlError = $("workUrlError");

  if (errors.title) {
    titleError.textContent = errors.title;
    titleError.hidden = false;
    $("workTitle").setAttribute("aria-invalid", "true");
  } else {
    titleError.hidden = true;
    $("workTitle").removeAttribute("aria-invalid");
  }

  if (errors.creator) {
    creatorError.textContent = errors.creator;
    creatorError.hidden = false;
    $("workCreator").setAttribute("aria-invalid", "true");
  } else {
    creatorError.hidden = true;
    $("workCreator").removeAttribute("aria-invalid");
  }

  if (errors.url) {
    urlError.textContent = errors.url;
    urlError.hidden = false;
    $("workUrl").setAttribute("aria-invalid", "true");
  } else {
    urlError.hidden = true;
    $("workUrl").removeAttribute("aria-invalid");
  }

  return isValid;
}

function handleFormSubmit(event) {
  event.preventDefault();

  if (!validateForm()) {
    showToast("Please fix the highlighted fields");
    return;
  }

  const now = new Date().toISOString();

  // Build images array.
  // - New files selected: use them.
  // - Editing an existing work without selecting new files: preserve saved images
  //   unless the user explicitly removed them.
  let imagesForRecord;
  if (selectedImages.length > 0) {
    imagesForRecord = selectedImages.map((img, index) => ({
      ...img.meta,
      is_primary: index === primaryImageIndex,
      thumbnail_data_url: img.thumbnailDataUrl || img.thumbnail || null
    }));
  } else if (editingWorkId) {
    const existing = works.find(w => w.id === editingWorkId);
    imagesForRecord = existingImagesCleared ? [] : ((existing && existing.images) || []);
  } else {
    imagesForRecord = [];
  }

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

  if (editingWorkId) {
    const index = works.findIndex(w => w.id === editingWorkId);
    if (index !== -1) {
      works[index] = {
        ...works[index],
        ...workData,
        updated_at: now
      };
      showToast("Work updated");
    }
  } else {
    const newWork = {
      id: generateId("w"),
      ...workData,
      created_at: now,
      updated_at: now,
      is_sample: false
    };
    works.push(newWork);
    showToast("Work added to collection");
  }

  const librarySaved = addToEvidenceLibrary(workData.evidence);
  if (workData.evidence.length > 0 && !librarySaved && isStorageAvailable()) {
    showToast("Saved, but evidence was not kept for reuse in this browser (storage may be full or blocked). It is still part of your work — use Export JSON to keep a copy.");
  }

  markUnsaved();
  clearForm();
  renderCollection();
  updateSummaryBar();
}

/* ---------- Collection rendering ---------- */
function renderCollection() {
  const grid = $("collectionGrid");
  const empty = $("collectionEmpty");

  if (!grid) return;

  grid.replaceChildren();

  if (works.length === 0) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  works.forEach(work => {
    const card = document.createElement("article");
    card.className = "collection-card";
    card.dataset.workId = work.id;

    const header = document.createElement("div");
    header.className = "card-header";
    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = work.title;
    header.appendChild(title);

    const sampleTag = document.createElement("span");
    sampleTag.className = "card-tag";
    sampleTag.textContent = work.is_sample ? "Example" : "Record";
    header.appendChild(sampleTag);
    card.appendChild(header);

    // Preview of the primary saved image
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
    editBtn.addEventListener("click", () => {
      loadWorkIntoForm(work);
    });
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn danger small";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (window.confirm(`Delete "${work.title}"? This cannot be undone.`)) {
        works = works.filter(w => w.id !== work.id);
        if (editingWorkId === work.id) clearForm();
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
}

/* ---------- Summary bar ---------- */
function updateSummaryBar() {
  const totalWorks = works.length;
  const totalEvidence = works.reduce((sum, w) => sum + (w.evidence || []).length, 0);
  const totalFingerprints = works.reduce((sum, w) => {
    return sum + (w.images || []).filter(img => img.sha256).length;
  }, 0);

  $("hitWorks").textContent = totalWorks;
  $("hitEvidence").textContent = totalEvidence;
  $("hitFingerprints").textContent = totalFingerprints;
}

/* ---------- Export ---------- */
function buildExportPayload() {
  return {
    schema: SCHEMA_NAME,
    version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    site: SITE_TITLE,
    works: works.map(w => ({ ...w }))
  };
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportJson() {
  if (works.length === 0) {
    showToast("Nothing to export yet. Add at least one work first.");
    return;
  }
  const payload = buildExportPayload();
  const json = JSON.stringify(payload, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadFile(json, `creator-evidence-kit-${dateStr}.json`, "application/json");
  markSaved();
  showToast("JSON exported. Previews of saved images are included; original files are not.");
}

function exportCsv() {
  if (works.length === 0) {
    showToast("Nothing to export yet. Add at least one work first.");
    return;
  }

  const headers = [
    "Title",
    "Creator",
    "Description",
    "Publication URL",
    "Publication date",
    "AI licensing preference",
    "Image count",
    "Primary image filename",
    "Primary image SHA-256",
    "Evidence count",
    "Evidence categories"
  ];

  const rows = [headers.map(h => escapeForCsv(h)).join(",")];

  works.forEach(work => {
    const images = work.images || [];
    const primaryImage = images.find(img => img.is_primary) || images[0];
    const evidenceCategories = [...new Set((work.evidence || []).map(e => EVIDENCE_CATEGORIES[e.category] || e.category))].join("; ");
    const row = [
      work.title,
      work.creator,
      work.description || "",
      work.url || "",
      work.date || "",
      LICENSING_LABELS[work.licensing] || work.licensing,
      images.length,
      primaryImage ? primaryImage.filename : "",
      primaryImage ? primaryImage.sha256 : "",
      (work.evidence || []).length,
      evidenceCategories
    ];
    rows.push(row.map(cell => escapeForCsv(cell)).join(","));
  });

  const csv = rows.join("\n");
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadFile("\uFEFF" + csv, `creator-evidence-kit-${dateStr}.csv`, "text/csv;charset=utf-8");
  showToast("CSV exported. This is a summary for spreadsheets; use JSON to reopen records.");
}

/* ---------- Print report ---------- */
function printReport() {
  if (works.length === 0) {
    showToast("Nothing to print yet. Add at least one work first.");
    return;
  }

  const report = $("printReport");
  report.replaceChildren();

  const h1 = document.createElement("h1");
  h1.textContent = "Creator Evidence Kit Report";
  report.appendChild(h1);

  const meta = document.createElement("p");
  meta.className = "print-meta";
  meta.textContent = `Generated ${new Date().toLocaleString("en-US")} · ${works.length} work${works.length === 1 ? "" : "s"} · Records are self-declared by the creator unless a source is cited.`;
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
      const primaryImage = images.find(img => img.is_primary) || images[0];
      if (primaryImage) {
        addLine("Primary image filename", primaryImage.filename);
        const fpP = document.createElement("p");
        const fpStrong = document.createElement("strong");
        fpStrong.textContent = "SHA-256 fingerprint: ";
        fpP.appendChild(fpStrong);
        const code = document.createElement("code");
        code.textContent = primaryImage.sha256 || "Not calculated";
        fpP.appendChild(code);
        div.appendChild(fpP);
      }
    }

    if (work.evidence && work.evidence.length > 0) {
      const evDiv = document.createElement("div");
      evDiv.className = "print-evidence";
      const evH = document.createElement("p");
      const evStrong = document.createElement("strong");
      evStrong.textContent = `Evidence entries (${work.evidence.length})`;
      evH.appendChild(evStrong);
      evDiv.appendChild(evH);

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
  if (!payload || typeof payload !== "object") {
    throw new Error("The file does not contain a valid JSON object.");
  }
  if (payload.schema !== SCHEMA_NAME) {
    throw new Error(`This file was not exported by Creator Evidence Kit (expected schema "${SCHEMA_NAME}").`);
  }
  if (payload.version !== SCHEMA_VERSION) {
    if (payload.version === 1) {
      normalizeV1Payload(payload);
    } else {
      throw new Error(`Unsupported file version ${payload.version}. This tool supports version ${SCHEMA_VERSION} and version 1.`);
    }
  }
  if (!Array.isArray(payload.works)) {
    throw new Error("The file does not contain a valid works array.");
  }

  payload.works.forEach((work, i) => {
    if (!work || typeof work !== "object") {
      throw new Error(`Work at position ${i + 1} is not a valid object.`);
    }
    if (typeof work.title !== "string" || !work.title.trim()) {
      throw new Error(`Work at position ${i + 1} is missing a title.`);
    }
    if (typeof work.creator !== "string" || !work.creator.trim()) {
      throw new Error(`Work at position ${i + 1} is missing a creator name.`);
    }
    if (work.licensing && !LICENSING_LABELS[work.licensing]) {
      throw new Error(`Work at position ${i + 1} has an unknown licensing preference.`);
    }
    if (work.evidence && !Array.isArray(work.evidence)) {
      throw new Error(`Work at position ${i + 1} has an invalid evidence array.`);
    }
    if (work.images && !Array.isArray(work.images)) {
      throw new Error(`Work at position ${i + 1} has an invalid images array.`);
    }
  });

  return true;
}

function normalizeV1Payload(payload) {
  payload.version = SCHEMA_VERSION;
  payload.works.forEach(work => {
    if (work.image && !work.images) {
      work.images = [{ ...work.image, is_primary: true }];
    }
    delete work.image;
  });
}

function handleImportFile(file) {
  const statusEl = $("importStatus");
  statusEl.className = "import-status";
  statusEl.textContent = "";

  if (!file) return;

  if (file.size > 100 * 1024 * 1024) {
    statusEl.className = "import-status error";
    statusEl.textContent = "File is too large. Import files should be under 100 MB.";
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
      } else {
        mode = "replace";
      }

      if (mode === "replace") {
        works = payload.works.map(w => ({ ...w }));
      } else {
        const existingIds = new Set(works.map(w => w.id));
        let added = 0;
        let skipped = 0;
        payload.works.forEach(w => {
          if (existingIds.has(w.id)) {
            skipped++;
          } else {
            works.push({ ...w });
            added++;
          }
        });
        showToast(`Imported: ${added} added, ${skipped} skipped (duplicate IDs)`);
      }

      markUnsaved();
      clearForm();
      renderCollection();
      updateSummaryBar();

      statusEl.className = "import-status success";
      statusEl.textContent = `Successfully imported ${incomingCount} work${incomingCount === 1 ? "" : "s"} (${mode} mode). Image previews are shown on each record.`;

    } catch (err) {
      statusEl.className = "import-status error";
      statusEl.textContent = `Import failed: ${err.message} Your existing collection is unchanged.`;
    }
  };

  reader.onerror = () => {
    statusEl.className = "import-status error";
    statusEl.textContent = "Could not read the file. Please try again.";
  };

  reader.readAsText(file);
}

/* ---------- Sample records ---------- */
function loadSampleRecords() {
  if (works.length > 0) {
    const confirmed = window.confirm(
      "This will REPLACE your current collection with clearly labeled example records. Continue?"
    );
    if (!confirmed) return;
  }

  const now = new Date().toISOString();
  works = [
    {
      id: generateId("w"),
      title: "Golden Hour Portrait (Example)",
      creator: "Example Artist",
      description: "A fictional example portrait photograph. Replace with your own work details.",
      url: "https://example.com/portfolio/golden-hour",
      date: "2023-06-15",
      licensing: "not_available",
      images: [],
      evidence: [
        {
          id: generateId("ev"),
          category: "dataset_index_reference",
          source_url: "https://example.com/dataset-search",
          observed_at: "2025-01-10",
          entity: "Example Dataset Index",
          notes: "This is a fictional example. The URL does not point to a real dataset index. Replace with your own findings."
        }
      ],
      created_at: now,
      updated_at: now,
      is_sample: true
    },
    {
      id: generateId("w"),
      title: "Chesapeake Bay Sunrise (Example)",
      creator: "Example Photographer",
      description: "A fictional example landscape photograph.",
      url: "",
      date: "2022-11-03",
      licensing: "contact_me",
      images: [],
      evidence: [
        {
          id: generateId("ev"),
          category: "creator_declaration",
          source_url: "",
          observed_at: "2025-02-20",
          entity: "",
          notes: "This is a fictional example. I have not yet checked any dataset indexes for this work. Replace with your own notes."
        }
      ],
      created_at: now,
      updated_at: now,
      is_sample: true
    }
  ];

  markUnsaved();
  clearForm();
  renderCollection();
  updateSummaryBar();
  showToast("Example records loaded. These are clearly labeled as fictional examples.");
}

/* ---------- Event wiring ---------- */
function initEventListeners() {
  const form = $("workForm");
  if (form) {
    form.addEventListener("submit", handleFormSubmit);
  }

  const imagesInput = $("workImages");
  if (imagesInput) {
    imagesInput.addEventListener("change", e => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleImageSelection(files);
      }
    });
  }

  const clearImagesBtn = $("clearImagesBtn");
  if (clearImagesBtn) {
    clearImagesBtn.addEventListener("click", () => {
      // Clear new selections only; if editing, restore the saved previews.
      selectedImages.forEach(img => {
        if (img.objectUrl) URL.revokeObjectURL(img.objectUrl);
      });
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
  }

  const clearExistingBtn = $("clearExistingImagesBtn");
  if (clearExistingBtn) {
    clearExistingBtn.addEventListener("click", () => {
      if (!editingWorkId) return;
      if (!window.confirm("Remove the saved files from this work? Their previews and fingerprints will be cleared when you save.")) return;
      existingImagesCleared = true;
      const wrap = $("existingImagesWrap");
      if (wrap) wrap.hidden = true;
      showToast("Saved files will be removed when you save the work");
    });
  }

  ["workTitle", "workCreator", "workDate", "workDescription"].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener("input", () => {
        el.dataset.userEdited = "true";
      });
    }
  });

  const addEvidenceBtn = $("addEvidenceBtn");
  if (addEvidenceBtn) {
    addEvidenceBtn.addEventListener("click", () => {
      addEvidenceEntry();
    });
  }

  const copyEvidenceBtn = $("copyEvidenceBtn");
  if (copyEvidenceBtn) {
    copyEvidenceBtn.addEventListener("click", copyEvidenceJson);
  }

  const copyFallbackClose = $("evidenceCopyFallbackClose");
  if (copyFallbackClose) {
    copyFallbackClose.addEventListener("click", () => {
      const wrap = $("evidenceCopyFallback");
      if (wrap) wrap.hidden = true;
    });
  }

  const reuseEvidenceBtn = $("reuseEvidenceBtn");
  if (reuseEvidenceBtn) {
    reuseEvidenceBtn.addEventListener("click", () => {
      const panel = $("evidenceReusePanel");
      if (!panel) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) renderReusePanel();
    });
  }

  const workDetailsPasteBtn = $("workDetailsPasteBtn");
  if (workDetailsPasteBtn) {
    workDetailsPasteBtn.addEventListener("click", handleWorkDetailsPaste);
  }
  const workDetailsPasteBox = $("workDetailsPasteBox");
  if (workDetailsPasteBox) {
    workDetailsPasteBox.addEventListener("keydown", e => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleWorkDetailsPaste();
      }
    });
  }

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
  if (evidencePasteBtn) {
    evidencePasteBtn.addEventListener("click", handleEvidencePaste);
  }

  const evidencePasteBox = $("evidencePasteBox");
  if (evidencePasteBox) {
    evidencePasteBox.addEventListener("keydown", e => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleEvidencePaste();
      }
    });
  }

  const clearSavedEvidenceBtn = $("clearSavedEvidenceBtn");
  if (clearSavedEvidenceBtn) {
    clearSavedEvidenceBtn.addEventListener("click", () => {
      if (window.confirm("Clear saved evidence entries and the reuse list from this browser? Works in your collection are not affected.")) {
        clearSavedEvidence();
      }
    });
  }

  const cancelEditBtn = $("cancelEditBtn");
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", () => {
      clearForm();
      showToast("Edit cancelled");
    });
  }

  const startNewBtn = $("startNewWorkBtn");
  if (startNewBtn) {
    startNewBtn.addEventListener("click", () => {
      clearForm();
      $("workFormSection").scrollIntoView({ behavior: "smooth", block: "start" });
      $("workImages").focus();
    });
  }

  const loadSamplesBtn = $("loadSamplesBtn");
  if (loadSamplesBtn) {
    loadSamplesBtn.addEventListener("click", loadSampleRecords);
  }

  const exportJsonBtn = $("exportJsonBtn");
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", exportJson);
  }

  const exportCsvBtn = $("exportCsvBtn");
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", exportCsv);
  }

  const printBtn = $("printReportBtn");
  if (printBtn) {
    printBtn.addEventListener("click", printReport);
  }

  const importFile = $("importFile");
  if (importFile) {
    importFile.addEventListener("change", e => {
      const file = e.target.files[0];
      if (file) {
        handleImportFile(file);
        importFile.value = "";
      }
    });
  }

  const urlInput = $("workUrl");
  if (urlInput) {
    urlInput.addEventListener("blur", () => {
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
  }
}

/* ---------- Boot ---------- */
function start() {
  initThemeToggle();
  initEventListeners();

  const dateInput = $("workDate");
  if (dateInput) dateInput.value = todayLocalIso();

  const restored = restoreEvidenceDraft();
  renderEvidenceEntries();

  updateEvidenceStorageStatus();
  const clearSavedEvidenceBtn = $("clearSavedEvidenceBtn");
  if (clearSavedEvidenceBtn && isStorageAvailable()) {
    clearSavedEvidenceBtn.hidden = false;
  }
  if (restored > 0) {
    showToast(`Restored ${restored} evidence ${restored === 1 ? "entry" : "entries"} saved in this browser`);
  }

  renderCollection();
  updateSummaryBar();

  if (!window.isSecureContext || !(window.crypto && window.crypto.subtle)) {
    const notice = $("autofillNotice");
    const noticeText = $("autofillText");
    notice.hidden = false;
    noticeText.textContent = "Note: Fingerprinting is unavailable in this context. It requires HTTPS or localhost. You can still record work details without image fingerprints.";
  }

  if (typeof window.exifr === "undefined") {
    console.warn("exifr library not loaded. Image metadata autofill will be limited. - app.js:2303");
  }
}

start();