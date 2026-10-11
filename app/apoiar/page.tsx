import type { Metadata } from "next";
import DonationPanel from "../../components/DonationPanel";
import LegalPage from "../../components/LegalPage";
import { JarArt } from "../../components/DonationArt";
import { SITE } from "../../lib/site";

export const metadata: Metadata = {
  title: `Apoiar o desenvolvedor — ${SITE.name}`,
  description: "Doação voluntária por Pix ao desenvolvedor do app. Não é destinada à Congregação Cristã no Brasil, que não tem vínculo com este projeto.",
};

export default function Support() {
  return <LegalPage title="Apoiar o desenvolvedor" updated={false}>
    <JarArt className="donation-art" />
    <p>Criei este app sozinho, no meu tempo livre, para resolver um problema que eu mesmo tinha: achar com facilidade uma casa de oração perto de mim em Brasília. Ele é gratuito, não tem anúncios e não foi feito para dar lucro.</p>
    <p>Se ele foi útil e você quiser ajudar a cobrir os custos e o tempo para mantê-lo no ar, pode fazer uma doação de qualquer valor. Leia o aviso abaixo antes.</p>
    <DonationPanel />
  </LegalPage>;
}
