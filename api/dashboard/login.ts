import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signJWT, hashPassword } from '../../lib/jwt';

interface DashboardUser {
  email: string;
  password: string;
  name: string;
  role: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

  const users: DashboardUser[] = JSON.parse(process.env.DASHBOARD_USERS || '[]');
  const user = users.find((u) => u.email === email);

  if (!user || user.password !== hashPassword(password)) {
    return res.status(401).json({ error: 'Email ou senha inválidos' });
  }

  const token = signJWT({ email: user.email, name: user.name, role: user.role });
  return res.status(200).json({ token, name: user.name, role: user.role });
}
