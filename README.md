# AI-EIP

Enterprise AI portal deck with local narration / admin tooling.

## Public site (Cloudflare Workers)

Static deck is served from `presentations/` via Workers static assets.

- After deploy: `https://ai-eip.<your-subdomain>.workers.dev`
- Root `/` redirects to `/enterprise-ai-portal-deck.html`

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
