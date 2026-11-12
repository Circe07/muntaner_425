// Reporte del día para pegar en WhatsApp: ventas agrupadas por tipo de producto (móviles, tablets, relojes…).
// Sin dependencias de pantalla: se prueba en Node (vm) y se usa en el navegador (window.Report).
(function (root) {
  'use strict';

  const TYPES = [
    { key: 'moviles', label: 'Móviles', emoji: '📱' },
    { key: 'tablets', label: 'Tablets', emoji: '📲' },
    { key: 'relojes', label: 'Relojes', emoji: '⌚' },
    { key: 'portatiles', label: 'Portátiles', emoji: '💻' },
    { key: 'auriculares', label: 'Auriculares', emoji: '🎧' },
    { key: 'tv', label: 'TV', emoji: '📺' },
    { key: 'accesorios', label: 'Accesorios', emoji: '🔌' },
    { key: 'otros', label: 'Otros', emoji: '📦' }
  ];
  const typeOf = key => TYPES.find(t => t.key === key) || TYPES[TYPES.length - 1];

  const norm = s => String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Pistas por nombre. Se miran en orden: lo primero que encaja gana.
  const RULES = [
    // el número puede ir pegado a la palabra (Book4, Buds3, Band9, Pad2, MatePad, MagicBook…)
    ['tablets', /\b(\w*pad\d*|tab\d*|tablets?)\b/],
    ['relojes', /\b(\w*watch\d*|watches|relojes?|band\d*|fit\d*|wearables?|pulseras?)\b/],
    ['portatiles', /\b(\w*book\d*|laptops?|notebook|portatiles?|ordenadores?)\b/],
    ['auriculares', /\b(\w*buds\d*|tws|airpods|auriculares?|earbuds|headphones?)\b/],
    ['tv', /\b(tv|televisor|televisores|television|televisiones)\b/],
    ['accesorios', /\b(charger|cargador|cargadores|cable|cables|funda|fundas|cover|adaptador|powerbank|accesorio|accesorios)\b/],
    ['moviles', /\b(movil|moviles|smartphone|smartphones|telefono|telefonos|phone|phones)\b/]
  ];
  const typeFromText = text => { const n = norm(text); if (!n) return null; for (const [k, re] of RULES) if (re.test(n)) return k; return null; };

  // 1) el tipo que haya elegido la persona; 2) el nombre de su categoría si es un tipo de producto; 3) pistas del nombre del modelo; 4) móvil
  function deviceType(name, groupName, override) {
    if (override && TYPES.some(t => t.key === override)) return override;
    return typeFromText(groupName) || typeFromText(name) || 'moviles';
  }

  const eur0 = n => Math.round(n).toLocaleString('es-ES') + ' €';
  const dmy = d => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const uds = n => `${n} ${Math.abs(n) === 1 ? 'ud.' : 'uds.'}`;

  // o: { date:'AAAA-MM-DD', to?:'AAAA-MM-DD' (si se pone, reporte de varios días), monthFrom?:'AAAA-MM-DD' (inicio del periodo del mes),
  //      sales:[...], typeOf(sale)->clave, title, emoji, withMonth }
  function build(o) {
    const end = o.to && o.to > o.date ? o.to : o.date, multi = end !== o.date;
    const from = o.monthFrom || o.date.slice(0, 7) + '-01';
    const day = o.sales.filter(s => s && s.date >= o.date && s.date <= end && isFinite(s.qty));
    const cats = new Map();
    day.forEach(s => {
      const k = o.typeOf(s);
      if (!cats.has(k)) cats.set(k, { qty: 0, amount: 0, models: new Map() });
      const c = cats.get(k), m = c.models.get(s.name) || { qty: 0 };
      m.qty += s.qty; c.models.set(s.name, m);
      c.qty += s.qty; c.amount += +s.amount || 0;
    });
    const monthByType = {};
    if (o.withMonth) o.sales.forEach(s => { if (s && s.date && s.date >= from && s.date <= end && isFinite(s.qty)) { const k = o.typeOf(s); monthByType[k] = (monthByType[k] || 0) + s.qty; } });

    const lines = [multi ? `*Reporte del ${dmy(o.date)} al ${dmy(end)}*` : `*Reporte del día ${dmy(o.date)}*`];
    if (o.title) lines.push(o.title);
    lines.push('');
    let total = 0, shown = 0;
    TYPES.forEach(t => {
      const c = cats.get(t.key); if (!c) return;
      const models = [...c.models.entries()].filter(([, m]) => m.qty !== 0).sort((a, b) => b[1].qty - a[1].qty || a[0].localeCompare(b[0]));
      if (!models.length) return;
      shown++; total += c.qty;
      lines.push(`${o.emoji ? t.emoji + ' ' : ''}*${t.label} — ${uds(c.qty)}*${c.amount > 0 ? ' · ' + eur0(c.amount) : ''}${o.withMonth ? ` (mes: ${monthByType[t.key] || 0})` : ''}`);
      models.forEach(([name, m]) => lines.push(`| ${name}: ${m.qty}${m.qty < 0 ? ' (devolución)' : ''}`));
      lines.push('');
    });
    if (!shown) return { empty: true, text: '', total: 0 };
    const monthTotal = Object.values(monthByType).reduce((a, b) => a + b, 0);
    lines.push(`*Total ${multi ? 'del periodo' : 'del día'}: ${uds(total)}*${o.withMonth ? ` — acumulado del mes: ${uds(monthTotal)}` : ''}`);
    return { empty: false, text: lines.join('\n'), total };
  }

  const api = { TYPES, typeOf, deviceType, typeFromText, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Report = api;
})(typeof window !== 'undefined' ? window : globalThis);
