import { spawn } from "node:child_process";
import path from "node:path";
import { REPO_ROOT } from "../../scripts/narration/lib/paths.js";

/**
 * Run wrangler deploy and parse workers.dev URL from stdout.
 */
export function runWranglerDeploy({ timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    };

    if (!env.CLOUDFLARE_API_TOKEN) {
      reject(new Error("缺少 CLOUDFLARE_API_TOKEN（請寫入本機 .env）"));
      return;
    }

    const child = spawn("npx", ["wrangler", "deploy"], {
      cwd: REPO_ROOT,
      env,
      shell: true,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`wrangler deploy 逾時（${timeoutMs}ms）`));
    }, timeoutMs);

    child.stdout.on("data", (buf) => {
      stdout += buf.toString();
    });
    child.stderr.on("data", (buf) => {
      stderr += buf.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const combined = `${stdout}\n${stderr}`;
      const urlMatch =
        combined.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\/?/i) ||
        combined.match(/Deployed\s+\S+\s+triggers?\s+(https:\/\/\S+)/i);

      if (code !== 0) {
        reject(new Error(`wrangler deploy 失敗 (exit ${code}): ${stderr.slice(-800) || stdout.slice(-800)}`));
        return;
      }

      const baseFromEnv = (process.env.PUBLIC_DECK_BASE_URL || "").replace(/\/$/, "");
      const parsed = urlMatch ? urlMatch[0].replace(/\/$/, "") : "";
      resolve({
        ok: true,
        baseUrl: baseFromEnv || parsed,
        stdout: stdout.slice(-2000),
        stderr: stderr.slice(-1000),
      });
    });
  });
}

export function publicDeckUrl(baseUrl, deckId) {
  const base = (baseUrl || process.env.PUBLIC_DECK_BASE_URL || "").replace(/\/$/, "");
  if (!base) return `/${deckId}.html`;
  return `${base}/${deckId}.html`;
}
