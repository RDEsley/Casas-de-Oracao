import { NextResponse } from "next/server";
import { findChurches, searchChurches } from "../../../lib/server/church-data";
import { isDay, isPeriod } from "../../../lib/schedule";
import { isUf } from "../../../lib/states";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 48;
const MAX_IDS = 150;
const json = (body: unknown, status = 200, cache = "no-store") =>
  NextResponse.json(body, { status, headers: { "Cache-Control": cache } });

const number = (value: string | null, minimum: number, maximum: number) => {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const ids = params.get("ids");
  if (ids !== null) {
    const list = ids.split(",").map((id) => id.trim()).filter(Boolean);
    if (list.length > MAX_IDS || !list.every((id) => /^BR-\d{2}-\d{4}$/.test(id))) return json({ error: "Lista de casas inválida." }, 400);
    return json({ churches: await findChurches(list) });
  }

  const day = params.get("day") ?? "";
  const period = params.get("period") ?? "Todos";
  const latitude = number(params.get("lat"), -90, 90);
  const longitude = number(params.get("lng"), -180, 180);
  const uf = params.get("uf") ?? "";
  const limit = number(params.get("limit"), 1, MAX_LIMIT) ?? 12;
  const offset = number(params.get("offset"), 0, 100_000) ?? 0;
  const query = (params.get("q") ?? "").slice(0, 80);
  const city = (params.get("city") ?? "").slice(0, 80);

  if (!isDay(day) || !isPeriod(period) || latitude === null || longitude === null || limit === null || offset === null
    || (latitude === undefined) !== (longitude === undefined) || (uf && !isUf(uf))) {
    return json({ error: "Parâmetros inválidos." }, 400);
  }
  if (latitude === undefined && !uf) return json({ error: "Informe a localização ou o estado." }, 400);

  try {
    const result = await searchChurches({
      origin: latitude === undefined || longitude === undefined ? undefined : { latitude, longitude },
      uf: uf || undefined,
      city: city || undefined,
      query,
      day,
      period,
      limit,
      offset,
    });
    return json(result);
  } catch (error) {
    console.error("[api/churches]", error);
    return json({ error: "Não foi possível consultar as casas de oração agora." }, 500);
  }
}
