import qrcode from "qrcode-generator";

const QUIET_ZONE = 4;

/** QR Code em SVG, sempre preto no branco para o leitor do banco reconhecer. */
export default function PixQrCode({ value, size = 232 }: { value: string; size?: number }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const total = count + QUIET_ZONE * 2;
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (qr.isDark(row, column)) path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return <svg className="pix-qr" width={size} height={size} viewBox={`0 0 ${total} ${total}`} role="img" aria-label="QR Code do Pix" shapeRendering="crispEdges">
    <rect width={total} height={total} fill="#ffffff" />
    <path d={path} fill="#000000" />
  </svg>;
}
