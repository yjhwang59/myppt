import adminHtml from "../admin/index.html";
import adminCss from "../admin/admin.css";
import adminJs from "../admin/admin.js";
import parseJs from "../admin/parse-source-url.js";
import promptContract from "../scripts/narration/prompts/slide-script.v1.md";
import { ALL_VOICES } from "../server/lib/voices.js";
import {
  REMEMBER_MAX_AGE_MS,
  SESSION_COOKIE,
  googleAuthConfig,
  isEmailAllowed,
  readSession,
  sessionExpiry,
  signSession,
} from "../server/lib/session.js";
import { catalogFromRegistry } from "./catalog.js";
import { verifyGoogleIdToken } from "./google-id-token.js";
import { BRIDGE_PATH, bridgePageHtml } from "./login-bridge.js";
import { serveStudioAsset } from "./public-assets.js";
import { customVoiceOption, handleStudioApi } from "./studio-api.js";

const LOCAL_ONLY = "線上後台目前只能瀏覽簡報庫。這個動作請用本機工作室。";

const ADMIN_FILES = {
  "/admin": adminHtml,
  "/admin/": adminHtml,
  "/admin/index.html": adminHtml,
  "/admin/admin.css": adminCss,
  "/admin/admin.js": adminJs,
  "/admin/parse-source-url.js": parseJs,
};

const ADMIN_TYPES = {
  "/admin": "text/html; charset=utf-8",
  "/admin/": "text/html; charset=utf-8",
  "/admin/index.html": "text/html; charset=utf-8",
  "/admin/admin.css": "text/css; charset=utf-8",
  "/admin/admin.js": "text/javascript; charset=utf-8",
  "/admin/parse-source-url.js": "text/javascript; charset=utf-8",
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function rememberRequested(body) {
  return body?.remember === true || body?.remember === "1" || body?.remember === "on";
}

function sessionCookie(token, remember, secure) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, "HttpOnly", "Path=/", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  if (remember) parts.push(`Max-Age=${Math.floor(REMEMBER_MAX_AGE_MS / 1000)}`);
  return parts.join("; ");
}

function clearCookie(secure) {
  const parts = [`${SESSION_COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function currentSession(request, env) {
  const cookies = parseCookies(request.headers.get("cookie"));
  return readSession(cookies[SESSION_COOKIE] || "", env.ADMIN_SECRET || "");
}

async function loadCatalog(env, request) {
  const assetUrl = new URL("/decks/registry.json", request.url);
  const res = await env.ASSETS.fetch(new Request(assetUrl.toString()));
  if (!res.ok) return json({ error: "讀不到簡報目錄" }, 500);
  return catalogFromRegistry(await res.json());
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  const { pathname } = url;
  const method = request.method.toUpperCase();

  if (method === "GET" && pathname === "/api/health") return json({ ok: true });

  if (method === "GET" && pathname === "/api/auth/config") {
    const config = googleAuthConfig(env);
    const cloudStudio = Boolean(env.STUDIO);
    return json({ googleClientId: config.googleClientId, ready: config.ready, studio: cloudStudio, cloudStudio });
  }

  if (method === "POST" && pathname === "/api/login/google") {
    const config = googleAuthConfig(env);
    if (!config.ready) return json({ error: "Google 登入尚未設定" }, 503);
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const credential = String(body?.credential || "");
    if (!credential) return json({ error: "缺少 Google 登入憑證" }, 400);
    try {
      const profile = await verifyGoogleIdToken(credential, config.googleClientId);
      if (!profile.emailVerified) return json({ error: "此 Google 帳號尚未完成信箱驗證" }, 403);
      if (!isEmailAllowed(profile.email, config.allowedEmails)) {
        return json({ error: "此 Google 帳號未在白名單" }, 403);
      }
      const remember = rememberRequested(body);
      const token = signSession(
        { email: profile.email, expiresAt: sessionExpiry(remember) },
        env.ADMIN_SECRET
      );
      return json({ ok: true, email: profile.email, studio: Boolean(env.STUDIO), cloudStudio: Boolean(env.STUDIO) }, 200, {
        "set-cookie": sessionCookie(token, remember, secure),
      });
    } catch {
      return json({ error: "Google 登入驗證失敗" }, 401);
    }
  }

  if (method === "POST" && pathname === "/api/logout") {
    const wantsJson = (request.headers.get("accept") || "").includes("application/json");
    const headers = { "set-cookie": clearCookie(secure) };
    if (wantsJson) return json({ ok: true }, 200, headers);
    return new Response(null, { status: 303, headers: { ...headers, location: "/admin/" } });
  }

  const session = currentSession(request, env);
  if (!session) return json({ error: "尚未登入" }, 401);

  if (method === "GET" && pathname === "/api/session") {
    const cloudStudio = Boolean(env.STUDIO);
    return json({ ok: true, email: session.email, studio: cloudStudio, cloudStudio });
  }
  if (method === "GET" && pathname === "/api/voices") {
    const custom = await customVoiceOption(env);
    return json({ voices: custom ? [...ALL_VOICES, custom] : ALL_VOICES });
  }

  const studioResponse = await handleStudioApi(request, env, session, promptContract);
  if (studioResponse) return studioResponse;
  if (method === "GET" && pathname === "/api/llm-models") {
    return json({
      defaultModel: "gpt-4o-mini",
      presets: [
        { id: "gpt-4o-mini", label: "gpt-4o-mini（預設，較省）", supportsVision: true },
        { id: "gpt-4o", label: "gpt-4o（vision 較準）", supportsVision: true },
        { id: "gpt-4.1-mini", label: "gpt-4.1-mini", supportsVision: true },
        { id: "gpt-4.1", label: "gpt-4.1", supportsVision: true },
      ],
      allowCustom: true,
    });
  }

  if (method === "GET" && (pathname === "/api/categories" || pathname === "/api/decks" || pathname.startsWith("/api/decks/"))) {
    const catalog = await loadCatalog(env, request);
    if (catalog instanceof Response) return catalog;
    if (pathname === "/api/categories") return json({ ok: true, categories: catalog.categories });
    if (pathname === "/api/decks") return json({ decks: catalog.decks });
    const deckId = pathname.slice("/api/decks/".length).split("/")[0];
    const deck = catalog.decks.find((item) => item.deckId === deckId);
    if (!deck) return json({ error: "deck not found" }, 404);
    if (pathname === `/api/decks/${deckId}`) return json(deck);
    return json({ error: LOCAL_ONLY }, 501);
  }

  if (method === "GET") return json({ error: "找不到這個功能" }, 404);
  return json({ error: LOCAL_ONLY }, 501);
}

function adminResponse(pathname) {
  const body = ADMIN_FILES[pathname];
  if (!body) return null;
  return new Response(body, {
    headers: {
      "content-type": ADMIN_TYPES[pathname],
      "cache-control": "no-store",
      "cross-origin-opener-policy": "same-origin-allow-popups",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const bridgeHost = url.hostname === "aidc.work" || url.hostname === "www.aidc.work";
    if (bridgeHost && (url.pathname === BRIDGE_PATH || url.pathname === `${BRIDGE_PATH}/`)) {
      return new Response(bridgePageHtml(), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (bridgeHost) return new Response("Not found", { status: 404 });

    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    const admin = adminResponse(url.pathname);
    if (admin) return admin;
    const overlay = await serveStudioAsset(request, env, currentSession(request, env));
    if (overlay) return overlay;
    return env.ASSETS.fetch(request);
  },
};
