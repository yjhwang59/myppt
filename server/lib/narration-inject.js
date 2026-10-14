/**
 * Shared narration panel markup + ensure data-deck-id / player script on HTML decks.
 */
import * as cheerio from "cheerio";

export const NARRATION_PANEL_HTML = `
<aside id="narration-panel" aria-hidden="true" aria-label="講者模式">
  <header>
    <div class="header-left">
      <strong>講者模式</strong>
      <span id="narration-status">載入中…</span>
    </div>
    <div class="header-actions">
      <button type="button" class="icon-btn" id="narration-minimize" title="最小化" aria-label="最小化">－</button>
      <button type="button" class="icon-btn" id="narration-close" title="關閉講者模式 (N)" aria-label="關閉">×</button>
    </div>
  </header>
  <div id="narration-avatar" aria-hidden="true"></div>
  <p id="narration-script">載入講稿…</p>
  <div id="narration-progress" aria-hidden="true"><i id="narration-progress-bar"></i></div>
  <div class="narration-controls">
    <button type="button" id="narration-prev-seg" title="上一頁">⏮</button>
    <button type="button" id="narration-play" title="播放 / 暫停 (R)">▶</button>
    <button type="button" id="narration-stop" title="停止">⏹</button>
    <button type="button" id="narration-next-seg" title="下一頁">⏭</button>
  </div>
  <div class="narration-settings">
    <label><input type="checkbox" id="narration-auto-advance" checked />播完自動翻頁</label>
    <label><input type="checkbox" id="narration-auto-play-next" checked />翻頁後自動播放</label>
    <label>音量<input type="range" id="narration-volume" min="0" max="1" step="0.05" value="1" /></label>
    <label>語速<input type="range" id="narration-rate" min="0.75" max="1.5" step="0.05" value="1" /><span id="narration-rate-value">1.0×</span></label>
  </div>
</aside>
`.trim();

export const NARRATION_MIN_CSS = `
<style id="narration-chrome-css">
#narration-panel{position:fixed;right:16px;bottom:16px;z-index:90;width:min(360px,92vw);max-height:70vh;overflow:auto;background:rgba(15,23,42,.94);color:#e2e8f0;border:1px solid #334155;border-radius:14px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.45);display:none}
#narration-panel.open{display:block}
#narration-panel.minimized{max-height:none;width:auto}
#narration-panel.minimized #narration-script,#narration-panel.minimized #narration-avatar,#narration-panel.minimized .narration-settings{display:none}
#narration-panel header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
#narration-panel .icon-btn{background:#1e293b;border:1px solid #475569;color:#e2e8f0;border-radius:8px;cursor:pointer}
#narration-script{font-size:14px;line-height:1.55;margin:8px 0;white-space:pre-wrap}
#narration-progress{height:4px;background:#334155;border-radius:4px;overflow:hidden;margin:8px 0}
#narration-progress-bar{display:block;height:100%;width:0;background:#3b82f6}
.narration-controls{display:flex;gap:8px;margin:8px 0}
.narration-controls button{padding:6px 10px;border-radius:8px;border:1px solid #475569;background:#334155;color:#e2e8f0;cursor:pointer}
.narration-settings{display:grid;gap:6px;font-size:12px;color:#94a3b8}
#btn-narration{margin-left:8px}
</style>
`.trim();

/**
 * Ensure uploaded HTML has data-deck-id, narration panel, toggle button, and player script.
 */
export function ensureNarrationSupport(html, deckId) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $("html").attr("data-deck-id", deckId);
  $("html").attr("lang", $("html").attr("lang") || "zh-Hant");

  if (!$("#narration-chrome-css").length && !$("style").text().includes("#narration-panel")) {
    $("head").append(NARRATION_MIN_CSS);
  }

  if (!$("#narration-panel").length) {
    $("body").append(NARRATION_PANEL_HTML);
  }
  $("#narration-panel").attr("data-deck-id", deckId);

  // Ensure a toolbar toggle if header-like element exists
  if (!$("#btn-narration").length) {
    const header = $("#deck-header, header").first();
    if (header.length) {
      header.append('<button type="button" id="btn-narration" title="講者模式 (N)">講者</button>');
    } else {
      $("body").prepend('<button type="button" id="btn-narration" style="position:fixed;top:12px;right:12px;z-index:80" title="講者模式 (N)">講者</button>');
    }
  }

  if (!$('script[src*="deck-narration-player"]').length) {
    $("body").append('<script src="narration/deck-narration-player.js"></script>');
  }

  return $.html();
}
