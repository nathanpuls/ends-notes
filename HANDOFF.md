# ends.at handoff

This repo is a very small Cloudflare Worker app for publishing Markdown as clean, readable web pages.

## Product idea

ends.at is meant to be a minimal text publishing tool:

- Paste Markdown.
- Preview it.
- Publish it to a short URL.
- Share the rendered page.

It is especially useful for sharing AI output, notes, drafts, summaries, plans, and Markdown stored in public Google Sheets.

The design goal is intentionally quiet: native system fonts, generous spacing, little chrome, and a focus on readable text.

## File map

| File | Purpose |
| --- | --- |
| `index.html` | Browser shell markup and external library/style/script references. |
| `styles.css` | Layout, typography, responsive rules, theme variables, menu/buttons, tables, and rendered Markdown styling. |
| `app.js` | Markdown rendering, routing state, menu actions, editor/preview behavior, publishing, color themes, and Sheet converter UI. |
| `worker.js` | Cloudflare Worker API and route handling. Stores published Markdown in KV and fetches public Google Sheets. |
| `wrangler.toml` | Cloudflare Worker config for `ends.at/*`, assets binding, and KV binding. |
| `home.md` | Markdown content for the home page at `/`. |
| `sheet.md` | Markdown content for the Google Sheet converter page at `/sheet`. |
| `home-option-one.md` | Saved alternate, more detailed marketing homepage copy. Not currently used by the app. |
| `.assetsignore` | Prevents `.git`, `.wrangler`, `node_modules`, Worker source/config, etc. from being uploaded as public static assets. |
| `.gitignore` | Keeps local Wrangler and dependency artifacts out of git. |

## Runtime architecture

Cloudflare Worker serves both APIs and static assets.

`wrangler.toml` binds:

- `env.ASSETS`: static assets from the repo directory.
- `env.ENDS_NOTES`: KV namespace used for published Markdown.

Important warning: `assets.directory = "./"` means the repo root is the asset directory. Keep `.assetsignore` accurate so private/dev files are not uploaded as public assets.

## Routes

### Browser routes

| Route | Behavior |
| --- | --- |
| `/` | Loads `index.html`, then the client fetches `/home.md` and renders it read-only. |
| `/new` | Loads editor. Desktop shows editor plus preview; mobile shows editor only. |
| `/new?fresh=1` | Starts a blank editor and clears the local draft. Used by the home page Start Writing link. |
| `/p/:id` | Published Markdown page. Client fetches `/api/doc/:id` and renders read-only. |
| `/sheet` | Loads `sheet.md` and appends a Google Sheet URL-to-link converter UI. |
| `/s/:sheetId` | Renders Markdown from a public Google Sheet, or a generated index if there are multiple Markdown rows. |
| `/s/:sheetId/:slug` | Renders the Markdown row matching the slug from column B. |

`worker.js` rewrites `/p/*`, `/s/*`, `/new`, and `/sheet` to serve `index.html` so the client-side router can handle them.

### API routes

| Route | Method | Behavior |
| --- | --- | --- |
| `/api/publish` | `POST` | Accepts `{ "markdown": "..." }`, stores Markdown in KV, returns `{ id, url }`. |
| `/api/doc/:id` | `GET` | Returns stored Markdown record from KV. |
| `/api/sheet/:sheetId` | `GET` | Fetches a public Google Sheet as CSV and returns Markdown or an index page. |
| `/api/sheet/:sheetId/:slug` | `GET` | Fetches a specific Sheet row by slug. |

## Publishing model

Published Markdown is stored in KV:

- Markdown content is SHA-256 hashed.
- Hash key: `hash:${hash}` stores the existing document ID for deduplication.
- Markdown key: `md:${id}` stores JSON:

```json
{
  "markdown": "...",
  "createdAt": "ISO timestamp",
  "hash": "sha256 hash"
}
```

IDs are 8 random alphanumeric characters.

## Google Sheets model

The Worker fetches public Sheets using:

```text
https://docs.google.com/spreadsheets/d/:sheetId/gviz/tq?tqx=out:csv
```

Sheet rules:

- If there is exactly one filled cell anywhere in the sheet, that cell is rendered as Markdown.
- If there is more than one filled cell, rows are interpreted this way:
  - Column A: Markdown.
  - Column B: slug.
- `/s/:sheetId` returns a generated Markdown index if there are multiple Markdown rows.
- `/s/:sheetId/:slug` returns the matching row.

Slugs are preserved except leading/trailing slashes are removed. Empty slugs fall back to row/cell-based slugs.

## Client behavior

Markdown rendering uses `marked` from CDN. Code highlighting uses Prism from CDN.

Main modes are tracked in `currentMode`:

- `home`
- `new`
- `editing-published`
- `published`
- `sheet`
- `sheet-converter`

Important body classes:

- `publish-mode`: hides editor and shows rendered page only.
- `editor-mode`: shows the visible primary action button.
- `home-mode` and `sheet-mode`: hide the primary action button for pages where Publish/Edit is not relevant.

## Desktop UX

On desktop:

- `/new` shows split view: Markdown editor on the left, rendered preview on the right.
- The textarea auto-focuses on editor routes.
- A visible primary action button appears outside the menu:
  - `Publish` while editing.
  - `Edit` on published pages.
- The ellipsis menu is intentionally quiet: gray icon, no ring by default.

## Mobile UX

On mobile:

- `/new` shows the editor only. No split-screen.
- Published pages render preview-only.
- There is no separate preview toggle; publishing is the preview step because links are only visible once shared.
- The textarea blur handler auto-publishes on mobile when the user dismisses the keyboard, if there is content.
- Tapping the menu suppresses that blur auto-publish so the menu remains usable.

This blur-to-publish behavior is experimental and should be tested carefully on real iPhones.

## Menu and actions

Overflow menu currently includes:

- Home
- Create New Page
- Google Sheet
- Preview/Edit toggle on mobile
- Copy Markdown
- Copy Text

Publish and Edit are intentionally outside the overflow menu as the primary lifecycle actions.

## Local development

Start local dev server:

```bash
wrangler dev --local --ip 0.0.0.0 --port 8787
```

Local links:

- Mac: `http://localhost:8787`
- Fresh editor: `http://localhost:8787/new?fresh=1`
- Phone on same Wi-Fi, current known IP: `http://192.168.4.40:8787`

The IP can change. Check it with:

```bash
ipconfig getifaddr en0 || ipconfig getifaddr en1
```

## Deploy

Preflight:

```bash
node --check worker.js
node --check app.js
```

Deploy:

```bash
env -u CLOUDFLARE_API_TOKEN wrangler deploy
```

The local `CLOUDFLARE_API_TOKEN` environment variable did not have enough deploy permission. Unsetting it lets Wrangler use the OAuth login.

After deploy, verify:

```bash
curl -I https://ends.at/
curl https://ends.at/home.md
curl -I https://ends.at/worker.js
curl -I https://ends.at/.git/HEAD
```

`worker.js` and `.git/HEAD` should return `404`.

## Current live state

The site was last successfully deployed to `ends.at/*`.

Last known deployed version from Wrangler:

```text
c463e116-a315-4b5a-84d4-3f0a56502861
```

Note: there are local changes after that deploy, including the latest mobile single-panel flow, blur-to-publish behavior, visible Publish/Edit button, and quiet ellipsis styling. Deploy again when ready.

## Known rough edges and next ideas

- Mobile blur-to-publish may feel too aggressive. Test on iPhone keyboard dismissal, menu tapping, scrolling, and accidental background taps.
- Consider adding a tiny published confirmation state before redirect, or keep redirect as-is.
- Consider whether mobile should auto-copy the URL after blur publish. Currently it does not.
- Consider adding Mermaid rendering if Sheet examples include Mermaid blocks. Current renderer treats Mermaid as a code block.
- Consider moving assets into a dedicated `public/` folder later so `.assetsignore` is less critical.
- Consider adding tests for the CSV parser and Sheet row/slug behavior.

## Design principles to preserve

- Main actions should not be buried in overflow.
- Overflow is for utilities.
- Published pages should read like documents, not app screens.
- Mobile should avoid split-screen editing.
- Native fonts and spacing are part of the product.
- Keep the tool simple enough that AI-generated text can become a public page in seconds.
