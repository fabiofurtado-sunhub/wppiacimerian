import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleMessage } from '../lib/agent';
import { getSession, saveSession, clearSession } from '../lib/session';
import { sendMessage } from '../lib/zapi';
import { saveLeadToSheets } from '../lib/sheets';


function isTrigger(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!?.]/g, '')
    .trim();
  const triggers = [
    'ola gostaria de fazer um orcamento dos equipamentos em estoque',
    'quero fazer um orcamento com 10 de entrada e o restante em 48x',
    'ola gostaria de fazer um orcamento para o projeto layout cimerian',
    'ola gostaria de mais informacoes sobre os equipamentos cimerian',
    'ola gostaria de fazer um orcamento de equipamentos de cardio',
  ];
  const resultado = triggers.some((t) => normalized.includes(t));
  console.log('[isTrigger] normalized:', normalized);
  console.log('[isTrigger] resultado:', resultado);
  return resultado;
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

    console.log('[webhook] leadData extraído:', JSON.stringify(leadData));
    if (leadData) {
      console.log('[webhook] chamando saveLeadToSheets...');
      await saveLeadToSheets({ ...leadData, phone });
      await clearSession(phone);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook] erro:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
