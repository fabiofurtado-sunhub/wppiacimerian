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

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const reply = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const updatedHistory = [...history, { role: 'assistant' as const, content: reply }];

  const isEnded =
    reply.toLowerCase().includes('até lá') ||
    reply.toLowerCase().includes('até logo') ||
    updatedHistory.length > 40;

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

async function extractLeadData(
  history: { role: string; content: string }[]
): Promise<Record<string, string> | null> {
  try {
    const extraction = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: `Você é um extrator de dados. Analise a conversa e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem backticks.
Campos obrigatórios:
{
  "nome": "",
  "cidade": "",
  "estado": "",
  "perfil": "pessoal|academia",
  "nome_academia": "",
  "proprietario": "sim|não|não informado",
  "faturamento_mensal": "",
  "interesse_equipamento": "",
  "quer_catalogo": "sim|não",
  "agendamento": "",
  "status": "agendado|desistiu|incompleto"
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
