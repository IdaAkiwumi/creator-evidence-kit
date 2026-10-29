# 🎨 Creator Evidence Kit

**Document your work. Record your license. Log what happened to it.**

[![GitHub Sponsors](https://img.shields.io/badge/GitHub-Sponsor-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/IdaAkiwumi)
[![PayPal](https://img.shields.io/badge/PayPal-Donate-00457C?logo=paypal&logoColor=white)](https://www.paypal.com/paypalme/iakiwumi)
[![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![SHA256](https://img.shields.io/badge/SHA256-Fingerprinting-1e40af)](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)
[![Privacy Local Only](https://img.shields.io/badge/Privacy-Local_Only-22c55e)](#privacy)
[![License MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Live app:** https://idaakiwumi.github.io/creator-evidence-kit/

A free, local record keeper for writers, visual artists, photographers, illustrators, and videographers. Document creative work, record AI licensing preferences, and organize evidence of possible AI training use. Batch uploads, duplicate detection, and bulk edit are built in. Everything runs in your browser and nothing is uploaded.

---

## ✨ Features

**Single work records.** Title, creator, description, publication URL and date, AI licensing preference. Autofill from image metadata (EXIF and XMP). SHA-256 fingerprint per file, computed locally. Compressed preview thumbnail saved with each work so exports stay recognizable after reimport.

**Batch mode.** Upload many files at once. Files auto group by filename stem and by perceptual hash for visually similar shots. Rename, split, merge, or move individual files between works before saving.

**Duplicate detection.** Exact SHA-256 matches are caught against your collection and against other files in the same upload. You choose to skip or keep. Visually similar files get a review warning, never removed automatically.

**Bulk edit.** Select works with checkboxes to change the creator name, change the AI licensing preference, or add an evidence entry to all of them at once. Bulk delete too.

**Evidence tracking.** Four categories, quick add paste box, saved in your browser when available, reusable across works, and portable via Copy evidence.

**Export and import.** JSON with preview thumbnails for reimport, CSV for spreadsheets, print friendly report, replace or merge on import.

---

## 🚫 What this tool does not do

It does not detect AI training use, verify authorship or ownership, contact companies, or collect payments. It is not a substitute for legal advice.

---

## 🔐 Privacy

Images and records stay in your browser. Nothing is uploaded. Evidence entries live in local storage when available and can be cleared anytime. Works exist only in the current tab, so export JSON before closing.

---

## 🛠️ Tech Stack

Vanilla JavaScript (ES6+), modern CSS3, self hosted exifr for metadata, Web Crypto API for SHA-256, HTML Canvas for thumbnails, localStorage for evidence, GitHub Pages for hosting. No build step.

---

## 🚀 Quick Start

Requires Python 3.7 or newer.

1. `cd` to the project folder.
2. Run `python -m http.server 8000`.
3. Open `http://localhost:8000`.
4. Optional: `http://localhost:8000/tests/test.html` runs the browser tests.

Fingerprinting works on localhost because browsers treat it as a secure context.

---

## 📁 File structure

Single directory, no build step. `index.html`, `styles.css`, `app.js`, `vendor/exifr.js`, `tests/test.html`. Bump the `?v=` number on both `app.js` and `styles.css` after changes so browsers do not serve a stale copy.

---

## 📌 Limitations

- 50 MB max per file.
- Autofill applies to images only. Videos are fingerprinted and previewed but carry no EXIF.
- Fingerprinting requires HTTPS or localhost.
- Works are not saved across browser sessions. Export JSON to keep your collection.

---

## ☕ Support

- 💖 [Sponsor on GitHub](https://github.com/sponsors/IdaAkiwumi)
- ☕ [Donate via PayPal](https://www.paypal.com/paypalme/iakiwumi)

---

## License

MIT License. See [LICENSE](LICENSE). Built by [Ida Akiwumi](https://github.com/IdaAkiwumi). Design language adapted from the [Maryland Housing Burden](https://github.com/IdaAkiwumi/md-housing-reality) project.
