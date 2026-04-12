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
Cidade e estado devem ser sempre separados em campos distintos. Exemplos: "Londrina PR" → cidade: "Londrina", estado: "PR" | "Londrina, Paraná" → cidade: "Londrina", estado: "PR" | "São Paulo SP" → cidade: "São Paulo", estado: "SP" | "Belo Horizonte - MG" → cidade: "Belo Horizonte", estado: "MG". Use sempre a sigla de 2 letras maiúsculas para estado.
Corrija erros de digitação comuns automaticamente. Exemplos: "londrina", "Londrina", "londrina pr" → cidade: "Londrina", estado: "PR" | "sao paulo", "São Paulo", "SP" → cidade: "São Paulo", estado: "SP" | "bh", "belo horizonte" → cidade: "Belo Horizonte", estado: "MG" | "rj", "rio" → cidade: "Rio de Janeiro", estado: "RJ". Estado deve ser SEMPRE a sigla UF com 2 letras maiúsculas. Nunca escrever o nome completo do estado.
Formato:
{"nome":"","cidade":"","estado":"","perfil":"","nome_academia":"","proprietario":"","faturamento_mensal":"","interesse_equipamento":""}`,
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
    const extraction = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: `Você é um extrator de dados. Analise a conversa e retorne SOMENTE um JSON válido, sem texto adicional, sem markdown, sem backticks.
O campo faturamento_mensal deve ser sempre um número inteiro em reais, sem símbolos. Exemplos de conversão: "cinquenta mil" → 50000, "R$50k" → 50000, "50 mil reais" → 50000, "250.000" → 250000, "não informado" → 0.
Cidade e estado devem ser sempre separados em campos distintos. Exemplos: "Londrina PR" → cidade: "Londrina", estado: "PR" | "Londrina, Paraná" → cidade: "Londrina", estado: "PR" | "São Paulo SP" → cidade: "São Paulo", estado: "SP" | "Belo Horizonte - MG" → cidade: "Belo Horizonte", estado: "MG". Use sempre a sigla de 2 letras maiúsculas para estado.
Corrija erros de digitação comuns automaticamente. Exemplos: "londrina", "Londrina", "londrina pr" → cidade: "Londrina", estado: "PR" | "sao paulo", "São Paulo", "SP" → cidade: "São Paulo", estado: "SP" | "bh", "belo horizonte" → cidade: "Belo Horizonte", estado: "MG" | "rj", "rio" → cidade: "Rio de Janeiro", estado: "RJ". Estado deve ser SEMPRE a sigla UF com 2 letras maiúsculas. Nunca escrever o nome completo do estado.
Campos obrigatórios:
{
  "nome": "",
  "cidade": "",
  "estado": "",
  "perfil": "pessoal|academia",
  "nome_academia": "",
  "proprietario": "sim|não|não informado",
  "faturamento_mensal": 0,
  "interesse_equipamento": "",
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
