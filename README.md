# AIDC 簡報庫（myppt）

Public HTML decks for [myppt.aidc.work](https://myppt.aidc.work), plus local narration / admin tooling.

## Public site (Cloudflare Workers)

Static files are served from `presentations/` via Workers static assets.

- Library: `https://myppt.aidc.work/`
- Enterprise deck: `/enterprise-ai-portal-deck.html`
- Course deck (PCCU 1151, 2026-10-03): `/pccu-1151-bigdata-2026-10-03.html`
- Catalog: `/decks/registry.json`

Push to `main` triggers GitHub Actions → `wrangler deploy` (requires repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`).

```powershell
npm install
npm run deploy
```

## Local admin (not deployed)

Express admin + LLM / TTS pipeline stays on your machine only. Do **not** commit `.env`.

```powershell
copy .env.example .env
# fill OPENAI_API_KEY / ADMIN_SECRET as needed
npm install
npm run dev
```

- Enterprise deck: http://localhost:8787/enterprise-ai-portal-deck.html
- PCCU deck: http://localhost:8787/pccu-1151-bigdata-2026-10-03.html
- Admin: http://localhost:8787/admin/?deck=enterprise-ai-portal-deck
- Admin（pccu）: http://localhost:8787/admin/?deck=pccu-1151-bigdata-2026-10-03

後台只列出 `presentations/decks/registry.json` 裡 `pipeline: "native"` 的簡報。講稿、重生講稿、TTS 依 deckId 寫入該 deck 的 manifest 與音訊目錄。

## 單一可編輯、可講者管線

目標格式：

| 角色 | 路徑 |
|------|------|
| SSOT | `presentations/decks/<deckId>.slides.json` |
| 發佈用 HTML | `presentations/<deckId>.html`（`<main id="deck">` 可由 `build:deck` 覆寫） |
| 旁白 manifest | `presentations/narration/<deckId>.json` |
| 音訊 | `presentations/narration/audio/<deckId>/sNN.mp3` |

CLI 省略 `--deck` 時仍預設 `enterprise-ai-portal-deck`。

```powershell
npm test
npm run narration:validate -- --deck=pccu-1151-bigdata-2026-10-03
npm run narration:tts -- --deck=pccu-1151-bigdata-2026-10-03
npm run build:deck -- pccu-1151-bigdata-2026-10-03 --check
```

`htmlRebuild`（registry）：

- `safe`：允許 `build:deck` 覆寫 `<main id="deck">`。目前沒有 deck 使用這個值。
- `gated`：先做 round-trip 檢查，`<main>` 與現有 HTML 不等價就拒絕寫入。enterprise 與 pccu-1151 都是這類，Admin 仍可編講稿與 TTS。enterprise 的已發佈 HTML 含 slides.json 還原不了的區塊（例如第 8 頁同時有 cards 與 flow）。pccu 則有 `grid four`、雙 grid、`pitch`、`slogan-stack`、`card risk`、`flow-step gate`。職稱文字是直接改字，沒有整頁 rebuild。
- `off`：手寫 HTML 或 PDF 殼層，維持原 SSOT，不要跑 `build:deck`。

頁尾職稱的單一來源是 `presentations/branding.json`（`role` 為 `AI發展顧問`）。`build:deck` 經 `normalizeBrand()` 套用；已有人名（黃燕忠、Jack Y. J. Hwang）會留在職稱前面。手寫／gated HTML 只改這個字，不跑 rebuild。PDF deck 不動。各 deck 頁首仍是該份簡報的標題，不是職稱。

Enterprise 舊網址 `narration/audio/sNN.mp3` 是指向 `narration/audio/enterprise-ai-portal-deck/sNN.mp3` 的相對 symlink。Manifest 的 `audioUrl` 已改成 per-deck 路徑。

## 還沒進原生管線的 deck

PDF（`test-pdf-deck`、`taiwan-ai-strategic-blueprint`）與 `deck`（`fyh-deck-chrome`）不是這次的遷移目標。其餘 HTML（含 slides.json 裡標過 `ai-eip-native` 的檔）在 rebuild 被證明等價之前，registry 標成 `html-hand` / `htmlRebuild: off`。

`presentations/deck.html` 參考這三個路徑，倉庫與線上目前都沒有檔案（2026-10-13 對 https://myppt.aidc.work 發 GET，目錄列表與三個 URL 都是 404，回應本文為空）：

- `/deck/assets/deck-chrome.css`
- `/deck/assets/deck-chrome.js`
- `/deck/assets/dachan-logo.png`

因此沒有可提交的 live-only 資產。不要把 404 做成空檔放進 git。`presentations/narration/audio/temp_script.js` 不在工作樹，也不在這條分支的 git 歷史裡。

## 不要直接合併部署

`main` 的 GitHub Actions 會 `wrangler deploy`，用 git 裡的 `presentations/` 覆蓋 Workers 靜態資產。上面三個 URL 現在就是 404，所以這次沒有東西可同步；若線上之後又補上同路徑檔案，合併前仍要先放進 `presentations/deck/assets/`。另外請確認部署會跟著 symlink 把 `narration/audio/sNN.mp3` 的內容送上去。這個分支不需要、也不應部署。

## Scope

| Surface | Where |
|--------|--------|
| Deck HTML / JSON / approved MP3 | Cloudflare |
| Admin UI, TTS, script generation | Local only |
