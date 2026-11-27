// Token sesi: base64url(payload) + "." + HMAC-SHA256. Berlaku 12 jam.
import { createHmac, timingSafeEqual } from 'node:crypto';

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET belum diatur di Netlify');
  return s;
};

export function sign(id) {
  const body = Buffer.from(JSON.stringify({ id, exp: Date.now() + 12 * 3600_000 })).toString('base64url');
  const mac = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

// Mengembalikan ID pengguna jika token valid dan belum kedaluwarsa, selain itu null.
export function verify(tok) {
  try {
    if (!tok || !tok.includes('.')) return null;
    const [body, mac] = tok.split('.');
    const expected = createHmac('sha256', secret()).update(body).digest('base64url');
    const a = Buffer.from(mac), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p.id : null;
  } catch {
    return null;
  }
}
