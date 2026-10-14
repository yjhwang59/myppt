export const LLM_MODEL_PRESETS = [
  { id: "gpt-4o-mini", label: "gpt-4o-mini（預設，較省）", supportsVision: true },
  { id: "gpt-4o", label: "gpt-4o（vision 較準）", supportsVision: true },
  { id: "gpt-4.1-mini", label: "gpt-4.1-mini", supportsVision: true },
  { id: "gpt-4.1", label: "gpt-4.1", supportsVision: true },
];

export const LLM_MODEL_IDS = new Set(LLM_MODEL_PRESETS.map((m) => m.id));

export function defaultLlmModel() {
  return process.env.NARRATION_LLM_MODEL || "gpt-4o-mini";
}

/** Accept preset ids or custom OpenAI model id (alphanumeric, dots, dashes). */
export function resolveLlmModel(requested, manifestModel) {
  const candidate = requested || manifestModel || defaultLlmModel();
  const id = String(candidate).trim();
  if (!id) return defaultLlmModel();
  if (LLM_MODEL_IDS.has(id)) return id;
  if (/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)) return id;
  return defaultLlmModel();
}

export function listLlmModels() {
  return {
    defaultModel: defaultLlmModel(),
    presets: LLM_MODEL_PRESETS,
    allowCustom: true,
  };
}
