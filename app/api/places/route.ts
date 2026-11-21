import { NextResponse } from "next/server";
import { loadIndex } from "../../../lib/server/church-data";

/** Estados com casas na base e, para cada um, as cidades (com a quantidade de casas). */
export async function GET() {
  try {
    const index = await loadIndex();
    const states = Object.fromEntries(Object.entries(index.states).map(([uf, state]) => [uf, { count: state.count, cities: state.cities }]));
    return NextResponse.json(
      { updatedAt: index.updatedAt, total: index.total, states },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    console.error("[api/places]", error);
    return NextResponse.json({ error: "Base indisponível." }, { status: 500 });
  }
}
