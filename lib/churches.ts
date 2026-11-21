import type { Coordinate } from "./geo";

export type Service = { day: string; time: string; type: string };

/**
 * verified: ponto conferido (templo registrado pelo IBGE no endereço do relatório oficial);
 * approximate: ponto do endereço, sem confirmação de que é o templo (só serve de estimativa);
 * unavailable: sem posição confiável.
 */
export type CoordinateStatus = "verified" | "approximate" | "unavailable";

export type ChurchItem = {
  id: string;
  officialId: number;
  name: string;
  city: string;
  state: string;
  address: string;
  services: Service[];
  latitude: number | null;
  longitude: number | null;
  coordinateStatus: CoordinateStatus;
  coordinateSource: string | null;
  cnefeId?: string;
  ministry: Array<{ role: string; names: string[] }>;
  phones: string[];
  officialVerification: string;
};

export type LocatedChurch = ChurchItem & Coordinate;

export const hasCoordinates = (church: ChurchItem): church is LocatedChurch =>
  typeof church.latitude === "number" && typeof church.longitude === "number";

/**
 * Só coordenadas conferidas viram destino de navegação. Sem confirmação não há rota:
 * é melhor deixar a rota indisponível do que mandar alguém ao endereço errado.
 */
export const hasVerifiedPosition = (church: ChurchItem): church is LocatedChurch =>
  church.coordinateStatus === "verified" && hasCoordinates(church);

export function wazeRouteUrl(church: LocatedChurch) {
  return `https://waze.com/ul?${new URLSearchParams({ ll: `${church.latitude},${church.longitude}`, navigate: "yes", zoom: "17" })}`;
}

/** `origin` só é informado para endereços salvos; sem ele o Maps parte da posição ao vivo do aparelho. */
export function googleMapsRouteUrl(church: LocatedChurch, origin: Coordinate | null) {
  const search = new URLSearchParams({
    api: "1",
    destination: `${church.latitude},${church.longitude}`,
    travelmode: "driving",
  });
  if (origin) search.set("origin", `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${search}`;
}

/** Link de e-mail para avisar que o endereço ou a posição de uma casa está errado. */
export function reportErrorUrl(church: ChurchItem, contactEmail: string) {
  const subject = `Dados incorretos: ${church.id} ${church.name} (${church.city}/${church.state})`;
  const body = `Casa de oração: ${church.id} — ${church.name}\n${church.address}\n${church.city}/${church.state}\n\nO que está errado:\n`;
  return `mailto:${contactEmail}?${new URLSearchParams({ subject, body }).toString().replaceAll("+", "%20")}`;
}
