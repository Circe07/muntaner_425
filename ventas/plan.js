// Plan de objetivos estándar: formato, validación, cálculo de incentivos y texto para la IA.
// Sin dependencias de pantalla: se puede probar en Node (module.exports) y se usa en el navegador (window.Plan).
(function (root) {
  'use strict';

  const LEGACY_GROUPS = [
    { id: 'alta', name: 'Alta', models: [] },
    { id: 'media', name: 'Media', models: [] },
    { id: 'baja', name: 'Baja', models: [] }
  ];

  // ---------- utilidades ----------
  const norm = s => String(s == null ? '' : s).trim().toLowerCase();
  const slug = s => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  const pick = (o, ...ks) => { if (o && typeof o === 'object') for (const k of ks) if (o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };
  const arr = v => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
  const strs = v => arr(v).map(x => String(x).trim()).filter(Boolean);
  const toNum = v => {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v !== 'string') return NaN;
    const t = v.replace(/[\s€%]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    return t === '' ? NaN : Number(t);
  };
  const r8 = n => Math.round(n * 1e8) / 1e8;
  const eur = n => (Math.round(n * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' €';
  const eur0 = n => Math.round(n).toLocaleString('es-ES') + ' €';
  const fmtV = (metric, v) => metric === 'revenue' ? eur0(v) : String(Math.round(v * 100) / 100).replace('.', ',');

  // ---------- leer lo que devuelve la IA ----------
  function extractJson(text) {
    let t = String(text || '').trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0) return { error: 'No encuentro ningún JSON en lo que has pegado. Si tu IA te ha hecho una pregunta, respóndele: «Asume lo más razonable y devuélveme ya el JSON, sin preguntas». Después copia el bloque de código completo.' };
    if (b <= a) return { error: 'El JSON está incompleto (falta el final). Copia la respuesta entera de tu IA, hasta el último cierre.' };
    try { return { value: JSON.parse(t.slice(a, b + 1)) }; }
    catch (e) { return { error: 'El JSON está incompleto o tiene algún error. Pídele a tu IA: «Devuélveme el JSON completo y válido, solo el bloque de código».' }; }
  }

  function normalizePlan(input) {
    const errors = [], warnings = [];
    let raw = input;
    if (typeof input === 'string') {
      const r = extractJson(input);
      if (r.error) return { plan: null, errors: [r.error], warnings };
      raw = r.value;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { plan: null, errors: ['Lo pegado no es un plan de objetivos.'], warnings };
    const inner = pick(raw, 'plan', 'plan_objetivos');
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) raw = inner;

    // grupos (categorías de producto)
    const groups = [], gRef = new Map();
    arr(pick(raw, 'grupos', 'groups')).slice(0, 40).forEach((g, i) => {
      if (!g || typeof g !== 'object') return;
      const name = String(pick(g, 'nombre', 'name', 'id') ?? '').trim() || ('Grupo ' + (i + 1));
      let id = slug(pick(g, 'id') ?? name);
      while (groups.some(x => x.id === id)) id += '-' + (i + 1);
      const seen = new Map();
      strs(pick(g, 'modelos', 'models')).slice(0, 300).forEach(m => { if (!seen.has(norm(m))) seen.set(norm(m), m); });
      groups.push({ id, name, models: [...seen.values()] });
      gRef.set(id, id); gRef.set(slug(name), id);
    });

    // ámbito: a qué ventas se aplica algo
    function readScope(sc, o, label) {
      const src = sc && typeof sc === 'object' && !Array.isArray(sc) ? sc : {};
      const gr = strs(pick(src, 'grupos', 'groups', 'grupo', 'group') ?? (typeof sc === 'string' && !/^(todo|todos|all)$/i.test(sc) ? sc : undefined) ?? pick(o, 'grupos', 'groups', 'grupo', 'group'));
      const mo = strs(pick(src, 'modelos', 'models', 'modelo', 'model') ?? pick(o, 'modelos', 'models'));
      const groupIds = [];
      gr.forEach(ref => {
        const id = gRef.get(slug(ref));
        if (id) { if (!groupIds.includes(id)) groupIds.push(id); }
        else warnings.push(`${label}: el grupo «${ref}» no está en «grupos»; lo ignoro.`);
      });
      if (!groupIds.length && !mo.length) {
        if (gr.length) warnings.push(`${label}: ningún grupo válido; lo aplico a todos los productos.`);
        return { all: true, groups: [], models: [] };
      }
      return { all: false, groups: groupIds, models: mo };
    }

    // objetivos
    const objectives = [];
    const rawObjs = arr(pick(raw, 'objetivos', 'objectives'));
    if (!rawObjs.length) errors.push('No encuentro ningún objetivo en el plan.');
    rawObjs.slice(0, 30).forEach((o, i) => {
      if (!o || typeof o !== 'object') return;
      const name = String(pick(o, 'nombre', 'name', 'id') ?? '').trim() || ('Objetivo ' + (i + 1));
      let id = slug(pick(o, 'id') ?? name);
      while (objectives.some(x => x.id === id)) id += '-' + (i + 1);
      const label = `Objetivo «${name}»`;
      const m = norm(pick(o, 'metrica', 'métrica', 'metric', 'medida'));
      const metric = ['unidades', 'unidad', 'uds', 'udes', 'units', 'unit'].includes(m) ? 'units'
        : ['importe', 'dinero', 'euros', 'euro', 'eur', '€', 'revenue', 'ventas', 'facturacion', 'facturación', 'money', 'amount', 'pasta'].includes(m) ? 'revenue' : null;
      if (!metric) errors.push(`${label}: la métrica debe ser «unidades» o «importe».`);
      const scope = readScope(pick(o, 'ambito', 'ámbito', 'scope', 'alcance'), o, label);
      const target = toNum(pick(o, 'meta', 'target'));
      if (!(target > 0)) errors.push(`${label}: falta la meta (un número mayor que 0).`);
      const p = pick(o, 'pago', 'payout') || {};
      const reward = toNum(pick(p, 'recompensa', 'reward', 'incentivo', 'importe', 'premio'));
      if (!(reward >= 0)) errors.push(`${label}: falta la recompensa (los € que cobras al llegar al 100%).`);
      const cr = norm(pick(p, 'tipo', 'curve', 'curva'));
      let curve = ['fijo', 'flat', 'plano', 'todo o nada', 'todo_o_nada'].includes(cr) ? 'flat' : ['escalones', 'steps', 'tramos', 'escalonado'].includes(cr) ? 'steps' : 'linear';
      let start = toNum(pick(p, 'desde_pct', 'start_pct', 'desde'));
      if (!isFinite(start)) start = curve === 'flat' ? 100 : 80;
      start = Math.min(Math.max(start, 0), 200);
      let cap = toNum(pick(p, 'tope_pct', 'cap_pct', 'tope'));
      if (!isFinite(cap)) cap = 100;
      if (cap < 100) { warnings.push(`${label}: el tope no puede ser menor que 100%; lo dejo en 100%.`); cap = 100; }
      let steps = [];
      if (curve === 'steps') {
        steps = arr(pick(p, 'escalones', 'steps', 'tramos')).map(s => ({ from: toNum(pick(s, 'desde_pct', 'from_pct', 'desde')), pays: toNum(pick(s, 'paga_pct', 'pays_pct', 'paga')) }))
          .filter(s => isFinite(s.from) && isFinite(s.pays) && s.pays >= 0).sort((a, b) => a.from - b.from);
        if (!steps.length) { warnings.push(`${label}: no hay escalones válidos; uso pago lineal.`); curve = 'linear'; }
        else { start = steps[0].from; cap = Math.max(100, steps[steps.length - 1].from); }
      }
      if (curve === 'flat') cap = 100;
      const pool = pick(o, 'alternativa', 'pool');
      objectives.push({
        id, name, metric, scope, target,
        payout: { curve, reward: isFinite(reward) ? reward : 0, start_pct: start, cap_pct: cap, steps },
        requires: strs(pick(o, 'requiere', 'requires')),
        pool: pool ? slug(String(pool)) : null
      });
    });
    const oRef = new Map();
    objectives.forEach(o => { oRef.set(o.id, o.id); oRef.set(slug(o.name), o.id); });
    objectives.forEach(o => {
      const ids = [];
      o.requires.forEach(ref => {
        const id = oRef.get(slug(ref));
        if (id && id !== o.id) { if (!ids.includes(id)) ids.push(id); }
        else warnings.push(`Objetivo «${o.name}»: «requiere» apunta a «${ref}», que no existe; lo ignoro.`);
      });
      o.requires = ids;
    });

    // incentivos por unidad (desde la primera unidad)
    const unit_incentives = [];
    arr(pick(raw, 'incentivos_por_unidad', 'unit_incentives', 'incentivos_unitarios')).slice(0, 100).forEach((r, i) => {
      if (!r || typeof r !== 'object') return;
      const label = `Incentivo por unidad ${i + 1}`;
      const scope = readScope(pick(r, 'ambito', 'ámbito', 'scope'), r, label);
      const amounts = arr(pick(r, 'importes', 'amounts', 'importe', 'amount')).map(toNum).filter(n => isFinite(n) && n >= 0);
      if (!amounts.length) { errors.push(`${label}: faltan los importes por unidad.`); return; }
      if (scope.all) { errors.push(`${label}: indica a qué modelos o grupos se aplica.`); return; }
      unit_incentives.push({ name: String(pick(r, 'nombre', 'name') ?? '').trim(), scope, amounts });
    });

    // comisiones sobre el importe vendido
    const commissions = [];
    arr(pick(raw, 'comisiones', 'commissions')).slice(0, 30).forEach((r, i) => {
      if (!r || typeof r !== 'object') return;
      const name = String(pick(r, 'nombre', 'name') ?? '').trim() || ('Comisión ' + (i + 1));
      const percent = toNum(pick(r, 'porcentaje', 'percent', 'pct'));
      if (!(percent > 0)) { errors.push(`Comisión «${name}»: falta el porcentaje.`); return; }
      commissions.push({ name, scope: readScope(pick(r, 'ambito', 'ámbito', 'scope'), r, `Comisión «${name}»`), percent });
    });

    const notes = strs(pick(raw, 'notas', 'notes', 'supuestos', 'dudas')).slice(0, 12).map(x => x.slice(0, 300));
    if (errors.length) return { plan: null, errors, warnings };
    return {
      plan: { v: 1, brand: String(pick(raw, 'marca', 'brand') ?? '').trim().slice(0, 60), groups, objectives, unit_incentives, commissions, notes },
      errors, warnings
    };
  }

  // ---------- plan antiguo (3 gamas) -> plan estándar ----------
  function fromLegacy(g) {
    const objectives = ['alta', 'media', 'baja'].map(x => ({
      id: x, name: { alta: 'Alta', media: 'Media', baja: 'Baja' }[x], metric: 'units',
      scope: { all: false, groups: [x], models: [] }, target: +g[x] || 0,
      payout: { curve: 'linear', reward: +((g.inc || {})[x]) || 0, start_pct: 80, cap_pct: Math.max(100, +((g.max || {})[x]) || 100), steps: [] },
      requires: [], pool: null
    }));
    return {
      v: 1, brand: '', groups: LEGACY_GROUPS.map(x => ({ ...x, models: [] })), objectives,
      unit_incentives: (g.unit || []).map(r => ({ name: '', scope: { all: false, groups: [], models: [r.model] }, amounts: r.amounts })),
      commissions: [], notes: []
    };
  }

  // ---------- cálculo ----------
  function groupIdsOf(plan, sale) {
    const n = norm(sale.name), gs = plan.groups || [];
    const named = gs.filter(g => (g.models || []).some(m => norm(m) === n));
    if (named.length) return named.map(g => g.id);
    return gs.filter(g => norm(g.id) === norm(sale.gama)).map(g => g.id);
  }
  function matchesScope(plan, scope, sale) {
    if (!scope || scope.all) return true;
    const n = norm(sale.name);
    if ((scope.models || []).some(m => norm(m) === n)) return true;
    if ((scope.groups || []).length) { const ids = groupIdsOf(plan, sale); if (scope.groups.some(g => ids.includes(g))) return true; }
    return false;
  }
  const unitPay = (amounts, n) => { let t = 0; for (let i = 0; i < n; i++) t += +amounts[Math.min(i, amounts.length - 1)] || 0; return t; };

  function payFraction(o, pct) {      // % de la recompensa que se cobra con ese cumplimiento
    const p = o.payout, eps = 1e-9;
    if (!(o.target > 0) || pct + eps < p.start_pct) return 0;
    if (p.curve === 'flat') return 100;
    if (p.curve === 'steps') { let f = 0; (p.steps || []).forEach(s => { if (pct + eps >= s.from) f = s.pays; }); return f; }
    return Math.min(pct, p.cap_pct);
  }
  const maxFraction = o => o.payout.curve === 'flat' ? 100 : o.payout.curve === 'steps' ? Math.max(0, ...(o.payout.steps || []).map(s => s.pays)) : o.payout.cap_pct;

  function evaluate(plan, sales) {
    const live = sales.filter(s => s && isFinite(s.qty));
    const objs = plan.objectives.map(o => {
      const sc = live.filter(s => matchesScope(plan, o.scope, s));
      let value = o.metric === 'revenue' ? sc.reduce((a, s) => a + (+s.amount || 0), 0) : sc.reduce((a, s) => a + s.qty, 0);
      value = Math.max(0, r8(value));
      const missing = o.metric === 'revenue' ? sc.filter(s => s.qty > 0 && !(+s.amount > 0)).length : 0;
      const pct = o.target > 0 ? r8(value / o.target * 100) : 0;
      const p = o.payout;
      const reached = o.target > 0 && pct + 1e-9 >= p.start_pct;
      const barMax = Math.max(100, p.cap_pct, ...(p.steps || []).map(s => s.from));
      return {
        ...o, value, pct, missing, reached, barMax,
        toStart: o.target > 0 ? Math.max(0, o.target * p.start_pct / 100 - value) : 0,
        to100: o.target > 0 ? Math.max(0, o.target - value) : 0,
        payNow: p.reward * payFraction(o, pct) / 100,
        payAtStart: p.reward * payFraction(o, p.start_pct) / 100,
        pay100: p.reward * payFraction(o, 100) / 100,
        payMax: p.reward * maxFraction(o) / 100,
        blockedBy: [], poolLoser: false
      };
    });
    // requisitos: solo paga si ya se alcanzó el mínimo de los objetivos indicados
    objs.forEach(o => {
      o.blockedBy = (o.requires || []).map(id => objs.find(x => x.id === id)).filter(r => r && !r.reached);
      if (o.blockedBy.length) o.payNow = 0;
    });
    // alternativas: de cada grupo solo cuenta el que más paga
    const pools = {};
    objs.forEach(o => { if (o.pool) (pools[o.pool] = pools[o.pool] || []).push(o); });
    let objectivesTotal = 0, objectivesMax = 0;
    objs.filter(o => !o.pool).forEach(o => { objectivesTotal += o.payNow; objectivesMax += o.payMax; });
    Object.values(pools).forEach(list => {
      const win = list.reduce((b, o) => (o.payNow > b.payNow ? o : b), list[0]);
      list.forEach(o => { o.poolLoser = o !== win && list.length > 1; });
      objectivesTotal += win.payNow; objectivesMax += Math.max(...list.map(o => o.payMax));
    });
    // incentivos por unidad
    const unitRows = (plan.unit_incentives || []).map(r => {
      const sc = live.filter(s => matchesScope(plan, r.scope, s));
      const n = Math.max(0, sc.reduce((a, s) => a + s.qty, 0));
      const label = r.name || [...(r.scope.models || []), ...(r.scope.groups || []).map(id => (plan.groups.find(g => g.id === id) || { name: id }).name)].join(', ');
      return { label, amounts: r.amounts, n, pay: unitPay(r.amounts, n), next: +r.amounts[Math.min(n, r.amounts.length - 1)] || 0 };
    });
    // comisiones
    const comRows = (plan.commissions || []).map(c => {
      const sc = live.filter(s => matchesScope(plan, c.scope, s));
      const revenue = Math.max(0, sc.reduce((a, s) => a + (+s.amount || 0), 0));
      return { name: c.name, percent: c.percent, revenue, pay: revenue * c.percent / 100, missing: sc.filter(s => s.qty > 0 && !(+s.amount > 0)).length };
    });
    const units = unitRows.reduce((a, r) => a + r.pay, 0), commissions = comRows.reduce((a, r) => a + r.pay, 0);
    return {
      objectives: objs, unitRows, comRows, units, commissions, objectivesTotal, objectivesMax,
      total: objectivesTotal + units + commissions,
      hasRevenue: plan.objectives.some(o => o.metric === 'revenue') || (plan.commissions || []).length > 0
    };
  }

  // ---------- explicar el plan con palabras ----------
  function scopeText(plan, scope) {
    if (!scope || scope.all) return 'en todos los productos';
    const names = [...(scope.groups || []).map(id => (plan.groups.find(g => g.id === id) || { name: id }).name), ...(scope.models || [])];
    return 'en ' + (names.length > 6 ? names.slice(0, 6).join(', ') + '…' : names.join(', '));
  }
  function describePlan(plan) {
    const lines = [];
    plan.objectives.forEach(o => {
      const p = o.payout;
      const meta = o.metric === 'revenue' ? `vender ${eur0(o.target)}` : `vender ${fmtV('units', o.target)} uds.`;
      let pay;
      if (p.curve === 'flat') pay = `Cobras ${eur(p.reward)} en cuanto llegas al ${p.start_pct}% de la meta.`;
      else if (p.curve === 'steps') pay = `Escalones sobre ${eur(p.reward)}: ` + p.steps.map(s => `desde el ${s.from}% cobras el ${s.pays}%`).join('; ') + '.';
      else pay = `Desde el ${p.start_pct}% de la meta cobras tu porcentaje de ${eur(p.reward)} (al 100%: ${eur(p.reward)}${p.cap_pct > 100 ? `; sigue hasta el ${p.cap_pct}%: ${eur(p.reward * p.cap_pct / 100)}` : ''}); por debajo del ${p.start_pct}%, nada.`;
      let extra = '';
      if (o.requires.length) extra += ` Solo cobras si llegas al mínimo de: ${o.requires.map(id => '«' + (plan.objectives.find(x => x.id === id) || { name: id }).name + '»').join(', ')}.`;
      if (o.pool) extra += ` Alternativa ${o.pool.toUpperCase()}: de los objetivos con la misma alternativa solo cuenta el que más paga.`;
      lines.push(`${o.name}: ${meta} ${scopeText(plan, o.scope)}. ${pay}${extra}`);
    });
    (plan.unit_incentives || []).forEach(r => {
      const label = r.name || [...(r.scope.models || []), ...(r.scope.groups || []).map(id => (plan.groups.find(g => g.id === id) || { name: id }).name)].join(', ');
      lines.push(`Por unidad — ${label}: ` + (r.amounts.length > 1 ? r.amounts.map(eur).join(' → ') + ' (el último importe se repite), desde la primera unidad.' : `${eur(r.amounts[0])} por cada unidad, desde la primera.`));
    });
    (plan.commissions || []).forEach(c => lines.push(`Comisión — ${c.name}: ${String(c.percent).replace('.', ',')}% de lo vendido ${scopeText(plan, c.scope)}.`));
    return lines;
  }

  // ---------- instrucciones para la IA ----------
  const EXAMPLE_A = {
    version: 1, marca: 'Ejemplo A (unidades por gamas)',
    grupos: [{ id: 'alta', nombre: 'Gama Alta', modelos: ['Modelo A1', 'Modelo A2'] }, { id: 'media', nombre: 'Gama Media', modelos: ['Modelo B1'] }],
    objetivos: [
      { id: 'alta', nombre: 'Gama Alta', metrica: 'unidades', ambito: { grupos: ['alta'] }, meta: 30, pago: { tipo: 'lineal', recompensa: 400, desde_pct: 80, tope_pct: 140 } },
      { id: 'media', nombre: 'Gama Media', metrica: 'unidades', ambito: { grupos: ['media'] }, meta: 85, pago: { tipo: 'lineal', recompensa: 400, desde_pct: 80, tope_pct: 120 } }
    ],
    incentivos_por_unidad: [{ modelos: ['Modelo A1'], importes: [50, 70, 100] }, { modelos: ['Modelo B1'], importes: [10] }]
  };
  const EXAMPLE_B = {
    version: 1, marca: 'Ejemplo B (dinero, categorías y alternativas)',
    grupos: [{ id: 'moviles', nombre: 'Móviles', modelos: [] }, { id: 'wearables', nombre: 'Wearables', modelos: ['Watch X', 'Band Y'] }],
    objetivos: [
      { id: 'total', nombre: 'Objetivo total', metrica: 'importe', ambito: { todo: true }, meta: 40000, pago: { tipo: 'escalones', recompensa: 500, escalones: [{ desde_pct: 90, paga_pct: 50 }, { desde_pct: 100, paga_pct: 100 }, { desde_pct: 120, paga_pct: 150 }] } },
      { id: 'wear', nombre: 'Wearables', metrica: 'importe', ambito: { grupos: ['wearables'] }, meta: 6000, pago: { tipo: 'fijo', recompensa: 150, desde_pct: 100 }, requiere: ['total'] },
      { id: 'uds', nombre: 'Unidades de móvil', metrica: 'unidades', ambito: { grupos: ['moviles'] }, meta: 60, pago: { tipo: 'lineal', recompensa: 300, desde_pct: 80, tope_pct: 120 }, alternativa: 'A' },
      { id: 'mix', nombre: 'Dinero en móviles', metrica: 'importe', ambito: { grupos: ['moviles'] }, meta: 30000, pago: { tipo: 'lineal', recompensa: 300, desde_pct: 80, tope_pct: 120 }, alternativa: 'A' }
    ],
    comisiones: [{ nombre: 'Comisión wearables', ambito: { grupos: ['wearables'] }, porcentaje: 2 }],
    notas: ['El comunicado no dice si hay tope en wearables: asumí que no.', 'Interpreté «uno de los dos» como alternativa: solo cuenta el que más paga.']
  };

  function buildPrompt(opts) {
    const o = opts || {};
    const models = (o.models || []).slice(0, 80);
    return [
      'TAREA: convierte el texto de objetivos e incentivos que hay AL FINAL de este mensaje en un JSON con el formato de abajo. Es para mi app "Ventas del mes", que lo lee automáticamente.',
      '',
      'REGLAS ESTRICTAS (léelas antes de empezar)',
      '1. Responde DE UNA VEZ. NO me hagas preguntas, ni una. Si algo es ambiguo o falta un dato, elige la interpretación más razonable y apúntala en el campo "notas" (una frase corta por cada suposición).',
      '2. Tu respuesta debe ser SOLO un único bloque de código ```json con el JSON. Nada de texto antes ni después, ni explicaciones, ni saludos.',
      '3. No inventes cifras. Usa solo números que aparezcan en el texto. Si un dato no aparece, usa el valor por defecto que se indica y anótalo en "notas".',
      '4. Si el texto mezcla varias marcas, meses o programas, usa solo lo que corresponda al mes indicado abajo y a un comercial de tienda. Ignora lo demás (condiciones legales, ejemplos, saludos…).',
      '5. Cada objetivo del texto = un elemento de "objetivos". Si el texto da un mismo premio para varias condiciones, créalas como objetivos separados.',
      '6. Números sin símbolo ni separador de miles (40000, no "40.000 €"). Porcentajes sin el símbolo %.',
      '',
      'FORMATO DEL JSON',
      '{',
      '  "version": 1,',
      '  "marca": "texto opcional",',
      '  "grupos": [ { "id": "alta", "nombre": "Gama Alta", "modelos": ["nombre exacto del modelo", "..."] } ],',
      '  "objetivos": [ {',
      '    "id": "alta", "nombre": "Gama Alta",',
      '    "metrica": "unidades" | "importe",',
      '    "ambito": { "grupos": ["alta"] }  |  { "modelos": ["..."] }  |  { "todo": true },',
      '    "meta": 30,',
      '    "pago": { "tipo": "lineal" | "fijo" | "escalones", "recompensa": 400, "desde_pct": 80, "tope_pct": 140,',
      '              "escalones": [ { "desde_pct": 80, "paga_pct": 80 }, { "desde_pct": 100, "paga_pct": 100 } ] },',
      '    "requiere": ["id de otro objetivo"],',
      '    "alternativa": "A"',
      '  } ],',
      '  "incentivos_por_unidad": [ { "modelos": ["Modelo X"], "importes": [50, 70, 100] } ],',
      '  "comisiones": [ { "nombre": "…", "ambito": { "grupos": ["…"] }, "porcentaje": 2 } ],',
      '  "notas": ["suposiciones o dudas, una frase cada una"]',
      '}',
      '',
      'CÓMO DECIDIR CADA CAMPO',
      '- metrica: "unidades" si la meta es un número de aparatos (sell-out en unidades); "importe" si la meta es dinero vendido (€, sell-out en valor, facturación).',
      '- ambito: qué ventas cuentan. Una categoría o gama → { "grupos": [id] }; modelos concretos → { "modelos": [...] }; todo lo vendido → { "todo": true }.',
      '- grupos: las categorías o gamas del texto (alta/media/entrada, móviles/wearables/tablets…). En "modelos" pon los nombres exactos que cite el texto. Si no hay lista, deja "modelos": [].',
      '- meta: el número a alcanzar (unidades o euros).',
      '- pago.recompensa: los € que se cobran al llegar al 100% de la meta (o el premio total si es todo-o-nada).',
      '- pago.desde_pct: % mínimo de la meta para empezar a cobrar ("a partir del 80%"). Si no se dice: 80 en lineal y escalones; 100 en fijo.',
      '- pago.tipo: "lineal" = cobras tu % de cumplimiento × recompensa (90% de la meta → 90% del premio) hasta "tope_pct". "fijo" = cobras todo el premio en cuanto llegas a "desde_pct". "escalones" = una tabla de tramos (cada tramo: desde qué % y qué % del premio se paga).',
      '- pago.tope_pct: máximo % de cumplimiento que se paga ("hasta el 140%"). Si no hay tope: 100.',
      '- Objetivos independientes se SUMAN. Si el texto dice "uno de los dos", "el mayor", "o bien", "no acumulable" → ponles la misma letra en "alternativa".',
      '- requiere: úsalo si un premio solo se cobra cuando antes se ha alcanzado otro objetivo ("para cobrar el bonus de wearables hay que llegar al 100% del total").',
      '- incentivos_por_unidad: premios por cada unidad vendida, desde la primera. "importes" en orden (1.ª, 2.ª, 3.ª unidad…); el último importe se repite para las siguientes. Si solo pagan a partir de la unidad N, pon ceros en las N-1 primeras (ej. a partir de la 11.ª cobras 15 €: [0,0,0,0,0,0,0,0,0,0,15]).',
      '- comisiones: un % sobre el dinero vendido de ese ámbito.',
      '- Los "id" van en minúsculas, sin espacios ni tildes y sin repetirse.',
      '- Si algo del texto NO cabe en este formato, hazlo encajar lo mejor posible y describe en "notas" lo que no has podido reflejar.',
      '',
      'EJEMPLO A (objetivos en unidades por gamas, con incentivos por unidad):',
      JSON.stringify(EXAMPLE_A, null, 1),
      '',
      'EJEMPLO B (objetivos en dinero, categorías, alternativa, requisito, comisión y notas):',
      JSON.stringify(EXAMPLE_B, null, 1),
      '',
      'MES: ' + (o.monthLabel || ''),
      models.length ? 'MIS MODELOS ACTUALES EN LA APP (usa estos nombres exactos si coinciden): ' + models.join(', ') : 'MIS MODELOS ACTUALES EN LA APP: (ninguno todavía)',
      '',
      'RECUERDA: responde ya, sin preguntas, solo con el bloque ```json.',
      '',
      'TEXTO DE OBJETIVOS E INCENTIVOS (empieza justo debajo de esta línea):',
      ''
    ].join('\n');
  }

  const api = { LEGACY_GROUPS, normalizePlan, extractJson, fromLegacy, evaluate, describePlan, buildPrompt, matchesScope, groupIdsOf, payFraction, norm, slug, eur, eur0, fmtV, EXAMPLE_A, EXAMPLE_B };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Plan = api;
})(typeof window !== 'undefined' ? window : globalThis);
