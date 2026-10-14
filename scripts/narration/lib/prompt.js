import fs from "node:fs";
import { PROMPT_PATH } from "./paths.js";

export { buildSlidePrompt, buildSystemPrompt } from "./prompt-body.js";

export function loadPromptContract() {
  return fs.readFileSync(PROMPT_PATH, "utf8");
}
