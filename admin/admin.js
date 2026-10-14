import { findExistingDeck, parseSourceUrl, suggestAsciiSlug } from "./parse-source-url.js";

const API = "";
const DECK_COLUMN_STORAGE = "admin-decks-visible-columns";
const CATEGORY_COLUMN_STORAGE = "admin-categories-visible-columns";
const DECK_COLUMNS = [
  { key: "title", label: "標題", defaultVisible: true, sortable: true, sortType: "string" },
  { key: "deckId", label: "deckId", defaultVisible: false, sortable: true, sortType: "string" },
  { key: "categoryName", label: "分類", defaultVisible: true, sortable: true, sortType: "string" },
  { key: "listed", label: "上架", defaultVisible: true, sortable: true, sortType: "boolean" },
  { key: "sourceType", label: "類型", defaultVisible: true, sortable: true, sortType: "string" },
  { key: "slideCount", label: "頁數", defaultVisible: true, sortable: true, sortType: "number" },
  { key: "scriptsReady", label: "講稿", defaultVisible: true, sortable: true, sortType: "number" },
  { key: "audioReady", label: "語音", defaultVisible: false, sortable: true, sortType: "number" },
  { key: "status", label: "狀態", defaultVisible: true, sortable: false, sortType: "string" },
  { key: "sortOrder", label: "排序", defaultVisible: false, sortable: true, sortType: "number" },
  { key: "updatedAt", label: "更新", defaultVisible: true, sortable: true, sortType: "date" },
];
const CATEGORY_COLUMNS = [
  { key: "name", label: "名稱", defaultVisible: true, sortable: true, sortType: "string" },
  { key: "id", label: "代碼", defaultVisible: true, sortable: true, sortType: "string" },
  { key: "deckCount", label: "簡報數", defaultVisible: true, sortable: true, sortType: "number" },
  { key: "sortOrder", label: "排序", defaultVisible: true, sortable: true, sortType: "number" },
  { key: "isActive", label: "狀態", defaultVisible: true, sortable: true, sortType: "boolean" },
  { key: "description", label: "說明", defaultVisible: false, sortable: false, sortType: "string" },
];

const state = {
  connected: false,
  decks: [],
  categories: [],
  libraryTab: "decks",
  editingCategoryId: null,
  reassignCategoryId: null,
  list: {
    search: "",
    debouncedSearch: "",
    statusFilter: "all",
    categoryFilter: "all",
    sortBy: "updatedAt",
    sortDir: "desc",
    page: 1,
    pageSize: 20,
    visibleColumns: new Set(DECK_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)),
  },
  categoryList: {
    search: "",
    debouncedSearch: "",
    statusFilter: "active",
    sortBy: "sortOrder",
    sortDir: "asc",
    page: 1,
    pageSize: 20,
    visibleColumns: new Set(CATEGORY_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)),
  },
  deckId: null,
  deckMeta: null,
  slides: [],
  currentId: null,
  voices: [],
  llmModels: [],
  sourceType: "html",
  sourceFlavor: null,
  studioVoice: { gender: "female", voiceId: "nova" },
  voiceProfile: null,
  voiceUi: { step: "consent", phase: "idle" },
  cloudStudio: false,
  previewToken: 0,
  llmModel: "gpt-4o-mini",
  previewZoom: 1,
  undoScript: null,
  contentBaseline: null,
  editingDeckId: null,
  previewWidth: null,
  autoFitPreview: true,
};

const params = new URLSearchParams(location.search);
const initialDeck = params.get("deck");

const els = {
  loginScreen: document.getElementById("login-screen"),
  loginError: document.getElementById("login-error"),
  loginSetup: document.getElementById("login-setup"),
  googleBtn: document.getElementById("google-btn"),
  remoteNote: document.getElementById("remote-note"),
  loginRemember: document.getElementById("login-remember"),
  app: document.getElementById("app"),
  userLabel: document.getElementById("admin-user-label"),
  logout: document.getElementById("btn-logout"),
  viewLibrary: document.getElementById("view-library"),
  viewStudio: document.getElementById("view-studio"),
  deckSearch: document.getElementById("deck-search"),
  reloadDecks: document.getElementById("btn-reload-decks"),
  showUpload: document.getElementById("btn-show-upload"),
  uploadPanel: document.getElementById("upload-panel"),
  dropZone: document.getElementById("drop-zone"),
  fileInput: document.getElementById("file-input"),
  uploadTitle: document.getElementById("upload-title"),
  uploadDeckId: document.getElementById("upload-deck-id"),
  uploadOverwrite: document.getElementById("upload-overwrite"),
  uploadSourceUrl: document.getElementById("upload-source-url"),
  uploadUrlHint: document.getElementById("upload-url-hint"),
  btnUpload: document.getElementById("btn-upload"),
  libraryStatus: document.getElementById("library-status"),
  deckStatusFilter: document.getElementById("deck-status-filter"),
  deckCategoryFilter: document.getElementById("deck-category-filter"),
  deckColumnSettings: document.getElementById("deck-column-settings"),
  deckColumnSettingsList: document.getElementById("deck-column-settings-list"),
  deckTable: document.getElementById("deck-table"),
  deckTableHead: document.getElementById("deck-table-head"),
  deckTableBody: document.getElementById("deck-table-body"),
  deckTableEmpty: document.getElementById("deck-table-empty"),
  deckPagination: document.getElementById("deck-pagination"),
  importPaneUrl: document.getElementById("import-pane-url"),
  importPaneFile: document.getElementById("import-pane-file"),
  deckEditDialog: document.getElementById("deck-edit-dialog"),
  deckEditForm: document.getElementById("deck-edit-form"),
  editDeckTitle: document.getElementById("edit-deck-title"),
  editDeckIdLabel: document.getElementById("edit-deck-id-label"),
  editDeckCategory: document.getElementById("edit-deck-category"),
  editDeckSummary: document.getElementById("edit-deck-summary"),
  editDeckSort: document.getElementById("edit-deck-sort"),
  editDeckListed: document.getElementById("edit-deck-listed"),
  btnEditCancel: document.getElementById("btn-edit-cancel"),
  uploadCategory: document.getElementById("upload-category"),
  uploadSort: document.getElementById("upload-sort"),
  uploadListed: document.getElementById("upload-listed"),
  libraryDecks: document.getElementById("library-decks"),
  libraryCategories: document.getElementById("library-categories"),
  categorySearch: document.getElementById("category-search"),
  categoryStatusFilter: document.getElementById("category-status-filter"),
  categoryColumnSettingsList: document.getElementById("category-column-settings-list"),
  categoryTable: document.getElementById("category-table"),
  categoryTableHead: document.getElementById("category-table-head"),
  categoryTableBody: document.getElementById("category-table-body"),
  categoryTableEmpty: document.getElementById("category-table-empty"),
  categoryPagination: document.getElementById("category-pagination"),
  categoryDialog: document.getElementById("category-dialog"),
  categoryForm: document.getElementById("category-form"),
  categoryDialogTitle: document.getElementById("category-dialog-title"),
  categoryName: document.getElementById("category-name"),
  categoryId: document.getElementById("category-id"),
  categoryDescription: document.getElementById("category-description"),
  categorySort: document.getElementById("category-sort"),
  categoryActive: document.getElementById("category-active"),
  btnCategoryCancel: document.getElementById("btn-category-cancel"),
  btnAddCategory: document.getElementById("btn-add-category"),
  btnReloadCategories: document.getElementById("btn-reload-categories"),
  reassignDialog: document.getElementById("category-reassign-dialog"),
  reassignForm: document.getElementById("category-reassign-form"),
  reassignMessage: document.getElementById("reassign-message"),
  reassignTarget: document.getElementById("reassign-target"),
  btnReassignCancel: document.getElementById("btn-reassign-cancel"),
  stepper: document.getElementById("stepper"),
  studioTitle: document.getElementById("studio-title"),
  studioMeta: document.getElementById("studio-meta"),
  reload: document.getElementById("btn-reload"),
  list: document.getElementById("slide-list"),
  form: document.getElementById("slide-form"),
  cardsEditor: document.getElementById("cards-editor"),
  addCard: document.getElementById("btn-add-card"),
  script: document.getElementById("script"),
  save: document.getElementById("btn-save"),
  saveScript: document.getElementById("btn-save-script"),
  regenScript: document.getElementById("btn-regen-script"),
  undoScript: document.getElementById("btn-undo-script"),
  slideContentBadge: document.getElementById("slide-content-badge"),
  studioSplit: document.getElementById("studio-split"),
  studioResizer: document.getElementById("studio-resizer"),
  previewPanel: document.querySelector(".preview-panel"),
  previewTts: document.getElementById("btn-preview-tts"),
  synth: document.getElementById("btn-synth"),
  gender: document.getElementById("voice-gender"),
  voiceId: document.getElementById("voice-id"),
  myVoicePanel: document.getElementById("my-voice-panel"),
  libraryVoice: document.getElementById("library-voice"),
  libraryVoiceSummary: document.getElementById("library-voice-summary"),
  studioVoiceSummary: document.getElementById("studio-voice-summary"),
  openVoice: document.getElementById("btn-open-voice"),
  openVoiceStudio: document.getElementById("btn-open-voice-studio"),
  voiceDialog: document.getElementById("voice-dialog"),
  closeVoice: document.getElementById("btn-close-voice"),
  voicePaneConsent: document.getElementById("voice-pane-consent"),
  voicePaneSample: document.getElementById("voice-pane-sample"),
  voicePaneApply: document.getElementById("voice-pane-apply"),
  voiceCaptureBox: document.getElementById("voice-capture"),
  voiceMicLabel: document.getElementById("voice-mic-label"),
  voiceMic: document.getElementById("voice-mic"),
  voiceMeter: document.getElementById("voice-meter"),
  voiceMeterBar: document.getElementById("voice-meter-bar"),
  voiceTimer: document.getElementById("voice-timer"),
  voicePreview: document.getElementById("voice-preview"),
  recordVoice: document.getElementById("btn-record-voice"),
  useVoice: document.getElementById("btn-use-voice"),
  redoVoice: document.getElementById("btn-redo-voice"),
  voiceUploadLabel: document.getElementById("voice-upload-label"),
  voiceFile: document.getElementById("voice-file"),
  applyVoice: document.getElementById("btn-apply-voice"),
  voiceStatus: document.getElementById("voice-status"),
  llmModel: document.getElementById("llm-model"),
  llmModelCustom: document.getElementById("llm-model-custom"),
  preview: document.getElementById("preview"),
  pageImage: document.getElementById("page-image"),
  previewViewport: document.getElementById("preview-viewport"),
  previewScaler: document.getElementById("preview-scaler"),
  previewZoomLabel: document.getElementById("preview-zoom-label"),
  previewZoomIn: document.getElementById("btn-preview-zoom-in"),
  previewZoomOut: document.getElementById("btn-preview-zoom-out"),
  previewFit: document.getElementById("btn-preview-fit"),
  sourceTranscript: document.getElementById("source-transcript"),
  sourceTranscriptMeta: document.getElementById("source-transcript-meta"),
  saveTranscript: document.getElementById("btn-save-transcript"),
  transcriptFile: document.getElementById("transcript-file"),
  batchVisionHigh: document.getElementById("batch-vision-high"),
  previewAudio: document.getElementById("preview-audio"),
  status: document.getElementById("status"),
  editorTitle: document.getElementById("editor-title"),
  advanced: document.getElementById("advanced-fields"),
  genAllScripts: document.getElementById("btn-gen-all-scripts"),
  synthAll: document.getElementById("btn-synth-all"),
  openDeck: document.getElementById("btn-open-deck"),
  publish: document.getElementById("btn-publish"),
  publishResult: document.getElementById("publish-result"),
  jobProgress: document.getElementById("job-progress"),
};

function setStatus(msg) {
  const text = msg || "";
  if (els.status) els.status.textContent = text;
  if (els.libraryStatus) els.libraryStatus.textContent = text;
}

function setButtonLoading(btn, loading, loadingText = "處理中…") {
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.textContent;
    btn.textContent = loadingText;
    btn.disabled = true;
    btn.classList.add("btn-loading");
    btn.setAttribute("aria-busy", "true");
  } else {
    btn.textContent = btn.dataset.defaultLabel || btn.textContent;
    btn.disabled = false;
    btn.classList.remove("btn-loading");
    btn.removeAttribute("aria-busy");
  }
}

function previewWidthKey() {
  return "ai-eip-studio-preview-width";
}

function loadPreviewWidth() {
  const raw = localStorage.getItem(previewWidthKey());
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 280 && n <= 900) return n;
  return 400;
}

function savePreviewWidth(w) {
  localStorage.setItem(previewWidthKey(), String(Math.round(w)));
}

function previewDesignSize() {
  if (state.sourceType === "pdf") return { w: 960, h: 540 };
  if (state.sourceFlavor === "fyh-deck-chrome") return { w: 1600, h: 900 };
  return { w: 1280, h: 720 };
}

function fitPreviewToPanel() {
  if (!els.previewViewport || !state.autoFitPreview) return;
  const pad = 8;
  const vw = els.previewViewport.clientWidth - pad;
  const vh = els.previewViewport.clientHeight - pad;
  if (vw <= 0 || vh <= 0) return;
  const { w, h } = previewDesignSize();
  const fitZoom = Math.min(2.5, Math.max(0.15, Math.min(vw / w, vh / h)));
  setPreviewZoom(fitZoom, { persist: false });
}

function applyPreviewWidth(w) {
  if (!els.previewPanel || !els.studioSplit) return;
  const width = Math.min(900, Math.max(280, w));
  state.previewWidth = width;
  state.autoFitPreview = true;
  els.previewPanel.style.flex = `0 0 ${width}px`;
  els.previewPanel.style.width = `${width}px`;
  savePreviewWidth(width);
  fitPreviewToPanel();
}

let studioResizerBound = false;

function initStudioResizer() {
  if (!els.studioResizer || !els.studioSplit) return;
  applyPreviewWidth(loadPreviewWidth());

  if (studioResizerBound) return;
  studioResizerBound = true;

  let dragging = false;
  let startX = 0;
  let startW = 0;

  const onMove = (clientX) => {
    if (!dragging) return;
    const delta = startX - clientX;
    applyPreviewWidth(startW + delta);
  };

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("resizing");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("touchend", stop);
  };

  const onMouseMove = (e) => onMove(e.clientX);
  const onMouseUp = () => stop();
  const onTouchMove = (e) => {
    if (e.touches[0]) onMove(e.touches[0].clientX);
  };

  els.studioResizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = els.previewPanel?.offsetWidth || loadPreviewWidth();
    document.body.classList.add("resizing");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  els.studioResizer.addEventListener("touchstart", (e) => {
    dragging = true;
    startX = e.touches[0].clientX;
    startW = els.previewPanel?.offsetWidth || loadPreviewWidth();
    document.body.classList.add("resizing");
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", stop);
  });

  els.studioResizer.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 40 : 16;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      applyPreviewWidth((els.previewPanel?.offsetWidth || 400) + step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      applyPreviewWidth((els.previewPanel?.offsetWidth || 400) - step);
    }
  });

  if (typeof ResizeObserver !== "undefined" && els.previewViewport) {
    const ro = new ResizeObserver(() => fitPreviewToPanel());
    ro.observe(els.previewViewport);
  }
}

function snapshotContentBaseline() {
  if (!els.form || state.sourceType === "pdf") {
    state.contentBaseline = null;
    return;
  }
  state.contentBaseline = JSON.stringify(collectPayload());
}

function isContentDirty() {
  if (!state.contentBaseline || state.sourceType === "pdf") return false;
  return JSON.stringify(collectPayload()) !== state.contentBaseline;
}

function isScriptDirty() {
  const slide = currentSlide();
  if (!slide) return false;
  return (els.script?.value || "") !== (slide.script || "");
}

function updateSlideContentBadge() {
  if (!els.slideContentBadge) return;
  const slide = currentSlide();
  if (!slide) {
    els.slideContentBadge.classList.add("hidden");
    return;
  }
  const dirty = isContentDirty();
  const stale = slide.status === "stale";
  if (!dirty && !stale) {
    els.slideContentBadge.classList.add("hidden");
    return;
  }
  els.slideContentBadge.classList.remove("hidden");
  els.slideContentBadge.className = "slide-badge";
  if (dirty && stale) {
    els.slideContentBadge.classList.add("warn");
    els.slideContentBadge.textContent = "內容已改 · 語音過期";
  } else if (dirty) {
    els.slideContentBadge.classList.add("draft");
    els.slideContentBadge.textContent = "投影片未儲存";
  } else {
    els.slideContentBadge.classList.add("stale");
    els.slideContentBadge.textContent = "投影片已變 · 語音過期";
  }
}

function updateScriptActions() {
  const slide = currentSlide();
  if (!slide || !els.regenScript) return;

  const status = slide.status || "empty";
  const scriptDirty = isScriptDirty();
  const contentDirty = isContentDirty();

  els.regenScript.classList.remove("primary", "warn-cta");
  els.saveScript?.classList.remove("primary");

  let regenLabel = "重生本頁講稿";
  if (status === "empty" && !slide.script) regenLabel = "生成本頁講稿";
  else if (status === "stale" || contentDirty) {
    regenLabel = "重生本頁講稿（內容已變）";
    els.regenScript.classList.add("warn-cta");
  }
  if (status === "empty" || status === "stale") els.regenScript.classList.add("primary");

  if (!els.regenScript.classList.contains("btn-loading")) {
    els.regenScript.textContent = regenLabel;
    els.regenScript.dataset.defaultLabel = regenLabel;
  }

  if (els.saveScript) {
    const saveLabel = scriptDirty ? "儲存講稿（未儲存）" : "儲存講稿";
    if (!els.saveScript.classList.contains("btn-loading")) {
      els.saveScript.textContent = saveLabel;
      els.saveScript.dataset.defaultLabel = saveLabel;
    }
    if (scriptDirty) els.saveScript.classList.add("primary");
  }

  if (els.synth) {
    let synthLabel = "寫入正式語音";
    if (status === "stale") synthLabel = "重新合成語音";
    else if (status === "audio_ready" && !scriptDirty) synthLabel = "更新正式語音";
    if (!els.synth.classList.contains("btn-loading")) {
      els.synth.textContent = synthLabel;
      els.synth.dataset.defaultLabel = synthLabel;
    }
    els.synth.classList.toggle("primary", status === "stale" || (status === "pending_review" && Boolean(slide.script)));
  }

  if (els.save && state.sourceType !== "pdf") {
    const saveContentLabel = contentDirty
      ? "儲存內容並 rebuild（語音將過期）"
      : "儲存內容並 rebuild";
    if (!els.save.classList.contains("btn-loading")) {
      els.save.textContent = saveContentLabel;
      els.save.dataset.defaultLabel = saveContentLabel;
    }
    els.save.classList.toggle("primary", contentDirty);
    els.save.classList.toggle("warn-cta", contentDirty);
  }

  if (els.undoScript) {
    const canUndo = state.undoScript != null;
    els.undoScript.classList.toggle("hidden", !canUndo);
    els.undoScript.disabled = !canUndo;
  }

  updateSlideContentBadge();
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API}${path}`, { ...options, headers, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.detail || data.message || "操作失敗");
    err.status = res.status;
    err.deckCount = data.deckCount;
    throw err;
  }
  return data;
}

function fillVoiceOptions(gender, selected) {
  els.voiceId.innerHTML = "";
  const pool = state.voices.filter((v) => {
    if (v.custom) return false;
    return gender === "male" ? v.id === "onyx" || v.id === "echo" : v.id === "nova" || v.id === "shimmer";
  });
  const custom = state.voices.filter((v) => v.custom);
  for (const v of [...pool, ...custom]) {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.label;
    if (v.id === selected) opt.selected = true;
    els.voiceId.appendChild(opt);
  }
}

function previewZoomKey(deckId) {
  return `ai-eip-preview-zoom:${deckId || "default"}`;
}

function loadPreviewZoom(deckId) {
  const raw = sessionStorage.getItem(previewZoomKey(deckId));
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0.15 && n <= 2.5) return n;
  return 1;
}

function savePreviewZoom(deckId, zoom) {
  sessionStorage.setItem(previewZoomKey(deckId), String(zoom));
}

function applyPreviewZoom() {
  const pct = Math.round(state.previewZoom * 100);
  if (els.previewZoomLabel) els.previewZoomLabel.textContent = `${pct}%`;
  if (!els.previewScaler) return;
  const { w, h } = previewDesignSize();
  const zoom = state.previewZoom;
  els.previewScaler.style.width = `${w}px`;
  els.previewScaler.style.height = `${h}px`;
  els.previewScaler.style.transform = `scale(${zoom})`;
  els.previewScaler.style.marginRight = `${w * (zoom - 1)}px`;
  els.previewScaler.style.marginBottom = `${h * (zoom - 1)}px`;
}

function setPreviewZoom(zoom, { persist = true, manual = false } = {}) {
  if (manual) state.autoFitPreview = false;
  state.previewZoom = Math.min(2.5, Math.max(0.15, zoom));
  applyPreviewZoom();
  if (persist && state.deckId) savePreviewZoom(state.deckId, state.previewZoom);
}

function fillLlmModelOptions(selected) {
  if (!els.llmModel) return;
  els.llmModel.innerHTML = "";
  const presets = state.llmModels?.presets || [];
  for (const m of presets) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    if (m.id === selected) opt.selected = true;
    els.llmModel.appendChild(opt);
  }
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "自訂…";
  const isPreset = presets.some((m) => m.id === selected);
  if (selected && !isPreset) customOpt.selected = true;
  els.llmModel.appendChild(customOpt);

  if (els.llmModelCustom) {
    const showCustom = els.llmModel.value === "__custom__" || (selected && !isPreset);
    els.llmModelCustom.classList.toggle("hidden", !showCustom);
    if (showCustom && selected && !isPreset) els.llmModelCustom.value = selected;
  }
}

function getSelectedLlmModel() {
  if (!els.llmModel) return state.llmModel;
  if (els.llmModel.value === "__custom__") {
    return (els.llmModelCustom?.value || "").trim() || state.llmModel;
  }
  return els.llmModel.value || state.llmModel;
}

function voiceScopeForSelection(voiceId) {
  if (state.voiceProfile?.defaultForAll && state.voiceProfile.voiceId === voiceId) return "global";
  return "deck";
}

async function persistStudioVoice() {
  if (!state.deckId) return;
  try {
    await api(`/api/decks/${state.deckId}/voice`, {
      method: "PUT",
      body: JSON.stringify({
        gender: state.studioVoice.gender,
        voiceId: state.studioVoice.voiceId,
        scope: voiceScopeForSelection(state.studioVoice.voiceId),
      }),
    });
  } catch {
    /* non-blocking */
  }
}

async function persistLlmModel() {
  if (!state.deckId) return;
  const model = getSelectedLlmModel();
  state.llmModel = model;
  try {
    await api(`/api/decks/${state.deckId}/llm-model`, {
      method: "PUT",
      body: JSON.stringify({ model }),
    });
  } catch {
    /* non-blocking */
  }
}

function applyStudioVoiceToUi() {
  els.gender.value = state.studioVoice.gender;
  fillVoiceOptions(state.studioVoice.gender, state.studioVoice.voiceId);
}

function initStudioVoiceFromManifest(manifestVoice) {
  const voiceId = manifestVoice?.voiceId || "nova";
  const gender = voiceId === "onyx" || voiceId === "echo" ? "male" : "female";
  state.studioVoice = { gender, voiceId };
  applyStudioVoiceToUi();
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function statusLabel(status) {
  const map = {
    empty: "無講稿",
    draft: "草稿",
    pending_review: "待審",
    approved: "已核准",
    stale: "語音過期",
    audio_ready: "語音就緒",
    audio_failed: "語音失敗",
  };
  return map[status] || status || "-";
}

function currentSlide() {
  return state.slides.find((s) => s.slideId === state.currentId);
}

function showLibrary() {
  els.viewLibrary.classList.remove("hidden");
  els.viewStudio.classList.add("hidden");
  history.replaceState(null, "", "?");
}

function showStudio(deckId) {
  els.viewLibrary.classList.add("hidden");
  els.viewStudio.classList.remove("hidden");
  history.replaceState(null, "", `?deck=${encodeURIComponent(deckId)}`);
  requestAnimationFrame(() => fitPreviewToPanel());
}

function updateStepper() {
  const slides = state.slides;
  const hasScripts = slides.some((s) => s.script);
  const allScripts = slides.length && slides.every((s) => s.script);
  const anyAudio = slides.some((s) => s.status === "audio_ready");
  const allAudio = slides.length && slides.every((s) => s.status === "audio_ready");
  const published = Boolean(state.deckMeta?.meta?.publishedAt || state.deckMeta?.publishedAt);

  const flags = {
    upload: true,
    scripts: hasScripts,
    edit: hasScripts,
    audio: anyAudio,
    publish: published,
  };
  let active = "upload";
  if (!hasScripts) active = "scripts";
  else if (!allAudio) active = anyAudio ? "audio" : "edit";
  else if (!published) active = "publish";
  else active = "publish";

  els.stepper.querySelectorAll("[data-step]").forEach((el) => {
    const step = el.dataset.step;
    el.classList.toggle("done", Boolean(flags[step]) && step !== active);
    el.classList.toggle("active", step === active);
    if (step === "scripts" && allScripts) el.classList.add("done");
    if (step === "audio" && allAudio) el.classList.add("done");
  });
}

function loadVisibleColumns() {
  try {
    const raw = localStorage.getItem(DECK_COLUMN_STORAGE);
    const keys = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(keys) || !keys.length) return;
    const allowed = new Set(DECK_COLUMNS.map((c) => c.key));
    const next = keys.filter((k) => allowed.has(k));
    if (next.length) state.list.visibleColumns = new Set(next);
  } catch {
    /* keep defaults */
  }
}

function persistVisibleColumns() {
  localStorage.setItem(DECK_COLUMN_STORAGE, JSON.stringify([...state.list.visibleColumns]));
}

function visibleColumnDefs() {
  return DECK_COLUMNS.filter((c) => state.list.visibleColumns.has(c.key));
}

function matchesDeckStatus(d, filter) {
  if (filter === "all") return true;
  if (filter === "listed") return d.listed === true;
  if (filter === "unlisted") return d.listed !== true;
  const chips = d.statusChips || [];
  const published = Boolean(d.publishedAt) || chips.includes("已發布");
  const stale = (d.staleCount || 0) > 0 || chips.some((c) => c.includes("過期"));
  if (filter === "published") return published;
  if (filter === "stale") return stale;
  if (filter === "in_progress") return !published;
  return true;
}

function deckSearchHaystack(d) {
  return [d.title, d.deckId, d.sourceType, d.categoryName, d.summary, d.listed ? "上架" : "未上架", ...(d.statusChips || [])]
    .join(" ")
    .toLowerCase();
}

function sortValue(d, col) {
  if (col.key === "scriptsReady") return d.slideCount ? (d.scriptsReady || 0) / d.slideCount : -1;
  if (col.key === "audioReady") return d.slideCount ? (d.audioReady || 0) / d.slideCount : -1;
  if (col.key === "status") return (d.statusChips || []).join(" ");
  if (col.sortType === "boolean") return d[col.key] ? 1 : 0;
  const v = d[col.key];
  if (col.sortType === "number") return Number(v) || 0;
  if (col.sortType === "date") return v ? new Date(v).getTime() : 0;
  return String(v || "").toLowerCase();
}

function compareDecks(a, b, col, dir) {
  const av = sortValue(a, col);
  const bv = sortValue(b, col);
  let cmp = 0;
  if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv), "zh-Hant");
  return dir === "desc" ? -cmp : cmp;
}

function processDeckList() {
  let list = state.decks.filter((d) => matchesDeckStatus(d, state.list.statusFilter));
  if (state.list.categoryFilter !== "all") {
    list = list.filter((d) => (d.categoryId || "") === state.list.categoryFilter);
  }
  const q = state.list.debouncedSearch.trim().toLowerCase();
  if (q) list = list.filter((d) => deckSearchHaystack(d).includes(q));
  const col = DECK_COLUMNS.find((c) => c.key === state.list.sortBy) || DECK_COLUMNS[0];
  list = [...list].sort((a, b) => compareDecks(a, b, col, state.list.sortDir));
  const total = list.length;
  const pageSize = state.list.pageSize;
  const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1);
  if (state.list.page > maxPage) state.list.page = maxPage;
  const start = (state.list.page - 1) * pageSize;
  return { pagedRows: list.slice(start, start + pageSize), total, start };
}

function fmtDeckDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function scriptCell(d) {
  if (!d.slideCount) return "—";
  return `${d.scriptsReady || 0}/${d.slideCount}`;
}

function audioCell(d) {
  if (!d.slideCount) return "—";
  const n = d.audioReady || 0;
  if (d.staleCount > 0) return `${n}/${d.slideCount} · 過期 ${d.staleCount}`;
  return `${n}/${d.slideCount}`;
}

function statusHtml(d) {
  return (d.statusChips || [])
    .map((c) => {
      let cls = "";
      if (c.includes("過期")) cls = "warn";
      else if (c.includes("語音") || c.includes("發布")) cls = "ok";
      else if (c.includes("講稿")) cls = "info";
      return `<span class="chip ${cls}">${escapeHtml(c)}</span>`;
    })
    .join(" ");
}

function renderDeckCell(d, key) {
  switch (key) {
    case "title":
      return `<td class="col-title"><strong>${escapeHtml(d.title)}</strong></td>`;
    case "deckId":
      return `<td class="col-id"><code>${escapeHtml(d.deckId)}</code></td>`;
    case "sourceType":
      return `<td>${escapeHtml(d.sourceType || "html")}</td>`;
    case "categoryName":
      return `<td>${escapeHtml(d.categoryName || "未分類")}</td>`;
    case "listed":
      return `<td>${d.listed ? '<span class="chip ok">上架</span>' : '<span class="chip">未上架</span>'}</td>`;
    case "sortOrder":
      return `<td class="num">${Number(d.sortOrder) || 0}</td>`;
    case "slideCount":
      return `<td class="num">${d.slideCount || 0}</td>`;
    case "scriptsReady":
      return `<td class="num">${scriptCell(d)}</td>`;
    case "audioReady":
      return `<td class="num">${escapeHtml(audioCell(d))}</td>`;
    case "status":
      return `<td class="col-status">${statusHtml(d)}</td>`;
    case "updatedAt":
      return `<td class="col-date">${escapeHtml(fmtDeckDate(d.updatedAt))}</td>`;
    default:
      return "<td></td>";
  }
}

function renderColumnSettings() {
  if (!els.deckColumnSettingsList) return;
  els.deckColumnSettingsList.innerHTML = DECK_COLUMNS.map((col) => `
    <label class="checkbox">
      <input type="checkbox" data-col="${escapeAttr(col.key)}" ${state.list.visibleColumns.has(col.key) ? "checked" : ""} />
      ${escapeHtml(col.label)}
    </label>`).join("");
  els.deckColumnSettingsList.querySelectorAll("input[data-col]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.col;
      if (input.checked) state.list.visibleColumns.add(key);
      else if (state.list.visibleColumns.size > 1) state.list.visibleColumns.delete(key);
      else input.checked = true;
      persistVisibleColumns();
      renderDecks();
    });
  });
}

function renderDeckHead() {
  if (!els.deckTableHead) return;
  const cols = visibleColumnDefs();
  els.deckTableHead.innerHTML = `${cols
    .map((col) => {
      const sorted = state.list.sortBy === col.key;
      const arrow = !col.sortable ? "" : sorted ? (state.list.sortDir === "asc" ? " ▲" : " ▼") : "";
      const cls = ["th-sort", col.sortable ? "sortable" : "", sorted ? "is-sorted" : ""].filter(Boolean).join(" ");
      return `<th class="${cls}" data-sort="${escapeAttr(col.key)}" ${col.sortable ? 'role="button" tabindex="0"' : ""}>${escapeHtml(col.label)}${arrow}</th>`;
    })
    .join("")}<th class="col-actions">操作</th>`;
  els.deckTableHead.querySelectorAll("[data-sort]").forEach((th) => {
    const col = DECK_COLUMNS.find((c) => c.key === th.dataset.sort);
    if (!col?.sortable) return;
    const apply = () => {
      if (state.list.sortBy === col.key) state.list.sortDir = state.list.sortDir === "asc" ? "desc" : "asc";
      else {
        state.list.sortBy = col.key;
        state.list.sortDir = "asc";
      }
      state.list.page = 1;
      renderDecks();
    };
    th.addEventListener("click", apply);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        apply();
      }
    });
  });
}

function renderPagination(total, start, pageSize) {
  if (!els.deckPagination) return;
  const end = total === 0 ? 0 : Math.min(start + pageSize, total);
  const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1);
  els.deckPagination.innerHTML = `
    <span class="page-meta">第 ${total ? start + 1 : 0}–${end} 筆／共 ${total} 筆</span>
    <label>每頁
      <select id="deck-page-size">
        ${[10, 20, 50, 100].map((n) => `<option value="${n}" ${n === pageSize ? "selected" : ""}>${n}</option>`).join("")}
      </select>
    </label>
    <div class="page-nav">
      <button type="button" class="ghost-btn sm" data-page="prev" ${state.list.page <= 1 ? "disabled" : ""}>上一頁</button>
      <span>${state.list.page} / ${maxPage}</span>
      <button type="button" class="ghost-btn sm" data-page="next" ${state.list.page >= maxPage ? "disabled" : ""}>下一頁</button>
    </div>`;
  els.deckPagination.querySelector("#deck-page-size")?.addEventListener("change", (e) => {
    state.list.pageSize = Number(e.target.value) || 20;
    state.list.page = 1;
    renderDecks();
  });
  els.deckPagination.querySelector("[data-page=prev]")?.addEventListener("click", () => {
    state.list.page = Math.max(1, state.list.page - 1);
    renderDecks();
  });
  els.deckPagination.querySelector("[data-page=next]")?.addEventListener("click", () => {
    state.list.page += 1;
    renderDecks();
  });
}

function renderDecks() {
  if (!els.deckTableBody) return;
  const cols = visibleColumnDefs();
  const { pagedRows, total, start } = processDeckList();

  renderDeckHead();
  els.deckTableBody.innerHTML = pagedRows
    .map(
      (d) => `
    <tr data-id="${escapeAttr(d.deckId)}">
      ${cols.map((col) => renderDeckCell(d, col.key)).join("")}
      <td class="col-actions">
        <button type="button" class="ghost-btn sm" data-action="edit" title="編輯目錄">編輯</button>
        <button type="button" class="sm primary" data-action="studio">工作室</button>
        <button type="button" class="ghost-btn sm" data-action="preview">預覽</button>
        <button type="button" class="ghost-btn sm danger" data-action="delete">刪除</button>
      </td>
    </tr>`
    )
    .join("");

  els.deckTable?.classList.toggle("hidden", total === 0);
  els.deckTableEmpty?.classList.toggle("hidden", total !== 0);
  renderPagination(total, start, state.list.pageSize);

  els.deckTableBody.querySelectorAll("tr[data-id]").forEach((row) => {
    const deckId = row.dataset.id;
    row.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === "studio") openStudio(deckId).catch((err) => setStatus(err.message));
        else if (action === "preview") window.open(`/${deckId}.html`, "_blank");
        else if (action === "edit") openDeckEditDialog(deckId);
        else if (action === "delete") confirmDeleteDeck(deckId);
      });
    });
  });
}

function fillCategorySelect(select, selected = "", { includeEmpty = true, excludeId = "" } = {}) {
  if (!select) return;
  const options = [];
  if (includeEmpty) options.push(`<option value="" ${selected === "" ? "selected" : ""}>未分類</option>`);
  for (const category of state.categories) {
    if (excludeId && category.id === excludeId) continue;
    options.push(
      `<option value="${escapeAttr(category.id)}" ${category.id === selected ? "selected" : ""}>${escapeHtml(category.name)}</option>`
    );
  }
  select.innerHTML = options.join("");
}

function fillCategoryFilters() {
  if (!els.deckCategoryFilter) return;
  const current = state.list.categoryFilter || "all";
  const options = [`<option value="all" ${current === "all" ? "selected" : ""}>全部分類</option>`];
  options.push(`<option value="" ${current === "" ? "selected" : ""}>未分類</option>`);
  for (const category of state.categories) {
    options.push(
      `<option value="${escapeAttr(category.id)}" ${current === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`
    );
  }
  els.deckCategoryFilter.innerHTML = options.join("");
  fillCategorySelect(els.uploadCategory, els.uploadCategory?.value || "");
  fillCategorySelect(els.editDeckCategory, els.editDeckCategory?.value || "");
}

function openDeckEditDialog(deckId) {
  const deck = state.decks.find((d) => d.deckId === deckId);
  if (!deck || !els.deckEditDialog) return;
  state.editingDeckId = deckId;
  els.editDeckTitle.value = deck.title || deckId;
  if (els.editDeckIdLabel) els.editDeckIdLabel.textContent = deckId;
  fillCategorySelect(els.editDeckCategory, deck.categoryId || "");
  if (els.editDeckSummary) els.editDeckSummary.value = deck.summary || "";
  if (els.editDeckSort) els.editDeckSort.value = deck.sortOrder ?? 0;
  if (els.editDeckListed) els.editDeckListed.checked = deck.listed === true;
  els.deckEditDialog.showModal();
}

async function confirmDeleteDeck(deckId) {
  const deck = state.decks.find((d) => d.deckId === deckId);
  const title = deck?.title || deckId;
  if (!confirm(`確定刪除「${title}」？\n將移除本機 deck、講稿 manifest 與參考文字稿（不可復原）。`)) return;
  try {
    await api(`/api/decks/${deckId}`, { method: "DELETE" });
    if (state.deckId === deckId) {
      state.deckId = null;
      showLibrary();
    }
    await loadDecks();
    setStatus("已刪除簡報");
  } catch (err) {
    setStatus(err.message);
  }
}

async function loadDecks() {
  const data = await api("/api/decks");
  state.decks = data.decks || [];
  renderDecks();
}

async function loadCategories() {
  const data = await api("/api/categories");
  state.categories = data.categories || [];
  fillCategoryFilters();
  renderCategories();
}

function renderCards(cards = []) {
  els.cardsEditor.innerHTML = "";
  cards.forEach((card, i) => {
    const div = document.createElement("div");
    div.className = "card-row";
    div.innerHTML = `
      <label>heading<input data-i="${i}" data-k="heading" value="${escapeAttr(card.heading || "")}"></label>
      <label>paragraph<textarea data-i="${i}" data-k="paragraph">${escapeHtml(card.paragraph || "")}</textarea></label>
      <label>bullets (每行一項)<textarea data-i="${i}" data-k="bullets">${escapeHtml((card.bullets || []).join("\n"))}</textarea></label>
      <button type="button" data-remove="${i}">刪除 card</button>`;
    els.cardsEditor.appendChild(div);
  });
  els.cardsEditor.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slide = currentSlide();
      slide.cards.splice(Number(btn.dataset.remove), 1);
      renderCards(slide.cards);
      updateScriptActions();
    });
  });
}

function renderList() {
  els.list.innerHTML = "";
  state.slides.forEach((slide) => {
    const li = document.createElement("li");
    li.className = slide.slideId === state.currentId ? "active" : "";
    li.innerHTML = `<strong><span class="status-dot ${slide.status || "empty"}"></span>${slide.index}. ${escapeHtml(slide.title)}</strong>
      <div class="meta">${statusLabel(slide.status)} · ${slide.audioUrl ? "有音訊" : "無音訊"}</div>`;
    li.addEventListener("click", () => selectSlide(slide.slideId));
    els.list.appendChild(li);
  });
}

function previewDeckUrl(deckId, slideId) {
  const hash = `#${encodeURIComponent(slideId)}`;
  if (state.cloudStudio) return `/${deckId}.html?draft=1&t=${state.previewToken || 0}${hash}`;
  return `/${deckId}.html${hash}`;
}

function applyStudioPreviewChrome(doc) {
  if (!doc || state.sourceFlavor !== "fyh-deck-chrome") return;
  if (doc.getElementById("ai-eip-studio-preview")) return;
  const style = doc.createElement("style");
  style.id = "ai-eip-studio-preview";
  style.textContent = `
    html, body { margin: 0 !important; height: 100% !important; overflow: hidden !important; }
    header { display: none !important; }
    main {
      position: absolute !important;
      inset: 0 !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      gap: 0 !important;
      overflow: hidden !important;
      display: block !important;
    }
    .slide { display: none !important; }
    .slide.is-active, .slide.active {
      display: flex !important;
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      max-height: none !important;
      aspect-ratio: auto !important;
      margin: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      transform: none !important;
      overflow: auto !important;
    }
  `;
  doc.head.appendChild(style);
}

function syncPreviewToSlide(slideId) {
  if (!slideId || !els.preview) return false;
  try {
    const doc = els.preview.contentDocument;
    const win = els.preview.contentWindow;
    if (!doc || !win?.location) return false;
    const path = win.location.pathname.replace(/\\/g, "/");
    if (!path.endsWith(`/${state.deckId}.html`)) return false;
    applyStudioPreviewChrome(doc);
    if (typeof win.deckController?.showBySlideId === "function") {
      win.deckController.showBySlideId(slideId);
    } else if (typeof win.deckController?.show === "function") {
      const slides = [...doc.querySelectorAll(".slide")];
      const idx = slides.findIndex((s) => s.id === slideId);
      if (idx >= 0) win.deckController.show(idx);
    } else {
      const slides = [...doc.querySelectorAll("#deck .slide, .slide")];
      const idx = slides.findIndex((s) => s.id === slideId);
      if (idx < 0) return false;
      slides.forEach((s, i) => {
        s.classList.toggle("is-active", i === idx);
        s.classList.toggle("active", i === idx);
      });
      const counter = doc.getElementById("slide-counter");
      if (counter) counter.textContent = `${idx + 1} / ${slides.length}`;
      const el = slides[idx];
      if (el && !doc.getElementById("ai-eip-studio-preview")) {
        el.scrollIntoView({ behavior: "instant", block: "start" });
      }
    }
    const hash = `#${slideId}`;
    if (win.location.hash !== hash) {
      win.history.replaceState(null, "", hash);
    }
    return true;
  } catch {
    return false;
  }
}

let previewLoadBound = false;

function bindPreviewLoad() {
  if (previewLoadBound || !els.preview) return;
  previewLoadBound = true;
  els.preview.addEventListener("load", () => {
    if (state.currentId) syncPreviewToSlide(state.currentId);
    requestAnimationFrame(() => fitPreviewToPanel());
  });
}

function refreshPreview() {
  if (!state.deckId || !state.currentId) return;
  bindPreviewLoad();
  applyPreviewZoom();
  if (state.sourceType === "pdf") {
    const slide = currentSlide();
    if (slide?.pageImageUrl) {
      els.pageImage.src = `/${slide.pageImageUrl}?t=${Date.now()}`;
      els.pageImage.classList.remove("hidden");
      els.preview.classList.add("hidden");
      requestAnimationFrame(() => fitPreviewToPanel());
      return;
    }
  }
  els.pageImage.classList.add("hidden");
  els.preview.classList.remove("hidden");
  if (state.cloudStudio) {
    const next = previewDeckUrl(state.deckId, state.currentId);
    if ((els.preview.getAttribute("src") || "") !== next) {
      els.preview.src = next;
      return;
    }
  }
  if (syncPreviewToSlide(state.currentId)) {
    requestAnimationFrame(() => fitPreviewToPanel());
    return;
  }
  els.preview.src = previewDeckUrl(state.deckId, state.currentId);
}

function selectSlide(slideId) {
  state.currentId = slideId;
  state.undoScript = null;
  const slide = currentSlide();
  if (!slide) return;
  renderList();
  els.editorTitle.textContent = `${slide.slideId} · ${slide.title}`;
  if (els.form) {
    els.form.title.value = slide.title || "";
    els.form.eyebrow.value = slide.eyebrow || "";
    els.form.kicker.value = slide.kicker || "";
    els.form.h1.value = slide.h1 || "";
    els.form.h2.value = slide.h2 || "";
    els.form.lead.value = slide.lead || "";
    els.form.stamp.value = slide.stamp || "";
    els.form.callout.value = (slide.callouts && slide.callouts[0]) || "";
    renderCards(slide.cards || []);
  }
  els.script.value = slide.script || "";
  snapshotContentBaseline();
  refreshPreview();
  updateStepper();
  updateScriptActions();
}

function collectCards() {
  const slide = currentSlide();
  const cards = (slide.cards || []).map((c) => ({ ...c }));
  els.cardsEditor.querySelectorAll("[data-k]").forEach((el) => {
    const i = Number(el.dataset.i);
    const k = el.dataset.k;
    if (k === "bullets") {
      cards[i].bullets = el.value.split("\n").map((s) => s.trim()).filter(Boolean);
    } else {
      cards[i][k] = el.value;
    }
  });
  return cards;
}

function collectPayload() {
  return {
    title: els.form.title.value.trim(),
    eyebrow: els.form.eyebrow.value.trim(),
    kicker: els.form.kicker.value.trim(),
    h1: els.form.h1.value.trim(),
    h2: els.form.h2.value.trim(),
    lead: els.form.lead.value.trim(),
    stamp: els.form.stamp.value.trim(),
    callouts: els.form.callout.value.trim() ? [els.form.callout.value.trim()] : [],
    cards: collectCards(),
    flowSteps: currentSlide()?.flowSteps || [],
    table: currentSlide()?.table || null,
  };
}

async function loadSourceTranscript() {
  if (!state.deckId || !els.sourceTranscript) return;
  try {
    const data = await api(`/api/decks/${state.deckId}/source-transcript`);
    els.sourceTranscript.value = data.text || "";
    updateTranscriptMeta(data);
  } catch {
    els.sourceTranscript.value = "";
    if (els.sourceTranscriptMeta) els.sourceTranscriptMeta.textContent = "";
  }
}

function updateTranscriptMeta(data) {
  if (!els.sourceTranscriptMeta) return;
  const chars = data?.charCount ?? (els.sourceTranscript?.value?.length || 0);
  const parts = [`${chars.toLocaleString()} 字`];
  if (data?.truncated) parts.push("（已截斷）");
  if (data?.updatedAt) parts.push(`更新 ${new Date(data.updatedAt).toLocaleString()}`);
  els.sourceTranscriptMeta.textContent = parts.join(" · ");
}

async function loadSlides() {
  const data = await api(`/api/decks/${state.deckId}/slides`);
  state.slides = data.slides;
  state.sourceType = data.sourceType || "html";
  state.sourceFlavor = data.sourceFlavor || null;
  state.deckMeta = data;
  state.llmModel = data.modelVersion || state.llmModels?.defaultModel || "gpt-4o-mini";
  fillLlmModelOptions(state.llmModel);
  initStudioVoiceFromManifest(data.voice);
  state.previewZoom = loadPreviewZoom(state.deckId);
  applyPreviewZoom();
  els.studioTitle.textContent = data.title || state.deckId;
  const flavor = state.sourceFlavor && state.sourceFlavor !== "ai-eip-native" ? ` · ${state.sourceFlavor}` : "";
  els.studioMeta.textContent = `${state.deckId} · ${state.sourceType}${flavor} · ${state.slides.length} 頁 · ${state.llmModel}`;
  els.advanced.classList.toggle("hidden", state.sourceType === "pdf");
  if (els.save) {
    els.save.textContent = state.sourceFlavor === "fyh-deck-chrome" ? "儲存欄位（不改畫面）" : "儲存內容並 rebuild";
  }
  await loadSourceTranscript();
  if (!state.currentId && state.slides.length) selectSlide(state.slides[0].slideId);
  else {
    renderList();
    if (state.currentId) selectSlide(state.currentId);
  }
  updateStepper();
  if (data.meta?.publishedUrl) {
    els.publishResult.classList.remove("hidden");
    els.publishResult.innerHTML = `已發布：<a href="${escapeAttr(data.meta.publishedUrl)}" target="_blank" rel="noopener">${escapeHtml(data.meta.publishedUrl)}</a>
      <button type="button" id="btn-copy-url">複製</button>`;
    document.getElementById("btn-copy-url")?.addEventListener("click", () => {
      navigator.clipboard.writeText(data.meta.publishedUrl);
      setStatus("已複製網址");
    });
  }
  setStatus(`已載入 ${state.slides.length} 頁`);
}

async function openStudio(deckId) {
  state.deckId = deckId;
  state.currentId = null;
  state.undoScript = null;
  state.previewZoom = loadPreviewZoom(deckId);
  showStudio(deckId);
  initStudioResizer();
  await loadSlides();
}

async function pollJob(jobId) {
  els.jobProgress.classList.remove("hidden");
  for (;;) {
    const job = await api(`/api/jobs/${jobId}`);
    const pct = job.total ? Math.round((job.progress / job.total) * 100) : 0;
    els.jobProgress.innerHTML = `<div>${escapeHtml(job.message || job.status)} (${job.progress}/${job.total || "?"})</div>
      <div class="bar"><i style="width:${pct}%"></i></div>`;
    if (job.status === "done" || job.status === "error") {
      if (job.status === "error") throw new Error(job.error || job.message);
      return job;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

function slugify(name) {
  return suggestAsciiSlug(name) || `deck-${Date.now().toString(36)}`;
}

function currentImportTab() {
  return document.querySelector(".import-tab.active")?.dataset.importTab || "url";
}

function setImportTab(tab) {
  document.querySelectorAll(".import-tab").forEach((btn) => {
    const on = btn.dataset.importTab === tab;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  els.importPaneUrl?.classList.toggle("hidden", tab !== "url");
  els.importPaneFile?.classList.toggle("hidden", tab !== "file");
}

function applySourceUrlFields() {
  const raw = els.uploadSourceUrl?.value || "";
  if (!els.uploadUrlHint) return;
  if (!raw.trim()) {
    els.uploadUrlHint.textContent = "貼上後會自動解碼檔名並填入標題。";
    els.uploadUrlHint.classList.remove("warn");
    return;
  }
  const parsed = parseSourceUrl(raw);
  if (!parsed.ok) {
    els.uploadUrlHint.textContent = parsed.error;
    els.uploadUrlHint.classList.add("warn");
    return;
  }
  if (els.uploadTitle && !els.uploadTitle.dataset.userEdited) {
    els.uploadTitle.value = parsed.title;
  }
  const existing = findExistingDeck(state.decks, {
    title: els.uploadTitle?.value.trim() || parsed.title,
    deckId: els.uploadDeckId?.value.trim() || parsed.slug,
  });
  if (els.uploadDeckId && !els.uploadDeckId.dataset.userEdited) {
    if (existing) els.uploadDeckId.value = existing.deckId;
    else els.uploadDeckId.value = parsed.slug;
  }
  if (existing) {
    if (els.uploadOverwrite) els.uploadOverwrite.checked = true;
    els.uploadUrlHint.textContent = `解碼檔名：${parsed.fileName}。庫中已有「${existing.title}」（${existing.deckId}），將覆寫既有簡報。`;
    els.uploadUrlHint.classList.add("warn");
  } else {
    els.uploadUrlHint.textContent = `解碼檔名：${parsed.fileName}${parsed.slug ? ` · 建議 deckId ${parsed.slug}` : " · deckId 可留空由系統產生"}`;
    els.uploadUrlHint.classList.remove("warn");
  }
}

async function enterApp(email, extras = {}) {
  const [voices, llmModels] = await Promise.all([api("/api/voices"), api("/api/llm-models")]);
  state.voices = voices.voices;
  state.llmModels = llmModels;
  state.llmModel = llmModels.defaultModel || "gpt-4o-mini";
  fillLlmModelOptions(state.llmModel);
  state.connected = true;
  state.cloudStudio = Boolean(extras.cloudStudio);
  els.userLabel.textContent = email || "";
  els.loginScreen.classList.add("hidden");
  els.app.classList.remove("hidden");
  const localStudio = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  els.remoteNote?.classList.toggle("hidden", localStudio || !state.cloudStudio);
  els.myVoicePanel?.classList.toggle("hidden", !state.cloudStudio);
  els.libraryVoice?.classList.toggle("hidden", !state.cloudStudio);
  if (state.cloudStudio) {
    try {
      await refreshVoiceProfile();
    } catch {
      /* 聲音設定讀取失敗時仍可進入簡報庫 */
    }
  }
  loadVisibleColumns();
  loadCategoryColumns();
  renderColumnSettings();
  renderCategoryColumnSettings();
  await loadCategories();
  await loadDecks();
  if (initialDeck) {
    try {
      await openStudio(initialDeck);
    } catch (err) {
      setStatus(err.message);
    }
    return;
  }
  showLibrary();
  setStatus("已連線");
}

els.logout?.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    /* still leave */
  }
  location.href = "/admin/";
});

els.deckEditForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const deckId = state.editingDeckId;
  if (!deckId) return;
  const title = els.editDeckTitle.value.trim();
  if (!title) return;
  try {
    await api(`/api/decks/${deckId}`, {
      method: "PUT",
      body: JSON.stringify({
        title,
        categoryId: els.editDeckCategory?.value || "",
        summary: els.editDeckSummary?.value || "",
        sortOrder: els.editDeckSort?.value ?? 0,
        listed: Boolean(els.editDeckListed?.checked),
      }),
    });
    els.deckEditDialog.close();
    state.editingDeckId = null;
    await loadDecks();
    if (state.deckId === deckId) {
      els.studioTitle.textContent = title;
    }
    setStatus("簡報目錄已更新");
  } catch (err) {
    setStatus(err.message);
  }
});

els.btnEditCancel?.addEventListener("click", () => {
  state.editingDeckId = null;
  els.deckEditDialog?.close();
});

els.deckEditDialog?.addEventListener("cancel", () => {
  state.editingDeckId = null;
});

els.reloadDecks?.addEventListener("click", () => loadDecks().catch((e) => setStatus(e.message)));
let searchTimer = null;
els.deckSearch?.addEventListener("input", () => {
  state.list.search = els.deckSearch.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.list.debouncedSearch = state.list.search;
    state.list.page = 1;
    renderDecks();
  }, 350);
});
els.deckStatusFilter?.addEventListener("change", () => {
  state.list.statusFilter = els.deckStatusFilter.value;
  state.list.page = 1;
  renderDecks();
});
els.deckCategoryFilter?.addEventListener("change", () => {
  state.list.categoryFilter = els.deckCategoryFilter.value;
  state.list.page = 1;
  renderDecks();
});
els.showUpload?.addEventListener("click", () => els.uploadPanel.classList.toggle("hidden"));
document.querySelectorAll(".import-tab").forEach((btn) => {
  btn.addEventListener("click", () => setImportTab(btn.dataset.importTab));
});
els.uploadSourceUrl?.addEventListener("paste", () => {
  requestAnimationFrame(applySourceUrlFields);
});
els.uploadSourceUrl?.addEventListener("input", applySourceUrlFields);
els.uploadSourceUrl?.addEventListener("blur", applySourceUrlFields);
els.uploadTitle?.addEventListener("input", () => {
  els.uploadTitle.dataset.userEdited = "1";
  applySourceUrlFields();
});
els.uploadDeckId?.addEventListener("input", () => {
  els.uploadDeckId.dataset.userEdited = "1";
  applySourceUrlFields();
});

els.fileInput?.addEventListener("change", () => {
  const f = els.fileInput.files?.[0];
  if (!f) return;
  setImportTab("file");
  if (!els.uploadTitle.value) els.uploadTitle.value = f.name.replace(/\.[^.]+$/, "");
  if (!els.uploadDeckId.value) {
    const slug = suggestAsciiSlug(f.name);
    els.uploadDeckId.value = slug;
  }
});

["dragenter", "dragover"].forEach((ev) => {
  els.dropZone?.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropZone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((ev) => {
  els.dropZone?.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropZone.classList.remove("dragover");
  });
});
els.dropZone?.addEventListener("drop", (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  const dt = new DataTransfer();
  dt.items.add(f);
  els.fileInput.files = dt.files;
  els.fileInput.dispatchEvent(new Event("change"));
});

els.btnUpload?.addEventListener("click", async () => {
  const tab = currentImportTab();
  const file = els.fileInput.files?.[0];
  const sourceUrl = els.uploadSourceUrl?.value.trim() || "";
  if (tab === "url" && !sourceUrl) {
    setStatus("請貼上來源網址");
    return;
  }
  if (tab === "file" && !file) {
    setStatus("請選擇檔案");
    return;
  }
  if (tab === "url") {
    const parsed = parseSourceUrl(sourceUrl);
    if (!parsed.ok) {
      setStatus(parsed.error);
      return;
    }
  }
  setButtonLoading(els.btnUpload, true, tab === "url" ? "正在抓取 HTML／資源…" : "上傳中…");
  setStatus(tab === "url" ? "正在抓取 HTML／資源…" : "上傳中…");
  try {
    let data;
    if (tab === "url" || (!file && sourceUrl)) {
      data = await api("/api/decks/import-url", {
        method: "POST",
        body: JSON.stringify({
          sourceUrl,
          title: els.uploadTitle.value.trim() || undefined,
          deckId: els.uploadDeckId.value.trim() || undefined,
          overwrite: els.uploadOverwrite.checked ? "1" : undefined,
          categoryId: els.uploadCategory?.value || "",
          sortOrder: els.uploadSort?.value ?? 0,
          listed: els.uploadListed?.checked ? "1" : "0",
        }),
      });
    } else {
      const fd = new FormData();
      fd.append("file", file);
      if (els.uploadTitle.value.trim()) fd.append("title", els.uploadTitle.value.trim());
      if (els.uploadDeckId.value.trim()) fd.append("deckId", els.uploadDeckId.value.trim());
      if (els.uploadOverwrite.checked) fd.append("overwrite", "1");
      if (sourceUrl) fd.append("sourceUrl", sourceUrl);
      fd.append("categoryId", els.uploadCategory?.value || "");
      fd.append("sortOrder", els.uploadSort?.value ?? "0");
      fd.append("listed", els.uploadListed?.checked ? "1" : "0");
      data = await api("/api/decks", { method: "POST", body: fd });
    }
    await loadDecks();
    await openStudio(data.deck.deckId);
    setStatus("匯入完成");
  } catch (err) {
    setStatus(err.message);
  } finally {
    setButtonLoading(els.btnUpload, false);
  }
});

els.reload?.addEventListener("click", () => loadSlides().catch((e) => setStatus(e.message)));

els.save?.addEventListener("click", async () => {
  if (!state.currentId) return;
  setButtonLoading(els.save, true, "儲存中…");
  try {
    await api(`/api/decks/${state.deckId}/slides/${state.currentId}`, {
      method: "PUT",
      body: JSON.stringify(collectPayload()),
    });
    state.previewToken = Date.now();
    await loadSlides();
    snapshotContentBaseline();
    updateScriptActions();
    setStatus(state.cloudStudio || state.sourceFlavor === "fyh-deck-chrome" ? "內容已儲存" : "內容已儲存並 rebuild");
  } catch (err) {
    setStatus(err.message);
  } finally {
    setButtonLoading(els.save, false);
    updateScriptActions();
  }
});

els.saveScript?.addEventListener("click", async () => {
  if (!state.currentId) return;
  setButtonLoading(els.saveScript, true, "儲存中…");
  try {
    await api(`/api/decks/${state.deckId}/slides/${state.currentId}/script`, {
      method: "PUT",
      body: JSON.stringify({ script: els.script.value }),
    });
    state.undoScript = null;
    await loadSlides();
    updateScriptActions();
    setStatus("講稿已儲存");
  } catch (err) {
    setStatus(err.message);
  } finally {
    setButtonLoading(els.saveScript, false);
    updateScriptActions();
  }
});

els.regenScript?.addEventListener("click", async () => {
  if (!state.currentId) return;
  setButtonLoading(els.regenScript, true, "生成中…");
  setStatus("重生講稿中…");
  try {
    const data = await api(`/api/decks/${state.deckId}/slides/${state.currentId}/regenerate-script`, {
      method: "POST",
      body: JSON.stringify({ model: getSelectedLlmModel() }),
    });
    state.undoScript = data.previousScript ?? "";
    els.script.value = data.slide.script || "";
    await loadSlides();
    updateScriptActions();
    setStatus(data.generation?.generationNotes ? `講稿已重生（${data.generation.generationNotes}）` : "講稿已重生");
  } catch (err) {
    setStatus(err.message);
  } finally {
    setButtonLoading(els.regenScript, false);
    updateScriptActions();
  }
});

els.undoScript?.addEventListener("click", async () => {
  if (!state.currentId || state.undoScript == null) return;
  const prev = state.undoScript;
  setButtonLoading(els.undoScript, true, "回復中…");
  try {
    await api(`/api/decks/${state.deckId}/slides/${state.currentId}/script`, {
      method: "PUT",
      body: JSON.stringify({ script: prev }),
    });
    els.script.value = prev;
    state.undoScript = null;
    await loadSlides();
    updateScriptActions();
    setStatus("已回復上一版講稿");
  } catch (err) {
    setStatus(err.message);
  } finally {
    setButtonLoading(els.undoScript, false);
    updateScriptActions();
  }
});

els.previewTts?.addEventListener("click", async () => {
  if (!state.currentId) return;
  setStatus("試播合成中…");
  try {
    const data = await api(`/api/decks/${state.deckId}/slides/${state.currentId}/preview-tts`, {
      method: "POST",
      body: JSON.stringify({
        gender: els.gender.value,
        voiceId: els.voiceId.value,
        script: els.script.value,
      }),
    });
    els.previewAudio.src = `/${data.previewUrl}`;
    els.previewAudio.play().catch(() => {});
    setStatus(`試播就緒（${data.voiceId}）`);
  } catch (err) {
    setStatus(err.message);
  }
});

els.synth?.addEventListener("click", async () => {
  if (!state.currentId) return;
  setStatus("正式 TTS 合成中…");
  try {
    await api(`/api/decks/${state.deckId}/slides/${state.currentId}/script`, {
      method: "PUT",
      body: JSON.stringify({ script: els.script.value }),
    });
    await api(`/api/decks/${state.deckId}/slides/${state.currentId}/synthesize`, {
      method: "POST",
      body: JSON.stringify({ gender: els.gender.value, voiceId: els.voiceId.value }),
    });
    await loadSlides();
    setStatus("正式語音已更新");
  } catch (err) {
    setStatus(err.message);
  }
});

async function generateAllScriptsCloud() {
  const targets = state.slides.filter((slide) => !slide.script || ["empty", "stale"].includes(slide.status));
  if (!targets.length) {
    setStatus("講稿都已存在");
    return;
  }
  els.jobProgress.classList.remove("hidden");
  for (let i = 0; i < targets.length; i++) {
    const slide = targets[i];
    const pct = Math.round((i / targets.length) * 100);
    els.jobProgress.innerHTML = `<div>生成 ${escapeHtml(slide.slideId)} (${i}/${targets.length})</div>
      <div class="bar"><i style="width:${pct}%"></i></div>`;
    await api(`/api/decks/${state.deckId}/slides/${slide.slideId}/regenerate-script`, {
      method: "POST",
      body: JSON.stringify({ model: getSelectedLlmModel() }),
    });
  }
  els.jobProgress.classList.add("hidden");
  await loadSlides();
  setStatus("全部講稿已生成");
}

els.genAllScripts?.addEventListener("click", async () => {
  setStatus("批次生成講稿…");
  try {
    if (state.cloudStudio) {
      await generateAllScriptsCloud();
      return;
    }
    const { jobId } = await api(`/api/decks/${state.deckId}/generate-scripts`, {
      method: "POST",
      body: JSON.stringify({
        force: false,
        model: getSelectedLlmModel(),
        batchVisionHigh: Boolean(els.batchVisionHigh?.checked),
      }),
    });
    await pollJob(jobId);
    await loadSlides();
    els.jobProgress.classList.add("hidden");
    setStatus("全部講稿已生成");
  } catch (err) {
    setStatus(err.message);
  }
});

els.synthAll?.addEventListener("click", async () => {
  const missing = state.slides.filter((s) => !s.script).length;
  if (missing) {
    if (!confirm(`尚有 ${missing} 頁無講稿，仍要合成有講稿的頁面嗎？`)) return;
  }
  const n = state.slides.filter((s) => s.script).length;
  if (!confirm(`將為約 ${n} 頁生成正式語音（性別：${els.gender.value}／${els.voiceId.value}）。繼續？`)) return;
  setStatus("批次 TTS…");
  try {
    if (state.cloudStudio) {
      const targets = state.slides.filter((slide) => slide.script);
      els.jobProgress.classList.remove("hidden");
      for (let i = 0; i < targets.length; i++) {
        const slide = targets[i];
        const pct = Math.round((i / targets.length) * 100);
        els.jobProgress.innerHTML = `<div>語音 ${escapeHtml(slide.slideId)} (${i}/${targets.length})</div>
          <div class="bar"><i style="width:${pct}%"></i></div>`;
        await api(`/api/decks/${state.deckId}/slides/${slide.slideId}/script`, {
          method: "PUT",
          body: JSON.stringify({ script: slide.slideId === state.currentId ? els.script.value : slide.script }),
        });
        await api(`/api/decks/${state.deckId}/slides/${slide.slideId}/synthesize`, {
          method: "POST",
          body: JSON.stringify({ gender: els.gender.value, voiceId: els.voiceId.value }),
        });
      }
      els.jobProgress.classList.add("hidden");
      await loadSlides();
      setStatus("全部語音已完成");
      return;
    }
    const start = await api(`/api/decks/${state.deckId}/synthesize-all`, {
      method: "POST",
      body: JSON.stringify({
        gender: els.gender.value,
        voiceId: els.voiceId.value,
        force: true,
      }),
    });
    setStatus(`預估成本約 $${start.costEstimateUsd}`);
    await pollJob(start.jobId);
    await loadSlides();
    els.jobProgress.classList.add("hidden");
    setStatus("全部語音已完成");
  } catch (err) {
    setStatus(err.message);
  }
});

els.openDeck?.addEventListener("click", () => {
  if (!state.deckId) return;
  window.open(`/${state.deckId}.html`, "_blank");
});

els.publish?.addEventListener("click", async () => {
  const missingScripts = state.slides.filter((s) => !s.script).length;
  const missingAudio = state.slides.filter((s) => s.status !== "audio_ready").length;
  let force = false;
  if (missingScripts || missingAudio) {
    force = confirm(`缺講稿 ${missingScripts}、缺完整語音 ${missingAudio}。仍要發布？`);
    if (!force) return;
  } else if (!confirm(state.cloudStudio ? "確定發布到公開簡報頁？" : "確定上傳到 Cloudflare 正式環境？")) {
    return;
  }
  setStatus(state.cloudStudio ? "發布到公開頁…" : "發布中（wrangler deploy）…");
  try {
    const data = await api(`/api/decks/${state.deckId}/publish`, {
      method: "POST",
      body: JSON.stringify({ force }),
    });
    els.publishResult.classList.remove("hidden");
    els.publishResult.innerHTML = `正式網址：<a href="${escapeAttr(data.url)}" target="_blank" rel="noopener">${escapeHtml(data.url)}</a>
      <button type="button" id="btn-copy-url">複製</button>`;
    document.getElementById("btn-copy-url")?.addEventListener("click", () => {
      navigator.clipboard.writeText(data.url);
      setStatus("已複製網址");
    });
    await loadSlides();
    setStatus("發布完成");
  } catch (err) {
    setStatus(err.message);
  }
});

els.gender?.addEventListener("change", () => {
  state.studioVoice.gender = els.gender.value;
  const keep = state.voices.some((v) => v.custom && v.id === state.studioVoice.voiceId) ? state.studioVoice.voiceId : null;
  fillVoiceOptions(state.studioVoice.gender, keep);
  state.studioVoice.voiceId = els.voiceId.value;
  persistStudioVoice();
});

els.voiceId?.addEventListener("change", () => {
  state.studioVoice.voiceId = els.voiceId.value;
  persistStudioVoice();
});

const voiceCapture = {
  recorder: null,
  stream: null,
  chunks: [],
  timer: 0,
  tick: 0,
  startedAt: 0,
  audioContext: null,
  meterFrame: 0,
  mime: "",
  elapsed: 0,
  blob: null,
  objectUrl: "",
};

function voiceSummary(profile) {
  if (!profile?.ready) {
    if (profile?.consentReady) return "同意句已錄好。再錄 10–30 秒自然講話，就能用在全部簡報。";
    return "尚未建立。錄一次之後，每一份簡報都可以用這個聲音。";
  }
  if (profile.defaultForAll) return "已是全部簡報的預設聲音。已生成的 mp3 要重新生成才會換成新聲音。";
  return "聲音已建立，還沒套用到簡報。";
}

function setVoiceMessage(message, tone) {
  if (!els.voiceStatus) return;
  els.voiceStatus.textContent = message || "";
  els.voiceStatus.classList.toggle("is-error", tone === "error");
}

function renderVoiceSurfaces() {
  const text = voiceSummary(state.voiceProfile);
  if (els.libraryVoiceSummary) els.libraryVoiceSummary.textContent = text;
  if (els.studioVoiceSummary) els.studioVoiceSummary.textContent = text;
  renderVoiceDialog();
}

async function refreshVoiceProfile() {
  if (!state.cloudStudio) return;
  const [profile, voices] = await Promise.all([api("/api/voice"), api("/api/voices")]);
  state.voiceProfile = profile;
  state.voices = voices.voices || [];
  if (els.voiceId) applyStudioVoiceToUi();
  renderVoiceSurfaces();
}

function describeMicError(err) {
  const name = err?.name || "";
  const message = String(err?.message || "");
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    return "這個瀏覽器不能直接錄音。請改上傳音檔。";
  }
  if (!window.isSecureContext || name === "SecurityError") {
    return "這個頁面不能開麥克風。請改上傳音檔。";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "瀏覽器沒有麥克風權限。請點網址列的鎖頭，把麥克風改成允許後再試。";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "找不到麥克風。請接上麥克風，或改上傳音檔。";
  }
  if (name === "NotReadableError" || /could not start audio source/i.test(message)) {
    return "麥克風沒有啟動。它可能被其他程式占用，或這支裝置無法錄音。請關掉其他使用麥克風的分頁後再試，或改上傳音檔。";
  }
  if (name === "OverconstrainedError") return "這支麥克風不符合錄音設定。請換一支，或改上傳音檔。";
  if (name === "AbortError") return "錄音被中斷。請再試一次。";
  return "無法啟動麥克風。請再試一次，或改上傳音檔。";
}

function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) =>
    MediaRecorder.isTypeSupported(type)
  ) || "";
}

function audioFilename(kind, blob) {
  const type = blob.type || "";
  const ext = type.includes("mp4") || type.includes("m4a") || type.includes("aac")
    ? "m4a"
    : type.includes("wav")
      ? "wav"
      : type.includes("mpeg") || type.includes("mp3")
        ? "mp3"
        : type.includes("ogg")
          ? "ogg"
          : "webm";
  return `${kind}.${ext}`;
}

function clipAccepted(kind, blob, elapsed) {
  if (kind === "sample") return elapsed >= 10 || (elapsed === 0 && blob.size >= 8000);
  return elapsed >= 3 || (elapsed === 0 && blob.size >= 1000);
}

function clearVoiceReview() {
  if (voiceCapture.objectUrl) URL.revokeObjectURL(voiceCapture.objectUrl);
  voiceCapture.objectUrl = "";
  voiceCapture.blob = null;
  voiceCapture.elapsed = 0;
  if (els.voicePreview) {
    els.voicePreview.pause();
    els.voicePreview.removeAttribute("src");
    els.voicePreview.classList.add("hidden");
  }
}

async function releaseVoiceCapture() {
  cancelAnimationFrame(voiceCapture.meterFrame);
  clearInterval(voiceCapture.tick);
  clearTimeout(voiceCapture.timer);
  const recorder = voiceCapture.recorder;
  const stream = voiceCapture.stream;
  const ctx = voiceCapture.audioContext;
  voiceCapture.recorder = null;
  voiceCapture.stream = null;
  voiceCapture.audioContext = null;
  if (recorder && recorder.state !== "inactive") {
    await new Promise((resolve) => {
      recorder.addEventListener("stop", resolve, { once: true });
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });
  }
  stream?.getTracks().forEach((track) => track.stop());
  ctx?.close().catch(() => {});
}

async function openMic(deviceId) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error("mediaDevices unavailable");
    error.name = "NotSupportedError";
    throw error;
  }
  const processed = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
  const plain = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  const attempts = [];
  if (deviceId) attempts.push({ audio: { ...processed, deviceId: { exact: deviceId } } });
  attempts.push({ audio: processed });
  attempts.push({ audio: plain });
  attempts.push({ audio: true });
  let last = new Error("Could not start audio source");
  last.name = "NotReadableError";
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      last = err;
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") throw err;
    }
  }
  throw last;
}

function startMeter(stream) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  ctx.createMediaStreamSource(stream).connect(analyser);
  voiceCapture.audioContext = ctx;
  const data = new Uint8Array(analyser.fftSize);
  const draw = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) {
      const sample = (value - 128) / 128;
      sum += sample * sample;
    }
    const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
    if (els.voiceMeterBar) els.voiceMeterBar.style.width = `${Math.round(level * 100)}%`;
    voiceCapture.meterFrame = requestAnimationFrame(draw);
  };
  voiceCapture.meterFrame = requestAnimationFrame(draw);
}

function setVoiceReview(blob, elapsed) {
  clearVoiceReview();
  voiceCapture.blob = blob;
  voiceCapture.elapsed = elapsed;
  voiceCapture.objectUrl = URL.createObjectURL(blob);
  if (els.voicePreview) {
    els.voicePreview.src = voiceCapture.objectUrl;
    els.voicePreview.classList.remove("hidden");
  }
  state.voiceUi.phase = "review";
  const kind = state.voiceUi.step === "sample" ? "sample" : "consent";
  if (!clipAccepted(kind, blob, elapsed)) {
    const need = kind === "sample" ? "至少 10 秒" : "完整唸出同意句";
    setVoiceMessage(`這段太短，請${need}後再使用。`, "error");
  } else {
    setVoiceMessage("先聽一次。沒問題再按「使用這段」。");
  }
  renderVoiceDialog();
}

function finishVoiceCapture() {
  const recorder = voiceCapture.recorder;
  if (!recorder || recorder.state === "inactive") return;
  const elapsed = (performance.now() - voiceCapture.startedAt) / 1000;
  recorder.onstop = () => {
    const blob = new Blob(voiceCapture.chunks, { type: voiceCapture.mime || "audio/webm" });
    voiceCapture.stream?.getTracks().forEach((track) => track.stop());
    voiceCapture.recorder = null;
    voiceCapture.stream = null;
    clearInterval(voiceCapture.tick);
    clearTimeout(voiceCapture.timer);
    cancelAnimationFrame(voiceCapture.meterFrame);
    voiceCapture.audioContext?.close().catch(() => {});
    voiceCapture.audioContext = null;
    setVoiceReview(blob, elapsed);
  };
  try {
    recorder.stop();
  } catch (err) {
    setVoiceMessage(describeMicError(err), "error");
    state.voiceUi.phase = "idle";
    renderVoiceDialog();
  }
}

async function startVoiceCapture(kind) {
  await releaseVoiceCapture();
  clearVoiceReview();
  const stream = await openMic(els.voiceMic?.value || "");
  const mime = pickRecorderMime();
  let recorder;
  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch (err) {
    stream.getTracks().forEach((track) => track.stop());
    throw err;
  }
  voiceCapture.chunks = [];
  voiceCapture.mime = recorder.mimeType || mime || "audio/webm";
  voiceCapture.stream = stream;
  voiceCapture.recorder = recorder;
  voiceCapture.startedAt = performance.now();
  voiceCapture.elapsed = 0;
  recorder.ondataavailable = (event) => {
    if (event.data?.size) voiceCapture.chunks.push(event.data);
  };
  try {
    recorder.start(250);
  } catch {
    recorder.start();
  }
  startMeter(stream);
  state.voiceUi.step = kind;
  state.voiceUi.phase = "recording";
  voiceCapture.tick = setInterval(() => {
    voiceCapture.elapsed = (performance.now() - voiceCapture.startedAt) / 1000;
    if (els.voiceTimer) els.voiceTimer.textContent = formatClock(voiceCapture.elapsed);
  }, 200);
  voiceCapture.timer = setTimeout(() => {
    if (voiceCapture.recorder?.state === "recording") finishVoiceCapture();
  }, 30000);
  renderVoiceDialog();
  loadMicDevices().catch(() => {});
}

async function loadMicDevices() {
  if (!els.voiceMic || !navigator.mediaDevices?.enumerateDevices) return;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
  const current = els.voiceMic.value;
  els.voiceMic.innerHTML = "";
  devices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `麥克風 ${index + 1}`;
    if (device.deviceId === current) option.selected = true;
    els.voiceMic.appendChild(option);
  });
  const labeled = devices.some((device) => device.label);
  els.voiceMicLabel?.classList.toggle("hidden", devices.length < 2 && !labeled);
}

function renderVoiceDialog() {
  const profile = state.voiceProfile;
  const step = state.voiceUi.step;
  const phase = state.voiceUi.phase;
  const recording = phase === "recording";
  const review = phase === "review";
  const uploading = phase === "uploading";
  els.voicePaneConsent?.classList.toggle("hidden", step !== "consent");
  els.voicePaneSample?.classList.toggle("hidden", step !== "sample");
  els.voicePaneApply?.classList.toggle("hidden", step !== "apply");
  els.voiceCaptureBox?.classList.toggle("hidden", step === "apply");
  els.voiceMeter?.classList.toggle("hidden", !recording);
  els.voiceTimer?.classList.toggle("hidden", !recording);
  if (recording && els.voiceTimer) els.voiceTimer.textContent = formatClock(voiceCapture.elapsed);
  if (els.recordVoice) {
    els.recordVoice.textContent = recording
      ? `停止 ${formatClock(voiceCapture.elapsed)}`
      : step === "sample"
        ? "開始錄聲音樣本"
        : "開始錄同意句";
    els.recordVoice.disabled = uploading;
  }
  const kind = step === "sample" ? "sample" : "consent";
  const acceptable = review && voiceCapture.blob && clipAccepted(kind, voiceCapture.blob, voiceCapture.elapsed);
  els.useVoice?.classList.toggle("hidden", !review);
  els.redoVoice?.classList.toggle("hidden", !review);
  if (els.useVoice) els.useVoice.disabled = !acceptable || uploading;
  els.voiceUploadLabel?.classList.toggle("hidden", recording || uploading);
  if (els.applyVoice) {
    els.applyVoice.disabled = !profile?.ready || uploading;
    els.applyVoice.textContent = uploading && step === "apply" ? "套用中…" : "套用到全部簡報";
  }
  document.querySelectorAll("[data-voice-step]").forEach((button) => {
    const name = button.dataset.voiceStep;
    button.classList.toggle("active", name === step);
    button.classList.toggle("done", (name === "consent" && profile?.consentReady) || (name === "sample" && profile?.ready) || (name === "apply" && profile?.defaultForAll));
    button.disabled = recording || uploading;
  });
}

function preferredVoiceStep(profile) {
  if (!profile?.consentReady) return "consent";
  if (!profile.ready) return "sample";
  return "apply";
}

async function openVoiceDialog() {
  if (!state.voiceProfile) {
    try {
      await refreshVoiceProfile();
    } catch (err) {
      setVoiceMessage(err.message || "讀不到聲音設定", "error");
    }
  }
  if (state.voiceUi.phase !== "recording") {
    state.voiceUi.step = preferredVoiceStep(state.voiceProfile);
    state.voiceUi.phase = "idle";
    clearVoiceReview();
  }
  renderVoiceDialog();
  loadMicDevices().catch(() => {});
  els.voiceDialog?.showModal();
}

async function uploadVoiceClip(path, blob, filename) {
  const body = new FormData();
  body.append("recording", blob, filename);
  return api(path, { method: "POST", body });
}

async function submitVoiceClip() {
  const kind = state.voiceUi.step === "sample" ? "sample" : "consent";
  const blob = voiceCapture.blob;
  if (!blob || !clipAccepted(kind, blob, voiceCapture.elapsed)) return;
  state.voiceUi.phase = "uploading";
  renderVoiceDialog();
  setVoiceMessage(kind === "sample" ? "建立我的聲音…" : "上傳同意句…");
  try {
    const data = await uploadVoiceClip(kind === "sample" ? "/api/voice/sample" : "/api/voice/consent", blob, audioFilename(kind, blob));
    await refreshVoiceProfile();
    clearVoiceReview();
    state.voiceUi.phase = "idle";
    state.voiceUi.step = kind === "consent" ? "sample" : "apply";
    if (kind === "sample" && data.voiceId) {
      state.studioVoice.voiceId = data.voiceId;
      applyStudioVoiceToUi();
    }
    setVoiceMessage(kind === "consent" ? "同意句已建立。接著錄 10–30 秒自然講話。" : "我的聲音已建立。可以套用到全部簡報。");
    renderVoiceDialog();
  } catch (err) {
    state.voiceUi.phase = "review";
    setVoiceMessage(err.message || "上傳失敗", "error");
    renderVoiceDialog();
  }
}

async function applyVoiceToAllDecks() {
  if (state.voiceUi.phase === "uploading") return;
  if (!state.voiceProfile?.ready) {
    setVoiceMessage("請先完成同意句與聲音樣本。", "error");
    return;
  }
  state.voiceUi.step = "apply";
  state.voiceUi.phase = "uploading";
  renderVoiceDialog();
  try {
    state.voiceProfile = await api("/api/voice", {
      method: "PUT",
      body: JSON.stringify({ defaultForAll: true }),
    });
    if (!state.decks.length) await loadDecks();
    const ids = state.decks.map((deck) => deck.deckId).filter(Boolean);
    let failed = 0;
    for (let index = 0; index < ids.length; index += 1) {
      setVoiceMessage(`正在套用 ${index + 1}/${ids.length}`);
      try {
        await api(`/api/decks/${ids[index]}/voice`, {
          method: "PUT",
          body: JSON.stringify({ voiceId: state.voiceProfile.voiceId, scope: "global" }),
        });
      } catch {
        failed += 1;
      }
    }
    await refreshVoiceProfile();
    if (state.deckId) state.studioVoice.voiceId = state.voiceProfile.voiceId;
    if (state.deckId) await loadSlides();
    state.voiceUi.phase = "idle";
    const done = ids.length - failed;
    const summary = !ids.length
      ? "已設為預設聲音。簡報庫目前是空的，之後開啟的簡報會用它。"
      : failed
        ? `已套用 ${done} 份，${failed} 份讀不到原稿。`
        : `已套用到 ${done} 份簡報。之後的試播與新語音都會用我的聲音。`;
    setVoiceMessage(summary);
    setStatus(summary);
    renderVoiceDialog();
  } catch (err) {
    state.voiceUi.phase = "idle";
    setVoiceMessage(err.message || "套用失敗", "error");
    renderVoiceDialog();
  }
}

async function readFileDuration(file) {
  const url = URL.createObjectURL(file);
  try {
    const audio = new Audio();
    audio.preload = "metadata";
    return await new Promise((resolve) => {
      audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      audio.onerror = () => resolve(0);
      audio.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

els.openVoice?.addEventListener("click", () => openVoiceDialog());
els.openVoiceStudio?.addEventListener("click", () => openVoiceDialog());
els.closeVoice?.addEventListener("click", () => els.voiceDialog?.close());
els.voiceDialog?.addEventListener("close", () => {
  if (voiceCapture.recorder) voiceCapture.recorder.onstop = null;
  releaseVoiceCapture();
  if (state.voiceUi.phase !== "uploading") state.voiceUi.phase = "idle";
});
els.voiceDialog?.addEventListener("click", (event) => {
  const step = event.target.closest?.("[data-voice-step]")?.dataset.voiceStep;
  if (!step || state.voiceUi.phase === "recording" || state.voiceUi.phase === "uploading") return;
  if (step === "sample" && !state.voiceProfile?.consentReady) {
    setVoiceMessage("請先錄同意句。", "error");
    return;
  }
  if (step === "apply" && !state.voiceProfile?.ready) {
    setVoiceMessage("請先錄聲音樣本。", "error");
    return;
  }
  state.voiceUi.step = step;
  state.voiceUi.phase = "idle";
  clearVoiceReview();
  renderVoiceDialog();
});
els.recordVoice?.addEventListener("click", async () => {
  if (state.voiceUi.phase === "recording") {
    finishVoiceCapture();
    return;
  }
  const kind = state.voiceUi.step === "sample" ? "sample" : "consent";
  if (kind === "sample" && !state.voiceProfile?.consentReady) {
    setVoiceMessage("請先錄同意句。", "error");
    state.voiceUi.step = "consent";
    renderVoiceDialog();
    return;
  }
  try {
    setVoiceMessage(kind === "sample" ? "錄音中。用平常說話的音量講 10–30 秒，再按停止。" : "錄音中。請逐字唸出同意句，再按停止。");
    await startVoiceCapture(kind);
  } catch (err) {
    await releaseVoiceCapture();
    state.voiceUi.phase = "idle";
    setVoiceMessage(describeMicError(err), "error");
    renderVoiceDialog();
  }
});
els.useVoice?.addEventListener("click", () => {
  if (state.voiceUi.phase === "uploading") return;
  submitVoiceClip();
});
els.redoVoice?.addEventListener("click", async () => {
  await releaseVoiceCapture();
  clearVoiceReview();
  state.voiceUi.phase = "idle";
  setVoiceMessage("");
  renderVoiceDialog();
});
els.applyVoice?.addEventListener("click", () => applyVoiceToAllDecks());
els.voiceFile?.addEventListener("change", async () => {
  const file = els.voiceFile.files?.[0];
  els.voiceFile.value = "";
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    setVoiceMessage("音檔超過 10MB。", "error");
    return;
  }
  const elapsed = await readFileDuration(file);
  setVoiceReview(file, elapsed);
});

els.llmModel?.addEventListener("change", () => {
  const isCustom = els.llmModel.value === "__custom__";
  els.llmModelCustom?.classList.toggle("hidden", !isCustom);
  if (!isCustom) {
    state.llmModel = els.llmModel.value;
    persistLlmModel();
    if (els.studioMeta && state.deckId) {
      els.studioMeta.textContent = `${state.deckId} · ${state.sourceType}${state.sourceFlavor && state.sourceFlavor !== "ai-eip-native" ? ` · ${state.sourceFlavor}` : ""} · ${state.slides.length} 頁 · ${state.llmModel}`;
    }
  }
});

els.llmModelCustom?.addEventListener("change", () => persistLlmModel());
els.llmModelCustom?.addEventListener("blur", () => persistLlmModel());

els.saveTranscript?.addEventListener("click", async () => {
  if (!state.deckId) return;
  setStatus("儲存參考稿…");
  try {
    const data = await api(`/api/decks/${state.deckId}/source-transcript`, {
      method: "PUT",
      body: JSON.stringify({ text: els.sourceTranscript.value }),
    });
    updateTranscriptMeta(data);
    setStatus(data.truncated ? "參考稿已儲存（超出上限，已截斷）" : "參考稿已儲存，生成講稿時將優先對照");
  } catch (err) {
    setStatus(err.message);
  }
});

els.transcriptFile?.addEventListener("change", async () => {
  const file = els.transcriptFile.files?.[0];
  if (!file || !state.deckId) return;
  const fd = new FormData();
  fd.append("file", file);
  setStatus("上傳參考稿…");
  try {
    const data = await api(`/api/decks/${state.deckId}/source-transcript/upload`, {
      method: "POST",
      body: fd,
    });
    els.sourceTranscript.value = data.text || "";
    updateTranscriptMeta(data);
    setStatus(data.truncated ? "參考稿已上傳（已截斷）" : "參考稿已上傳");
  } catch (err) {
    setStatus(err.message);
  } finally {
    els.transcriptFile.value = "";
  }
});

els.previewZoomIn?.addEventListener("click", () => setPreviewZoom(state.previewZoom + 0.1, { manual: true }));
els.previewZoomOut?.addEventListener("click", () => setPreviewZoom(state.previewZoom - 0.1, { manual: true }));
els.previewFit?.addEventListener("click", () => {
  state.autoFitPreview = true;
  fitPreviewToPanel();
});

els.previewViewport?.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setPreviewZoom(state.previewZoom + delta, { manual: true });
  },
  { passive: false }
);
els.script?.addEventListener("input", () => updateScriptActions());

els.form?.addEventListener("input", () => updateScriptActions());
els.cardsEditor?.addEventListener("input", () => updateScriptActions());

els.addCard?.addEventListener("click", () => {
  const slide = currentSlide();
  slide.cards = slide.cards || [];
  slide.cards.push({ heading: "", paragraph: "", bullets: [] });
  renderCards(slide.cards);
  updateScriptActions();
});

function loadCategoryColumns() {
  try {
    const raw = localStorage.getItem(CATEGORY_COLUMN_STORAGE);
    const keys = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(keys) || !keys.length) return;
    const allowed = new Set(CATEGORY_COLUMNS.map((col) => col.key));
    const next = keys.filter((key) => allowed.has(key));
    if (next.length) state.categoryList.visibleColumns = new Set(next);
  } catch {
    /* keep defaults */
  }
}

function persistCategoryColumns() {
  localStorage.setItem(CATEGORY_COLUMN_STORAGE, JSON.stringify([...state.categoryList.visibleColumns]));
}

function visibleCategoryColumns() {
  return CATEGORY_COLUMNS.filter((col) => state.categoryList.visibleColumns.has(col.key));
}

function categorySearchHaystack(category) {
  return [category.name, category.id, category.description, category.isActive ? "啟用" : "停用"].join(" ").toLowerCase();
}

function processCategoryList() {
  let list = state.categories.filter((category) => {
    if (state.categoryList.statusFilter === "active") return category.isActive !== false;
    if (state.categoryList.statusFilter === "inactive") return category.isActive === false;
    return true;
  });
  const q = state.categoryList.debouncedSearch.trim().toLowerCase();
  if (q) list = list.filter((category) => categorySearchHaystack(category).includes(q));
  const col = CATEGORY_COLUMNS.find((item) => item.key === state.categoryList.sortBy) || CATEGORY_COLUMNS[0];
  list = [...list].sort((a, b) => compareDecks(a, b, col, state.categoryList.sortDir));
  const total = list.length;
  const pageSize = state.categoryList.pageSize;
  const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1);
  if (state.categoryList.page > maxPage) state.categoryList.page = maxPage;
  const start = (state.categoryList.page - 1) * pageSize;
  return { pagedRows: list.slice(start, start + pageSize), total, start };
}

function renderCategoryCell(category, key) {
  switch (key) {
    case "name":
      return `<td><strong>${escapeHtml(category.name)}</strong></td>`;
    case "id":
      return `<td><code>${escapeHtml(category.id)}</code></td>`;
    case "deckCount":
      return `<td class="num">${category.deckCount || 0}</td>`;
    case "sortOrder":
      return `<td class="num">${Number(category.sortOrder) || 0}</td>`;
    case "isActive":
      return `<td>${category.isActive === false ? '<span class="chip">停用</span>' : '<span class="chip ok">啟用</span>'}</td>`;
    case "description":
      return `<td>${escapeHtml(category.description || "—")}</td>`;
    default:
      return "<td></td>";
  }
}

function renderCategoryColumnSettings() {
  if (!els.categoryColumnSettingsList) return;
  els.categoryColumnSettingsList.innerHTML = CATEGORY_COLUMNS.map(
    (col) => `
    <label class="checkbox">
      <input type="checkbox" data-col="${escapeAttr(col.key)}" ${state.categoryList.visibleColumns.has(col.key) ? "checked" : ""} />
      ${escapeHtml(col.label)}
    </label>`
  ).join("");
  els.categoryColumnSettingsList.querySelectorAll("input[data-col]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.col;
      if (input.checked) state.categoryList.visibleColumns.add(key);
      else if (state.categoryList.visibleColumns.size > 1) state.categoryList.visibleColumns.delete(key);
      else input.checked = true;
      persistCategoryColumns();
      renderCategories();
    });
  });
}

function renderCategoryHead() {
  if (!els.categoryTableHead) return;
  const cols = visibleCategoryColumns();
  els.categoryTableHead.innerHTML = `${cols
    .map((col) => {
      const sorted = state.categoryList.sortBy === col.key;
      const arrow = !col.sortable ? "" : sorted ? (state.categoryList.sortDir === "asc" ? " ▲" : " ▼") : "";
      const cls = ["th-sort", col.sortable ? "sortable" : "", sorted ? "is-sorted" : ""].filter(Boolean).join(" ");
      return `<th class="${cls}" data-sort="${escapeAttr(col.key)}" ${col.sortable ? 'role="button" tabindex="0"' : ""}>${escapeHtml(col.label)}${arrow}</th>`;
    })
    .join("")}<th class="col-actions">操作</th>`;
  els.categoryTableHead.querySelectorAll("[data-sort]").forEach((th) => {
    const col = CATEGORY_COLUMNS.find((item) => item.key === th.dataset.sort);
    if (!col?.sortable) return;
    const apply = () => {
      if (state.categoryList.sortBy === col.key) {
        state.categoryList.sortDir = state.categoryList.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.categoryList.sortBy = col.key;
        state.categoryList.sortDir = "asc";
      }
      state.categoryList.page = 1;
      renderCategories();
    };
    th.addEventListener("click", apply);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        apply();
      }
    });
  });
}

function renderCategoryPagination(total, start, pageSize) {
  if (!els.categoryPagination) return;
  const end = total === 0 ? 0 : Math.min(start + pageSize, total);
  const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1);
  els.categoryPagination.innerHTML = `
    <span class="page-meta">第 ${total ? start + 1 : 0}–${end} 筆／共 ${total} 筆</span>
    <label>每頁
      <select id="category-page-size">
        ${[10, 20, 50, 100].map((n) => `<option value="${n}" ${n === pageSize ? "selected" : ""}>${n}</option>`).join("")}
      </select>
    </label>
    <div class="page-nav">
      <button type="button" class="ghost-btn sm" data-page="prev" ${state.categoryList.page <= 1 ? "disabled" : ""}>上一頁</button>
      <span>${state.categoryList.page} / ${maxPage}</span>
      <button type="button" class="ghost-btn sm" data-page="next" ${state.categoryList.page >= maxPage ? "disabled" : ""}>下一頁</button>
    </div>`;
  els.categoryPagination.querySelector("#category-page-size")?.addEventListener("change", (e) => {
    state.categoryList.pageSize = Number(e.target.value) || 20;
    state.categoryList.page = 1;
    renderCategories();
  });
  els.categoryPagination.querySelector("[data-page=prev]")?.addEventListener("click", () => {
    state.categoryList.page = Math.max(1, state.categoryList.page - 1);
    renderCategories();
  });
  els.categoryPagination.querySelector("[data-page=next]")?.addEventListener("click", () => {
    state.categoryList.page += 1;
    renderCategories();
  });
}

function renderCategories() {
  if (!els.categoryTableBody) return;
  const cols = visibleCategoryColumns();
  const { pagedRows, total, start } = processCategoryList();
  renderCategoryHead();
  els.categoryTableBody.innerHTML = pagedRows
    .map(
      (category) => `
    <tr data-id="${escapeAttr(category.id)}">
      ${cols.map((col) => renderCategoryCell(category, col.key)).join("")}
      <td class="col-actions">
        <button type="button" class="ghost-btn sm" data-action="edit">編輯</button>
        <button type="button" class="ghost-btn sm danger" data-action="delete">刪除</button>
      </td>
    </tr>`
    )
    .join("");
  els.categoryTable?.classList.toggle("hidden", total === 0);
  els.categoryTableEmpty?.classList.toggle("hidden", total !== 0);
  renderCategoryPagination(total, start, state.categoryList.pageSize);
  els.categoryTableBody.querySelectorAll("tr[data-id]").forEach((row) => {
    const id = row.dataset.id;
    row.querySelector("[data-action=edit]")?.addEventListener("click", () => openCategoryDialog(id));
    row.querySelector("[data-action=delete]")?.addEventListener("click", () => confirmDeleteCategory(id));
  });
}

function showLibraryTab(tab) {
  state.libraryTab = tab === "categories" ? "categories" : "decks";
  els.libraryDecks?.classList.toggle("hidden", state.libraryTab !== "decks");
  els.libraryCategories?.classList.toggle("hidden", state.libraryTab !== "categories");
  document.querySelectorAll("[data-library-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.libraryTab === state.libraryTab);
  });
}

function openCategoryDialog(id) {
  const category = id ? state.categories.find((item) => item.id === id) : null;
  state.editingCategoryId = category?.id || null;
  if (els.categoryDialogTitle) els.categoryDialogTitle.textContent = category ? "編輯分類" : "新增分類";
  if (els.categoryName) els.categoryName.value = category?.name || "";
  if (els.categoryId) els.categoryId.value = category?.id || "";
  if (els.categoryDescription) els.categoryDescription.value = category?.description || "";
  if (els.categorySort) els.categorySort.value = category?.sortOrder ?? 0;
  if (els.categoryActive) els.categoryActive.checked = category ? category.isActive !== false : true;
  els.categoryDialog?.showModal();
}

async function confirmDeleteCategory(id) {
  const category = state.categories.find((item) => item.id === id);
  const name = category?.name || id;
  if (!confirm(`確定刪除分類「${name}」？`)) return;
  try {
    await api(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" });
    await loadCategories();
    await loadDecks();
    setStatus("已刪除分類");
  } catch (err) {
    if (err.status === 409) {
      state.reassignCategoryId = id;
      if (els.reassignMessage) {
        els.reassignMessage.textContent = err.message || `仍有簡報使用「${name}」`;
      }
      fillCategorySelect(els.reassignTarget, "", { includeEmpty: true, excludeId: id });
      els.reassignDialog?.showModal();
      return;
    }
    setStatus(err.message);
  }
}

const GOOGLE_BRIDGE_ORIGIN = "https://aidc.work";

function showLoginError(message) {
  if (!els.loginError) return;
  els.loginError.textContent = message || "";
  els.loginError.classList.toggle("hidden", !message);
}

async function onGoogleCredential(response) {
  const credential = response?.credential;
  if (!credential) return;
  showLoginError("");
  if (els.googleBtn) els.googleBtn.disabled = true;
  try {
    const data = await api("/api/login/google", {
      method: "POST",
      body: JSON.stringify({
        credential,
        remember: Boolean(els.loginRemember?.checked),
      }),
    });
    await enterApp(data.email, data);
  } catch (err) {
    showLoginError(err.message || "Google 登入失敗");
  } finally {
    if (els.googleBtn) els.googleBtn.disabled = false;
  }
}

function googleBridgeUrl(clientId) {
  const bridge = new URL("/myppt-auth", GOOGLE_BRIDGE_ORIGIN);
  bridge.searchParams.set("target", location.origin);
  bridge.searchParams.set("client", clientId);
  return bridge.toString();
}

function openGoogleLogin(clientId) {
  const bridgeUrl = googleBridgeUrl(clientId);
  const popup = window.open(bridgeUrl, "mypptGoogle", "popup=yes,width=480,height=680");
  if (!popup) {
    location.href = bridgeUrl;
    return;
  }
  const onMessage = (event) => {
    if (event.origin !== GOOGLE_BRIDGE_ORIGIN) return;
    if (event.data?.type === "myppt-google-ready") {
      popup.postMessage({ type: "myppt-google-config", clientId }, GOOGLE_BRIDGE_ORIGIN);
      return;
    }
    if (event.data?.type === "myppt-google-error") {
      window.removeEventListener("message", onMessage);
      showLoginError(event.data.message || "Google 登入失敗");
      return;
    }
    if (event.data?.type !== "myppt-google-credential" || !event.data.credential) return;
    window.removeEventListener("message", onMessage);
    onGoogleCredential({ credential: event.data.credential });
  };
  window.addEventListener("message", onMessage);
}

async function setupGoogleLogin() {
  try {
    const config = await fetch("/api/auth/config", { headers: { Accept: "application/json" } }).then((res) => res.json());
    if (!config.ready || !config.googleClientId) {
      els.loginSetup?.classList.remove("hidden");
      els.loginRemember?.closest(".remember")?.classList.add("hidden");
      els.googleBtn?.classList.add("hidden");
      return;
    }
    els.loginRemember?.closest(".remember")?.classList.remove("hidden");
    els.googleBtn?.classList.remove("hidden");
    els.googleBtn?.addEventListener("click", () => openGoogleLogin(config.googleClientId));
  } catch (err) {
    showLoginError(err.message || "無法載入 Google 登入");
  }
}

document.querySelectorAll("[data-library-tab]").forEach((btn) => {
  btn.addEventListener("click", () => showLibraryTab(btn.dataset.libraryTab));
});

let categorySearchTimer = null;
els.categorySearch?.addEventListener("input", () => {
  state.categoryList.search = els.categorySearch.value;
  clearTimeout(categorySearchTimer);
  categorySearchTimer = setTimeout(() => {
    state.categoryList.debouncedSearch = state.categoryList.search;
    state.categoryList.page = 1;
    renderCategories();
  }, 350);
});
els.categoryStatusFilter?.addEventListener("change", () => {
  state.categoryList.statusFilter = els.categoryStatusFilter.value;
  state.categoryList.page = 1;
  renderCategories();
});
els.btnReloadCategories?.addEventListener("click", () => {
  loadCategories().catch((err) => setStatus(err.message));
});
els.btnAddCategory?.addEventListener("click", () => openCategoryDialog(null));
els.btnCategoryCancel?.addEventListener("click", () => els.categoryDialog?.close());
els.categoryForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: els.categoryName.value.trim(),
    id: els.categoryId.value.trim().toLowerCase(),
    description: els.categoryDescription.value.trim(),
    sortOrder: els.categorySort.value,
    isActive: els.categoryActive.checked,
  };
  try {
    if (state.editingCategoryId) {
      await api(`/api/categories/${encodeURIComponent(state.editingCategoryId)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await api("/api/categories", { method: "POST", body: JSON.stringify(payload) });
    }
    els.categoryDialog?.close();
    state.editingCategoryId = null;
    await loadCategories();
    await loadDecks();
    setStatus("分類已儲存");
  } catch (err) {
    setStatus(err.message);
  }
});
els.btnReassignCancel?.addEventListener("click", () => {
  state.reassignCategoryId = null;
  els.reassignDialog?.close();
});
els.reassignForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = state.reassignCategoryId;
  if (!id) return;
  try {
    await api(`/api/categories/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify({ reassignTo: els.reassignTarget.value }),
    });
    els.reassignDialog?.close();
    state.reassignCategoryId = null;
    await loadCategories();
    await loadDecks();
    setStatus("已改派並刪除分類");
  } catch (err) {
    setStatus(err.message);
  }
});

function consumeGoogleHash() {
  const prefix = "#myppt_google=";
  if (!location.hash.startsWith(prefix)) return "";
  const credential = decodeURIComponent(location.hash.slice(prefix.length));
  history.replaceState(null, "", location.pathname + location.search);
  return credential;
}

(async function boot() {
  const pendingCredential = consumeGoogleHash();
  if (pendingCredential) {
    await onGoogleCredential({ credential: pendingCredential });
    return;
  }
  try {
    const session = await api("/api/session");
    await enterApp(session.email, session);
    return;
  } catch {
    /* stay on login */
  }
  await setupGoogleLogin();
})();
