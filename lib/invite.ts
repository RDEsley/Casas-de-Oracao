// Convite de doação. Tudo fica só neste aparelho: quem limpa os dados do navegador volta a ver
// o convite. O app continua sem saber se alguém doou.
const VISITS_KEY = "ccb-visits";
const VISIT_COUNTED_KEY = "ccb-visit-counted";
const INVITE_SEEN_KEY = "ccb-donation-invite-seen";
const CARD_HIDDEN_KEY = "ccb-donation-card-hidden";

/** A janela aparece sozinha a partir desta visita, uma única vez. */
export const INVITE_AFTER_VISITS = 5;
/** Tempo em que os botões da janela ficam travados, para a pessoa ler antes de tocar. */
export const INVITE_LOCK_MS = 2000;

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* sem armazenamento */ } };

/** Conta uma visita por abertura do app (não por tela) e devolve o total. */
export function countVisit() {
  const visits = Number(read(VISITS_KEY)) || 0;
  try {
    if (sessionStorage.getItem(VISIT_COUNTED_KEY)) return visits;
    sessionStorage.setItem(VISIT_COUNTED_KEY, "1");
  } catch { return visits; }
  write(VISITS_KEY, String(visits + 1));
  return visits + 1;
}

export const inviteSeen = () => read(INVITE_SEEN_KEY) === "1";
export const markInviteSeen = () => write(INVITE_SEEN_KEY, "1");
export const cardHidden = () => read(CARD_HIDDEN_KEY) === "1";
export const hideCard = () => write(CARD_HIDDEN_KEY, "1");

/** Quem já copiou o código Pix não precisa mais ser convidado. */
export const settleInvite = () => { markInviteSeen(); hideCard(); };
