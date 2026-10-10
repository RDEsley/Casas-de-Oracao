export type Coordinate = { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371.0088;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distância em linha reta (km). Usada apenas como estimativa quando não há rota. */
export function straightLineKm(from: Coordinate, to: Coordinate) {
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export const formatDistance = (value: number) => value < 1
  ? `${Math.max(50, Math.round(value * 20) * 50)} m`
  : `${value.toFixed(value < 10 ? 1 : 0).replace(".", ",")} km`;

export const formatAccuracy = (value: number) => value < 1000
  ? `${Math.round(value)} m`
  : `${(value / 1000).toFixed(1).replace(".", ",")} km`;
