import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "../../components/LegalPage";
import { SITE } from "../../lib/site";

export const metadata: Metadata = {
  title: `Política de privacidade — ${SITE.name}`,
  description: "Como o app trata a sua localização, as suas preferências e os dados exibidos, conforme a LGPD.",
};

export default function Privacy() {
  return <LegalPage title="Política de privacidade">
    <p>O {SITE.name} não tem cadastro, não tem anúncios e não usa cookies de rastreamento nem ferramentas de análise de audiência. Esta política explica o pouco que é tratado e vale para o site e para o app instalado.</p>

    <h2>1. Quem é o responsável</h2>
    <p>{SITE.author}, pessoa física, criador e mantenedor do app. Contato: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. {SITE.independence}</p>

    <h2>2. O que é tratado</h2>
    <h3>Sua localização</h3>
    <p>Só é lida quando você toca em “Usar localização atual” e autoriza no aparelho. As coordenadas vão para o servidor do app e, de lá, para os serviços públicos de rota do projeto OpenStreetMap (OSRM), apenas para calcular a distância até as casas de oração. Elas <b>não são armazenadas</b> e não ficam salvas entre uma visita e outra. Você pode revogar a permissão nas configurações do navegador ou do aparelho.</p>
    <h3>Endereços que você salva</h3>
    <p>O texto digitado é enviado, direto do seu navegador, ao serviço público Nominatim (OpenStreetMap) para encontrar a posição. O resultado fica guardado <b>somente no seu aparelho</b>.</p>
    <h3>Preferências</h3>
    <p>Favoritos, arquivados, filtros e a escolha de adiar o convite de instalação ficam somente no seu aparelho (armazenamento local do navegador). O app instalado também guarda no aparelho uma cópia das páginas para abrir sem conexão.</p>
    <h3>Registros técnicos</h3>
    <p>A hospedagem (Vercel) registra dados técnicos de acesso, como endereço IP, data, hora e navegador, para manter o serviço funcionando e seguro. Esses registros não são usados para identificar você.</p>

    <h2>3. Doações</h2>
    <p>A doação é feita no app do seu banco, por Pix. O {SITE.name} <b>não coleta dados de pagamento</b> e não fica sabendo quem doou. Como em qualquer Pix, o recebedor vê no próprio extrato o nome de quem pagou e as informações que o banco fornece. O valor vai para o desenvolvedor, não para a Congregação Cristã no Brasil; veja os <Link href="/termos">Termos de uso</Link>.</p>

    <h2>4. Dados das casas de oração</h2>
    <p>Endereços, horários, nomes do ministério e telefones são reproduzidos do <a href={SITE.officialReportUrl} target="_blank" rel="noreferrer">relatório público da instituição</a>, com a única finalidade de ajudar a encontrar e contatar a casa de oração. As posições no mapa vêm do Cadastro Nacional de Endereços para Fins Estatísticos (IBGE, Censo 2022).</p>
    <p>Se o seu nome ou telefone aparece no app e você quer corrigir ou remover, escreva para <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>

    <h2>5. Com quem os dados são compartilhados</h2>
    <ul>
      <li><b>Vercel</b>: hospedagem do site e do cálculo de distâncias.</li>
      <li><b>OSRM / OpenStreetMap</b>: recebe as coordenadas de saída para calcular rotas.</li>
      <li><b>Nominatim / OpenStreetMap</b>: recebe o endereço que você digita ao salvar um local.</li>
      <li><b>Waze e Google Maps</b>: só quando você toca nos botões de rota; passam a valer as políticas dessas empresas.</li>
    </ul>
    <p>Esses serviços podem processar dados fora do Brasil. Nenhum dado é vendido nem usado para publicidade.</p>

    <h2>6. Seus direitos</h2>
    <p>A Lei Geral de Proteção de Dados (Lei 13.709/2018) garante, entre outros, o direito de confirmar o tratamento, acessar, corrigir e pedir a eliminação de dados. Como quase tudo fica no seu aparelho, você mesmo apaga ao limpar os dados do site no navegador ou ao desinstalar o app. Para qualquer outro pedido, use o e-mail acima.</p>

    <h2>7. Mudanças</h2>
    <p>Esta política pode ser atualizada; a data no topo indica a versão em vigor.</p>
  </LegalPage>;
}
