export function buildSlidePrompt({
  deckTitle,
  slideIndex,
  slideTotal,
  slideId,
  slideTitle,
  prevSlideSummary,
  nextSlideTitle,
  extractedContent,
  sourceTranscript,
  hasSlideImage,
  promptContract,
}) {
  if (!promptContract) throw new Error("缺少講稿提示詞");
  const transcriptBlock = sourceTranscript?.trim()
    ? `

## 講者提供的原始文字稿（reference）
以下為整份簡報的原始講稿或筆記。請依**本頁投影片**（slideIndex=${slideIndex}）從稿中取出對應段落，改寫成口語講稿。
若稿中無對應內容，僅根據投影片內容撰寫；不可捏造稿與投影片皆未出現的數字、客戶名稱或承諾。

---
${sourceTranscript.trim()}
---`
    : "";

  const imageNote = hasSlideImage
    ? "\n\n**注意：** 本訊息附帶此頁投影片圖像。請優先依圖像中的標題、圖表、架構與文字撰寫；extractedContent 若僅有頁碼可忽略。"
    : "";

  return `${promptContract}

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
${JSON.stringify(extractedContent, null, 2)}${transcriptBlock}${imageNote}

請直接輸出講稿正文，不要加標題或說明。`;
}

export function buildSystemPrompt({ hasSlideImage, hasSourceTranscript } = {}) {
  const parts = [
    "你是企業簡報講者。只能根據投影片內容撰寫口語講稿。",
    "不得新增投影片未出現的數字、客戶名稱、承諾或統計。",
    "輸出繁體中文純文字一段，約 180–360 字，適合 45–90 秒口述。",
  ];
  if (hasSlideImage) {
    parts.push("若附帶投影片圖像，必須依圖上可見內容講述，不可臆測圖中沒有的資訊。");
  }
  if (hasSourceTranscript) {
    parts.push("若有原始文字稿，優先對齊該頁對應段落，改寫為口語風格，保留關鍵專有名詞。");
  }
  return parts.join("\n");
}
