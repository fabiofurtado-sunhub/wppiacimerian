import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleMessage, extractPartialData } from '../lib/agent';
import { getSession, saveSession, clearSession } from '../lib/session';
import { sendMessage } from '../lib/zapi';
import { upsertLead } from '../lib/sheets';

const TRIGGERS = [
  { keywords: ['orcamento dos equipamentos em estoque'], tag: 'Padrao' },
  { keywords: ['10% de entrada', '10 de entrada', 'restante em 48x', '48x'], tag: '10%+48x' },
  { keywords: ['projeto layout cimerian', 'orcamento para o projeto layout'], tag: 'Layout' },
  { keywords: ['mais informacoes sobre os equipamentos cimerian'], tag: 'Padrao' },
  { keywords: ['orcamento de equipamentos de cardio', 'equipamentos de cardio'], tag: 'Cardio' },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!?.]/g, '')
    .trim();
}

function isTrigger(text: string): boolean {
  const n = normalize(text);
  return TRIGGERS.some((t) => t.keywords.some((k) => n.includes(normalize(k))));
}

function getTriggerTag(text: string): string {
  const n = normalize(text);
  const match = TRIGGERS.find((t) => t.keywords.some((k) => n.includes(normalize(k))));
  return match?.tag || 'Padrao';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const body = req.body;
    console.log('[webhook] body recebido:', JSON.stringify(body));

    // Ignora mensagens de grupo
    if (body?.isGroup === true) return res.status(200).json({ ok: true });

    // Ignora mensagens de status
    if (body?.isStatusReply === true) return res.status(200).json({ ok: true });

    // Ignora mensagens enviadas por mim (fromMe)
    if (body?.fromMe === true) return res.status(200).json({ ok: true });

    // Extração de campos — phone vem direto (grupos já ignorados acima)
    const phone: string = body?.phone || '';
    const text: string = body?.text?.message || '';
    const name: string =
      body?.senderName ||
      body?.pushName ||
      body?.notifyName ||
      '';

    // Ignora mídias e mensagens sem texto puro
    if (!text || body?.video || body?.image || body?.audio || body?.document) {
      return res.status(200).json({ ok: true });
    }

    // Ignora se não tiver phone
    if (!phone) return res.status(200).json({ ok: true });

    console.log('[webhook] phone:', phone);
    console.log('[webhook] text:', text);

    const session = await getSession(phone);
    console.log('[webhook] session.active:', session.active);

    // Sem sessão ativa: verifica gatilho
    if (!session.active) {
      const triggered = isTrigger(text);
      console.log('[isTrigger] normalized:', normalize(text));
      console.log('[isTrigger] resultado:', triggered);
      if (!triggered) return res.status(200).json({ ok: true });

      // Inicia sessão
      session.active = true;
      session.leadName = name;
      session.nomeWhatsapp = name; // fallback: nome do WhatsApp, será substituído pelo nome real informado na conversa
      session.phone = phone;
      session.history = [];
      session.tag = getTriggerTag(text);
      session.utm_source = '';
      session.utm_medium = '';
      session.utm_campaign = '';
      session.utm_content = '';

      // MOMENTO 1 — salva lead ao entrar no funil (nome vazio: será preenchido pela IA durante a conversa)
      console.log('[sheets] MOMENTO 1 - iniciando upsert gatilho');
      await upsertLead({
        phone,
        nome: '',
        nomeWhatsapp: name,
        tag: session.tag,
        status: 'iniciado',
      });
    }

    const { reply, sessionUpdated, leadData } = await handleMessage(text, session);

    await saveSession(phone, sessionUpdated);
    await sendMessage(phone, reply);

    console.log('[webhook] leadData extraído:', JSON.stringify(leadData));

    if (leadData) {
      // MOMENTO 3 — encerramento: salva dados completos
      console.log('[sheets] MOMENTO 3 - leadData final:', JSON.stringify(leadData));
      await upsertLead({
        ...leadData,
        phone,
        nomeWhatsapp: session.nomeWhatsapp || '',
        tag: session.tag || '',
        utm_source: session.utm_source || '',
        utm_medium: session.utm_medium || '',
        utm_campaign: session.utm_campaign || '',
        utm_content: session.utm_content || '',
      });
      await clearSession(phone);
    } else if (sessionUpdated.history.length >= 6) {
      // MOMENTO 2 — mid-conversation: só executa com 6+ mensagens e se nome já foi coletado
      const partialData = await extractPartialData(sessionUpdated.history);
      console.log('[sheets] MOMENTO 2 - partialData:', JSON.stringify(partialData));
      if (partialData) {
        await upsertLead({
          ...partialData,
          phone,
          nomeWhatsapp: session.nomeWhatsapp || '',
          tag: session.tag || '',
          utm_source: session.utm_source || '',
          utm_medium: session.utm_medium || '',
          utm_campaign: session.utm_campaign || '',
          utm_content: session.utm_content || '',
          status: 'em_andamento',
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook] erro:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
