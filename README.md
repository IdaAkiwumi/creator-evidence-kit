# Creator Evidence Kit

**Live app:** https://idaakiwumi.github.io/creator-evidence-kit/

A free tool for visual artists, photographers, illustrators, and videographers to document
their creative work, record licensing preferences, and organize evidence of possible AI
training use. Upload images or videos and the app auto-fills the form from image
metadata, so you have less to type. Everything runs in your browser. Files are never
uploaded.

## What this tool does

- Records work details: title, creator, description, publication URL and date, licensing preference.
- Publication date defaults to today (editable); image metadata still replaces it when present.
- Quick fill for work details: paste a description or a publication link and the empty
  fields are filled for you.
- Auto-fills form fields from image metadata (EXIF and XMP): title, creator, date, description.
- Supports uploading multiple images and videos per work, with a primary file selection.
  Videos get a captured frame as a preview and carry no metadata auto-fill.
- Calculates a SHA-256 fingerprint of each file locally, without uploading them.
- Organizes evidence entries with clear categories (creator declaration, dataset index
  reference, company acknowledgment, other source).
- Quick evidence entry: new entries default to today's date (editable), and you can
  paste a link or a note into the Quick add box to create an entry with the link
  filled in. Paste the JSON from the Copy evidence button to restore saved entries
  (the button now reads "Save pasted evidence").
- Evidence entries are saved in your browser (when the browser allows it) and can be
  reused for future works, so you do not retype the same sources.
- Exports a lossless JSON file you can reopen later, a CSV summary for spreadsheets,
  and a print-friendly report.
- Works entirely offline after the page loads. No accounts, no backend, no tracking.

## What this tool does (additions)

- Change: AI licensing preference defaults to "Not available for AI licensing"
  (previously "Undecided").
- Change: after you import a JSON file, the creator/rights holder name from your
  imported works is remembered. New works pre-fill with that name so you don't
  retype it each time.
- Batch mode: upload many files at once. Files that share the leading part of
  their filename group together automatically. Files without a shared filename
  also group by a small perceptual hash of their preview image if they are
  visually near-duplicates. Every group becomes one work with its filename as
  the title. Rename, split, or merge groups before you save. This is the fastest
  way to document a large archive.

## Batch mode

1. Click "Batch: add many works" in the hero (or "Add many works at once" inside
   the single-work form).
2. Choose files. They will be processed locally and grouped.
3. Review the groups. Rename any work by editing its title. Remove files with the
   × button. Split a group into separate works, or merge two groups together.
4. Enter the creator name once. Choose an AI licensing preference for these
   works.
5. Click "Save N works" to add them to your collection.

The grouping is a starting point, not a claim about which files belong together.
It uses filename patterns and small image hashes. Nothing is saved until you
press "Save works". Every saved work carries its own preview and SHA-256
fingerprint, the same as a single-work record.


# Creator Evidence Kit

**Live app:** https://idaakiwumi.github.io/creator-evidence-kit/

A free tool for visual artists, photographers, illustrators, and videographers to document
their creative work, record licensing preferences, and organize evidence of possible AI
training use. Upload images or videos and the app auto-fills the form from image
metadata, so you have less to type. Everything runs in your browser. Files are never
uploaded.

## What this tool does

- Records work details: title, creator, description, publication URL and date, licensing preference.
- Publication date defaults to today (editable); image metadata still replaces it when present.
- Quick fill for work details: paste a description or a publication link and the empty
  fields are filled for you.
- Auto-fills form fields from image metadata (EXIF and XMP): title, creator, date, description.
- Supports uploading multiple images and videos per work, with a primary file selection.
  Videos get a captured frame as a preview and carry no metadata auto-fill.
- Calculates a SHA-256 fingerprint of each file locally, without uploading them.
- Saves a small compressed preview of each image (and a captured frame for videos) with
  the record, so exports include thumbnails you can see after re-importing.
- Organizes evidence entries with clear categories (creator declaration, dataset index
  reference, company acknowledgment, other source).
- Quick evidence entry: new entries default to today's date (editable), and you can
  paste a link or a note into the Quick add box to create an entry with the link
  filled in. Paste the JSON from the Copy evidence button to restore saved entries.
- Evidence entries are saved in your browser (when the browser allows it) and can be
  reused for future works.
- Exports a lossless JSON file you can reopen later (with image previews), a CSV
  summary for spreadsheets, and a print-friendly report.
- Works entirely offline after the page loads. No accounts, no backend, no tracking.

## What this tool does not do

- It does not detect whether your work was used to train an AI model.
- It does not verify authorship or legal ownership.
- It does not contact companies or collect payments.
- It is not a substitute for legal advice.

## Privacy

- Your images and records stay in your browser. Nothing is ever uploaded.
- Your evidence entries are saved in your browser's local storage (when the browser
  allows it) so they can be restored and reused. You can remove them at any time
  with the "Clear saved evidence from this browser" button, or keep a portable copy
  with the Copy evidence button. Nothing is sent anywhere.
- Works and their images are kept in browser memory only. Export JSON before closing
  the tab to keep your collection.
- Exports contain work details, licensing preferences, evidence entries, image
  metadata (filename, size, fingerprint), and a small compressed **preview thumbnail**
  of each saved file (up to ~400px, JPEG, tens of KB each). They do not contain your
  original artwork at full resolution.

## Saved image previews in exports

When you save a work, the app generates a compact thumbnail of each image and a
captured frame for each video. These previews live alongside the file record and are
included in the exported JSON under `images[].thumbnail_data_url`.

- **Preview:** importing that JSON restores real thumbnails in the collection and on
  the edit view, so you can recognize works after moving to another device.
- **Not the original:** a 20-image work at 50MB per file would produce a gigabyte-sized
  JSON if the full files were embedded. The preview is a ~400px JPEG instead, usually
  20–40KB per image. The SHA-256 fingerprint remains the record that a specific file
  existed on a specific date. Keep original files in your own storage.
- **Older exports:** JSON exported before this feature has no `thumbnail_data_url`, so
  the app shows a "No preview stored with this export" placeholder for those images
  instead of crashing. Everything else in the record is preserved.

Editing a saved work no longer wipes its saved images on save, unless you explicitly
click "Remove saved files" on that work.

## Quick start (local development)

These instructions use Windows PowerShell.

### 1. Check your Python version

Open PowerShell and run:

```powershell
python --version

## What this tool does not do

- It does not detect whether your work was used to train an AI model.
- It does not verify authorship or legal ownership.
- It does not contact companies or collect payments.
- It is not a substitute for legal advice.

## Privacy

- Your images and records stay in your browser. Nothing is ever uploaded.
- Your evidence entries are saved in your browser's local storage (when the browser
  allows it) so they can be restored and reused. You can remove them at any time
  with the "Clear saved evidence from this browser" button, or keep a portable copy
  with the Copy evidence button. Nothing is sent anywhere.
- Works and their images are kept in browser memory only. Export JSON before closing
  the tab to keep your collection.
- Exports contain work details, licensing preferences, evidence entries, and image
  metadata (filename, size, fingerprint). They do not contain your original artwork.

## Quick start (local development)

These instructions use Windows PowerShell.

### 1. Check your Python version

Open PowerShell and run:

```powershell
python --version
```

You should see Python 3.7 or newer. If Python is not found, install it from
[python.org](https://www.python.org/downloads/) and make sure "Add Python to PATH"
is checked during installation.

### 2. Start a local web server

Navigate to the project folder and start a simple server:

```powershell
cd C:\path\to\creator-evidence-kit
python -m http.server 8000
```

A successful result looks like:

```
Serving HTTP on :: port 8000 (http://[::]:8000/) ...
```

### 3. Open the app

In your browser, go to:

```
http://localhost:8000
```

Fingerprinting works on `localhost` because browsers treat it as a secure context.
Press `Ctrl+C` in PowerShell to stop the server when done.

### 4. Stop the server

Press `Ctrl+C` in the PowerShell window where the server is running.

## Running tests

Open a second PowerShell window (keep the server running) and start another server
from the same folder on a different port, or simply open the test page in your browser:

```
http://localhost:8000/tests/test.html
```

The test page runs automated checks in your browser and shows results on screen.

## Deployment (GitHub Pages)

1. Create a new repository on GitHub named `creator-evidence-kit` (public).
2. Push these files to the `main` branch.
3. In the repository, go to **Settings → Pages**.
4. Under **Source**, select `main` branch, `/ (root)`, and save.
5. The site will be available at `https://<your-username>.github.io/creator-evidence-kit/`.

No build step is required. The site is plain HTML, CSS, and JavaScript.

Note: `index.html` loads `app.js?v=4` and `styles.css?v=4` so browsers and CDNs
cannot serve a stale copy after an update. When you change these files, bump the
version number in both places (`index.html` and `tests/test.html`).

## File structure

```
creator-evidence-kit/
├── index.html       Main page
├── styles.css       Styles (light and dark themes)
├── app.js           Application logic
├── tests/
│   └── test.html    Browser-based automated tests
└── README.md        This file
```

## Data format

Exports use a versioned JSON schema (version 2, with support for importing version 1):

```json
{
  "schema": "creator-evidence-kit",
  "version": 2,
  "exported_at": "2026-01-01T12:00:00.000Z",
  "works": [
    {
      "id": "w_...",
      "title": "Example title",
      "creator": "Your name",
      "description": "A short description",
      "url": "https://example.com",
      "date": "2023-06-15",
      "licensing": "not_available",
      "images": [
        {
          "filename": "photo.jpg",
          "byte_size": 12345,
          "mime_type": "image/jpeg",
          "sha256": "abc123...",
          "algorithm": "SHA-256",
          "is_primary": true
        }
      ],
      "evidence": [
        {
          "id": "ev_...",
          "category": "creator_declaration",
          "source_url": "",
          "observed_at": "2025-01-10",
          "entity": "",
          "notes": "Your notes"
        }
      ],
      "created_at": "...",
      "updated_at": "...",
      "is_sample": false
    }
  ]
}
```

## Image metadata auto-fill

When you select images, the app reads the metadata embedded in your files (EXIF and XMP
data stored by your camera or editing software) to auto-fill the title, creator, date,
and description fields. The auto-fill is a starting point — always review the values
and correct anything that is wrong.

The auto-fill uses the [exifr](https://github.com/MikeKovarik/exifr) library (MIT
license), self-hosted at `vendor/exifr.js` so the app has no runtime dependency on a
CDN and works offline once loaded. If the library fails to load, the app still works;
you just fill in the fields manually.

## Evidence entries

The evidence section is designed to need as little typing as possible:

- **Today's date by default.** New evidence entries start with today's date in
  "Date observed". Change or clear it if you observed the source on another day.
- **Quick add paste box.** Paste a link or a note (for example a sentence about where
  your work appears). The first link in the text goes into Source URL and the full text
  is kept in Notes. Dates found inside pasted text are deliberately not used: a
  publication date is not the date you observed the source.
- **Copy evidence.** Copies your current entries as readable JSON. Paste that JSON back
  into the Quick add box (on this device or another) to restore them with their dates
  and categories intact. If the browser blocks the clipboard, the app shows the text for
  manual copying instead.
- **Saved in your browser.** When local storage is available, your in-progress entries
  are saved automatically and restored when you come back. The status line under the
  evidence section tells you whether that is happening.
- **Reuse saved evidence.** Entries you saved with earlier works are listed for reuse.
  Adding one starts a new observation dated today (you can edit the date), so the same
  sources do not need to be retyped for each new work.
- **Clear saved evidence.** Removes the saved entries and reuse list from this browser.
  Works in your collection are not affected.

The paste parser works only on text you supply. It never visits links, verifies
contents, or guesses company names from domains.

## Tested behavior

The following has been verified in the browser tests:

- Create a work → edit it → export JSON → reload → import JSON preserves all data.
- Multiple evidence entries survive JSON export and import.
- Multiple images with primary selection survive JSON export and import.
- Version 1 imports (single image field) are normalized to version 2.
- Invalid import files leave existing records intact.
- SHA-256 fingerprinting matches known test vectors.
- Filename-to-title conversion and EXIF date conversion work correctly.
- Auto-fill tracks which fields the user has manually edited.
- New evidence entries default to today's local date; restored entries keep their dates.
- Pasted text creates an entry with the link extracted; dates in pasted text are never
  used as the observation date.
- Saved-evidence JSON pastes back with dates and categories intact; invalid pastes
  change nothing.
- Evidence drafts save to local storage and restore after a reload; the fallback status
  appears when storage is blocked.
- Reused entries get fresh IDs and today's date.
- Copy evidence still works when clipboard access itself throws (sandboxed frames): the
  manual-copy fallback shows valid JSON, and pasting it back restores every field
  including the original dates.
- If a storage write fails mid-session (for example the quota is full), the status line
  stops claiming entries are saved and points to Copy evidence or Export JSON.
- If saving evidence for reuse fails when a work is submitted, the user is told
  immediately; the evidence is still part of the saved work and Export JSON keeps a copy.
- Pasting a full collection export into Quick add is rejected with a pointer to the
  Import section instead of creating a broken entry.
- Pasted text renders as text, never as HTML (no script execution).
- Selecting images sends no data over the network.
- New works start with today's publication date; image metadata replaces the
  untouched default; editing or importing preserves the recorded value, including blank.
- Quick fill fills only empty Description and Publication URL fields, reports what it
  filled and what it left unchanged, and marks pasted text as user-supplied.
- Videos get a captured frame as a thumbnail when the browser can decode them;
  undecodable videos keep a visible "Preview unavailable" card with their fingerprint.
- Mixed image and video selections work, including primary switching; the file
  survives export and import with its fingerprint.
- The saving-info tooltip opens by click and keyboard focus, in light and dark themes.
- Light and dark themes, mobile layout, and keyboard navigation.

## Limitations

- Maximum supported file size is 50 MB (images and videos).
- Metadata auto-fill applies to images only. Videos are fingerprinted and previewed,
  but carry no EXIF to fill the form with.
- Some videos (for example certain .mov files) cannot be decoded by the browser; they
  are still attached and fingerprinted, with a "Preview unavailable" note instead of a
  frame thumbnail.
- Fingerprinting requires HTTPS or localhost (browser security requirement).
- Works and images exist only in browser memory; export before closing the tab.
  Evidence entries are the exception: they are saved in local storage where available.
- Some environments (sandboxed previews, private browsing) block local storage; there
  the app tells you to keep copies with Copy evidence instead.
- This tool does not provide legal advice.

## License

MIT License. See [LICENSE](LICENSE).

## Credits

Built by [Ida Akiwumi](https://github.com/IdaAkiwumi).
Design adapted from the [Maryland Housing Burden](https://github.com/IdaAkiwumi/md-housing-reality) project.
