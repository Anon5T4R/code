const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(body));
  return Buffer.concat([len, t, data, c]);
}

function makePNG(w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0);
    for (let x = 0; x < w; x++) raw.push(40, 40, 40);
  }
  const idat = zlib.deflateSync(Buffer.from(raw));
  const iend = Buffer.alloc(0);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", iend)]);
}

const dir = __dirname || path.dirname(process.argv[1]);
const png32 = makePNG(32, 32);
const png128 = makePNG(128, 128);
const png256 = makePNG(256, 256);

fs.writeFileSync(path.join(dir, "icon_32x32.png"), png32);
fs.writeFileSync(path.join(dir, "icon_128x128.png"), png128);
fs.writeFileSync(path.join(dir, "icon_128x128@2x.png"), png256);

// ICO
const hdr = Buffer.alloc(6);
hdr.writeUInt16LE(0, 0);
hdr.writeUInt16LE(1, 2);
hdr.writeUInt16LE(1, 4);
const ent = Buffer.alloc(16);
ent.writeUInt8(32, 0);
ent.writeUInt8(32, 1);
ent.writeUInt8(0, 2);
ent.writeUInt8(0, 3);
ent.writeUInt16LE(1, 4);
ent.writeUInt16LE(32, 6);
ent.writeUInt32LE(png32.length, 8);
ent.writeUInt32LE(22, 12);
fs.writeFileSync(path.join(dir, "icon.ico"), Buffer.concat([hdr, ent, png32]));

fs.copyFileSync(path.join(dir, "icon.ico"), path.join(dir, "icon.icns"));

console.log("Icons generated");
