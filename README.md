# AIDC 簡報庫（myppt）

企業 AI 教學與架構簡報分享平台。公開站提供精選 HTML／PDF 簡報清單；已上架簡報可在線上工作室改頁、生成講稿與語音。新增簡報與分類仍用本機工作室。

## Public site (Cloudflare Workers)

Static decks are served from `presentations/` via Workers static assets.

- Public catalog: `https://myppt.aidc.work/`
- Individual deck: `https://myppt.aidc.work/{deckId}.html`
- Catalog: `/decks/registry.json`

The homepage lists curated decks only. Test decks (`test-*`), FYH weekly reports (`fyhgoogle-*`), and the generic `deck` id are not shown in the catalog, but their files remain reachable by direct URL.

**Preferred publish path:** use the local Admin「上傳正式環境」button (runs `wrangler deploy` with tokens from `.env`). GitHub Actions deploy is **manual only** (`workflow_dispatch`) so a git push does not overwrite decks/audio uploaded from admin.

```powershell
npm install
# or from Admin UI after filling CLOUDFLARE_* in .env
npm run deploy
```

### Unlisted decks (agent publish path)

Decks such as `hsingming-ai-dev-s1` and `hsingming-ai-dev-s2` live in `presentations/` with `<meta name="robots" content="noindex, nofollow">`. Do not add them to `registry.json`, the homepage, `decks/*.slides.json`, or a sitemap. They are reachable only by direct URL, for example `https://myppt.aidc.work/hsingming-ai-dev-s2`.

1. Open a PR and merge it to `main`.
2. Manually trigger **Deploy to Cloudflare Workers** (`workflow_dispatch`) from the Actions page, or via the GitHub API with a fine-grained token scoped to this repo and **Actions: Read and write**.

**Warning:** this Actions deploy publishes the repo contents. It can overwrite decks and audio uploaded from local Admin that are not committed. Commit those files, or re-upload them from Admin, before triggering the workflow.

## Local admin (not deployed)

Express admin + LLM / TTS / PDF import stays on your machine only. Do **not** commit `.env`.

```powershell
copy .env.example .env
# fill OPENAI_API_KEY / ADMIN_SECRET / GOOGLE_CLIENT_ID / GOOGLE_ALLOWED_EMAILS / CLOUDFLARE_* as needed
npm install
npm run dev
```

- Catalog: http://localhost:8787/
- Deck: http://localhost:8787/enterprise-ai-portal-deck.html
- myPPT簡報工作室: http://localhost:8787/admin/
- Login: Google 帳號。在 `.env` 設定 `GOOGLE_CLIENT_ID`、`GOOGLE_ALLOWED_EMAILS`，並用 `ADMIN_SECRET` 簽章工作階段 cookie。登入視窗開在已授權的 `https://aidc.work/myppt-auth`，完成後回到本機或 `https://myppt.aidc.work/admin/`。

### Import an HTML deck

```powershell
npm run import:html -- --file "<html-path>" --deck-id "<id>" --title "<title>"
```

### Speaker studio flow

1. Upload HTML (`.slide` sections) or PDF (pages → PNG + text)
2. Optional: paste or upload a **reference transcript** (`.txt`/`.md`) — saved locally under `data/transcripts/`
3. Choose **LLM model** in the toolbar (PDF decks use vision on page PNGs)
4. Generate scripts (all or per slide); preview zoom with +/- or Ctrl+wheel
5. Edit scripts; preview TTS (male/female voice) — voice setting persists across slides
6. Synthesize all audio; replay full deck
7. Iterate on scripts as needed
8. Publish → copy public URL `/{deckId}.html`

## Scope

| Surface | Where |
|--------|--------|
| Deck HTML / JSON / approved MP3 / PDF page images | Cloudflare (`presentations/`) |
| Admin UI, upload, TTS, script generation, wrangler publish | Local only |

## One-time audio path migration

If you still have flat `narration/audio/sNN.mp3` files:

```powershell
node scripts/narration/migrate-audio-paths.js
```

Audio now lives under `narration/audio/{deckId}/`.
