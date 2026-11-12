'use strict';
const KEY = 'ventas-mes-v1';
const GAMAS = ['alta', 'media', 'baja'];
const LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SEED = [ // [nombre, gama] — gamas orientativas, se pueden cambiar en "Modelos"
  ['Magic Pad 4 12,3" OLED', 'alta'], ['Honor 600 5G 8+512', 'alta'],
  ['Pad 10 12,1" 8GB (1602942)', 'media'], ['Pad 10 12,1" 8GB (1668755)', 'media'],
  ['600 Lite 5G (1668633)', 'media'], ['600 Lite 5G (1668702)', 'media'], ['600 Lite 5G (1668634)', 'media'],
  ['600 Smart 6,87" 5G', 'media'], ['Magic 8 Lite (1611266)', 'media'], ['Magic 8 Lite (1611264)', 'media'],
  ['Pad X8B 11" 4RAM/64GB', 'baja'], ['Pad X8B 11" 6RAM/256GB', 'baja'],
  ['400 Smart 4G (1604932)', 'baja'], ['400 Smart 4G (1604933)', 'baja'], ['X5C Plus 4G', 'baja'],
];
const nowMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
let state = load();
let month = nowMonth();

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!s || !s.models) s = { models: [], sales: [], goals: {} };
  if (!s.seeded && s.models.length === 0) s.models = SEED.map(([name, gama]) => ({ id: uid(), name, gama }));
  s.seeded = true;
  return s;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert('No se pudo guardar en el navegador.'); } }

// Objetivo de cada mes: se configura a mano, no se hereda del mes anterior.
const hasGoals = m => !!state.goals[m];
const goalsFor = m => state.goals[m] || { alta: 0, media: 0, baja: 0 };
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
    const sold = sales.filter(s => s.gama === g).reduce((a, s) => a + s.qty, 0);
    const goal = +goals[g] || 0;
    const t80 = Math.ceil(goal * 0.8);
    const pct = goal ? Math.round(sold / goal * 100) : 0;
    const to80 = Math.max(0, t80 - sold), to100 = Math.max(0, goal - sold);
    const fill = goal ? Math.min(100, sold / goal * 100) : 0;
    return `<div class="gama" style="--c:var(--${g})">
      <h3>${LABEL[g]} <span>${goal ? pct + '%' : 'sin objetivo'}</span></h3>
      <div class="big">${sold} <small>/ ${goal} uds.</small></div>
      <div class="bar"><i style="width:${fill}%"></i>${goal ? `<b style="left:80%"><span>80%</span></b>` : ''}</div>
      <div class="miss"><span>Hasta 80% (${t80}): <strong class="${to80 || !goal ? '' : 'done'}">${goal ? (to80 || '✓') : '–'}</strong></span>
      <span>Hasta 100%: <strong class="${to100 || !goal ? '' : 'done'}">${goal ? (to100 || '✓') : '–'}</strong></span></div>
    </div>`;
  }).join('');

  // historial
  const ms = new Set([...Object.keys(state.goals), ...state.sales.map(s => s.date.slice(0, 7)), nowMonth()]);
  $('history').tBodies[0].innerHTML = [...ms].sort().reverse().map(m => {
    const g = goalsFor(m), ss = state.sales.filter(s => s.date.startsWith(m));
    const cells = GAMAS.map(x => {
      const sold = ss.filter(s => s.gama === x).reduce((a, s) => a + s.qty, 0), goal = +g[x] || 0;
      return `<td>${sold} / ${goal || '–'}${goal ? ` (${Math.round(sold / goal * 100)}%)` : ''}</td>`;
    }).join('');
    return `<tr data-month="${m}" class="${m === month ? 'cur' : ''}"><td>${monthName(m)}</td>${cells}</tr>`;
  }).join('');

  // por modelo (ventas del mes agrupadas por nombre; incluye modelos activos sin ventas)
  const map = new Map();
  state.models.forEach(m => map.set(m.name + '|' + m.gama, { name: m.name, gama: m.gama, qty: 0 }));
  sales.forEach(s => {
    const k = s.name + '|' + s.gama;
    if (!map.has(k)) map.set(k, { name: s.name, gama: s.gama, qty: 0 });
    map.get(k).qty += s.qty;
  });
  const rows = [...map.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  $('by-model').tBodies[0].innerHTML = rows.length
    ? rows.map(r => `<tr><td>${esc(r.name)}</td><td><span class="tag ${r.gama}">${LABEL[r.gama]}</span></td><td class="n">${r.qty}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">Sin datos</td></tr>';
  const top = rows.filter(r => r.qty > 0).slice(0, 5);
  $('top').innerHTML = top.length ? top.map(r => `<li>${esc(r.name)} <span>${r.qty}</span></li>`).join('') : '<li class="empty">Aún no hay ventas este mes</li>';

  // listado de ventas
  $('total').textContent = sales.reduce((a, s) => a + s.qty, 0) + ' uds.';
  $('sales').tBodies[0].innerHTML = sales.length
    ? sales.map(s => `<tr><td>${s.date.split('-').reverse().join('/')}</td><td>${esc(s.name)}</td><td><span class="tag ${s.gama}">${LABEL[s.gama]}</span></td><td class="n">${s.qty}</td><td class="n"><button class="del" data-sale="${s.id}" title="Borrar">✕</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Sin ventas este mes</td></tr>';

  // gestión de modelos
  $('models').innerHTML = state.models.length
    ? state.models.map(m => `<li><span>${esc(m.name)}</span><span><select data-gama="${m.id}">${GAMAS.map(g => `<option value="${g}"${g === m.gama ? ' selected' : ''}>${LABEL[g]}</option>`).join('')}</select> <button class="del" data-model="${m.id}" title="Quitar modelo">✕</button></span></li>`).join('')
    : '<li class="empty">No hay modelos todavía</li>';
}

function shiftMonth(d) {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  setDefaultDate(); render(); checkNewMonth();
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
function openGoals() {
  const g = goalsFor(month);
  $('goal-title').textContent = 'Objetivos de ' + monthName(month);
  GAMAS.forEach(x => $('goal-' + x).value = hasGoals(month) ? g[x] : '');
  $('goal-dialog').showModal();
}
$('goals-form').onsubmit = e => {
  if (e.submitter && e.submitter.value !== 'ok') return;
  state.goals[month] = Object.fromEntries(GAMAS.map(g => [g, Math.max(0, parseInt($('goal-' + g).value, 10) || 0)]));
  save(); render();
};
$('goal-cancel').onclick = () => $('goal-dialog').close();
$('history').onclick = e => { const tr = e.target.closest('tr[data-month]'); if (tr) { month = tr.dataset.month; setDefaultDate(); render(); } };
$('models').onchange = e => {
  const id = e.target.dataset.gama; if (!id) return;
  const m = state.models.find(x => x.id === id); m.gama = e.target.value;
  state.sales.forEach(s => { if (s.modelId === id) s.gama = m.gama; });
  save(); render();
};
// Al abrir (o al cambiar de mes con la página abierta) pide el objetivo del mes en curso si falta.
let askedFor = '';
function checkNewMonth() {
  const cur = nowMonth();
  if (cur !== askedFor && !hasGoals(cur)) {
    askedFor = cur; month = cur; setDefaultDate(); render(); checkNewMonth();
    if (!$('goal-dialog').open) openGoals();
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewMonth(); });
setInterval(checkNewMonth, 60000);
document.addEventListener('click', e => {
  if (e.target.matches('[data-open-goals]')) return openGoals();
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
    if (confirm('Esto reemplazará los datos actuales. ¿Continuar?')) { state = { models: d.models, sales: d.sales, goals: d.goals || {} }; save(); render(); }
  } catch (_) { alert('Archivo no válido.'); }
  e.target.value = '';
};

setDefaultDate(); render(); checkNewMonth();
