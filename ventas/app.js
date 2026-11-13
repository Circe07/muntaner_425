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
// Nombre comercial (para el reporte de WhatsApp) de los modelos de la marca de ejemplo.
const SEED_ALIAS = { 'M8 Pro': 'Magic8 Pro', 'H600 Pro': '600 Pro', 'H600': '600', 'PAD 4': 'Magic Pad 4', 'H400': '400', 'M8 Lite': 'Magic8 Lite', 'H600 Lite': '600 Lite', 'PAD X9 max': 'Pad X9 Max', 'PAD 10': 'Pad 10', 'H600 Smart': '600 Smart', 'PAD X8b': 'Pad X8b', 'PAD X9a': 'Pad X9a', 'H400 Smart': '400 Smart', 'PAD X8a': 'Pad X8a' }; // sin la marca: la pone el ajuste «marca delante»
const freshState = () => ({ models: [], sales: [], goals: {}, plans: {}, settings: {}, periods: {}, seedVersion: 10 });
const seedNames = new Set(SEED.map(([n]) => n.trim().toLowerCase()));
const isSeedName = n => seedNames.has(String(n).trim().toLowerCase());
const nowMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
let state = load();
let month = currentKey();

// Cada "mes" va por defecto del día 1 al último día. Si una empresa cierra otro día (meses de 4 y 5 semanas…),
// se le da un periodo propio: state.periods['2026-10'] = { from, to }. Cada venta pertenece a UN solo periodo.
function localToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function naturalRange(m) { const [y, n] = m.split('-').map(Number); return { from: `${m}-01`, to: `${m}-${String(new Date(y, n, 0).getDate()).padStart(2, '0')}` }; }
// días que se solapan dos rangos AAAA-MM-DD
function overlapDays(a, b) {
  const lo = a.from > b.from ? a.from : b.from, hi = a.to < b.to ? a.to : b.to;
  if (lo > hi) return 0;
  return Math.round((new Date(hi + 'T12:00:00') - new Date(lo + 'T12:00:00')) / 864e5) + 1;
}
// un periodo propio solo vale si cae sobre su mes (al menos 7 días en común); si no, es un error (p. ej. fechas de agosto en noviembre)
function periodSane(m, r) { return !!(r && r.from && r.to && r.from <= r.to && overlapDays(naturalRange(m), r) >= 7); }
function isCustomPeriod(m) { const c = state.periods && state.periods[m]; return !!(c && c.from && c.to); }
function monthRange(m) { return isCustomPeriod(m) ? state.periods[m] : naturalRange(m); }
function shiftKey(k, d) { const [y, n] = k.split('-').map(Number); const dt = new Date(y, n - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; }
function periodKeyFor(date) {
  const hit = Object.keys(state.periods || {}).filter(k => { const r = state.periods[k]; return r && r.from && r.to && date >= r.from && date <= r.to; }).sort();
  if (hit.length) return hit[hit.length - 1];
  let k = date.slice(0, 7);
  for (let i = 0; i < 3; i++) {   // un mes con periodo propio que no contiene la fecha cede esa fecha al mes vecino
    const c = state.periods && state.periods[k];
    if (!(c && c.from && c.to) || (date >= c.from && date <= c.to)) return k;
    k = shiftKey(k, date < c.from ? -1 : 1);
  }
  return Math.abs((+k.slice(0, 4)) * 12 + (+k.slice(5, 7)) - (+date.slice(0, 4)) * 12 - (+date.slice(5, 7))) > 1 ? date.slice(0, 7) : k;   // nunca más lejos que el mes vecino
}
function currentKey() { return periodKeyFor(localToday()); }
const fmtD = d => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5) + 1;

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
  if (!s.settings) s.settings = {};
  if (!s.periods) s.periods = {};
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
  if (v < 9) s.models.forEach(m => { const a = SEED_ALIAS[m.name]; if (a && !m.alias) m.alias = a; });
  if (v === 9) s.models.forEach(m => { if (m.alias && /^Honor /.test(m.alias)) { const a = m.alias.slice(6).trim(); if (a && a !== m.name) m.alias = a; else delete m.alias; } });
  if (v < 10 && !s.settings.reportPrefix) s.settings.reportPrefix = true;
  Object.keys(s.periods).forEach(k => { if (!periodSane(k, s.periods[k])) delete s.periods[k]; });   // repara periodos que no caen sobre su mes
  s.seedVersion = 10;
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
// tipo de producto de la venta (para los grupos que no traen lista de modelos): el elegido a mano en el modelo o el que sale del nombre
const saleKind = s => { const m = state.models.find(x => norm(x.name) === norm(s.name)); return Report.deviceType(s.name, '', m && m.tipo); };
const withKind = s => ({ ...s, tipo: saleKind(s) });
const evalMonth = (m, sales) => Plan.evaluateAll(plansOf(m), sales.map(withKind), state.sales.map(withKind));
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
  for (const p of plansOf(month)) { id = Plan.groupIdsOf(p, { name, gama, tipo: saleKind({ name }) })[0]; if (id) break; }
  id = id || gama;
  const g = gs.find(x => x.id === id);
  return g ? { name: g.name, i: gs.indexOf(g) } : { name: LABEL[gama] || gama || '', i: 0 };
}
// clase (grupo) de un modelo: la de los objetivos del mes o, si no, la que tenga asignada; '' = sin clase
function classIdOf(m) {
  let id = null;
  for (const p of plansOf(month)) { id = Plan.groupIdsOf(p, { name: m.name, gama: m.gama, tipo: saleKind({ name: m.name }) })[0]; if (id) break; }
  id = id || m.gama;
  return currentGroups().some(x => x.id === id) ? id : '';
}
// nombre corto de la clase: sin la aclaración entre paréntesis («HHP (móviles)» → «HHP»)
const shortName = n => String(n || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || String(n || '');
// botones (chips) de clase, con cuántos modelos tiene cada una; devuelve el html y qué valores son válidos
function classChips(selected) {
  const gs = currentGroups(), cnt = new Map();
  state.models.forEach(m => { const k = classIdOf(m); cnt.set(k, (cnt.get(k) || 0) + 1); });
  const items = [['', 'Todas', state.models.length], ...gs.filter(g => cnt.get(g.id)).map(g => [g.id, shortName(g.name), cnt.get(g.id)])];
  if (cnt.get('')) items.push(['__none', 'Sin clase', cnt.get('')]);
  const value = items.some(x => x[0] === selected) ? selected : '';
  return { value, html: items.map(([v, label, n]) => `<button type="button" class="cls-chip" data-cls="${esc(v)}" aria-pressed="${v === value}">${esc(label)}:<span class="cls-n">${n}</span></button>`).join('') };
}
const inClass = (m, cls) => !cls || (cls === '__none' ? classIdOf(m) === '' : classIdOf(m) === cls);
// rellena una fila de la venta: botones de clase y modelos de esa clase (con la clase elegida, el modelo va sin etiqueta)
function fillRow(row) {
  const cs = row.querySelector('.sl-class'), sel = row.querySelector('.sl-model'), picked = sel.value;
  const ch = classChips(row.dataset.cls || ''); row.dataset.cls = ch.value; cs.innerHTML = ch.html;
  row.querySelector('.sl-class-wrap').hidden = currentGroups().length < 2 || state.models.length < 2;
  const list = state.models.filter(m => inClass(m, ch.value));
  sel.innerHTML = '<option value="" selected disabled>' + (list.length ? 'Elige un modelo…' : 'No hay modelos en esta clase') + '</option>' + list.map(m => { const g = ch.value ? '' : shortName(groupOfName(m.name, m.gama).name); return `<option value="${m.id}">${esc(m.name)}${g ? ` · ${esc(g)}` : ''}</option>`; }).join('');
  if (list.some(m => m.id === picked)) sel.value = picked;
}
function tagHtml(name, gama) {
  const g = groupOfName(name, gama);
  return g.name ? `<span class="tag" style="background:var(--g${g.i % 8})">${esc(shortName(g.name))}</span>` : '';
}
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES3 = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const monthShort = m => { const [y, n] = m.split('-'); return `${MES3[+n - 1]} ${y}`; };
const monthName = m => { const [y, n] = m.split('-'); return `${MESES[+n - 1]} ${y}`; };
const salesOf = m => state.sales.filter(s => periodKeyFor(s.date) === m);
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
      ${p.reward > 0 ? `<div class="inc">Incentivo ahora: <strong>${eur(o.payNow)}</strong><br>${detail}</div>` : `<div class="note">${o.target ? 'Meta de seguimiento (sin pago asociado).' : '⚠ Falta tu meta: pónla en «Ajustar».'}</div>`}
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
  saleRevenue = !!(ev && ev.hasRevenue);
  document.querySelectorAll('.sale-line').forEach(row => { row.querySelector('.sl-amount-wrap').hidden = !saleRevenue; fillRow(row); });
  updateSaleForm();
  $('no-models').hidden = state.models.length > 0;
  $('sale-form').hidden = state.models.length === 0;

  // objetivos
  const pn = $('period-note');
  pn.hidden = !isCustomPeriod(month);
  if (!pn.hidden) pn.firstElementChild.textContent = `Periodo de ${monthName(month)}: del ${fmtD(monthRange(month).from)} al ${fmtD(monthRange(month).to)}`;
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
  const ms = new Set([...monthKeys(), ...state.sales.map(s => periodKeyFor(s.date)), currentKey()]);
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
  const mf = $('models-filter'), mch = classChips(mf.dataset.cls || '');
  mf.dataset.cls = mch.value; mf.innerHTML = mch.html;
  $('models-filter-wrap').hidden = gs.length < 2 || state.models.length < 6;
  const shown = state.models.filter(m => inClass(m, $('models-filter-wrap').hidden ? '' : mch.value));
  $('models').innerHTML = shown.length
    ? shown.map(m => {
        const extra = (!m.gama || gs.some(g => g.id === m.gama)) ? '' : `<option value="${esc(m.gama)}" selected>${esc(LABEL[m.gama] || m.gama)}</option>`;
        const guess = Report.typeOf(Report.deviceType(m.name, groupOfName(m.name, m.gama).name)).label;
        const tipoSel = `<select class="ag-input footnote" data-tipo="${m.id}" aria-label="Tipo de producto"><option value="">Tipo: ${esc(guess)}</option>${Report.TYPES.map(t => `<option value="${t.key}"${m.tipo === t.key ? ' selected' : ''}>${t.label}</option>`).join('')}</select>`;
        return `<li><span>${esc(m.name)}${m.alias ? ` <small class="amt">→ ${esc(m.alias)}</small>` : ''}</span><span><button class="del" aria-label="Nombre en el reporte" data-alias="${m.id}" title="Nombre en el reporte de WhatsApp">✎</button><select class="ag-input footnote" data-gama="${m.id}" aria-label="Grupo">${extra}${gOpts(m.gama)}</select>${tipoSel}<button class="del" aria-label="Quitar modelo" data-model="${m.id}" title="Quitar modelo">✕</button></span></li>`;
      }).join('')
    : `<li class="empty">${state.models.length ? 'No hay modelos en esta clase' : 'No hay modelos todavía'}</li>`;
  $('models-clear').hidden = !state.models.length;
  if (!state.models.length && !$('models-ai').dataset.touched) $('models-ai').open = true;
}

function shiftMonth(d) {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  setDefaultDate(); render();
}
function setDefaultDate() {
  const t = localToday(), r = monthRange(month);
  $('sale-date').value = (t >= r.from && t <= r.to) ? t : r.from;
}

$('prev').onclick = () => shiftMonth(-1);
$('next').onclick = () => shiftMonth(1);
$('month').onchange = e => { if (e.target.value) { month = e.target.value; setDefaultDate(); render(); } };

// ---------- formulario de venta ----------
let kind = 'venta', toastTimer = null;
let saleRevenue = false;
const needsAmount = () => saleRevenue;
const clampQty = v => Math.min(999, Math.max(0, parseInt(v, 10) || 0));
const lineRows = () => [...document.querySelectorAll('.sale-line')];
// una fila de la venta: modelo, unidades e importe por unidad
function readLine(row) {
  const v = parseFloat(String(row.querySelector('.sl-amount').value).replace(',', '.'));
  return { row, modelId: row.querySelector('.sl-model').value, qty: clampQty(row.querySelector('.sl-qty').value), amount: isFinite(v) && v > 0 ? v : 0, rawAmount: String(row.querySelector('.sl-amount').value).trim() };
}
const lineEmpty = l => !l.modelId && l.qty === 0 && !l.rawAmount;
const lineOk = l => !!l.modelId && l.qty > 0 && (!needsAmount() || l.amount > 0);
function updateSaleForm() {
  const lines = lineRows().map(readLine), used = lines.filter(l => !lineEmpty(l));
  const ok = used.length > 0 && used.every(lineOk);
  $('sale-submit').disabled = !ok;
  const n = used.length;
  $('sale-submit').textContent = kind === 'venta' ? (n > 1 ? `Añadir venta (${n} modelos)` : 'Añadir venta') : (n > 1 ? `Registrar devolución (${n} modelos)` : 'Registrar devolución');
  $('sale-submit').classList.toggle('ag-btn--primary', kind === 'venta');
  $('sale-submit').classList.toggle('ag-btn--danger', kind !== 'venta');
  lines.forEach(l => {
    l.row.querySelector('.sl-minus').disabled = l.qty <= 0;
    const tot = l.amount * l.qty, el = l.row.querySelector('.sl-total');   // el importe que se pide es el de UNA unidad; el total de la línea se calcula solo
    el.hidden = !(needsAmount() && tot > 0);
    if (!el.hidden) el.textContent = `Total: ${l.qty} × ${eur(l.amount)} = ${eur(tot)}`;
  });
  const all = used.reduce((s, l) => s + l.amount * l.qty, 0);
  $('sale-grand').hidden = !(n > 1 && needsAmount() && all > 0);
  if (!$('sale-grand').hidden) $('sale-grand').textContent = `Total de la venta (${n} modelos): ${eur(all)}`;
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
const saleLines = $('sale-lines');
saleLines.addEventListener('click', e => {
  const row = e.target.closest('.sale-line'); if (!row) return;
  const q = row.querySelector('.sl-qty');
  if (e.target.closest('.sl-plus')) { q.value = clampQty(q.value) + 1 > 999 ? 999 : clampQty(q.value) + 1; updateSaleForm(); }
  else if (e.target.closest('.sl-minus')) { q.value = Math.max(0, clampQty(q.value) - 1); updateSaleForm(); }
  else if (e.target.closest('.sl-remove')) { row.remove(); updateSaleForm(); }
});
saleLines.addEventListener('input', updateSaleForm);
saleLines.addEventListener('change', updateSaleForm);
saleLines.addEventListener('click', e => { const chip = e.target.closest('.cls-chip'), row = e.target.closest('.sale-line'); if (!chip || !row) return; row.dataset.cls = chip.dataset.cls; fillRow(row); updateSaleForm(); });
$('models-filter').addEventListener('click', e => { const chip = e.target.closest('.cls-chip'); if (!chip) return; $('models-filter').dataset.cls = chip.dataset.cls; render(); });
function addLine() {
  const first = lineRows()[0], row = first.cloneNode(true);
  row.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  row.dataset.cls = ''; fillRow(row); row.querySelector('.sl-model').value = ''; row.querySelector('.sl-qty').value = 0; row.querySelector('.sl-amount').value = ''; row.querySelector('.sl-total').hidden = true;
  const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ag-btn ag-btn--glass body sl-remove'; rm.textContent = '✕ Quitar este modelo'; row.appendChild(rm);
  saleLines.appendChild(row); row.querySelector('.sl-model').focus(); updateSaleForm();
}
$('add-line').onclick = addLine;
function resetSaleLines() {
  lineRows().slice(1).forEach(r => r.remove());
  const f = lineRows()[0]; f.querySelector('.sl-model').value = ''; f.querySelector('.sl-qty').value = 0; f.querySelector('.sl-amount').value = '';
}
$('sale-form').onsubmit = e => {
  e.preventDefault();
  const date = $('sale-date').value, lines = lineRows().map(readLine).filter(l => !lineEmpty(l));
  if (!lines.length || !date) return;
  if (lines.some(l => !l.modelId || l.qty <= 0)) return;           // sin modelo o con 0 unidades no se añade nada
  if (needsAmount() && lines.some(l => !(l.amount > 0))) { alert('Pon el importe del modelo (€ por unidad) en cada línea: tus objetivos son en dinero.'); return; }
  const key = periodKeyFor(date);
  if (kind === 'devolucion') {
    const want = new Map();
    for (const l of lines) { const m = state.models.find(x => x.id === l.modelId); want.set(m.name, (want.get(m.name) || 0) + l.qty); }
    for (const [name, qty] of want) {
      const have = state.sales.filter(s => periodKeyFor(s.date) === key && s.name === name).reduce((a, s) => a + s.qty, 0);
      if (qty > have) { alert(`En ${monthName(key)} solo hay ${Math.max(0, have)} uds. de ${name}. Pon la fecha en el periodo de la venta.`); return; }
    }
  }
  const made = lines.map(l => {
    const m = state.models.find(x => x.id === l.modelId);
    const sale = { id: uid(), date, modelId: m.id, name: m.name, gama: m.gama, qty: kind === 'venta' ? l.qty : -l.qty };
    if (needsAmount()) sale.amount = Math.round(l.amount * l.qty * 100) / 100 * (kind === 'venta' ? 1 : -1);
    return sale;
  });
  state.sales.push(...made); save();
  month = periodKeyFor(date);
  resetSaleLines();
  render(); updateSaleForm();
  const uds = lines.reduce((a, l) => a + l.qty, 0), ids = new Set(made.map(s => s.id));
  showToast(`${kind === 'venta' ? 'Añadidas' : 'Devueltas'} ` + (made.length === 1 ? `${uds} × ${made[0].name}` : `${uds} uds. de ${made.length} modelos`), () => { state.sales = state.sales.filter(s => !ids.has(s.id)); save(); render(); });
};
$('model-form').onsubmit = e => {
  e.preventDefault();
  const name = $('model-name').value.trim(); if (!name) return;
  state.models.push({ id: uid(), name, gama: $('model-gama').value });
  save(); $('model-name').value = ''; render();
};
// importar modelos con la IA de la persona: instrucciones -> JSON -> modelos
$('models-ai').addEventListener('toggle', () => { $('models-ai').dataset.touched = '1'; });
$('mi-copy').onclick = async () => {
  const text = Plan.buildModelsPrompt({ groups: [...new Set(plansOf(month).flatMap(p => p.groups.map(g => g.name)))], today: todayStr() });
  try { await navigator.clipboard.writeText(text); $('mi-copy').textContent = '✓ Copiadas: pégalas en tu IA'; $('mi-fallback').hidden = true; }
  catch (e) { $('mi-fallback').value = text; $('mi-fallback').hidden = false; $('mi-fallback').focus(); $('mi-fallback').select(); $('mi-copy').textContent = 'Selecciona todo y copia ↓'; }
};
$('mi-add').onclick = () => {
  const r = Plan.normalizeModels($('mi-paste').value), list = $('mi-errors'), msg = $('mi-msg');
  msg.hidden = true;
  list.className = 'pd-errors';
  if (r.errors.length) { list.innerHTML = r.errors.map(x => `<li>${esc(x)}</li>`).join(''); list.hidden = false; return; }
  list.className = 'pd-warnings';
  const groups = plansOf(month).flatMap(p => p.groups), warn = [...r.warnings];
  let added = 0, updated = 0;
  r.models.forEach(x => {
    let m = state.models.find(k => norm(k.name) === norm(x.name));
    if (!m) { m = { id: uid(), name: x.name, gama: '' }; state.models.push(m); added++; }
    else if ((x.tipo && !m.tipo) || (x.alias && !m.alias)) updated++;
    if (x.tipo && !m.tipo) m.tipo = x.tipo;
    if (x.alias && !m.alias) m.alias = x.alias;
    if (x.group) {
      const g = groups.find(k => Plan.slug(k.id) === Plan.slug(x.group) || Plan.slug(k.name) === Plan.slug(x.group));
      if (g) assignModelGroup(m, g.id); else warn.push(`«${x.name}»: la categoría «${x.group}» no está en tus objetivos de este mes; la ignoro.`);
    }
  });
  list.innerHTML = warn.map(w => `<li>${esc(w)}</li>`).join(''); list.hidden = !warn.length;
  save(); render();
  $('mi-paste').value = '';
  msg.textContent = `✓ ${added} modelo${added === 1 ? '' : 's'} nuevo${added === 1 ? '' : 's'}${updated ? `, ${updated} ya existente${updated === 1 ? '' : 's'} actualizado${updated === 1 ? '' : 's'}` : ''}.` + (r.notes.length ? ' Notas de tu IA: ' + r.notes.join(' ') : '');
  msg.hidden = false;
};
$('models-clear').onclick = () => {
  if (!confirm('¿Vaciar la lista de modelos? Las ventas ya registradas se mantienen. Luego puedes añadir los tuyos o importarlos con tus objetivos.')) return;
  state.models = []; save(); render();
};

// ---------- objetivos del mes: diálogo con 4 pasos ----------
let draft = null, aiAdd = false, reviewCtx = { editIndex: null };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const STEPS = ['start', 'ia', 'review', 'manual', 'period'];
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
  $('pd-period-desc').textContent = `${isCustomPeriod(month) ? 'Personalizado' : 'Mes natural'}: del ${fmtD(monthRange(month).from)} al ${fmtD(monthRange(month).to)}. Cámbialo si tu mes cierra otro día.`;
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
function periodEndFromForm() {
  const from = $('pd-per-from').value, dur = $('pd-per-dur').value;
  if (!from) return '';
  if (dur === '4' || dur === '5') return addDays(from, 7 * +dur - 1);
  if (dur === 'natural') return naturalRange(from.slice(0, 7)).to;
  return $('pd-per-to').value;
}
function paintPeriod() {
  const from = $('pd-per-from').value, to = periodEndFromForm(), ok = !!(from && to && from <= to);
  $('pd-per-to-wrap').hidden = $('pd-per-dur').value !== 'otra';
  $('pd-per-preview').textContent = ok ? `Del ${fmtD(from)} al ${fmtD(to)} (${daysBetween(from, to)} días)` : 'Elige la fecha de inicio y la de fin.';
  $('pd-per-save').disabled = !ok;
}
function openPeriodStep() {
  const r = monthRange(month), days = daysBetween(r.from, r.to);
  $('pd-per-from').value = r.from; $('pd-per-to').value = r.to;
  $('pd-per-dur').value = !isCustomPeriod(month) ? 'natural' : days === 28 ? '4' : days === 35 ? '5' : 'otra';
  paintPeriod(); showStep('period');
}
$('pd-go-period').onclick = openPeriodStep;
['pd-per-from', 'pd-per-dur', 'pd-per-to'].forEach(id => $(id).addEventListener('input', paintPeriod));
$('pd-per-save').onclick = () => {
  const from = $('pd-per-from').value, to = periodEndFromForm();
  if (!(from && to && from <= to)) return;
  if (!periodSane(month, { from, to })) { alert(`Esas fechas no caen sobre ${monthName(month)}: el periodo tiene que incluir al menos una semana de ese mes.`); return; }
  const nat = naturalRange(month);
  if (from === nat.from && to === nat.to) delete state.periods[month]; else state.periods[month] = { from, to };
  save(); closePlanDialog(); setDefaultDate(); render();
  showToast(`Periodo de ${monthName(month)}: del ${fmtD(from)} al ${fmtD(to)}`, null);
};
$('pd-per-reset').onclick = () => { delete state.periods[month]; save(); closePlanDialog(); setDefaultDate(); render(); showToast('Periodo: mes natural', null); };
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
// Un plan con fechas largas (casi un mes) suele ser el periodo del mes entero: se ofrece usarlo como periodo de este mes.
function periodEligible(plan) { const p = plan.period; return !!(p && p.from && p.to && daysBetween(p.from, p.to) >= 21 && reviewCtx.editIndex === null && periodSane(month, p)); }
function syncUsePeriod(plan, initial) {
  const adding = !$('pd-mode').hidden && document.querySelector('input[name=pdmode]:checked') && document.querySelector('input[name=pdmode]:checked').value === 'add';
  const show = periodEligible(plan) && !adding;
  $('pd-useperiod-wrap').hidden = !show;
  if (periodEligible(plan)) $('pd-useperiod-text').textContent = `Usar estas fechas (del ${fmtD(plan.period.from)} al ${fmtD(plan.period.to)}) como el periodo de ${monthName(month)}: ventas, historial y reporte`;
  if (initial) $('pd-useperiod').checked = periodEligible(plan);
}
document.querySelectorAll('input[name=pdmode]').forEach(r => r.addEventListener('change', () => { if (draft) syncUsePeriod(draft, false); }));
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
  if (plan.period && plan.period.from && plan.period.to && overlapDays(monthRange(month), plan.period) < 1) {   // fechas de otro mes: contarían 0 ventas
    warnings = [...warnings, `El plan trae fechas (del ${fmtD(plan.period.from)} al ${fmtD(plan.period.to)}) que no coinciden con ${monthName(month)}: las ignoro y cuento las ventas de todo el mes. Si no es lo que quieres, cambia de mes arriba y vuelve a pegar.`];
    plan.period = null;
  }
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
  syncUsePeriod(plan, true);
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
  commitPlan(draft, $('pd-models').checked, mode, reviewCtx.editIndex, !$('pd-useperiod-wrap').hidden && $('pd-useperiod').checked);
};
function commitPlan(plan, replaceModels, mode, editIndex, usePeriod) {
  if (usePeriod && plan.period && !periodSane(month, plan.period)) usePeriod = false;
  if (usePeriod && plan.period) {   // las fechas del plan pasan a ser el periodo del mes (y el plan las sigue)
    const nat = naturalRange(month), p = plan.period;
    if (p.from === nat.from && p.to === nat.to) delete state.periods[month]; else state.periods[month] = { from: p.from, to: p.to };
    plan = { ...plan, period: null };
  }
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
$('models').addEventListener('click', e => {
  const b = e.target.closest('[data-alias]'); if (!b) return;
  const m = state.models.find(x => x.id === b.dataset.alias); if (!m) return;
  const v = prompt(`Nombre de «${m.name}» en el reporte de WhatsApp (vacío = el mismo):`, m.alias || m.name);
  if (v === null) return;
  const t = v.trim(); if (t && t !== m.name) m.alias = t; else delete m.alias;
  save(); render();
});
$('models').onchange = e => {
  const tid = e.target.dataset.tipo;
  if (tid) { const m = state.models.find(x => x.id === tid); if (e.target.value) m.tipo = e.target.value; else delete m.tipo; save(); render(); return; }
  const id = e.target.dataset.gama; if (!id) return;
  assignModelGroup(state.models.find(x => x.id === id), e.target.value);
  save(); render();
};
// Al abrir (o al cambiar de mes con la página abierta) pide el objetivo del mes en curso si falta.
let askedFor = '', ready = false;
function checkNewMonth() {
  if (!ready) return;
  const cur = currentKey();
  if (cur !== askedFor && !hasGoals(cur)) {
    askedFor = cur; month = cur; setDefaultDate(); render();
    if (!$('plan-dialog').open) openPlanDialog('start');
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewMonth(); });
setInterval(checkNewMonth, 60000);
document.addEventListener('click', e => {
  if (e.target.matches('[data-open-goals]')) return openPlanDialog('start');
  if (e.target.matches('[data-open-period]')) { openPlanDialog('start'); openPeriodStep(); return; }
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

// ---------- reporte del día (para pegar en WhatsApp) ----------
function typeOfSale(s, ym) {
  const model = state.models.find(m => norm(m.name) === norm(s.name));
  let gname = '';
  for (const p of plansOf(ym)) { const id = Plan.groupIdsOf(p, withKind(s))[0]; const g = id && p.groups.find(x => x.id === id); if (g) { gname = g.name; break; } }
  return Report.deviceType(s.name, gname, model && model.tipo);
}
const reportName = m => (m && m.alias) || '';
function nameForReport(sale) {
  const model = state.models.find(m => norm(m.name) === norm(sale.name));
  const base = reportName(model) || sale.name;
  const st = state.settings || {};
  return st.reportPrefix && st.reportBrand && !norm(base).startsWith(norm(st.reportBrand)) ? `${st.reportBrand} ${base}` : base;
}
const reportNoteKey = () => $('rp-date').value || todayStr();
function buildDayReport() {
  const date = $('rp-date').value || todayStr(), to = $('rp-to').value;
  const typeOf = s => typeOfSale(s, periodKeyFor(s.date));
  if ($('rp-style').value === 'resumen') return Report.build({ date, to, monthFrom: monthRange(periodKeyFor(date)).from, sales: state.sales, typeOf, title: $('rp-title').value.trim(), emoji: $('rp-emoji').checked, withMonth: $('rp-month').checked });
  return Report.buildStore({ date, to, sales: state.sales, typeOf, nameOf: nameForReport, title: $('rp-title').value.trim(), brand: $('rp-brand').value.trim(), stock: $('rp-stock').value, feedback: $('rp-feedback').value });
}
function paintReport() {
  const store = $('rp-style').value !== 'resumen';
  $('rp-store').hidden = !store; $('rp-sum').hidden = store;
  const r = buildDayReport();
  $('rp-text').value = r.empty ? '' : r.text;
  $('rp-text').rows = r.empty ? 3 : Math.min(24, r.text.split('\n').length + 1);
  $('rp-empty').hidden = !r.empty;
  $('rp-copy').disabled = r.empty; $('rp-copy').textContent = 'Copiar reporte';
  $('rp-wa').href = r.empty ? '#' : 'https://wa.me/?text=' + encodeURIComponent(r.text);
  $('rp-wa').setAttribute('aria-disabled', String(r.empty));
}
function loadReportNotes() {
  const n = ((state.settings || {}).reportNotes || {})[reportNoteKey()] || {};
  $('rp-stock').value = n.stock || ''; $('rp-feedback').value = n.feedback || '';
}
function saveReportNotes() {
  const st = state.settings = state.settings || {}, notes = st.reportNotes = st.reportNotes || {}, k = reportNoteKey();
  const stock = $('rp-stock').value, feedback = $('rp-feedback').value;
  if (stock.trim() || feedback.trim()) notes[k] = { stock, feedback }; else delete notes[k];
  Object.keys(notes).sort().slice(0, -20).forEach(d => delete notes[d]);
}
function openReport() {
  const st = state.settings || (state.settings = {});
  $('rp-date').value = todayStr(); $('rp-to').value = '';
  $('rp-style').value = st.reportStyle === 'resumen' ? 'resumen' : 'tienda';
  $('rp-title').value = st.reportTitle || '';
  $('rp-brand').value = st.reportBrand != null ? st.reportBrand : (honorUser() ? 'Honor' : '');
  $('rp-prefix').checked = st.reportPrefix !== false;
  $('rp-emoji').checked = st.reportEmoji !== false;
  $('rp-month').checked = !!st.reportMonth;
  loadReportNotes();
  paintReport();
  const dlg = $('report-dialog'); if (!dlg.open) dlg.showModal();
  $('rp-head').focus();
}
['rp-date', 'rp-to', 'rp-style', 'rp-title', 'rp-brand', 'rp-prefix', 'rp-emoji', 'rp-month', 'rp-stock', 'rp-feedback'].forEach(id => $(id).addEventListener('input', () => {
  if (id === 'rp-date') loadReportNotes();
  if (id === 'rp-date' || id === 'rp-to') { paintReport(); return; }
  const st = state.settings = state.settings || {};
  st.reportStyle = $('rp-style').value; st.reportTitle = $('rp-title').value.trim(); st.reportBrand = $('rp-brand').value.trim(); st.reportPrefix = $('rp-prefix').checked;
  st.reportEmoji = $('rp-emoji').checked; st.reportMonth = $('rp-month').checked;
  if (id === 'rp-stock' || id === 'rp-feedback') saveReportNotes();
  save();
  paintReport();
}));
$('rp-fab').onclick = openReport;
$('rp-x').onclick = () => $('report-dialog').close();
$('rp-copy').onclick = async () => {
  const text = $('rp-text').value; if (!text) return;
  try { await navigator.clipboard.writeText(text); }
  catch (e) { $('rp-text').focus(); $('rp-text').select(); try { document.execCommand('copy'); } catch (_) {} }
  $('rp-copy').textContent = '✓ Copiado: pégalo en WhatsApp';
  setTimeout(() => { $('rp-copy').textContent = 'Copiar reporte'; }, 3500);
};
if (inApp) $('rp-wa').removeAttribute('target');
$('rp-wa').addEventListener('click', e => { if ($('rp-wa').getAttribute('aria-disabled') === 'true') e.preventDefault(); });

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
    if (r.error && !/duplicate|conflict/i.test(r.error.message)) { dirty = true; setStatus('Sin conexión: los cambios se guardan en este dispositivo', 'off'); return; }   // quedan pendientes: no se pisan con la copia de la nube
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
  else if (dirty && !pushing) push();                       // hay cambios sin subir: primero se suben
  else if (!pushing && !document.querySelector('dialog[open]')) pull();
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
