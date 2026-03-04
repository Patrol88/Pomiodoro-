import { createPipRenderer, getPiPCanvas } from "./modules/pipRenderer.js";
import { setupPWAInstallUI, registerServiceWorker } from "./modules/pwa.js";

(() => {
  const STORAGE_KEY = "pomidor_pro_v2_2";
  const INSTALL_HIDDEN_KEY = "pomidor_pro_install_hidden";
  const todayKey = () => {
    const d = new Date();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  };

  const defaults = {
    mode: "pomodoro",
    accent: "#ff4d4d",
    workMin: 25,
    shortMin: 5,
    longMin: 15,
    longEvery: 4,
    countdownMin: 25,
    countupTargetMin: 0,
    volume: 60,
    autoStart: true,
    notify: false,
    pipView: "ring",
    pipDigitsColor: "#ffffff",
    stats: {}
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaults);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(defaults), ...parsed, stats: { ...(parsed.stats || {}) } };
    } catch {
      return structuredClone(defaults);
    }
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }
  let cfg = load();

  const el = {
    root: document.getElementById("root"),
    chipMode: document.getElementById("chipMode"),
    chipPlan: document.getElementById("chipPlan"),

    canvas: document.getElementById("dial"),
    phaseLabel: document.getElementById("phaseLabel"),
    time: document.getElementById("time"),
    metaLeft: document.getElementById("metaLeft"),
    sessionsToday: document.getElementById("sessionsToday"),

    btnStartPause: document.getElementById("btnStartPause"),
    btnStartPauseTxt: document.getElementById("btnStartPauseTxt"),
    btnReset: document.getElementById("btnReset"),
    btnSkip: document.getElementById("btnSkip"),
    btnFocus: document.getElementById("btnFocus"),
    btnPiP: document.getElementById("btnPiP"),

    mode: document.getElementById("mode"),
    accent: document.getElementById("accent"),
    workMin: document.getElementById("workMin"),
    shortMin: document.getElementById("shortMin"),
    longMin: document.getElementById("longMin"),
    longEvery: document.getElementById("longEvery"),
    countdownMin: document.getElementById("countdownMin"),
    countupTargetMin: document.getElementById("countupTargetMin"),
    volume: document.getElementById("volume"),
    volVal: document.getElementById("volVal"),
    autoStart: document.getElementById("autoStart"),
    notify: document.getElementById("notify"),

    pipView: document.getElementById("pipView"),
    pipDigitsColor: document.getElementById("pipDigitsColor"),

    statSessions: document.getElementById("statSessions"),
    statMinutes: document.getElementById("statMinutes"),

    pipVideo: document.getElementById("pipVideo"),
    pipCanvas: document.getElementById("pipCanvas"),

    installBox: document.getElementById("installBox"),
    btnInstall: document.getElementById("btnInstall"),
    iosInstallHint: document.getElementById("iosInstallHint"),
  };

  const state = {
    running: false,
    lastNow: 0,

    duration: 25*60,
    remaining: 25*60,

    elapsed: 0,
    target: 0,

    phaseType: "work",
    phaseName: "WORK",

    lastShownSec: null,
    spaceDown: false,

    deferredInstallPrompt: null,
    installUiLockedHidden: false
  };

  function ensureTodayStats() {
    const k = todayKey();
    if (!cfg.stats[k]) cfg.stats[k] = { sessions: 0, focusMinutes: 0 };
    return cfg.stats[k];
  }

  function setAccent(hex) {
    document.documentElement.style.setProperty("--accent", hex);
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec/60);
    const s = sec % 60;
    if (m >= 100) {
      const h = Math.floor(m/60);
      const mm = m % 60;
      return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  // ------- Audio unlock (fix: blocked AudioContext) -------
  let audioCtx;
  async function ensureAudioUnlocked() {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") await audioCtx.resume();
    } catch { /* ignore */ }
  }

  function beep() {
    const vol = (Number(cfg.volume) || 0) / 100;
    if (vol <= 0) return;

    if (!audioCtx) return; // jeśli ktoś nigdy nie kliknął start - nie próbujemy odpalać (i tak by zablokowało)
    try {
      const ctx = audioCtx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = vol * 0.08;
      o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime;
      o.start(t); o.stop(t + 0.18);

      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = "sine";
      o2.frequency.value = 660;
      g2.gain.value = vol * 0.06;
      o2.connect(g2); g2.connect(ctx.destination);
      o2.start(t + 0.22); o2.stop(t + 0.34);
    } catch { /* ignore */ }
  }

  async function maybeRequestNotificationsOnGesture() {
    if (!cfg.notify) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
  }

  async function notify(title, body) {
    if (!cfg.notify) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") new Notification(title, { body });
  }

  // ------- Canvas dial -------
  const ctx = el.canvas.getContext("2d");
  function drawDial(progress) {
    const w = el.canvas.width, h = el.canvas.height;
    const cx = w/2, cy = h/2;
    const r = Math.min(w,h)*0.36;

    ctx.clearRect(0,0,w,h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r+38, 0, Math.PI*2);
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.lineWidth = 18;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();

    const start = -Math.PI/2;
    const end = start + Math.PI*2 * Math.min(1, Math.max(0, progress));

    ctx.save();
    ctx.lineWidth = 18;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff4d4d";
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 22;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end, false);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    const grd = ctx.createRadialGradient(cx, cy, r*0.2, cx, cy, r*1.35);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r+56, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  const pipRenderer = createPipRenderer({
    canvas: el.pipCanvas,
    getAccent: () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff4d4d",
    getDigitsColor: () => cfg.pipDigitsColor || "#ffffff"
  });

  function applyModeUI() {
    el.chipMode.textContent =
      cfg.mode === "pomodoro" ? "Pomodoro" :
      cfg.mode === "countdown" ? "Odliczanie" : "Timer";

    el.chipPlan.textContent = `${cfg.workMin}/${cfg.shortMin}/${cfg.longMin} • long co ${cfg.longEvery}`;

    el.mode.value = cfg.mode;
    el.accent.value = cfg.accent;
    el.workMin.value = cfg.workMin;
    el.shortMin.value = cfg.shortMin;
    el.longMin.value = cfg.longMin;
    el.longEvery.value = cfg.longEvery;
    el.countdownMin.value = cfg.countdownMin;
    el.countupTargetMin.value = cfg.countupTargetMin;
    el.volume.value = cfg.volume;
    el.volVal.textContent = `${cfg.volume}%`;
    el.autoStart.checked = !!cfg.autoStart;
    el.notify.checked = !!cfg.notify;
    el.pipView.value = cfg.pipView || "ring";
    el.pipDigitsColor.value = cfg.pipDigitsColor || "#ffffff";

    setAccent(cfg.accent);
  }

  function setPhase(type, durationSec, name) {
    state.phaseType = type;
    state.phaseName = name;
    state.duration = Math.max(1, Math.floor(durationSec));
    state.remaining = state.duration;
    state.elapsed = 0;
    state.lastShownSec = null;

    el.phaseLabel.textContent = name;
    el.metaLeft.textContent = (cfg.mode === "countup") ? `Czas: 00:00` : `Pozostało: ${fmt(state.remaining)}`;

    updateStatsUI();
    render(true);
  }

  function isIdle() {
    if (cfg.mode === "countup") return state.elapsed <= 0.0001;
    return Math.abs(state.remaining - state.duration) < 0.25;
  }

  function startIfNotRunning() {
    if (state.running) return;
    // unlock audio + notifications on a user gesture
    ensureAudioUnlocked();
    maybeRequestNotificationsOnGesture();

    state.running = true;
    state.lastNow = performance.now();
    el.btnStartPauseTxt.textContent = "Pause";
    requestAnimationFrame(loop);
  }

  function pauseIfRunning() {
    state.running = false;
    el.btnStartPauseTxt.textContent = "Start";
  }

  function toggleStartPause() {
    if (!state.running) startIfNotRunning();
    else pauseIfRunning();
  }

  function resetPhaseFromConfig() {
    pauseIfRunning();
    if (cfg.mode === "pomodoro") {
      setPhase("work", cfg.workMin*60, "WORK");
    } else if (cfg.mode === "countdown") {
      setPhase("countdown", cfg.countdownMin*60, "COUNTDOWN");
    } else {
      state.target = Math.max(0, Number(cfg.countupTargetMin) || 0) * 60;
      setPhase("countup", Math.max(1, state.target || 3600), "TIMER");
      state.elapsed = 0;
    }
  }

  function nextPomodoroPhase() {
    const stats = ensureTodayStats();
    if (state.phaseType === "work") {
      stats.sessions += 1;
      stats.focusMinutes += cfg.workMin;
      save();
      updateStatsUI();

      const shouldLong = (stats.sessions % Math.max(2, Number(cfg.longEvery)||4) === 0);
      if (shouldLong) setPhase("long", cfg.longMin*60, "LONG BREAK");
      else setPhase("short", cfg.shortMin*60, "SHORT BREAK");
    } else {
      setPhase("work", cfg.workMin*60, "WORK");
    }
  }

  function finishPhase() {
    beep();

    if (cfg.mode === "pomodoro") {
      notify("Pomidor Pro", state.phaseType === "work" ? "Koniec pracy. Czas na przerwę." : "Koniec przerwy. Wracamy do roboty.");
      nextPomodoroPhase();
      if (!cfg.autoStart) pauseIfRunning();
      return;
    }

    if (cfg.mode === "countdown") {
      notify("Pomidor Pro", "Countdown zakończony.");
      pauseIfRunning();
      state.remaining = 0;
      render(true);
      return;
    }

    if (cfg.mode === "countup") {
      notify("Pomidor Pro", state.target > 0 ? "Target osiągnięty." : "Timer.");
      pauseIfRunning();
      render(true);
      return;
    }
  }

  function updateStatsUI() {
    const stats = ensureTodayStats();
    el.sessionsToday.textContent = stats.sessions;
    el.statSessions.textContent = stats.sessions;
    el.statMinutes.textContent = stats.focusMinutes;
  }

  function render(force=false) {
    let displaySec;
    let progress;

    if (cfg.mode === "countup") {
      displaySec = state.elapsed;
      if (state.target > 0) progress = Math.min(1, state.elapsed / state.target);
      else progress = (state.elapsed % 3600) / 3600;
      el.metaLeft.textContent = `Czas: ${fmt(displaySec)}`;
    } else {
      displaySec = state.remaining;
      progress = 1 - (state.remaining / state.duration);
      el.metaLeft.textContent = `Pozostało: ${fmt(state.remaining)}`;
    }

    const shown = Math.floor(displaySec);
    if (force || state.lastShownSec !== shown) {
      el.time.textContent = fmt(displaySec);
      state.lastShownSec = shown;
    }

    drawDial(progress);

    const pipView = cfg.pipView || "ring";
    if (pipView === "digits" || pipView === "both") {
      const display = fmt(displaySec);
      const phase = (cfg.mode === "pomodoro")
        ? (state.phaseType === "work" ? "WORK" : "BREAK")
        : (cfg.mode === "countdown" ? "COUNTDOWN" : "TIMER");
      const sub = cfg.mode === "countup"
        ? (state.target > 0 ? `Target: ${fmt(state.target)}` : "Brak targetu")
        : `Tryb: ${cfg.mode === "pomodoro" ? (state.phaseType === "work" ? "Focus" : "Break") : "Countdown"}`;

      if (pipView === "both") pipRenderer.drawRingAndDigits(progress, display, phase, sub);
      else pipRenderer.drawDigits(display, phase, sub);
    }
  }

  function loop(now) {
    if (!state.running) return;

    const dt = Math.min(0.2, (now - state.lastNow) / 1000);
    state.lastNow = now;

    if (cfg.mode === "countup") {
      state.elapsed += dt;
      if (state.target > 0 && state.elapsed >= state.target) {
        state.elapsed = state.target;
        finishPhase();
        render(true);
        return;
      }
    } else {
      state.remaining -= dt;
      if (state.remaining <= 0) {
        state.remaining = 0;
        finishPhase();
        render(true);
        if (state.running) requestAnimationFrame(loop);
        return;
      }
    }

    render(false);
    requestAnimationFrame(loop);
  }

  async function togglePiP() {
    if (!document.pictureInPictureEnabled) {
      alert("PiP: przeglądarka nie wspiera.");
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      const view = cfg.pipView || "ring";
      const srcCanvas = getPiPCanvas(view, el.canvas, el.pipCanvas);

      if (!srcCanvas.captureStream) {
        alert("PiP: brak wsparcia canvas.captureStream(). Spróbuj Chrome/Edge.");
        return;
      }

      render(true);

      const stream = srcCanvas.captureStream(30);
      el.pipVideo.srcObject = stream;
      await el.pipVideo.play();
      await el.pipVideo.requestPictureInPicture();
    } catch (e) {
      console.warn(e);
      alert("PiP nie wstał. Najczęściej: blokada uprawnień albo autoplay.");
    }
  }

  async function toggleFocus() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        document.body.classList.add("focusMode");
      } else {
        await document.exitFullscreen();
        document.body.classList.remove("focusMode");
      }
    } catch {
      document.body.classList.toggle("focusMode");
    }
  }

  function bind() {
    el.btnStartPause.addEventListener("click", () => toggleStartPause());
    el.btnReset.addEventListener("click", () => resetPhaseFromConfig());

    el.btnSkip.addEventListener("click", () => {
      if (cfg.mode === "pomodoro") {
        finishPhase();
      } else if (cfg.mode === "countdown") {
        state.remaining = 0;
        finishPhase();
      } else {
        // FIX: countup skip without target resets elapsed
        if ((Number(cfg.countupTargetMin) || 0) <= 0) {
          state.elapsed = 0;
          render(true);
        } else {
          state.target = Math.max(0, Number(cfg.countupTargetMin) || 0) * 60;
          state.elapsed = state.target;
          finishPhase();
        }
      }
    });

    el.btnFocus.addEventListener("click", toggleFocus);
    el.btnPiP.addEventListener("click", togglePiP);

    // MODE change -> reset (intended)
    el.mode.addEventListener("change", () => {
      cfg.mode = el.mode.value;
      save();
      applyModeUI();
      resetPhaseFromConfig();
    });

    el.accent.addEventListener("input", () => {
      cfg.accent = el.accent.value;
      setAccent(cfg.accent);
      save();
      render(true);
    });

    // Settings changes (FIX: no aggressive reset; apply only if idle)
    function updateCfgNumber(id) {
      cfg[id] = Number(el[id].value) || cfg[id];
      save();
      applyModeUI();
      if (!state.running && isIdle()) {
        // only reflect immediately if user hasn't progressed current phase
        resetPhaseFromConfig();
      }
    }

    ["workMin","shortMin","longMin","longEvery","countdownMin","countupTargetMin"].forEach(id => {
      el[id].addEventListener("change", () => updateCfgNumber(id));
    });

    el.pipView.addEventListener("change", () => {
      cfg.pipView = el.pipView.value;
      save();
      render(true);
    });

    el.pipDigitsColor.addEventListener("input", () => {
      cfg.pipDigitsColor = el.pipDigitsColor.value;
      save();
      render(true);
    });

    el.volume.addEventListener("input", () => {
      cfg.volume = Number(el.volume.value) || 0;
      el.volVal.textContent = `${cfg.volume}%`;
      save();
    });

    el.autoStart.addEventListener("change", () => {
      cfg.autoStart = el.autoStart.checked;
      save();
    });

    // Notify checkbox: request permission on gesture here
    el.notify.addEventListener("change", async () => {
      cfg.notify = el.notify.checked;
      save();
      await maybeRequestNotificationsOnGesture();
    });

    // Global gesture to unlock audio (safe)
    document.addEventListener("pointerdown", ensureAudioUnlocked, { once: true });

    // KEYBOARD (FIX: no click simulation; block default click on keyup)
    const keyHandler = (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      const typing = tag === "input" || tag === "select" || tag === "textarea";
      if (typing) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (state.spaceDown) return;
        state.spaceDown = true;
        toggleStartPause();
      } else if (e.key.toLowerCase() === "r") {
        resetPhaseFromConfig();
      } else if (e.key.toLowerCase() === "n") {
        el.btnSkip.click();
      } else if (e.key.toLowerCase() === "f") {
        toggleFocus();
      } else if (e.key.toLowerCase() === "p") {
        togglePiP();
      }
    };

    const keyUpHandler = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        state.spaceDown = false;
      }
    };

    window.addEventListener("keydown", keyHandler, { capture: true });
    window.addEventListener("keyup", keyUpHandler, { capture: true });

    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) document.body.classList.remove("focusMode");
    });
  }

  function init() {
    ensureTodayStats();
    applyModeUI();
    updateStatsUI();
    resetPhaseFromConfig();
    bind();
    setupPWAInstallUI({
      installBox: el.installBox,
      btnInstall: el.btnInstall,
      iosInstallHint: el.iosInstallHint,
      state,
      installHiddenKey: INSTALL_HIDDEN_KEY
    });
    registerServiceWorker();
    render(true);

    // if notify is ON but permission is default, don't prompt now; we'll prompt on Start (gesture)
  }

  init();
})();
