import crypto from 'crypto';

export interface JWTPayload {
  email: string;
  name: string;
  role: string;
  exp: number;
}

function b64u(s: string): string {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const JWT_HEADER = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export function signJWT(payload: Omit<JWTPayload, 'exp'>): string {
  const secret = process.env.DASHBOARD_JWT_SECRET || '';
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 * 7 }));
  const sig = crypto.createHmac('sha256', secret).update(JWT_HEADER + '.' + body).digest('base64url');
  return JWT_HEADER + '.' + body + '.' + sig;
}

export function verifyJWT(token: string): JWTPayload {
  const secret = process.env.DASHBOARD_JWT_SECRET || '';
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [h, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(h + '.' + body).digest('base64url');
  if (sig !== expected) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as JWTPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}
