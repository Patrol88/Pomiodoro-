export function setupPWAInstallUI({
  installBox,
  btnInstall,
  iosInstallHint,
  state,
  installHiddenKey
}) {
  if (!installBox || !btnInstall || !iosInstallHint) return;

  if (isStandalone()) {
    installBox.hidden = true;
    state.installUiLockedHidden = true;
    return;
  }

  if (localStorage.getItem(installHiddenKey) === "1") {
    state.installUiLockedHidden = true;
    installBox.hidden = true;
    return;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    if (!state.installUiLockedHidden) {
      installBox.hidden = false;
      iosInstallHint.hidden = true;
    }
  });

  btnInstall.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    const promptEvent = state.deferredInstallPrompt;
    promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    state.deferredInstallPrompt = null;
    if (choice?.outcome === "accepted") {
      state.installUiLockedHidden = true;
      localStorage.setItem(installHiddenKey, "1");
      installBox.hidden = true;
    }
  });

  window.addEventListener("appinstalled", () => {
    state.installUiLockedHidden = true;
    state.deferredInstallPrompt = null;
    localStorage.setItem(installHiddenKey, "1");
    installBox.hidden = true;
  });

  if (isIOSSafari()) {
    setTimeout(() => {
      if (!state.deferredInstallPrompt && !isStandalone() && !state.installUiLockedHidden) {
        installBox.hidden = false;
        iosInstallHint.hidden = false;
      }
    }, 1500);
  }
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("SW registration failed", err);
    });
  });
}

function isIOS() {
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
}

function isIOSSafari() {
  const ua = navigator.userAgent.toLowerCase();
  return isIOS() && ua.includes("safari") && !ua.includes("crios") && !ua.includes("fxios");
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
