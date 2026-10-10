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

const words = (text: string) => text
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLocaleLowerCase("pt-BR")
  .split(/[^a-z0-9]+/)
  .filter(Boolean);

// Números que identificam a unidade (casa, lote...) e não a quadra: o mapa raramente os conhece.
const UNIT_WORDS = new Set(["casa", "lote", "lotes", "lt", "apto", "ap", "apartamento", "numero", "n", "no", "sala", "loja", "andar"]);

/**
 * Incerteza, em metros, de um resultado de busca de endereço (Nominatim), ou null quando ele
 * contradiz o que foi digitado, como "Quadra 38" devolvendo "Quadra 6D".
 */
export function geocodeUncertainty(result: { place_rank?: number; display_name?: string }, typed: string) {
  const rank = Number(result.place_rank) || 0;
  if (rank < 26) {
    const found = new Set(words(result.display_name ?? ""));
    const typedWords = words(typed);
    const contradicts = typedWords.some((word, index) => /\d/.test(word) && !UNIT_WORDS.has(typedWords[index - 1] ?? "") && !found.has(word));
    if (contradicts) return null;
  }
  // Nível do resultado: casa/ponto, rua, quadra/bairro pequeno, bairro ou setor, cidade.
  return rank >= 30 ? 50 : rank >= 26 ? 150 : rank >= 22 ? 200 : rank >= 17 ? 1500 : 5000;
}
