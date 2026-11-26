import { Controller, Get, Res, Req, Headers } from '@nestjs/common';
import { Response, Request } from 'express';

/**
 * Controller Web — serve pagine HTML statiche sullo stesso dominio API.
 *
 * Permette all'utente di accedere a https://aura-ai-sa.vercel.app/ e vedere
 * una home con login form + dashboard base, invece del 404 "Cannot GET /".
 *
 * Le chiamate API (fetch) vanno agli endpoint NestJS esistenti (/auth/login,
 * /auth/me, /users, ecc.) sullo stesso dominio — niente CORS issues.
 */
@Controller()
export class WebController {
  @Get('/')
  root(@Res() res: Response) {
    res.type('text/html').send(HOME_HTML);
  }

  @Get('/login')
  loginPage(@Res() res: Response) {
    res.type('text/html').send(HOME_HTML);
  }

  @Get('/dashboard')
  dashboardPage(@Res() res: Response) {
    res.type('text/html').send(HOME_HTML);
  }
}

const HOME_HTML = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aura — Login</title>
<style>
:root{
  --bg:#0a0a0f; --panel:#13131c; --border:#2a2a3a; --text:#e8e8f0;
  --muted:#8888a0; --accent:#7c5cff; --accent2:#4f8cff; --ok:#4ade80;
  --err:#f87171; --warn:#fbbf24;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;min-height:100vh}
.wrap{max-width:480px;margin:0 auto;padding:24px 16px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:32px;font-size:24px;font-weight:700;letter-spacing:-0.02em}
.brand .logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px}
.brand .name{background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.card{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:28px;margin-bottom:20px}
.card h2{font-size:18px;margin-bottom:6px}
.card .sub{color:var(--muted);font-size:13px;margin-bottom:22px}
label{display:block;font-size:12px;color:var(--muted);margin:14px 0 6px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em}
input{width:100%;background:#0c0c14;border:1px solid var(--border);border-radius:10px;padding:12px 14px;color:var(--text);font-size:15px;outline:none;transition:border-color .15s}
input:focus{border-color:var(--accent)}
button{width:100%;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border:0;border-radius:10px;padding:13px;font-size:15px;font-weight:600;cursor:pointer;margin-top:22px;transition:transform .08s}
button:active{transform:scale(.98)}
button:disabled{opacity:.5;cursor:wait}
.msg{font-size:13px;margin-top:14px;min-height:18px}
.msg.err{color:var(--err)} .msg.ok{color:var(--ok)}
.hidden{display:none}
.avatar{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:18px;margin-right:14px;flex-shrink:0}
.user-row{display:flex;align-items:center;padding:16px 0;border-bottom:1px solid var(--border)}
.user-row:last-child{border-bottom:0}
.meta{font-size:12px;color:var(--muted);margin-top:3px}
.row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px}
.row:last-child{border-bottom:0}
.row .v{color:var(--muted);font-family:ui-monospace,Menlo,monospace;font-size:12px}
.badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;background:rgba(124,92,255,.15);color:var(--accent)}
.badge.ok{background:rgba(74,222,128,.15);color:var(--ok)}
.subhead{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin:18px 0 8px;font-weight:600}
.api-row{display:flex;gap:6px;margin-bottom:8px}
.api-row button{flex:0 0 auto;width:auto;padding:8px 12px;font-size:12px;margin:0;background:var(--border);border-radius:8px}
.api-row .p{flex:1;background:#0c0c14;border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.out{font-size:12px;font-family:ui-monospace,Menlo,monospace;background:#0c0c14;border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--muted);max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin-top:8px}
.out.ok{color:var(--ok)} .out.err{color:var(--err)}
.logout{background:transparent;border:1px solid var(--border);color:var(--text);margin-top:18px}
.logout:hover{border-color:var(--err);color:var(--err)}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">
    <div class="logo">A</div>
    <div class="name">Aura</div>
  </div>

  <!-- VIEW: LOGIN -->
  <div id="loginView" class="card">
    <h2>Accedi</h2>
    <div class="sub">Piattaforma Aura — area riservata</div>
    <form id="loginForm">
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="email" required placeholder="nome@email.com">
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" required placeholder="••••••••••••">
      <button type="submit" id="loginBtn">Accedi</button>
      <div class="msg" id="loginMsg"></div>
    </form>
  </div>

  <!-- VIEW: DASHBOARD -->
  <div id="dashView" class="hidden">
    <div class="card">
      <div class="user-row">
        <div class="avatar" id="uAvatar">S</div>
        <div>
          <div id="uName" style="font-weight:600;font-size:15px">—</div>
          <div class="meta" id="uEmail">—</div>
        </div>
        <span class="badge" id="uType" style="margin-left:auto">staff</span>
      </div>
      <div class="row"><span>Stato account</span><span class="badge ok" id="uStatus">active</span></div>
      <div class="row"><span>User ID</span><span class="v" id="uId">—</span></div>
      <div class="row"><span>Email verificata</span><span class="badge ok" id="uVerified">sì</span></div>
      <div class="row"><span>MFA</span><span class="v" id="uMfa">disattivata</span></div>
    </div>

    <div class="card">
      <div class="subhead">Endpoint API (test)</div>
      <div class="api-row"><button data-path="/auth/me" data-method="GET">GET</button><div class="p">/auth/me</div></div>
      <div class="api-row"><button data-path="/users" data-method="GET">GET</button><div class="p">/users</div></div>
      <div class="api-row"><button data-path="/roles" data-method="GET">GET</button><div class="p">/roles</div></div>
      <div class="api-row"><button data-path="/health" data-method="GET">GET</button><div class="p">/health</div></div>
      <div class="out" id="apiOut">Clicca un endpoint per testarlo.</div>
    </div>

    <div class="card">
      <div class="subhead">Token di sessione</div>
      <div class="row"><span>accessToken (primi 40)</span><span class="v" id="tokAcc">—</span></div>
      <div class="row"><span>refreshToken (primi 40)</span><span class="v" id="tokRef">—</span></div>
      <div class="row"><span>Scadenza refresh</span><span class="v" id="tokExp">—</span></div>
      <button class="logout" id="logoutBtn">Logout</button>
    </div>
  </div>
</div>

<script>
const $ = (id) => document.getElementById(id);
const api = (path, opts={}) => fetch(path, {credentials:'same-origin', headers:{'Content-Type':'application/json'}, ...opts})
  .then(async r => ({status:r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text()}));

// ---- LOGIN ----
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('loginBtn'); const msg = $('loginMsg');
  btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Accesso in corso…';
  try {
    const r = await api('/auth/login', {method:'POST', body:JSON.stringify({
      email: $('email').value.trim().toLowerCase(),
      password: $('password').value
    })});
    if (r.status === 201 && r.body?.accessToken) {
      localStorage.setItem('aura_at', r.body.accessToken);
      localStorage.setItem('aura_rt', r.body.refreshToken);
      localStorage.setItem('aura_user', JSON.stringify(r.body.user));
      msg.className = 'msg ok'; msg.textContent = '✓ Login riuscito';
      setTimeout(renderDash, 300);
    } else {
      msg.className = 'msg err';
      msg.textContent = '✗ ' + (r.body?.message || r.body?.error || ('HTTP ' + r.status));
    }
  } catch (err) {
    msg.className = 'msg err'; msg.textContent = '✗ Errore di rete: ' + err.message;
  } finally { btn.disabled = false; }
});

// ---- DASHBOARD ----
function renderDash() {
  const user = JSON.parse(localStorage.getItem('aura_user') || 'null');
  const at = localStorage.getItem('aura_at') || '';
  const rt = localStorage.getItem('aura_rt') || '';
  if (!user) return;
  $('loginView').classList.add('hidden');
  $('dashView').classList.remove('hidden');
  $('uName').textContent = user.displayName || '—';
  $('uEmail').textContent = user.email || '—';
  $('uType').textContent = user.accountType || '—';
  $('uStatus').textContent = user.status || '—';
  $('uId').textContent = user.id || '—';
  $('uVerified').textContent = user.emailVerified ? 'sì' : 'no';
  $('uMfa').textContent = user.mfaEnabled ? 'attiva' : 'disattivata';
  $('uAvatar').textContent = (user.displayName || user.email || 'A')[0].toUpperCase();
  $('tokAcc').textContent = at.slice(0,40) + '…';
  $('tokRef').textContent = rt.slice(0,40) + '…';
  // refresh token expiresAt — lo ricaviamo dal JWT
  try {
    const payload = JSON.parse(atob(at.split('.')[1]));
    $('tokExp').textContent = new Date(payload.exp * 1000).toLocaleString('it-IT');
  } catch { $('tokExp').textContent = '—'; }
}

// ---- API buttons ----
document.querySelectorAll('.api-row button').forEach(btn => {
  btn.addEventListener('click', async () => {
    const path = btn.dataset.path; const method = btn.dataset.method;
    const out = $('apiOut');
    out.className = 'out'; out.textContent = 'Caricamento…';
    try {
      const r = await api(path, {
        method,
        headers: method === 'GET' ? {Authorization:'Bearer ' + localStorage.getItem('aura_at')} : {'Content-Type':'application/json'}
      });
      out.className = 'out ' + (r.status < 400 ? 'ok' : 'err');
      out.textContent = method + ' ' + path + ' → HTTP ' + r.status + '\\n\\n' + JSON.stringify(r.body, null, 2);
    } catch (err) {
      out.className = 'out err'; out.textContent = 'Errore: ' + err.message;
    }
  });
});

// ---- LOGOUT ----
$('logoutBtn').addEventListener('click', async () => {
  await api('/auth/logout', {method:'POST'}).catch(()=>{});
  localStorage.removeItem('aura_at'); localStorage.removeItem('aura_rt'); localStorage.removeItem('aura_user');
  $('dashView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
  $('loginMsg').className='msg ok'; $('loginMsg').textContent = 'Disconnesso';
});

// ---- INIT ----
if (localStorage.getItem('aura_at')) renderDash();
</script>
</body>
</html>`;
