# AIDC 簡報庫（myppt）

Public HTML decks for [myppt.aidc.work](https://myppt.aidc.work), plus local narration / admin tooling.

## Public site (Cloudflare Workers)

Static files are served from `presentations/` via Workers static assets.

- Library: `https://myppt.aidc.work/`
- Enterprise deck: `/enterprise-ai-portal-deck.html`
- Course deck (PCCU 1151, 2026-10-03): `/pccu-1151-bigdata-2026-10-03.html`
- Course deck (PCCU 1151, 2026-10-10): `/pccu-1151-bigdata-2026-10-10.html`
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

- Deck: http://localhost:8787/enterprise-ai-portal-deck.html
- Admin: http://localhost:8787/admin/

## Scope

| Surface | Where |
|--------|--------|
| Deck HTML / JSON / approved MP3 | Cloudflare |
| Admin UI, TTS, script generation | Local only |
