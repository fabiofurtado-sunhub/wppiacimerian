import { google } from 'googleapis';

const SPREADSHEET_ID = '1CtIJtVz1NCILmNh5nhvIR4uammC937g2mO0vuq13Xx4';

async function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

export async function saveLeadToSheets(lead: Record<string, string>): Promise<void> {
  console.log('[sheets] tentando salvar lead:', JSON.stringify(lead));
  try {
    const sheets = await getSheets();
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const row = [
      now,
      lead.phone || '',
      lead.nome || '',
      lead.cidade || '',
      lead.estado || '',
      lead.perfil || '',
      lead.nome_academia || '',
      lead.proprietario || '',
      lead.faturamento_mensal || '',
      lead.interesse_equipamento || '',
      lead.quer_catalogo || '',
      lead.agendamento || '',
      lead.status || '',
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads_Ads!A:M',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  } catch (err) {
    console.error('[sheets] erro ao salvar:', err);
  }
}
