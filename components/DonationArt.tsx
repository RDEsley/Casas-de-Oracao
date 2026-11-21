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
 * Animação Lottie decorativa. O player e o arquivo só são baixados quando ela aparece na tela;
 * se falhar, o espaço fica vazio e nada mais é afetado. Com `from` e `to` (quadros da
 * composição) o trecho toca uma única vez e para no fim; sem eles a animação fica em laço.
 */
function LottieArt({ className, src, from, to }: { className?: string; src: string; from?: number; to?: number }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy = () => {};
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    Promise.all([
      import("lottie-web/build/player/lottie_light"),
      fetch(src).then((response) => response.ok ? response.json() : Promise.reject(new Error("animation"))),
    ]).then(([{ default: lottie }, animationData]) => {
      if (cancelled || !container.current) return;
      const once = from !== undefined && to !== undefined;
      const item = lottie.loadAnimation({ container: container.current, renderer: "svg", loop: !once, autoplay: !once && !still, animationData });
      if (once) {
        // Quem prefere menos movimento vê direto o quadro final do trecho.
        if (still) item.goToAndStop(to - from, true);
        else item.playSegments([from, to], true);
      }
      destroy = () => item.destroy();
    }).catch(() => { /* decorativa: sem ela a tela continua completa */ });
    return () => { cancelled = true; destroy(); };
  }, [src, from, to]);

  return <div ref={container} className={className} aria-hidden="true" />;
}

/** Potinho de doações, na página de apoio. */
export function JarArt({ className }: { className?: string }) {
  return <LottieArt className={className} src="/animations/donation-jar.json" />;
}

/**
 * Coração de agradecimento, para quem recusa o convite. A chama vira coração e ele fica na
 * tela: o arquivo termina fazendo o coração sumir, então o trecho para antes disso.
 */
export function HeartArt({ className }: { className?: string }) {
  return <LottieArt className={className} src="/animations/donation-heart.json" from={40} to={330} />;
}
