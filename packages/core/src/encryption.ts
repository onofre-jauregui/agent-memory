/**
 * AES-GCM encryption helpers for sensitive credentials at rest.
 *
 * Pure Web Crypto — works under Node 18+, Deno, Bun, and modern browsers.
 *
 * Format:
 *  - ciphertext: base64
 *  - iv:         base64 (12 bytes)
 *
 * Master key requirements:
 *  - 32 bytes (256-bit AES key)
 *  - Supplied as base64 to importMasterKey()
 *  - Generate with: openssl rand -base64 32
 */

const ALGO = "AES-GCM";
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

function base64Encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64Decode(b64: string): Uint8Array {
  const s = atob(b64);
  const buf = new ArrayBuffer(s.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function importMasterKey(masterKeyBase64: string): Promise<CryptoKey> {
  if (!masterKeyBase64) {
    throw new Error(
      "Missing master key. Pass a 32-byte base64 value (generate with: openssl rand -base64 32)"
    );
  }

  const raw = base64Decode(masterKeyBase64);
  if (raw.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `Master key must be ${KEY_LENGTH_BYTES} bytes (got ${raw.length}). Generate with: openssl rand -base64 32`
    );
  }

  return await crypto.subtle.importKey(
    "raw",
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
    { name: ALGO, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
}

export async function encryptSecret(
  plaintext: string,
  masterKey: CryptoKey
): Promise<EncryptedSecret> {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptSecret: plaintext must be a non-empty string");
  }

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const ptBytes = new TextEncoder().encode(plaintext);

  const ctBuffer = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    masterKey,
    ptBytes
  );

  return {
    ciphertext: base64Encode(new Uint8Array(ctBuffer)),
    iv: base64Encode(iv),
  };
}

export async function decryptSecret(
  encrypted: EncryptedSecret,
  masterKey: CryptoKey
): Promise<string> {
  if (!encrypted.ciphertext || !encrypted.iv) {
    throw new Error("decryptSecret: missing ciphertext or iv");
  }

  const ct = base64Decode(encrypted.ciphertext);
  const iv = base64Decode(encrypted.iv);

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(
      `decryptSecret: iv must be ${IV_LENGTH_BYTES} bytes (got ${iv.length})`
    );
  }

  const ptBuffer = await crypto.subtle.decrypt(
    { name: ALGO, iv: iv as BufferSource },
    masterKey,
    ct as BufferSource
  );

  return new TextDecoder().decode(ptBuffer);
}

export function generateMasterKeyBase64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_LENGTH_BYTES));
  return base64Encode(bytes);
}
