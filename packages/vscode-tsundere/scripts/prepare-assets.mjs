import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const repoRoot = resolve(root, "..", "..");
const sourceLogo = resolve(repoRoot, "assets", "vscode-tsundere-logo.png");
const fallbackSourceLogo = resolve(repoRoot, "assets", "tsundere-logo.png");
const targetLogo = resolve(root, "assets", "tsundere-logo.png");

await mkdir(dirname(targetLogo), { recursive: true });

if (existsSync(sourceLogo)) {
  await copyFile(sourceLogo, targetLogo);
} else if (existsSync(fallbackSourceLogo)) {
  await copyFile(fallbackSourceLogo, targetLogo);
} else {
  await writeFile(targetLogo, createFallbackLogoPng(128));
  console.warn("Using generated fallback logo. Add assets/vscode-tsundere-logo.png to use the official VS Code icon.");
}

function createFallbackLogoPng(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const rounded = isRoundedRectPixel(x, y, size, 18);
      rgba[i] = rounded ? 23 : 0;
      rgba[i + 1] = rounded ? 24 : 0;
      rgba[i + 2] = rounded ? 33 : 0;
      rgba[i + 3] = rounded ? 255 : 0;
    }
  }

  drawTriangle(rgba, size, 28, 28, 100, 28, 66, 102, [255, 122, 182, 255]);
  drawTriangle(rgba, size, 48, 39, 91, 39, 67, 79, [247, 248, 255, 255]);
  drawRect(rgba, size, 58, 59, 77, 72, [23, 24, 33, 255]);

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    pngSignature(),
    chunk("IHDR", Buffer.concat([uint32(size), uint32(size), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function isRoundedRectPixel(x, y, size, radius) {
  const corners = [
    [radius, radius],
    [size - radius - 1, radius],
    [radius, size - radius - 1],
    [size - radius - 1, size - radius - 1]
  ];
  if ((x >= radius && x < size - radius) || (y >= radius && y < size - radius)) {
    return true;
  }
  return corners.some(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2);
}

function drawRect(buffer, size, x1, y1, x2, y2, color) {
  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) {
      setPixel(buffer, size, x, y, color);
    }
  }
}

function drawTriangle(buffer, size, ax, ay, bx, by, cx, cy, color) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const w1 = edge(x, y, bx, by, cx, cy);
      const w2 = edge(x, y, cx, cy, ax, ay);
      const w3 = edge(x, y, ax, ay, bx, by);
      if ((w1 >= 0 && w2 >= 0 && w3 >= 0) || (w1 <= 0 && w2 <= 0 && w3 <= 0)) {
        setPixel(buffer, size, x, y, color);
      }
    }
  }
}

function edge(px, py, ax, ay, bx, by) {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

function setPixel(buffer, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }
  const i = (y * size + x) * 4;
  buffer[i] = color[0];
  buffer[i + 1] = color[1];
  buffer[i + 2] = color[2];
  buffer[i + 3] = color[3];
}

function pngSignature() {
  return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const crcInput = Buffer.concat([typeBuffer, data]);
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(crcInput))]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
