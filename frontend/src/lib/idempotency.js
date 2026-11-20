/**
 * Generate a cryptographically strong idempotency suffix on localhost, HTTPS,
 * and plain-HTTP LAN demos. crypto.randomUUID is secure-context-only, whereas
 * crypto.getRandomValues is available in modern browsers on insecure origins.
 * Never silently fall back to Math.random for payment-related identifiers.
 */
export function createIdempotencySuffix() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("Secure random number generation is unavailable in this browser. Please use a modern browser or HTTPS.");
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  // UUID v4 format bits, without hyphens; preserve existing gn_<hex> key shape.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
