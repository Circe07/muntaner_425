'use strict';
const KEY = 'ventas-mes-v1';
const inApp = /VentasApp/.test(navigator.userAgent);          // dentro del APK de Android
const isAndroid = /android/i.test(navigator.userAgent);
const GAMAS = ['alta', 'media', 'baja'];                       // plan sencillo (modo manual)
const LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const { eur, eur0, fmtV, norm } = Plan;
const clone = o => JSON.parse(JSON.stringify(o));

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
// Plantilla de la marca (campaña noviembre 2026): sirve para rellenar el primer mes de cada cuenta nueva.
const BRAND_TEMPLATE = { inc: NOV.goals.inc, max: NOV.goals.max, unit: NOV.goals.unit };
// Cuenta nueva: modelos de la marca, sin ventas ni objetivos (cada persona pone los suyos).
const freshState = () => ({ models: [], sales: [], goals: {}, plans: {}, seedVersion: 8 });
const seedNames = new Set(SEED.map(([n]) => n.trim().toLowerCase()));
const isSeedName = n => seedNames.has(String(n).trim().toLowerCase());
const nowMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
let state = load();
let month = nowMonth();

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  return migrate(s);
}
function migrate(s) {
  if (!s || !s.models) return freshState();
  const v = s.seedVersion || 0;
  if (!s.goals) s.goals = {};
  if (!s.plans) s.plans = {};
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
  Object.keys(s.plans).forEach(k => { if (!Array.isArray(s.plans[k])) s.plans[k] = s.plans[k] ? [s.plans[k]] : []; });
  s.seedVersion = 8;
  return s;
}
function persistLocal() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert('No se pudo guardar en el navegador.'); } }
function save() { persistLocal(); schedulePush(); }

// ---------- planes de objetivos (el cálculo vive en plan.js) ----------
const monthKeys = () => [...new Set([...Object.keys(state.plans || {}).filter(k => (state.plans[k] || []).length), ...Object.keys(state.goals || {})])].sort();
// Planes del mes: una lista (el mensual y, si hay, los semanales). Si el mes no tiene lista, se usa el plan sencillo de tres gamas.
const honorUser = () => state.models.some(m => isSeedName(m.name));
function promptModels() {
  const used = new Set(state.sales.map(s => norm(s.name)));
  return [...new Set(state.models.map(m => m.name))].filter(n => !n.startsWith('Acumulado') && (used.has(norm(n)) || !isSeedName(n)));
}
function plansOf(m) {
  const p = state.plans && state.plans[m];
  if (Array.isArray(p)) return p;
  if (state.goals[m]) return [Plan.fromLegacy(state.goals[m])];
  return [];
}
const hasGoals = m => plansOf(m).length > 0;
const evalMonth = (m, sales) => Plan.evaluateAll(plansOf(m), sales);
// último mes anterior con un plan mensual (sin fechas propias) que se pueda repetir
function previousPlan(m) {
  for (const k of monthKeys().filter(x => x < m).reverse()) { const p = plansOf(k).find(x => !x.period); if (p) return { month: k, plan: p }; }
  return null;
}
function currentGroups() {
  const seen = new Map();
  plansOf(month).forEach(p => p.groups.forEach(g => { if (!seen.has(g.id)) seen.set(g.id, g); }));
  return seen.size ? [...seen.values()] : Plan.LEGACY_GROUPS;
}
function groupOfName(name, gama) {
  const gs = currentGroups();
  let id = null;
  for (const p of plansOf(month)) { id = Plan.groupIdsOf(p, { name, gama })[0]; if (id) break; }
  id = id || gama;
  const g = gs.find(x => x.id === id);
  return g ? { name: g.name, i: gs.indexOf(g) } : { name: LABEL[gama] || gama || '', i: 0 };
}
function tagHtml(name, gama) {
  const g = groupOfName(name, gama);
  return g.name ? `<span class="tag" style="background:var(--g${g.i % 8})">${esc(g.name)}</span>` : '';
}
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES3 = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const monthShort = m => { const [y, n] = m.split('-'); return `${MES3[+n - 1]} ${y}`; };
const monthName = m => { const [y, n] = m.split('-'); return `${MESES[+n - 1]} ${y}`; };
const salesOf = m => state.sales.filter(s => s.date.startsWith(m));
const monthSales = () => salesOf(month).sort((a, b) => b.date.localeCompare(a.date));

function objectiveCard(o, ev, idx) {
  const p = o.payout, unit = o.metric === 'revenue' ? '' : ' uds.', f = v => fmtV(o.metric, v);
  const fill = o.target ? Math.min(100, o.pct / o.barMax * 100) : 0;
  const marks = o.target ? [p.start_pct, ...(o.barMax > 100 && p.start_pct < 100 ? [100] : [])] : [];
  const markHtml = marks.map(m => `<b style="left:${Math.min(100, m / o.barMax * 100)}%"><span>${m}%</span></b>`).join('');
  const toS = Math.ceil(o.toStart - 1e-9), to100 = Math.ceil(o.to100 - 1e-9);
  const cell = (label, left) => `<span>${label}: <strong class="${left ? '' : 'done'}">${o.target ? (left ? f(left) : '✓') : '–'}</strong></span>`;
  const miss = (p.start_pct < 100 ? cell(`Hasta ${p.start_pct}% (${f(Math.ceil(o.target * p.start_pct / 100 - 1e-9))})`, toS) : '') + cell('Hasta 100%', to100);
  let detail = '';
  if (p.reward > 0) {
    if (p.curve === 'flat') detail = `Al llegar al ${p.start_pct}%: ${eur(p.reward)}`;
    else if (p.curve === 'steps') detail = p.steps.map(s => `${s.from}%: ${eur(p.reward * s.pays / 100)}`).join(' · ');
    else detail = `${p.start_pct}%: ${eur(o.payAtStart)} · 100%: ${eur(p.reward)}` + (p.cap_pct > 100 ? ` · tope ${p.cap_pct}% (${f(Math.ceil(o.target * p.cap_pct / 100 - 1e-9))}${unit}): ${eur(p.reward * p.cap_pct / 100)}` : '');
  }
  const notes = [
    ...o.reqs.map(r => `<div class="note ${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '✗'} Requiere llegar al ${r.need}% de «${esc(r.name)}»</div>`),
    o.pool ? `<div class="note">Alternativa ${esc(o.pool.toUpperCase())}: ${o.poolLoser ? 'ahora cuenta el otro objetivo' : 'cuenta el que más paga'}</div>` : '',
    o.missing ? `<div class="note no">⚠ ${o.missing} venta${o.missing > 1 ? 's' : ''} sin importe: no cuenta${o.missing > 1 ? 'n' : ''}</div>` : ''
  ].join('');
  return `<div class="gama${o.poolLoser ? ' loser' : ''}" style="--c:var(--g${idx % 8})">
      <h3>${esc(o.name)} <span>${o.target ? Math.round(o.pct) + '%' : 'sin objetivo'}</span></h3>
      <div class="big">${f(o.value)} <small>/ ${f(o.target)}${unit}</small></div>
      <div class="bar"><i style="width:${fill}%"></i>${markHtml}</div>
      <div class="miss">${miss}</div>
      ${p.reward > 0 ? `<div class="inc">Incentivo ahora: <strong>${eur(o.payNow)}</strong><br>${detail}</div>` : `<div class="note">${o.target ? 'Meta de referencia: sirve para calcular otros premios.' : '⚠ Falta tu meta: pónla en «Ajustar».'}</div>`}
      ${notes}
    </div>`;
}

function render() {
  $('month').value = month;
  $('month-label').textContent = monthName(month);
  const plans = plansOf(month), sales = monthSales();
  const ev = plans.length ? evalMonth(month, sales) : null;
  const plan = plans.length > 0;
  const gs = currentGroups();

  // formulario de venta: importe solo si hay objetivos o comisiones en dinero
  $('amount-wrap').hidden = !(ev && ev.hasRevenue);
  const picked = $('sale-model').value;
  $('sale-model').innerHTML = '<option value="" selected disabled>Elige un modelo…</option>' + state.models.map(m => { const g = groupOfName(m.name, m.gama).name; return `<option value="${m.id}">${esc(m.name)}${g ? ` (${esc(g)})` : ''}</option>`; }).join('');
  if (state.models.some(m => m.id === picked)) $('sale-model').value = picked;
  updateSaleForm();
  $('no-models').hidden = state.models.length > 0;
  $('sale-form').hidden = state.models.length === 0;

  // objetivos
  $('goal-banner').hidden = !!plan;
  $('edit-goals').hidden = !plan;
  $('gamas').innerHTML = ev ? ev.entries.map((en, pi) => {
    const head = (plans.length > 1 || en.plan.name || en.plan.period)
      ? `<div class="planbar"><div><strong>${esc(en.plan.name || 'Plan ' + (pi + 1))}</strong>${en.plan.period ? ` <small>${esc(Plan.periodText(en.plan.period))}</small>` : ''}</div><span class="planbtns"><button type="button" class="pill" data-plan-edit="${pi}">Ajustar</button><button type="button" class="pill" data-plan-del="${pi}">Quitar</button></span></div>` : '';
    return head + en.ev.objectives.map((o, i) => objectiveCard(o, en.ev, i)).join('');
  }).join('') : '';
  $('plan-howto').hidden = !plan;
  $('plan-lines').innerHTML = plan ? plans.flatMap(p => Plan.describePlan(p)).map(l => `<li>${esc(l)}</li>`).join('') : '';

  // por unidad y comisiones
  const rows = ev ? ev.entries.flatMap(e => e.ev.unitRows) : [], coms = ev ? ev.entries.flatMap(e => e.ev.comRows) : [];
  $('unit-card').hidden = !(rows.length || coms.length);
  $('unit-table').tBodies[0].innerHTML =
    rows.map(r => `<tr><td>${esc(r.label)}${r.rule.condition ? ` <small class="fx${r.factor === 100 ? '' : r.factor ? ' mid' : ' zero'}">×${r.factor}%</small>` : ''}</td><td class="n">${r.n}</td><td class="n c-imp">${r.rule.mode === 'retro' ? r.rule.tiers.map(t => `${eur(t.amount)} desde ${t.from}`).join(' / ') : r.rule.amounts.map(eur).join(' / ')}</td><td class="n">${eur(r.next)}</td><td class="n"><strong>${eur(r.pay)}</strong></td></tr>`).join('') +
    coms.map(r => `<tr><td>${esc(r.name)} <small>(${String(r.percent).replace('.', ',')}%)</small></td><td class="n">${eur0(r.revenue)}</td><td class="n c-imp">${String(r.percent).replace('.', ',')}% del importe</td><td class="n">–</td><td class="n"><strong>${eur(r.pay)}</strong></td></tr>`).join('');
  $('unit-total').textContent = ev ? eur(ev.units + ev.commissions) : '';
  const lump = sales.filter(s => !s.modelId).reduce((a, s) => a + s.qty, 0);
  const noTarget = ev ? ev.entries.some(e => e.ev.unitRows.some(r => r.rule.condition && r.condPct === 0) && e.ev.objectives.some(o => !(o.target > 0))) : false;
  const warnTxt = [rows.length && lump ? `${lump} uds. del acumulado sin desglosar no cuentan para estos incentivos. Añádelas como ventas por modelo y borra el acumulado.` : '', noTarget ? 'Estos premios dependen de tu meta y aún no la has puesto: pulsa «Ajustar» en el plan.' : ''].filter(Boolean).join(' ');
  $('unit-warn').hidden = !warnTxt; $('unit-warn').textContent = warnTxt;

  // total de incentivo
  $('inc-total').hidden = !(ev && (ev.objectivesMax || rows.length || coms.length));
  if (ev) {
    const parts = [`objetivos ${eur(ev.objectivesTotal)} (máx. ${eur(ev.objectivesMax)})`];
    if (rows.length) parts.push(`por unidad ${eur(ev.units)}`);
    if (coms.length) parts.push(`comisiones ${eur(ev.commissions)}`);
    $('inc-total').innerHTML = `Incentivo conseguido ahora: <strong>${eur(ev.total)}</strong><br><span class="footnote">${parts.join(' + ')}</span>`;
  }

  // historial
  const ms = new Set([...monthKeys(), ...state.sales.map(s => s.date.slice(0, 7)), nowMonth()]);
  $('history').tBodies[0].innerHTML = [...ms].sort().reverse().map(m => {
    const e2 = hasGoals(m) ? evalMonth(m, salesOf(m)) : null;
    const chips = e2 ? e2.entries.flatMap(en => en.ev.objectives).filter(o => o.target > 0).slice(0, 6).map(o => `<span class="chip">${esc(o.name)} <b>${Math.round(o.pct)}%</b></span>`).join('') || '<span class="empty">Solo incentivos por unidad</span>' : '<span class="empty">Sin objetivos</span>';
    return `<tr data-month="${m}" class="${m === month ? 'cur' : ''}"><td class="nw">${monthShort(m)}</td><td>${chips}</td><td class="nw">${e2 ? eur(e2.total) : '–'}</td></tr>`;
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
    ? mrows.map(r => `<tr><td>${esc(r.name)}</td><td>${tagHtml(r.name, r.gama)}</td><td class="n">${r.qty}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">Sin datos</td></tr>';
  const top = mrows.filter(r => r.qty > 0 && !r.name.startsWith('Acumulado')).slice(0, 5);
  $('top').innerHTML = top.length ? top.map(r => `<li>${esc(r.name)} <span>${r.qty}</span></li>`).join('') : '<li class="empty">Aún no hay ventas este mes</li>';

  // listado de ventas
  $('total').textContent = sales.reduce((a, s) => a + s.qty, 0) + ' uds.';
  $('sales').tBodies[0].innerHTML = sales.length
    ? sales.map(s => `<tr><td class="nw">${s.date.slice(8)}/${s.date.slice(5, 7)}</td><td>${esc(s.name)}${s.qty < 0 ? ' <span class="ret">devolución</span>' : ''}${s.amount ? ` <small class="amt">${eur(s.amount)}</small>` : ''}</td><td>${tagHtml(s.name, s.gama)}</td><td class="n">${s.qty < 0 ? '−' + Math.abs(s.qty) : s.qty}</td><td class="n"><button class="del" aria-label="Borrar venta" data-sale="${s.id}" title="Borrar">✕</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Sin ventas este mes</td></tr>';

  // gestión de modelos y grupos
  const gOpts = sel => gs.map(g => `<option value="${esc(g.id)}"${g.id === sel ? ' selected' : ''}>${esc(g.name)}</option>`).join('') + `<option value=""${sel === '' ? ' selected' : ''}>Sin grupo</option>`;
  const prevGroup = $('model-gama').value;
  $('model-gama').innerHTML = gOpts(gs.some(g => g.id === prevGroup) || prevGroup === '' ? prevGroup : gs[0].id);
  $('models').innerHTML = state.models.length
    ? state.models.map(m => {
        const extra = (!m.gama || gs.some(g => g.id === m.gama)) ? '' : `<option value="${esc(m.gama)}" selected>${esc(LABEL[m.gama] || m.gama)}</option>`;
        return `<li><span>${esc(m.name)}</span><span><select class="ag-input footnote" data-gama="${m.id}">${extra}${gOpts(m.gama)}</select> <button class="del" aria-label="Quitar modelo" data-model="${m.id}" title="Quitar modelo">✕</button></span></li>`;
      }).join('')
    : '<li class="empty">No hay modelos todavía</li>';
  $('models-clear').hidden = !state.models.length;
  $('models-honor').hidden = state.models.length > 0;
}

function shiftMonth(d) {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  setDefaultDate(); render();
}
function setDefaultDate() {
  const today = new Date(); const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  $('sale-date').value = t.startsWith(month) ? t : month + '-01';
}

$('prev').onclick = () => shiftMonth(-1);
$('next').onclick = () => shiftMonth(1);
$('month').onchange = e => { if (e.target.value) { month = e.target.value; setDefaultDate(); render(); } };

// ---------- formulario de venta ----------
let kind = 'venta', toastTimer = null;
const getQty = () => Math.min(999, Math.max(0, parseInt($('sale-qty').value, 10) || 0));
const needsAmount = () => !$('amount-wrap').hidden;
const getAmount = () => { const v = parseFloat(String($('sale-amount').value).replace(',', '.')); return isFinite(v) && v > 0 ? v : 0; };
function updateSaleForm() {
  const ok = !!$('sale-model').value && getQty() > 0 && (!needsAmount() || getAmount() > 0);
  $('sale-submit').disabled = !ok;
  $('sale-submit').textContent = kind === 'venta' ? 'Añadir venta' : 'Registrar devolución';
  $('sale-submit').classList.toggle('ag-btn--primary', kind === 'venta');
  $('sale-submit').classList.toggle('ag-btn--danger', kind !== 'venta');
  $('qty-minus').disabled = getQty() <= 0;
}
function showToast(msg, undo) {
  $('toast-msg').textContent = msg; $('toast').hidden = false; $('toast-undo').hidden = !undo;
  $('toast-undo').onclick = () => { if (undo) undo(); $('toast').hidden = true; clearTimeout(toastTimer); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 8000);
}
document.querySelectorAll('.seg-btn').forEach(b => b.onclick = () => {
  kind = b.dataset.kind;
  document.querySelectorAll('.seg-btn').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  updateSaleForm();
});
$('qty-plus').onclick = () => { $('sale-qty').value = Math.min(999, getQty() + 1); updateSaleForm(); };
$('qty-minus').onclick = () => { $('sale-qty').value = Math.max(0, getQty() - 1); updateSaleForm(); };
$('sale-qty').oninput = updateSaleForm;
$('sale-amount').oninput = updateSaleForm;
$('sale-model').onchange = updateSaleForm;
$('sale-form').onsubmit = e => {
  e.preventDefault();
  const m = state.models.find(x => x.id === $('sale-model').value), qty = getQty(), date = $('sale-date').value;
  if (!m || qty <= 0 || !date) return;           // sin modelo o con 0 unidades no se añade nada
  if (needsAmount() && !(getAmount() > 0)) { alert('Pon el importe total de la venta (€): tus objetivos son en dinero.'); return; }
  if (kind === 'devolucion') {
    const mes = date.slice(0, 7), have = state.sales.filter(s => s.date.startsWith(mes) && s.name === m.name).reduce((a, s) => a + s.qty, 0);
    if (qty > have) { alert(`En ${monthName(mes)} solo hay ${Math.max(0, have)} uds. de ${m.name}. Pon la fecha en el mes de la venta.`); return; }
  }
  const sale = { id: uid(), date, modelId: m.id, name: m.name, gama: m.gama, qty: kind === 'venta' ? qty : -qty };
  if (needsAmount()) sale.amount = kind === 'venta' ? getAmount() : -getAmount();
  state.sales.push(sale); save();
  month = date.slice(0, 7);
  $('sale-qty').value = 0; $('sale-model').value = ''; $('sale-amount').value = '';
  render();
  showToast(`${kind === 'venta' ? 'Añadidas' : 'Devueltas'} ${qty} × ${m.name}`, () => { state.sales = state.sales.filter(s => s.id !== sale.id); save(); render(); });
};
$('model-form').onsubmit = e => {
  e.preventDefault();
  const name = $('model-name').value.trim(); if (!name) return;
  state.models.push({ id: uid(), name, gama: $('model-gama').value });
  save(); $('model-name').value = ''; render();
};
$('models-honor').onclick = () => {
  SEED.forEach(([name, gama]) => { if (!state.models.some(m => norm(m.name) === norm(name))) state.models.push({ id: uid(), name, gama }); });
  save(); render();
};
$('models-clear').onclick = () => {
  if (!confirm('¿Vaciar la lista de modelos? Las ventas ya registradas se mantienen. Luego puedes añadir los tuyos o importarlos con tus objetivos.')) return;
  state.models = []; save(); render();
};

// ---------- objetivos del mes: diálogo con 4 pasos ----------
let draft = null, aiAdd = false, reviewCtx = { editIndex: null };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const STEPS = ['start', 'ia', 'review', 'manual'];
function showStep(s) {
  STEPS.forEach(x => { $('pd-' + x).hidden = x !== s; });
  $('plan-dialog').scrollTop = 0;
}
function openPlanDialog(step) {
  const dlg = $('plan-dialog');
  $('pd-title').textContent = 'Objetivos de ' + monthName(month);
  const prev = previousPlan(month);
  const nPlans = plansOf(month).length;
  $('pd-go-edit').hidden = nPlans !== 1;
  $('pd-go-add').hidden = nPlans < 1;
  $('pd-go-repeat').hidden = !prev;
  if (prev) $('pd-repeat-desc').textContent = `Copia el plan de ${monthName(prev.month)} y ajustas las metas.`;
  $('pd-errors').hidden = true; $('pd-fallback').hidden = true; $('pd-copy').textContent = 'Copiar instrucciones';
  showStep(step || 'start');
  if (!dlg.open) dlg.showModal();
  $('pd-title').focus();
}
const closePlanDialog = () => { if ($('plan-dialog').open) $('plan-dialog').close(); };
$('pd-x').onclick = closePlanDialog;
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => showStep('start'));
$('pd-go-ia').onclick = () => { aiAdd = false; showStep('ia'); };
$('pd-go-add').onclick = () => { aiAdd = true; showStep('ia'); };
$('pd-go-manual').onclick = () => { fillManual(); showStep('manual'); };
$('pd-go-repeat').onclick = () => {
  const prev = previousPlan(month); if (!prev) return;
  startReview(clone(prev.plan), `Plan copiado de ${monthName(prev.month)}: ajusta las metas y recompensas de este mes.`, [], false, { editIndex: null, addDefault: false });
};
$('pd-go-edit').onclick = () => startReview(clone(plansOf(month)[0]), 'Ajusta las metas y recompensas de este mes.', [], false, { editIndex: 0 });

// paso IA
$('pd-copy').onclick = async () => {
  const text = Plan.buildPrompt({ models: promptModels(), monthLabel: monthName(month), today: todayStr() });
  try {
    await navigator.clipboard.writeText(text);
    $('pd-copy').textContent = '✓ Copiadas: pégalas en tu IA'; $('pd-fallback').hidden = true;
  } catch (e) {
    $('pd-fallback').value = text; $('pd-fallback').hidden = false; $('pd-fallback').focus(); $('pd-fallback').select();
    $('pd-copy').textContent = 'Selecciona todo y copia ↓';
  }
};
if (inApp) document.querySelectorAll('.ai-links a').forEach(a => a.removeAttribute('target'));
$('pd-review-btn').onclick = () => {
  const r = Plan.normalizePlan($('pd-paste').value);
  const list = $('pd-errors');
  if (r.errors.length) { list.innerHTML = r.errors.map(x => `<li>${esc(x)}</li>`).join(''); list.hidden = false; return; }
  list.hidden = true;
  startReview(r.plan, 'Revisa que todo coincide con tu comunicado. Si algo no cuadra, puedes ajustar la meta o la recompensa aquí, o volver y repetir con tu IA.', r.warnings, state.sales.length === 0, { editIndex: null, addDefault: aiAdd || !!r.plan.period });
};

// paso revisar
function renderGroups(plan) {
  const box = $('pd-groups');
  const inGroup = new Set(plan.groups.flatMap(g => g.models.map(norm)));
  const loose = [];
  const addLoose = sc => (sc.models || []).forEach(n => { if (!inGroup.has(norm(n)) && !loose.some(x => norm(x) === norm(n))) loose.push(n); });
  plan.objectives.forEach(o => addLoose(o.scope)); plan.unit_incentives.forEach(r => addLoose(r.scope)); plan.commissions.forEach(c => addLoose(c.scope));
  const withModels = plan.groups.filter(g => g.models.length);
  if (!withModels.length && !loose.length) { box.hidden = true; return; }
  const total = withModels.reduce((a, g) => a + g.models.length, 0) + loose.length;
  const chips = list => list.map(n => `<span class="mchip">${esc(n)}</span>`).join('');
  box.innerHTML = `<summary>Categorías y modelos detectados (${total} modelos)</summary>` +
    withModels.map(g => `<div class="gline"><strong>${esc(g.name)}</strong> <small>${g.models.length}</small><div>${chips(g.models)}</div></div>`).join('') +
    (loose.length ? `<div class="gline"><strong>Sin categoría</strong> <small>${loose.length}</small><div>${chips(loose)}</div></div>` : '') +
    '<p class="hint footnote">Si algún modelo está en la categoría equivocada, lo cambias después en «Modelos».</p>';
  box.hidden = false; box.open = total <= 25;
}
function startReview(plan, note, warnings, replaceDefault, ctx = {}) {
  draft = plan;
  renderGroups(plan);
  reviewCtx = { editIndex: ctx.editIndex ?? null };
  const canMode = plansOf(month).length > 0 && reviewCtx.editIndex === null;
  $('pd-mode').hidden = !canMode;
  if (canMode) document.querySelector(`input[name=pdmode][value=${(ctx.addDefault ?? !!plan.period) ? 'add' : 'replace'}]`).checked = true;
  $('pd-note').textContent = note;
  const warn = $('pd-warnings');
  warn.innerHTML = warnings.map(x => `<li>${esc(x)}</li>`).join(''); warn.hidden = !warnings.length;
  const notes = plan.notes || [];
  $('pd-notes-list').innerHTML = notes.map(x => `<li>${esc(x)}</li>`).join(''); $('pd-notes').hidden = !notes.length;
  const hasModels = plan.groups.some(g => g.models.length) || plan.unit_incentives.some(r => (r.scope.models || []).length);
  $('pd-models-wrap').hidden = !hasModels;
  $('pd-models').checked = hasModels && replaceDefault;
  $('pd-edit').innerHTML = plan.objectives.map((o, i) => `<div class="orow"><div class="oname"><strong>${esc(o.name)}</strong><small>${o.metric === 'revenue' ? 'Meta en dinero' : 'Meta en unidades'}${o.payout.reward > 0 ? '' : ' · de referencia'}</small></div>
      <label>Meta${o.metric === 'revenue' ? ' (€)' : ''}<input class="ag-input body" type="number" min="0" step="any" inputmode="decimal" data-oi="${i}" data-f="target" value="${o.target || ''}" placeholder="Tu meta"></label>
      ${o.payout.reward > 0 ? `<label>Recompensa (€)<input class="ag-input body" type="number" min="0" step="any" inputmode="decimal" data-oi="${i}" data-f="reward" value="${o.payout.reward}"></label>` : ''}</div>`).join('');
  $('pd-lines-box').open = Plan.describePlan(plan).length <= 8;
  paintLines();
  showStep('review');
  const dlg = $('plan-dialog'); if (!dlg.open) { $('pd-title').textContent = 'Objetivos de ' + monthName(month); dlg.showModal(); }
}
function readEdits() {
  $('pd-edit').querySelectorAll('input[data-oi]').forEach(inp => {
    const o = draft.objectives[+inp.dataset.oi], v = parseFloat(String(inp.value).replace(',', '.'));
    if (!isFinite(v) || v < 0) return;
    if (inp.dataset.f === 'target') o.target = v; else o.payout.reward = v;
  });
}
function paintLines() { $('pd-lines').innerHTML = Plan.describePlan(draft).map(l => `<li>${esc(l)}</li>`).join(''); }
$('pd-edit').addEventListener('input', () => { readEdits(); paintLines(); });
$('pd-apply').onclick = () => {
  readEdits();
  const bad = draft.objectives.find(o => !(o.target > 0));
  if (bad) { alert(`La meta de «${bad.name}» tiene que ser mayor que 0.`); return; }
  const mode = reviewCtx.editIndex !== null ? 'edit' : ($('pd-mode').hidden ? 'replace' : document.querySelector('input[name=pdmode]:checked').value);
  commitPlan(draft, $('pd-models').checked, mode, reviewCtx.editIndex);
};
function commitPlan(plan, replaceModels, mode, editIndex) {
  const base = plansOf(month).map(clone);   // incluye el plan sencillo convertido si el mes aún no tenía lista
  let list;
  if (mode === 'edit') { list = base; list[editIndex] = clone(plan); }
  else if (mode === 'add') list = [...base, clone(plan)];
  else list = [clone(plan)];
  state.plans[month] = list;
  // modelos del plan: los de los grupos y los que citan objetivos, incentivos y comisiones (para poder registrar sus ventas)
  const names = new Map();
  plan.groups.forEach(g => g.models.forEach(n => names.set(norm(n), { name: n, gama: g.id })));
  const addScope = sc => (sc.models || []).forEach(n => { if (!names.has(norm(n))) names.set(norm(n), { name: n, gama: '' }); });
  plan.objectives.forEach(o => addScope(o.scope)); plan.unit_incentives.forEach(r => addScope(r.scope)); plan.commissions.forEach(c => addScope(c.scope));
  names.forEach(({ name, gama }, k) => {
    const m = state.models.find(x => norm(x.name) === k);
    if (m) { if (gama) { m.gama = gama; state.sales.forEach(s => { if (s.modelId === m.id) s.gama = gama; }); } }
    else state.models.push({ id: uid(), name, gama });
  });
  if (replaceModels) {
    const used = new Set(state.sales.map(s => norm(s.name)));
    state.models = state.models.filter(m => names.has(norm(m.name)) || used.has(norm(m.name)));
  }
  save(); closePlanDialog(); render();
  showToast(mode === 'add' ? 'Plan añadido al mes' : 'Objetivos guardados', null);
}

// paso manual (sencillo, tres gamas)
function ruleRow(model = '', amounts = '') {
  const names = [...new Set([...state.models.map(m => m.name), ...(model ? [model] : [])])];
  const d = document.createElement('div'); d.className = 'rule';
  d.innerHTML = `<select class="ag-input body" aria-label="Modelo">${names.map(n => `<option${n === model ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <input class="ag-input body" aria-label="Importes por unidad" placeholder="Ej. 50, 70, 100" value="${esc(amounts)}">
    <button type="button" class="del" aria-label="Quitar" data-rule-del>✕</button>`;
  $('unit-rules').appendChild(d);
}
function lastConfig(m) {
  const prev = Object.keys(state.goals).filter(k => k < m && state.goals[k].inc).sort().pop();
  return prev ? { ...state.goals[prev], from: prev } : (honorUser() ? { ...BRAND_TEMPLATE, from: null } : { inc: {}, max: {}, unit: [], from: null });
}
const incOf = (g, x) => +((g.inc || {})[x]) || 0;
function fillManual() {
  const mine = state.goals[month], cfg = mine || lastConfig(month);   // mes nuevo: precarga incentivos, topes y unitarios del anterior
  GAMAS.forEach(x => { $('goal-' + x).value = mine ? mine[x] : ''; $('inc-' + x).value = incOf(cfg, x) || ''; $('max-' + x).value = (cfg.max && cfg.max[x]) || ''; });
  $('unit-rules').innerHTML = '';
  (cfg.unit || []).forEach(r => ruleRow(r.model, r.amounts.join(', ')));
  const imported = !!((state.plans && state.plans[month]) || []).length;
  $('goal-prefill').hidden = (!!mine && !imported) || (!imported && !cfg.from && !honorUser());
  $('goal-prefill').textContent = imported ? 'Este mes tienes un plan importado: si guardas aquí, lo sustituye por este plan sencillo de tres gamas.'
    : cfg.from ? `Precargado con la configuración de ${monthName(cfg.from)}: ajusta lo que cambie y pon tus unidades.` : 'Precargado con la campaña de la marca (noviembre 2026): ajusta lo que cambie y pon tus unidades.';
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
  state.goals[month] = g; delete state.plans[month];
  save(); render();
};
$('add-rule').onclick = () => ruleRow();
$('history').onclick = e => { const tr = e.target.closest('tr[data-month]'); if (tr) { month = tr.dataset.month; setDefaultDate(); render(); } };
function assignModelGroup(m, groupId) {
  const n = norm(m.name);
  plansOf(month).forEach(p => p.groups.forEach(g => {
    g.models = (g.models || []).filter(x => norm(x) !== n);
    if (groupId && g.id === groupId && Array.isArray(state.plans[month])) g.models.push(m.name);
  }));
  m.gama = groupId;
  state.sales.forEach(s => { if (s.modelId === m.id) s.gama = groupId; });
}
$('models').onchange = e => {
  const id = e.target.dataset.gama; if (!id) return;
  assignModelGroup(state.models.find(x => x.id === id), e.target.value);
  save(); render();
};
// Al abrir (o al cambiar de mes con la página abierta) pide el objetivo del mes en curso si falta.
let askedFor = '', ready = false;
function checkNewMonth() {
  if (!ready) return;
  const cur = nowMonth();
  if (cur !== askedFor && !hasGoals(cur)) {
    askedFor = cur; month = cur; setDefaultDate(); render();
    if (!$('plan-dialog').open) openPlanDialog('start');
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewMonth(); });
setInterval(checkNewMonth, 60000);
document.addEventListener('click', e => {
  if (e.target.matches('[data-open-goals]')) return openPlanDialog('start');
  if (e.target.matches('[data-rule-del]')) return e.target.closest('.rule').remove();
  const pe = e.target.dataset && e.target.dataset.planEdit, pd = e.target.dataset && e.target.dataset.planDel;
  if (pe !== undefined) { const p = plansOf(month)[+pe]; if (p) startReview(clone(p), `Ajusta las metas y recompensas de «${p.name || 'este plan'}».`, [], false, { editIndex: +pe }); return; }
  if (pd !== undefined) {
    const list = plansOf(month).map(clone), p = list[+pd];
    if (p && confirm(`¿Quitar «${p.name || 'este plan'}» de ${monthName(month)}? Las ventas ya registradas se mantienen.`)) { list.splice(+pd, 1); state.plans[month] = list; save(); render(); }
    return;
  }
  const sid = e.target.dataset && e.target.dataset.sale, mid = e.target.dataset && e.target.dataset.model;
  if (sid) {
    const s = state.sales.find(x => x.id === sid);
    if (s && confirm(`¿Borrar ${s.qty < 0 ? 'la devolución de ' + Math.abs(s.qty) : s.qty} × ${s.name} del ${s.date.slice(8)}/${s.date.slice(5, 7)}? Se recalcularán los objetivos e incentivos.`)) { state.sales = state.sales.filter(x => x.id !== sid); save(); render(); }
  }
  if (mid) {
    const m = state.models.find(x => x.id === mid);
    if (confirm(`¿Quitar “${m.name}” de la lista? Sus ventas ya registradas se mantienen.`)) { state.models = state.models.filter(x => x.id !== mid); save(); render(); }
  }
});

$('export').onclick = async () => {
  if (inApp) {   // el visor de la app no descarga archivos: se copia al portapapeles
    try { await navigator.clipboard.writeText(JSON.stringify(state, null, 2)); showToast('Copia en el portapapeles: pégala en una nota o mensaje', null); }
    catch (e) { alert('No se pudo copiar. Tus datos están a salvo en tu cuenta.'); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  a.download = `ventas-${new Date().toISOString().slice(0, 10)}.json`; a.click();
};
$('import').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.models) || !Array.isArray(d.sales)) throw 0;
    if (confirm('Esto reemplazará los datos actuales. ¿Continuar?')) { state = migrate({ models: d.models, sales: d.sales, goals: d.goals || {}, plans: d.plans || {}, seedVersion: d.seedVersion }); save(); render(); }
  } catch (_) { alert('Archivo no válido.'); }
  e.target.value = '';
};

setDefaultDate(); render();

// ---------- Cuenta y sincronización (Supabase) ----------
const CFG = window.SUPABASE_CONFIG;
let sb = null, session = null, rev = 0, pushTimer = null, pushing = false, dirty = false;
function setStatus(text, s = '') { $('sync').textContent = text; $('sync-dot').dataset.s = s; $('sync-dot').title = text; }
const traducir = m => /invalid login/i.test(m) ? 'Correo o contraseña incorrectos. Si ya creaste la cuenta, usa los mismos datos de siempre (pulsa “Ver” para comprobar la contraseña).'
  : /not confirmed/i.test(m) ? 'Falta confirmar el correo: abre el enlace que te hemos enviado.'
  : /already registered|registro cerrado|database error/i.test(m) ? 'Ya existe una cuenta con ese correo. Pulsa “Entrar” con tu correo y contraseña de siempre.'
  : /password/i.test(m) ? 'La contraseña debe tener al menos 8 caracteres.'
  : /rate limit|too many/i.test(m) ? 'Demasiados intentos: espera unos minutos y prueba otra vez.'
  : 'No se pudo completar. Comprueba la conexión y vuelve a intentarlo.';

function askLogin() {
  return new Promise(resolve => {
    const dlg = $('auth-dialog'), msg = $('auth-msg');
    dlg.addEventListener('cancel', e => e.preventDefault());
    $('auth-eye').onclick = () => { const p = $('auth-pass'), show = p.type === 'password'; p.type = show ? 'text' : 'password'; $('auth-eye').textContent = show ? 'Ocultar' : 'Ver'; $('auth-eye').setAttribute('aria-pressed', String(show)); };
    $('auth-form').onsubmit = async e => {
      e.preventDefault();
      const kind = (e.submitter && e.submitter.value) || 'login', email = $('auth-email').value.trim(), password = $('auth-pass').value;
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
$('pw-eye').onclick = () => { const p = $('pw-new'), show = p.type === 'password'; p.type = show ? 'text' : 'password'; $('pw-eye').textContent = show ? 'Ocultar' : 'Ver'; };
$('pw-form').onsubmit = async e => {
  e.preventDefault();
  const msg = $('pw-msg'), password = $('pw-new').value, btn = e.submitter;
  const say = (t, ok) => { msg.textContent = t; msg.hidden = false; msg.style.color = ok ? 'var(--success)' : 'var(--danger)'; };
  if (!sb || !session) return say('Primero inicia sesión.', false);
  if (password.length < 8) return say('La contraseña debe tener al menos 8 caracteres.', false);
  if (btn) btn.disabled = true;
  const { error } = await sb.auth.updateUser({ password });
  if (btn) btn.disabled = false;
  if (error) return say(/different|same/i.test(error.message) ? 'Elige una contraseña distinta a la actual.' : /weak|short|at least/i.test(error.message) ? 'Esa contraseña es demasiado débil: usa una más larga.' : 'No se pudo cambiar. Cierra sesión, vuelve a entrar e inténtalo otra vez.', false);
  $('pw-new').value = ''; say('Contraseña cambiada. Úsala la próxima vez que entres.', true);
};
$('logout').onclick = async () => {
  if (!sb || !confirm('¿Cerrar sesión en este dispositivo?')) return;
  await sb.auth.signOut(); try { localStorage.removeItem(KEY); } catch (e) {} location.reload();
};
initCloud();

// ---------- App instalable (PWA) ----------
let deferredInstall = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function updateInstallUI() {
  $('install-box').hidden = inApp || standalone();
  $('apk-link').hidden = $('apk-help').hidden = !isAndroid;
  $('install-btn').hidden = !deferredInstall || isAndroid;
  $('install-ios').hidden = !(isIOS && !deferredInstall);
  $('install-other').hidden = !!deferredInstall || isIOS || isAndroid;
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; updateInstallUI(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; updateInstallUI(); });
$('install-btn').onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; updateInstallUI(); };
$('share').onclick = async () => {
  const url = location.origin + '/';
  try { if (navigator.share) { await navigator.share({ title: 'Ventas del mes', text: 'Panel de ventas, objetivos e incentivos del mes', url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); showToast('Enlace copiado', null); } catch (e) { prompt('Copia este enlace:', url); }
};
updateInstallUI();
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
