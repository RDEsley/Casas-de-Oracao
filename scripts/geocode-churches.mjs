// Posiciona cada casa de oração a partir do CNEFE (Cadastro Nacional de Endereços
// para Fins Estatísticos, IBGE, Censo 2022): endereços com GPS coletado no local e
// o nome do estabelecimento. Uma coordenada só é "verified" quando o IBGE registrou
// um templo da Congregação no mesmo endereço (CEP e número) do relatório oficial da CCB.
// Nunca se geocodifica por texto: sem correspondência segura a casa fica "unavailable".
//   node scripts/geocode-churches.mjs                 todos os estados
//   node scripts/geocode-churches.mjs --uf=DF,GO      só alguns
//   --verbose  lista também as confirmadas      --candidates  sugere templos para conferência manual
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInflateRaw } from "node:zlib";
import { STATES } from "./lib/states.mjs";
import { rebuildIndex } from "./lib/index.mjs";

const CNEFE_URL = "https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/UF";
const CACHE_DIR = new URL("../.cache/cnefe/", import.meta.url);
const DATA_DIR = new URL("../data/churches/", import.meta.url);
const OVERRIDES_URL = new URL("../data/coordinate-overrides.json", import.meta.url);
const REPORT_DIR = new URL("../.cache/geocode-reports/", import.meta.url);
const VERBOSE = process.argv.includes("--verbose");
const CANDIDATES = process.argv.includes("--candidates");
const wanted = process.argv.find((item) => item.startsWith("--uf="))?.split("=")[1].toUpperCase().split(",");

// Colunas do CSV do CNEFE (separador ";").
const COLUMN = { id: 0, cep: 8, locality: 9, streetStart: 10, streetEnd: 13, number: 13, complementStart: 15, complementEnd: 25, latitude: 25, longitude: 26, precision: 27, name: 29 };
const ROMAN = { I: "1", II: "2", III: "3", IV: "4", V: "5", VI: "6", VII: "7", VIII: "8", IX: "9", X: "10" };
const GENERIC_WORDS = new Set([
  "QUADRA", "CONJUNTO", "LOTE", "LOTES", "CASA", "LOJA", "SETOR", "AREA", "ESPECIAL", "CENTRAL", "RUA", "AVENIDA", "RODOVIA",
  "ESTRADA", "CHACARA", "CONDOMINIO", "NUCLEO", "RURAL", "JARDIM", "VILA", "RESIDENCIAL", "HABITACIONAL", "MODULO", "MODULOS",
  "BLOCO", "NORTE", "SUL", "LESTE", "OESTE", "ENDERECO", "INFORMADO", "ETAPA", "COLONIA", "AGRICOLA", "PARQUE", "MANSOES",
  "CENTRO", "TRAVESSA", "ALAMEDA", "PRACA", "BAIRRO", "POVOADO", "DISTRITO", "SITIO", "FAZENDA", "LOTEAMENTO",
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
  if (/BATISTA|ASSEMBLEIA|IRMAS|CONGREGACIONAL|ESPIRITA|ISRAEL|PENTECOSTAL|RELIGIOSAS|TENDA|MINISTERIO|PRESBITERIAN|METODISTA|LUTERAN|ADVENTISTA|UNIVERSAL|DEUS E AMOR/.test(name)) return false;
  return (/CRIST/.test(name) && /CONG|CONCRE|COGRE/.test(name))
    || /^(IGREJA )?CONGREGACAO( NO)?( BRASIL)?$/.test(name)
    || /^(IGREJA )?(CCB|C C B)$/.test(name)
    || /\bCCB\b/.test(complement);
}

function distanceMeters(a, b) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(h));
}

async function ensureDownloaded(state) {
  const file = `${state.ibge}_${state.uf}.zip`;
  const target = new URL(file, CACHE_DIR);
  try {
    if ((await stat(target)).size > 0) return target;
  } catch { /* ainda não baixado */ }
  process.stdout.write(`Baixando ${file} do IBGE...\n`);
  const response = await fetch(`${CNEFE_URL}/${file}`);
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
    const uncompressedField = directory.readUInt32LE(24);
    let compressedSize = directory.readUInt32LE(20);
    let headerOffset = directory.readUInt32LE(42);
    if (uncompressedField === 0xffffffff || compressedSize === 0xffffffff || headerOffset === 0xffffffff) {
      // zip64 (arquivos grandes, como o de São Paulo): os valores extensos ficam no campo extra 0x0001, na ordem
      // tamanho original, tamanho compactado e posição do cabeçalho, só para os campos marcados com 0xFFFFFFFF.
      const extra = Buffer.alloc(directory.readUInt16LE(30));
      await handle.read(extra, 0, extra.length, directoryOffset + 46 + directory.readUInt16LE(28));
      let cursor = 0;
      let values;
      while (cursor + 4 <= extra.length) {
        const id = extra.readUInt16LE(cursor);
        const length = extra.readUInt16LE(cursor + 2);
        if (id === 1) { values = extra.subarray(cursor + 4, cursor + 4 + length); break; }
        cursor += 4 + length;
      }
      if (!values) throw new Error("zip64 sem campo extra");
      let position = 0;
      const next = () => { const value = Number(values.readBigUInt64LE(position)); position += 8; return value; };
      if (uncompressedField === 0xffffffff) next();
      if (compressedSize === 0xffffffff) compressedSize = next();
      if (headerOffset === 0xffffffff) headerOffset = next();
    }
    const header = Buffer.alloc(30);
    await handle.read(header, 0, 30, headerOffset);
    const start = headerOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    return createReadStream(zipUrl, { start, end: start + compressedSize - 1 }).pipe(createInflateRaw());
  } finally {
    await handle.close();
  }
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

/** Número do imóvel no endereço oficial ("Rua das Flores, 120 - Casa 2" → "120"); null em endereços por quadra/lote ou S/N. */
const houseNumberOf = (street) => /,\s*(\d{1,6})(?![\d/])/.exec(street)?.[1]?.replace(/^0+(?=\d)/, "") ?? null;
const digitsOf = (value) => String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");

function describeChurch(church) {
  const postalCode = church.address.match(/CEP (\d{5})-(\d{3})/)?.slice(1).join("") ?? "";
  const street = church.address.replace(/,? ?CEP.*$/, "").replace("Endereço não informado", "");
  const streetPairs = addressPairs(street);
  return {
    postalCode,
    houseNumber: houseNumberOf(street),
    // Em várias casas a quadra está no nome ("QN 210") e só o conjunto/lote no logradouro.
    pairs: streetPairs.length >= 3 ? streetPairs : [...addressPairs(church.name.replace(/ - Central$/, "")), ...streetPairs],
    words: [...new Set(tokenize(`${church.name} ${street}`).filter((token) => token.length >= 5 && !isIdentifier(token) && !GENERIC_WORDS.has(token)))],
  };
}

/** Lê somente os endereços úteis: templos da Congregação e CEPs das casas de oração. */
async function loadAddresses(state, wanted, keepIds) {
  const records = [];
  const perPostalCode = new Map();
  const lines = createInterface({ input: await openZipEntry(await ensureDownloaded(state)), crlfDelay: Infinity });
  for await (const line of lines) {
    const columns = line.split(";");
    if (columns[COLUMN.precision] !== "1") continue; // só coordenada coletada no próprio endereço
    const name = columns[COLUMN.name] ?? "";
    const complement = columns.slice(COLUMN.complementStart, COLUMN.complementEnd).filter(Boolean).join(" ");
    const temple = isCongregationRecord(name, complement);
    if (!temple && !keepIds.has(columns[COLUMN.id])) {
      // Endereços comuns só interessam no CEP de alguma casa e, se ela tem número, com esse número
      // (um CEP único de cidade pequena cobre milhares de endereços e estouraria a memória).
      const entry = wanted.get(columns[COLUMN.cep]);
      if (!entry || !(entry.open || entry.numbers.has(digitsOf(columns[COLUMN.number])))) continue;
      const kept = (perPostalCode.get(columns[COLUMN.cep]) ?? 0) + 1;
      perPostalCode.set(columns[COLUMN.cep], kept);
      if (kept > 2500) continue;
    }
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
      number: digitsOf(number),
      tokens: new Set(tokenize(`${columns[COLUMN.locality]} ${street} ${number} ${complement}`)),
      pairs: addressPairs(`${columns[COLUMN.locality]} | ${street} ${number} | ${complement}`),
      latitude,
      longitude,
      temple,
    });
  }
  return records;
}

function pickUnique(candidates, score) {
  if (!candidates.length) return null;
  const ranked = candidates.toSorted((a, b) => score(b) - score(a));
  const ambiguous = ranked.slice(1).some((other) => score(other) === score(ranked[0]) && distanceMeters(other, ranked[0]) > 250);
  return ambiguous ? null : ranked[0];
}

/** Com número de imóvel no endereço oficial, o registro do IBGE precisa ter o mesmo número. */
const sameHouse = (houseNumber, record) => !houseNumber || (record.number !== "" && record.number === houseNumber);

/**
 * Templo registrado pelo IBGE que corresponde ao endereço oficial: mesmo CEP, ou mesma
 * região postal com toda a numeração (quadra/conjunto/lote) ou o nome da localidade batendo.
 */
function matchTemple(church, temples, sharedPostalCodes) {
  const { postalCode, houseNumber, pairs, words } = describeChurch(church);
  const candidates = temples.filter((record) => sameHouse(houseNumber, record));
  const score = (record) => pairHits(pairs, record) + wordHits(words, record);

  // CEPs genéricos (área rural) ou repetidos entre casas não identificam o endereço sozinhos.
  const distinctiveCode = !GENERIC_POSTAL_CODE.test(postalCode) && sharedPostalCodes.get(postalCode) === 1;
  const sameCode = pickUnique(candidates.filter((record) => record.postalCode === postalCode
    && (distinctiveCode || wordHits(words, record) >= 1 || (pairs.length >= 2 && pairHits(pairs, record) === pairs.length))), score);
  if (sameCode) return { record: sameCode, rule: "templo no mesmo CEP" };

  const sameRegion = candidates.filter((record) => record.postalCode.slice(0, 3) === postalCode.slice(0, 3));
  const enoughPairs = pairs.length >= 2 || (houseNumber !== null && pairs.length >= 1);
  const byNumbering = pickUnique(sameRegion.filter((record) => enoughPairs && pairHits(pairs, record) === pairs.length), score);
  if (byNumbering) return { record: byNumbering, rule: "templo com a mesma numeração" };

  const byName = pickUnique(sameRegion.filter((record) => words.length >= 1 && wordHits(words, record) === words.length && pairHits(pairs, record) === pairs.length), score);
  return byName ? { record: byName, rule: "templo com o mesmo nome de localidade" } : null;
}

/** Sem templo registrado: ponto do próprio endereço oficial (mesmo CEP e mesma numeração). Só estimativa. */
function matchAddress(church, addresses) {
  const { postalCode, houseNumber, pairs } = describeChurch(church);
  if (!postalCode || GENERIC_POSTAL_CODE.test(postalCode) || (pairs.length < 2 && !houseNumber)) return null;
  const sameCode = addresses.filter((record) => record.postalCode === postalCode);
  const exact = sameCode.filter((record) => sameHouse(houseNumber, record) && pairHits(pairs, record) === pairs.length);
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

/** Conferência manual em data/coordinate-overrides.json: aponta um registro do CNEFE ou veta a posição. */
function applyOverride(church, override, byId) {
  if (override.status === "unavailable") return null;
  const record = byId.get(String(override.cnefe));
  if (!record) throw new Error(`${church.id}: registro CNEFE ${override.cnefe} do override não encontrado`);
  const status = override.status ?? "verified";
  return { record, rule: `conferência manual — ${override.note}`, status, source: status === "verified" ? "cnefe-temple" : "cnefe-address" };
}

async function geocodeState(state, overrides) {
  const target = new URL(`${state.uf}.json`, DATA_DIR);
  const data = JSON.parse(await readFile(target, "utf8"));
  const described = new Map(data.churches.map((church) => [church.id, describeChurch(church)]));
  const wanted = new Map();
  for (const { postalCode, houseNumber } of described.values()) {
    if (!postalCode) continue;
    const entry = wanted.get(postalCode) ?? { open: false, numbers: new Set() };
    if (houseNumber) entry.numbers.add(digitsOf(houseNumber)); else entry.open = true;
    wanted.set(postalCode, entry);
  }
  const addresses = await loadAddresses(
    state,
    wanted,
    new Set(Object.values(overrides).map((override) => String(override.cnefe ?? ""))),
  );
  const temples = addresses.filter((record) => record.temple);
  const sharedPostalCodes = new Map();
  for (const { postalCode } of described.values()) sharedPostalCodes.set(postalCode, (sharedPostalCodes.get(postalCode) ?? 0) + 1);
  const byId = new Map(addresses.map((record) => [record.id, record]));
  const report = { verified: [], approximate: [], unavailable: [] };

  for (const church of data.churches) {
    const override = overrides[church.id];
    const temple = override ? null : matchTemple(church, temples, sharedPostalCodes);
    const resolved = override
      ? applyOverride(church, override, byId)
      : temple ? { ...temple, status: "verified", source: "cnefe-temple" } : matchAddress(church, addresses);

    church.latitude = resolved?.record.latitude ?? null;
    church.longitude = resolved?.record.longitude ?? null;
    church.coordinateStatus = resolved?.status ?? "unavailable";
    church.coordinateSource = resolved?.source ?? null;
    delete church.cnefeId;
    if (resolved) church.cnefeId = resolved.record.id;
    church.__detail = resolved
      ? `\n      ${resolved.rule}: #${resolved.record.id} ${resolved.record.text} @ ${church.latitude},${church.longitude}`
      : override ? `\n      vetada na conferência manual — ${override.note}` : "";
  }

  // Duas casas no mesmo ponto indicam correspondência errada: nenhuma delas é usada.
  const byPoint = Map.groupBy(data.churches.filter((church) => church.latitude !== null), (church) => `${church.latitude},${church.longitude}`);
  for (const group of byPoint.values()) {
    if (group.length < 2) continue;
    for (const church of group) {
      church.latitude = null; church.longitude = null; church.coordinateStatus = "unavailable"; church.coordinateSource = null;
      delete church.cnefeId;
      church.__detail = `\n      ponto compartilhado com ${group.filter((other) => other !== church).map((other) => other.id).join(", ")}: descartado`;
    }
  }

  for (const church of data.churches) {
    report[church.coordinateStatus].push(`${church.id} ${church.name} (${church.city}) — ${church.address}${church.__detail}`);
    delete church.__detail;
  }

  if (CANDIDATES) {
    const used = new Set(data.churches.map((church) => `${church.latitude},${church.longitude}`));
    for (const church of data.churches.filter((item) => item.coordinateStatus !== "verified")) {
      const { postalCode, pairs, words } = described.get(church.id);
      console.log(`\n${church.id} ${church.name} (${church.city}) — ${church.address} [${church.coordinateStatus}]`);
      temples
        .filter((record) => !used.has(`${record.latitude},${record.longitude}`))
        .map((record) => ({ record, score: pairHits(pairs, record) + 2 * wordHits(words, record) + (record.postalCode.slice(0, 5) === postalCode.slice(0, 5) ? 2 : record.postalCode.slice(0, 3) === postalCode.slice(0, 3) ? 1 : 0) }))
        .filter(({ score }) => score >= 2)
        .toSorted((a, b) => b.score - a.score).slice(0, 4)
        .forEach(({ record, score }) => console.log(`   ${score} #${record.id} ${record.postalCode} ${record.text} @ ${record.latitude},${record.longitude}`));
    }
  }

  const lines = data.churches.map((church) => `    ${JSON.stringify(church)}`).join(",\n");
  await writeFile(target, `{\n  "state": "${data.state}",\n  "updatedAt": "${data.updatedAt}",\n  "count": ${data.churches.length},\n  "skipped": ${JSON.stringify(data.skipped ?? [])},\n  "churches": [\n${lines}\n  ]\n}\n`);
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(new URL(`${state.uf}.txt`, REPORT_DIR), Object.entries(report).map(([status, items]) => `${status}: ${items.length}\n${items.map((line) => `  - ${line}`).join("\n")}`).join("\n\n"));
  process.stdout.write(`${state.uf}: ${report.verified.length} confirmadas, ${report.approximate.length} aproximadas, ${report.unavailable.length} sem posição (de ${data.churches.length}).\n`);
  if (VERBOSE) for (const [status, lines] of Object.entries(report)) { console.log(`\n${status}`); lines.forEach((line) => console.log(`  - ${line}`)); }
}

await mkdir(CACHE_DIR, { recursive: true });
const overrides = JSON.parse(await readFile(OVERRIDES_URL, "utf8").catch(() => "{}"));
for (const state of STATES) {
  if (wanted && !wanted.includes(state.uf)) continue;
  if (!(await stat(new URL(`${state.uf}.json`, DATA_DIR)).catch(() => null))) continue;
  await geocodeState(state, overrides);
}
await rebuildIndex();
