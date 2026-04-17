import Anthropic from '@anthropic-ai/sdk';
import { Session } from './session';
import { SYSTEM_PROMPT } from './prompt';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface HandleResult {
  reply: string;
  sessionUpdated: Session;
  leadData: Record<string, string> | null;
}

export async function handleMessage(
  text: string,
  session: Session
): Promise<HandleResult> {
  const history = [...session.history, { role: 'user' as const, content: text }];

  const nowBR = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', hour: 'numeric', minute: 'numeric' });
  const dateBR = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const day = dateBR.getDay();

  let proximoDiaUtil = '';
  if (day === 5) {
    const seg = new Date(dateBR);
    seg.setDate(dateBR.getDate() + 3);
    proximoDiaUtil = 'segunda-feira, ' + seg.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  } else if (day === 6) {
    const seg = new Date(dateBR);
    seg.setDate(dateBR.getDate() + 2);
    proximoDiaUtil = 'segunda-feira, ' + seg.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  } else if (day === 0) {
    const seg = new Date(dateBR);
    seg.setDate(dateBR.getDate() + 1);
    proximoDiaUtil = 'segunda-feira, ' + seg.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  }

  const ctx = `

[CONTEXTO DO SISTEMA]
Agora: ${nowBR}
É fim de semana: ${[0, 6].includes(day) || day === 5 ? 'SIM' : 'NÃO'}
${proximoDiaUtil ? `ATENÇÃO: Hoje é ${day === 5 ? 'sexta-feira' : 'fim de semana'}. O próximo dia útil disponível para agendamento é ${proximoDiaUtil}. NUNCA ofereça sábado ou domingo. Use APENAS ${proximoDiaUtil} como opção de data.` : `Próximo dia útil: amanhã`}`;

  const systemWithContext = `${SYSTEM_PROMPT}${ctx}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: systemWithContext,
    messages: history,
  });

  const reply = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const updatedHistory = [...history, { role: 'assistant' as const, content: reply }];

  const replyLower = reply.toLowerCase();
  const isEnded =
    replyLower.includes('grande abs') ||
    replyLower.includes('até lá') ||
    replyLower.includes('até logo') ||
    replyLower.includes('obrigado pelo interesse na cimerian') ||
    updatedHistory.length > 40;

  console.log('[agent] reply preview:', reply.substring(0, 100));
  console.log('[agent] isEnded:', isEnded);

  let leadData: Record<string, string> | null = null;
  if (isEnded) {
    leadData = await extractLeadData(updatedHistory);
  }

  return {
    reply,
    sessionUpdated: {
      ...session,
      history: updatedHistory,
      active: !isEnded,
    },
    leadData,
  };
}

export async function extractPartialData(
  history: { role: string; content: string }[]
): Promise<Record<string, string> | null> {
  if (history.length < 3) return null;
  try {
    const extraction = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: `Você é um extrator de dados parciais. Analise a conversa e retorne SOMENTE um JSON válido com os campos coletados até agora. Campos ainda desconhecidos deixe como string vazia. Se nenhum dado relevante foi coletado além da saudação, retorne exatamente: null
Formato:
{"nome":"","perfil":"","nome_academia":"","proprietario":"","pronta_entrega":"","quer_catalogo":"","agendamento":"","status":""}`,
      messages: [{ role: 'user', content: `Conversa: ${JSON.stringify(history)}` }],
    });

    const raw = extraction.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (raw === 'null') return null;
    const data = JSON.parse(raw);
    if (!data.nome) return null;
    return data;
  } catch {
    return null;
  }
}

async function extractLeadData(
  history: { role: string; content: string }[]
): Promise<Record<string, string> | null> {
  try {
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const extraction = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: `Você é um extrator de dados. Analise a conversa e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem backticks.

O campo agendamento deve ser sempre uma data e hora completa e formatada.
A data de hoje é: ${hoje}
Exemplos de conversão:
- "amanhã às nove da manhã" → calcule a data real de amanhã e formate como: "22/04/2026 09:00"
- "segunda-feira às dez da manhã" → calcule a data real da próxima segunda e formate como: "27/04/2026 10:00"
- "hoje às três da tarde" → formate como: "${hoje} 15:00"
SEMPRE retorne no formato DD/MM/YYYY HH:MM — nunca retorne texto como "amanhã" ou "segunda-feira".

Campos obrigatórios:
{
  "nome": "",
  "perfil": "pessoal|academia",
  "nome_academia": "",
  "proprietario": "sim|não|não informado",
  "pronta_entrega": "sim|não|em construção|não informado",
  "quer_catalogo": "sim|não",
  "agendamento": "",
  "status": "agendado|catalogo_enviado|desistiu|incompleto"
}`,
      messages: [
        {
          role: 'user',
          content: `Conversa: ${JSON.stringify(history)}`,
        },
      ],
    });

    const raw = extraction.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return JSON.parse(raw);
  } catch {
    return null;
  }
}
