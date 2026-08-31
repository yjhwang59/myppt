const DECK_ID = "enterprise-ai-portal-deck";
const API = "";

const state = {
  slides: [],
  currentId: null,
  voices: [],
};

const els = {
  secret: document.getElementById("admin-secret"),
  connect: document.getElementById("btn-connect"),
  reload: document.getElementById("btn-reload"),
  rebuild: document.getElementById("btn-rebuild"),
  list: document.getElementById("slide-list"),
  form: document.getElementById("slide-form"),
  cardsEditor: document.getElementById("cards-editor"),
  addCard: document.getElementById("btn-add-card"),
  script: document.getElementById("script"),
  save: document.getElementById("btn-save"),
  saveScript: document.getElementById("btn-save-script"),
  regenScript: document.getElementById("btn-regen-script"),
  synth: document.getElementById("btn-synth"),
  gender: document.getElementById("voice-gender"),
  voiceId: document.getElementById("voice-id"),
  preview: document.getElementById("preview"),
  status: document.getElementById("status"),
  editorTitle: document.getElementById("editor-title"),
};

function token() {
  return localStorage.getItem("adminSecret") || els.secret.value.trim();
}

function setStatus(msg) {
  els.status.textContent = msg;
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token()}`,
    ...(options.headers || {}),
  };
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function fillVoiceOptions(gender, selected) {
  els.voiceId.innerHTML = "";
  const pool = state.voices.filter((v) =>
    gender === "male" ? v.id === "onyx" || v.id === "echo" : v.id === "nova" || v.id === "shimmer"
  );
  for (const v of pool) {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.label;
    if (v.id === selected) opt.selected = true;
    els.voiceId.appendChild(opt);
  }
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
    });
  });
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function currentSlide() {
  return state.slides.find((s) => s.slideId === state.currentId);
}

function renderList() {
  els.list.innerHTML = "";
  state.slides.forEach((slide) => {
    const li = document.createElement("li");
    li.className = slide.slideId === state.currentId ? "active" : "";
    li.innerHTML = `<strong>${slide.index}. ${slide.title}</strong><div class="meta">${slide.status || "-"} · ${slide.audioUrl ? "有音訊" : "無音訊"}</div>`;
    li.addEventListener("click", () => selectSlide(slide.slideId));
    els.list.appendChild(li);
  });
}

function selectSlide(slideId) {
  state.currentId = slideId;
  const slide = currentSlide();
  if (!slide) return;
  renderList();
  els.editorTitle.textContent = `${slide.slideId} · ${slide.title}`;
  els.form.title.value = slide.title || "";
  els.form.eyebrow.value = slide.eyebrow || "";
  els.form.kicker.value = slide.kicker || "";
  els.form.h1.value = slide.h1 || "";
  els.form.h2.value = slide.h2 || "";
  els.form.lead.value = slide.lead || "";
  els.form.stamp.value = slide.stamp || "";
  els.form.callout.value = (slide.callouts && slide.callouts[0]) || "";
  els.script.value = slide.script || "";
  renderCards(slide.cards || []);
  const voiceId = slide.voice?.voiceId || "nova";
  const gender = voiceId === "onyx" || voiceId === "echo" ? "male" : "female";
  els.gender.value = gender;
  fillVoiceOptions(gender, voiceId);
  refreshPreview();
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

function refreshPreview() {
  if (!state.currentId) return;
  els.preview.src = `/enterprise-ai-portal-deck.html#${state.currentId}?t=${Date.now()}`;
}

async function loadSlides() {
  const data = await api(`/api/decks/${DECK_ID}/slides`);
  state.slides = data.slides;
  if (!state.currentId && state.slides.length) selectSlide(state.slides[0].slideId);
  else renderList();
  setStatus(`已載入 ${state.slides.length} 頁`);
}

els.connect.addEventListener("click", async () => {
  localStorage.setItem("adminSecret", els.secret.value.trim());
  try {
    const voices = await api("/api/voices");
    state.voices = voices.voices;
    await loadSlides();
  } catch (err) {
    setStatus(`連線失敗：${err.message}`);
  }
});

els.reload.addEventListener("click", () => loadSlides().catch((e) => setStatus(e.message)));
els.rebuild.addEventListener("click", async () => {
  try {
    await api(`/api/decks/${DECK_ID}/rebuild`, { method: "POST" });
    refreshPreview();
    setStatus("HTML 已 rebuild");
  } catch (err) {
    setStatus(err.message);
  }
});

els.save.addEventListener("click", async () => {
  if (!state.currentId) return;
  try {
    const payload = collectPayload();
    await api(`/api/decks/${DECK_ID}/slides/${state.currentId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await loadSlides();
    selectSlide(state.currentId);
    setStatus("內容已儲存並 rebuild");
  } catch (err) {
    setStatus(err.message);
  }
});

els.saveScript.addEventListener("click", async () => {
  if (!state.currentId) return;
  try {
    await api(`/api/decks/${DECK_ID}/slides/${state.currentId}/script`, {
      method: "PUT",
      body: JSON.stringify({ script: els.script.value }),
    });
    await loadSlides();
    selectSlide(state.currentId);
    setStatus("講稿已儲存");
  } catch (err) {
    setStatus(err.message);
  }
});

els.regenScript.addEventListener("click", async () => {
  if (!state.currentId) return;
  setStatus("重生講稿中…");
  try {
    const data = await api(`/api/decks/${DECK_ID}/slides/${state.currentId}/regenerate-script`, { method: "POST" });
    els.script.value = data.slide.script || "";
    await loadSlides();
    selectSlide(state.currentId);
    setStatus("講稿已重生");
  } catch (err) {
    setStatus(err.message);
  }
});

els.synth.addEventListener("click", async () => {
  if (!state.currentId) return;
  setStatus("TTS 合成中…");
  try {
    await api(`/api/decks/${DECK_ID}/slides/${state.currentId}/synthesize`, {
      method: "POST",
      body: JSON.stringify({ gender: els.gender.value, voiceId: els.voiceId.value }),
    });
    await loadSlides();
    selectSlide(state.currentId);
    setStatus("語音已更新");
  } catch (err) {
    setStatus(err.message);
  }
});

els.gender.addEventListener("change", () => fillVoiceOptions(els.gender.value, null));
els.addCard.addEventListener("click", () => {
  const slide = currentSlide();
  slide.cards = slide.cards || [];
  slide.cards.push({ heading: "", paragraph: "", bullets: [] });
  renderCards(slide.cards);
});

const saved = localStorage.getItem("adminSecret");
if (saved) {
  els.secret.value = saved;
  els.connect.click();
}
