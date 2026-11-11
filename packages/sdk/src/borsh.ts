/** The few Borsh encodings NEP-413 and NEP-641 need. Little-endian, length-prefixed. */
export class BorshWriter {
  private chunks: Uint8Array[] = [];

  u32(n: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    this.chunks.push(b);
    return this;
  }

  u64(n: bigint): this {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, n, true);
    this.chunks.push(b);
    return this;
  }

  u8(n: number): this {
    this.chunks.push(Uint8Array.of(n));
    return this;
  }

  /** Fixed-size byte array: no length prefix. */
  fixed(bytes: Uint8Array): this {
    this.chunks.push(bytes);
    return this;
  }

  string(s: string): this {
    const bytes = new TextEncoder().encode(s);
    this.u32(bytes.length);
    this.chunks.push(bytes);
    return this;
  }

  vecString(items: string[]): this {
    this.u32(items.length);
    for (const s of items) this.string(s);
    return this;
  }

  optionString(s: string | null | undefined): this {
    if (s === null || s === undefined) return this.u8(0);
    return this.u8(1).string(s);
  }

  bytes(): Uint8Array {
    const len = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
