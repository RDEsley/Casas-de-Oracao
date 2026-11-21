const BASE_URL = "https://congregacaocristanobrasil.org.br";
export const REPORT_URL = `${BASE_URL}/relatorio`;
const DAY_NAMES = new Map([
  ["Domingo", "Dom"], ["Segunda-feira", "Seg"], ["Terça-feira", "Ter"],
  ["Quarta-feira", "Qua"], ["Quinta-feira", "Qui"], ["Sexta-feira", "Sex"], ["Sábado", "Sáb"],
]);

export function decodeHtml(value = "") {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

export function plainText(value = "") {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function cardsFrom(html) {
  return [...html.matchAll(/<div class="card detalhe">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
}

export function parseMinistry(card = "") {
  const groups = [];
  let current = null;
  for (const match of card.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const paragraph = match[1];
    const value = plainText(paragraph);
    if (!value) continue;
    if (/<strong/i.test(paragraph)) {
      current = { role: value, names: [] };
      groups.push(current);
    } else if (current) current.names.push(value);
  }
  return groups.filter((group) => group.names.length > 0);
}

export function parseServices(card = "") {
  const services = [];
  let currentType = "";
  for (const match of card.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const paragraph = match[1];
    const value = plainText(paragraph);
    if (!value) continue;
    if (/<strong/i.test(paragraph)) {
      if (/Reunião de Jovens e Menores/i.test(value)) currentType = "Reunião de jovens e menores";
      if (/Culto Oficial/i.test(value)) currentType = "Culto oficial";
      continue;
    }
    const schedule = /^(Domingo|Segunda-feira|Terça-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sábado)\s*-\s*(\d{2}:\d{2})/.exec(value);
    if (schedule && currentType) services.push({ day: DAY_NAMES.get(schedule[1]), time: schedule[2], type: currentType });
  }
  return services;
}

export function valueAfterLabel(card, label) {
  return plainText(new RegExp(`${label}:?\\s*<\\/strong>\\s*([^<]*)`, "i").exec(card)?.[1] ?? "");
}

export function parseDetail(html) {
  const cards = cardsFrom(html);
  const headerCard = cards[0] ?? "";
  const locationCard = cards.find((card) => /Localiza(?:ção|&#231;&#227;o)/i.test(card)) ?? "";
  const serviceCard = cards.find((card) => /Dias de Culto/i.test(card)) ?? "";
  const ministryCard = cards.find((card) => /Minist(?:ério|&#233;rio)/i.test(card)) ?? "";
  const phoneCard = cards.find((card) => /Telefone\(s\)/i.test(card)) ?? "";
  const cityParts = valueAfterLabel(locationCard, "Cidade").split(",").map((part) => part.trim()).filter(Boolean);
  return {
    name: plainText(/<label[^>]*>[\s\S]*?<strong>([\s\S]*?)<\/strong>/.exec(headerCard)?.[1] ?? ""),
    isCentral: [...headerCard.matchAll(/<small[^>]*>[\s\S]*?<strong>([\s\S]*?)<\/strong>[\s\S]*?<\/small>/g)]
      .map((match) => plainText(match[1])).includes("CENTRAL"),
    code: [...headerCard.matchAll(/<small[^>]*>[\s\S]*?<strong>([\s\S]*?)<\/strong>[\s\S]*?<\/small>/g)]
      .map((match) => plainText(match[1])).find((value) => /^BR-\d{2}-\d{4}$/.test(value)) ?? "",
    street: valueAfterLabel(locationCard, "Logradouro"),
    postalCode: valueAfterLabel(locationCard, "CEP"),
    city: cityParts[0] ?? "",
    state: cityParts[1] ?? "",
    services: parseServices(serviceCard),
    ministry: parseMinistry(ministryCard),
    phones: [...phoneCard.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((match) => plainText(match[1])).filter(Boolean),
  };
}

export async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const isManualRedirect = options?.redirect === "manual" && response.status >= 300 && response.status < 400;
      if (!response.ok && !isManualRedirect) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

export async function createOfficialClient() {
  const cookieJar = new Map();
  let response;
  let requestUrl = REPORT_URL;
  for (let redirect = 0; redirect < 5; redirect += 1) {
    response = await fetchWithRetry(requestUrl, {
      redirect: "manual",
      headers: {
        "Cookie": [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
        "User-Agent": "Relatorio-CCB-Brasilia/1.0",
      },
    });
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";", 1);
      const separator = pair.indexOf("=");
      cookieJar.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    if (response.status < 300 || response.status >= 400) break;
    requestUrl = new URL(response.headers.get("location"), requestUrl).href;
  }
  if (!response || !response.ok) throw new Error("Não foi possível iniciar uma sessão no relatório oficial.");
  const html = await response.text();
  const token = /name="__RequestVerificationToken"[^>]*value="([^"]+)"/.exec(html)?.[1];
  const cookies = [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  if (!token) throw new Error("O relatório oficial não forneceu o token de consulta.");
  return async (path, body) => {
    const result = await fetchWithRetry(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "AntiForgeryToken": token,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cookie": cookies,
        "User-Agent": "Relatorio-CCB-Brasilia/1.0",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams(body),
    });
    return result.text();
  };
}

export function parseListingRows(html) {
  return [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].flatMap((match) => {
    const row = match[1];
    const officialId = /data-id="(\d+)"/.exec(row)?.[1];
    const code = /BR-\d{2}-\d{4}/.exec(plainText(row))?.[0];
    return officialId && code ? [{ id: code, officialId: Number(officialId) }] : [];
  });
}


export const SERVICE_FILTER = {
  tipoCulto: "Culto Oficial,Reunião de Jovens e Menores",
  diaSemana: "1,2,3,4,5,6,7",
  periodo: "Manhã,Tarde,Noite",
};

/** Página de listagem: registros e total anunciado ("Exibindo 5 de 91"). */
export function parseListing(html) {
  const total = Number(/Exibindo\s+\d+\s+de\s+(\d+)/i.exec(plainText(html))?.[1] ?? 0);
  return { records: parseListingRows(html), total };
}

export const hasNextPage = (html, page) => new RegExp(`<button[^>]*value="${page + 1}"[^>]*>`, "i").test(html);
