// Valida a base nacional em data/churches/: escopo, fonte oficial, agenda e, principalmente,
// as coordenadas (quem tem posição "verified" vira destino de rota, então o rigor é máximo).
//   node scripts/validate-data.mjs              validação local
//   node scripts/validate-data.mjs --network    também testa uma amostra dos links do Waze e do Google Maps
import { readFile, readdir } from "node:fs/promises";
import { STATES } from "./lib/states.mjs";

const DATA_DIR = new URL("../data/churches/", import.meta.url);
const ALLOWED_DAYS = new Set(["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]);
const SERVICE_TYPES = new Set(["Culto oficial", "Reunião de jovens e menores"]);
const COORDINATE_SOURCES = {
  verified: ["cnefe-temple"],
  approximate: ["cnefe-address", "cnefe-postal-code"],
};
// Caixa geográfica aproximada de cada estado (sul, norte, oeste, leste); uma posição fora dela é erro de correspondência.
const BOUNDS = {
  AC: [-11.2, -7.1, -74.1, -66.6], AL: [-10.6, -8.7, -38.3, -35.1], AP: [-1.3, 4.5, -54.9, -49.8], AM: [-9.9, 2.3, -73.9, -56.0],
  BA: [-18.4, -8.5, -46.7, -37.3], CE: [-7.9, -2.7, -41.5, -37.2], DF: [-16.1, -15.4, -48.3, -47.2], ES: [-21.4, -17.8, -41.9, -39.6],
  GO: [-19.6, -12.3, -53.3, -45.8], MA: [-10.3, -1.0, -48.8, -41.7], MT: [-17.9, -7.3, -61.7, -50.1], MS: [-24.1, -17.1, -58.2, -50.9],
  MG: [-22.95, -14.2, -51.1, -39.8], PA: [-9.9, 2.7, -58.9, -46.0], PB: [-8.4, -6.0, -38.8, -34.7], PR: [-26.8, -22.4, -54.7, -48.0],
  PE: [-9.6, -7.2, -41.4, -34.8], PI: [-10.95, -2.7, -45.99, -40.3], RJ: [-23.4, -20.7, -44.9, -40.9], RN: [-6.99, -4.8, -38.7, -34.9],
  RS: [-33.8, -27.0, -57.7, -49.6], RO: [-13.8, -7.9, -66.9, -59.7], RR: [-1.6, 5.3, -64.9, -58.8], SC: [-29.4, -25.9, -53.9, -48.3],
  SP: [-25.4, -19.7, -53.2, -44.1], SE: [-11.6, -9.5, -38.3, -36.3], TO: [-13.5, -5.1, -50.8, -45.6],
};
// Ilhas oceânicas que pertencem ao estado mas ficam fora da caixa principal.
const ISLANDS = { PE: [[-3.95, -3.7, -32.6, -32.3]] };
const TOLERANCE = 0.15;

const errors = [];
const fail = (id, message) => errors.push(`${id}: ${message}`);
const ids = new Set();
const points = new Map();
const verifiedChurches = [];
let total = 0;

const files = new Set((await readdir(DATA_DIR)).filter((name) => /^[A-Z]{2}\.json$/.test(name)));
for (const state of STATES) {
  if (!files.has(`${state.uf}.json`)) { fail(state.uf, "arquivo do estado ausente"); continue; }
  const data = JSON.parse(await readFile(new URL(`${state.uf}.json`, DATA_DIR), "utf8"));
  if (data.state !== state.uf || data.count !== data.churches.length) fail(state.uf, "cabeçalho do arquivo inconsistente");
  if (!data.churches.length) fail(state.uf, "estado sem casas de oração");
  const boxes = [BOUNDS[state.uf], ...(ISLANDS[state.uf] ?? [])];
  const inside = (church) => boxes.some(([south, north, west, east]) => church.latitude >= south - TOLERANCE && church.latitude <= north + TOLERANCE && church.longitude >= west - TOLERANCE && church.longitude <= east + TOLERANCE);

  for (const church of data.churches) {
    total += 1;
    if (ids.has(church.id)) fail(church.id, "código duplicado");
    ids.add(church.id);
    if (!/^BR-\d{2}-\d{4}$/.test(church.id)) fail(church.id, "código fora do padrão");
    if (!Number.isInteger(church.officialId)) fail(church.id, "identificador oficial ausente");
    if (church.state !== state.uf) fail(church.id, `estado ${church.state} em arquivo de ${state.uf}`);
    if (!church.name || !church.city || !church.address) fail(church.id, "nome, cidade ou endereço ausente");
    if (!church.officialVerification) fail(church.id, "data de conferência ausente");
    if (!church.services?.length || church.services.some((service) => !ALLOWED_DAYS.has(service.day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(service.time) || !SERVICE_TYPES.has(service.type))) fail(church.id, "agenda inválida");

    if (church.coordinateStatus in COORDINATE_SOURCES) {
      if (!Number.isFinite(church.latitude) || !Number.isFinite(church.longitude)) fail(church.id, "coordenadas ausentes");
      if (!inside(church)) fail(church.id, `coordenadas fora de ${state.uf}`);
      if (!COORDINATE_SOURCES[church.coordinateStatus].includes(church.coordinateSource)) fail(church.id, "origem da coordenada incompatível com o status");
      if (!church.cnefeId) fail(church.id, "registro do CNEFE de origem ausente");
      // Coordenada repetida era o sintoma da base antiga: geocodificação caindo no centro do bairro.
      const point = `${church.latitude},${church.longitude}`;
      if (points.has(point)) fail(church.id, `coordenada repetida em ${points.get(point)}`);
      points.set(point, church.id);
      if (church.coordinateStatus === "verified") verifiedChurches.push(church);
    } else if (church.coordinateStatus !== "unavailable" || church.latitude !== null || church.longitude !== null || church.coordinateSource !== null || church.cnefeId) {
      fail(church.id, "estado de coordenadas inválido");
    }
  }
}

const index = JSON.parse(await readFile(new URL("index.json", DATA_DIR), "utf8").catch(() => "null"));
if (!index || index.total !== total) fail("BASE", `index.json desatualizado (${index?.total ?? "ausente"} ≠ ${total}); rode a atualização ou o geocode`);
if (errors.length) throw new Error(`Validação reprovada (${errors.length}):\n${errors.slice(0, 60).join("\n")}${errors.length > 60 ? `\n… e mais ${errors.length - 60}` : ""}`);
console.log(`${total} casas em ${files.size} estados validadas: códigos, fonte oficial, agenda e coordenadas (${verifiedChurches.length} com rota confirmada).`);

if (process.argv.includes("--network")) {
  // Amostra aleatória: o objetivo é detectar mudança no formato dos links, não testar milhares de destinos.
  const sample = verifiedChurches.toSorted(() => Math.random() - 0.5).slice(0, 40);
  const links = sample.flatMap((church) => [
    { id: church.id, provider: "Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${church.latitude},${church.longitude}&travelmode=driving` },
    { id: church.id, provider: "Waze", url: `https://waze.com/ul?ll=${church.latitude},${church.longitude}&navigate=yes&zoom=17` },
  ]);
  const networkErrors = [];
  for (let index = 0; index < links.length; index += 8) {
    await Promise.all(links.slice(index, index + 8).map(async (link) => {
      try {
        const response = await fetch(link.url, { method: "HEAD", redirect: "manual" });
        if (response.status < 200 || response.status >= 400) networkErrors.push(`${link.id}: ${link.provider} respondeu ${response.status}`);
      } catch (error) {
        networkErrors.push(`${link.id}: ${link.provider} indisponível (${error instanceof Error ? error.message : "erro de rede"})`);
      }
    }));
  }
  if (networkErrors.length) throw new Error(`Links inacessíveis:\n${networkErrors.join("\n")}`);
  console.log(`${links.length} links de navegação responderam corretamente.`);
}
