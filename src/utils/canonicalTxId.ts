import { keccak256, getBytes, getAddress, toBeHex } from 'ethers';

export type CanonicalTxInput = {
  to?: string | null;
  nonce?: bigint | number | string;
  value?: bigint | number | string | null;
  data?: string | Uint8Array | null;
};

export function canonicalTxId(tx: CanonicalTxInput): string {
  let enc = new Uint8Array(0);
  const put = (b: Uint8Array) => {
    const out = new Uint8Array(enc.length + b.length);
    out.set(enc, 0);
    out.set(b, enc.length);
    enc = out;
  };

  const putU64 = (x?: bigint | number | string) => {
    if (x === undefined || x === null) return;
    const n = BigInt(x);
    if (n === BigInt(0)) return;
    put(getBytes(toBeHex(n)));
  };

  const putBig = (v?: bigint | number | string | null) => {
    if (v === undefined || v === null) return;
    const n = BigInt(v);
    if (n === BigInt(0)) return;
    put(getBytes(toBeHex(n)));
  };

  const putAddr = (a?: string | null) => {
    if (!a) {
      put(new Uint8Array(20));
      return;
    }
    const checksummed = getAddress(a);
    put(getBytes(checksummed));
  };

  const putData = (d?: string | Uint8Array | null) => {
    if (!d) return;
    const bytes = typeof d === 'string' ? getBytes(d) : d;
    if (bytes.length === 0) return;
    put(bytes);
  };

  putAddr(tx.to ?? null);
  putU64(tx.nonce ?? 0);
  putBig(tx.value ?? null);
  putData(tx.data ?? null);

  return keccak256(enc);
}
