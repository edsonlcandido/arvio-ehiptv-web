/**
 * Generates a UUID-like string that works in non-HTTPS contexts.
 *
 * `crypto.randomUUID()` requires a secure context (HTTPS or `localhost`),
 * which fails on plain HTTP deployments such as the EasyPanel setup used by
 * this project. The implementation below is RFC 4122 v4 compliant and only
 * depends on `Math.random`, which is available everywhere.
 *
 * Note: this is not cryptographically secure — it is only intended for client
 * identifiers (playlist IDs, catalog IDs, etc.), never for tokens or secrets.
 */
export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
