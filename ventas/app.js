'use strict';
const KEY = 'ventas-mes-v1';
const GAMAS = ['alta', 'media', 'baja'];
const LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const OLD_SEED = ['Magic Pad 4 12,3" OLED','Honor 600 5G 8+512','Pad 10 12,1" 8GB (1602942)','Pad 10 12,1" 8GB (1668755)','600 Lite 5G (1668633)','600 Lite 5G (1668702)','600 Lite 5G (1668634)','600 Smart 6,87" 5G','Magic 8 Lite (1611266)','Magic 8 Lite (1611264)','Pad X8B 11" 4RAM/64GB','Pad X8B 11" 6RAM/256GB','400 Smart 4G (1604932)','400 Smart 4G (1604933)','X5C Plus 4G'];
const SEED = [ // [nombre, gama]  (High=alta, Mid=media, Entry=baja)
  ['Magic V6', 'alta'], ['M8 Pro', 'alta'], ['H600 Pro', 'alta'], ['H600', 'alta'], ['PAD 4', 'alta'],
  ['H400', 'media'], ['M8 Lite', 'media'], ['H600 Lite', 'media'], ['PAD X9 max', 'media'], ['PAD 10', 'media'],
  ['H600 Smart', 'baja'], ['PAD X8b', 'baja'], ['PAD X9a', 'baja'], ['H400 Smart', 'baja'], ['PAD X8a', 'baja'], ['X5c Plus', 'baja'],
];
// Campaña noviembre 2026 (comunicado): tope por gama e incentivos unitarios desde la primera unidad.
const NOV = {
  goals: { alta: 30, media: 85, baja: 100, inc: { alta: 400, media: 400, baja: 200 }, max: { alta: 140, media: 120, baja: 110 },
    unit: [{ model: 'Magic V6', amounts: [50, 70, 100] }, { model: 'M8 Pro', amounts: [20] }, { model: 'H600', amounts: [10] }, { model: 'H600 Lite', amounts: [5] }] },
  sold: { alta: 3, media: 19, baja: 19 }
};
// Unidades por modelo del 1 al 10/11 (TPV Media Markt El Prat, marca Honor; las variantes del mismo modelo se suman)
const NOV_SALES = [['PAD 4', 2], ['PAD 10', 13], ['PAD X8b', 1], ['H400 Smart', 14], ['H600', 1], ['H600 Lite', 5], ['H600 Smart', 2], ['M8 Lite', 2], ['X5c Plus', 8]];
const nowMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
let state = load();
let month = nowMonth();

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  return migrate(s);
}
function migrate(s) {
  if (!s || !s.models) s = { models: [], sales: [], goals: {} };
  const v = s.seedVersion || 0;
  if (v < 2) {
    const used = new Set(s.sales.map(x => x.modelId));
    s.models = s.models.filter(m => !(OLD_SEED.includes(m.name) && !used.has(m.id)));
    SEED.forEach(([name, gama]) => { if (!s.models.some(m => m.name === name || (name === 'H600 Lite' && m.name === '600 Lite'))) s.models.push({ id: uid(), name, gama }); });
    if (!s.goals['2026-11'] && !s.sales.some(x => x.date.startsWith('2026-11'))) {
      s.goals['2026-11'] = structuredClone(NOV.goals);
      GAMAS.forEach(g => s.sales.push({ id: uid(), date: '2026-11-10', modelId: null, name: 'Acumulado hasta 10/11 (sin desglosar)', gama: g, qty: NOV.sold[g] }));
    }
  } else if (v < 3) {
    const g = s.goals['2026-11'];
    if (g && !g.inc && g.alta === 30 && g.media === 85 && g.baja === 100) g.inc = NOV.goals.inc;
  }
  if (v < 4) { // "600 Lite" pasa a llamarse "H600 Lite"; tope y unitarios de noviembre
    s.models.forEach(m => { if (m.name === '600 Lite') m.name = 'H600 Lite'; });
    s.sales.forEach(x => { if (x.name === '600 Lite') x.name = 'H600 Lite'; });
    const g = s.goals['2026-11'];
    if (g && g.alta === 30 && g.media === 85 && g.baja === 100) { g.inc = g.inc || NOV.goals.inc; g.max = g.max || NOV.goals.max; g.unit = g.unit || structuredClone(NOV.goals.unit); }
  }
  if (v < 5) { // acumulado hasta el 10/11: sustituye los totales por gama por las unidades de cada modelo (foto del TPV)
    const lump = s.sales.filter(x => !x.modelId && x.name.startsWith('Acumulado hasta 10/11'));
    if (lump.length) {
      s.sales = s.sales.filter(x => !lump.includes(x));
      NOV_SALES.forEach(([name, qty]) => {
        const m = s.models.find(k => k.name === name); if (!m) return;
        s.sales.push({ id: uid(), date: '2026-11-10', modelId: m.id, name: m.name, gama: m.gama, qty });
      });
    }
  }
  s.seedVersion = 5;
  return s;
}
function persistLocal() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert('No se pudo guardar en el navegador.'); } }
function save() { persistLocal(); schedulePush(); }

// Objetivo de cada mes: se configura a mano, no se hereda del mes anterior.
const hasGoals = m => !!state.goals[m];
const eur = n => (Math.round(n * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' €';
const goalsFor = m => state.goals[m] || { alta: 0, media: 0, baja: 0 };
const incOf = (g, x) => +((g.inc || {})[x]) || 0;
const maxOf = (g, x) => Math.max(100, +((g.max || {})[x]) || 100);   // tope de cumplimiento (%)
const soldIn = (sales, x) => sales.filter(s => s.gama === x).reduce((a, s) => a + s.qty, 0);
// Incentivo de gama: <80% → 0; desde el 80% lineal (cumplimiento × importe) hasta el tope de la gama.
const earned = (sold, goal, inc, maxPct) => !goal || sold < Math.ceil(goal * 0.8) ? 0 : inc * Math.min(sold / goal, maxPct / 100);
// Incentivo por unidad: importes en orden (1ª, 2ª, 3ª…); el último se repite para el resto.
const unitPay = (amounts, n) => { let t = 0; for (let i = 0; i < n; i++) t += +amounts[Math.min(i, amounts.length - 1)] || 0; return t; };
const unitRows = (g, sales) => (g.unit || []).map(r => {
  const n = sales.filter(s => s.name === r.model).reduce((a, s) => a + s.qty, 0);
  return { model: r.model, amounts: r.amounts, n, pay: unitPay(r.amounts, n), next: +r.amounts[Math.min(n, r.amounts.length - 1)] || 0 };
});
function incentives(m) {
  const g = goalsFor(m), sales = state.sales.filter(s => s.date.startsWith(m));
  let gamas = 0, gamasMax = 0;
  GAMAS.forEach(x => { gamas += earned(soldIn(sales, x), +g[x] || 0, incOf(g, x), maxOf(g, x)); gamasMax += incOf(g, x) * maxOf(g, x) / 100; });
  const units = unitRows(g, sales).reduce((a, r) => a + r.pay, 0);
  return { gamas, gamasMax, units, total: gamas + units };
}
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const monthName = m => { const [y, n] = m.split('-'); return `${MESES[+n - 1]} ${y}`; };
const monthSales = () => state.sales.filter(s => s.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));

function render() {
  $('month').value = month;
  const sales = monthSales();

  // selector de modelos
  $('sale-model').innerHTML = state.models.map(m => `<option value="${m.id}">${esc(m.name)} (${LABEL[m.gama]})</option>`).join('');
  $('no-models').hidden = state.models.length > 0;
  $('sale-form').hidden = state.models.length === 0;

  // gamas
  const goals = goalsFor(month);
  $('goal-banner').hidden = hasGoals(month);
  $('edit-goals').hidden = !hasGoals(month);
  $('gamas').innerHTML = GAMAS.map(g => {
    const sold = soldIn(sales, g), goal = +goals[g] || 0, mx = maxOf(goals, g), inc = incOf(goals, g);
    const t80 = Math.ceil(goal * 0.8), tMax = Math.ceil(goal * mx / 100);
    const pct = goal ? Math.round(sold / goal * 100) : 0;
    const to80 = Math.max(0, t80 - sold), to100 = Math.max(0, goal - sold);
    const fill = goal ? Math.min(100, sold / (goal * mx / 100) * 100) : 0;
    const marks = goal ? `<b style="left:${80 / mx * 100}%"><span>80%</span></b>` + (mx > 100 ? `<b style="left:${100 / mx * 100}%"><span>100%</span></b>` : '') : '';
    return `<div class="gama" style="--c:var(--${g})">
      <h3>${LABEL[g]} <span>${goal ? pct + '%' : 'sin objetivo'}</span></h3>
      <div class="big">${sold} <small>/ ${goal} uds.</small></div>
      <div class="bar"><i style="width:${fill}%"></i>${marks}</div>
      <div class="miss"><span>Hasta 80% (${t80}): <strong class="${to80 || !goal ? '' : 'done'}">${goal ? (to80 || '✓') : '–'}</strong></span>
      <span>Hasta 100%: <strong class="${to100 || !goal ? '' : 'done'}">${goal ? (to100 || '✓') : '–'}</strong></span></div>
      ${inc ? `<div class="inc">Incentivo ahora: <strong>${eur(earned(sold, goal, inc, mx))}</strong><br>80%: ${eur(inc * 0.8)} · 100%: ${eur(inc)}${mx > 100 ? ` · tope ${mx}% (${tMax} uds.): ${eur(inc * mx / 100)}` : ''}</div>` : ''}
    </div>`;
  }).join('');

  // incentivos por unidad
  const rows = unitRows(goals, sales), inc = incentives(month);
  $('unit-card').hidden = !rows.length;
  $('unit-table').tBodies[0].innerHTML = rows.map(r => `<tr><td>${esc(r.model)}</td><td class="n">${r.n}</td><td class="n">${r.amounts.map(eur).join(' / ')}</td><td class="n">${eur(r.next)}</td><td class="n"><strong>${eur(r.pay)}</strong></td></tr>`).join('');
  $('unit-total').textContent = eur(inc.units);
  const lump = sales.filter(s => !s.modelId).reduce((a, s) => a + s.qty, 0);
  $('unit-warn').hidden = !(rows.length && lump);
  $('unit-warn').textContent = `${lump} uds. del acumulado sin desglosar no cuentan para estos incentivos. Añádelas como ventas por modelo y borra el acumulado.`;

  // total de incentivo
  $('inc-total').hidden = !(inc.gamasMax || rows.length);
  $('inc-total').innerHTML = `Incentivo conseguido ahora: <strong>${eur(inc.total)}</strong><br><span class="footnote">Gamas ${eur(inc.gamas)} (máx. ${eur(inc.gamasMax)}) + unidades ${eur(inc.units)}</span>`;

  // historial
  const ms = new Set([...Object.keys(state.goals), ...state.sales.map(s => s.date.slice(0, 7)), nowMonth()]);
  $('history').tBodies[0].innerHTML = [...ms].sort().reverse().map(m => {
    const g = goalsFor(m), ss = state.sales.filter(s => s.date.startsWith(m));
    const cells = GAMAS.map(x => {
      const sold = soldIn(ss, x), goal = +g[x] || 0;
      return `<td>${sold} / ${goal || '–'}${goal ? ` (${Math.round(sold / goal * 100)}%)` : ''}</td>`;
    }).join('');
    const t = incentives(m);
    return `<tr data-month="${m}" class="${m === month ? 'cur' : ''}"><td>${monthName(m)}</td>${cells}<td>${hasGoals(m) ? eur(t.total) : '–'}</td></tr>`;
  }).join('');

  // por modelo (ventas del mes agrupadas por nombre; incluye modelos activos sin ventas)
  const map = new Map();
  state.models.forEach(m => map.set(m.name + '|' + m.gama, { name: m.name, gama: m.gama, qty: 0 }));
  sales.forEach(s => {
    const k = s.name + '|' + s.gama;
    if (!map.has(k)) map.set(k, { name: s.name, gama: s.gama, qty: 0 });
    map.get(k).qty += s.qty;
  });
  const mrows = [...map.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  $('by-model').tBodies[0].innerHTML = mrows.length
    ? mrows.map(r => `<tr><td>${esc(r.name)}</td><td><span class="tag ${r.gama}">${LABEL[r.gama]}</span></td><td class="n">${r.qty}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">Sin datos</td></tr>';
  const top = mrows.filter(r => r.qty > 0 && !r.name.startsWith('Acumulado')).slice(0, 5);
  $('top').innerHTML = top.length ? top.map(r => `<li>${esc(r.name)} <span>${r.qty}</span></li>`).join('') : '<li class="empty">Aún no hay ventas este mes</li>';

  // listado de ventas
  $('total').textContent = sales.reduce((a, s) => a + s.qty, 0) + ' uds.';
  $('sales').tBodies[0].innerHTML = sales.length
    ? sales.map(s => `<tr><td>${s.date.split('-').reverse().join('/')}</td><td>${esc(s.name)}</td><td><span class="tag ${s.gama}">${LABEL[s.gama]}</span></td><td class="n">${s.qty}</td><td class="n"><button class="del" aria-label="Borrar venta" data-sale="${s.id}" title="Borrar">✕</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Sin ventas este mes</td></tr>';

  // gestión de modelos
  $('models').innerHTML = state.models.length
    ? state.models.map(m => `<li><span>${esc(m.name)}</span><span><select class="ag-input footnote" data-gama="${m.id}">${GAMAS.map(g => `<option value="${g}"${g === m.gama ? ' selected' : ''}>${LABEL[g]}</option>`).join('')}</select> <button class="del" aria-label="Quitar modelo" data-model="${m.id}" title="Quitar modelo">✕</button></span></li>`).join('')
    : '<li class="empty">No hay modelos todavía</li>';
}

function shiftMonth(d) {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  setDefaultDate(); render();

// ---------- Cuenta y sincronización (Supabase) ----------
const CFG = window.SUPABASE_CONFIG;
let sb = null, session = null, rev = 0, pushTimer = null, pushing = false, dirty = false;
function setStatus(text, s = '') { $('sync').textContent = text; $('sync-dot').dataset.s = s; $('sync-dot').title = text; }
const traducir = m => /invalid login/i.test(m) ? 'Correo o contraseña incorrectos.'
  : /not confirmed/i.test(m) ? 'Falta confirmar el correo: abre el enlace que te hemos enviado.'
  : /already registered|registro cerrado|database error/i.test(m) ? 'Esta app ya tiene su cuenta: usa “Entrar”.'
  : /password/i.test(m) ? 'La contraseña debe tener al menos 8 caracteres.'
  : /rate limit|too many/i.test(m) ? 'Demasiados intentos: espera unos minutos y prueba otra vez.'
  : 'No se pudo completar. Comprueba la conexión y vuelve a intentarlo.';

function askLogin() {
  return new Promise(resolve => {
    const dlg = $('auth-dialog'), msg = $('auth-msg');
    dlg.addEventListener('cancel', e => e.preventDefault());
    $('auth-form').onsubmit = async e => {
      e.preventDefault();
      const kind = e.submitter && e.submitter.value, email = $('auth-email').value.trim(), password = $('auth-pass').value;
      msg.hidden = true; $('auth-form').querySelectorAll('button').forEach(b => b.disabled = true);
      const { data, error } = kind === 'signup' ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
      $('auth-form').querySelectorAll('button').forEach(b => b.disabled = false);
      if (error) { msg.textContent = traducir(error.message); msg.hidden = false; return; }
      if (!data.session) { msg.textContent = 'Te hemos enviado un correo: confirma y vuelve a pulsar “Entrar”.'; msg.hidden = false; return; }
      session = data.session; dlg.close(); resolve();
    };
    dlg.showModal();
  });
}
async function pull() {
  setStatus('Sincronizando…');
  const { data, error } = await sb.from('app_state').select('data,rev').maybeSingle();
  if (error) { setStatus('Sin conexión: los cambios se guardan en este dispositivo', 'off'); return false; }
  if (data) { state = migrate(data.data); rev = data.rev; persistLocal(); setStatus('Sincronizado', 'ok'); render(); return true; }
  rev = 0; await push(); return true;   // primera vez: sube lo que hay en este dispositivo
}
function schedulePush() { if (!sb || !session) return; dirty = true; setStatus('Guardando…', 'busy'); clearTimeout(pushTimer); pushTimer = setTimeout(push, 700); }
async function push() {
  if (!sb || !session || pushing) return;
  clearTimeout(pushTimer); pushing = true; dirty = false;
  const row = { user_id: session.user.id, data: state, rev: rev + 1, updated_at: new Date().toISOString() };
  const r = rev === 0 ? await sb.from('app_state').insert(row).select('rev')
    : await sb.from('app_state').update(row).eq('user_id', session.user.id).eq('rev', rev).select('rev');
  pushing = false;
  if (r.error || !r.data || !r.data.length) {   // conflicto (otro dispositivo guardó antes) o sin conexión
    if (r.error && !/duplicate|conflict/i.test(r.error.message)) { setStatus('Sin conexión: los cambios se guardan en este dispositivo', 'off'); return; }
    await pull(); setStatus('Se actualizó desde otro dispositivo: repite el último cambio si no aparece', 'off'); return;
  }
  rev = r.data[0].rev; setStatus('Sincronizado', 'ok');
  if (dirty) schedulePush();
}
async function initCloud() {
  if (!CFG || !window.supabase) { ready = true; checkNewMonth(); return; }
  sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
  session = (await sb.auth.getSession()).data.session;
  sb.auth.onAuthStateChange((_e, s) => { session = s; });
  if (!session) await askLogin();
  await pull();
  ready = true; render(); checkNewMonth();
}
document.addEventListener('visibilitychange', () => {
  if (!sb || !session) return;
  if (document.hidden) { if (dirty) push(); }
  else if (!dirty && !pushing && !document.querySelector('dialog[open]')) pull();
});
$('logout').onclick = async () => {
  if (!sb || !confirm('¿Cerrar sesión en este dispositivo?')) return;
  await sb.auth.signOut(); try { localStorage.removeItem(KEY); } catch (e) {} location.reload();
};
initCloud();
}
function setDefaultDate() {
  const today = new Date(); const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  $('sale-date').value = t.startsWith(month) ? t : month + '-01';
}

$('prev').onclick = () => shiftMonth(-1);
$('next').onclick = () => shiftMonth(1);
$('month').onchange = e => { if (e.target.value) { month = e.target.value; setDefaultDate(); render(); } };

$('sale-form').onsubmit = e => {
  e.preventDefault();
  const m = state.models.find(x => x.id === $('sale-model').value);
  const qty = parseInt($('sale-qty').value, 10);
  if (!m || !(qty > 0)) return;
  state.sales.push({ id: uid(), date: $('sale-date').value, modelId: m.id, name: m.name, gama: m.gama, qty });
  save();
  month = $('sale-date').value.slice(0, 7);
  $('sale-qty').value = 1; render();
};
$('model-form').onsubmit = e => {
  e.preventDefault();
  const name = $('model-name').value.trim(); if (!name) return;
  state.models.push({ id: uid(), name, gama: $('model-gama').value });
  save(); $('model-name').value = ''; render();
};
function ruleRow(model = '', amounts = '') {
  const names = [...new Set([...state.models.map(m => m.name), ...(model ? [model] : [])])];
  const d = document.createElement('div'); d.className = 'rule';
  d.innerHTML = `<select class="ag-input body" aria-label="Modelo">${names.map(n => `<option${n === model ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <input class="ag-input body" aria-label="Importes por unidad" placeholder="Ej. 50, 70, 100" value="${esc(amounts)}">
    <button type="button" class="del" aria-label="Quitar" data-rule-del>✕</button>`;
  $('unit-rules').appendChild(d);
}
function openGoals() {
  const g = goalsFor(month), has = hasGoals(month);
  $('goal-title').textContent = 'Objetivos de ' + monthName(month);
  GAMAS.forEach(x => { $('goal-' + x).value = has ? g[x] : ''; $('inc-' + x).value = has ? incOf(g, x) : ''; $('max-' + x).value = has ? maxOf(g, x) : ''; });
  $('unit-rules').innerHTML = '';
  (g.unit || []).forEach(r => ruleRow(r.model, r.amounts.join(', ')));
  $('goal-dialog').showModal();
}
$('goals-form').onsubmit = e => {
  if (e.submitter && e.submitter.value !== 'ok') return;
  const num = (id, f = parseFloat) => Math.max(0, f($(id).value) || 0);
  const g = Object.fromEntries(GAMAS.map(x => [x, num('goal-' + x, v => parseInt(v, 10))]));
  g.inc = Object.fromEntries(GAMAS.map(x => [x, num('inc-' + x)]));
  g.max = Object.fromEntries(GAMAS.map(x => [x, Math.max(100, num('max-' + x) || 100)]));
  g.unit = [...$('unit-rules').children].map(d => ({
    model: d.querySelector('select').value,
    amounts: d.querySelector('input').value.split(/[,;\s]+/).map(parseFloat).filter(n => n >= 0)
  })).filter(r => r.model && r.amounts.length);
  state.goals[month] = g;
  save(); render();
};
$('add-rule').onclick = () => ruleRow();
$('goal-cancel').onclick = () => $('goal-dialog').close();
$('history').onclick = e => { const tr = e.target.closest('tr[data-month]'); if (tr) { month = tr.dataset.month; setDefaultDate(); render(); } };
$('models').onchange = e => {
  const id = e.target.dataset.gama; if (!id) return;
  const m = state.models.find(x => x.id === id); m.gama = e.target.value;
  state.sales.forEach(s => { if (s.modelId === id) s.gama = m.gama; });
  save(); render();
};
// Al abrir (o al cambiar de mes con la página abierta) pide el objetivo del mes en curso si falta.
let askedFor = '', ready = false;
function checkNewMonth() {
  if (!ready) return;
  const cur = nowMonth();
  if (cur !== askedFor && !hasGoals(cur)) {
    askedFor = cur; month = cur; setDefaultDate(); render();

// ---------- Cuenta y sincronización (Supabase) ----------
const CFG = window.SUPABASE_CONFIG;
let sb = null, session = null, rev = 0, pushTimer = null, pushing = false, dirty = false;
function setStatus(text, s = '') { $('sync').textContent = text; $('sync-dot').dataset.s = s; $('sync-dot').title = text; }
const traducir = m => /invalid login/i.test(m) ? 'Correo o contraseña incorrectos.'
  : /not confirmed/i.test(m) ? 'Falta confirmar el correo: abre el enlace que te hemos enviado.'
  : /already registered|registro cerrado|database error/i.test(m) ? 'Esta app ya tiene su cuenta: usa “Entrar”.'
  : /password/i.test(m) ? 'La contraseña debe tener al menos 8 caracteres.'
  : /rate limit|too many/i.test(m) ? 'Demasiados intentos: espera unos minutos y prueba otra vez.'
  : 'No se pudo completar. Comprueba la conexión y vuelve a intentarlo.';

function askLogin() {
  return new Promise(resolve => {
    const dlg = $('auth-dialog'), msg = $('auth-msg');
    dlg.addEventListener('cancel', e => e.preventDefault());
    $('auth-form').onsubmit = async e => {
      e.preventDefault();
      const kind = e.submitter && e.submitter.value, email = $('auth-email').value.trim(), password = $('auth-pass').value;
      msg.hidden = true; $('auth-form').querySelectorAll('button').forEach(b => b.disabled = true);
      const { data, error } = kind === 'signup' ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
      $('auth-form').querySelectorAll('button').forEach(b => b.disabled = false);
      if (error) { msg.textContent = traducir(error.message); msg.hidden = false; return; }
      if (!data.session) { msg.textContent = 'Te hemos enviado un correo: confirma y vuelve a pulsar “Entrar”.'; msg.hidden = false; return; }
      session = data.session; dlg.close(); resolve();
    };
    dlg.showModal();
  });
}
async function pull() {
  setStatus('Sincronizando…');
  const { data, error } = await sb.from('app_state').select('data,rev').maybeSingle();
  if (error) { setStatus('Sin conexión: los cambios se guardan en este dispositivo', 'off'); return false; }
  if (data) { state = migrate(data.data); rev = data.rev; persistLocal(); setStatus('Sincronizado', 'ok'); render(); return true; }
  rev = 0; await push(); return true;   // primera vez: sube lo que hay en este dispositivo
}
function schedulePush() { if (!sb || !session) return; dirty = true; setStatus('Guardando…', 'busy'); clearTimeout(pushTimer); pushTimer = setTimeout(push, 700); }
async function push() {
  if (!sb || !session || pushing) return;
  clearTimeout(pushTimer); pushing = true; dirty = false;
  const row = { user_id: session.user.id, data: state, rev: rev + 1, updated_at: new Date().toISOString() };
  const r = rev === 0 ? await sb.from('app_state').insert(row).select('rev')
    : await sb.from('app_state').update(row).eq('user_id', session.user.id).eq('rev', rev).select('rev');
  pushing = false;
  if (r.error || !r.data || !r.data.length) {   // conflicto (otro dispositivo guardó antes) o sin conexión
    if (r.error && !/duplicate|conflict/i.test(r.error.message)) { setStatus('Sin conexión: los cambios se guardan en este dispositivo', 'off'); return; }
    await pull(); setStatus('Se actualizó desde otro dispositivo: repite el último cambio si no aparece', 'off'); return;
  }
  rev = r.data[0].rev; setStatus('Sincronizado', 'ok');
  if (dirty) schedulePush();
}
async function initCloud() {
  if (!CFG || !window.supabase) { ready = true; checkNewMonth(); return; }
  sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
  session = (await sb.auth.getSession()).data.session;
  sb.auth.onAuthStateChange((_e, s) => { session = s; });
  if (!session) await askLogin();
  await pull();
  ready = true; render(); checkNewMonth();
}
document.addEventListener('visibilitychange', () => {
  if (!sb || !session) return;
  if (document.hidden) { if (dirty) push(); }
  else if (!dirty && !pushing && !document.querySelector('dialog[open]')) pull();
});
$('logout').onclick = async () => {
  if (!sb || !confirm('¿Cerrar sesión en este dispositivo?')) return;
  await sb.auth.signOut(); try { localStorage.removeItem(KEY); } catch (e) {} location.reload();
};
initCloud();
    if (!$('goal-dialog').open) openGoals();
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewMonth(); });
setInterval(checkNewMonth, 60000);
document.addEventListener('click', e => {
  if (e.target.matches('[data-open-goals]')) return openGoals();
  if (e.target.matches('[data-rule-del]')) return e.target.closest('.rule').remove();
  const sid = e.target.dataset && e.target.dataset.sale, mid = e.target.dataset && e.target.dataset.model;
  if (sid && confirm('¿Borrar esta venta?')) { state.sales = state.sales.filter(s => s.id !== sid); save(); render(); }
  if (mid) {
    const m = state.models.find(x => x.id === mid);
    if (confirm(`¿Quitar “${m.name}” de la lista? Sus ventas ya registradas se mantienen.`)) { state.models = state.models.filter(x => x.id !== mid); save(); render(); }
  }
});

$('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  a.download = `ventas-${new Date().toISOString().slice(0, 10)}.json`; a.click();
};
$('import').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.models) || !Array.isArray(d.sales)) throw 0;
    if (confirm('Esto reemplazará los datos actuales. ¿Continuar?')) { state = migrate({ models: d.models, sales: d.sales, goals: d.goals || {}, seedVersion: d.seedVersion }); save(); render(); }
  } catch (_) { alert('Archivo no válido.'); }
  e.target.value = '';
};

setDefaultDate(); render();

// ---------- Cuenta y sincronización (Supabase) ----------
const CFG = window.SUPABASE_CONFIG;
let sb = null, session = null, rev = 0, pushTimer = null, pushing = false, dirty = false;
function setStatus(text, s = '') { $('sync').textContent = text; $('sync-dot').dataset.s = s; $('sync-dot').title = text; }
const traducir = m => /invalid login/i.test(m) ? 'Correo o contraseña incorrectos.'
  : /not confirmed/i.test(m) ? 'Falta confirmar el correo: abre el enlace que te hemos enviado.'
  : /already registered|registro cerrado|database error/i.test(m) ? 'Esta app ya tiene su cuenta: usa “Entrar”.'
  : /password/i.test(m) ? 'La contraseña debe tener al menos 8 caracteres.'
  : /rate limit|too many/i.test(m) ? 'Demasiados intentos: espera unos minutos y prueba otra vez.'
  : 'No se pudo completar. Comprueba la conexión y vuelve a intentarlo.';

function askLogin() {
  return new Promise(resolve => {
    const dlg = $('auth-dialog'), msg = $('auth-msg');
    dlg.addEventListener('cancel', e => e.preventDefault());
    $('auth-form').onsubmit = async e => {
      e.preventDefault();
      const kind = e.submitter && e.submitter.value, email = $('auth-email').value.trim(), password = $('auth-pass').value;
      msg.hidden = true; $('auth-form').querySelectorAll('button').forEach(b => b.disabled = true);
      const { data, error } = kind === 'signup' ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
      $('auth-form').querySelectorAll('button').forEach(b => b.disabled = false);
      if (error) { msg.textContent = traducir(error.message); msg.hidden = false; return; }
      if (!data.session) { msg.textContent = 'Te hemos enviado un correo: confirma y vuelve a pulsar “Entrar”.'; msg.hidden = false; return; }
      session = data.session; dlg.close(); resolve();
    };
    dlg.showModal();
  });
}
async function pull() {
  setStatus('Sincronizando…');
  const { data, error } = await sb.from('app_state').select('data,rev').maybeSingle();
  if (error) { setStatus('Sin conexión: los cambios se guardan en este dispositivo', 'off'); return false; }
  if (data) { state = migrate(data.data); rev = data.rev; persistLocal(); setStatus('Sincronizado', 'ok'); render(); return true; }
  rev = 0; await push(); return true;   // primera vez: sube lo que hay en este dispositivo
}
function schedulePush() { if (!sb || !session) return; dirty = true; setStatus('Guardando…', 'busy'); clearTimeout(pushTimer); pushTimer = setTimeout(push, 700); }
async function push() {
  if (!sb || !session || pushing) return;
  clearTimeout(pushTimer); pushing = true; dirty = false;
  const row = { user_id: session.user.id, data: state, rev: rev + 1, updated_at: new Date().toISOString() };
  const r = rev === 0 ? await sb.from('app_state').insert(row).select('rev')
    : await sb.from('app_state').update(row).eq('user_id', session.user.id).eq('rev', rev).select('rev');
  pushing = false;
  if (r.error || !r.data || !r.data.length) {   // conflicto (otro dispositivo guardó antes) o sin conexión
    if (r.error && !/duplicate|conflict/i.test(r.error.message)) { setStatus('Sin conexión: los cambios se guardan en este dispositivo', 'off'); return; }
    await pull(); setStatus('Se actualizó desde otro dispositivo: repite el último cambio si no aparece', 'off'); return;
  }
  rev = r.data[0].rev; setStatus('Sincronizado', 'ok');
  if (dirty) schedulePush();
}
async function initCloud() {
  if (!CFG || !window.supabase) { ready = true; checkNewMonth(); return; }
  sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
  session = (await sb.auth.getSession()).data.session;
  sb.auth.onAuthStateChange((_e, s) => { session = s; });
  if (!session) await askLogin();
  await pull();
  ready = true; render(); checkNewMonth();
}
document.addEventListener('visibilitychange', () => {
  if (!sb || !session) return;
  if (document.hidden) { if (dirty) push(); }
  else if (!dirty && !pushing && !document.querySelector('dialog[open]')) pull();
});
$('logout').onclick = async () => {
  if (!sb || !confirm('¿Cerrar sesión en este dispositivo?')) return;
  await sb.auth.signOut(); try { localStorage.removeItem(KEY); } catch (e) {} location.reload();
};
initCloud();
