import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { google } from 'googleapis';
import { verifyJWT } from '../../lib/jwt';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const SPREADSHEET_ID = '1CtIJtVz1NCILmNh5nhvIR4uammC937g2mO0vuq13Xx4';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { verifyJWT(auth.slice(7)); } catch { return res.status(401).json({ error: 'Invalid token' }); }

  // 1. Read active sessions from Redis
  const redisMap = new Map<string, Record<string, any>>();
  try {
    const keys: string[] = [];
    let cursor = 0;
    do {
      const result = await redis.scan(cursor, { match: 'session:*', count: 100 });
      cursor = Number(result[0]);
      keys.push(...result[1]);
    } while (cursor !== 0);

    if (keys.length > 0) {
      const sessions = (await redis.mget(...keys)) as (Record<string, any> | null)[];
      sessions.forEach((session, idx) => {
        if (!session) return;
        const phone = session.phone || keys[idx].replace('session:', '');
        const history: { role: string; content: string }[] = session.history || [];
        const lastMsg = history[history.length - 1];
        redisMap.set(phone, {
          phone,
          leadName: session.leadName || '',
          active: session.active ?? false,
          status: session.active ? 'em_andamento' : 'encerrado',
          tag: session.tag || '',
          messageCount: history.length,
          lastMessage: lastMsg?.content?.substring(0, 100) || '',
          lastRole: lastMsg?.role || '',
          timestamp: '',
          cidade: '',
          estado: '',
        });
      });
    }
  } catch (err) {
    console.error('[conversations] Redis error:', err);
  }

  // 2. Read historical leads from Google Sheets
  const sheetsMap = new Map<string, Record<string, any>>();
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
    const googleAuth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth: googleAuth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads_Ads!A:R',
    });
    const rows = (response.data.values || []).filter((r) => r[0] && /\d/.test(r[0]));
    for (const row of rows) {
      const phone = row[1] || '';
      if (!phone) continue;
      // col: 0=timestamp,1=telefone,2=nome,3=cidade,4=estado,5=perfil,...,12=status,13=tag
      sheetsMap.set(phone, {
        phone,
        leadName: row[2] || '',
        active: false,
        status: row[12] || 'encerrado',
        tag: row[13] || '',
        messageCount: 0,
        lastMessage: row[11] || '',  // col 11 = agendamento
        lastRole: '',
        timestamp: row[0] || '',
        cidade: row[3] || '',
        estado: row[4] || '',
      });
    }
  } catch (err) {
    console.error('[conversations] Sheets error:', err);
  }

  // 3. Merge: Sheets is the base, Redis overrides with priority (has live data)
  const merged = new Map<string, Record<string, any>>();
  for (const [phone, data] of sheetsMap) {
    merged.set(phone, { ...data });
  }
  for (const [phone, data] of redisMap) {
    const sheetsEntry = sheetsMap.get(phone) || {};
    merged.set(phone, {
      cidade: sheetsEntry.cidade || '',
      estado: sheetsEntry.estado || '',
      timestamp: sheetsEntry.timestamp || '',
      ...data,
    });
  }

  const result = Array.from(merged.values()).sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (b.timestamp || '').localeCompare(a.timestamp || '');
  });

  return res.status(200).json(result);
}
