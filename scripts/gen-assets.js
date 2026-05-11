#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.resolve(__dirname, '..', 'renderer', 'assets');
const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const DOCS_DIR = path.resolve(__dirname, '..', 'docs');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });

const SIZE = 32;

const COLORS = {
  _: [0, 0, 0, 0],
  K: [40, 30, 40, 255],
  S: [255, 220, 180, 255],
  H: [120, 70, 40, 255],
  C: [255, 140, 150, 255],
  W: [255, 255, 255, 255],
  R: [200, 40, 40, 255],
};

const RED_COLORS = {
  ...COLORS,
  S: [235, 60, 60, 255],
  H: [130, 15, 15, 255],
  C: [255, 230, 230, 255],
};

const NORMAL = `
________HHHHHHHH________
______HHHHHHHHHHHH______
_____HHSSSSSSSSSSHH_____
____HSSSSSSSSSSSSSSH____
___HSSSSSSSSSSSSSSSSH___
___HSSSSSSSSSSSSSSSSH___
__HSSSSSSSSSSSSSSSSSSH__
__HSSSSSSSSSSSSSSSSSSH__
__HSSSSSKSSSSSSSKSSSSH__
__HSSSSSSSSSSSSSSSSSSH__
__HSSSSSSSSSSSSSSSSSSH__
__HSSSSSSSSCCCCSSSSSSH__
__HSSSSSSSSSSSSSSSSSSH__
___HSSSSSSSSSSSSSSSSH___
___HSSSSSSSSSSSSSSSSH___
____HSSSSSSSSSSSSSSH____
_____HHSSSSSSSSSSHH_____
______HHHHHHHHHHHH______
`;

const SURPRISED = `
________HHHHHHHH________
______HHHHHHHHHHHH______
_____HHSSSSSSSSSSHH_____
____HSSSSSSSSSSSSSSH____
___HSSSWWWSSSSWWWSSSH___
___HSSWKWWSSSSWWKWSSH___
__HSSSWWWSSSSSSWWWSSSH__
__HSSSSSSSSSSSSSSSSSSH__
__HSSSSSSSSSSSSSSSSSSH__
__HSSSSSSSSCCCCSSSSSSH__
__HSSSSSSSCCCCCCSSSSSH__
__HSSSSSSSCCCCCCSSSSSH__
__HSSSSSSSSCCCCSSSSSSH__
___HSSSSSSSSSSSSSSSSH___
___HSSSSSSSSSSSSSSSSH___
____HSSSSSSSSSSSSSSH____
_____HHSSSSSSSSSSHH_____
______HHHHHHHHHHHH______
`;

function parseArt(art, colors = COLORS) {
  const rows = art.trim().split('\n').map((r) => r.trim());
  const h = SIZE;
  const w = SIZE;
  const pixels = new Uint8Array(w * h * 4);
  const artH = rows.length;
  const artW = Math.max(...rows.map((r) => r.length));
  const offY = Math.floor((h - artH) / 2);
  const offX = Math.floor((w - artW) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ch = '_';
      const sy = y - offY;
      const sx = x - offX;
      if (sy >= 0 && sy < artH && sx >= 0 && sx < (rows[sy] || '').length) {
        ch = rows[sy][sx];
      }
      const c = colors[ch] || colors._;
      const i = (y * w + x) * 4;
      pixels[i] = c[0];
      pixels[i + 1] = c[1];
      pixels[i + 2] = c[2];
      pixels[i + 3] = c[3];
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(pixels, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    pixels.subarray(y * w * 4, (y + 1) * w * 4).forEach((b, i) => {
      raw[y * (w * 4 + 1) + 1 + i] = b;
    });
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function scaleUp(pixels, srcSize, factor) {
  const dst = srcSize * factor;
  const out = new Uint8Array(dst * dst * 4);
  for (let y = 0; y < dst; y++) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < dst; x++) {
      const sx = Math.floor(x / factor);
      const si = (sy * srcSize + sx) * 4;
      const di = (y * dst + x) * 4;
      out[di] = pixels[si];
      out[di + 1] = pixels[si + 1];
      out[di + 2] = pixels[si + 2];
      out[di + 3] = pixels[si + 3];
    }
  }
  return out;
}

function write(name, art, colors = COLORS) {
  const pixels = parseArt(art, colors);
  const png = encodePng(pixels, SIZE, SIZE);
  const out = path.join(OUT_DIR, name);
  fs.writeFileSync(out, png);
  console.log('wrote', out, png.length, 'bytes');
  return pixels;
}

const normalPixels = write('normal.png', NORMAL);
const surprisedPixels = write('surprised.png', SURPRISED);
const surprisedRedPixels = write('surprised-red.png', SURPRISED, RED_COLORS);

function writeScaled(pixels, outPath, targetSize) {
  const factor = targetSize / SIZE;
  const scaled = scaleUp(pixels, SIZE, factor);
  const png = encodePng(scaled, targetSize, targetSize);
  fs.writeFileSync(outPath, png);
  console.log('wrote', outPath, png.length, 'bytes');
}

writeScaled(normalPixels, path.join(BUILD_DIR, 'icon.png'), 1024);
writeScaled(normalPixels, path.join(DOCS_DIR, 'face-normal.png'), 256);
writeScaled(surprisedPixels, path.join(DOCS_DIR, 'face-surprised.png'), 256);
writeScaled(surprisedRedPixels, path.join(DOCS_DIR, 'face-red.png'), 256);
