"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { DONATION } from "../lib/donation";
import { buildPixCode } from "../lib/pix";
import PixQrCode from "./PixQrCode";

const formatMoney = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Vírgula ou ponto valem como decimal ("15,50" ou "15.50"). Separador de milhar não é aceito,
// para "1.500" nunca ser lido como um valor diferente do que a pessoa quis digitar.
const parseAmount = (text: string) => {
  const match = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const value = Number(`${match[1]}.${match[2] ?? "0"}`);
  return value > 0 && value <= DONATION.maxAmount ? value : null;
};

/**
 * Doação por Pix ao desenvolvedor. O código só aparece depois que a pessoa confirma ter
 * entendido que o valor não vai para a igreja: é a regra mais importante desta tela.
 */
export default function DonationPanel() {
  const [understood, setUnderstood] = useState(false);
  const [preset, setPreset] = useState<number | "custom" | null>(null);
  const [customText, setCustomText] = useState("");
  const [copied, setCopied] = useState(false);

  const amount = preset === "custom" ? parseAmount(customText) : preset;
  const code = useMemo(() => buildPixCode({
    key: DONATION.pixKey,
    receiverName: DONATION.receiverName,
    receiverCity: DONATION.receiverCity,
    txid: DONATION.txid,
    amount: amount ?? undefined,
  }), [amount]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch { /* sem permissão de área de transferência: o código continua visível para copiar à mão */ }
  };

  return <>
    <section className="donation-warning" role="note" aria-labelledby="donation-warning-title">
      <h2 id="donation-warning-title"><TriangleAlert size={22} /> Esta doação NÃO é para a Congregação Cristã no Brasil</h2>
      <ul>
        <li>O valor vai <b>direto para {DONATION.receiverFullName}</b>, pessoa física, criador deste app.</li>
        <li>A Congregação Cristã no Brasil <b>não criou, não autorizou e não mantém</b> este app, e <b>não recebe nenhuma parte</b> do valor.</li>
        <li>Isto <b>não é coleta, oferta nem contribuição para a igreja</b>. Para contribuir com a obra, procure a sua casa de oração.</li>
        <li>Doar é opcional e não libera nenhuma função: o app é gratuito e continua gratuito.</li>
      </ul>
      <label className="donation-confirm">
        <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
        <span>Li e entendi: estou doando para o <b>desenvolvedor do app</b>, e não para a Congregação Cristã no Brasil.</span>
      </label>
    </section>

    {understood ? <section className="donation-pix" aria-label="Doar por Pix">
      <p className="donation-receiver">Recebedor: <b>{DONATION.receiverFullName}</b> (desenvolvedor do app, não a igreja)</p>

      <div className="donation-amounts" role="group" aria-label="Valor">
        {DONATION.suggestedAmounts.map((value) => <button key={value} className={preset === value ? "active" : ""} aria-pressed={preset === value} onClick={() => setPreset(value)}>{formatMoney(value)}</button>)}
        <button className={preset === "custom" ? "active" : ""} aria-pressed={preset === "custom"} onClick={() => setPreset("custom")}>Outro valor</button>
        <button className={preset === null ? "active" : ""} aria-pressed={preset === null} onClick={() => setPreset(null)}>Decidir no banco</button>
      </div>
      {preset === "custom" && <label className="donation-custom">Valor em reais
        <input inputMode="decimal" value={customText} onChange={(event) => setCustomText(event.target.value)} placeholder="Ex.: 15,00" autoFocus />
        {customText && amount === null && <small>Use só números, como 15 ou 15,50 (máximo de {formatMoney(DONATION.maxAmount)}).</small>}
      </label>}

      <div className="donation-code">
        <PixQrCode value={code} />
        <p className="donation-amount-line">{amount ? <>Valor: <b>{formatMoney(amount)}</b></> : "Você escolhe o valor no app do banco."}</p>
        <code>{code}</code>
        <button className="donation-copy" onClick={copy}>{copied ? <><Check size={18} /> Código copiado</> : <><Copy size={18} /> Copiar código Pix</>}</button>
      </div>

      <ol className="donation-steps">
        <li>No app do seu banco, abra o Pix e escolha <b>Ler QR Code</b> ou <b>Pix Copia e Cola</b>.</li>
        <li>Confira o nome do recebedor: <b>{DONATION.receiverFullName}</b>. Se aparecer outro nome, não confirme.</li>
        <li>Confirme o valor e conclua. Muito obrigado.</li>
      </ol>
    </section> : <p className="donation-locked">Marque a confirmação acima para ver o código Pix.</p>}
  </>;
}
