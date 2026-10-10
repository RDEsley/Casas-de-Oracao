import { NextResponse } from "next/server";

type Coordinate = {
  latitude: number;
  longitude: number;
};

type Destination = Coordinate & {
  id: string;
};

// Servidores compatíveis com a API "table" do OSRM, consultados em ordem.
const ROUTING_URLS = [
  "https://router.project-osrm.org/table/v1/driving",
  "https://routing.openstreetmap.de/routed-car/table/v1/driving",
];
const BATCH_SIZE = 45;
const MAX_DESTINATIONS = 200;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const isCoordinate = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

const isValidPoint = (point: unknown): point is Coordinate => {
  if (!point || typeof point !== "object") return false;
  const candidate = point as Partial<Coordinate>;
  return isCoordinate(candidate.latitude, -90, 90) && isCoordinate(candidate.longitude, -180, 180);
};

const isValidDestination = (point: unknown): point is Destination => {
  if (!isValidPoint(point)) return false;
  const candidate = point as Partial<Destination>;
  return typeof candidate.id === "string" && candidate.id.length > 0 && candidate.id.length <= 64;
};

async function fetchBatch(baseUrl: string, origin: Coordinate, batch: Destination[]) {
  const coordinates = [origin, ...batch]
    .map(({ longitude, latitude }) => `${longitude},${latitude}`)
    .join(";");
  const response = await fetch(`${baseUrl}/${coordinates}?sources=0&annotations=distance`, {
    cache: "no-store",
    headers: { "User-Agent": "Relatorio-CCB-Brasilia/1.0" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Serviço de rotas respondeu ${response.status}`);

  const result = await response.json() as { code?: string; distances?: Array<Array<number | null>> };
  const row = result.distances?.[0];
  if (result.code !== "Ok" || !row) throw new Error("Resposta inválida do serviço de rotas");

  return batch.flatMap((destination, index) => {
    const distanceInMeters = row[index + 1];
    return typeof distanceInMeters === "number" && Number.isFinite(distanceInMeters)
      ? [[destination.id, distanceInMeters / 1000] as const]
      : [];
  });
}

async function fetchDistances(baseUrl: string, origin: Coordinate, destinations: Destination[]) {
  const batches: Destination[][] = [];
  for (let index = 0; index < destinations.length; index += BATCH_SIZE) {
    batches.push(destinations.slice(index, index + BATCH_SIZE));
  }
  const entries = await Promise.all(batches.map((batch) => fetchBatch(baseUrl, origin, batch)));
  return Object.fromEntries(entries.flat());
}

export async function POST(request: Request) {
  let body: { origin?: unknown; destinations?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }

  if (!isValidPoint(body.origin) || !Array.isArray(body.destinations)) {
    return json({ error: "Localização ou destinos inválidos." }, 400);
  }

  if (body.destinations.length > MAX_DESTINATIONS || !body.destinations.every(isValidDestination)) {
    return json({ error: "Lista de destinos inválida." }, 400);
  }

  for (const baseUrl of ROUTING_URLS) {
    try {
      return json({ distances: await fetchDistances(baseUrl, body.origin, body.destinations as Destination[]) });
    } catch (error) {
      console.error(`[api/distances] Falha em ${new URL(baseUrl).hostname}`, error);
    }
  }

  return json({ error: "Não foi possível calcular as distâncias agora." }, 502);
}
