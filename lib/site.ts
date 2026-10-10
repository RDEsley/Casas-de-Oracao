// Identidade do app em um só lugar. O nome não usa o da instituição; ela é citada apenas
// para explicar de quais casas de oração o app trata, sempre com o aviso de independência.
export const SITE = {
  name: "Localizador de Casas de Oração",
  shortName: "Casas de Oração",
  region: "Brasília e Águas Lindas",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://relatorio-ccb-brasilia.vercel.app",
  description: "Encontre casas de oração da Congregação Cristã no Brasil em Brasília, no Distrito Federal e em Águas Lindas de Goiás por dia, período e distância. Projeto independente, sem vínculo com a instituição.",
  /** Deve aparecer em toda tela e em toda descrição pública. */
  independence: "Projeto independente, sem vínculo com a Congregação Cristã no Brasil.",
  author: "Richard Esley Silva Oliveira",
  contactEmail: "richardesleyso@gmail.com",
  officialReportUrl: "https://congregacaocristanobrasil.org.br/relatorio",
  repositoryUrl: "https://github.com/RDEsley/Relatorio-CCB-Brasilia",
  legalUpdatedAt: "10 de outubro de 2026",
} as const;
