// Web Crypto API HMAC-SHA256 signature and verification
// Compatible with both Node.js runtime and Next.js Edge middleware

const SESSION_MAX_AGE_SEC = 7 * 24 * 3600; // 7 days

function getSecretKey(): string {
  return process.env.SESSION_SECRET || process.env.APP_PASSCODE || 'reef_server_session_cryptographic_secret_2026';
}

async function getHmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyData = enc.encode(getSecretKey());
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

export async function createSignedSessionToken(payload: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const data = `${btoa(payload)}.${timestamp}`;
  const key = await getHmacKey();
  const enc = new TextEncoder();
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const sigHex = bufferToHex(signature);
  return `${data}.${sigHex}`;
}

export async function verifySessionToken(
  tokenString: string | undefined | null
): Promise<{ valid: boolean; payload?: string }> {
  if (!tokenString) return { valid: false };

  const parts = tokenString.split('.');
  if (parts.length !== 3) return { valid: false };

  const [b64Payload, timestampStr, signatureHex] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return { valid: false };

  const now = Math.floor(Date.now() / 1000);
  // Check expiration (7 days) and future clock skew (max 60s)
  if (now - timestamp > SESSION_MAX_AGE_SEC || timestamp - now > 60) {
    return { valid: false };
  }

  try {
    const data = `${b64Payload}.${timestampStr}`;
    const key = await getHmacKey();
    const enc = new TextEncoder();
    const sigBuffer = hexToBuffer(signatureHex);
    const isValid = await crypto.subtle.verify('HMAC', key, sigBuffer, enc.encode(data));

    if (!isValid) return { valid: false };

    const payload = atob(b64Payload);
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}
