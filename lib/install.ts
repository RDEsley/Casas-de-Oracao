// Instalação do site como app (PWA). O Chrome dispara "beforeinstallprompt" uma única vez,
// logo após carregar, por isso o evento é guardado aqui, fora dos componentes.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export const OPEN_INSTALL_EVENT = "ccb:open-install";
export const INSTALL_STATE_EVENT = "ccb:install-state";

let deferredPrompt: InstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new Event(INSTALL_STATE_EVENT));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.dispatchEvent(new Event(INSTALL_STATE_EVENT));
  });
}

export const canPromptInstall = () => deferredPrompt !== null;

/** Já aberto como app instalado (tela cheia), no Android/desktop ou no iPhone. */
export const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Abre o diálogo de instalação do navegador. Retorna true se a pessoa aceitou. */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  window.dispatchEvent(new Event(INSTALL_STATE_EVENT));
  return outcome === "accepted";
}

export const openInstall = () => window.dispatchEvent(new Event(OPEN_INSTALL_EVENT));
