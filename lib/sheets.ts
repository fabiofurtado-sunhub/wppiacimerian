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

export async function upsertLead(lead: Record<string, string>): Promise<void> {
  try {
    const sheets = await getSheets();
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads_Ads!B:B',
    });

    const rows = existing.data.values || [];
    const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === lead.phone);
    console.log('[sheets] buscando phone:', lead.phone, '| rowIndex:', rowIndex, '| total rows:', rows.length);

    const nomeParaSalvar = (lead.nome && lead.nome.trim() !== '') ? lead.nome : (lead.nomeWhatsapp || '');

    const row = [
      lead.timestamp || now,
      lead.phone || '',
      nomeParaSalvar,
      lead.cidade || '',
      lead.estado || '',
      lead.perfil || '',
      lead.nome_academia || '',
      lead.proprietario || '',
      lead.faturamento_mensal != null && lead.faturamento_mensal !== '' ? String(lead.faturamento_mensal) : '',
      lead.interesse_equipamento || '',
      lead.quer_catalogo || '',
      lead.agendamento || '',
      lead.status || '',
      lead.tag || '',
      lead.utm_source || '',
      lead.utm_medium || '',
      lead.utm_campaign || '',
      lead.utm_content || '',
    ];

    if (rowIndex > 0) {
      const sheetRow = rowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Leads_Ads!A${sheetRow}:R${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });
      console.log('[sheets] lead atualizado na linha', sheetRow);
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Leads_Ads!A:R',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });
      console.log('[sheets] novo lead inserido');
    }
  } catch (err) {
    console.error('[sheets] erro no upsert:', err);
  }
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
      lead.faturamento_mensal != null && lead.faturamento_mensal !== '' ? String(lead.faturamento_mensal) : '',
      lead.interesse_equipamento || '',
      lead.quer_catalogo || '',
      lead.agendamento || '',
      lead.status || '',
      lead.tag || '',
      lead.utm_source || '',
      lead.utm_medium || '',
      lead.utm_campaign || '',
      lead.utm_content || '',
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Leads_Ads!A:R',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  } catch (err) {
    console.error('[sheets] erro ao salvar:', err);
  }
}
