// Onde o APK é publicado (GitHub Releases por padrão). Troque por NEXT_PUBLIC_APP_DOWNLOAD_URL
// quando o app estiver na Google Play.
export const APP_DOWNLOAD_URL = process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL
  ?? "https://github.com/RDEsley/Relatorio-CCB-Brasilia/releases/latest/download/casas-de-oracao.apk";

export const OPEN_APP_PROMPT_EVENT = "ccb:open-app-prompt";
export const openAppPrompt = () => window.dispatchEvent(new Event(OPEN_APP_PROMPT_EVENT));
