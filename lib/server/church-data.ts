import { readFile } from "node:fs/promises";
import path from "node:path";
import { type ChurchItem, type LocatedChurch, type Service, hasCoordinates } from "../churches";
import { type Coordinate, straightLineKm } from "../geo";
import { type Period, normalizeSearch, periodFor } from "../schedule";
import { isUf } from "../states";

const DATA_DIR = path.join(process.cwd(), "data", "churches");

type StateIndex = {
  count: number;
  verified: number;
  updatedAt: string;
  bounds: { south: number; north: number; west: number; east: number } | null;
  cities: Record<string, number>;
};
export type DataIndex = { updatedAt: string; total: number; prefixes: Record<string, string[]>; states: Record<string, StateIndex> };

type StateData = { churches: ChurchItem[]; search: Map<string, string> };

const stateCache = new Map<string, Promise<StateData>>();
let indexCache: Promise<DataIndex> | null = null;

export const loadIndex = () => indexCache ??= readFile(path.join(DATA_DIR, "index.json"), "utf8")
  .then((text) => JSON.parse(text) as DataIndex)
  .catch((error) => { indexCache = null; throw error; });

export function loadState(uf: string) {
  if (!isUf(uf)) return Promise.resolve({ churches: [], search: new Map() } satisfies StateData);
  let pending = stateCache.get(uf);
  if (!pending) {
    pending = readFile(path.join(DATA_DIR, `${uf}.json`), "utf8").then((text) => {
      const churches = (JSON.parse(text) as { churches: ChurchItem[] }).churches;
      return { churches, search: new Map(churches.map((church) => [church.id, normalizeSearch(`${church.name} ${church.city} ${church.address}`)])) };
    });
    pending.catch(() => stateCache.delete(uf));
    stateCache.set(uf, pending);
  }
  return pending;
}

const distanceToBounds = (point: Coordinate, bounds: NonNullable<StateIndex["bounds"]>) => {
  const latitude = Math.min(Math.max(point.latitude, bounds.south), bounds.north);
  const longitude = Math.min(Math.max(point.longitude, bounds.west), bounds.east);
  return straightLineKm(point, { latitude, longitude });
};

/** Estados cuja área de casas fica a menos de `radiusKm` do ponto (ou, se nenhum, o mais próximo). */
export async function statesNear(point: Coordinate, radiusKm = 120) {
  const index = await loadIndex();
  const ranked = Object.entries(index.states)
    .filter(([, state]) => state.bounds)
    .map(([uf, state]) => ({ uf, distance: distanceToBounds(point, state.bounds!) }))
    .sort((a, b) => a.distance - b.distance);
  const near = ranked.filter((state) => state.distance <= radiusKm).map((state) => state.uf);
  return near.length ? near : ranked.slice(0, 1).map((state) => state.uf);
}

export type SearchParams = {
  origin?: Coordinate;
  uf?: string;
  city?: string;
  query?: string;
  day: string;
  period: Period;
  limit: number;
  offset: number;
};

export type SearchItem = { church: ChurchItem; distanceKm: number | null; matching: Service[] };

const matchesFilter = (service: Service, day: string, period: Period) =>
  service.day === day && (period === "Todos" || periodFor(service.time) === period);

export async function searchChurches(params: SearchParams) {
  const { origin, day, period } = params;
  const terms = normalizeSearch(params.query ?? "").split(/\s+/).filter(Boolean);
  const ufs = origin ? await statesNear(origin) : params.uf ? [params.uf] : [];
  const states = await Promise.all(ufs.map(loadState));

  const everyone = states.flatMap((state) => state.churches.map((church) => ({ church, text: state.search.get(church.id) ?? "" })))
    .filter(({ church, text }) => (!params.city || church.city === params.city) && terms.every((term) => text.includes(term)));

  const scored: SearchItem[] = everyone.map(({ church }) => ({
    church,
    matching: church.services.filter((service) => matchesFilter(service, day, period)),
    distanceKm: origin && hasCoordinates(church) ? straightLineKm(origin, church) : null,
  }));

  const matching = scored.filter((item) => item.matching.length > 0);
  const byDistance = (a: SearchItem, b: SearchItem) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    || a.church.city.localeCompare(b.church.city, "pt-BR") || a.church.name.localeCompare(b.church.name, "pt-BR");
  const located = matching.filter((item) => item.distanceKm !== null).sort(byDistance);
  const unlocated = matching.filter((item) => item.distanceKm === null).sort(byDistance);

  // Com ponto de saída, só casas com posição entram na ordem de distância; as sem posição
  // aparecem à parte (mesma cidade das mais próximas), nunca misturadas como se estivessem perto.
  const ranked = origin ? located : [...located, ...unlocated];
  const items = ranked.slice(params.offset, params.offset + params.limit);

  let unlocatedNearby: SearchItem[] = [];
  let others: Array<{ church: ChurchItem; distanceKm: number; days: string[] }> = [];
  if (origin) {
    const cities = new Set(located.slice(0, 5).map((item) => `${item.church.state}/${item.church.city}`));
    unlocatedNearby = unlocated.filter((item) => cities.has(`${item.church.state}/${item.church.city}`)).slice(0, 6);
    if (!terms.length) {
      const limit = located[2]?.distanceKm ?? Infinity;
      others = scored
        .filter((item): item is SearchItem & { distanceKm: number } => item.distanceKm !== null && !item.matching.length && item.distanceKm < limit)
        .sort(byDistance)
        .map((item) => ({
          church: item.church,
          distanceKm: item.distanceKm,
          days: [...new Set(item.church.services.filter((service) => period === "Todos" || periodFor(service.time) === period).map((service) => service.day))],
        }))
        .filter((item) => item.days.length > 0)
        .slice(0, 3);
    }
  }

  return { items, total: ranked.length, unlocatedNearby, others, states: ufs };
}

export async function findChurches(ids: string[]) {
  const index = await loadIndex();
  const wanted = new Set(ids);
  const ufs = new Set(ids.flatMap((id) => index.prefixes[id.slice(0, 5)] ?? []));
  const states = await Promise.all([...ufs].map(loadState));
  return states.flatMap((state) => state.churches.filter((church) => wanted.has(church.id)));
}

export type { LocatedChurch };
