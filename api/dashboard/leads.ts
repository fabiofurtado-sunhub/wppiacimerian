import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { verifyJWT } from '../../lib/jwt';

const SPREADSHEET_ID = '1CtIJtVz1NCILmNh5nhvIR4uammC937g2mO0vuq13Xx4';
const COLS = [
  'timestamp', 'telefone', 'nome', 'cidade', 'estado', 'perfil',
  'nome_academia', 'proprietario', 'faturamento_mensal', 'interesse_equipamento',
  'quer_catalogo', 'agendamento', 'status', 'tag',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
];

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

    const rows = response.data.values || [];
    // Skip first row if it looks like a header (non-date value in col A)
    const dataRows = rows.filter((r) => r[0] && /\d/.test(r[0]));

    const leads = dataRows.map((row) => {
      const obj: Record<string, string> = {};
      COLS.forEach((col, i) => { obj[col] = row[i] || ''; });
      return obj;
    });

    return res.status(200).json(leads);
  } catch (err) {
    console.error('[dashboard/leads] erro:', err);
    return res.status(500).json({ error: 'Erro ao ler planilha' });
  }
}
