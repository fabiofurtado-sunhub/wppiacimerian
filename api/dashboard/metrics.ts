import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { verifyJWT } from '../../lib/jwt';

const SPREADSHEET_ID = '1CtIJtVz1NCILmNh5nhvIR4uammC937g2mO0vuq13Xx4';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { verifyJWT(auth.slice(7)); } catch { return res.status(401).json({ error: 'Invalid token' }); }

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

    const tz = 'America/Sao_Paulo';
    const today = new Date().toLocaleDateString('pt-BR', { timeZone: tz });

    // Build last-7-days map keyed by pt-BR date string
    const last7: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7[d.toLocaleDateString('pt-BR', { timeZone: tz })] = 0;
    }

    let todayCount = 0;
    let scheduledCount = 0;
    const tagBreakdown: Record<string, number> = {};

    rows.forEach((row) => {
      // row[0] = "12/04/2026, 14:30:00"  row[12] = status  row[13] = tag
      const dateStr = (row[0] || '').split(',')[0].trim();
      const status = row[12] || '';
      const tag = row[13] || '';

      if (dateStr === today) todayCount++;
      if (status === 'agendado') scheduledCount++;
      if (tag) tagBreakdown[tag] = (tagBreakdown[tag] || 0) + 1;
      if (Object.prototype.hasOwnProperty.call(last7, dateStr)) last7[dateStr]++;
    });

    return res.status(200).json({
      todayCount,
      scheduledCount,
      totalLeads: rows.length,
      conversionRate: rows.length > 0 ? Math.round((scheduledCount / rows.length) * 100) : 0,
      tagBreakdown,
      last7Days: last7,
    });
  } catch (err) {
    console.error('[dashboard/metrics] erro:', err);
    return res.status(500).json({ error: 'Erro ao calcular métricas' });
  }
}
