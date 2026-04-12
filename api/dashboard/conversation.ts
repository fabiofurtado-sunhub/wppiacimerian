import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { verifyJWT } from '../../lib/jwt';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { verifyJWT(auth.slice(7)); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  const phone = req.query.phone as string;
  if (!phone) return res.status(400).json({ error: 'phone is required' });

  const session = await redis.get<Record<string, any>>('session:' + phone);
  if (!session) return res.status(404).json({ error: 'Conversation not found' });

  return res.status(200).json(session);
}
