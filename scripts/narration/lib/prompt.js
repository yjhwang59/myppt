import fs from "node:fs";
import { PROMPT_PATH } from "./paths.js";

export function loadPromptContract() {
  return fs.readFileSync(PROMPT_PATH, "utf8");
}

export function buildSlidePrompt({
  deckTitle,
  slideIndex,
  slideTotal,
  slideId,
  slideTitle,
  prevSlideSummary,
  nextSlideTitle,
  extractedContent,
}) {
  const contract = loadPromptContract();

  return `${contract}

---
## 本頁生成任務

- deckTitle: ${deckTitle}
- slideIndex: ${slideIndex}
- slideTotal: ${slideTotal}
- slideId: ${slideId}
- slideTitle: ${slideTitle}
- prevSlideSummary: ${prevSlideSummary || "（首頁，無前一頁）"}
- nextSlideTitle: ${nextSlideTitle || "（末頁，無下一頁）"}

## extractedContent (JSON)
${JSON.stringify(extractedContent, null, 2)}

請直接輸出講稿正文，不要加標題或說明。`;
}

export function buildSystemPrompt() {
  return `你是企業簡報講者。只能根據投影片結構化內容撰寫口語講稿。
不得新增投影片未出現的數字、客戶名稱、承諾或統計。
輸出繁體中文純文字一段，約 180–360 字，適合 45–90 秒口述。`;
}
