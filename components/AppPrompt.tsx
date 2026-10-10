"use client";

import { Capacitor } from "@capacitor/core";
import { Download, ShieldCheck, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_DOWNLOAD_URL, OPEN_APP_PROMPT_EVENT } from "../lib/app-download";

const DISMISSED_KEY = "ccb-app-prompt-dismissed";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

const readSnooze = () => {
  try { return Date.now() - Number(localStorage.getItem(DISMISSED_KEY) || 0) < SNOOZE_MS; } catch { return false; }
};

/**
 * Convida quem abriu o site no Android a baixar o app. "Agora não" adia por 14 dias; o botão
 * "Baixar app" (topo e rodapé) reabre a mesma janela a qualquer momento, em qualquer aparelho.
 */
export default function AppPrompt() {
  const [mode, setMode] = useState<"none" | "banner" | "sheet">("none");
  const [android, setAndroid] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (Capacitor.isNativePlatform()) return;
      const onAndroid = /Android/i.test(navigator.userAgent);
      setAndroid(onAndroid);
      if (onAndroid && !readSnooze()) setMode("banner");
    }, 1200);
    const open = () => setMode("sheet");
    window.addEventListener(OPEN_APP_PROMPT_EVENT, open);
    return () => { window.clearTimeout(timer); window.removeEventListener(OPEN_APP_PROMPT_EVENT, open); };
  }, []);

  useEffect(() => {
    if (mode !== "sheet") return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMode("none"); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* sem armazenamento: só fecha */ }
    setMode("none");
  };

  if (mode === "banner") {
    return <aside className="app-banner" role="region" aria-label="Baixar o aplicativo">
      <span className="app-banner-icon"><Smartphone size={20} /></span>
      <p><b>Use o app no celular</b><small>Mais rápido, com GPS nativo.</small></p>
      <a className="app-banner-cta" href={APP_DOWNLOAD_URL} onClick={dismiss}>Baixar</a>
      <button className="app-banner-close" onClick={dismiss} aria-label="Agora não"><X size={18} /></button>
      <span className="app-banner-hint">Você pode baixar depois pelo botão “Baixar app”.</span>
    </aside>;
  }

  if (mode === "sheet") {
    return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMode("none"); }}>
      <section className="location-modal app-sheet" role="dialog" aria-modal="true" aria-labelledby="app-sheet-title">
        <div className="modal-head"><div><h2 id="app-sheet-title">Baixe o aplicativo</h2><p>Casas de Oração para Android.</p></div><button onClick={() => setMode("none")} aria-label="Fechar"><X /></button></div>
        <ul className="app-sheet-list">
          <li><ShieldCheck size={18} /> Localização do GPS lida na hora, sem cadastro.</li>
          <li><ShieldCheck size={18} /> Mesmas casas, horários e rotas para Waze e Google Maps.</li>
        </ul>
        {android
          ? <a className="current-location-card app-sheet-cta" href={APP_DOWNLOAD_URL}><Download size={20} /><span><b>Baixar para Android</b><small>Arquivo APK</small></span></a>
          : <p className="position-note"><Smartphone size={16} /> O app existe só para Android por enquanto. Abra este endereço no celular Android para baixar; no iPhone, use o site normalmente.</p>}
        {android && <p className="privacy-note app-sheet-note">Ao abrir o arquivo, o Android pode pedir para permitir a instalação deste navegador.</p>}
      </section>
    </div>;
  }
  return null;
}
