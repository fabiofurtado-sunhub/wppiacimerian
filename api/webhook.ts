import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleMessage } from '../lib/agent';
import { getSession, saveSession, clearSession } from '../lib/session';
import { sendMessage } from '../lib/zapi';
import { saveLeadToSheets } from '../lib/sheets';

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
      session.phone = phone;
      session.history = [];
      session.tag = getTriggerTag(text);
      session.utm_source = '';
      session.utm_medium = '';
      session.utm_campaign = '';
      session.utm_content = '';
    }

    const { reply, sessionUpdated, leadData } = await handleMessage(text, session);

    await saveSession(phone, sessionUpdated);
    await sendMessage(phone, reply);

    console.log('[webhook] leadData extraído:', JSON.stringify(leadData));
    if (leadData) {
      console.log('[webhook] chamando saveLeadToSheets...');
      await saveLeadToSheets({
        ...leadData,
        phone,
        tag: session.tag || '',
        utm_source: session.utm_source || '',
        utm_medium: session.utm_medium || '',
        utm_campaign: session.utm_campaign || '',
        utm_content: session.utm_content || '',
      });
      await clearSession(phone);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook] erro:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
