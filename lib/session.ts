import { Redis } from '@upstash/redis';

export interface Session {
  active: boolean;
  leadName: string;
  nomeWhatsapp: string;
  phone: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  tag: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const SESSION_TTL = 60 * 60 * 2; // 2 horas

export async function getSession(phone: string): Promise<Session> {
  const data = await redis.get<Session>(`session:${phone}`);
  return data ?? { active: false, leadName: '', nomeWhatsapp: '', phone, history: [], tag: '', utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '' };
}

export async function saveSession(phone: string, session: Session): Promise<void> {
  await redis.set(`session:${phone}`, session, { ex: SESSION_TTL });
}

export async function clearSession(phone: string): Promise<void> {
  await redis.del(`session:${phone}`);
}
