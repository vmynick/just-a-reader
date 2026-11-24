// Minimal ZIP reader (stored + deflate) built on DecompressionStream, which
// exists in modern browsers and in Node ≥ 20. Enough for EPUB and MEK zips.

export async function readZip(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('A fájl nem ZIP/EPUB formátumú.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder('utf-8');
  const cp437 = new TextDecoder('latin1');
  const entries = new Map();
  const lower = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Sérült ZIP fájl.');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const nameBytes = u8.subarray(p + 46, p + 46 + nlen);
    const name = (flags & 0x800 ? utf8 : cp437).decode(nameBytes);
    if (!name.endsWith('/')) {
      entries.set(name, { method, csize, lho });
      lower.set(name.toLowerCase(), name);
    }
    p += 46 + nlen + xlen + clen;
  }

  const resolveName = (name) => {
    if (entries.has(name)) return name;
    let dec = name;
    try { dec = decodeURIComponent(name); } catch { /* keep */ }
    if (entries.has(dec)) return dec;
    return lower.get(dec.toLowerCase()) || lower.get(name.toLowerCase()) || null;
  };

  async function bytes(name) {
    const real = resolveName(name);
    if (!real) return null;
    const e = entries.get(real);
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    const data = u8.subarray(start, start + e.csize);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateRaw(data);
    throw new Error(`Nem támogatott tömörítés (${e.method}).`);
  }

  return {
    names: [...entries.keys()],
    has: (name) => resolveName(name) !== null,
    bytes,
    async text(name, encoding) {
      const b = await bytes(name);
      return b ? decodeText(b, encoding) : null;
    },
  };
}

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decode bytes, honouring BOMs and declared charsets; Hungarian fallback is windows-1250. */
export function decodeText(bytes, encoding) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  let enc = encoding;
  if (!enc) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
    const m = head.match(/<\?xml[^>]*encoding\s*=\s*["']([\w.-]+)["']/i) || head.match(/charset\s*=\s*["']?([\w.-]+)/i);
    if (m) enc = m[1].toLowerCase();
  }
  if (!enc || enc === 'utf-8' || enc === 'utf8') {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { enc = 'windows-1250'; }
  }
  try { return new TextDecoder(enc).decode(bytes); } catch { return new TextDecoder('windows-1250').decode(bytes); }
}
