import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleMessage } from '../lib/agent';
import { getSession, saveSession, clearSession } from '../lib/session';
import { sendMessage } from '../lib/zapi';
import { saveLeadToSheets } from '../lib/sheets';

const TRIGGER_MESSAGES = [
  'olá! gostaria de fazer um orçamento dos equipamentos em estoque',
  'quero fazer um orçamento com 10% de entrada e o restante em 48x',
  'olá! gostaria de fazer um orçamento para o projeto layout cimerian',
  'olá! gostaria de mais informações sobre os equipamentos cimerian',
  'olá! gostaria de fazer um orçamento de equipamentos de cardio',
];

function isTrigger(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/[!?.]/g, '');
  return TRIGGER_MESSAGES.some((t) => normalized.includes(t));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const body = req.body;
    console.log('[webhook] body recebido:', JSON.stringify(body));

    // Compatibilidade com formato ZAPI
    const phone: string =
      body?.phone ||
      body?.chatId?.replace('@c.us', '') ||
      body?.from?.replace('@c.us', '') ||
      body?.sender?.replace('@c.us', '') ||
      body?.data?.phone ||
      '';
    const text: string =
      body?.text?.message ||
      body?.message?.text ||
      body?.message ||
      body?.body ||
      body?.content ||
      body?.data?.message ||
      (typeof body?.text === 'string' ? body.text : '') ||
      '';
    const name: string =
      body?.senderName ||
      body?.pushName ||
      body?.notifyName ||
      '';

    // Ignora se não tiver phone ou texto
    if (!phone || !text) return res.status(200).json({ ok: true });

    // Ignora mensagens enviadas por mim (fromMe)
    if (body?.fromMe === true) return res.status(200).json({ ok: true });

    const session = await getSession(phone);

    // Sem sessão ativa: verifica gatilho
    if (!session.active) {
      if (!isTrigger(text)) return res.status(200).json({ ok: true });
      // Inicia sessão
      session.active = true;
      session.leadName = name;
      session.phone = phone;
      session.history = [];
    }

    const { reply, sessionUpdated, leadData } = await handleMessage(text, session);

    await saveSession(phone, sessionUpdated);
    await sendMessage(phone, reply);

    if (leadData) {
      await saveLeadToSheets({ ...leadData, phone });
      await clearSession(phone);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook] erro:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
