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
    ['moviles', /\b(movil|moviles|smartphone|smartphones|telefono|telefonos|phone|phones|hhp|handheld)\b/]
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

  // Formato "estilo tienda": el reporte diario que se manda por WhatsApp al grupo.
  //   *Tienda* / *fecha* / *Total Marca:N* / «Telefonía:» y «Tablets:» siempre (aunque estén vacías) con líneas "cantidad-modelo",
  //   otras categorías solo si hay ventas, «Sin stock:» (texto), «Devoluciones:» (aparte, sin restar) y «Feedback del día:» (texto).
  // o: { date, to?, sales, typeOf(sale)->clave, nameOf(sale)->nombre a mostrar, title, brand, stock, feedback }
  const SHOP_LABEL = { moviles: 'Telefonía', tablets: 'Tablets', relojes: 'Relojes', portatiles: 'Portátiles', auriculares: 'Auriculares', tv: 'TV', accesorios: 'Accesorios', otros: 'Otros' };
  function buildStore(o) {
    const end = o.to && o.to > o.date ? o.to : o.date, multi = end !== o.date;
    const day = o.sales.filter(s => s && s.date >= o.date && s.date <= end && isFinite(s.qty));
    const nameOf = o.nameOf || (s => s.name);
    const sold = new Map(), back = [];                    // vendidas por tipo -> modelos (en orden de venta) | devueltas
    const backMap = new Map();
    let total = 0;
    day.forEach(s => {
      const name = nameOf(s);
      if (s.qty > 0) {
        const k = o.typeOf(s);
        if (!sold.has(k)) sold.set(k, new Map());
        const m = sold.get(k); m.set(name, (m.get(name) || 0) + s.qty); total += s.qty;
      } else if (s.qty < 0) backMap.set(name, (backMap.get(name) || 0) + Math.abs(s.qty));
    });
    const brand = (o.brand || '').trim();
    const L = [];
    if ((o.title || '').trim()) L.push(`*${o.title.trim()}*`);
    L.push(`*${multi ? dmy(o.date) + ' al ' + dmy(end) : dmy(o.date)}*`, '', '', `*Total${brand ? ' ' + brand : ''}:${total}*`, '');
    TYPES.forEach(t => {
      const items = sold.get(t.key);
      if (!items && t.key !== 'moviles' && t.key !== 'tablets') return;       // Telefonía y Tablets salen siempre
      L.push(`${SHOP_LABEL[t.key]}: ${items ? [...items.values()].reduce((a, q) => a + q, 0) : 0}`);   // unidades de la categoría
      if (items) [...items.entries()].sort((a, b) => b[1] - a[1]).forEach(([name, q]) => L.push(`${q}-${name}`));
      L.push('');
    });
    L.push('Sin stock:'); if ((o.stock || '').trim()) L.push(o.stock.trim()); L.push('');
    L.push('Devoluciones:'); [...backMap.entries()].forEach(([name, q]) => L.push(`${q}-${name}`)); L.push('', '');
    L.push('Feedback del día:'); if ((o.feedback || '').trim()) L.push(o.feedback.trim());
    return { empty: false, text: L.join('\n'), total };
  }

  const api = { TYPES, SHOP_LABEL, typeOf, deviceType, typeFromText, build, buildStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Report = api;
})(typeof window !== 'undefined' ? window : globalThis);
