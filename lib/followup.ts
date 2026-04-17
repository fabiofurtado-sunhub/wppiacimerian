import { Redis } from '@upstash/redis';
import { sendMessage } from './zapi';
import { upsertLead } from './sheets';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const INTERVALS = [30, 120, 360, 720, 1440, 2880]; // minutos

const MESSAGES = [
  (nome: string) => `${nome ? 'Oi ' + nome + '!' : 'Oi!'} Vi que você se interessou pelos equipamentos Cimerian 🏋🏻\nTemos pronta entrega disponível e condições especiais. Ainda posso te ajudar?`,
  (nome: string) => `${nome || 'Olá'}! Nosso consultor está aguardando para apresentar as melhores opções pra você 💪\nQual o melhor horário para uma conversa rápida?`,
  (nome: string) => `${nome || 'Olá'}, a Cimerian está aqui! Equipamentos premium com pronta entrega disponível.\nPosso reservar um horário com nosso especialista pra você hoje?`,
  (nome: string) => `Oi${nome ? ' ' + nome : ''}! Não quero que você perca as condições especiais dessa semana 🏋🏻\nTem 5 minutinhos para uma conversa rápida com nosso consultor?`,
  (nome: string) => `${nome || 'Olá'}, último lembrete! Nosso consultor pode te apresentar o portfólio completo Cimerian.\nQuer agendar? É rápido e sem compromisso 💪`,
  (nome: string) => `${nome || 'Olá'}, entendo que o momento pode não ser agora.\nQuando precisar de equipamentos fitness de alta performance, a Cimerian estará aqui. Grande abs! 🏋🏻`,
];

function isBusinessHour(): boolean {
  const now = new Date();
  const brt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const day = brt.getDay();
  const hour = brt.getHours();
  return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
}

export interface FollowUpState {
  phone: string;
  nome: string;
  step: number;
  scheduledAt: number;
  active: boolean;
}

export async function scheduleFollowUp(phone: string, nome: string): Promise<void> {
  const key = `followup:${phone}`;
  const existing = await redis.get<FollowUpState>(key);
  if (existing && existing.active) return;

  const state: FollowUpState = {
    phone,
    nome,
    step: 0,
    scheduledAt: Date.now() + INTERVALS[0] * 60 * 1000,
    active: true,
  };
  await redis.set(key, state, { ex: 60 * 60 * 24 * 7 });
}

export async function cancelFollowUp(phone: string): Promise<void> {
  const key = `followup:${phone}`;
  await redis.del(key);
}

export async function processFollowUps(): Promise<void> {
  if (!isBusinessHour()) return;

  const keys = await redis.keys('followup:*');
  const now = Date.now();

  for (const key of keys) {
    const state = await redis.get<FollowUpState>(key);
    if (!state || !state.active) continue;
    if (now < state.scheduledAt) continue;

    try {
      const msg = MESSAGES[state.step](state.nome);
      await sendMessage(state.phone, msg);

      const nextStep = state.step + 1;
      if (nextStep >= INTERVALS.length) {
        await redis.del(key);
        await upsertLead({ phone: state.phone, status: 'sem_resposta' });
      } else {
        await redis.set(key, {
          ...state,
          step: nextStep,
          scheduledAt: now + INTERVALS[nextStep] * 60 * 1000,
        }, { ex: 60 * 60 * 24 * 7 });
      }
    } catch (err) {
      console.error('[followup] erro:', state.phone, err);
    }
  }
}
