import type { VercelRequest, VercelResponse } from '@vercel/node';

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Cimerian — Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
  body { background:#0a0a0a; color:#e5e5e5; font-family:system-ui,sans-serif; margin:0; }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:#111; }
  ::-webkit-scrollbar-thumb { background:#333; border-radius:3px; }
  * { box-sizing:border-box; }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { useState, useEffect, useCallback, useRef } = React;

/* ── utils ── */
function parseJWT(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  } catch { return null; }
}
function isTokenValid(token) {
  if (!token) return false;
  const p = parseJWT(token);
  return p && p.exp > Math.floor(Date.now() / 1000);
}
function StatusBadge({ status }) {
  const MAP = {
    em_andamento: ['bg-yellow-950 text-yellow-300', 'Em andamento'],
    agendado:     ['bg-green-950 text-green-300',  'Agendado'],
    iniciado:     ['bg-zinc-800 text-zinc-400',    'Iniciado'],
    incompleto:   ['bg-zinc-800 text-zinc-400',    'Incompleto'],
    desistiu:     ['bg-red-950 text-red-400',      'Desistiu'],
    encerrado:    ['bg-zinc-800 text-zinc-500',    'Encerrado'],
  };
  const [cls, label] = MAP[status] || ['bg-zinc-800 text-zinc-500', status || '—'];
  return React.createElement('span', { className: 'text-xs px-2 py-0.5 rounded-full ' + cls }, label);
}

/* ── API helper ── */
async function apiFetch(path, token, opts) {
  opts = opts || {};
  const res = await fetch(path, Object.assign({}, opts, {
    headers: Object.assign({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, opts.headers || {}),
  }));
  if (res.status === 401) throw Object.assign(new Error('unauthorized'), { status: 401 });
  return res.json();
}

/* ── Login ── */
function LoginScreen({ onLogin }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/dashboard/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao fazer login'); return; }
      localStorage.setItem('cimerian_token', data.token);
      onLogin(data.token, { name: data.name, role: data.role });
    } catch { setError('Erro de conexão'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0a0a0a' }}>
      <div style={{ width:'100%', maxWidth:'360px', background:'#111', border:'1px solid #222', borderRadius:'12px', padding:'2rem' }}>
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ fontSize:'1.75rem', fontWeight:'800', color:'#dc2626', letterSpacing:'0.15em' }}>CIMERIAN</div>
          <div style={{ fontSize:'0.7rem', color:'#555', textTransform:'uppercase', letterSpacing:'0.1em', marginTop:'0.25rem' }}>Painel Comercial</div>
        </div>
        <form onSubmit={submit}>
          <div style={{ marginBottom:'1rem' }}>
            <label style={{ display:'block', fontSize:'0.7rem', color:'#888', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.35rem' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="email@cimerian.com.br"
              style={{ width:'100%', padding:'0.5rem 0.75rem', background:'#1a1a1a', border:'1px solid #333', borderRadius:'6px', color:'#e5e5e5', fontSize:'0.875rem', outline:'none' }} />
          </div>
          <div style={{ marginBottom:'1.25rem' }}>
            <label style={{ display:'block', fontSize:'0.7rem', color:'#888', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.35rem' }}>Senha</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{ width:'100%', padding:'0.5rem 0.75rem', background:'#1a1a1a', border:'1px solid #333', borderRadius:'6px', color:'#e5e5e5', fontSize:'0.875rem', outline:'none' }} />
          </div>
          {error && <div style={{ color:'#f87171', fontSize:'0.8rem', marginBottom:'0.75rem' }}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:'0.6rem', background:'#dc2626', border:'none', borderRadius:'6px', color:'#fff', fontWeight:'600', fontSize:'0.875rem', cursor:loading?'not-allowed':'pointer', opacity:loading?0.6:1 }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Sidebar ── */
function Sidebar({ user, activeTab, setActiveTab, onLogout }) {
  const items = [
    { id:'conversations', icon:'💬', label:'Conversas' },
    { id:'leads',         icon:'📋', label:'Leads'     },
    { id:'metrics',       icon:'📊', label:'Métricas'  },
  ];
  return (
    <div style={{ width:'210px', flexShrink:0, background:'#111', borderRight:'1px solid #222', display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ padding:'1.25rem 1.25rem 0.75rem' }}>
        <div style={{ fontSize:'1.1rem', fontWeight:'800', color:'#dc2626', letterSpacing:'0.15em' }}>CIMERIAN</div>
        <div style={{ fontSize:'0.65rem', color:'#444', marginTop:'2px' }}>Painel Comercial</div>
      </div>
      <nav style={{ flex:1, padding:'0.5rem 0.75rem' }}>
        {items.map(it => (
          <button key={it.id} onClick={() => setActiveTab(it.id)}
            style={{ width:'100%', textAlign:'left', padding:'0.6rem 0.75rem', borderRadius:'6px', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.6rem', fontSize:'0.875rem', marginBottom:'2px',
              background: activeTab===it.id ? '#1f1f1f' : 'transparent',
              color: activeTab===it.id ? '#e5e5e5' : '#666' }}>
            <span>{it.icon}</span>{it.label}
          </button>
        ))}
      </nav>
      <div style={{ padding:'1rem', borderTop:'1px solid #1f1f1f' }}>
        <div style={{ fontSize:'0.8rem', color:'#ccc', marginBottom:'2px' }}>{user.name}</div>
        <div style={{ fontSize:'0.7rem', color:'#555', marginBottom:'0.5rem', textTransform:'capitalize' }}>{user.role}</div>
        <button onClick={onLogout} style={{ fontSize:'0.75rem', color:'#555', background:'none', border:'none', cursor:'pointer', padding:0 }}>Sair →</button>
      </div>
    </div>
  );
}

/* ── ConversationChat ── */
function ConversationChat({ phone, token }) {
  const [session, setSession]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const bottomRef               = useRef(null);

  useEffect(() => {
    if (!phone) return;
    setLoading(true); setSession(null);
    apiFetch('/api/dashboard/conversation?phone=' + encodeURIComponent(phone), token)
      .then(setSession).catch(console.error).finally(() => setLoading(false));
  }, [phone, token]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior:'smooth' });
  }, [session]);

  if (!phone) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#444', fontSize:'0.875rem' }}>
      Selecione uma conversa
    </div>
  );
  if (loading) return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#555', fontSize:'0.875rem' }}>Carregando...</div>;
  if (!session) return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#555', fontSize:'0.875rem' }}>Conversa não encontrada</div>;

  const history = session.history || [];
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #1f1f1f', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:'0.875rem', fontWeight:'600', color:'#e5e5e5' }}>{session.leadName || phone}</div>
          <div style={{ fontSize:'0.7rem', color:'#555' }}>{phone}</div>
        </div>
        <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
          <StatusBadge status={session.active ? 'em_andamento' : 'encerrado'} />
          {session.tag && <span style={{ fontSize:'0.7rem', padding:'2px 8px', borderRadius:'999px', background:'#1e2a3a', color:'#60a5fa' }}>{session.tag}</span>}
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'1rem', background:'#0d0d0d' }}>
        {history.length === 0 && <div style={{ color:'#444', fontSize:'0.8rem', textAlign:'center' }}>Sem mensagens</div>}
        {history.map((msg, i) => (
          <div key={i} style={{ display:'flex', justifyContent: msg.role==='user' ? 'flex-end' : 'flex-start', marginBottom:'0.75rem' }}>
            <div style={{
              maxWidth:'70%', padding:'0.5rem 0.75rem', fontSize:'0.8rem', lineHeight:'1.5', color:'#e0e0e0',
              background: msg.role==='user' ? '#1a2e22' : '#1a1a1a',
              borderRadius: msg.role==='user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
            }}>
              <div style={{ fontSize:'0.65rem', color:'#555', marginBottom:'3px' }}>{msg.role==='user' ? 'Lead' : 'Fabio (IA)'}</div>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* ── ConversationsTab ── */
function ConversationsTab({ token }) {
  const [list, setList]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selectedPhone, setSelected]  = useState(null);
  const [statusFilter, setStatusF]    = useState('');
  const [tagFilter, setTagF]          = useState('');

  const load = useCallback(() => {
    apiFetch('/api/dashboard/conversations', token)
      .then(setList).catch(console.error).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const statuses  = [...new Set(list.map(c => c.status).filter(Boolean))];
  const tags      = [...new Set(list.map(c => c.tag).filter(Boolean))];
  const filtered  = list.filter(c =>
    (!statusFilter || c.status === statusFilter) &&
    (!tagFilter    || c.tag    === tagFilter));

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
      {/* list */}
      <div style={{ width:'310px', flexShrink:0, borderRight:'1px solid #1f1f1f', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'0.75rem', borderBottom:'1px solid #1f1f1f', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <select value={statusFilter} onChange={e => setStatusF(e.target.value)}
              style={{ flex:1, fontSize:'0.75rem', padding:'0.35rem 0.5rem', background:'#1a1a1a', border:'1px solid #333', borderRadius:'5px', color:'#ccc' }}>
              <option value="">Todos status</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={tagFilter} onChange={e => setTagF(e.target.value)}
              style={{ flex:1, fontSize:'0.75rem', padding:'0.35rem 0.5rem', background:'#1a1a1a', border:'1px solid #333', borderRadius:'5px', color:'#ccc' }}>
              <option value="">Todas tags</option>
              {tags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ fontSize:'0.7rem', color:'#555' }}>{filtered.length} conversa(s) — atualiza a cada 30s</div>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading
            ? <div style={{ padding:'1rem', fontSize:'0.8rem', color:'#555' }}>Carregando...</div>
            : filtered.length === 0
              ? <div style={{ padding:'1rem', fontSize:'0.8rem', color:'#555' }}>Nenhuma conversa</div>
              : filtered.map(c => (
                <button key={c.phone} onClick={() => setSelected(c.phone)}
                  style={{ width:'100%', textAlign:'left', padding:'0.75rem 1rem', borderBottom:'1px solid #161616', background: selectedPhone===c.phone ? '#1a1a1a' : 'transparent', border:'none', cursor:'pointer', display:'block' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                    <span style={{ fontSize:'0.8rem', fontWeight:'600', color:'#e0e0e0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'160px' }}>{c.leadName || c.phone}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div style={{ fontSize:'0.72rem', color:'#555', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:'4px' }}>{c.lastMessage || '—'}</div>
                  <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                    <span style={{ fontSize:'0.65rem', color:'#444' }}>{c.phone}</span>
                    {c.tag && <span style={{ fontSize:'0.65rem', color:'#3b82f6' }}>{c.tag}</span>}
                    <span style={{ fontSize:'0.65rem', color:'#333', marginLeft:'auto' }}>{c.messageCount} msgs</span>
                  </div>
                </button>
              ))
          }
        </div>
      </div>
      {/* chat */}
      <ConversationChat phone={selectedPhone} token={token} />
    </div>
  );
}

/* ── LeadsTab ── */
function LeadsTab({ token }) {
  const [leads, setLeads]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [statusF, setStatusF]     = useState('');
  const [perfilF, setPerfilF]     = useState('');
  const [tagF, setTagF]           = useState('');

  useEffect(() => {
    apiFetch('/api/dashboard/leads', token)
      .then(setLeads).catch(console.error).finally(() => setLoading(false));
  }, [token]);

  const statuses = [...new Set(leads.map(l => l.status).filter(Boolean))];
  const perfis   = [...new Set(leads.map(l => l.perfil).filter(Boolean))];
  const tags     = [...new Set(leads.map(l => l.tag).filter(Boolean))];

  const filtered = leads.filter(l =>
    (!statusF || l.status === statusF) &&
    (!perfilF || l.perfil === perfilF) &&
    (!tagF    || l.tag    === tagF));

  function exportCSV() {
    const cols = ['timestamp','telefone','nome','cidade','estado','perfil','nome_academia','proprietario','faturamento_mensal','interesse_equipamento','quer_catalogo','agendamento','status','tag'];
    const header = cols.join(',');
    const rows = filtered.map(l => cols.map(c => '"' + (l[c] || '').replace(/"/g, '""') + '"').join(','));
    const csv = [header].concat(rows).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'leads-cimerian.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const COLS = [
    { key:'timestamp',          label:'Data'        },
    { key:'nome',               label:'Nome'        },
    { key:'telefone',           label:'Telefone'    },
    { key:'cidade',             label:'Cidade'      },
    { key:'estado',             label:'UF'          },
    { key:'perfil',             label:'Perfil'      },
    { key:'nome_academia',      label:'Academia'    },
    { key:'faturamento_mensal', label:'Faturamento' },
    { key:'status',             label:'Status'      },
    { key:'tag',                label:'Tag'         },
    { key:'agendamento',        label:'Agendamento' },
  ];

  const selStyle = { fontSize:'0.75rem', padding:'0.35rem 0.6rem', background:'#1a1a1a', border:'1px solid #333', borderRadius:'5px', color:'#ccc' };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:'1rem' }}>
      <div style={{ display:'flex', gap:'0.5rem', marginBottom:'0.75rem', flexWrap:'wrap', alignItems:'center' }}>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={selStyle}>
          <option value="">Todos status</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={perfilF} onChange={e => setPerfilF(e.target.value)} style={selStyle}>
          <option value="">Todos perfis</option>
          {perfis.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={tagF} onChange={e => setTagF(e.target.value)} style={selStyle}>
          <option value="">Todas tags</option>
          {tags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ fontSize:'0.75rem', color:'#555', flex:1 }}>{filtered.length} lead(s)</span>
        <button onClick={exportCSV}
          style={{ fontSize:'0.75rem', padding:'0.35rem 0.75rem', background:'#1f1f1f', border:'1px solid #333', borderRadius:'5px', color:'#ccc', cursor:'pointer' }}>
          Exportar CSV
        </button>
      </div>
      {loading
        ? <div style={{ color:'#555', fontSize:'0.875rem' }}>Carregando...</div>
        : <div style={{ flex:1, overflowAuto:'auto', overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.75rem' }}>
              <thead>
                <tr style={{ background:'#111' }}>
                  {COLS.map(c => (
                    <th key={c.key} style={{ textAlign:'left', padding:'0.5rem 0.75rem', color:'#555', fontWeight:'500', whiteSpace:'nowrap', borderBottom:'1px solid #222', position:'sticky', top:0, background:'#111' }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #161616' }}>
                    {COLS.map(c => (
                      <td key={c.key} style={{ padding:'0.5rem 0.75rem', color:'#ccc', whiteSpace:'nowrap', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {c.key === 'status'
                          ? React.createElement(StatusBadge, { status: lead[c.key] })
                          : (lead[c.key] || '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div style={{ textAlign:'center', color:'#444', padding:'3rem', fontSize:'0.875rem' }}>Nenhum lead encontrado</div>}
          </div>
      }
    </div>
  );
}

/* ── MetricsTab ── */
function MetricsTab({ token }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef             = useRef(null);
  const chartRef              = useRef(null);

  useEffect(() => {
    apiFetch('/api/dashboard/metrics', token)
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const labels = Object.keys(data.last7Days);
    const values = Object.values(data.last7Days);
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label:'Leads', data:values, backgroundColor:'#dc2626', borderRadius:4 }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display:false } },
        scales: {
          x: { ticks:{ color:'#555', font:{ size:11 } }, grid:{ color:'#1a1a1a' } },
          y: { ticks:{ color:'#555', font:{ size:11 } }, grid:{ color:'#1a1a1a' } },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data]);

  if (loading) return <div style={{ padding:'1.5rem', color:'#555', fontSize:'0.875rem' }}>Carregando métricas...</div>;
  if (!data)   return <div style={{ padding:'1.5rem', color:'#f87171', fontSize:'0.875rem' }}>Erro ao carregar métricas</div>;

  const cards = [
    { label:'Leads hoje',           value: data.todayCount,     color:'#e5e5e5' },
    { label:'Agendados total',       value: data.scheduledCount, color:'#4ade80' },
    { label:'Total de leads',        value: data.totalLeads,     color:'#e5e5e5' },
    { label:'Taxa de agendamento',   value: data.conversionRate + '%', color:'#facc15' },
  ];

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'1.5rem' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        {cards.map(c => (
          <div key={c.label} style={{ background:'#111', border:'1px solid #222', borderRadius:'8px', padding:'1rem' }}>
            <div style={{ fontSize:'0.7rem', color:'#555', marginBottom:'0.4rem' }}>{c.label}</div>
            <div style={{ fontSize:'1.75rem', fontWeight:'700', color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
        <div style={{ background:'#111', border:'1px solid #222', borderRadius:'8px', padding:'1rem' }}>
          <div style={{ fontSize:'0.8rem', fontWeight:'500', color:'#ccc', marginBottom:'1rem' }}>Leads por tag</div>
          {Object.entries(data.tagBreakdown).map(([tag, count]) => (
            <div key={tag} style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'0.6rem' }}>
              <div style={{ fontSize:'0.75rem', color:'#888', width:'90px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tag}</div>
              <div style={{ flex:1, background:'#1f1f1f', borderRadius:'999px', height:'6px', overflow:'hidden' }}>
                <div style={{ height:'100%', background:'#dc2626', borderRadius:'999px', width: Math.min(100, data.totalLeads > 0 ? (count / data.totalLeads * 100) : 0) + '%' }} />
              </div>
              <div style={{ fontSize:'0.75rem', color:'#666', width:'24px', textAlign:'right' }}>{count}</div>
            </div>
          ))}
          {Object.keys(data.tagBreakdown).length === 0 && <div style={{ color:'#444', fontSize:'0.8rem' }}>Sem dados</div>}
        </div>
        <div style={{ background:'#111', border:'1px solid #222', borderRadius:'8px', padding:'1rem' }}>
          <div style={{ fontSize:'0.8rem', fontWeight:'500', color:'#ccc', marginBottom:'1rem' }}>Leads — últimos 7 dias</div>
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard shell ── */
function Dashboard({ token, user, onLogout }) {
  const [activeTab, setActiveTab] = useState('conversations');
  const TAB_LABEL = { conversations:'Conversas', leads:'Leads', metrics:'Métricas' };
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#0a0a0a' }}>
      <Sidebar user={user} activeTab={activeTab} setActiveTab={setActiveTab} onLogout={onLogout} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'0.6rem 1.25rem', borderBottom:'1px solid #1a1a1a', display:'flex', alignItems:'center' }}>
          <span style={{ fontSize:'0.875rem', fontWeight:'600', color:'#ccc' }}>{TAB_LABEL[activeTab]}</span>
        </div>
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          {activeTab === 'conversations' && React.createElement(ConversationsTab, { token })}
          {activeTab === 'leads'         && React.createElement(LeadsTab,          { token })}
          {activeTab === 'metrics'       && React.createElement(MetricsTab,        { token })}
        </div>
      </div>
    </div>
  );
}

/* ── App root ── */
function App() {
  const stored = localStorage.getItem('cimerian_token');
  const [token, setToken] = useState(isTokenValid(stored) ? stored : null);
  const [user,  setUser]  = useState(() => {
    if (!stored || !isTokenValid(stored)) return null;
    const p = parseJWT(stored);
    return p ? { name: p.name, role: p.role } : null;
  });

  function handleLogin(t, u) { setToken(t); setUser(u); }
  function handleLogout() { localStorage.removeItem('cimerian_token'); setToken(null); setUser(null); }

  return (!token || !user)
    ? React.createElement(LoginScreen,  { onLogin: handleLogin })
    : React.createElement(Dashboard,    { token, user, onLogout: handleLogout });
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
</script>
</body>
</html>`;

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(HTML);
}
