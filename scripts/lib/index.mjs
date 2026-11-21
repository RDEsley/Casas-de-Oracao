import { readFile, readdir, writeFile } from "node:fs/promises";

const DATA_DIR = new URL("../../data/churches/", import.meta.url);

/** data/churches/index.json: resumo por estado (quantidade, cidades, caixa geográfica) usado pela busca. */
export async function rebuildIndex() {
  const states = {};
  const prefixes = {};
  let total = 0;
  let updatedAt = "";
  for (const file of (await readdir(DATA_DIR)).filter((name) => /^[A-Z]{2}\.json$/.test(name)).sort()) {
    const data = JSON.parse(await readFile(new URL(file, DATA_DIR), "utf8"));
    const located = data.churches.filter((church) => Number.isFinite(church.latitude));
    const lats = located.map((church) => church.latitude);
    const lngs = located.map((church) => church.longitude);
    const cities = {};
    for (const church of data.churches) cities[church.city] = (cities[church.city] ?? 0) + 1;
    states[data.state] = {
      count: data.churches.length,
      verified: data.churches.filter((church) => church.coordinateStatus === "verified").length,
      updatedAt: data.updatedAt,
      bounds: located.length ? { south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lngs), east: Math.max(...lngs) } : null,
      cities,
    };
    for (const church of data.churches) {
      const prefix = church.id.slice(0, 5);
      if (!(prefixes[prefix] ??= []).includes(data.state)) prefixes[prefix].push(data.state);
    }
    total += data.churches.length;
    if (data.updatedAt > updatedAt) updatedAt = data.updatedAt;
  }
  await writeFile(new URL("index.json", DATA_DIR), `${JSON.stringify({ updatedAt, total, prefixes, states })}\n`);
  return { total, states };
}
