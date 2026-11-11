/* Boom Meat ERP — opening balances */
(function () {
'use strict';
const U = window.UI, E = U.E, S = U.S;
const { esc, fm, kgf, packName, toG, toP, toI, ic, PAGES, ACTS, page, modal, run, toast, val, table, df } = U;

/* ========== OPENING BALANCES ========== */
const OB = { date: null, cash: '', bank: '', instapay: '', assets: [], stock: [], cust: [], sup: [] };
const ASSET_ACCS = [['1501', 'آلات ومعدات الإنتاج'], ['1502', 'معدات التبريد والتجميد'], ['1503', 'السيارات'], ['1504', 'أجهزة وأثاث']];
function obLines() {
  const P = v => toP(v || '0') || 0;
  const stock = OB.stock.filter(r => r.itemId && r.qty).map(r => {
    const it = E.item(r.itemId), isP = it.cat === 'product';
    const qty = isP ? (toI(r.qty) || 0) * (+r.pack) : it.unit === 'kg' ? toG(r.qty) : toI(r.qty);
    return { itemId: it.id, qty, unitCost: P(r.cost), expDate: r.exp, packSize: isP ? +r.pack : null, wh: r.wh || '' };
  });
  return {
    date: OB.date, cash: P(OB.cash), bank: P(OB.bank), instapay: P(OB.instapay),
    assets: OB.assets.filter(r => r.name && r.value).map(r => ({ name: r.name, acc: r.acc || '1501', value: P(r.value), rate: toI(r.rate || '0') || 0 })),
    stock,
    customers: OB.cust.filter(r => r.id && r.amount).map(r => ({ id: r.id, amount: P(r.amount) })),
    suppliers: OB.sup.filter(r => r.id && r.amount).map(r => ({ id: r.id, amount: P(r.amount) })),
  };
}
function obSummary() {
  let d, ok = true; try { d = obLines(); } catch (e) { ok = false; }
  if (!ok) return '';
  const stockV = d.stock.reduce((s, x) => { const it = E.item(x.itemId); return s + (x.qty && x.unitCost ? E.mulDiv(x.qty, x.unitCost, it.unit === 'kg' ? 1000 : 1) : 0); }, 0);
  const assets = d.cash + d.bank + d.instapay + d.assets.reduce((s, a) => s + a.value, 0) + stockV + d.customers.reduce((s, c) => s + c.amount, 0);
  const liab = d.suppliers.reduce((s, c) => s + c.amount, 0);
  return `<div><small>إجمالي الأصول</small><b>${fm(assets)}</b></div><div><small>على الشركة للموردين</small><b>${fm(liab)}</b></div><div style="background:var(--red-soft)"><small>رأس المال (الفرق)</small><b>${fm(assets - liab)}</b></div>`;
}
PAGES.opening = () => {
  const s = S(); if (!OB.date) OB.date = E.today();
  const done = s.docs.openings || [];
  const itemsOpt = sel => s.items.filter(i => i.cat !== 'byproduct').map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)} · ${esc(i.code)}</option>`).join('');
  const pOpt = (type, sel) => s.partners.filter(p => p.type === type).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const row = (k, i, inner) => `<div class="fgrid" style="align-items:end;border-bottom:1px dashed var(--line);padding-bottom:10px">${inner}<div><button class="btn sm dan" data-act="ob-del" data-arg="${k}:${i}">حذف</button></div></div>`;
  const inp = (k, i, f, v, attrs = '') => `<input class="f ob" data-k="${k}" data-i="${i}" data-f="${f}" value="${esc(v || '')}" ${attrs}>`;
  const sel = (k, i, f, opts) => `<select class="f ob" data-k="${k}" data-i="${i}" data-f="${f}">${opts}</select>`;
  page('أرصدة البداية', `<div class="note info">هنا بتسجل اللي عند المصنع <b>يوم بداية التشغيل</b>: الكاش والبنك، الأصول الثابتة، جرد المخزون بتكلفته، واللي ليكم عند العملاء، واللي عليكم للموردين. السيستم بيعمل قيد افتتاحي واحد متوازن، والفرق بيتسجل رأس مال.</div>
    ${done.length ? `<div class="card"><div class="hd"><h3>قيود افتتاحية متسجلة</h3></div><div class="bd">${table('obd', [{ t: 'الرقم', f: o => `<span class="mono">${esc(o.no)}</span>` }, { t: 'التاريخ', f: o => df(o.date) }, { t: 'القيد', f: o => `<span class="mono">${esc(o.je)}</span>` }, { t: 'الإجمالي', n: 1, f: o => fm(o.total) }, { t: 'بواسطة', f: o => esc(E.userName(o.by)) }], done)}<div class="crumb" style="margin-top:6px">ينفع تضيف أرصدة تانية نسيتها، وهتتسجل كقيد افتتاحي جديد.</div></div></div>` : ''}
    <div class="card"><div class="hd"><h3>١. التاريخ والنقدية</h3></div><div class="bd"><div class="fgrid">
      <label class="fld"><span>تاريخ البداية</span><input class="f ob" data-k="date" type="date" value="${OB.date}" max="${E.today()}"></label>
      <label class="fld"><span>الخزنة (ج)</span>${inp('cash', 0, '', OB.cash, 'type="number" min="0" step="0.01"')}</label>
      <label class="fld"><span>البنك (ج)</span>${inp('bank', 0, '', OB.bank, 'type="number" min="0" step="0.01"')}</label>
      <label class="fld"><span>إنستاباي (ج)</span>${inp('instapay', 0, '', OB.instapay, 'type="number" min="0" step="0.01"')}</label></div></div></div>
    <div class="card"><div class="hd"><h3>٢. الأصول الثابتة</h3><div class="tools"><button class="btn sm" data-act="ob-add" data-arg="assets">${ic('plus')} أصل</button></div></div><div class="bd" style="display:flex;flex-direction:column;gap:10px">
      ${OB.assets.map((r, i) => row('assets', i, `<label class="fld"><span>الأصل</span>${inp('assets', i, 'name', r.name)}</label><label class="fld"><span>النوع</span>${sel('assets', i, 'acc', ASSET_ACCS.map(([c, n]) => `<option value="${c}" ${r.acc === c ? 'selected' : ''}>${n}</option>`).join(''))}</label><label class="fld"><span>القيمة (ج)</span>${inp('assets', i, 'value', r.value, 'type="number" min="0" step="0.01"')}</label><label class="fld"><span>إهلاك سنوي %</span>${inp('assets', i, 'rate', r.rate, 'type="number" min="0" max="100" step="1"')}</label>`)).join('') || '<div class="crumb">مفيش أصول متضافة. دوس "أصل" لإضافة مفرمة أو تلاجة أو عربية.</div>'}</div></div>
    <div class="card"><div class="hd"><h3>٣. جرد المخزون</h3><span class="sub">${OB.stock.length} صنف</span><div class="tools"><button class="btn sm" data-act="ob-fill">املا ٥٠٠ كجم لكل منتج</button><button class="btn sm" data-act="ob-add" data-arg="stock">${ic('plus')} صنف</button></div></div><div class="bd" style="display:flex;flex-direction:column;gap:10px">
      ${OB.stock.map((r, i) => { const it = r.itemId ? E.item(r.itemId) : null; const isP = it && it.cat === 'product'; return row('stock', i, `<label class="fld" style="grid-column:span 2"><span>الصنف</span>${sel('stock', i, 'itemId', '<option value="">اختار</option>' + itemsOpt(r.itemId))}</label>
        ${isP ? `<label class="fld"><span>العبوة</span>${sel('stock', i, 'pack', E.packsOf(it).map(z => `<option value="${z}" ${+r.pack === z ? 'selected' : ''}>${packName(z)}</option>`).join(''))}</label><label class="fld"><span>عدد العبوات</span>${inp('stock', i, 'qty', r.qty, 'type="number" min="0" step="1"')}</label>` : `<label class="fld"><span>الكمية (${it && it.unit === 'pc' ? 'قطعة' : 'كجم'})</span>${inp('stock', i, 'qty', r.qty, 'type="number" min="0" step="0.001"')}</label>`}
        ${isP ? `<label class="fld"><span>الفريزر</span>${sel('stock', i, 'wh', E.warehouses().filter(w => w.use === 'fg').map(w => `<option value="${w.id}" ${(r.wh || E.whs('fg')[0]) === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join(''))}</label>` : ''}
        <label class="fld"><span>التكلفة (ج لكل ${it && it.unit === 'pc' ? 'قطعة' : 'كجم'})</span>${inp('stock', i, 'cost', r.cost, 'type="number" min="0" step="0.01"')}</label>
        ${it && ['meat', 'spice', 'carcass'].includes(it.cat) ? `<label class="fld"><span>المكان</span>${sel('stock', i, 'wh', E.warehouses().filter(w => ['raw', 'receiving'].includes(w.use)).map(w => `<option value="${w.id}" ${(r.wh || E.whs('raw')[0]) === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join(''))}</label>` : ''}
        <label class="fld"><span>الصلاحية</span>${inp('stock', i, 'exp', r.exp, 'type="date"')}</label>`); }).join('') || '<div class="crumb">ضيف كل صنف موجود في المخازن يوم البداية بالكمية وتكلفته.</div>'}</div></div>
    <div class="grid g2">
      <div class="card"><div class="hd"><h3>٤. أرصدة العملاء (ليكم عندهم)</h3><div class="tools"><button class="btn sm" data-act="ob-add" data-arg="cust">${ic('plus')} عميل</button></div></div><div class="bd" style="display:flex;flex-direction:column;gap:10px">
        ${OB.cust.map((r, i) => row('cust', i, `<label class="fld"><span>العميل</span>${sel('cust', i, 'id', '<option value="">اختار</option>' + pOpt('customer', r.id))}</label><label class="fld"><span>المبلغ (ج)</span>${inp('cust', i, 'amount', r.amount, 'type="number" min="0" step="0.01"')}</label>`)).join('') || '<div class="crumb">العملاء لازم يتضافوا الأول من شاشة العملاء.</div>'}</div></div>
      <div class="card"><div class="hd"><h3>٥. أرصدة الموردين (عليكم ليهم)</h3><div class="tools"><button class="btn sm" data-act="ob-add" data-arg="sup">${ic('plus')} مورد</button></div></div><div class="bd" style="display:flex;flex-direction:column;gap:10px">
        ${OB.sup.map((r, i) => row('sup', i, `<label class="fld"><span>المورد</span>${sel('sup', i, 'id', '<option value="">اختار</option>' + pOpt('supplier', r.id))}</label><label class="fld"><span>المبلغ (ج)</span>${inp('sup', i, 'amount', r.amount, 'type="number" min="0" step="0.01"')}</label>`)).join('') || '<div class="crumb">الموردين لازم يتضافوا الأول من شاشة الموردين.</div>'}</div></div>
    </div>
    <div class="card"><div class="bd" style="display:flex;flex-direction:column;gap:12px"><div class="smart" id="ob-sum">${obSummary()}</div>
      <div class="bar"><button class="btn p lg" data-act="ob-save">${ic('check')} تسجيل القيد الافتتاحي</button><button class="btn" data-act="ob-clear">مسح</button></div></div></div>`);
  document.querySelectorAll('.ob').forEach(el => {
    el.onchange = el.oninput = () => {
      const k = el.dataset.k;
      if (k === 'date') OB.date = el.value; else if (['cash', 'bank', 'instapay'].includes(k)) OB[k] = el.value; else OB[k][+el.dataset.i][el.dataset.f] = el.value;
      if (el.tagName === 'SELECT' && el.dataset.f === 'itemId') { const r = OB.stock[+el.dataset.i]; const it = el.value && E.item(el.value); r.pack = it && it.cat === 'product' ? E.packsOf(it)[0] : ''; r.exp = r.exp || E.addDays(E.today(), it && it.cat === 'pack' ? 365 : it && it.cat === 'product' ? 60 : 7); U.render(); return; }
      const sm = document.getElementById('ob-sum'); if (sm) sm.innerHTML = obSummary();
    };
  });
};
ACTS['ob-fill'] = () => {
  const have = new Set(OB.stock.map(r => r.itemId));
  for (const it of S().items.filter(i => i.cat === 'product' && !have.has(i.id))) {
    const pack = E.packsOf(it).includes(1000) ? 1000 : Math.max(...E.packsOf(it).filter(z => z <= 1000));
    OB.stock.push({ itemId: it.id, pack, qty: String(500000 / pack), cost: (Math.round(it.priceWholesale * 0.7 / 100)).toString(), exp: E.addDays(E.today(), 60) });
  }
  toast('اتضاف ٥٠٠ كجم لكل منتج. التكلفة مبدئية = ٧٠٪ من سعر الجملة، راجعها قبل الحفظ', 'ok'); U.render();
};
ACTS['ob-add'] = k => { OB[k].push(k === 'assets' ? { acc: '1501', rate: '10' } : k === 'stock' ? { wh: '' } : {}); U.render(); };
ACTS['ob-del'] = arg => { const [k, i] = arg.split(':'); OB[k].splice(+i, 1); U.render(); };
ACTS['ob-clear'] = () => { Object.assign(OB, { cash: '', bank: '', instapay: '', assets: [], stock: [], cust: [], sup: [] }); U.render(); };
ACTS['ob-save'] = () => modal('تأكيد القيد الافتتاحي', `<div class="smart">${obSummary()}</div><div class="note">القيد ده بيتسجل مرة واحدة ومينفعش يتمسح. لو فيه غلط بعد كده يتصلح بقيد تسوية من المحاسب.</div>`,
  { saveText: 'أيوه، سجّل', save: async () => { const d = obLines(); await E.openingBalances(d); Object.assign(OB, { cash: '', bank: '', instapay: '', assets: [], stock: [], cust: [], sup: [] }); toast('اتسجل القيد الافتتاحي', 'ok'); } });

})();
