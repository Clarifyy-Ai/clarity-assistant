/** Client-side generation of recovery codes. Plaintext is shown once; hashes live server-side. */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomChar(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return ALPHABET[buf[0] % ALPHABET.length] ?? "0";
}

export function generateRecoveryCodes(count = 10): string[] {
  const out = new Set<string>();
  while (out.size < count) {
    let body = "";
    for (let i = 0; i < 10; i += 1) body += randomChar();
    out.add(`${body.slice(0, 5)}-${body.slice(5)}`);
  }
  return [...out];
}

export function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}
