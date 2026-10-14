import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import {
  deckHtmlPath,
  deckPagesDir,
  pageImageRelativeUrl,
} from "../../scripts/narration/lib/paths.js";
import { ensureNarrationSupport, NARRATION_MIN_CSS, NARRATION_PANEL_HTML } from "./narration-inject.js";

async function loadPdfJs() {
  // pdfjs-dist v4+ ESM; prefer legacy build for Node
  try {
    const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return mod;
  } catch {
    return import("pdfjs-dist");
  }
}

/**
 * Rasterize PDF pages to 16:9 PNG and extract text.
 * @returns {{ pages: Array<{ index: number, slideId: string, title: string, text: string, imageUrl: string }> }}
 */
export async function importPdfToPages(pdfBuffer, deckId, opts = {}) {
  const title = opts.title || deckId;
  const pdfjs = await loadPdfJs();
  const { getDocument } = pdfjs;

  const loadingTask = getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableWorker: true,
  });
  const pdf = await loadingTask.promise;
  const pagesDir = deckPagesDir(deckId);
  fs.mkdirSync(pagesDir, { recursive: true });

  const TARGET_W = 1280;
  const TARGET_H = 720;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(TARGET_W / base.width, TARGET_H / base.height) * 2;
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    // Letterbox onto 16:9
    const out = createCanvas(TARGET_W, TARGET_H);
    const octx = out.getContext("2d");
    octx.fillStyle = "#0f172a";
    octx.fillRect(0, 0, TARGET_W, TARGET_H);
    const fit = Math.min(TARGET_W / canvas.width, TARGET_H / canvas.height);
    const dw = canvas.width * fit;
    const dh = canvas.height * fit;
    const dx = (TARGET_W - dw) / 2;
    const dy = (TARGET_H - dh) / 2;
    octx.drawImage(canvas, dx, dy, dw, dh);

    const fileName = `p${String(i).padStart(2, "0")}.png`;
    const abs = path.join(pagesDir, fileName);
    fs.writeFileSync(abs, out.toBuffer("image/png"));

    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const slideId = `s${i}`;
    pages.push({
      index: i,
      slideId,
      title: text.slice(0, 40) || `第 ${i} 頁`,
      text,
      imageUrl: pageImageRelativeUrl(deckId, i),
    });
  }

  const html = buildPdfPlayerHtml(deckId, title, pages);
  fs.writeFileSync(deckHtmlPath(deckId), html, "utf8");

  return { pages, title, pageCount: pages.length };
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPdfPlayerHtml(deckId, title, pages) {
  const slides = pages
    .map(
      (p, idx) => `
    <section class="slide${idx === 0 ? " active" : ""}" id="${p.slideId}" data-title="${escapeHtml(p.title)}">
      <img class="page-img" src="${p.imageUrl}" alt="${escapeHtml(p.title)}" />
      <div class="footer"><span>${escapeHtml(title)}</span><span>${p.index} / ${pages.length}</span></div>
    </section>`
    )
    .join("\n");

  const raw = `<!DOCTYPE html>
<html lang="zh-Hant" data-deck-id="${deckId}" data-source-type="pdf">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${NARRATION_MIN_CSS}
  <style>
    :root { --bg:#0b1220; --text:#e2e8f0; --muted:#94a3b8; --accent:#3b82f6; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:"Segoe UI","Noto Sans TC",sans-serif; }
    #deck-header { display:flex; gap:8px; align-items:center; padding:10px 14px; background:#1e293b; border-bottom:1px solid #334155; }
    #deck-header button, #btn-narration { padding:6px 10px; border-radius:8px; border:1px solid #475569; background:#334155; color:var(--text); cursor:pointer; }
    #deck { position:relative; width:100%; height:calc(100vh - 52px); display:flex; align-items:center; justify-content:center; }
    .slide { display:none; width:min(96vw, calc(96vh * 16 / 9)); aspect-ratio:16/9; position:relative; background:#000; border-radius:12px; overflow:hidden; }
    .slide.active { display:block; }
    .page-img { width:100%; height:100%; object-fit:contain; background:#0f172a; }
    .footer { position:absolute; left:0; right:0; bottom:0; display:flex; justify-content:space-between; padding:8px 14px; font-size:12px; color:var(--muted); background:linear-gradient(transparent, rgba(0,0,0,.55)); }
    #slide-counter { margin-left:auto; color:var(--muted); font-size:13px; }
  </style>
</head>
<body>
  <header id="deck-header">
    <strong>${escapeHtml(title)}</strong>
    <button type="button" id="btn-prev">‹</button>
    <button type="button" id="btn-next">›</button>
    <span id="slide-counter">1 / ${pages.length}</span>
    <button type="button" id="btn-narration" title="講者模式 (N)">講者</button>
  </header>
  <main id="deck">
${slides}
  </main>
  ${NARRATION_PANEL_HTML}
  <script>
    (function(){
      const slides=[...document.querySelectorAll('.slide')];
      let i=0;
      const counter=document.getElementById('slide-counter');
      function show(n){
        i=Math.max(0,Math.min(slides.length-1,n));
        slides.forEach((s,idx)=>s.classList.toggle('active',idx===i));
        if(counter) counter.textContent=(i+1)+' / '+slides.length;
        document.dispatchEvent(new CustomEvent('deck:slidechange',{detail:{index:i,slideId:slides[i].id}}));
      }
      document.getElementById('btn-prev').onclick=()=>show(i-1);
      document.getElementById('btn-next').onclick=()=>show(i+1);
      document.addEventListener('deck:request-prev',()=>show(i-1));
      document.addEventListener('deck:request-next',()=>show(i+1));
      document.addEventListener('keydown',(e)=>{
        if(e.key==='ArrowLeft') show(i-1);
        if(e.key==='ArrowRight'||e.key===' ') { e.preventDefault(); show(i+1); }
        if(e.key==='Home') show(0);
        if(e.key==='End') show(slides.length-1);
      });
      window.deckController={ getIndex:()=>i, goTo:show };
      show(0);
    })();
  </script>
  <script src="narration/deck-narration-player.js"></script>
</body>
</html>`;

  return ensureNarrationSupport(raw, deckId);
}

/**
 * Build extracted slide records for narration manifest from PDF pages.
 */
export function pdfPagesToExtracted(pages) {
  return pages.map((p) => ({
    slideId: p.slideId,
    index: p.index,
    title: p.title,
    extractedContent: {
      eyebrow: `${String(p.index).padStart(2, "0")} / ${p.title}`,
      kicker: "",
      headings: [p.title],
      lead: p.text || p.title,
      stamp: "",
      cards: [],
      table: null,
      flowSteps: [],
      svgLabels: [],
      callouts: [],
      pageImageUrl: p.imageUrl,
    },
  }));
}
