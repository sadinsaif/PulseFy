// One-off: decode the transparent PulseFy logo, analyze its vertical alpha
// profile to separate the P-mark from the "PulseFy" wordmark, and crop the
// P-mark out to a clean square transparent PNG. Pure Node (zlib only).
import fs from "node:fs";
import zlib from "node:zlib";

const IN = process.argv[2] || "public/logo-new.png.png";
const MODE = process.argv[3] || "analyze"; // analyze | crop
const OUT = process.argv[4] || "public/logo-mark-new.png";
const PAD = Number(process.argv[5] || "0"); // extra transparent padding fraction

function readChunks(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8;
  const chunks = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    chunks.push({ type, data });
    off += 12 + len;
  }
  return chunks;
}

function decode(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === "IHDR").data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  if (bitDepth !== 8 || colorType !== 6)
    throw new Error(`unsupported: depth=${bitDepth} colorType=${colorType}`);
  const idat = Buffer.concat(
    chunks.filter((c) => c.type === "IDAT").map((c) => c.data)
  );
  const raw = zlib.inflateSync(idat);
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b = y > 0 ? out[o - stride + x] : 0;
      const c = y > 0 && x >= bpp ? out[o - stride + x - bpp] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          v = (v + pr) & 0xff;
          break;
        }
        default: throw new Error("bad filter " + filter);
      }
      out[o + x] = v;
    }
  }
  return { width, height, data: out };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crcBuf = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encode(width, height, data) {
  const bpp = 4;
  const stride = width * bpp;
  const rawWithFilters = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    rawWithFilters[y * (stride + 1)] = 0; // filter None
    data.copy(rawWithFilters, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(rawWithFilters, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// area-average (box) downscale of an RGBA buffer, premultiplied so transparent
// edges don't bleed dark halos.
function resize(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = (dy * sh) / dh, sy1 = ((dy + 1) * sh) / dh;
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = (dx * sw) / dw, sx1 = ((dx + 1) * sw) / dw;
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
        const wy = Math.min(sy1, y + 1) - Math.max(sy0, y);
        for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
          const wx = Math.min(sx1, x + 1) - Math.max(sx0, x);
          const w = wx * wy;
          const s = (y * sw + x) * 4;
          const al = src[s + 3];
          r += src[s] * al * w; g += src[s + 1] * al * w; b += src[s + 2] * al * w;
          a += al * w; wsum += w;
        }
      }
      const d = (dy * dw + dx) * 4;
      out[d + 3] = Math.round(a / wsum);
      if (a > 0) {
        out[d] = Math.round(r / a); out[d + 1] = Math.round(g / a); out[d + 2] = Math.round(b / a);
      }
    }
  }
  return out;
}

if (process.argv[2] === "composite") {
  // composite the RGBA logo over a solid bg at a target size, opaque output,
  // to prove there is no dark box / halo on real app surfaces.
  const dec = decode(fs.readFileSync(process.argv[3]));
  const out = process.argv[4];
  const size = Number(process.argv[5] || 34);
  const [br, bg, bb] = (process.argv[6] || "10,11,13").split(",").map(Number);
  const scaled = resize(dec.data, dec.width, dec.height, size, size);
  const pad = Math.round(size * 0.4);
  const box = size + pad * 2;
  const comp = Buffer.alloc(box * box * 4);
  for (let i = 0; i < box * box; i++) {
    comp[i * 4] = br; comp[i * 4 + 1] = bg; comp[i * 4 + 2] = bb; comp[i * 4 + 3] = 255;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const a = scaled[s + 3] / 255;
      const d = ((y + pad) * box + (x + pad)) * 4;
      comp[d] = Math.round(scaled[s] * a + comp[d] * (1 - a));
      comp[d + 1] = Math.round(scaled[s + 1] * a + comp[d + 1] * (1 - a));
      comp[d + 2] = Math.round(scaled[s + 2] * a + comp[d + 2] * (1 - a));
    }
  }
  fs.writeFileSync(out, encode(box, box, comp));
  console.log(`composited over rgb(${br},${bg},${bb}) @ ${size}px -> ${out}`);
  process.exit(0);
}

if (process.argv[2] === "resize") {
  const src = fs.readFileSync(process.argv[3]);
  const dec = decode(src);
  const dw = Number(process.argv[5]), dh = Number(process.argv[6] || process.argv[5]);
  const r = resize(dec.data, dec.width, dec.height, dw, dh);
  fs.writeFileSync(process.argv[4], encode(dw, dh, r));
  console.log(`resized ${dec.width}x${dec.height} -> ${dw}x${dh} : ${process.argv[4]}`);
  process.exit(0);
}

const { width: W, height: H, data } = decode(fs.readFileSync(IN));
const ALPHA_T = 24; // treat alpha>this as "ink"

// row / column alpha coverage
const rowCov = new Array(H).fill(0);
const colCov = new Array(W).fill(0);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const a = data[(y * W + x) * 4 + 3];
    if (a > ALPHA_T) { rowCov[y]++; colCov[x]++; }
  }
}

if (MODE === "analyze") {
  // print a coarse vertical profile (every ~2% of height) to locate the gap
  console.log(`image ${W}x${H}`);
  const bins = 50;
  for (let i = 0; i < bins; i++) {
    const y0 = Math.floor((i * H) / bins);
    const y1 = Math.floor(((i + 1) * H) / bins);
    let s = 0, n = 0;
    for (let y = y0; y < y1; y++) { s += rowCov[y]; n++; }
    const avg = n ? s / n : 0;
    const bar = "#".repeat(Math.round((avg / W) * 60));
    console.log(String(y0).padStart(4) + " " + (avg / W).toFixed(3).padStart(6) + " " + bar);
  }
  // find first empty-ish row after the top ink block (the gap before text)
  let firstInk = -1, gapStart = -1;
  for (let y = 0; y < H; y++) if (rowCov[y] > W * 0.01) { firstInk = y; break; }
  let inTop = false;
  for (let y = firstInk; y < H; y++) {
    if (rowCov[y] > W * 0.02) inTop = true;
    if (inTop && rowCov[y] < W * 0.006) { gapStart = y; break; }
  }
  console.log("firstInk row:", firstInk, " gapStart(after P):", gapStart);
  process.exit(0);
}

if (MODE === "crop") {
  const cutY = Number(process.argv[6]); // bottom of P-mark region (exclusive)
  if (!cutY) { console.error("need cutY"); process.exit(1); }
  // bounding box of ink within rows [0, cutY)
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < cutY; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > ALPHA_T) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const side = Math.max(bw, bh);
  const pad = Math.round(side * PAD);
  const box = side + pad * 2;
  // center the bbox in a square transparent canvas
  const cx = Math.round((minX + maxX) / 2);
  const cy = Math.round((minY + maxY) / 2);
  const startX = cx - Math.floor(box / 2);
  const startY = cy - Math.floor(box / 2);
  const clipY = Number(process.argv[7] || cutY); // source rows >= clipY are forced transparent
  const outBuf = Buffer.alloc(box * box * 4); // zero = transparent
  for (let y = 0; y < box; y++) {
    const sy = startY + y;
    if (sy < 0 || sy >= H || sy >= clipY) continue;
    for (let x = 0; x < box; x++) {
      const sx = startX + x;
      if (sx < 0 || sx >= W) continue;
      const s = (sy * W + sx) * 4;
      const d = (y * box + x) * 4;
      outBuf[d] = data[s]; outBuf[d + 1] = data[s + 1];
      outBuf[d + 2] = data[s + 2]; outBuf[d + 3] = data[s + 3];
    }
  }
  fs.writeFileSync(OUT, encode(box, box, outBuf));
  console.log(`bbox x[${minX}-${maxX}] y[${minY}-${maxY}] (${bw}x${bh}) -> ${box}x${box} square, wrote ${OUT}`);
  process.exit(0);
}
