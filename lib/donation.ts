// Doação voluntária ao desenvolvedor por Pix. Padrão comum a todos os projetos do autor:
// veja DOACOES.md na pasta de projetos. Só o `txid` muda de um projeto para outro.
export const DONATION = {
  pixKey: "35f6734f-2587-4139-8e9b-0ed7a4436a7a",
  /** Nome exibido no app do banco, conferido por quem doa. */
  receiverFullName: "Richard Esley Silva Oliveira",
  /** Nome no código Pix: o padrão aceita até 25 caracteres, sem acentos. */
  receiverName: "RICHARD ESLEY S OLIVEIRA",
  receiverCity: "BRASILIA",
  /** Aparece no extrato do recebedor e identifica de qual projeto veio a doação. */
  txid: "CASASORACAO",
  suggestedAmounts: [5, 10, 20],
  maxAmount: 5000,
} as const;
