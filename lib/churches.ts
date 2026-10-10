import churchData from "../data/churches.json";
import type { Coordinate } from "./geo";

export type ChurchItem = (typeof churchData.churches)[number];
export type Service = ChurchItem["services"][number];
export type LocatedChurch = ChurchItem & Coordinate;

export const churches = churchData.churches;

export const hasCoordinates = (church: ChurchItem): church is LocatedChurch =>
  typeof church.latitude === "number" && typeof church.longitude === "number";

/**
 * Só coordenadas conferidas viram destino de navegação. Nas demais, a rota
 * abre pela busca do endereço oficial, para nunca levar a um ponto errado.
 */
export const hasVerifiedPosition = (church: ChurchItem): church is LocatedChurch =>
  church.coordinateStatus === "verified" && hasCoordinates(church);

export const routeDestinations = churches.filter(hasCoordinates).map((church) => ({
  id: church.id,
  latitude: church.latitude,
  longitude: church.longitude,
}));

export function wazeRouteUrl(church: ChurchItem) {
  if (!hasVerifiedPosition(church)) return church.wazeUrl;
  return `https://waze.com/ul?${new URLSearchParams({ ll: `${church.latitude},${church.longitude}`, navigate: "yes" })}`;
}

/** `origin` só é informado para endereços salvos; sem ele o Maps parte da posição ao vivo do aparelho. */
export function googleMapsRouteUrl(church: ChurchItem, origin: Coordinate | null) {
  const search = new URLSearchParams({
    api: "1",
    destination: hasVerifiedPosition(church) ? `${church.latitude},${church.longitude}` : church.routeQuery,
    travelmode: "driving",
  });
  if (origin) search.set("origin", `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${search}`;
}
