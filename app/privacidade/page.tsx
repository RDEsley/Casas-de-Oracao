import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidade — Casas de Oração",
  description: "Como o site e o aplicativo Casas de Oração tratam a sua localização e as suas preferências.",
};

export default function Privacy() {
  return <main className="legal">
    <Link href="/">← Voltar para a busca</Link>
    <h1>Privacidade</h1>
    <p>O Casas de Oração é um projeto independente, sem cadastro, sem anúncios e sem rastreamento. Esta página vale para o site e para o aplicativo.</p>

    <h2>Localização</h2>
    <p>A localização só é lida quando você toca em “Usar localização atual” e serve apenas para calcular a distância até as casas de oração. As coordenadas são enviadas ao nosso serviço de rotas e ao motor público OSRM (projeto OpenStreetMap) somente para esse cálculo e não são armazenadas. A posição atual não fica salva entre uma visita e outra.</p>

    <h2>Endereços salvos, favoritos e arquivados</h2>
    <p>Ficam guardados somente no seu aparelho. Ao salvar um endereço, o texto digitado é consultado no serviço público Nominatim (OpenStreetMap) para encontrar a posição. Limpar os dados do navegador ou desinstalar o aplicativo apaga tudo.</p>

    <h2>Rotas</h2>
    <p>Os botões Waze e Google Maps abrem esses aplicativos, que seguem as políticas de privacidade de cada empresa.</p>

    <h2>Dados das casas de oração</h2>
    <p>Endereços, horários, ministério e telefones vêm do relatório público da Congregação Cristã no Brasil. As posições no mapa vêm do Cadastro Nacional de Endereços para Fins Estatísticos (IBGE, Censo 2022).</p>

    <h2>Contato</h2>
    <p>Dúvidas ou correções: <a href="mailto:richardesleyso@gmail.com">richardesleyso@gmail.com</a>.</p>
  </main>;
}
