/**
 * Deck narration player — audio now, avatar/video later via MediaRenderer.
 */
(function () {
  const panel = document.getElementById("narration-panel");
  if (!panel) return;

  const deckId =
    document.documentElement.getAttribute("data-deck-id") ||
    panel.getAttribute("data-deck-id") ||
    "enterprise-ai-portal-deck";
  const MANIFEST_URL = `narration/${deckId}.json`;

  const els = {
    script: document.getElementById("narration-script"),
    status: document.getElementById("narration-status"),
    btnToggle: document.getElementById("btn-narration"),
    btnPlay: document.getElementById("narration-play"),
    btnStop: document.getElementById("narration-stop"),
    btnPrevSeg: document.getElementById("narration-prev-seg"),
    btnNextSeg: document.getElementById("narration-next-seg"),
    btnMinimize: document.getElementById("narration-minimize"),
    btnClose: document.getElementById("narration-close"),
    autoAdvance: document.getElementById("narration-auto-advance"),
    autoPlayNext: document.getElementById("narration-auto-play-next"),
    volume: document.getElementById("narration-volume"),
    rate: document.getElementById("narration-rate"),
    rateValue: document.getElementById("narration-rate-value"),
    avatarSlot: document.getElementById("narration-avatar"),
    progressBar: document.getElementById("narration-progress-bar"),
  };

  let manifest = null;
  let slideIndex = 0;
  let pendingSlideIndex = null;
  let manifestReady = false;
  let autoAdvanceEnabled = true;
  let autoPlayNextEnabled = true;
  let pendingAutoPlay = false;
  let mediaRenderer = null;
  let lastMediaError = "";

  function resolveMediaUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url) || url.startsWith("/")) return url;
    if (url.startsWith("narration/")) return url;
    return `narration/${url.replace(/^\.\//, "")}`;
  }

  function waitForMedia(el, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      if (!el || !el.src) {
        reject(new Error("NO_SRC"));
        return;
      }
      if (el.readyState >= 3) {
        resolve(el);
        return;
      }
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("MEDIA_TIMEOUT"));
      }, timeoutMs);
      function onReady() {
        cleanup();
        resolve(el);
      }
      function onErr() {
        cleanup();
        reject(new Error("MEDIA_ERROR"));
      }
      function cleanup() {
        clearTimeout(timer);
        el.removeEventListener("canplaythrough", onReady);
        el.removeEventListener("loadeddata", onReady);
        el.removeEventListener("error", onErr);
      }
      el.addEventListener("canplaythrough", onReady, { once: true });
      el.addEventListener("loadeddata", onReady, { once: true });
      el.addEventListener("error", onErr, { once: true });
      el.load();
    });
  }

  function describePlayError(err, el) {
    const name = err?.name || "";
    if (name === "NotAllowedError") {
      return "播放被瀏覽器阻擋，請再按一次播放";
    }
    if (lastMediaError || err?.message === "MEDIA_ERROR" || err?.message === "NO_SRC") {
      const src = el?.currentSrc || el?.src || "";
      return `找不到或無法解碼音訊（${src || "無 src"}）`;
    }
    if (err?.message === "MEDIA_TIMEOUT") {
      return "音訊載入逾時，請檢查檔案是否存在";
    }
    return `播放失敗：${err?.message || name || "未知錯誤"}`;
  }

  class MediaRenderer {
    constructor(container) {
      this.container = container;
      this.mode = "audio";
      this.audio = document.createElement("audio");
      this.audio.preload = "auto";
      this.audio.setAttribute("aria-hidden", "true");
      this.audio.style.display = "none";
      this.video = document.createElement("video");
      this.video.playsInline = true;
      this.video.className = "narration-avatar-video hidden";
      this.container.appendChild(this.audio);
      this.container.appendChild(this.video);
      this._wire(this.audio);
      this._wire(this.video);
    }

    _wire(el) {
      el.addEventListener("timeupdate", () => this._onTimeUpdate?.(el));
      el.addEventListener("ended", () => this._onEnded?.());
      el.addEventListener("error", () => {
        lastMediaError = el.error?.message || "MEDIA_ERROR";
        this._onError?.(el);
      });
    }

    setCallbacks({ onTimeUpdate, onEnded, onError }) {
      this._onTimeUpdate = onTimeUpdate;
      this._onEnded = onEnded;
      this._onError = onError;
    }

    stop() {
      [this.audio, this.video].forEach((el) => {
        el.pause();
        el.removeAttribute("src");
        el.load();
      });
      this.video.classList.add("hidden");
      lastMediaError = "";
    }

    async loadSlide(slide) {
      this.stop();
      if (slide.avatarVideoUrl) {
        this.mode = "video";
        this.video.src = resolveMediaUrl(slide.avatarVideoUrl);
        this.video.classList.remove("hidden");
        await waitForMedia(this.video).catch(() => null);
        return this.video;
      }
      if (slide.audioUrl) {
        this.mode = "audio";
        this.audio.src = resolveMediaUrl(slide.audioUrl);
        await waitForMedia(this.audio).catch(() => null);
        return this.audio;
      }
      return null;
    }

    activeElement() {
      return this.mode === "video" ? this.video : this.audio;
    }

    async play() {
      const el = this.activeElement();
      if (!el?.src) throw new Error("NO_SRC");
      await waitForMedia(el);
      return el.play();
    }

    pause() {
      this.activeElement()?.pause?.();
    }

    setVolume(v) {
      this.audio.volume = v;
      this.video.volume = v;
    }

    setRate(r) {
      this.audio.playbackRate = r;
      this.video.playbackRate = r;
    }
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text;
  }

  function setProgress(ratio) {
    if (els.progressBar) {
      els.progressBar.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
    }
  }

  function updateRateLabel() {
    if (!els.rate || !els.rateValue) return;
    const v = Number(els.rate.value || 1);
    els.rateValue.textContent = `${v.toFixed(2)}×`;
  }

  function getSlideRecord(index) {
    return manifest?.slides?.[index] || null;
  }

  function updateScriptUI(index) {
    const slide = getSlideRecord(index);
    if (!slide) {
      if (els.script) els.script.textContent = manifestReady ? "（無講稿資料）" : "載入講稿…";
      setStatus(manifestReady ? "未載入 manifest" : "載入 manifest…");
      return;
    }
    if (els.script) {
      els.script.textContent = slide.script || "（此頁尚無講稿）";
    }
    const bits = [slide.title, slide.status];
    if (slide.estimatedSeconds) bits.push(`~${slide.estimatedSeconds}s`);
    if (slide.audioUrl) bits.push("有音訊");
    if (slide.avatarVideoUrl) bits.push("有數字人影片");
    setStatus(bits.join(" · "));
    setProgress(0);
  }

  function updatePlayButton(isPlaying) {
    if (els.btnPlay) {
      els.btnPlay.textContent = isPlaying ? "⏸" : "▶";
      els.btnPlay.title = isPlaying ? "暫停 (R)" : "播放 / 暫停 (R)";
    }
  }

  async function playCurrent() {
    if (!manifestReady || !mediaRenderer) return false;
    const slide = getSlideRecord(slideIndex);
    if (!slide?.audioUrl && !slide?.avatarVideoUrl) {
      setStatus("此頁無音訊/影片，僅顯示講稿");
      return false;
    }
    const el = mediaRenderer.activeElement();
    if (!el?.src) {
      await mediaRenderer.loadSlide(slide);
    }
    const active = mediaRenderer.activeElement();
    if (!active) {
      setStatus("無法載入媒體");
      return false;
    }
    try {
      lastMediaError = "";
      await mediaRenderer.play();
      updatePlayButton(true);
      setStatus("播放中…");
      return true;
    } catch (err) {
      updatePlayButton(false);
      setStatus(describePlayError(err, active));
      return false;
    }
  }

  async function onSlideChange(index) {
    slideIndex = index;
    if (!manifestReady || !mediaRenderer) {
      pendingSlideIndex = index;
      updateScriptUI(index);
      return;
    }
    mediaRenderer.stop();
    updatePlayButton(false);
    updateScriptUI(index);
    const slide = getSlideRecord(index);
    if (slide) await mediaRenderer.loadSlide(slide);
    if (els.rate) mediaRenderer.setRate(Number(els.rate.value || 1));
    if (els.volume) mediaRenderer.setVolume(Number(els.volume.value || 1));

    if (pendingAutoPlay) {
      pendingAutoPlay = false;
      await playCurrent();
    }
  }

  async function loadManifest() {
    try {
      const res = await fetch(MANIFEST_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      manifest = await res.json();
      mediaRenderer = new MediaRenderer(els.avatarSlot || panel);
      mediaRenderer.setCallbacks({
        onTimeUpdate: (el) => {
          if (el.duration) setProgress(el.currentTime / el.duration);
        },
        onEnded: () => {
          setProgress(1);
          updatePlayButton(false);
          if (autoAdvanceEnabled && slideIndex < manifest.slides.length - 1) {
            if (autoPlayNextEnabled) pendingAutoPlay = true;
            document.dispatchEvent(new CustomEvent("deck:request-next"));
          } else {
            setStatus("本頁播放結束");
          }
        },
        onError: () => {
          const slide = getSlideRecord(slideIndex);
          setStatus(`音訊無法播放：${resolveMediaUrl(slide?.audioUrl || "")}`);
        },
      });
      manifestReady = true;
      const idx = pendingSlideIndex ?? slideIndex;
      pendingSlideIndex = null;
      if (els.volume) mediaRenderer.setVolume(Number(els.volume.value || 1));
      if (els.rate) mediaRenderer.setRate(Number(els.rate.value || 1));
      updateRateLabel();
      await onSlideChange(idx);
      setStatus(`已載入 ${manifest.slides.length} 頁講稿`);
    } catch (err) {
      if (els.script) {
        els.script.textContent =
          "無法載入講稿 manifest。請以 npm run dev 開啟 http://localhost:8787/enterprise-ai-portal-deck.html。";
      }
      setStatus(`manifest 載入失敗: ${err.message}`);
    }
  }

  async function togglePlay() {
    if (!manifestReady || !mediaRenderer) return;
    const slide = getSlideRecord(slideIndex);
    if (!slide?.audioUrl && !slide?.avatarVideoUrl) {
      setStatus("此頁無音訊/影片，僅顯示講稿");
      return;
    }
    const el = mediaRenderer.activeElement();
    if (!el?.src) {
      await mediaRenderer.loadSlide(slide);
    }
    const active = mediaRenderer.activeElement();
    if (!active) {
      setStatus("無法載入媒體");
      return;
    }
    if (active.paused) {
      await playCurrent();
    } else {
      mediaRenderer.pause();
      updatePlayButton(false);
      setStatus("已暫停");
    }
  }

  function setMinimized(min) {
    panel.classList.toggle("minimized", min);
    if (els.btnMinimize) {
      els.btnMinimize.textContent = min ? "▢" : "－";
      els.btnMinimize.title = min ? "展開講稿面板" : "最小化（縮小面板）";
      els.btnMinimize.setAttribute("aria-label", min ? "展開" : "最小化");
    }
  }

  function toggleMinimize() {
    if (!panel.classList.contains("open")) {
      togglePanel(true);
      setMinimized(false);
      return;
    }
    setMinimized(!panel.classList.contains("minimized"));
  }

  function togglePanel(force) {
    const open = force != null ? force : !panel.classList.contains("open");
    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    if (els.btnToggle) els.btnToggle.setAttribute("aria-pressed", open ? "true" : "false");
    if (!open) setMinimized(false);
  }

  els.btnToggle?.addEventListener("click", () => {
    if (panel.classList.contains("open") && panel.classList.contains("minimized")) {
      setMinimized(false);
      return;
    }
    togglePanel();
  });
  els.btnMinimize?.addEventListener("click", () => toggleMinimize());
  els.btnClose?.addEventListener("click", () => togglePanel(false));
  els.btnPlay?.addEventListener("click", () => togglePlay());
  els.btnStop?.addEventListener("click", () => {
    pendingAutoPlay = false;
    mediaRenderer?.stop();
    updatePlayButton(false);
    setProgress(0);
    setStatus("已停止");
  });
  els.btnPrevSeg?.addEventListener("click", () => {
    pendingAutoPlay = false;
    document.dispatchEvent(new CustomEvent("deck:request-prev"));
  });
  els.btnNextSeg?.addEventListener("click", () => {
    pendingAutoPlay = false;
    document.dispatchEvent(new CustomEvent("deck:request-next"));
  });
  els.autoAdvance?.addEventListener("change", (e) => {
    autoAdvanceEnabled = e.target.checked;
  });
  els.autoPlayNext?.addEventListener("change", (e) => {
    autoPlayNextEnabled = e.target.checked;
  });
  els.volume?.addEventListener("input", (e) => {
    mediaRenderer?.setVolume(Number(e.target.value));
  });
  els.rate?.addEventListener("input", (e) => {
    mediaRenderer?.setRate(Number(e.target.value));
    updateRateLabel();
  });

  document.addEventListener("deck:slidechange", (e) => {
    onSlideChange(e.detail.index);
  });

  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      togglePanel();
    } else if (e.key === "m" || e.key === "M") {
      if (panel.classList.contains("open")) {
        e.preventDefault();
        toggleMinimize();
      }
    } else if (e.key === "r" || e.key === "R") {
      if (panel.classList.contains("open")) {
        e.preventDefault();
        togglePlay();
      }
    }
  });

  autoAdvanceEnabled = els.autoAdvance?.checked ?? true;
  autoPlayNextEnabled = els.autoPlayNext?.checked ?? true;
  updateRateLabel();
  slideIndex = window.deckController?.getIndex?.() ?? 0;
  loadManifest();
})();
