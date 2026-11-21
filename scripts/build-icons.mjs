// Gera os PNG/ICO/OG a partir de public/favicons/icon.svg (usa o sharp que acompanha o Next).
//   node scripts/build-icons.mjs
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";

const require = createRequire(new URL("../node_modules/next/package.json", import.meta.url));
const sharp = require("sharp");
const DIR = new URL("../public/favicons/", import.meta.url);
const svg = await readFile(new URL("icon.svg", DIR));

const png = (size) => sharp(svg, { density: Math.max(72, Math.round((72 * size) / 512) * 4) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

const sizes = [16, 32, 48, 64, 128, 180, 192, 256, 512];
const buffers = new Map();
for (const size of sizes) {
  buffers.set(size, await png(size));
  await writeFile(new URL(`favicon-${size}x${size}.png`, DIR), buffers.get(size));
}

// ICO com PNGs embutidos (16, 32 e 48 px).
const icoSizes = [16, 32, 48];
const header = Buffer.alloc(6 + 16 * icoSizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
icoSizes.forEach((size, index) => {
  const data = buffers.get(size);
  const entry = 6 + index * 16;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(data.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
await writeFile(new URL("favicon.ico", DIR), Buffer.concat([header, ...icoSizes.map((size) => buffers.get(size))]));

// Ícone "maskable": fundo até a borda e o desenho na zona segura central (80%).
const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D4FB8"/><stop offset=".55" stop-color="#14397F"/><stop offset="1" stop-color="#0B8A8C"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(51.2 41) scale(.8)">${svg.toString().replace(/^[\s\S]*?<defs>/, "<defs>").replace(/<g clip-path="url\(#tile\)">[\s\S]*?<\/g>/, "").replace("</svg>", "")}</g>
</svg>`);
await writeFile(new URL("icon-maskable-512.png", DIR), await sharp(maskable, { density: 288 }).resize(512, 512).png().toBuffer());
await writeFile(new URL("icon-maskable-192.png", DIR), await sharp(maskable, { density: 288 }).resize(192, 192).png().toBuffer());

// Imagem de pré-visualização (Open Graph / WhatsApp): 1200x630.
const og = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14397F"/><stop offset="1" stop-color="#0B8A8C"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="1080" cy="40" r="330" fill="#fff" opacity=".06"/>
  <circle cx="1130" cy="640" r="220" fill="#fff" opacity=".05"/>
  <image href="data:image/png;base64,${buffers.get(256).toString("base64")}" x="96" y="187" width="256" height="256"/>
  <text x="400" y="262" font-family="Segoe UI, Arial, sans-serif" font-size="62" font-weight="700" fill="#fff">Localizador de</text>
  <text x="400" y="336" font-family="Segoe UI, Arial, sans-serif" font-size="62" font-weight="700" fill="#fff">Casas de Oração</text>
  <text x="400" y="400" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#DCE8F8">Encontre a casa de oração mais perto de você,</text>
  <text x="400" y="440" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#DCE8F8">em todo o Brasil, por dia e horário de culto.</text>
  <text x="400" y="532" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="#FFD978">Projeto independente, sem vínculo com a instituição.</text>
</svg>`);
await writeFile(new URL("../og-casas-de-oracao.png", DIR), await sharp(og).png({ compressionLevel: 9 }).toBuffer());
console.log("Ícones gerados.");
