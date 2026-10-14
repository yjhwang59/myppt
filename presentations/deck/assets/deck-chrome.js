(function () {
  const slides = Array.from(document.querySelectorAll("#deck .slide"));
  const pager = document.getElementById("pager");
  const progress = document.getElementById("progress");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnToc = document.getElementById("btn-toc");
  const btnPresent = document.getElementById("btn-present");
  const btnHeaderToggle = document.getElementById("btn-header-toggle");
  const slideCounter = document.getElementById("slide-counter");
  const total = slides.length;
  let activeIndex = 0;
  let presenting = false;
  const pagerLinks = [];

  slides.forEach((slide, i) => {
    const n = String(i + 1).padStart(2, "0");
    const title = slide.dataset.title || slide.querySelector("h2")?.textContent?.slice(0, 8) || n;
    const a = document.createElement("a");
    a.href = "#" + slide.id;
    a.textContent = n + " " + title;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      goToSlide(i);
    });
    pager.appendChild(a);
    pagerLinks.push(a);

    if (!slide.querySelector(".slide-dachan-logo")) {
      const logo = document.createElement("img");
      logo.src = "/deck/assets/dachan-logo.png";
      logo.alt = "大成";
      logo.className = "slide-dachan-logo";
      logo.width = 91;
      logo.height = 91;
      logo.loading = "lazy";
      slide.appendChild(logo);
    }
  });

  function currentIndex() {
    if (presenting) return activeIndex;
    let idx = 0;
    slides.forEach((s, i) => {
      if (s.getBoundingClientRect().top <= 140) idx = i;
    });
    return idx;
  }

  function syncUi(index) {
    activeIndex = index;
    slideCounter.textContent = (index + 1) + " / " + total;
    progress.style.width = ((index + 1) / total * 100).toFixed(1) + "%";
    btnPrev.disabled = index <= 0;
    btnNext.disabled = index >= total - 1;
    pagerLinks.forEach((link, i) => link.classList.toggle("is-active", i === index));
    slides.forEach((slide, i) => slide.classList.toggle("is-active", i === index));
  }

  function scrollToSlide(index) {
    const el = slides[index];
    if (!el) return;
    if (presenting) {
      syncUi(index);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goToSlide(index) {
    const next = Math.max(0, Math.min(total - 1, index));
    scrollToSlide(next);
    syncUi(next);
  }

  function updateProgress() {
    if (presenting) return;
    syncUi(currentIndex());
  }

  const PRESENT_DESIGN_W = 1600;
  const PRESENT_DESIGN_H = 900;

  function updatePresentScale() {
    if (!presenting) return;
    const headerPx =
      parseFloat(getComputedStyle(document.body).getPropertyValue("--deck-header-offset")) || 128;
    const availW = window.innerWidth;
    const availH = Math.max(1, window.innerHeight - headerPx);
    const scale = Math.min(availW / PRESENT_DESIGN_W, availH / PRESENT_DESIGN_H);
    document.body.style.setProperty("--present-scale", String(Math.max(0.05, scale)));
  }

  function setPresenting(on) {
    presenting = on;
    document.body.classList.toggle("deck-presenting", on);
    document.documentElement.classList.toggle("deck-presenting", on);
    btnPresent.classList.toggle("active", on);
    btnPresent.setAttribute("aria-pressed", on ? "true" : "false");
    btnPresent.textContent = on ? "退出整頁" : "整頁顯示";
    syncUi(activeIndex);
    if (on) {
      updatePresentScale();
      const root = document.documentElement;
      if (root.requestFullscreen) {
        root.requestFullscreen().then(updatePresentScale).catch(() => {});
      }
      requestAnimationFrame(updatePresentScale);
    } else {
      document.body.style.removeProperty("--present-scale");
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  const TYPE_SCALE_KEY = "fyh-deck-type-scale";
  const TYPE_SCALE_DEFAULT = 1.15;
  const TYPE_SCALE_MIN = 0.9;
  const TYPE_SCALE_MAX = 1.5;
  const TYPE_SCALE_STEP = 0.08;

  const navGroup = btnPresent?.closest(".nav-group");
  let btnTypeMinus = document.getElementById("btn-type-minus");
  let btnTypePlus = document.getElementById("btn-type-plus");
  let typeScaleLabel = document.getElementById("type-scale-label");

  if (navGroup && (!btnTypeMinus || !btnTypePlus)) {
    const wrap = document.createElement("div");
    wrap.className = "type-scale-group";
    wrap.setAttribute("aria-label", "文字字級（不縮放投影片）");
    btnTypeMinus = document.createElement("button");
    btnTypeMinus.type = "button";
    btnTypeMinus.className = "button";
    btnTypeMinus.id = "btn-type-minus";
    btnTypeMinus.title = "縮小字級（不縮放投影片）";
    btnTypeMinus.setAttribute("aria-label", "縮小字級");
    btnTypeMinus.textContent = "A−";
    typeScaleLabel = document.createElement("span");
    typeScaleLabel.className = "type-scale-label";
    typeScaleLabel.id = "type-scale-label";
    typeScaleLabel.setAttribute("aria-live", "polite");
    btnTypePlus = document.createElement("button");
    btnTypePlus.type = "button";
    btnTypePlus.className = "button";
    btnTypePlus.id = "btn-type-plus";
    btnTypePlus.title = "放大字級（不縮放投影片）";
    btnTypePlus.setAttribute("aria-label", "放大字級");
    btnTypePlus.textContent = "A＋";
    wrap.append(btnTypeMinus, typeScaleLabel, btnTypePlus);
    navGroup.insertBefore(wrap, btnPresent);
  }

  function readStoredTypeScale() {
    const raw = localStorage.getItem(TYPE_SCALE_KEY);
    const n = raw != null ? parseFloat(raw) : TYPE_SCALE_DEFAULT;
    if (Number.isFinite(n)) return n;
    return TYPE_SCALE_DEFAULT;
  }

  function applyTypeScale(scale) {
    /* Font size only — do not touch --present-scale, zoom, or .slide dimensions */
    const s =
      Math.round(Math.min(TYPE_SCALE_MAX, Math.max(TYPE_SCALE_MIN, scale)) * 100) / 100;
    document.documentElement.style.setProperty("--deck-type-scale", String(s));
    try {
      localStorage.setItem(TYPE_SCALE_KEY, String(s));
    } catch (_) {
      /* ignore quota / private mode */
    }
    if (typeScaleLabel) typeScaleLabel.textContent = Math.round(s * 100) + "%";
    if (btnTypeMinus) btnTypeMinus.disabled = s <= TYPE_SCALE_MIN + 0.001;
    if (btnTypePlus) btnTypePlus.disabled = s >= TYPE_SCALE_MAX - 0.001;
  }

  applyTypeScale(readStoredTypeScale());
  btnTypeMinus?.addEventListener("click", () => {
    applyTypeScale(readStoredTypeScale() - TYPE_SCALE_STEP);
  });
  btnTypePlus?.addEventListener("click", () => {
    applyTypeScale(readStoredTypeScale() + TYPE_SCALE_STEP);
  });

  btnPrev.addEventListener("click", () => goToSlide(activeIndex - 1));
  btnNext.addEventListener("click", () => goToSlide(activeIndex + 1));
  btnToc.addEventListener("click", () => {
    const hidden = pager.style.display === "none";
    pager.style.display = hidden ? "" : "none";
    btnToc.setAttribute("aria-expanded", hidden ? "true" : "false");
    btnToc.classList.toggle("active", hidden);
  });
  btnPresent.addEventListener("click", () => setPresenting(!presenting));

  btnHeaderToggle.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("header-collapsed");
    btnHeaderToggle.textContent = collapsed ? "展開導覽" : "收合導覽";
    btnHeaderToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btnHeaderToggle.classList.toggle("active", collapsed);
    requestAnimationFrame(updatePresentScale);
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && presenting) {
      setPresenting(false);
      return;
    }
    requestAnimationFrame(updatePresentScale);
  });

  window.addEventListener("resize", updatePresentScale, { passive: true });

  function slideIndexById(id) {
    const clean = String(id || "").replace(/^#/, "").split("?")[0];
    return slides.findIndex((s) => s.id === clean);
  }

  function showBySlideId(slideId) {
    const idx = slideIndexById(slideId);
    if (idx >= 0) goToSlide(idx);
  }

  function parseInitialSlide() {
    const hash = (location.hash || "").replace(/^#/, "").split("?")[0];
    const idx = slideIndexById(hash);
    return idx >= 0 ? idx : 0;
  }

  const embedMode = (() => {
    try {
      const q = new URLSearchParams(location.search);
      return q.get("embed") === "1" || q.get("preview") === "1";
    } catch {
      return false;
    }
  })();

  if (embedMode) {
    presenting = true;
    document.body.classList.add("deck-presenting", "header-collapsed");
    document.documentElement.classList.add("deck-presenting");
    updatePresentScale();
  }

  window.deckController = {
    show: goToSlide,
    goTo: goToSlide,
    showBySlideId,
    getIndex: () => activeIndex,
  };

  window.addEventListener("hashchange", () => {
    const hash = (location.hash || "").replace(/^#/, "").split("?")[0];
    if (hash) showBySlideId(hash);
  });

  window.addEventListener("scroll", updateProgress, { passive: true });
  goToSlide(parseInitialSlide());

  document.querySelectorAll(".shot img").forEach((img) => {
    img.addEventListener("error", () => img.closest(".shot")?.classList.add("missing"));
    if (!img.complete || img.naturalWidth === 0) {
      if (img.complete) img.closest(".shot")?.classList.add("missing");
    } else img.addEventListener("load", () => img.closest(".shot")?.classList.remove("missing"));
  });

  window.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const i = currentIndex();
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      goToSlide(i + 1);
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      goToSlide(i - 1);
      e.preventDefault();
    } else if (e.key === "Home") {
      goToSlide(0);
      e.preventDefault();
    } else if (e.key === "End") {
      goToSlide(total - 1);
      e.preventDefault();
    } else if (e.key === "Escape" && presenting) {
      setPresenting(false);
      e.preventDefault();
    } else if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setPresenting(!presenting);
      e.preventDefault();
    } else if ((e.key === "-" || e.key === "_") && (e.ctrlKey || e.metaKey) && !e.altKey) {
      applyTypeScale(readStoredTypeScale() - TYPE_SCALE_STEP);
      e.preventDefault();
    } else if ((e.key === "=" || e.key === "+") && (e.ctrlKey || e.metaKey) && !e.altKey) {
      applyTypeScale(readStoredTypeScale() + TYPE_SCALE_STEP);
      e.preventDefault();
    } else if (e.key === "0" && (e.ctrlKey || e.metaKey) && !e.altKey) {
      applyTypeScale(TYPE_SCALE_DEFAULT);
      e.preventDefault();
    }
  });
})();
