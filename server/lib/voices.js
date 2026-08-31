export const VOICE_PRESETS = {
  female: [
    { id: "nova", label: "女聲 · Nova（預設）" },
    { id: "shimmer", label: "女聲 · Shimmer" },
  ],
  male: [
    { id: "onyx", label: "男聲 · Onyx（預設）" },
    { id: "echo", label: "男聲 · Echo" },
  ],
};

export const ALL_VOICES = [...VOICE_PRESETS.female, ...VOICE_PRESETS.male];

export function resolveVoiceId(gender, voiceId) {
  if (voiceId && ALL_VOICES.some((v) => v.id === voiceId)) return voiceId;
  if (gender === "male") return "onyx";
  if (gender === "female") return "nova";
  return process.env.NARRATION_TTS_VOICE || "nova";
}

export function genderFromVoiceId(voiceId) {
  if (VOICE_PRESETS.male.some((v) => v.id === voiceId)) return "male";
  if (VOICE_PRESETS.female.some((v) => v.id === voiceId)) return "female";
  return "female";
}
