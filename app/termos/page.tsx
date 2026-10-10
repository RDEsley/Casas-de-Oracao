import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "../../components/LegalPage";
import { SITE } from "../../lib/site";

export const metadata: Metadata = {
  title: `Termos de uso — ${SITE.name}`,
  description: "Condições de uso do app: o que ele é, sua independência em relação à Congregação Cristã no Brasil, limites das informações e doações.",
};

export default function Terms() {
  return <LegalPage title="Termos de uso">
    <p>Ao usar o {SITE.name} (o “app”), no site ou instalado no aparelho, você concorda com estes termos. Se não concordar, basta não usar.</p>

    <h2>1. O que é o app</h2>
    <p>É uma ferramenta gratuita para localizar casas de oração da Congregação Cristã no Brasil em Brasília, no Distrito Federal e em Águas Lindas de Goiás, com os dias de culto e atalhos para traçar a rota. Foi criado e é mantido por {SITE.author}, pessoa física, sem fins lucrativos.</p>

    <h2>2. Sem vínculo com a instituição</h2>
    <p>O app é um projeto <b>independente</b>. Ele <b>não é um canal oficial</b> e não foi criado, autorizado, patrocinado nem endossado pela Congregação Cristã no Brasil. O nome da instituição é citado somente para identificar de quais casas de oração o app trata; não há intenção de usar o nome ou a marca dela como se fossem do app. Nomes e marcas pertencem aos respectivos titulares.</p>
    <p>A fonte oficial das informações é o <a href={SITE.officialReportUrl} target="_blank" rel="noreferrer">relatório público da própria instituição</a>. Em caso de divergência, vale o que estiver lá.</p>

    <h2>3. Uso</h2>
    <p>O uso é gratuito e não exige cadastro. Você se compromete a usar o app de boa-fé, para fins lícitos, e a não tentar prejudicar o seu funcionamento.</p>

    <h2>4. Limites das informações</h2>
    <ul>
      <li>Endereços, horários, ministério e telefones são reproduzidos do relatório público e <b>podem mudar</b> por reformas, eventos ou decisões locais sem que o app seja atualizado na hora.</li>
      <li>As posições no mapa vêm do cadastro de endereços do IBGE (Censo 2022). Quando uma posição não está confirmada, o app avisa e a rota abre pela busca do endereço.</li>
      <li>As distâncias são estimativas de trajeto de carro, sem trânsito, a partir do ponto de saída que você informar.</li>
      <li>As rotas são traçadas pelo Waze e pelo Google Maps, serviços de terceiros com termos próprios.</li>
    </ul>
    <p><b>Confira o endereço e o horário antes de sair</b>, principalmente em locais que você não conhece.</p>

    <h2>5. Doações</h2>
    <p>O app oferece, de forma opcional, a possibilidade de doar qualquer valor por Pix ao desenvolvedor. Sobre essas doações:</p>
    <ul>
      <li>vão <b>diretamente para {SITE.author}</b>, pessoa física, para ajudar a cobrir custos e tempo de manutenção;</li>
      <li><b>não são destinadas à Congregação Cristã no Brasil</b>, que não recebe nenhuma parte e não tem relação com elas;</li>
      <li><b>não são coleta, oferta nem contribuição religiosa</b>;</li>
      <li>são voluntárias, não dão direito a nenhuma contrapartida e não liberam funções: o app é o mesmo para quem doa e para quem não doa.</li>
    </ul>
    <p>Se você doou por engano, escreva para <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> que o valor é devolvido.</p>

    <h2>6. Responsabilidade</h2>
    <p>O app é oferecido “como está”, sem garantia de disponibilidade nem de que as informações estejam sempre corretas ou atualizadas. Na medida permitida pela lei, o desenvolvedor não responde por prejuízos decorrentes do uso do app, como deslocamentos feitos com base em informação desatualizada, indisponibilidade do serviço ou falhas de serviços de terceiros.</p>

    <h2>7. Privacidade</h2>
    <p>O tratamento de dados está descrito na <Link href="/privacidade">Política de Privacidade</Link>.</p>

    <h2>8. Código aberto</h2>
    <p>O código-fonte é público, sob licença MIT, em <a href={SITE.repositoryUrl} target="_blank" rel="noreferrer">{SITE.repositoryUrl.replace("https://", "")}</a>.</p>

    <h2>9. Mudanças e contato</h2>
    <p>Estes termos podem ser atualizados; a data no topo indica a versão em vigor. Aplica-se a legislação brasileira. Dúvidas, correções ou pedidos: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>
  </LegalPage>;
}
