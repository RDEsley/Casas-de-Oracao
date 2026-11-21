export type Period = "Todos" | "Manhã" | "Tarde" | "Noite";

export const PERIODS: Period[] = ["Todos", "Manhã", "Tarde", "Noite"];

export const DAYS = [
  { short: "Dom", long: "Domingo" }, { short: "Seg", long: "Segunda" },
  { short: "Ter", long: "Terça" }, { short: "Qua", long: "Quarta" },
  { short: "Qui", long: "Quinta" }, { short: "Sex", long: "Sexta" },
  { short: "Sáb", long: "Sábado" },
] as const;

export const isDay = (value: unknown): value is (typeof DAYS)[number]["short"] =>
  DAYS.some((day) => day.short === value);

export const isPeriod = (value: unknown): value is Period => PERIODS.includes(value as Period);

export const periodFor = (time: string): Exclude<Period, "Todos"> => {
  const hour = Number(time.split(":")[0]);
  return hour < 12 ? "Manhã" : hour < 18 ? "Tarde" : "Noite";
};

export const normalizeSearch = (value: string) => value
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLocaleLowerCase("pt-BR")
  .trim();
