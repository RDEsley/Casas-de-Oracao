"use client";

import { Download, MoreVertical, Share, ShieldCheck, Smartphone, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { INSTALL_STATE_EVENT, OPEN_INSTALL_EVENT, canPromptInstall, isInstalled, isIos, promptInstall } from "../lib/install";

const DISMISSED_KEY = "ccb-app-prompt-dismissed";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

const snoozed = () => {
  try { return Date.now() - Number(localStorage.getItem(DISMISSED_KEY) || 0) < SNOOZE_MS; } catch { return false; }
};

/**
 * Convida a instalar o site como app. "Agora não" adia por 14 dias; o botão "Instalar app"
 * (topo e rodapé) reabre a janela a qualquer momento. Some quando o app já está instalado.
 */
export default function AppPrompt() {
  const [mode, setMode] = useState<"none" | "banner" | "sheet">("none");
  const [promptable, setPromptable] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // O convite automático aparece quando o navegador oferece instalação (Chrome) ou no iPhone.
    const sync = () => {
      setPromptable(canPromptInstall());
      setIos(isIos());
      if (isInstalled()) setMode("none");
      else if ((canPromptInstall() || isIos()) && !snoozed()) setMode((current) => current === "none" ? "banner" : current);
    };
    const timer = window.setTimeout(sync, 1200);
    const open = () => setMode("sheet");
    window.addEventListener(INSTALL_STATE_EVENT, sync);
    window.addEventListener(OPEN_INSTALL_EVENT, open);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(INSTALL_STATE_EVENT, sync);
      window.removeEventListener(OPEN_INSTALL_EVENT, open);
    };
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

  const install = async () => {
    if (!promptable) return setMode("sheet");
    await promptInstall();
    dismiss();
  };

  if (mode === "banner") {
    return <aside className="app-banner" role="region" aria-label="Instalar o aplicativo">
      <span className="app-banner-icon"><Smartphone size={20} /></span>
      <p><b>Instale o app</b><small>Abre direto da tela inicial.</small></p>
      <button className="app-banner-cta" onClick={install}>Instalar</button>
      <button className="app-banner-close" onClick={dismiss} aria-label="Agora não"><X size={18} /></button>
      <span className="app-banner-hint">Você pode instalar depois pelo botão “Instalar app”.</span>
    </aside>;
  }

  if (mode === "sheet") {
    return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMode("none"); }}>
      <section className="location-modal app-sheet" role="dialog" aria-modal="true" aria-labelledby="app-sheet-title">
        <div className="modal-head"><div><h2 id="app-sheet-title">Instale o aplicativo</h2><p>Sem loja e sem baixar arquivo: o próprio navegador instala.</p></div><button onClick={() => setMode("none")} aria-label="Fechar"><X /></button></div>
        <ul className="app-sheet-list">
          <li><ShieldCheck size={18} /> Ícone na tela inicial e abertura em tela cheia.</li>
          <li><ShieldCheck size={18} /> Sempre atualizado, com as mesmas casas, horários e rotas.</li>
        </ul>
        {promptable
          ? <button className="current-location-card app-sheet-cta" onClick={install}><Download size={20} /><span><b>Instalar agora</b><small>Leva poucos segundos</small></span></button>
          : <ol className="app-sheet-steps">
              {ios
                ? <><li><Share size={17} /> No Safari, toque em <b>Compartilhar</b> (se não aparecer, toque antes em <b>•••</b>).</li><li><SquarePlus size={17} /> Escolha <b>Adicionar à Tela de Início</b>.</li></>
                : <><li><MoreVertical size={17} /> Abra o menu do navegador (⋮).</li><li><SquarePlus size={17} /> Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li></>}
            </ol>}
      </section>
    </div>;
  }
  return null;
}
