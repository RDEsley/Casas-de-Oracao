// Gera assets/logo.png (base do ícone e da splash do app) a partir do favicon:
// isola o traço do emblema em fundo transparente para o Android aplicar a cor de fundo.
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SOURCE = fileURLToPath(new URL("../public/favicons/favicon-512x512.png", import.meta.url));
const TARGET = fileURLToPath(new URL("../assets/logo.png", import.meta.url));
const INK = [22, 45, 92];
const PAPER_LUMINANCE = 244;
const INK_LUMINANCE = 60;

const { data, info } = await sharp(SOURCE)
  .resize(1024, 1024, { kernel: "lanczos3" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let offset = 0; offset < data.length; offset += 4) {
  const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  const coverage = Math.min(1, Math.max(0, (PAPER_LUMINANCE - luminance) / (PAPER_LUMINANCE - INK_LUMINANCE)));
  data[offset] = INK[0];
  data[offset + 1] = INK[1];
  data[offset + 2] = INK[2];
  data[offset + 3] = Math.round(coverage * data[offset + 3]);
}

await sharp(data, { raw: info }).png().toFile(TARGET);
console.log("assets/logo.png gerado.");
