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

  // Scan all session:* keys from Redis
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [next, batch] = await redis.scan(cursor, { match: 'session:*', count: 100 });
    cursor = next;
    keys.push(...batch);
  } while (cursor !== 0);

  if (keys.length === 0) return res.status(200).json([]);

  const sessions = (await redis.mget(...keys)) as (Record<string, any> | null)[];

  const result = sessions
    .map((session, idx) => {
      if (!session) return null;
      const phone = session.phone || keys[idx].replace('session:', '');
      const history: { role: string; content: string }[] = session.history || [];
      const lastMsg = history[history.length - 1];
      return {
        phone,
        leadName: session.leadName || '',
        active: session.active,
        status: session.active ? 'em_andamento' : 'encerrado',
        tag: session.tag || '',
        messageCount: history.length,
        lastMessage: lastMsg?.content?.substring(0, 80) || '',
        lastRole: lastMsg?.role || '',
      };
    })
    .filter(Boolean);

  return res.status(200).json(result);
}
