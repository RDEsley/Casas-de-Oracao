"use client";

import { ArrowLeft, HeartHandshake, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { INVITE_AFTER_VISITS, INVITE_LOCK_MS, cardHidden, countVisit, hideCard, inviteSeen, markInviteSeen } from "../lib/invite";
import { JarArt, WaveArt } from "./DonationArt";

type Step = "ask" | "thanks";

/**
 * Convite de doação: um cartão discreto no fim da página e uma janela que aparece sozinha uma
 * única vez, depois de algumas visitas. Fechar o cartão abre a janela mais uma vez e o esconde.
 * A janela sempre repete que o valor vai para o desenvolvedor, e não para a igreja.
 */
export default function DonationInvite() {
  const [card, setCard] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [unlocked, setUnlocked] = useState<Step | null>(null);

  useEffect(() => {
    const visits = countVisit();
    const timer = window.setTimeout(() => {
      setCard(!cardHidden());
      if (visits < INVITE_AFTER_VISITS || inviteSeen()) return;
      markInviteSeen();
      setStep("ask");
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!step) return;
    const timer = window.setTimeout(() => setUnlocked(step), INVITE_LOCK_MS);
    return () => { window.clearTimeout(timer); setUnlocked(null); };
  }, [step]);

  const locked = unlocked !== step;

  const dismissCard = () => {
    hideCard();
    markInviteSeen();
    setCard(false);
    setStep("ask");
  };

  return <>
    {card && <aside className="support-card" aria-label="Apoiar o desenvolvedor">
      <HeartHandshake size={20} />
      <p><b>Este app te ajudou?</b><small>Apoie quem o criou. Não é doação para a igreja.</small></p>
      <Link href="/apoiar">Apoiar</Link>
      <button onClick={dismissCard} aria-label="Dispensar"><X size={18} /></button>
    </aside>}

    {step && <div className="modal-backdrop">
      <section className="location-modal invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
        {step === "ask" ? <WaveArt className="invite-art" /> : <JarArt className="invite-art" />}
        {step === "ask" ? <>
          <h2 id="invite-title">Que bom ter você por aqui!</h2>
          <p>Você já abriu o app algumas vezes, então ele deve estar sendo útil. Fico feliz de verdade.</p>
          <p>Ele é gratuito e vai continuar assim. Sou só eu cuidando dele, no meu tempo livre, e mantê-lo no ar dá trabalho e tem seus custos. Se quiser ajudar, qualquer valor conta: <b>R$ 1 já ajuda</b>.</p>
          <p className="invite-notice">A doação vai para o <b>desenvolvedor do app</b>, e <b>não</b> para a Congregação Cristã no Brasil.</p>
          <div className="invite-actions">
            {locked
              ? <button className="invite-primary" disabled>Quero ajudar</button>
              : <Link className="invite-primary" href="/apoiar">Quero ajudar</Link>}
            <button className="invite-secondary" disabled={locked} onClick={() => setStep("thanks")}>Agora não</button>
          </div>
        </> : <>
          <h2 id="invite-title">Tudo bem, obrigado mesmo assim!</h2>
          <p>Fique à vontade para usar o app de graça, sempre que precisar. Saber que ele ajuda você a chegar ao culto já faz valer a pena.</p>
          <p>Se um dia quiser apoiar, o link <b>Apoiar o desenvolvedor</b> fica no fim da página.</p>
          <div className="invite-actions">
            <button className="invite-primary" disabled={locked} onClick={() => setStep(null)}>Tudo bem</button>
            <button className="invite-secondary" onClick={() => setStep("ask")}><ArrowLeft size={16} /> Voltar</button>
          </div>
        </>}
        <span key={`lock-${step}`} className="invite-lock" aria-hidden="true" />
      </section>
    </div>}
  </>;
}
