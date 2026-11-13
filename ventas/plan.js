// Plan de objetivos estándar: formato, validación, cálculo de incentivos y texto para la IA.
// Sin dependencias de pantalla: se puede probar en Node (vm) y se usa en el navegador (window.Plan).
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
  const ddmm = d => d ? d.slice(8) + '/' + d.slice(5, 7) : '';
  const periodText = p => !p ? '' : p.from && p.to ? `del ${ddmm(p.from)} al ${ddmm(p.to)}` : p.from ? `desde el ${ddmm(p.from)}` : `hasta el ${ddmm(p.to)}`;
  const inPeriod = (per, d) => !per || ((!per.from || d >= per.from) && (!per.to || d <= per.to));

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

  // Tipo de producto de un grupo (para repartir las ventas por tipo cuando el texto no trae lista de modelos)
  const TYPE_RULES = [['tablets', /\b(tablets?|tab\d*|\w*pad\d*|npc)\b/], ['relojes', /\b(wearables?|relojes?|\w*watch\d*|band\d*|pulseras?|iot)\b/], ['portatiles', /\b(portatiles?|laptops?|notebook|ordenadores?|\w*book\d*)\b/],
    ['auriculares', /\b(auriculares?|\w*buds\d*|tws|earbuds|headphones?)\b/], ['tv', /\b(tv|televisor(es)?|television(es)?)\b/], ['accesorios', /\b(accesorios?|cargadores?|fundas?)\b/],
    ['moviles', /\b(moviles?|smartphones?|telefon\w*|phones?|hhp|handhelds?)\b/]];
  const inferType = text => { const n = norm(text); if (!n) return ''; for (const [k, re] of TYPE_RULES) if (re.test(n)) return k; return ''; };
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

    // fechas AAAA-MM-DD
    function readPeriod(v, label) {
      if (!v || typeof v !== 'object') return null;
      const f = pick(v, 'desde', 'from'), t = pick(v, 'hasta', 'to');
      const ok = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.trim());
      const from = ok(f) ? f.trim() : null, to = ok(t) ? t.trim() : null;
      if ((f && !from) || (t && !to)) warnings.push(`${label}: las fechas deben ir como AAAA-MM-DD; las ignoro.`);
      if (from && to && from > to) { warnings.push(`${label}: la fecha de inicio es posterior a la de fin; ignoro el periodo.`); return null; }
      return from || to ? { from, to } : null;
    }
    const planPeriod = readPeriod(pick(raw, 'periodo', 'period'), 'Plan');
    const planName = String(pick(raw, 'nombre', 'name') ?? '').trim().slice(0, 80);

    // grupos (categorías de producto)
    const groups = [], gRef = new Map();
    arr(pick(raw, 'grupos', 'groups')).slice(0, 40).forEach((g, i) => {
      if (!g || typeof g !== 'object') return;
      const name = String(pick(g, 'nombre', 'name', 'id') ?? '').trim() || ('Grupo ' + (i + 1));
      let id = slug(pick(g, 'id') ?? name);
      while (groups.some(x => x.id === id)) id += '-' + (i + 1);
      const seen = new Map();
      strs(pick(g, 'modelos', 'models')).slice(0, 300).forEach(m => { if (!seen.has(norm(m))) seen.set(norm(m), m); });
      const type = inferType(pick(g, 'tipo', 'type')) || (seen.size ? '' : inferType(name));
      groups.push({ id, name, models: [...seen.values()], type });
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
    // escalones "desde X% se paga Y%"
    const readSteps = v => arr(v).map(s => ({ from: toNum(pick(s, 'desde_pct', 'from_pct', 'desde')), pays: toNum(pick(s, 'paga_pct', 'pays_pct', 'paga')) }))
      .filter(s => isFinite(s.from) && isFinite(s.pays) && s.pays >= 0).sort((a, b) => a.from - b.from);

    // objetivos
    const objectives = [], explicitStart = new Set();
    const rawObjs = arr(pick(raw, 'objetivos', 'objectives'));
    rawObjs.slice(0, 30).forEach((o, i) => {
      if (!o || typeof o !== 'object') return;
      const name = String(pick(o, 'nombre', 'name', 'id') ?? '').trim() || ('Objetivo ' + (i + 1));
      let id = slug(pick(o, 'id') ?? name);
      while (objectives.some(x => x.id === id)) id += '-' + (i + 1);
      const label = `Objetivo «${name}»`;
      const m = norm(pick(o, 'metrica', 'métrica', 'metric', 'medida'));
      const metric = ['unidades', 'unidad', 'uds', 'udes', 'units', 'unit'].includes(m) ? 'units'
        : ['importe', 'dinero', 'euros', 'euro', 'eur', '€', 'revenue', 'ventas', 'facturacion', 'facturación', 'valor', 'value', 'money', 'amount', 'pasta'].includes(m) ? 'revenue' : null;
      if (!metric) errors.push(`${label}: la métrica debe ser «unidades» o «importe».`);
      const scope = readScope(pick(o, 'ambito', 'ámbito', 'scope', 'alcance'), o, label);
      let target = toNum(pick(o, 'meta', 'target'));
      if (!(target > 0)) { warnings.push(`${label}: el texto no da la meta (puede ser personal). Ponla tú en este paso.`); target = 0; }
      const p = pick(o, 'pago', 'payout') || {};
      let reward = toNum(pick(p, 'recompensa', 'reward', 'incentivo', 'importe', 'premio'));
      if (!(reward >= 0)) reward = 0;
      const cr = norm(pick(p, 'tipo', 'curve', 'curva'));
      let curve = ['fijo', 'flat', 'plano', 'todo o nada', 'todo_o_nada'].includes(cr) ? 'flat' : ['escalones', 'steps', 'tramos', 'escalonado'].includes(cr) ? 'steps' : 'linear';
      let start = toNum(pick(p, 'desde_pct', 'start_pct', 'desde'));
      if (isFinite(start)) explicitStart.add(id);
      if (!isFinite(start)) start = curve === 'flat' ? 100 : 80;
      start = Math.min(Math.max(start, 0), 200);
      let cap = toNum(pick(p, 'tope_pct', 'cap_pct', 'tope'));
      if (!isFinite(cap)) cap = 100;
      if (cap < 100) { warnings.push(`${label}: el tope no puede ser menor que 100%; lo dejo en 100%.`); cap = 100; }
      let steps = [];
      if (curve === 'steps') {
        steps = readSteps(pick(p, 'escalones', 'steps', 'tramos'));
        if (!steps.length) { warnings.push(`${label}: no hay escalones válidos; uso pago lineal.`); curve = 'linear'; }
        else { start = steps[0].from; cap = Math.max(100, steps[steps.length - 1].from); }
      }
      if (curve === 'flat') cap = 100;
      const pool = pick(o, 'alternativa', 'pool');
      objectives.push({
        id, name, metric, scope, target,
        payout: { curve, reward, start_pct: start, cap_pct: cap, steps },
        requires: arr(pick(o, 'requiere', 'requires')),   // se resuelve abajo
        pool: pool ? slug(String(pool)) : null,
        period: readPeriod(pick(o, 'periodo', 'period'), label)
      });
    });
    const oRef = new Map();
    objectives.forEach(o => { oRef.set(o.id, o.id); oRef.set(slug(o.name), o.id); });
    objectives.forEach(o => {
      const reqs = [];
      o.requires.forEach(r => {
        const ref = r && typeof r === 'object' ? String(pick(r, 'objetivo', 'id', 'objective') ?? '') : String(r);
        const pct = r && typeof r === 'object' ? toNum(pick(r, 'desde_pct', 'pct', 'from_pct')) : NaN;
        const id = oRef.get(slug(ref));
        if (id && id !== o.id) { if (!reqs.some(x => x.id === id)) reqs.push({ id, pct: isFinite(pct) ? pct : null }); }
        else warnings.push(`Objetivo «${o.name}»: «requiere» apunta a «${ref}», que no existe; lo ignoro.`);
      });
      o.requires = reqs;
    });

    // condición: el premio se multiplica según el cumplimiento de uno o varios objetivos (vale el que más cumpla)
    function readCondition(c, label) {
      if (!c || typeof c !== 'object') return null;
      const ids = [];
      strs(pick(c, 'objetivos', 'objectives', 'objetivo', 'objective')).forEach(ref => {
        const id = oRef.get(slug(ref));
        if (id) { if (!ids.includes(id)) ids.push(id); } else warnings.push(`${label}: la condición apunta a «${ref}», que no existe; la ignoro.`);
      });
      const steps = readSteps(pick(c, 'escalones', 'steps'));
      if (!ids.length || !steps.length) { warnings.push(`${label}: la condición no es válida (necesita objetivos y escalones); la ignoro y se paga al 100%.`); return null; }
      return { objectives: ids, steps };
    }

    // incentivos por unidad (desde la primera unidad)
    const unit_incentives = [];
    arr(pick(raw, 'incentivos_por_unidad', 'unit_incentives', 'incentivos_unitarios')).slice(0, 150).forEach((r, i) => {
      if (!r || typeof r !== 'object') return;
      const label = `Incentivo por unidad ${i + 1}` + (pick(r, 'nombre', 'name') ? ` («${String(pick(r, 'nombre', 'name')).trim()}»)` : '');
      const scope = readScope(pick(r, 'ambito', 'ámbito', 'scope'), r, label);
      if (scope.all) { errors.push(`${label}: indica a qué modelos o grupos se aplica.`); return; }
      const md = norm(pick(r, 'modo', 'mode'));
      const tiers = arr(pick(r, 'tramos', 'tiers')).map(x => ({ from: toNum(pick(x, 'desde_unidades', 'from_units', 'desde')), amount: toNum(pick(x, 'importe', 'amount')) }))
        .filter(x => isFinite(x.from) && isFinite(x.amount) && x.amount >= 0).sort((a, b) => a.from - b.from);
      const amounts = arr(pick(r, 'importes', 'amounts', 'importe', 'amount')).map(toNum).filter(n => isFinite(n) && n >= 0);
      const retro = ['retroactivo', 'retro', 'todas', 'todas_las_unidades'].includes(md) || (!amounts.length && tiers.length > 0);
      if (retro && !tiers.length) { errors.push(`${label}: en modo retroactivo faltan los «tramos» (desde cuántas unidades y qué importe por unidad).`); return; }
      if (!retro && !amounts.length) { errors.push(`${label}: faltan los importes por unidad.`); return; }
      unit_incentives.push({
        name: String(pick(r, 'nombre', 'name') ?? '').trim(), scope, mode: retro ? 'retro' : 'progressive', amounts, tiers,
        condition: readCondition(pick(r, 'condicion', 'condición', 'condition'), label),
        period: readPeriod(pick(r, 'periodo', 'period'), label)
      });
    });

    // comisiones sobre el importe vendido
    const commissions = [];
    arr(pick(raw, 'comisiones', 'commissions')).slice(0, 30).forEach((r, i) => {
      if (!r || typeof r !== 'object') return;
      const name = String(pick(r, 'nombre', 'name') ?? '').trim() || ('Comisión ' + (i + 1));
      const percent = toNum(pick(r, 'porcentaje', 'percent', 'pct'));
      if (!(percent > 0)) { errors.push(`Comisión «${name}»: falta el porcentaje.`); return; }
      commissions.push({
        name, scope: readScope(pick(r, 'ambito', 'ámbito', 'scope'), r, `Comisión «${name}»`), percent,
        condition: readCondition(pick(r, 'condicion', 'condición', 'condition'), `Comisión «${name}»`),
        period: readPeriod(pick(r, 'periodo', 'period'), `Comisión «${name}»`)
      });
    });

    // una meta de referencia (sin premio propio) empieza a contar donde empieza la condición que la usa (p. ej. el 90%)
    const refStart = new Map();
    [...unit_incentives, ...commissions].forEach(x => { if (x.condition) x.condition.objectives.forEach(id => { refStart.set(id, Math.min(refStart.has(id) ? refStart.get(id) : Infinity, Math.min(...x.condition.steps.map(s => s.from)))); }); });
    objectives.forEach(o => { if (!(o.payout.reward > 0) && !explicitStart.has(o.id) && refStart.has(o.id)) o.payout.start_pct = refStart.get(o.id); });
    if (!objectives.length && !unit_incentives.length && !commissions.length) errors.push('No encuentro ningún objetivo ni incentivo en el plan.');
    const notes = strs(pick(raw, 'notas', 'notes', 'supuestos', 'dudas')).slice(0, 12).map(x => x.slice(0, 300));
    if (errors.length) return { plan: null, errors, warnings };
    return {
      plan: { v: 2, name: planName, period: planPeriod, brand: String(pick(raw, 'marca', 'brand') ?? '').trim().slice(0, 60), groups, objectives, unit_incentives, commissions, notes },
      errors, warnings
    };
  }

  // ---------- plan antiguo (3 gamas) -> plan estándar ----------
  function fromLegacy(g) {
    const objectives = ['alta', 'media', 'baja'].map(x => ({
      id: x, name: { alta: 'Alta', media: 'Media', baja: 'Baja' }[x], metric: 'units',
      scope: { all: false, groups: [x], models: [] }, target: +g[x] || 0,
      payout: { curve: 'linear', reward: +((g.inc || {})[x]) || 0, start_pct: 80, cap_pct: Math.max(100, +((g.max || {})[x]) || 100), steps: [] },
      requires: [], pool: null, period: null
    }));
    return {
      v: 2, name: '', period: null, brand: '', groups: LEGACY_GROUPS.map(x => ({ ...x, models: [] })), objectives,
      unit_incentives: (g.unit || []).map(r => ({ name: '', scope: { all: false, groups: [], models: [r.model] }, mode: 'progressive', amounts: r.amounts, tiers: [], condition: null, period: null })),
      commissions: [], notes: []
    };
  }

  // ---------- cálculo ----------
  function groupIdsOf(plan, sale) {
    const n = norm(sale.name), gs = plan.groups || [];
    const named = gs.filter(g => (g.models || []).some(m => norm(m) === n));
    if (named.length) return named.map(g => g.id);
    const byGama = gs.filter(g => norm(g.id) === norm(sale.gama)).map(g => g.id);
    if (byGama.length) return byGama;
    return sale.tipo ? gs.filter(g => g.type && g.type === sale.tipo).map(g => g.id) : [];   // sin lista de modelos: por tipo de producto
  }
  function matchesScope(plan, scope, sale) {
    if (!scope || scope.all) return true;
    const n = norm(sale.name);
    if ((scope.models || []).some(m => norm(m) === n)) return true;
    if ((scope.groups || []).length) { const ids = groupIdsOf(plan, sale); if (scope.groups.some(g => ids.includes(g))) return true; }
    return false;
  }
  const unitPay = (amounts, n) => { let t = 0; for (let i = 0; i < n; i++) t += +amounts[Math.min(i, amounts.length - 1)] || 0; return t; };
  const retroRate = (tiers, n) => { let r = 0; tiers.forEach(t => { if (n >= t.from) r = t.amount; }); return r; };
  // % de cumplimiento más alto entre los objetivos de la condición -> qué % del premio se paga
  function conditionFactor(cond, objs) {
    if (!cond) return { factor: 100, pct: null, names: [] };
    const refs = cond.objectives.map(id => objs.find(o => o.id === id)).filter(Boolean);
    if (!refs.length) return { factor: 100, pct: null, names: [] };
    const pct = Math.max(...refs.map(o => o.pct));
    let f = 0; cond.steps.forEach(s => { if (pct + 1e-9 >= s.from) f = s.pays; });
    return { factor: f, pct, names: refs.map(o => o.name) };
  }

  function payFraction(o, pct) {      // % de la recompensa que se cobra con ese cumplimiento
    const p = o.payout, eps = 1e-9;
    if (!(o.target > 0) || pct + eps < p.start_pct) return 0;
    if (p.curve === 'flat') return 100;
    if (p.curve === 'steps') { let f = 0; (p.steps || []).forEach(s => { if (pct + eps >= s.from) f = s.pays; }); return f; }
    return Math.min(pct, p.cap_pct);
  }
  const maxFraction = o => o.payout.curve === 'flat' ? 100 : o.payout.curve === 'steps' ? Math.max(0, ...(o.payout.steps || []).map(s => s.pays)) : o.payout.cap_pct;

  function evaluate(plan, sales) {
    const live = sales.filter(s => s && isFinite(s.qty) && inPeriod(plan.period, s.date));
    const objs = plan.objectives.map(o => {
      const sc = live.filter(s => matchesScope(plan, o.scope, s) && inPeriod(o.period, s.date));
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
        reqs: [], blockedBy: [], poolLoser: false
      };
    });
    // requisitos: solo paga si ya se alcanzó el mínimo (o el % indicado) de los objetivos que se citan
    objs.forEach(o => {
      o.reqs = (o.requires || []).map(rq => {
        const r = objs.find(x => x.id === rq.id); if (!r) return null;
        const need = rq.pct == null ? r.payout.start_pct : rq.pct;
        return { id: r.id, name: r.name, need, ok: rq.pct == null ? r.reached : (r.target > 0 && r.pct + 1e-9 >= rq.pct) };
      }).filter(Boolean);
      o.blockedBy = o.reqs.filter(r => !r.ok);
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
      const sc = live.filter(s => matchesScope(plan, r.scope, s) && inPeriod(r.period, s.date));
      const n = Math.max(0, sc.reduce((a, s) => a + s.qty, 0));
      let base, nextBase;
      if (r.mode === 'retro') {
        base = n * retroRate(r.tiers, n);
        nextBase = (n + 1) * retroRate(r.tiers, n + 1) - base;
      } else {
        base = unitPay(r.amounts, n);
        nextBase = +r.amounts[Math.min(n, r.amounts.length - 1)] || 0;
      }
      const cf = conditionFactor(r.condition, objs);
      const label = r.name || [...(r.scope.models || []), ...(r.scope.groups || []).map(id => (plan.groups.find(g => g.id === id) || { name: id }).name)].join(', ');
      return { label, rule: r, n, base, factor: cf.factor, condPct: cf.pct, condNames: cf.names, pay: base * cf.factor / 100, next: nextBase * cf.factor / 100 };
    });
    // comisiones
    const comRows = (plan.commissions || []).map(c => {
      const sc = live.filter(s => matchesScope(plan, c.scope, s) && inPeriod(c.period, s.date));
      const revenue = Math.max(0, sc.reduce((a, s) => a + (+s.amount || 0), 0));
      const cf = conditionFactor(c.condition, objs);
      return { name: c.name, percent: c.percent, revenue, factor: cf.factor, pay: revenue * c.percent / 100 * cf.factor / 100, missing: sc.filter(s => s.qty > 0 && !(+s.amount > 0)).length };
    });
    const units = unitRows.reduce((a, r) => a + r.pay, 0), commissions = comRows.reduce((a, r) => a + r.pay, 0);
    return {
      objectives: objs, unitRows, comRows, units, commissions, objectivesTotal, objectivesMax,
      total: objectivesTotal + units + commissions,
      hasRevenue: plan.objectives.some(o => o.metric === 'revenue') || (plan.commissions || []).length > 0
    };
  }
  // varios planes en un mismo mes (p. ej. el mensual y uno por semana): cada uno con sus fechas; se suma todo
  // `sales` son las ventas del periodo del mes; un plan con fechas propias mira TODAS las ventas (`allSales`) dentro de sus fechas
  function evaluateAll(plans, sales, allSales) {
    const entries = plans.map(plan => ({ plan, ev: evaluate(plan, plan.period && allSales ? allSales : sales) }));
    const sum = k => entries.reduce((a, e) => a + e.ev[k], 0);
    return { entries, objectivesTotal: sum('objectivesTotal'), objectivesMax: sum('objectivesMax'), units: sum('units'), commissions: sum('commissions'), total: sum('total'), hasRevenue: entries.some(e => e.ev.hasRevenue) };
  }

  // ---------- explicar el plan con palabras ----------
  function scopeText(plan, scope) {
    if (!scope || scope.all) return 'en todos los productos';
    const names = [...(scope.groups || []).map(id => (plan.groups.find(g => g.id === id) || { name: id }).name), ...(scope.models || [])];
    return 'en ' + (names.length > 6 ? names.slice(0, 6).join(', ') + '…' : names.join(', '));
  }
  function condText(plan, c) {
    const names = c.objectives.map(id => '«' + (plan.objectives.find(x => x.id === id) || { name: id }).name + '»');
    return `Se paga según tu cumplimiento de ${names.join(' o ')} (vale el que más cumplas): ` + c.steps.map(s => `desde el ${s.from}% cobras el ${s.pays}%`).join('; ') + '; por debajo, nada.';
  }
  function describePlan(plan) {
    const lines = [];
    if (plan.name || plan.period) lines.push(`Plan${plan.name ? ' «' + plan.name + '»' : ''}${plan.period ? ' — solo cuentan las ventas ' + periodText(plan.period) : ''}.`);
    plan.objectives.forEach(o => {
      const p = o.payout;
      const meta = o.metric === 'revenue' ? `vender ${eur0(o.target)}` : `vender ${fmtV('units', o.target)} uds.`;
      let pay;
      if (!(p.reward > 0)) pay = 'Es una meta de seguimiento: no tiene pago asociado (si otros premios dependen de ella, se aplican en su apartado).';
      else if (p.curve === 'flat') pay = `Cobras ${eur(p.reward)} en cuanto llegas al ${p.start_pct}% de la meta.`;
      else if (p.curve === 'steps') pay = `Escalones sobre ${eur(p.reward)}: ` + p.steps.map(s => `desde el ${s.from}% cobras el ${s.pays}%`).join('; ') + '.';
      else pay = `Desde el ${p.start_pct}% de la meta cobras tu porcentaje de ${eur(p.reward)} (al 100%: ${eur(p.reward)}${p.cap_pct > 100 ? `; sigue hasta el ${p.cap_pct}%: ${eur(p.reward * p.cap_pct / 100)}` : ''}); por debajo del ${p.start_pct}%, nada.`;
      let extra = '';
      if (o.requires.length) extra += ` Solo cobras si llegas a: ${o.requires.map(r => `${r.pct == null ? 'el mínimo' : 'el ' + r.pct + '%'} de «${(plan.objectives.find(x => x.id === r.id) || { name: r.id }).name}»`).join(', ')}.`;
      if (o.pool) extra += ` Alternativa ${o.pool.toUpperCase()}: de los objetivos con la misma alternativa solo cuenta el que más paga.`;
      if (o.period) extra += ` Cuentan las ventas ${periodText(o.period)}.`;
      lines.push(`${o.name}: ${meta} ${scopeText(plan, o.scope)}. ${pay}${extra}`);
    });
    (plan.unit_incentives || []).forEach(r => {
      const label = r.name || [...(r.scope.models || []), ...(r.scope.groups || []).map(id => (plan.groups.find(g => g.id === id) || { name: id }).name)].join(', ');
      let pay;
      if (r.mode === 'retro') pay = 'Importe por unidad según el total vendido (se aplica a TODAS las unidades): ' + r.tiers.map(t => `desde ${t.from} uds. → ${eur(t.amount)}`).join('; ') + '.';
      else pay = r.amounts.length > 1 ? r.amounts.map(eur).join(' → ') + ' (el último importe se repite), desde la primera unidad.' : `${eur(r.amounts[0])} por cada unidad, desde la primera.`;
      lines.push(`Por unidad — ${label}: ${pay}${r.condition ? ' ' + condText(plan, r.condition) : ''}${r.period ? ` Cuentan las ventas ${periodText(r.period)}.` : ''}`);
    });
    (plan.commissions || []).forEach(c => lines.push(`Comisión — ${c.name}: ${String(c.percent).replace('.', ',')}% de lo vendido ${scopeText(plan, c.scope)}.${c.condition ? ' ' + condText(plan, c.condition) : ''}`));
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
  const EXAMPLE_C = {
    version: 1, marca: 'Ejemplo C (premio por modelo según cumplimiento)', nombre: 'Política de julio', periodo: { desde: '2026-07-01', hasta: '2026-07-31' },
    objetivos: [
      { id: 'uds', nombre: 'Meta en unidades', metrica: 'unidades', ambito: { todo: true }, meta: 0 },
      { id: 'valor', nombre: 'Meta en valor', metrica: 'importe', ambito: { todo: true }, meta: 0 }
    ],
    incentivos_por_unidad: [
      { nombre: 'Modelo A', modelos: ['Modelo A'], importes: [50], condicion: { objetivos: ['uds', 'valor'], escalones: [{ desde_pct: 90, paga_pct: 60 }, { desde_pct: 100, paga_pct: 100 }] } },
      { nombre: 'Modelo B (campaña: doble desde el 100%)', modelos: ['Modelo B'], importes: [7], condicion: { objetivos: ['uds', 'valor'], escalones: [{ desde_pct: 90, paga_pct: 60 }, { desde_pct: 100, paga_pct: 200 }] } },
      { nombre: 'Auriculares', modelos: ['Auricular 1', 'Auricular 2'], modo: 'retroactivo', tramos: [{ desde_unidades: 1, importe: 1.5 }, { desde_unidades: 10, importe: 2.5 }] }
    ],
    notas: ['El texto no da las metas (son personales): las dejé en 0 para que las ponga el usuario.', 'La política de «estrellas» depende de otro departamento y no se puede calcular: no la incluí.']
  };
  const EXAMPLE_D = {
    version: 1, marca: 'Ejemplo D (plan semanal)', nombre: 'Semana del 9 al 15 de noviembre', periodo: { desde: '2026-11-09', hasta: '2026-11-15' },
    incentivos_por_unidad: [{ modelos: ['Modelo K1'], importes: [6] }, { modelos: ['Modelo K2'], importes: [9] }]
  };

  const EXAMPLE_E = {
    version: 1, marca: 'Ejemplo E (objetivos separados por categoría de producto)',
    grupos: [
      { id: 'moviles', nombre: 'Móviles', modelos: ['Phone X1', 'Phone X2', 'Phone Lite'] },
      { id: 'tablets', nombre: 'Tablets', modelos: ['Pad Z1', 'Pad Z2'] },
      { id: 'relojes', nombre: 'Relojes', modelos: ['Watch W1', 'Band B2'] },
      { id: 'portatiles', nombre: 'Portátiles', modelos: ['Book N14'] }
    ],
    objetivos: [
      { id: 'moviles', nombre: 'Móviles', metrica: 'importe', ambito: { grupos: ['moviles'] }, meta: 20000, pago: { tipo: 'lineal', recompensa: 300, desde_pct: 80, tope_pct: 120 } },
      { id: 'tablets', nombre: 'Tablets', metrica: 'unidades', ambito: { grupos: ['tablets'] }, meta: 12, pago: { tipo: 'lineal', recompensa: 150, desde_pct: 80, tope_pct: 120 } },
      { id: 'relojes', nombre: 'Relojes', metrica: 'unidades', ambito: { grupos: ['relojes'] }, meta: 10, pago: { tipo: 'fijo', recompensa: 100, desde_pct: 100 } },
      { id: 'portatiles', nombre: 'Portátiles', metrica: 'importe', ambito: { grupos: ['portatiles'] }, meta: 8000, pago: { tipo: 'lineal', recompensa: 200, desde_pct: 80, tope_pct: 100 } }
    ],
    notas: ['El texto no indica la categoría de «Pad Z2»: lo puse en Tablets por el nombre.', 'Los modelos de cada categoría son solo los que cita el texto.']
  };

  const EXAMPLE_F = {
    version: 1, marca: 'Ejemplo F (metas en dinero por categoría y unidades por semana, sin esquema de pago)', nombre: 'Target del mes (semanas W45–W48)', periodo: { desde: '2026-11-02', hasta: '2026-11-29' },
    grupos: [{ id: 'hhp', nombre: 'HHP (móviles)', tipo: 'moviles', modelos: [] }, { id: 'tab', nombre: 'Tab', tipo: 'tablets', modelos: [] }, { id: 'wearables', nombre: 'Wearables', tipo: 'relojes', modelos: [] }],
    objetivos: [
      { id: 'hhp', nombre: 'Importe HHP', metrica: 'importe', ambito: { grupos: ['hhp'] }, meta: 338113.08 },
      { id: 'tab', nombre: 'Importe Tab', metrica: 'importe', ambito: { grupos: ['tab'] }, meta: 52970.4 },
      { id: 'wearables', nombre: 'Importe Wearables', metrica: 'importe', ambito: { grupos: ['wearables'] }, meta: 32138.1 },
      { id: 'w45', nombre: 'Semana 45', metrica: 'unidades', ambito: { todo: true }, meta: 58, periodo: { desde: '2026-11-02', hasta: '2026-11-08' } },
      { id: 'w46', nombre: 'Semana 46', metrica: 'unidades', ambito: { todo: true }, meta: 60, periodo: { desde: '2026-11-09', hasta: '2026-11-15' } },
      { id: 'mes', nombre: 'Total mes (unidades)', metrica: 'unidades', ambito: { todo: true }, meta: 416 }
    ],
    notas: ['El texto da las metas pero no cuánto se cobra («el esquema de pago está en tu mail»): las dejo como metas de seguimiento, sin pago.', 'Importes en $ en el texto: los pongo como número sin convertir moneda.', 'Condiciones como asistencia, uniforme o mystery shopper no se calculan en la app.']
  };
  // semanas ISO del año (lunes a domingo): la W1 es la que contiene el 4 de enero
  const isoDate = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  function isoWeek(year, n) {
    const j4 = new Date(Date.UTC(year, 0, 4)), dow = (j4.getUTCDay() + 6) % 7;
    const mon = new Date(j4.getTime() + ((n - 1) * 7 - dow) * 864e5), sun = new Date(mon.getTime() + 6 * 864e5);
    return { from: isoDate(mon), to: isoDate(sun) };
  }
  function weekTable(today) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(today || ''), now = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date();
    const yr = now.getUTCFullYear(), w1 = isoWeek(yr, 1);
    const cur = Math.max(1, Math.floor((now - new Date(w1.from + 'T00:00:00Z')) / (7 * 864e5)) + 1);
    const rows = []; for (let n = Math.max(1, cur - 6); n <= Math.min(53, cur + 8); n++) { const w = isoWeek(yr, n); rows.push(`W${n} = ${w.from} a ${w.to}`); }
    return `SEMANAS ISO DE ${yr} (lunes a domingo; W1 empieza el ${w1.from}, cada semana siguiente suma 7 días). Úsalas si el texto habla de W/S/semana + número:\n` + rows.join('; ');
  }
  function buildPrompt(opts) {
    const o = opts || {};
    const models = (o.models || []).slice(0, 80);
    const J = x => JSON.stringify(x, null, 1);
    return [
      'TAREA: convierte el texto de objetivos e incentivos que hay AL FINAL de este mensaje en un JSON con el formato de abajo. Es para mi app "Ventas del mes", que lo lee automáticamente.',
      '',
      'REGLAS ESTRICTAS (léelas antes de empezar)',
      '1. Responde DE UNA VEZ. NO me hagas preguntas, ni una. Si algo es ambiguo o falta un dato, elige la interpretación más razonable y apúntala en el campo "notas" (una frase corta por cada suposición).',
      '2. Tu respuesta debe ser SOLO un único bloque de código ```json con el JSON. Nada de texto antes ni después, ni explicaciones, ni saludos.',
      '3. No inventes cifras. Usa solo números que aparezcan en el texto. Si la meta de un objetivo no aparece (suele ser personal), pon "meta": 0 y anótalo en "notas": el usuario la pondrá en la app. Si el texto da las metas pero NO cuánto se cobra (p. ej. «el esquema de pago lo tienes en tu mail»), escribe los objetivos SIN "pago" (son metas de seguimiento) y anótalo en "notas"; no inventes premios.',
      '4. Si el texto mezcla varias marcas, meses o programas, usa solo lo que corresponda al mes indicado abajo y a un comercial de tienda. Ignora lo demás (condiciones legales, saludos…). Lo que dependa de otros departamentos o que no se pueda calcular (p. ej. «estrellas», asistencia) no lo incluyas: anótalo en "notas".',
      '5. Números sin símbolo ni separador de miles (40000, no "40.000 €"). Porcentajes sin el símbolo %.',
      '6. PERIODO: si el texto indica en qué fechas cuentan los objetivos (p. ej. «del 6 de octubre al 2 de noviembre», «mes de 5 semanas», «cierra el día 3», una semana, una quincena, una campaña), pon "periodo" con fechas AAAA-MM-DD; la app solo contará las ventas de esas fechas. Deduce el año con el MES y la fecha de hoy que te doy abajo. Si pone «esta semana», resuélvela con esa fecha (semana = lunes a domingo). Si el texto NO indica periodo, NO pongas "periodo": se usará el mes natural (del día 1 al último). SEMANAS: si las metas vienen por semana («W45», «S45», «semana 46»…), son semanas ISO (lunes a domingo): usa la tabla de semanas que te doy más abajo y haz UN objetivo por semana con su "periodo" (desde el lunes hasta el domingo). Si el texto define el mes como esas semanas (p. ej. W45–W48 y «Total mes»), pon además el "periodo" del plan desde el lunes de la primera semana hasta el domingo de la última, y el objetivo del total del mes sin periodo propio.',
      '7. MODELOS Y CATEGORÍAS: saca los modelos DEL TEXTO. Usa SOLO modelos que aparezcan en el texto: NUNCA añadas modelos de memoria, de otra marca ni de ningún ejemplo de este mensaje. Si hay objetivos por categoría (móviles, tablets, relojes o wearables, portátiles, auriculares, TV, accesorios…), crea un grupo por cada categoría y coloca en su "modelos" TODOS los modelos que cite el texto, cada uno en la categoría que le corresponda según el tipo de producto (usa lo que sepas del producto: «Pad/Tab» = tablet, «Watch/Band/Fit» = reloj o pulsera, «Book/Laptop» = portátil, «Buds/TWS» = auriculares, un teléfono = móvil…). Si el texto ya trae una tabla modelo → categoría, respétala tal cual. Si no sabes a qué categoría pertenece un modelo, déjalo fuera de los grupos y apúntalo en "notas". Si el texto NO lista modelos (solo da metas por categoría, p. ej. «HHP», «Tab», «Wearables»), crea igualmente el grupo con "modelos": [] y su "tipo": la app repartirá las ventas por tipo de producto sola. Traduce siglas: HHP = teléfonos móviles ("moviles"), Tab/Tablets = "tablets", Wearables/IoT = "relojes".',
      '8. DINERO: las cantidades en dinero van solo como número aunque el texto use $, £ o €; no conviertas moneda. Si el texto no usa € anótalo en "notas" (la app muestra €).',
      '',
      'FORMATO DEL JSON (todos los campos salvo "objetivos" o "incentivos_por_unidad" son opcionales)',
      '{',
      '  "version": 1,',
      '  "marca": "texto", "nombre": "nombre corto del plan, p. ej. Semana 9-15 nov",',
      '  "periodo": { "desde": "2026-11-09", "hasta": "2026-11-15" },',
      '  "grupos": [ { "id": "alta", "nombre": "Gama Alta", "tipo": "moviles" | "tablets" | "relojes" | "portatiles" | "auriculares" | "tv" | "accesorios" (opcional), "modelos": ["nombre exacto del modelo", "..."] } ],',
      '  "objetivos": [ {',
      '    "id": "alta", "nombre": "Gama Alta",',
      '    "metrica": "unidades" | "importe",',
      '    "ambito": { "grupos": ["alta"] }  |  { "modelos": ["..."] }  |  { "todo": true },',
      '    "meta": 30,',
      '    "pago": { "tipo": "lineal" | "fijo" | "escalones", "recompensa": 400, "desde_pct": 80, "tope_pct": 140,',
      '              "escalones": [ { "desde_pct": 80, "paga_pct": 80 }, { "desde_pct": 100, "paga_pct": 100 } ] },',
      '    "requiere": ["id de otro objetivo"]  |  [ { "objetivo": "id", "desde_pct": 100 } ],',
      '    "alternativa": "A"',
      '  } ],',
      '  "incentivos_por_unidad": [ {',
      '    "nombre": "texto", "modelos": ["Modelo X"], "importes": [50, 70, 100],',
      '    "modo": "retroactivo", "tramos": [ { "desde_unidades": 1, "importe": 1.5 }, { "desde_unidades": 10, "importe": 2.5 } ],',
      '    "condicion": { "objetivos": ["id1", "id2"], "escalones": [ { "desde_pct": 90, "paga_pct": 60 }, { "desde_pct": 100, "paga_pct": 100 } ] }',
      '  } ],',
      '  "comisiones": [ { "nombre": "…", "ambito": { "grupos": ["…"] }, "porcentaje": 2 } ],',
      '  "notas": ["suposiciones o dudas, una frase cada una"]',
      '}',
      '',
      'CÓMO DECIDIR CADA CAMPO',
      '- metrica: "unidades" si la meta es un número de aparatos (sell-out en unidades); "importe" si la meta es dinero vendido (€, sell-out en valor, facturación).',
      '- ambito: qué ventas cuentan. Una categoría o gama → { "grupos": [id] }; modelos concretos → { "modelos": [...] }; todo lo vendido → { "todo": true }.',
      '- grupos: las categorías o gamas del texto (alta/media/entrada, móviles/wearables/tablets…). En "modelos" pon los nombres exactos que cite el texto. Si no hay lista, deja "modelos": [] y pon "tipo" cuando la categoría sea un tipo de producto.',
      '- meta: el número a alcanzar (unidades o euros). Una meta que solo sirve para calcular otros premios se escribe como objetivo SIN "pago".',
      '- pago.recompensa: los € que se cobran al llegar al 100% de la meta (o el premio total si es todo-o-nada).',
      '- pago.desde_pct: % mínimo de la meta para empezar a cobrar ("a partir del 80%"). Si no se dice: 80 en lineal y escalones; 100 en fijo.',
      '- pago.tipo: "lineal" = cobras tu % de cumplimiento × recompensa (90% de la meta → 90% del premio) hasta "tope_pct". "fijo" = cobras todo el premio en cuanto llegas a "desde_pct". "escalones" = una tabla de tramos (desde qué % y qué % del premio se paga; puede pasar del 100%).',
      '- pago.tope_pct: máximo % de cumplimiento que se paga ("hasta el 140%"). Si no hay tope: 100.',
      '- Objetivos independientes se SUMAN. Si el texto dice "uno de los dos", "el mayor", "o bien", "no acumulable" → ponles la misma letra en "alternativa".',
      '- requiere: un premio que solo se cobra cuando antes se ha alcanzado otro objetivo. Con un id se exige llegar a su mínimo; con { "objetivo", "desde_pct" } se exige ese %.',
      '- incentivos_por_unidad: premios por cada unidad vendida, desde la primera. Un elemento por modelo (o por grupo de modelos con el mismo importe). "importes" en orden (1.ª, 2.ª, 3.ª unidad…); el último importe se repite para las siguientes. Si solo pagan a partir de la unidad N, pon ceros en las N-1 primeras (a partir de la 11.ª cobras 15 €: [0,0,0,0,0,0,0,0,0,0,15]).',
      '- modo "retroactivo" + tramos: el importe por unidad depende del TOTAL vendido y se aplica a TODAS las unidades (ej. 1,5 € por unidad, pero 2,5 € por todas si vendes 10 o más). Cuando uses "retroactivo" no pongas "importes".',
      '- condicion (en incentivos por unidad y en comisiones): el premio se multiplica según el cumplimiento de uno o varios objetivos (vale el que más cumplas). "paga_pct" es el % del premio que se cobra: menos del primer escalón = 0. Ej.: «menos del 90% nada; 90-99% el 60%; 100% o más el 100%» → escalones 90→60 y 100→100. Un «incentivo doble» a partir del 100% se escribe con paga_pct 200 en ese escalón.',
      '- Si el texto dice que la meta puede alcanzarse «en unidades O en valor», crea DOS objetivos (uno de cada métrica, sin pago) y pon los dos en "condicion.objetivos".',
      '- comisiones: un % sobre el dinero vendido de ese ámbito.',
      '- Los "id" van en minúsculas, sin espacios ni tildes y sin repetirse.',
      '- Si algo del texto NO cabe en este formato, hazlo encajar lo mejor posible y describe en "notas" lo que no has podido reflejar.',
      '',
      'EJEMPLO A (objetivos en unidades por gamas, con incentivos por unidad):',
      J(EXAMPLE_A),
      '',
      'EJEMPLO B (objetivos en dinero, categorías, alternativa, requisito, comisión y notas):',
      J(EXAMPLE_B),
      '',
      'EJEMPLO C (premio por modelo que depende del cumplimiento, campaña doble, tramos retroactivos y metas personales sin dato):',
      J(EXAMPLE_C),
      '',
      'EJEMPLO D (plan de una sola semana; solo cuentan las ventas de esas fechas):',
      J(EXAMPLE_D),
      '',
      'EJEMPLO E (una marca con objetivos separados por categoría: cada modelo del texto va en su categoría):',
      J(EXAMPLE_E),
      '',
      'EJEMPLO F (metas por categoría sin lista de modelos, metas semanales y sin esquema de pago):',
      J(EXAMPLE_F),
      '',
      weekTable(o.today),
      'MES: ' + (o.monthLabel || ''),
      'HOY ES: ' + (o.today || ''),
      models.length
        ? 'MODELOS QUE YA TENGO REGISTRADOS EN LA APP (solo para que escribas exactamente igual su nombre si aparecen en el texto; NO añadas ninguno que no esté en el texto): ' + models.join(', ')
        : 'MODELOS YA REGISTRADOS EN LA APP: ninguno. Extrae todos los modelos del texto.',
      '',
      'RECUERDA: responde ya, sin preguntas, solo con el bloque ```json.',
      '',
      'TEXTO DE OBJETIVOS E INCENTIVOS (empieza justo debajo de esta línea):',
      ''
    ].join('\n');
  }

  const api = { LEGACY_GROUPS, normalizePlan, extractJson, fromLegacy, evaluate, evaluateAll, describePlan, buildPrompt, matchesScope, groupIdsOf, payFraction, inPeriod, periodText, norm, slug, eur, eur0, fmtV, EXAMPLE_A, EXAMPLE_B, EXAMPLE_C, EXAMPLE_D, EXAMPLE_E, EXAMPLE_F, isoWeek, inferType };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Plan = api;
})(typeof window !== 'undefined' ? window : globalThis);
