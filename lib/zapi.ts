const BASE = () =>
  `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}`;

export async function sendMessage(phone: string, text: string): Promise<void> {
  const clean = phone.replace(/\D/g, '');
  const res = await fetch(`${BASE()}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: clean, message: text }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[zapi] erro ao enviar:', err);
  }
}
