import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processFollowUps } from '../lib/followup';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  await processFollowUps();
  return res.status(200).json({ ok: true, ts: new Date().toISOString() });
}
