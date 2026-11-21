// Auditoria por amostragem das posições "verified": consulta o OpenStreetMap (Nominatim) numa caixa de ~280 m em volta de cada casa
// sorteada e indica se o mapa também registra a Congregação Cristã ali.
// É um indício independente do IBGE, não uma prova: o OSM não conhece todos os templos.
//   node scripts/audit-positions.mjs [--n=40] [--uf=DF]
import { readFile, readdir } from "node:fs/promises";

const DATA_DIR = new URL("../data/churches/", import.meta.url);
const arg = (name, fallback) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const SAMPLE = Number(arg("n", 40));
const onlyUf = arg("uf", "").toUpperCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const verified = [];
for (const file of (await readdir(DATA_DIR)).filter((name) => /^[A-Z]{2}\.json$/.test(name))) {
  if (onlyUf && file !== `${onlyUf}.json`) continue;
  const data = JSON.parse(await readFile(new URL(file, DATA_DIR), "utf8"));
  verified.push(...data.churches.filter((church) => church.coordinateStatus === "verified"));
}
const sample = verified.toSorted(() => Math.random() - 0.5).slice(0, SAMPLE);

const counts = { "confirma (OSM tem a CCB aqui)": 0, "OSM sem registro da CCB aqui": 0, erro: 0 };
const BOX = 0.0025; // ≈ 280 m
const distanceMeters = (a, b) => 111_320 * Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180));
for (const church of sample) {
  const viewbox = [church.longitude - BOX, church.latitude + BOX, church.longitude + BOX, church.latitude - BOX].join(",");
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: "jsonv2", q: "Congregação Cristã no Brasil", viewbox, bounded: "1", limit: "5", namedetails: "1" })}`;
  let verdict = "erro";
  let found = "";
  try {
    const response = await fetch(url, { headers: { "User-Agent": "casas-de-oracao-audit/1.0" } });
    if (response.ok) {
      const results = (await response.json()).filter((item) => /Congrega[cç][aã]o\s+Crist|\bCCB\b/i.test(Object.values(item.namedetails ?? {}).join(" ") + item.display_name));
      const nearest = results.map((item) => ({ item, meters: distanceMeters({ lat: church.latitude, lon: church.longitude }, { lat: Number(item.lat), lon: Number(item.lon) }) })).sort((x, y) => x.meters - y.meters)[0];
      verdict = nearest ? "confirma (OSM tem a CCB aqui)" : "OSM sem registro da CCB aqui";
      found = nearest ? `a ${Math.round(nearest.meters)} m: ${nearest.item.display_name.split(",").slice(0, 2).join(",")}` : "";
    }
  } catch { /* contabilizado como erro */ }
  counts[verdict] += 1;
  console.log(`${verdict.padEnd(31)} ${church.id} ${church.name} (${church.city}/${church.state}) @ ${church.latitude},${church.longitude} ${found}`);
  await sleep(1100); // limite público do Nominatim: 1 consulta por segundo
}
console.log(`\nAmostra de ${sample.length}:`, counts);
