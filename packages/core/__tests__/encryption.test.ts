import { describe, it, expect } from "vitest";
import {
  importMasterKey,
  encryptSecret,
  decryptSecret,
  generateMasterKeyBase64,
} from "../src/encryption.js";

describe("encryption", () => {
  it("encrypt→decrypt round-trip returns original plaintext", async () => {
    const keyB64 = generateMasterKeyBase64();
    const masterKey = await importMasterKey(keyB64);

    const plaintext = "super-secret-api-key-abc123";
    const encrypted = await encryptSecret(plaintext, masterKey);
    const decrypted = await decryptSecret(encrypted, masterKey);

    expect(decrypted).toBe(plaintext);
  });

  it("each encrypt call produces a different ciphertext (unique IV)", async () => {
    const masterKey = await importMasterKey(generateMasterKeyBase64());
    const a = await encryptSecret("same text", masterKey);
    const b = await encryptSecret("same text", masterKey);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("encrypted object contains non-empty ciphertext and iv", async () => {
    const masterKey = await importMasterKey(generateMasterKeyBase64());
    const result = await encryptSecret("hello", masterKey);
    expect(result.ciphertext.length).toBeGreaterThan(0);
    expect(result.iv.length).toBeGreaterThan(0);
  });

  it("importMasterKey throws on empty input", async () => {
    await expect(importMasterKey("")).rejects.toThrow();
  });

  it("importMasterKey throws when key is wrong byte length", async () => {
    const shortKey = btoa("tooshort");
    await expect(importMasterKey(shortKey)).rejects.toThrow();
  });

  it("decryptSecret throws when ciphertext is corrupted", async () => {
    const masterKey = await importMasterKey(generateMasterKeyBase64());
    const encrypted = await encryptSecret("original", masterKey);
    const corrupted = { ...encrypted, ciphertext: btoa("garbage") };
    await expect(decryptSecret(corrupted, masterKey)).rejects.toThrow();
  });

  it("decryptSecret throws when iv is missing", async () => {
    const masterKey = await importMasterKey(generateMasterKeyBase64());
    const encrypted = await encryptSecret("original", masterKey);
    await expect(decryptSecret({ ciphertext: encrypted.ciphertext, iv: "" }, masterKey)).rejects.toThrow();
  });

  it("generateMasterKeyBase64 produces a 44-char base64 string", () => {
    const key = generateMasterKeyBase64();
    expect(typeof key).toBe("string");
    // base64 of 32 bytes = ceil(32 / 3) * 4 = 44 chars
    expect(key.length).toBe(44);
  });
});
