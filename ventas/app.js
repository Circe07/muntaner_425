'use strict';
const KEY = 'ventas-mes-v1';
const GAMAS = ['alta', 'media', 'baja'];
const LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = load();
let month = new Date().toISOString().slice(0, 7);

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.models) return s; } catch (e) {}
  return { models: [], sales: [], goals: {} };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert('No se pudo guardar en el navegador.'); } }

// Objetivo del mes; si no está definido usa el del último mes anterior que lo tenga.
function goalsFor(m) {
  if (state.goals[m]) return state.goals[m];
  const prev = Object.keys(state.goals).filter(k => k < m).sort().pop();
  return prev ? state.goals[prev] : { alta: 0, media: 0, baja: 0 };
}
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
  GAMAS.forEach(g => { const el = $('goal-' + g); if (document.activeElement !== el) el.value = goals[g] || 0; });

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
    ? state.models.map(m => `<li><span>${esc(m.name)} <span class="tag ${m.gama}">${LABEL[m.gama]}</span></span><button class="del" data-model="${m.id}" title="Quitar modelo">✕</button></li>`).join('')
    : '<li class="empty">No hay modelos todavía</li>';
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
$('goals-form').onsubmit = e => {
  e.preventDefault();
  state.goals[month] = Object.fromEntries(GAMAS.map(g => [g, Math.max(0, parseInt($('goal-' + g).value, 10) || 0)]));
  save(); render();
};
document.addEventListener('click', e => {
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

setDefaultDate(); render();
