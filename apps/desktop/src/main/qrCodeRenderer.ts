import { createRequire } from "node:module";

interface QrCodeInstance {
  addData: (data: string) => void;
  make: () => void;
  getModuleCount: () => number;
  isDark: (row: number, col: number) => boolean;
}

interface QrCodeConstructor {
  new (typeNumber: number, errorCorrectLevel: number): QrCodeInstance;
}

interface QrErrorCorrectLevel {
  L: number;
  M: number;
  Q: number;
  H: number;
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const qrRequire = createRequire(__filename);

export const renderQrSvgDataUrl = (payload: string): string => {
  if (!payload.trim()) throw new Error("Payload Pix vazio.");

  const QRCode = qrRequire("qrcode-terminal/vendor/QRCode") as QrCodeConstructor;
  const QRErrorCorrectLevel = qrRequire("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel") as QrErrorCorrectLevel;
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(payload);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const quietZone = 4;
  const size = moduleCount + quietZone * 2;
  const rects: string[] = [];

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (qr.isDark(row, col)) {
        rects.push(`<rect x="${col + quietZone}" y="${row + quietZone}" width="1" height="1"/>`);
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${escapeXml(
    "QR Code Pix"
  )}"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#111827">${rects.join("")}</g></svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
};
