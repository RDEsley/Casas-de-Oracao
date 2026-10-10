// Posiciona cada casa de oração a partir do CNEFE (Cadastro Nacional de Endereços
// para Fins Estatísticos, IBGE, Censo 2022): endereços com GPS coletado no local e
// o nome do estabelecimento. Uma coordenada só é "verified" quando o IBGE registrou
// um templo da Congregação no mesmo endereço do relatório oficial da CCB.
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInflateRaw } from "node:zlib";

const CNEFE_URL = "https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV";
const SOURCES = [
  { file: "53_DF.zip", url: `${CNEFE_URL}/UF/53_DF.zip` },
  { file: "5200258_AGUAS_LINDAS_DE_GOIAS.zip", url: `${CNEFE_URL}/Municipio/52_GO/5200258_AGUAS_LINDAS_DE_GOIAS.zip` },
];
const CACHE_DIR = new URL("../.cache/cnefe/", import.meta.url);
const DATA_URL = new URL("../data/churches.json", import.meta.url);
const OVERRIDES_URL = new URL("../data/coordinate-overrides.json", import.meta.url);
const VERBOSE = process.argv.includes("--verbose");

// Colunas do CSV do CNEFE (separador ";").
const COLUMN = { id: 0, cep: 8, locality: 9, streetStart: 10, streetEnd: 13, number: 13, complementStart: 15, complementEnd: 25, latitude: 25, longitude: 26, precision: 27, name: 29 };
const ROMAN = { I: "1", II: "2", III: "3", IV: "4", V: "5", VI: "6", VII: "7", VIII: "8", IX: "9", X: "10" };
const GENERIC_WORDS = new Set([
  "QUADRA", "CONJUNTO", "LOTE", "LOTES", "CASA", "LOJA", "SETOR", "AREA", "ESPECIAL", "CENTRAL", "RUA", "AVENIDA", "RODOVIA",
  "ESTRADA", "CHACARA", "CONDOMINIO", "NUCLEO", "RURAL", "JARDIM", "VILA", "RESIDENCIAL", "HABITACIONAL", "MODULO", "MODULOS",
  "BLOCO", "NORTE", "SUL", "LESTE", "OESTE", "ENDERECO", "INFORMADO", "ETAPA", "COLONIA", "AGRICOLA", "PARQUE", "MANSOES",
]);

function tokenize(text) {
  return text
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/(\d)\s*-\s*([A-Z])\b/g, "$1$2")
    .replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean)
    .map((token) => ROMAN[token] ?? token.replace(/^0+(?=\d)/, ""));
}

const isIdentifier = (token) => /\d/.test(token) || /^[A-Z]$/.test(token);

// Os recenseadores digitaram o nome livremente ("CONGREGASSAO CRISTA", "CCB"...).
function isCongregationRecord(name, complement) {
  if (/BATISTA|ASSEMBLEIA|IRMAS|CONGREGACIONAL|ESPIRITA|ISRAEL|PENTECOSTAL|RELIGIOSAS|TENDA|MINISTERIO/.test(name)) return false;
  return (/CRIST/.test(name) && /CONG|CONCRE|COGRE/.test(name))
    || /^(IGREJA )?CONGREGACAO( NO)?( BRASIL)?$/.test(name)
    || /\bCCB\b/.test(complement);
}

function distanceMeters(a, b) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(h));
}

async function ensureDownloaded({ file, url }) {
  const target = new URL(file, CACHE_DIR);
  try {
    if ((await stat(target)).size > 0) return target;
  } catch { /* ainda não baixado */ }
  process.stdout.write(`Baixando ${file} do IBGE...\n`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`IBGE respondeu ${response.status} para ${file}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
  return target;
}

/** Abre a única entrada (CSV) de um zip do CNEFE como stream de texto. */
async function openZipEntry(zipUrl) {
  const handle = await open(zipUrl, "r");
  try {
    const { size } = await handle.stat();
    const tailLength = Math.min(size, 66_000);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) throw new Error("zip sem diretório central");
    const directoryOffset = tail.readUInt32LE(end + 16);
    const directory = Buffer.alloc(46);
    await handle.read(directory, 0, 46, directoryOffset);
    if (directory.readUInt32LE(0) !== 0x02014b50 || directory.readUInt16LE(10) !== 8) throw new Error("zip em formato inesperado");
    const compressedSize = directory.readUInt32LE(20);
    const headerOffset = directory.readUInt32LE(42);
    const header = Buffer.alloc(30);
    await handle.read(header, 0, 30, headerOffset);
    const start = headerOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    return createReadStream(zipUrl, { start, end: start + compressedSize - 1 }).pipe(createInflateRaw());
  } finally {
    await handle.close();
  }
}

/** Lê somente os endereços úteis: templos da Congregação e CEPs das casas de oração. */
async function loadAddresses(postalCodes, keepIds) {
  await mkdir(CACHE_DIR, { recursive: true });
  const records = [];
  for (const source of SOURCES) {
    const lines = createInterface({ input: await openZipEntry(await ensureDownloaded(source)), crlfDelay: Infinity });
    for await (const line of lines) {
      const columns = line.split(";");
      if (columns[COLUMN.precision] !== "1") continue; // só coordenada coletada no próprio endereço
      const name = columns[COLUMN.name] ?? "";
      const complement = columns.slice(COLUMN.complementStart, COLUMN.complementEnd).filter(Boolean).join(" ");
      const temple = isCongregationRecord(name, complement);
      if (!temple && !postalCodes.has(columns[COLUMN.cep]) && !keepIds.has(columns[COLUMN.id])) continue;
      const latitude = Number(columns[COLUMN.latitude]);
      const longitude = Number(columns[COLUMN.longitude]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const street = columns.slice(COLUMN.streetStart, COLUMN.streetEnd).filter(Boolean).join(" ");
      const number = columns[COLUMN.number] === "0" ? "" : columns[COLUMN.number];
      records.push({
        id: columns[COLUMN.id],
        postalCode: columns[COLUMN.cep],
        text: `${columns[COLUMN.locality]} | ${street} ${number} | ${complement}${name ? ` | ${name}` : ""}`,
        name,
        tokens: new Set(tokenize(`${columns[COLUMN.locality]} ${street} ${number} ${complement}`)),
        pairs: addressPairs(`${columns[COLUMN.locality]} | ${street} ${number} | ${complement}`),
        latitude,
        longitude,
        temple,
      });
    }
  }
  return records;
}

const LABELS = {
  Q: "QUADRA", QD: "QUADRA", CJ: "CONJUNTO", CONJ: "CONJUNTO", LT: "LOTE", LOTES: "LOTE", CASA: "LOTE",
  MOD: "MODULO", MODULOS: "MODULO", CH: "CHACARA", CHAC: "CHACARA", BL: "BLOCO", R: "RUA",
};
const UNIT_LABELS = new Set(["LOTE", "CHACARA"]);
const GENERIC_POSTAL_CODE = /(899|99\d)$/;

/** "Quadra 38 - Conjunto B - Lote 12" → ["QUADRA:38", "CONJUNTO:B", "LOTE:12"] */
function addressPairs(text) {
  const tokens = tokenize(text);
  const pairs = [];
  for (let index = 1; index < tokens.length; index += 1) {
    if (isIdentifier(tokens[index]) && !isIdentifier(tokens[index - 1])) {
      pairs.push({ label: LABELS[tokens[index - 1]] ?? tokens[index - 1], value: tokens[index] });
    }
  }
  return pairs;
}

// Lote "4" e lote "4A" são o mesmo terreno; quadras e conjuntos precisam bater por inteiro.
const samePair = (wanted, found) => wanted.label === found.label && (wanted.value === found.value
  || (UNIT_LABELS.has(wanted.label) && /^\d+$/.test(wanted.value) && found.value.replace(/[A-Z]$/, "") === wanted.value));

const pairHits = (wanted, record) => wanted.filter((pair) => record.pairs.some((found) => samePair(pair, found))).length;
const wordHits = (wanted, record) => wanted.filter((word) => record.tokens.has(word)).length;

function describeChurch(church) {
  const postalCode = church.address.match(/CEP (\d{5})-(\d{3})/)?.slice(1).join("") ?? "";
  const street = church.address.replace(/,? ?CEP.*$/, "").replace("Endereço não informado", "");
  const streetPairs = addressPairs(street);
  return {
    postalCode,
    // Em várias casas a quadra está no nome ("QN 210") e só o conjunto/lote no logradouro.
    pairs: streetPairs.length >= 3 ? streetPairs : [...addressPairs(church.name.replace(/ - Central$/, "")), ...streetPairs],
    words: [...new Set(tokenize(`${church.name} ${street}`).filter((token) => token.length >= 5 && !isIdentifier(token) && !GENERIC_WORDS.has(token)))],
  };
}

function pickUnique(candidates, score) {
  if (!candidates.length) return null;
  const ranked = candidates.toSorted((a, b) => score(b) - score(a));
  const ambiguous = ranked.slice(1).some((other) => score(other) === score(ranked[0]) && distanceMeters(other, ranked[0]) > 250);
  return ambiguous ? null : ranked[0];
}

/**
 * Templo registrado pelo IBGE que corresponde ao endereço oficial: mesmo CEP, ou mesma
 * região postal com toda a numeração (quadra/conjunto/lote) ou o nome da localidade batendo.
 */
function matchTemple(church, temples) {
  const { postalCode, pairs, words } = describeChurch(church);
  const score = (record) => pairHits(pairs, record) + wordHits(words, record);

  // CEPs genéricos (área rural) ou repetidos entre casas não identificam o endereço sozinhos.
  const distinctiveCode = !GENERIC_POSTAL_CODE.test(postalCode) && sharedPostalCodes.get(postalCode) === 1;
  const sameCode = pickUnique(temples.filter((record) => record.postalCode === postalCode
    && (distinctiveCode || wordHits(words, record) >= 1 || (pairs.length >= 2 && pairHits(pairs, record) === pairs.length))), score);
  if (sameCode) return { record: sameCode, rule: "templo no mesmo CEP" };

  const sameRegion = temples.filter((record) => record.postalCode.slice(0, 3) === postalCode.slice(0, 3));
  const byNumbering = pickUnique(sameRegion.filter((record) => pairs.length >= 2 && pairHits(pairs, record) === pairs.length), score);
  if (byNumbering) return { record: byNumbering, rule: "templo com a mesma numeração" };

  const byName = pickUnique(sameRegion.filter((record) => words.length >= 1 && wordHits(words, record) === words.length && pairHits(pairs, record) === pairs.length), score);
  return byName ? { record: byName, rule: "templo com o mesmo nome de localidade" } : null;
}

/** Sem templo registrado: ponto do próprio endereço oficial (mesmo CEP e mesma numeração). */
function matchAddress(church, addresses) {
  const { postalCode, pairs } = describeChurch(church);
  if (!postalCode || GENERIC_POSTAL_CODE.test(postalCode) || pairs.length < 2) return null;
  const sameCode = addresses.filter((record) => record.postalCode === postalCode);
  const exact = sameCode.filter((record) => pairHits(pairs, record) === pairs.length);
  if (!exact.length || !exact.every((record) => distanceMeters(record, exact[0]) < 150)) {
    // Último recurso: CEP que cobre um trecho curto (um conjunto ou uma rua) vale pelo seu ponto central.
    const middle = sameCode.toSorted((a, b) => a.latitude - b.latitude)[Math.floor(sameCode.length / 2)];
    return sameCode.length >= 5 && sameCode.every((record) => distanceMeters(record, middle) < 300)
      ? { record: middle, rule: "centro do CEP", status: "approximate", source: "cnefe-postal-code" }
      : null;
  }
  // Templo anotado com outro nome ("IGREJA EVANGELICA", "COGRESSAO CRISTA") no endereço exato também confirma o ponto.
  const temple = exact.find((record) => /IGREJA|CRIST|ORACAO|TEMPLO/.test(record.name));
  return temple
    ? { record: temple, rule: "templo no endereço oficial", status: "verified", source: "cnefe-temple" }
    : { record: exact[0], rule: "endereço com o mesmo CEP e numeração", status: "approximate", source: "cnefe-address" };
}

const data = JSON.parse(await readFile(DATA_URL, "utf8"));
const overrides = JSON.parse(await readFile(OVERRIDES_URL, "utf8").catch(() => "{}"));
const addresses = await loadAddresses(
  new Set(data.churches.map((church) => describeChurch(church).postalCode).filter(Boolean)),
  new Set(Object.values(overrides).map((override) => String(override.cnefe ?? ""))),
);
const temples = addresses.filter((record) => record.temple);
const sharedPostalCodes = new Map();
for (const church of data.churches) {
  const { postalCode } = describeChurch(church);
  sharedPostalCodes.set(postalCode, (sharedPostalCodes.get(postalCode) ?? 0) + 1);
}
const byId = new Map(addresses.map((record) => [record.id, record]));
const report = { verified: [], approximate: [], unavailable: [] };

/** Conferência manual em data/coordinate-overrides.json: aponta um registro do CNEFE ou veta a posição. */
function applyOverride(church, override) {
  if (override.status === "unavailable") return null;
  const record = byId.get(String(override.cnefe));
  if (!record) throw new Error(`${church.id}: registro CNEFE ${override.cnefe} do override não encontrado`);
  const status = override.status ?? "verified";
  return { record, rule: `conferência manual — ${override.note}`, status, source: status === "verified" ? "cnefe-temple" : "cnefe-address" };
}

for (const church of data.churches) {
  const override = overrides[church.id];
  const temple = override ? null : matchTemple(church, temples);
  const resolved = override
    ? applyOverride(church, override)
    : temple ? { ...temple, status: "verified", source: "cnefe-temple" } : matchAddress(church, addresses);

  church.latitude = resolved?.record.latitude ?? null;
  church.longitude = resolved?.record.longitude ?? null;
  church.coordinateStatus = resolved?.status ?? "unavailable";
  church.coordinateSource = resolved?.source ?? null;
  const detail = resolved
    ? `\n      ${resolved.rule}: #${resolved.record.id} ${resolved.record.text} @ ${church.latitude},${church.longitude}`
    : override ? `\n      vetada na conferência manual — ${override.note}` : "";
  report[church.coordinateStatus].push(`${church.id} ${church.name} (${church.city}) — ${church.address}${detail}`);
}

// Duas casas no mesmo ponto indicam correspondência errada: nenhuma delas é usada.
const byPoint = Map.groupBy(data.churches.filter((church) => church.latitude !== null), (church) => `${church.latitude},${church.longitude}`);
for (const group of byPoint.values()) {
  if (group.length > 1) throw new Error(`Mesma coordenada para ${group.map((church) => church.id).join(", ")}; corrija em data/coordinate-overrides.json`);
}

if (process.argv.includes("--candidates")) {
  // Apoio à conferência manual: templos ainda não atribuídos mais parecidos com cada casa pendente.
  const used = new Set(data.churches.map((church) => `${church.latitude},${church.longitude}`));
  for (const church of data.churches.filter((item) => item.coordinateStatus !== "verified")) {
    const { postalCode, pairs, words } = describeChurch(church);
    console.log(`\n${church.id} ${church.name} (${church.city}) — ${church.address} [${church.coordinateStatus}]`);
    temples
      .filter((record) => !used.has(`${record.latitude},${record.longitude}`))
      .map((record) => ({ record, score: pairHits(pairs, record) + 2 * wordHits(words, record) + (record.postalCode.slice(0, 5) === postalCode.slice(0, 5) ? 2 : record.postalCode.slice(0, 3) === postalCode.slice(0, 3) ? 1 : 0) }))
      .filter(({ score }) => score >= 2)
      .toSorted((a, b) => b.score - a.score).slice(0, 4)
      .forEach(({ record, score }) => console.log(`   ${score} #${record.id} ${record.postalCode} ${record.text} @ ${record.latitude},${record.longitude}`));
  }
}

await writeFile(DATA_URL, `${JSON.stringify(data, null, 2)}\n`);
for (const [status, lines] of Object.entries(report)) {
  console.log(`\n${status}: ${lines.length}`);
  if (VERBOSE || status !== "verified") lines.forEach((line) => console.log(`  - ${line}`));
}
