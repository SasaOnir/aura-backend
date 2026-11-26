import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

/**
 * Controller Web — SPA completa servita dallo stesso dominio API.
 * URL: https://aura-ai-sa.vercel.app/
 * Pagine: / (dashboard), /users, /roles, /staff, /audit, /login
 * Tutte le fetch vanno agli endpoint NestJS sullo stesso dominio (no CORS).
 */
@Controller()
export class WebController {
  @Get()
  @Get('login')
  @Get('dashboard')
  @Get('users')
  @Get('roles')
  @Get('staff')
  @Get('audit')
  root(@Res() res: Response) {
    res.type('text/html').send(SPA_HTML);
  }
}

const SPA_HTML = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aura — Admin Console</title>
<style>
:root{
  --bg:#0a0a0f; --bg2:#0d0d14; --panel:#13131c; --panel2:#181826;
  --border:#262636; --border2:#33334a;
  --text:#e8e8f0; --muted:#7a7a92; --muted2:#55556a;
  --accent:#7c5cff; --accent2:#4f8cff; --accent-soft:rgba(124,92,255,.12);
  --ok:#4ade80; --ok-soft:rgba(74,222,128,.12);
  --err:#f87171; --err-soft:rgba(248,113,113,.12);
  --warn:#fbbf24; --warn-soft:rgba(251,191,36,.12);
  --info:#60a5fa; --info-soft:rgba(96,165,250,.12);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;font-size:14px;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
button{font-family:inherit;cursor:pointer;border:0;background:none;color:inherit}
input,select,textarea{font-family:inherit;font-size:14px}
.mono{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace}
.hidden{display:none!important}
.app{display:grid;grid-template-columns:248px 1fr;min-height:100vh}
@media(max-width:900px){.app{grid-template-columns:1fr}}
.sidebar{background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
@media(max-width:900px){.sidebar{position:fixed;left:-260px;z-index:50;transition:left .2s;width:248px;height:100vh}.sidebar.open{left:0}}
.brand{display:flex;align-items:center;gap:12px;padding:20px 18px;border-bottom:1px solid var(--border)}
.brand .logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;flex-shrink:0}
.brand .name{font-weight:700;font-size:18px;letter-spacing:-0.02em}
.brand .name .grad{background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.nav{flex:1;padding:14px 10px;overflow-y:auto}
.nav-section{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted2);margin:14px 10px 6px;font-weight:700}
.nav-item{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:8px;color:var(--muted);font-size:14px;font-weight:500;transition:background .12s,color .12s;width:100%;text-align:left}
.nav-item:hover{background:var(--panel);color:var(--text)}
.nav-item.active{background:var(--accent-soft);color:var(--accent)}
.nav-item svg{width:18px;height:18px;flex-shrink:0;opacity:.85}
.sidebar-foot{padding:12px 14px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px}
.sidebar-foot .ava{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:13px;flex-shrink:0}
.sidebar-foot .info{flex:1;min-width:0}
.sidebar-foot .info .n{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sidebar-foot .info .e{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.menu-btn{display:none;padding:8px;border-radius:8px;background:var(--panel);border:1px solid var(--border)}
@media(max-width:900px){.menu-btn{display:block}}
.main{display:flex;flex-direction:column;min-width:0}
.topbar{height:56px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px;padding:0 22px;background:var(--bg2);position:sticky;top:0;z-index:10}
.topbar h1{font-size:16px;font-weight:600;letter-spacing:-0.01em}
.topbar .meta{margin-left:auto;color:var(--muted);font-size:12px;display:flex;align-items:center;gap:8px}
.topbar .meta .dot{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok)}
.content{flex:1;padding:22px;overflow-x:hidden}
@media(max-width:600px){.content{padding:14px}}
.page-h{font-size:22px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px}
.page-sub{color:var(--muted);font-size:13px;margin-bottom:20px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:16px}
.card-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.card-h h3{font-size:14px;font-weight:600}
.card-h .sub{font-size:11px;color:var(--muted)}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:18px}
.kpi{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px 18px;transition:border-color .15s;position:relative}
.kpi:hover{border-color:var(--border2)}
.kpi .label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;font-weight:600}
.kpi .value{font-size:30px;font-weight:700;letter-spacing:-0.02em;margin-top:6px}
.kpi .delta{font-size:11px;color:var(--muted);margin-top:4px}
.kpi.accent .value{background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.kpi.ok .value{color:var(--ok)} .kpi.warn .value{color:var(--warn)} .kpi.err .value{color:var(--err)}
.kpi .kpi-ico{position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:8px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;color:var(--accent)}
.kpi.ok .kpi-ico{background:var(--ok-soft);color:var(--ok)}
.kpi.warn .kpi-ico{background:var(--warn-soft);color:var(--warn)}
.kpi.err .kpi-ico{background:var(--err-soft);color:var(--err)}
.table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:14px;background:var(--panel)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);font-weight:600;text-align:left;padding:12px 14px;border-bottom:1px solid var(--border);white-space:nowrap;background:var(--bg2)}
td{padding:13px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:0}
tr:hover td{background:rgba(255,255,255,.02)}
td .p-email{color:var(--muted);font-size:12px;margin-top:2px}
td .id{font-family:ui-monospace,monospace;font-size:11px;color:var(--muted)}
td .actions{display:flex;gap:6px;justify-content:flex-end}
.btn-ico{width:30px;height:30px;border-radius:7px;background:var(--panel2);border:1px solid var(--border);display:inline-flex;align-items:center;justify-content:center;color:var(--muted);transition:all .12s}
.btn-ico:hover{background:var(--accent-soft);color:var(--accent);border-color:var(--accent)}
.btn-ico.danger:hover{background:var(--err-soft);color:var(--err);border-color:var(--err)}
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600;background:var(--panel2);color:var(--muted);border:1px solid var(--border)}
.badge.ok{background:var(--ok-soft);color:var(--ok);border-color:rgba(74,222,128,.25)}
.badge.err{background:var(--err-soft);color:var(--err);border-color:rgba(248,113,113,.25)}
.badge.warn{background:var(--warn-soft);color:var(--warn);border-color:rgba(251,191,36,.25)}
.badge.info{background:var(--info-soft);color:var(--info);border-color:rgba(96,165,250,.25)}
.badge.accent{background:var(--accent-soft);color:var(--accent);border-color:rgba(124,92,255,.25)}
.badge.protected{background:rgba(251,191,36,.08);color:var(--warn);border:1px dashed rgba(251,191,36,.4)}
.btn{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid var(--border);background:var(--panel2);color:var(--text);transition:all .12s}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn:disabled{opacity:.5;cursor:wait}
.btn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border:0}
.btn.primary:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(124,92,255,.3);color:#fff}
.btn.danger{color:var(--err)}
.btn.danger:hover{background:var(--err-soft);border-color:var(--err);color:var(--err)}
.btn.sm{padding:6px 10px;font-size:12px}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse at top,rgba(124,92,255,.08),transparent 60%),var(--bg)}
.login-card{width:100%;max-width:420px;background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:36px 32px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.login-brand{display:flex;align-items:center;gap:14px;margin-bottom:32px}
.login-brand .logo{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:26px}
.login-brand .name{font-size:26px;font-weight:800;letter-spacing:-0.03em}
.login-brand .name .grad{background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.login-card h2{font-size:18px;margin-bottom:4px}
.login-card .sub{color:var(--muted);font-size:13px;margin-bottom:26px}
.field{margin-bottom:18px}
.field label{display:block;font-size:11px;color:var(--muted);margin:0 0 7px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em}
.field input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px;color:var(--text);font-size:14px;outline:none;transition:border-color .15s}
.field input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.msg{font-size:13px;margin-top:14px;min-height:18px;text-align:center}
.msg.err{color:var(--err)} .msg.ok{color:var(--ok)}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px;backdrop-filter:blur(4px)}
.modal{width:100%;max-width:520px;background:var(--panel);border:1px solid var(--border2);border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.5);max-height:90vh;overflow:auto}
.modal-h{padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.modal-h h3{font-size:16px;font-weight:600}
.modal-b{padding:22px}
.modal-f{padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px}
.close-x{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.close-x:hover{background:var(--panel2);color:var(--text)}
.toast-wrap{position:fixed;bottom:20px;right:20px;z-index:200;display:flex;flex-direction:column;gap:8px;max-width:calc(100vw - 40px)}
.toast{background:var(--panel);border:1px solid var(--border2);border-radius:10px;padding:12px 16px;font-size:13px;display:flex;align-items:center;gap:10px;box-shadow:0 10px 30px rgba(0,0,0,.4);animation:slidein .25s ease}
.toast.ok{border-left:3px solid var(--ok)} .toast.err{border-left:3px solid var(--err)} .toast.warn{border-left:3px solid var(--warn)}
@keyframes slidein{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
.empty{text-align:center;padding:60px 20px;color:var(--muted)}
.empty .e-ico{width:60px;height:60px;border-radius:50%;background:var(--panel);display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px;color:var(--muted2)}
.loading{display:flex;align-items:center;justify-content:center;padding:40px;color:var(--muted)}
.spinner{width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin-right:10px}
@keyframes spin{to{transform:rotate(360deg)}}
.activity-item{display:flex;gap:12px;padding:11px 0;border-bottom:1px solid var(--border)}
.activity-item:last-child{border-bottom:0}
.activity-item .ai-ico{width:34px;height:34px;border-radius:9px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;font-weight:700}
.activity-item .ai-bd{flex:1;min-width:0}
.activity-item .ai-bd .top{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;flex-wrap:wrap}
.activity-item .ai-bd .meta{font-size:11px;color:var(--muted);margin-top:3px;font-family:ui-monospace,monospace}
.stat-mini{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}
.stat-mini:last-child{border-bottom:0}
.stat-mini .v{font-weight:700;color:var(--accent)}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:700px){.grid-2{grid-template-columns:1fr}}
.pill{padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;background:var(--panel2);color:var(--muted);text-transform:uppercase;letter-spacing:0.05em}
.scroll{max-height:480px;overflow-y:auto}
.avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:13px;flex-shrink:0}
.avatar.sm{width:26px;height:26px;font-size:11px}
.hint{font-size:11px;color:var(--muted);margin-top:6px;line-height:1.4}
.divider{height:1px;background:var(--border);margin:14px 0}
.detail-list{display:grid;grid-template-columns:130px 1fr;gap:8px 14px;font-size:13px}
.detail-list .dk{color:var(--muted);font-weight:600}
.detail-list .dv{font-family:ui-monospace,monospace;font-size:12px;word-break:break-all}
.form-row{margin-bottom:14px}
.form-row label{display:block;font-size:11px;color:var(--muted);margin:0 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}
.form-row input,.form-row select,.form-row textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-size:13px;outline:none;transition:border-color .15s}
.form-row input:focus,.form-row select:focus,.form-row textarea:focus{border-color:var(--accent)}
.tag-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.tag-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:600}
.tag-chip .x{cursor:pointer;opacity:.6}
.tag-chip .x:hover{opacity:1}
@media print{.sidebar,.topbar{display:none}}
</style>
</head>
<body>
<div id="app"></div>
<div class="toast-wrap" id="toasts"></div>
<script>
// ==================== SPA Aura Admin Console ====================
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem('aura_'+k)); } catch { return null; } },
  set: (k,v) => localStorage.setItem('aura_'+k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem('aura_'+k),
};
const api = async (path, opts={}) => {
  const token = store.get('at');
  const headers = { 'Content-Type':'application/json', ...(opts.headers||{}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let res;
  try { res = await fetch(path, { credentials:'same-origin', ...opts, headers }); }
  catch (e) { throw new Error('Errore di rete: ' + e.message); }
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  if (res.status === 401) { store.del('at'); store.del('user'); location.hash = '#/login'; throw new Error('Sessione scaduta.'); }
  if (!res.ok) throw new Error((body && (body.message || body.error)) || ('HTTP ' + res.status));
  return body;
};
const fmt = {
  date: (iso) => iso ? new Date(iso).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}) : '—',
  time: (iso) => iso ? new Date(iso).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : '—',
  datetime: (iso) => iso ? new Date(iso).toLocaleString('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—',
  rel: (iso) => { if (!iso) return '—'; const d=new Date(iso),s=Math.floor((new Date()-d)/1000); if(s<60)return s+'s fa'; if(s<3600)return Math.floor(s/60)+'m fa'; if(s<86400)return Math.floor(s/3600)+'h fa'; return Math.floor(s/86400)+'g fa'; },
  short: (s,n=10) => s && s.length>n ? s.slice(0,n)+'…' : (s||'—'),
  initials: (n) => (n||'A').trim().split(/\\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase(),
};
const toast = (msg, type='ok', ms=3500) => {
  const el = document.createElement('div'); el.className = 'toast '+type;
  el.innerHTML = '<span>'+(type==='ok'?'✓':type==='err'?'✗':'!')+'</span><span>'+msg+'</span>';
  $('#toasts').appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.remove(),250); }, ms);
};
const ACTIONS = {
  'auth.login':['Login','info'], 'auth.register':['Registrazione','ok'], 'auth.logout':['Logout','muted'],
  'superadmin.bootstrap':['Bootstrap SA','accent'], 'staff.invite':['Invito staff','info'],
  'staff.assign_role':['Assegnazione ruolo','accent'], 'staff.revoke_role':['Revoca ruolo','warn'],
  'staff.require_mfa':['MFA richiesta','warn'], 'staff.revoke':['Revoca staff','err'],
  'user.suspend':['Sospensione','err'], 'user.reactivate':['Riattivazione','ok'],
  'role.create':['Ruolo creato','ok'], 'role.update':['Ruolo modificato','info'], 'role.delete':['Ruolo eliminato','err'],
};
const actionBadge = (a) => { const m = ACTIONS[a] || [a,'muted']; return '<span class="badge '+m[1]+'">'+m[0]+'</span>'; };
const ACCOUNT_TYPE = { listener:'Ascoltatore', artist:'Artista', label:'Etichetta', staff:'Staff' };
const STATUS_KIND = { active:'ok', suspended:'err', pending_verification:'warn' };
const STATUS_LABEL = { active:'Attivo', suspended:'Sospeso', pending_verification:'In verifica' };

// Icons SVG inline (stroke currentColor)
const IC = {
  dash: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
  users: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87m6 5.87v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="3"/><circle cx="7" cy="7" r="3"/></svg>',
  roles: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2l3 6 6 .5-4.5 4 1.5 6.5L12 16l-6 3 1.5-6.5L3 8.5 9 8z"/></svg>',
  staff: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M9 5h6v2H9z"/></svg>',
  audit: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
  logout: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  bell: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  search: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  plus: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  refresh: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  close: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  check: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  edit: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
  trash: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  key: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/></svg>',
  shield: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  activity: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  menu: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h18"/></svg>',
};
// ===== SPA ENTRYPOINT (segue in app.js inline sotto) =====
</script>
<script>
// ==================== ROUTER + AUTH GUARD ====================
const routes = {
  '/login':    { render: loginPage,    public: true,  title:'Login' },
  '/':         { render: dashPage,    public: false, title:'Dashboard' },
  '/users':    { render: usersPage,   public: false, title:'Utenti' },
  '/roles':    { render: rolesPage,   public: false, title:'Ruoli & Permessi' },
  '/staff':    { render: staffPage,   public: false, title:'Staff' },
  '/audit':    { render: auditPage,   public: false, title:'Audit Log' },
};
function currentRoute() { return location.hash.replace(/^#/,'') || '/'; }
function navigate(path) { location.hash = '#'+path; }
async function router() {
  const path = currentRoute();
  const r = routes[path] || routes['/'];
  // auth guard
  const isLoggedIn = !!store.get('at');
  if (!r.public && !isLoggedIn) { if (path !== '/login') location.hash = '#/login'; return; }
  if (r.public && isLoggedIn && path === '/login') { location.hash = '#/'; return; }
  document.title = (r.title||'Aura') + ' — Aura Admin';
  $('#app').innerHTML = '';
  try { await r.render($('#app'), path); }
  catch (e) {
    $('#app').innerHTML = '<div class="content"><div class="card"><h3>Errore</h3><p style="color:var(--err);margin-top:8px">'+e.message+'</p><button class="btn sm" style="margin-top:14px" onclick="location.reload()">Ricarica</button></div></div>';
  }
  // chiudi sidebar mobile dopo navigate
  $('.sidebar')?.classList.remove('open');
}
window.addEventListener('hashchange', router);

// ==================== LAYOUT (shell per pagine autenticate) ====================
function shell(path, contentHTML) {
  const user = store.get('user') || {};
  const navItems = [
    { p:'/',         ico:'dash',  label:'Dashboard', },
    { p:'/users',    ico:'users', label:'Utenti', },
    { p:'/roles',    ico:'roles', label:'Ruoli', },
    { p:'/staff',    ico:'staff', label:'Staff', },
    { p:'/audit',    ico:'audit', label:'Audit Log', },
  ];
  return '<div class="app">' +
    '<aside class="sidebar" id="sidebar">' +
      '<div class="brand"><div class="logo">A</div><div class="name"><span class="grad">Aura</span></div></div>' +
      '<nav class="nav">' +
        '<div class="nav-section">Console</div>' +
        navItems.map(n => '<button class="nav-item'+(n.p===path?' active':'')+'" onclick="navigate(\\''+n.p+'\\')">'+IC[n.ico]+'<span>'+n.label+'</span></button>').join('') +
      '</nav>' +
      '<div class="sidebar-foot">' +
        '<div class="ava">'+fmt.initials(user.displayName||user.email)+'</div>' +
        '<div class="info"><div class="n">'+(user.displayName||'—')+'</div><div class="e">'+(user.email||'—')+'</div></div>' +
        '<button class="btn-ico" title="Logout" onclick="doLogout()">'+IC.logout+'</button>' +
      '</div>' +
    '</aside>' +
    '<main class="main">' +
      '<div class="topbar">' +
        '<button class="menu-btn" onclick="document.getElementById(\\'sidebar\\').classList.toggle(\\'open\\')">'+IC.menu+'</button>' +
        '<h1>'+(routes[path] && routes[path].title || 'Aura')+'</h1>' +
        '<div class="meta"><span class="dot"></span> API online · <span class="mono">aura-ai-sa.vercel.app</span></div>' +
      '</div>' +
      '<div class="content">'+contentHTML+'</div>' +
    '</main>' +
  '</div>';
}
async function doLogout() {
  try { await api('/auth/logout', { method:'POST', body: JSON.stringify({ refreshToken: store.get('rt') }) }); } catch {}
  store.del('at'); store.del('rt'); store.del('user');
  toast('Disconnesso', 'ok');
  navigate('/login');
}

// ==================== LOGIN PAGE ====================
async function loginPage(el) {
  const user = store.get('user') || {};
  el.innerHTML = '<div class="login-wrap"><div class="login-card">' +
    '<div class="login-brand"><div class="logo">A</div><div class="name"><span class="grad">Aura</span></div></div>' +
    '<h2>Bentvenuto</h2><div class="sub">Accedi alla console di amministrazione</div>' +
    '<form id="loginForm">' +
      '<div class="field"><label>Email</label><input id="email" type="email" autocomplete="email" required placeholder="nome@email.com"></div>' +
      '<div class="field"><label>Password</label><input id="password" type="password" autocomplete="current-password" required placeholder="••••••••••••"></div>' +
      '<button class="btn primary" type="submit" id="loginBtn" style="width:100%">Accedi</button>' +
      '<div class="msg" id="loginMsg"></div>' +
    '</form>' +
    '<div class="divider"></div>' +
    '<div style="font-size:11px;color:var(--muted);text-align:center">SaaS di gestione musicale · Accesso riservato</div>' +
  '</div></div>';
  const form = $('#loginForm', el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn', el); const msg = $('#loginMsg', el);
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Accesso in corso…';
    try {
      const r = await api('/auth/login', { method:'POST', body: JSON.stringify({
        email: $('#email', el).value.trim().toLowerCase(),
        password: $('#password', el).value,
      })});
      store.set('at', r.accessToken);
      store.set('rt', r.refreshToken);
      store.set('user', r.user);
      msg.className = 'msg ok'; msg.textContent = '✓ Login riuscito';
      toast('Bentvenuto, '+(r.user.displayName||r.user.email), 'ok');
      setTimeout(()=>navigate('/'), 400);
    } catch (err) {
      msg.className = 'msg err'; msg.textContent = '✗ '+err.message;
      btn.disabled = false;
    }
  });
}

// ==================== DASHBOARD ====================
async function dashPage(el) {
  el.innerHTML = shell('/', '<div class="loading"><div class="spinner"></div>Caricamento dashboard…</div>');
  try {
    const [dash, activity] = await Promise.all([api('/admin/dashboard'), api('/admin/recent-activity')]);
    const u = dash.users || {}, s = dash.staff || {}, r = dash.rbac || {}, a = dash.audit || {};
    const kpis = [
      { label:'Utenti totali', value:u.total||0, ico:'users', cls:'accent', delta: (u.listeners||0)+' ascolt. · '+(u.artists||0)+' artisti' },
      { label:'Staff attivo', value:s.active||0, ico:'staff', cls:'ok', delta:'MFA coverage '+(s.mfaCoverage||0)+'%' },
      { label:'Ruoli', value:r.roles||0, ico:'roles', cls:'accent', delta:(r.permissions||0)+' permessi' },
      { label:'Audit oggi', value:a.today||0, ico:'audit', cls:'warn', delta:'7 giorni: '+(a.last7d||0)+' eventi' },
      { label:'Sospesi', value:u.suspended||0, ico:'shield', cls:(u.suspended>0?'err':'ok'), delta:'account inattivi' },
      { label:'In verifica', value:u.pendingVerification||0, ico:'key', cls:(u.pendingVerification>0?'warn':'ok'), delta:'in attesa attivazione' },
    ];
    const kpiHTML = kpis.map(k => '<div class="kpi '+k.cls+'"><div class="kpi-ico">'+IC[k.ico]+'</div><div class="label">'+k.label+'</div><div class="value">'+k.value+'</div><div class="delta">'+k.delta+'</div></div>').join('');
    const actHTML = (activity||[]).slice(0,12).map(l => {
      const actor = l.actor?.displayName || l.actor?.email || 'Sistema';
      return '<div class="activity-item"><div class="ai-ico">'+fmt.initials(actor)+'</div><div class="ai-bd"><div class="top">'+actionBadge(l.action)+' <span>'+actor+'</span> '+(l.result==='success'?'<span class="badge ok">OK</span>':'<span class="badge err">FAIL</span>')+'</div><div class="meta">'+fmt.datetime(l.createdAt)+' · IP '+(l.ip||'—')+' · '+(l.userAgent||'').slice(0,40)+'</div></div></div>';
    }).join('') || '<div class="empty"><div class="e-ico">'+IC.activity+'</div>Nessuna attività recente</div>';
    const breakdown = [
      ['Ascoltatori', u.listeners||0], ['Artisti', u.artists||0],
      ['Etichette', u.labels||0], ['Staff', u.staff||0],
    ].map(([n,v]) => '<div class="stat-mini"><span>'+n+'</span><span class="v">'+v+'</span></div>').join('');
    const staffStats = [
      ['Staff attivo', s.active||0], ['MFA abilitata', s.mfaEnabled||0], ['Coverage MFA', (s.mfaCoverage||0)+'%'],
    ].map(([n,v]) => '<div class="stat-mini"><span>'+n+'</span><span class="v">'+v+'</span></div>').join('');
    $('.content', el).innerHTML =
      '<div class="page-h">Dashboard</div><div class="page-sub">Panoramica globale della piattaforma Aura · ultimo aggiornamento '+fmt.datetime(dash.generatedAt)+'</div>' +
      '<div class="kpi-grid">'+kpiHTML+'</div>' +
      '<div class="grid-2">' +
        '<div class="card"><div class="card-h"><h3>Attività recente</h3><span class="sub">ultimi 20 eventi</span></div><div class="scroll" style="max-height:380px">'+actHTML+'</div></div>' +
        '<div class="card"><div class="card-h"><h3>Suddivisione utenti</h3></div>'+breakdown+'<div class="divider"></div><div class="card-h" style="margin-top:6px"><h3>Staff & sicurezza</h3></div>'+staffStats+'</div>' +
      '</div>';
  } catch (e) { $('.content', el).innerHTML = '<div class="card"><h3>Errore caricamento</h3><p style="color:var(--err);margin-top:8px">'+e.message+'</p></div>'; }
}

// ==================== USERS PAGE ====================
async function usersPage(el, path) {
  el.innerHTML = shell(path, '<div class="loading"><div class="spinner"></div>Caricamento utenti…</div>');
  try {
    let data = await api('/users');
    const users = data.items || data;
    const rows = (users||[]).map(u => {
      const statusKind = STATUS_KIND[u.status] || 'muted';
      const statusLabel = STATUS_LABEL[u.status] || u.status;
      return '<tr>' +
        '<td><div class="row-flex"><div class="avatar sm">'+fmt.initials(u.displayName)+'</div><div><div style="font-weight:600">'+(u.displayName||'—')+'</div><div class="p-email">'+(u.email||'—')+'</div></div></div></td>' +
        '<td><span class="badge info">'+(ACCOUNT_TYPE[u.accountType]||u.accountType||'—')+'</span></td>' +
        '<td><span class="badge '+statusKind+'">'+statusLabel+'</span></td>' +
        '<td>'+(u.emailVerified?'<span class="badge ok">verificata</span>':'<span class="badge warn">no</span>')+'</td>' +
        '<td class="mono" style="font-size:11px;color:var(--muted)">'+fmt.rel(u.lastLoginAt)+'</td>' +
        '<td class="id">'+(u.id||'').slice(0,8)+'</td>' +
        '<td><div class="actions">' +
          '<button class="btn-ico" title="Dettagli" onclick="userDetail(\\''+u.id+'\\')">'+IC.search+'</button>' +
          (u.status==='active' ? '<button class="btn-ico danger" title="Sospendi" onclick="userSuspend(\\''+u.id+'\\')">'+IC.trash+'</button>' :
           '<button class="btn-ico" title="Riattiva" onclick="userReactivate(\\''+u.id+'\\')">'+IC.check+'</button>') +
        '</div></td>' +
      '</tr>';
    }).join('');
    $('.content', el).innerHTML =
      '<div class="page-h">Utenti</div><div class="page-sub">'+(users.length)+' utenti registrati sulla piattaforma</div>' +
      '<div class="card"><div class="card-h"><h3>Elenco utenti</h3><button class="btn sm" onclick="loadUsers()">'+IC.refresh+' Aggiorna</button></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Utente</th><th>Tipo</th><th>Stato</th><th>Email</th><th>Ultimo accesso</th><th>ID</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>' +
      '</div>';
  } catch (e) { $('.content', el).innerHTML = '<div class="card"><h3>Errore</h3><p style="color:var(--err)">'+e.message+'</p></div>'; }
}
window.loadUsers = () => router();
window.userDetail = async (id) => {
  openModal('Dettaglio utente', '<div class="loading"><div class="spinner"></div>Caricamento…</div>');
  try {
    const u = await api('/users/'+id);
    const dl = [
      ['ID', u.id], ['Email', u.email], ['Nome', u.displayName||'—'], ['Tipo', ACCOUNT_TYPE[u.accountType]||u.accountType],
      ['Stato', STATUS_LABEL[u.status]||u.status], ['Email verificata', u.emailVerified?'sì':'no'],
      ['MFA', u.mfaEnabled?'attiva':'disattivata'], ['Creato', fmt.datetime(u.createdAt)],
      ['Ultimo accesso', u.datetime||fmt.datetime(u.lastLoginAt)],
    ];
    openModal('Dettaglio utente', '<div class="detail-list">'+dl.map(([k,v])=>'<div class="dk">'+k+'</div><div class="dv">'+(v||'—')+'</div>').join('')+'</div>',
      '<button class="btn" onclick="closeModal()">Chiudi</button>');
  } catch (e) { openModal('Errore', '<p style="color:var(--err)">'+e.message+'</p>'); }
};
window.userSuspend = async (id) => {
  if (!confirm('Sospendere questo utente?')) return;
  try { await api('/users/'+id+'/suspend', { method:'PATCH' }); toast('Utente sospeso', 'ok'); loadUsers(); }
  catch (e) { toast(e.message, 'err'); }
};
window.userReactivate = async (id) => {
  try { await api('/users/'+id+'/reactivate', { method:'PATCH' }); toast('Utente riattivato', 'ok'); loadUsers(); }
  catch (e) { toast(e.message, 'err'); }
};

// ==================== ROLES PAGE ====================
async function rolesPage(el, path) {
  el.innerHTML = shell(path, '<div class="loading"><div class="spinner"></div>Caricamento ruoli…</div>');
  try {
    const roles = await api('/roles');
    let perms = [];
    try { perms = await api('/roles/permissions'); } catch {}
    const rows = (roles||[]).map(r => {
      const badge = r.isProtected ? '<span class="badge protected">protetto</span>' : '<span class="badge">custom</span>';
      return '<tr>' +
        '<td><div style="font-weight:600">'+(r.name||'—')+'</div><div style="font-size:11px;color:var(--muted);margin-top:2px">'+(r.description||'')+'</div></td>' +
        '<td><span class="pill">'+(r.scope||'—')+'</span></td>' +
        '<td>'+badge+'</td>' +
        '<td><span class="badge accent">'+(r._count?.permissions||0)+' permessi</span></td>' +
        '<td><span class="badge info">'+(r._count?.userRoles||0)+' utenti</span></td>' +
        '<td><div class="actions">' +
          '<button class="btn-ico" title="Dettagli" onclick="roleDetail(\\''+r.id+'\\')">'+IC.search+'</button>' +
          (!r.isProtected ? '<button class="btn-ico danger" title="Elimina" onclick="roleDelete(\\''+r.id+'\\',\\''+r.name+'\\')">'+IC.trash+'</button>' : '') +
        '</div></td>' +
      '</tr>';
    }).join('');
    const permsHTML = (Array.isArray(perms) ? perms : (perms.items||[])).slice(0,30).map(p => '<span class="tag-chip">'+(typeof p==='string'?p:(p.action+'.'+p.resource))+'</span>').join('');
    $('.content', el).innerHTML =
      '<div class="page-h">Ruoli & Permessi</div><div class="page-sub">'+(roles.length)+' ruoli configurati · '+(Array.isArray(perms)?perms.length:(perms.items||[]).length)+' permessi definiti</div>' +
      '<div class="card"><div class="card-h"><h3>Ruoli di sistema</h3><button class="btn primary sm" onclick="roleCreate()">'+IC.plus+' Nuovo ruolo</button></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Ruolo</th><th>Scope</th><th>Stato</th><th>Permessi</th><th>Utenti</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>' +
      '</div>' +
      (permsHTML ? '<div class="card"><div class="card-h"><h3>Permessi disponibili</h3><span class="sub">sottoinsieme</span></div><div class="tag-list">'+permsHTML+'</div></div>' : '');
  } catch (e) { $('.content', el).innerHTML = '<div class="card"><h3>Errore</h3><p style="color:var(--err)">'+e.message+'</p></div>'; }
}
window.roleDetail = async (id) => {
  openModal('Dettaglio ruolo', '<div class="loading"><div class="spinner"></div>Caricamento…</div>');
  try {
    const r = await api('/roles/'+id);
    const dl = [['ID', r.id],['Nome', r.name],['Scope', r.scope],['Descrizione', r.description],['Protetto', r.isProtected?'sì':'no'],['Creato', fmt.datetime(r.createdAt)]];
    openModal('Dettaglio ruolo', '<div class="detail-list">'+dl.map(([k,v])=>'<div class="dk">'+k+'</div><div class="dv">'+(v||'—')+'</div>').join('')+'</div>', '<button class="btn" onclick="closeModal()">Chiudi</button>');
  } catch (e) { openModal('Errore', '<p style="color:var(--err)">'+e.message+'</p>'); }
};
window.roleCreate = () => {
  openModal('Nuovo ruolo',
    '<div class="form-row"><label>Nome ruolo</label><input id="r_name" placeholder="es. marketing_lead"></div>' +
    '<div class="form-row"><label>Descrizione</label><input id="r_desc" placeholder="Breve descrizione"></div>' +
    '<div class="form-row"><label>Scope</label><select id="r_scope"><option value="system">system</option><option value="organization">organization</option></select></div>' +
    '<div class="hint">I permessi possono essere assegnati dopo la creazione.</div>',
    '<button class="btn" onclick="closeModal()">Annulla</button><button class="btn primary" onclick="roleCreateSubmit()">Crea ruolo</button>');
};
window.roleCreateSubmit = async () => {
  const body = { name: $('#r_name').value.trim(), description: $('#r_desc').value.trim(), scope: $('#r_scope').value };
  if (!body.name) return toast('Nome obbligatorio', 'err');
  try { await api('/roles', { method:'POST', body: JSON.stringify(body) }); closeModal(); toast('Ruolo creato', 'ok'); router(); }
  catch (e) { toast(e.message, 'err'); }
};
window.roleDelete = async (id, name) => {
  if (!confirm('Eliminare il ruolo "'+name+'"? Non reversibile.')) return;
  try { await api('/roles/'+id, { method:'DELETE' }); toast('Ruolo eliminato', 'ok'); router(); }
  catch (e) { toast(e.message, 'err'); }
};

// ==================== STAFF PAGE ====================
async function staffPage(el, path) {
  el.innerHTML = shell(path, '<div class="loading"><div class="spinner"></div>Caricamento staff…</div>');
  try {
    const [staff, roles] = await Promise.all([api('/staff'), api('/roles')]);
    const roleNames = (roles||[]).map(r => r.name);
    const rows = (staff||[]).map(s => {
      const u = s.user || {};
      return '<tr>' +
        '<td><div class="row-flex"><div class="avatar sm">'+fmt.initials(u.displayName)+'</div><div><div style="font-weight:600">'+(u.displayName||'—')+'</div><div class="p-email">'+(u.email||'—')+'</div></div></div></td>' +
        '<td><span class="badge '+(s.status==='active'?'ok':'warn')+'">'+(s.status||'—')+'</span></td>' +
        '<td>'+(s.mfaRequired?'<span class="badge ok">obbligatoria</span>':'<span class="badge warn">opzionale</span>')+'</td>' +
        '<td class="mono" style="font-size:11px;color:var(--muted)">'+fmt.rel(u.lastLoginAt)+'</td>' +
        '<td class="id">'+(s.userId||'').slice(0,8)+'</td>' +
        '<td><div class="actions">' +
          '<button class="btn-ico" title="Assegna ruolo" onclick="staffAssign(\\''+s.userId+'\\',\\''+(u.displayName||'')+'\\')">'+IC.key+'</button>' +
          '<button class="btn-ico" title="MFA on/off" onclick="staffToggleMfa(\\''+s.userId+'\\','+!s.mfaRequired+')">'+IC.shield+'</button>' +
          '<button class="btn-ico danger" title="Revoca staff" onclick="staffRevoke(\\''+s.userId+'\\',\\''+(u.displayName||'')+'\\')">'+IC.trash+'</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
    window.__roleNames = roleNames;
    $('.content', el).innerHTML =
      '<div class="page-h">Staff</div><div class="page-sub">'+(staff.length)+' membri staff con accesso amministrativo</div>' +
      '<div class="card"><div class="card-h"><h3>Membri staff</h3><button class="btn primary sm" onclick="staffInvite()">'+IC.plus+' Invita staff</button></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Membro</th><th>Stato</th><th>MFA</th><th>Ultimo accesso</th><th>ID</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>' +
      '</div>';
  } catch (e) { $('.content', el).innerHTML = '<div class="card"><h3>Errore</h3><p style="color:var(--err)">'+e.message+'</p></div>'; }
}
window.staffInvite = () => {
  const roleOpts = (window.__roleNames||[]).map(n => '<option value="'+n+'">'+n+'</option>').join('');
  openModal('Invita membro staff',
    '<div class="form-row"><label>Email</label><input id="s_email" type="email" placeholder="nome@email.com"></div>' +
    '<div class="form-row"><label>Nome visualizzato</label><input id="s_name" placeholder="Mario Rossi"></div>' +
    '<div class="form-row"><label>Ruoli</label><select id="s_roles" multiple style="height:120px">'+roleOpts+'</select><div class="hint">Ctrl/Cmd+clic per selezione multipla</div></div>' +
    '<div class="form-row"><label><input type="checkbox" id="s_sendemail" checked style="width:auto;margin-right:6px"> Invia email di invito</label></div>',
    '<button class="btn" onclick="closeModal()">Annulla</button><button class="btn primary" onclick="staffInviteSubmit()">Invita</button>');
};
window.staffInviteSubmit = async () => {
  const roles = [...$('#s_roles').selectedOptions].map(o => o.value);
  if (!roles.length) return toast('Seleziona almeno un ruolo', 'err');
  const body = { email: $('#s_email').value.trim(), displayName: $('#s_name').value.trim(), roleNames: roles, sendInviteEmail: $('#s_sendemail').checked };
  if (!body.email || !body.displayName) return toast('Email e nome obbligatori', 'err');
  try { await api('/staff/invite', { method:'POST', body: JSON.stringify(body) }); closeModal(); toast('Invito inviato', 'ok'); router(); }
  catch (e) { toast(e.message, 'err'); }
};
window.staffAssign = (userId, name) => {
  const roleOpts = (window.__roleNames||[]).map(n => '<option value="'+n+'">'+n+'</option>').join('');
  openModal('Assegna ruolo a '+(name||''),
    '<div class="form-row"><label>Ruolo</label><select id="a_role">'+roleOpts+'</select></div>' +
    '<div class="form-row"><label>Motivo (opzionale)</label><input id="a_reason" placeholder="Motivo assegnazione"></div>',
    '<button class="btn" onclick="closeModal()">Annulla</button><button class="btn primary" onclick="staffAssignSubmit(\\''+userId+'\\')">Assegna</button>');
};
window.staffAssignSubmit = async (userId) => {
  const body = { roleName: $('#a_role').value, reason: $('#a_reason').value.trim() };
  try { await api('/staff/'+userId+'/assign-role', { method:'PATCH', body: JSON.stringify(body) }); closeModal(); toast('Ruolo assegnato', 'ok'); router(); }
  catch (e) { toast(e.message, 'err'); }
};
window.staffToggleMfa = async (userId, required) => {
  try { await api('/staff/'+userId+'/require-mfa', { method:'PATCH', body: JSON.stringify({ required }) }); toast('MFA '+(required?'attivata':'disattivata'), 'ok'); router(); }
  catch (e) { toast(e.message, 'err'); }
};
window.staffRevoke = async (userId, name) => {
  if (!confirm('Revocare accesso staff a '+(name||'')+'?')) return;
  try { await api('/staff/'+userId+'/revoke', { method:'PATCH', body: JSON.stringify({}) }); toast('Staff revocato', 'ok'); router(); }
  catch (e) { toast(e.message, 'err'); }
};

// ==================== AUDIT PAGE ====================
async function auditPage(el, path) {
  el.innerHTML = shell(path, '<div class="loading"><div class="spinner"></div>Caricamento audit…</div>');
  try {
    const data = await api('/audit');
    const items = data.items || data;
    const rows = (items||[]).map(l => {
      const actor = l.actor?.displayName || l.actor?.email || (l.actorId||'').slice(0,8) || 'Sistema';
      return '<tr>' +
        '<td class="mono" style="font-size:11px">'+fmt.datetime(l.createdAt)+'</td>' +
        '<td>'+actionBadge(l.action)+'</td>' +
        '<td><div style="font-weight:600">'+actor+'</div>'+(l.actor?.email?'<div class="p-email">'+l.actor.email+'</div>':'')+'</td>' +
        '<td><span class="pill">'+(l.resourceType||'—')+'</span></td>' +
        '<td>'+(l.result==='success'?'<span class="badge ok">success</span>':'<span class="badge err">fail</span>')+'</td>' +
        '<td class="mono" style="font-size:11px;color:var(--muted)">'+(l.ip||'—')+'</td>' +
        '<td class="id" title="'+(l.id||'')+'">'+(l.id||'').slice(0,8)+'</td>' +
      '</tr>';
    }).join('');
    $('.content', el).innerHTML =
      '<div class="page-h">Audit Log</div><div class="page-sub">'+(items.length)+' eventi di audit · ultime azioni sulla piattaforma</div>' +
      '<div class="card"><div class="card-h"><h3>Eventi recenti</h3><button class="btn sm" onclick="router()">'+IC.refresh+' Aggiorna</button></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Azione</th><th>Attore</th><th>Risorsa</th><th>Risultato</th><th>IP</th><th>ID</th></tr></thead><tbody>'+rows+'</tbody></table></div>' +
      '</div>';
  } catch (e) { $('.content', el).innerHTML = '<div class="card"><h3>Errore</h3><p style="color:var(--err)">'+e.message+'</p></div>'; }
}

// ==================== MODAL ====================
function openModal(title, bodyHTML, footerHTML='') {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg'; bg.id = 'modal';
  bg.innerHTML = '<div class="modal">' +
    '<div class="modal-h"><h3>'+title+'</h3><button class="close-x" onclick="closeModal()">'+IC.close+'</button></div>' +
    '<div class="modal-b">'+bodyHTML+'</div>' +
    (footerHTML ? '<div class="modal-f">'+footerHTML+'</div>' : '') +
  '</div>';
  document.body.appendChild(bg);
  bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
}
window.closeModal = () => { $('#modal')?.remove(); };

// ==================== INIT ====================
if (!store.get('at') && currentRoute() !== '/login') {
  location.hash = '#/login';
}
router();
</script>
</body>
</html>`;
