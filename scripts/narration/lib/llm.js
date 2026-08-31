import { estimateSecondsFromScript } from "./extract.js";

function joinParts(parts) {
  return parts.filter(Boolean).join("");
}

function cardSummary(cards, max = 3) {
  return cards.slice(0, max).map((c) => {
    const head = c.heading ? `${c.heading}：` : "";
    const body = c.paragraph || (c.bullets?.[0] ?? "");
    return `${head}${body}`;
  });
}

/**
 * Deterministic draft script when LLM is unavailable (dry-run / offline).
 */
export function generateTemplateScript(slide, context) {
  const c = slide.extractedContent;
  const title = c.headings?.[0] || c.headings?.[1] || slide.title;
  const opening =
    slide.index === 1
      ? `各位主管好，這份簡報的主題是「${title}」。`
      : `接下來這一頁，我們來看「${slide.title}」。`;

  const leadPart = c.lead ? c.lead : "";

  let body = "";
  if (c.cards?.length) {
    const summaries = cardSummary(c.cards);
    body = `這頁有三個重點。第一，${summaries[0] || ""}。`;
    if (summaries[1]) body += `第二，${summaries[1]}。`;
    if (summaries[2]) body += `第三，${summaries[2]}。`;
  } else if (c.flowSteps?.length) {
    body = c.flowSteps
      .slice(0, 5)
      .map((s, i) => `第${i + 1}步是${s.title}${s.description ? `，${s.description}` : ""}`)
      .join("。");
    body = `流程上，${body}。`;
  } else if (c.svgLabels?.length) {
    body = `架構上，我們依序看：${c.svgLabels.slice(0, 8).join("、")}。`;
  } else if (c.table?.length) {
    const dataRows = c.table.slice(1, 4);
    body = dataRows
      .map((row) => `${row[0]}著重${row[1]}，對主管的意義是${row[2] || row[1]}`)
      .join("；");
    body = body ? `各產業對照如下。${body}。` : "";
  }

  const callout = c.callouts?.[0]
    ? c.callouts[0].replace(/^結論：|^建議下一步：|^設計原則：|^策略：|^落地建議：|^治理提醒：|^主管重點：/, "")
    : "";

  const closing =
    slide.index === context.slideTotal
      ? "以上是平台能力、導入價值與建議下一步，謝謝各位。"
      : context.nextSlideTitle
        ? `理解這一頁後，下一頁我們會進入「${context.nextSlideTitle}」。`
        : "以上是這一頁的重點。";

  return joinParts([opening, leadPart, body, callout, closing]).replace(/\s+/g, " ").trim();
}

export async function generateScriptWithLlm(slide, context, options = {}) {
  const { buildSlidePrompt, buildSystemPrompt } = await import("./prompt.js");
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const model = options.model || process.env.NARRATION_LLM_MODEL || "gpt-4o-mini";
  const timeoutMs = Number(options.timeoutMs || process.env.NARRATION_LLM_TIMEOUT_MS || 60000);
  const maxRetries = Number(options.maxRetries || process.env.NARRATION_LLM_MAX_RETRIES || 2);

  if (!apiKey) {
    const script = generateTemplateScript(slide, context);
    return {
      script,
      estimatedSeconds: estimateSecondsFromScript(script),
      modelVersion: "template-v1",
      generationNotes: "無 OPENAI_API_KEY，使用 template 草稿",
    };
  }

  const userPrompt = buildSlidePrompt({
    deckTitle: context.deckTitle,
    slideIndex: slide.index,
    slideTotal: context.slideTotal,
    slideId: slide.slideId,
    slideTitle: slide.title,
    prevSlideSummary: context.prevSlideSummary,
    nextSlideTitle: context.nextSlideTitle,
    extractedContent: slide.extractedContent,
  });

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          messages: [
            { role: "system", content: buildSystemPrompt() },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = await res.json();
      const script = (data.choices?.[0]?.message?.content || "").trim();
      if (!script) throw new Error("LLM 回傳空講稿");

      return {
        script,
        estimatedSeconds: estimateSecondsFromScript(script),
        modelVersion: model,
        generationNotes: null,
      };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  const script = generateTemplateScript(slide, context);
  return {
    script,
    estimatedSeconds: estimateSecondsFromScript(script),
    modelVersion: "template-v1-fallback",
    generationNotes: `LLM 失敗後改用 template: ${lastError?.message || lastError}`,
  };
}
