// Lê o relatório oficial da Congregação Cristã no Brasil e grava uma base por estado em
// data/churches/<UF>.json. Retomável: o que já foi lido fica em .cache/official/.
//   node scripts/update-churches.mjs                 todos os estados
//   node scripts/update-churches.mjs --uf=DF,GO      só alguns
// Posições (latitude/longitude) NÃO vêm daqui: ver scripts/geocode-churches.mjs.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { STATES } from "./lib/states.mjs";
import { REPORT_URL, SERVICE_FILTER, createOfficialClient, hasNextPage, parseDetail, parseListing } from "./lib/official.mjs";
import { rebuildIndex } from "./lib/index.mjs";

const DATA_DIR = new URL("../data/churches/", import.meta.url);
const CACHE_DIR = new URL("../.cache/official/", import.meta.url);
const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1];
const wanted = arg("uf")?.toUpperCase().split(",");
const CONCURRENCY = Number(arg("concurrency") ?? 5);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = async (url, fallback) => JSON.parse(await readFile(url, "utf8").catch(() => "null")) ?? fallback;

async function pool(items, size, task) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) { await task(queue.shift()); await sleep(80); }
  }));
}

async function listCity(post, scope, city) {
  const body = { ...SERVICE_FILTER, codigoPais: scope.country, codigoEstado: scope.state, codigoCidade: city.Value };
  const records = new Map();
  let announced = 0;
  for (let page = 1; page <= 400; page += 1) {
    const html = await post("/service/servico-relatorio", { ...body, pagina: String(page) });
    const listing = parseListing(html);
    announced = listing.total || announced;
    listing.records.forEach((record) => records.set(record.id, record));
    if (!listing.records.length || !hasNextPage(html, page)) break;
  }
  // "Exibindo N de M" conta agendas (uma casa com dois tipos de culto vale duas), então M não é o total de casas.
  void announced;
  return [...records.values()];
}

function buildChurch(record, detail, previous) {
  if (detail.code !== record.id || !detail.name || !detail.city || !detail.services.length) {
    throw new Error(`${record.id}: detalhes oficiais incompletos ou divergentes: ${JSON.stringify(detail)}`);
  }
  const name = `${detail.name}${detail.isCentral ? " - Central" : ""}`;
  const address = `${detail.street || "Endereço não informado"}${detail.postalCode ? `, CEP ${detail.postalCode}` : ""}`;
  // A posição só vale para o endereço em que foi conferida.
  const keep = previous && previous.address === address && previous.name === name && Number.isFinite(previous.latitude);
  return {
    id: record.id,
    officialId: record.officialId,
    name,
    city: detail.city,
    state: detail.state,
    address,
    services: detail.services,
    latitude: keep ? previous.latitude : null,
    longitude: keep ? previous.longitude : null,
    coordinateStatus: keep ? previous.coordinateStatus : "unavailable",
    coordinateSource: keep ? previous.coordinateSource : null,
    ...(keep && previous.cnefeId ? { cnefeId: previous.cnefeId } : {}),
    ministry: detail.ministry,
    phones: detail.phones,
    officialVerification: new Date().toISOString().slice(0, 10),
  };
}

await mkdir(DATA_DIR, { recursive: true });
await mkdir(CACHE_DIR, { recursive: true });
const post = await createOfficialClient();
const country = JSON.parse(await post("/service/pais-relatorio", {})).list.find((item) => item.Text === "Brasil");
const officialStates = JSON.parse(await post("/service/estado-relatorio", { codigoPais: country.Value })).list;

for (const state of STATES) {
  if (wanted && !wanted.includes(state.uf)) continue;
  const official = officialStates.find((item) => item.Text === state.official);
  if (!official) throw new Error(`${state.uf}: estado não encontrado no relatório oficial.`);
  const cities = JSON.parse(await post("/service/cidade-relatorio", { codigoEstado: official.Value })).list.filter((item) => item.Value !== "0");
  const target = new URL(`${state.uf}.json`, DATA_DIR);
  const previousFile = await readJson(target, { churches: [] });
  const previousById = new Map(previousFile.churches.map((church) => [church.id, church]));
  const cachePath = new URL(`${state.uf}.json`, CACHE_DIR);
  const details = await readJson(cachePath, {});
  const records = new Map();
  const scope = { country: country.Value, state: official.Value };

  await pool(cities, CONCURRENCY, async (city) => {
    for (const record of await listCity(post, scope, city)) records.set(record.id, record);
  });
  process.stdout.write(`${state.uf}: ${records.size} casas listadas em ${cities.length} cidades.\n`);

  const pending = [...records.values()].filter((record) => !details[record.id]);
  let done = 0;
  await pool(pending, CONCURRENCY, async (record) => {
    details[record.id] = parseDetail(await post("/service/localidade-detalhe", { codigo: String(record.officialId) }));
    done += 1;
    if (done % 200 === 0) {
      await writeFile(cachePath, JSON.stringify(details));
      process.stdout.write(`  ${state.uf}: ${done}/${pending.length} detalhes lidos\n`);
    }
  });
  await writeFile(cachePath, JSON.stringify(details));

  // Casas que o relatório lista sem nenhum horário (só "Domingo - ") não entram: sem horário não há como filtrar nem orientar.
  const skipped = [];
  const complete = [...records.values()].filter((record) => {
    const detail = details[record.id];
    if (detail.services.length) return true;
    skipped.push({ id: record.id, name: detail.name, city: detail.city, reason: "sem horário informado no relatório oficial" });
    return false;
  });
  const churches = complete
    .map((record) => buildChurch(record, details[record.id], previousById.get(record.id)))
    .sort((a, b) => a.city.localeCompare(b.city, "pt-BR") || a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));
  const lines = churches.map((church) => `    ${JSON.stringify(church)}`).join(",\n");
  await writeFile(target, `{\n  "state": "${state.uf}",\n  "updatedAt": "${new Date().toISOString().slice(0, 10)}",\n  "count": ${churches.length},\n  "skipped": ${JSON.stringify(skipped)},\n  "churches": [\n${lines}\n  ]\n}\n`);
  process.stdout.write(`${state.uf}: ${churches.length} casas gravadas${skipped.length ? ` (${skipped.length} sem horário, ignoradas)` : ""}.\n`);
}

await rebuildIndex();
console.log(`Concluído. Fonte: ${REPORT_URL}`);
