"use client";

import { useEffect, useRef } from "react";

/** Personagem acenando: WebP animado, com um quadro parado para quem prefere menos movimento. */
export function WaveArt({ className }: { className?: string }) {
  return <picture className={className}>
    <source media="(prefers-reduced-motion: reduce)" srcSet="/animations/donation-wave-still.webp" />
    <img src="/animations/donation-wave.webp" alt="" width={336} height={293} />
  </picture>;
}

/**
 * Potinho de doações (Lottie). O player e o arquivo só são baixados quando a animação aparece
 * na tela; se falhar, o espaço fica vazio e nada mais é afetado.
 */
export function JarArt({ className }: { className?: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy = () => {};
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    Promise.all([
      import("lottie-web/build/player/lottie_light"),
      fetch("/animations/donation-jar.json").then((response) => response.ok ? response.json() : Promise.reject(new Error("animation"))),
    ]).then(([{ default: lottie }, animationData]) => {
      if (cancelled || !container.current) return;
      const item = lottie.loadAnimation({ container: container.current, renderer: "svg", loop: true, autoplay: !still, animationData });
      destroy = () => item.destroy();
    }).catch(() => { /* decorativa: sem ela a tela continua completa */ });
    return () => { cancelled = true; destroy(); };
  }, []);

  return <div ref={container} className={className} aria-hidden="true" />;
}
