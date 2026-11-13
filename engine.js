/* Boom Meat ERP — engine: inventory (FIFO lots), manufacturing, sales, double-entry accounting.
   Money is stored as integer piasters (1 EGP = 100). Weight is stored as integer grams. Pieces as integers.
   Every operation posts its own balanced journal entry; nothing is typed into the ledger by hand. */
(function (root) {
'use strict';

const STORE_KEY = 'boom-erp-v1';
const DATA_VERSION = 5;

/* ---------- chart of accounts ---------- */
const ACCOUNTS = [
  ['1', 'الأصول', null], ['11', 'الأصول الثابتة', '1'],
  ['1501', 'آلات ومعدات الإنتاج', '11'], ['1502', 'معدات التبريد والتجميد', '11'], ['1503', 'السيارات', '11'], ['1504', 'أجهزة وأثاث', '11'],
  ['1599', 'مجمع الإهلاك', '11'],
  ['12', 'الأصول المتداولة', '1'],
  ['1101', 'الخزنة', '12'], ['1102', 'البنك', '12'], ['1103', 'حساب إنستاباي', '12'], ['1201', 'العملاء', '12'],
  ['1301', 'مخزون خامات اللحوم', '12'], ['1302', 'مخزون التوابل والإضافات', '12'], ['1303', 'مخزون مواد التعبئة', '12'],
  ['1304', 'إنتاج تحت التشغيل', '12'], ['1305', 'مخزون المنتج التام', '12'], ['1401', 'ضريبة القيمة المضافة على المشتريات', '12'],
  ['2', 'الخصوم', null], ['21', 'الخصوم المتداولة', '2'], ['2101', 'الموردين', '21'], ['2102', 'ضريبة القيمة المضافة على المبيعات', '21'],
  ['3', 'حقوق الملكية', null], ['3101', 'رأس المال', '3'], ['3201', 'الأرباح المحتجزة', '3'],
  ['4', 'الإيرادات', null], ['4101', 'مبيعات قطاعي (أفراد)', '4'], ['4102', 'مبيعات جملة (مطاعم ومحلات)', '4'], ['4103', 'إيراد التوصيل', '4'],
  ['5', 'التكاليف والمصروفات', null], ['51', 'تكلفة المبيعات', '5'], ['5101', 'تكلفة البضاعة المباعة', '51'],
  ['52', 'مصروفات المصنع', '5'], ['5102', 'هالك وتالف المخزون', '52'], ['5201', 'أجور الإنتاج', '52'], ['5202', 'كهرباء ومياه المصنع', '52'], ['5203', 'صيانة', '52'],
  ['53', 'مصروفات البيع والتسويق', '5'], ['5301', 'تسويق وإعلانات', '53'], ['5302', 'نقل وتوصيل', '53'],
  ['54', 'مصروفات إدارية وعمومية', '5'], ['5401', 'إيجار', '54'], ['5402', 'مرتبات إدارية', '54'], ['5403', 'مصروفات عمومية', '54'],
  ['5501', 'الإهلاك', '54'],
].map(([code, name, parent]) => ({ code, name, parent }));
const LEAF = new Set(ACCOUNTS.filter(a => !ACCOUNTS.some(b => b.parent === a.code)).map(a => a.code));
const accType = code => ({ 1: 'asset', 2: 'liability', 3: 'equity', 4: 'income', 5: 'expense' })[code[0]];
const debitNature = code => code[0] === '1' || code[0] === '5';
const CAT_ACC = { carcass: '1301', meat: '1301', byproduct: '1301', spice: '1302', pack: '1303', product: '1305' };
const CAT_NAME = { carcass: 'لحوم بالعضم', meat: 'قطعيات ولحوم', byproduct: 'نواتج تقطيع', spice: 'توابل وإضافات', pack: 'مواد تعبئة', product: 'منتج تام' };
const METHOD_ACC = { cash: '1101', bank: '1102', instapay: '1103' };
const METHOD_NAME = { cash: 'كاش', bank: 'تحويل بنكي', instapay: 'إنستاباي', credit: 'آجل' };
// store kinds: receiving (goods in), raw (production chillers: meat & spices), pack (packaging), fg (finished-goods freezers)
const WH_USE = { receiving: 'مخزن استلام', raw: 'تلاجة إنتاج (خامات)', pack: 'مخزن تعبئة', fg: 'فريزر منتج تام' };
const WAREHOUSES = [
  { id: 'W1', name: 'مخزن الاستلام', use: 'receiving' }, { id: 'W2', name: 'تلاجة الإنتاج ١', use: 'raw' },
  { id: 'W3', name: 'مخزن التعبئة والتغليف', use: 'pack' }, { id: 'W4', name: 'فريزر المنتج التام ١', use: 'fg' },
  { id: 'W5', name: 'تلاجة الإنتاج ٢', use: 'raw' }, { id: 'W6', name: 'فريزر المنتج التام ٢', use: 'fg' },
];
const PACK_SIZES = [500, 1000, 1500, 2000]; // the only pack sizes Boom Meat makes and sells
const packsOf = p => (p.packs && p.packs.length ? p.packs : PACK_SIZES);
const ROLES = {
  owner: { name: 'المالك (أدمن)', cost: true },
  accountant: { name: 'محاسب', cost: true },
  storekeeper: { name: 'أمين مخزن', cost: true },
  supervisor: { name: 'مشرف إنتاج', cost: false },
  worker: { name: 'عامل إنتاج', cost: false },
  sales: { name: 'مبيعات', cost: false },
  pending: { name: 'مستني صلاحيات', cost: false },
};

/* ---------- integer math ---------- */
const big = n => BigInt(Math.round(n));
function mulDiv(a, b, c) { // round(a*b/c) for non-negative ints, exact
  if (c === 0) throw new Error('قسمة على صفر');
  const n = big(a) * big(b), d = big(c);
  return Number((n * 2n + d) / (2n * d));
}
function alloc(total, weights) { // split integer total by integer weights, exact sum (largest remainder)
  const n = weights.length; if (!n) return [];
  let W = weights.reduce((s, w) => s + w, 0);
  const ws = W > 0 ? weights : weights.map(() => 1); if (W <= 0) W = n;
  const T = big(total), WB = big(W);
  const res = ws.map(w => Number(T * big(w) / WB));
  const rems = ws.map((w, i) => ({ i, r: (T * big(w)) % WB })).sort((a, b) => (a.r < b.r ? 1 : a.r > b.r ? -1 : a.i - b.i));
  let left = total - res.reduce((s, x) => s + x, 0);
  for (let k = 0; left > 0; k++, left--) res[rems[k % n].i]++;
  return res;
}
const unitBase = u => (u === 'kg' ? 1000 : 1);
const isInt = x => Number.isInteger(x) && Math.abs(x) <= 1e10; // also caps absurd values (10,000 tonnes / 100M EGP per line) so sums stay exact
const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d && d < '2100-01-01';

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function cairoNow() { // wall-clock in Africa/Cairo regardless of server/browser timezone
  const parts = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).forEach(x => { parts[x.type] = x.value; });
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
const today = () => cairoNow().date;
function addDays(s, n) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return dstr(d); }
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const dow = s => new Date(s + 'T12:00:00').getDay();
const monthStart = s => s.slice(0, 8) + '01';
function monthEnd(s) { const d = new Date(s.slice(0, 7) + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return dstr(d); }

/* ---------- state ---------- */
let S = null;
let seeding = false, seedClock = 0, seedDay = null;

function freshState() {
  return {
    version: DATA_VERSION, mode: 'demo', warehouses: JSON.parse(JSON.stringify(WAREHOUSES)), seq: {}, createdAt: new Date().toISOString(),
    settings: {
      vatRate: 14, issueLimitKg: 100, fgShelfDays: 90, telegram: true, tgToken: '', tgChat: '',
      company: { name: 'بوم ميت للحوم', nameEn: 'Boom Meat', address: 'المنطقة الصناعية · مدينة ١٥ مايو · القاهرة', phone: '(+2) 01033004411', taxId: '000-000-000' },
    },
    users: [
      { id: 'u1', name: 'المالك', role: 'owner' }, { id: 'u2', name: 'محمد سالم', role: 'accountant' },
      { id: 'u3', name: 'خالد عبد الله', role: 'storekeeper' }, { id: 'u4', name: 'أحمد فتحي', role: 'supervisor' },
      { id: 'u5', name: 'محمود حسن', role: 'worker' }, { id: 'u6', name: 'سارة يوسف', role: 'sales' },
    ],
    currentUser: 'u1',
    items: [], partners: [], lots: [], journal: [], audit: [], alerts: [], priceHistory: [], flags: { low: {}, exp: {} },
    assets: [],
    docs: { purchases: [], transfers: [], cuttings: [], batches: [], invoices: [], receipts: [], payments: [], expenses: [], cash: [], corrections: [], depreciation: [], writeoffs: [], orders: [] },
  };
}

function nextNo(prefix, width = 4) { S.seq[prefix] = (S.seq[prefix] || 0) + 1; return `${prefix}-${String(S.seq[prefix]).padStart(width, '0')}`; }
const uid = p => nextNo('_' + p, 6).slice(1);
function stamp(date) {
  if (seeding) { seedClock += 7 + Math.floor(seedClock % 5); const m = 8 * 60 + (seedClock % 600); return `${date}T${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
  const now = cairoNow();
  return date === now.date ? `${date}T${now.time}` : `${date}T12:00`;
}
const me = () => S.users.find(u => u.id === S.currentUser) || { id: S.currentUser, name: '—', role: 'worker' };
const userName = id => id === 'bot' ? 'بوت واتساب' : (S.users.find(u => u.id === id) || {}).name || '—';
const item = id => { const it = S.items.find(i => i.id === id); if (!it) throw new Error('صنف غير معروف'); return it; };
const partner = id => { const p = S.partners.find(x => x.id === id); if (!p) throw new Error('عميل/مورد غير معروف'); return p; };
const warehouses = () => (S && S.warehouses) || WAREHOUSES;
const whName = id => (warehouses().find(w => w.id === id) || {}).name || id;
const whUse = id => (warehouses().find(w => w.id === id) || {}).use;
const whs = use => warehouses().filter(w => w.use === use).map(w => w.id);
function ensureWarehouses(st) { // books saved before stores became configurable
  if (!st.warehouses) st.warehouses = JSON.parse(JSON.stringify(WAREHOUSES));
  for (const w of st.warehouses) if (!w.use) w.use = (WAREHOUSES.find(x => x.id === w.id) || {}).use || 'raw';
  return st;
}

function audit(action, ref, text, date) {
  S.audit.push({ id: uid('A'), at: stamp(date || today()), user: S.currentUser, action, ref, text });
}
function alert(level, kind, text, ref, date) {
  S.alerts.push({ id: uid('AL'), at: stamp(date || today()), level, kind, text, ref, read: false, tg: seeding ? 'demo' : (S.settings.telegram ? 'pending' : 'off') });
}
function fail(msg) { const e = new Error(msg); e.refused = true; throw e; } // a deliberate, explained refusal
function need(cond, msg) { if (!cond) fail(msg); }
function checkDate(d) { need(isDay(d), 'التاريخ غير صحيح'); need(d <= today(), 'مينفعش تسجل عملية بتاريخ بعد النهارده'); }
function perm(...roles) { need(me().active !== false, 'الحساب ده موقوف'); const r = me().role; need(r === 'owner' || roles.includes(r), 'الصلاحية دي مش متاحة لحسابك'); }

/* ---------- journal ---------- */
function post({ date, type, ref, memo, lines }) {
  lines = lines.filter(l => (l.dr || 0) + (l.cr || 0) > 0).map(l => ({ acc: l.acc, dr: l.dr || 0, cr: l.cr || 0, partner: l.partner || null }));
  need(lines.length >= 2, 'القيد لازم يكون فيه طرفين على الأقل');
  let dr = 0, cr = 0;
  for (const l of lines) {
    need(LEAF.has(l.acc), 'حساب غير صحيح: ' + l.acc);
    need(isInt(l.dr) && isInt(l.cr) && l.dr >= 0 && l.cr >= 0 && !(l.dr && l.cr), 'قيمة قيد غير صحيحة');
    dr += l.dr; cr += l.cr;
  }
  need(dr === cr, 'القيد غير متوازن: المدين لا يساوي الدائن');
  const je = { id: uid('J'), no: nextNo('JE', 5), date, type, ref, memo, lines, total: dr, at: stamp(date), by: S.currentUser };
  S.journal.push(je);
  return je;
}

/* ---------- lots / FIFO ---------- */
// first-expiry-first-out (then oldest received): the lot that expires soonest leaves first, so fresh meat is not left to spoil
function lotSort(a, b) { return a.expDate < b.expDate ? -1 : a.expDate > b.expDate ? 1 : a.inDate < b.inDate ? -1 : a.inDate > b.inDate ? 1 : a.n - b.n; }
function lotsOf(itemId, whs, packSize) {
  return S.lots.filter(l => l.itemId === itemId && l.qty > 0 && (!whs || whs.includes(l.wh)) && (packSize == null || l.packSize === packSize)).sort(lotSort);
}
function available(itemId, whs, packSize) { return lotsOf(itemId, whs, packSize).reduce((s, l) => s + l.qty, 0); }
function takeFromLot(l, q) { const v = q === l.qty ? l.value : mulDiv(l.value, q, l.qty); l.qty -= q; l.value -= v; return { lotId: l.id, code: l.code, qty: q, value: v }; }
function consume(itemId, qty, whs, packSize) {
  need(isInt(qty) && qty > 0, 'الكمية لازم تكون أكبر من صفر');
  const lots = lotsOf(itemId, whs, packSize);
  const av = lots.reduce((s, l) => s + l.qty, 0);
  if (av < qty) fail(`الكمية المتاحة من "${item(itemId).name}" ${fmtQty(av, item(itemId).unit)} بس، والمطلوب ${fmtQty(qty, item(itemId).unit)}`);
  const parts = []; let rem = qty;
  for (const l of lots) { if (!rem) break; const t = Math.min(rem, l.qty); parts.push(takeFromLot(l, t)); rem -= t; }
  return parts;
}
function restore(parts) { for (const p of parts) { const l = S.lots.find(x => x.id === p.lotId); l.qty += p.qty; l.value += p.value; } }
function newLot(o) {
  const it = item(o.itemId);
  const lot = { id: uid('L'), n: S.lots.length, code: o.code || nextNo('L-' + o.inDate.slice(2, 4) + o.inDate.slice(5, 7), 3), itemId: o.itemId, wh: o.wh,
    qty: o.qty, value: o.value, inQty: o.qty, inValue: o.value, prodDate: o.prodDate || o.inDate, inDate: o.inDate, expDate: o.expDate,
    packSize: o.packSize == null ? null : o.packSize, src: o.src, batchId: o.batchId || null, cat: it.cat };
  S.lots.push(lot); return lot;
}
function fmtQty(q, unit) { return unit === 'kg' ? `${(q / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} كجم` : `${q.toLocaleString('en-US')} قطعة`; }

/* ---------- transactions ---------- */
function tx(fn) {
  if (seeding) { const r = fn(); watch(seedDay || today()); return r; }
  const snap = JSON.stringify(S);
  try { const r = fn(); watch(today()); save(); return r; }
  catch (e) {
    S = JSON.parse(snap);
    if (e && (e.refused || /[\u0600-\u06FF]/.test(e.message || ''))) throw e; // our own Arabic messages pass through
    // anything else is malformed input hitting the code (wrong type, missing field): refuse it in plain words, keep the cause for the log
    const friendly = new Error('البيانات المبعوتة ناقصة أو مش مظبوطة. راجع الخانات وجرّب تاني'); friendly.refused = true; friendly.cause = e; throw friendly;
  }
}

/* opening balance: capital + fixed assets */
function opening({ date, cash, bank, assets }) {
  return tx(() => {
    const lines = [];
    let cap = 0;
    if (cash) { lines.push({ acc: '1101', dr: cash }); cap += cash; }
    if (bank) { lines.push({ acc: '1102', dr: bank }); cap += bank; }
    for (const a of assets) { S.assets.push({ id: uid('FA'), ...a, date }); lines.push({ acc: a.acc, dr: a.value }); cap += a.value; }
    lines.push({ acc: '3101', cr: cap });
    const je = post({ date, type: 'opening', ref: null, memo: 'أرصدة افتتاحية: رأس المال والأصول الثابتة', lines });
    audit('opening', je.no, 'تسجيل الأرصدة الافتتاحية', date);
    return je;
  });
}

function purchase({ date, supplierId, ref, lines, wh }) {
  wh = wh || whs('receiving')[0];
  return tx(() => {
    perm('storekeeper', 'accountant'); checkDate(date);
    const sup = partner(supplierId); need(sup.type === 'supplier', 'اختار مورد');
    if (sup.items && sup.items.length) for (const ln of lines || []) need(sup.items.includes(ln.itemId), `"${item(ln.itemId).name}" مش من أصناف ${sup.name}. ضيفه لأصناف المورد الأول من شاشة الموردين`);
    need(lines && lines.length, 'أضف صنف واحد على الأقل');
    const no = nextNo('PO');
    const doc = { id: uid('P'), no, date, supplierId, ref: ref || '', wh, lines: [], net: 0, vat: 0, total: 0, by: S.currentUser, at: stamp(date) };
    const accNet = {};
    for (const ln of lines) {
      const it = item(ln.itemId);
      need(it.cat !== 'product' && it.cat !== 'byproduct', `"${it.name}" مش صنف بيتشرى`);
      need(isInt(ln.qty) && ln.qty > 0, `كمية "${it.name}" غير صحيحة`);
      need(isInt(ln.unitCost) && ln.unitCost > 0, `سعر "${it.name}" غير صحيح`);
      need(isDay(ln.expDate), `اكتب تاريخ صلاحية "${it.name}" صح`);
      need(!ln.prodDate || (isDay(ln.prodDate) && ln.prodDate <= date), `تاريخ إنتاج "${it.name}" لازم يكون قبل الاستلام أو في نفس اليوم`);
      need(ln.expDate && ln.expDate > date, `تاريخ صلاحية "${it.name}" لازم يكون بعد تاريخ الاستلام`);
      const value = mulDiv(ln.qty, ln.unitCost, unitBase(it.unit));
      need(value > 0 && value <= 1e12, `قيمة "${it.name}" مش منطقية. راجع الكمية والسعر`);
      const vat = Math.round(value * it.vat / 100);
      const lot = newLot({ itemId: it.id, wh, qty: ln.qty, value, inDate: date, prodDate: ln.prodDate || date, expDate: ln.expDate, src: { type: 'purchase', id: doc.id, no } });
      doc.lines.push({ itemId: it.id, qty: ln.qty, unitCost: ln.unitCost, value, vat, lotId: lot.id, lotCode: lot.code, prodDate: lot.prodDate, expDate: lot.expDate });
      doc.net += value; doc.vat += vat;
      accNet[CAT_ACC[it.cat]] = (accNet[CAT_ACC[it.cat]] || 0) + value;
    }
    doc.total = doc.net + doc.vat;
    const jl = Object.entries(accNet).map(([acc, v]) => ({ acc, dr: v }));
    jl.push({ acc: '1401', dr: doc.vat }, { acc: '2101', cr: doc.total, partner: supplierId });
    doc.je = post({ date, type: 'purchase', ref: { type: 'purchase', id: doc.id, no }, memo: `فاتورة شراء ${no} · ${sup.name}${ref ? ' · ' + ref : ''}`, lines: jl }).no;
    S.docs.purchases.push(doc);
    audit('purchase', no, `استلام بضاعة من ${sup.name} بقيمة ${money(doc.total)} (${doc.lines.length} صنف)`, date);
    return doc;
  });
}

function transfer({ date, lotId, qty, toWh }) {
  return tx(() => {
    perm('storekeeper', 'supervisor'); checkDate(date);
    const l = S.lots.find(x => x.id === lotId); need(l, 'الدفعة غير موجودة');
    need(warehouses().some(w => w.id === toWh), 'المكان غير صحيح');
    need(toWh !== l.wh, 'اختار مكان مختلف');
    need((whUse(l.wh) === 'fg') === (whUse(toWh) === 'fg'), 'المنتج التام بيتنقل بين فريزرات المنتج التام بس، والخامات مينفعش تدخلها');
    need(isInt(qty) && qty > 0 && qty <= l.qty, 'الكمية أكبر من رصيد الدفعة');
    const it = item(l.itemId);
    if (it.cat === 'pack') need(whUse(toWh) !== 'raw', 'مواد التعبئة مكانها مخزن التعبئة');
    const no = nextNo('TR');
    const from = l.wh;
    let moved;
    if (qty === l.qty) { l.wh = toWh; moved = l; }
    else { const p = takeFromLot(l, qty); moved = newLot({ code: l.code, itemId: l.itemId, wh: toWh, qty: p.qty, value: p.value, inDate: l.inDate, prodDate: l.prodDate, expDate: l.expDate, packSize: l.packSize, src: l.src, batchId: l.batchId }); moved.n = l.n + 0.5; }
    const doc = { id: uid('T'), no, date, lotCode: l.code, itemId: l.itemId, qty, from, to: toWh, by: S.currentUser, at: stamp(date) };
    S.docs.transfers.push(doc);
    audit('transfer', no, `تحويل ${fmtQty(qty, it.unit)} ${it.name} (دفعة ${l.code}) من ${whName(from)} إلى ${whName(toWh)}`, date);
    return doc;
  });
}

function cutting({ date, lotId, qty, outputs }) {
  return tx(() => {
    perm('supervisor', 'storekeeper'); checkDate(date);
    const l = S.lots.find(x => x.id === lotId); need(l, 'الدفعة غير موجودة');
    const src = item(l.itemId); need(src.cat === 'carcass', 'التقطيع بيكون من دفعة لحم بالعضم');
    need(isInt(qty) && qty > 0 && qty <= l.qty, 'الكمية أكبر من رصيد الدفعة');
    outputs = outputs.filter(o => o.qty > 0);
    need(outputs.length, 'سجل ناتج التقطيع');
    let outSum = 0;
    for (const o of outputs) { const it = item(o.itemId); need(it.cat === 'meat' || it.cat === 'byproduct', `"${it.name}" مش ناتج تقطيع`); need(isInt(o.qty) && o.qty > 0, 'كمية ناتج غير صحيحة'); outSum += o.qty; }
    need(outSum <= qty, `مجموع الناتج (${fmtQty(outSum, 'kg')}) أكبر من الداخل (${fmtQty(qty, 'kg')})`);
    const no = nextNo('CUT');
    const part = takeFromLot(l, qty);
    const weights = outputs.map(o => { const it = item(o.itemId); return it.cat === 'byproduct' ? 0 : mulDiv(o.qty, it.priceRetail, 1000); });
    need(weights.some(w => w > 0), 'لازم يكون فيه قطعية واحدة على الأقل غير العضم');
    const values = alloc(part.value, weights);
    const doc = { id: uid('C'), no, date, srcLot: l.code, srcItem: l.itemId, qty, cost: part.value, outputs: [], waste: qty - outSum, by: S.currentUser, at: stamp(date) };
    outputs.forEach((o, i) => {
      const lot = newLot({ itemId: o.itemId, wh: l.wh, qty: o.qty, value: values[i], inDate: date, prodDate: date, expDate: l.expDate, src: { type: 'cutting', id: doc.id, no } });
      doc.outputs.push({ itemId: o.itemId, qty: o.qty, value: values[i], lotCode: lot.code });
    });
    S.docs.cuttings.push(doc);
    audit('cutting', no, `تقطيع ${fmtQty(qty, 'kg')} من دفعة ${l.code}: ناتج ${fmtQty(outSum, 'kg')}، هدر ${fmtQty(doc.waste, 'kg')}`, date);
    return doc;
  });
}

function createBatch({ date, productId, planned }) {
  return tx(() => {
    perm('supervisor'); checkDate(date);
    const p = item(productId); need(p.cat === 'product', 'اختار منتج');
    need(isInt(planned) && planned > 0, 'الكمية المخططة غير صحيحة');
    const no = nextNo('T');
    const b = { id: uid('B'), no, date, productId, planned, status: 'open', issues: [], packs: null, output: 0, waste: 0, cost: 0, inputKg: 0, closedAt: null, openedBy: S.currentUser, at: stamp(date) };
    S.docs.batches.push(b);
    audit('batch_open', no, `فتح تشغيلة ${p.name} (مخطط ${fmtQty(planned, 'kg')})`, date);
    return b;
  });
}
const batchById = id => { const b = S.docs.batches.find(x => x.id === id); need(b, 'التشغيلة غير موجودة'); return b; };
function issuedOf(b, itemId) { return b.issues.filter(i => !i.reversed && i.itemId === itemId).reduce((s, i) => s + i.qty, 0); }

function _issue(b, itemId, qty, date, note) {
  const it = item(itemId);
  need(['meat', 'spice', 'pack', 'byproduct'].includes(it.cat), `"${it.name}" مش بيتصرف على تشغيلة`);
  const parts = consume(itemId, qty, it.cat === 'pack' ? whs('pack') : whs('raw'));
  const value = parts.reduce((s, p) => s + p.value, 0);
  const ln = { id: uid('I'), itemId, qty, value, parts, by: S.currentUser, at: stamp(date), reversed: false, note: note || '' };
  b.issues.push(ln);
  ln.je = post({ date, type: 'issue', ref: { type: 'batch', id: b.id, no: b.no }, memo: `صرف ${it.name} على التشغيلة ${b.no}`, lines: [{ acc: '1304', dr: value }, { acc: CAT_ACC[it.cat], cr: value }] }).no;
  return ln;
}
function issue({ batchId, itemId, qty, date }) {
  return tx(() => {
    perm('worker', 'supervisor'); date = date || today(); checkDate(date);
    const b = batchById(batchId); need(b.status === 'open', 'التشغيلة مقفولة');
    need(date >= b.date, 'تاريخ الصرف قبل تاريخ التشغيلة');
    const it = item(itemId);
    const before = issuedOf(b, itemId);
    const ln = _issue(b, itemId, qty, date);
    const lim = S.settings.issueLimitKg * 1000;
    if (it.unit === 'kg' && before + qty > lim && before <= lim) {
      alert('warn', 'limit', `التشغيلة ${b.no}: صرف ${it.name} وصل ${fmtQty(before + qty, 'kg')} وعدّى الحد (${S.settings.issueLimitKg} كجم)`, { type: 'batch', id: b.id, no: b.no }, date);
    }
    audit('issue', b.no, `صرف ${fmtQty(qty, it.unit)} ${it.name} على ${b.no} (دفعات: ${ln.parts.map(p => p.code).join('، ')})`, date);
    return ln;
  });
}
function requestCorrection({ batchId, issueId, newQty, reason }) {
  return tx(() => {
    const b = batchById(batchId); need(b.status === 'open', 'التشغيلة مقفولة، التصحيح مش متاح');
    const ln = b.issues.find(i => i.id === issueId); need(ln && !ln.reversed, 'السطر غير موجود');
    need(isInt(newQty) && newQty >= 0 && newQty !== ln.qty, 'اكتب الكمية الصحيحة');
    need(reason && reason.trim().length >= 3, 'اكتب سبب التصحيح');
    need(!S.docs.corrections.some(c => c.issueId === issueId && c.status === 'pending'), 'فيه طلب تصحيح مفتوح على السطر ده');
    const it = item(ln.itemId);
    const c = { id: uid('R'), no: nextNo('RQ'), batchId, issueId, itemId: ln.itemId, oldQty: ln.qty, newQty, reason: reason.trim(), status: 'pending', by: S.currentUser, at: stamp(today()) };
    S.docs.corrections.push(c);
    alert('info', 'correction', `طلب تصحيح على ${b.no}: ${it.name} من ${fmtQty(ln.qty, it.unit)} إلى ${fmtQty(newQty, it.unit)} · السبب: ${c.reason}`, { type: 'batch', id: b.id, no: b.no });
    audit('correction_request', b.no, `طلب تصحيح ${c.no}: ${it.name} ${fmtQty(ln.qty, it.unit)} ← ${fmtQty(newQty, it.unit)}`);
    return c;
  });
}
function decideCorrection(id, approve) {
  return tx(() => {
    perm(); // owner only
    const c = S.docs.corrections.find(x => x.id === id); need(c && c.status === 'pending', 'الطلب غير موجود');
    const b = batchById(c.batchId);
    const it = item(c.itemId);
    if (approve) {
      need(b.status === 'open', 'التشغيلة اتقفلت، ارفض الطلب');
      const ln = b.issues.find(i => i.id === c.issueId);
      restore(ln.parts);
      ln.reversed = true; ln.reversedBy = c.no;
      post({ date: today(), type: 'issue_reverse', ref: { type: 'batch', id: b.id, no: b.no }, memo: `عكس صرف ${it.name} على ${b.no} (تصحيح ${c.no})`, lines: [{ acc: CAT_ACC[it.cat], dr: ln.value }, { acc: '1304', cr: ln.value }] });
      if (c.newQty > 0) _issue(b, c.itemId, c.newQty, today(), `تصحيح ${c.no}`);
    }
    c.status = approve ? 'approved' : 'rejected'; c.decidedBy = S.currentUser; c.decidedAt = stamp(today());
    audit('correction_' + c.status, b.no, `${approve ? 'موافقة على' : 'رفض'} طلب التصحيح ${c.no} (${it.name})`);
    return c;
  });
}
function bagItemFor(size) { const it = S.items.find(i => i.cat === 'pack' && i.packFor === size); need(it, 'مفيش كيس معرّف للعبوة ' + size / 1000 + ' كجم'); return it; }
function stickerItem() { const it = S.items.find(i => i.cat === 'pack' && i.sticker); need(it, 'مفيش استيكر معرّف'); return it; }

function closeBatch({ batchId, date, packs, split }) {
  return tx(() => {
    perm('supervisor'); checkDate(date);
    const b = batchById(batchId); need(b.status === 'open', 'التشغيلة مقفولة بالفعل');
    need(date >= b.date, 'تاريخ القفل قبل تاريخ التشغيلة');
    const live = b.issues.filter(i => !i.reversed);
    const inputKg = live.filter(i => item(i.itemId).unit === 'kg' && item(i.itemId).cat !== 'pack').reduce((s, i) => s + i.qty, 0);
    need(inputKg > 0, 'مفيش خامات اتصرفت على التشغيلة');
    let output = 0, count = 0;
    const pSizes = packsOf(item(b.productId));
    for (const s of PACK_SIZES) { const n = packs[s] || 0; need(isInt(n) && n >= 0, 'عدد عبوات غير صحيح'); if (n) need(pSizes.includes(s), `العبوة ${s / 1000} كجم مش متاحة للمنتج ده`); output += n * s; count += n; }
    need(count > 0, 'سجل عدد العبوات الناتجة');
    need(output <= inputKg, `الناتج (${fmtQty(output, 'kg')}) أكبر من الخامات المصروفة (${fmtQty(inputKg, 'kg')})`);
    need(!S.docs.corrections.some(c => c.batchId === b.id && c.status === 'pending'), 'فيه طلب تصحيح مستني موافقة على التشغيلة دي');
    // packaging issued automatically: one bag per pack + one sticker per pack
    for (const s of PACK_SIZES) if (packs[s]) _issue(b, bagItemFor(s).id, packs[s], date, 'تعبئة تلقائية');
    _issue(b, stickerItem().id, count, date, 'تعبئة تلقائية');
    const cost = b.issues.filter(i => !i.reversed).reduce((s, i) => s + i.value, 0);
    const sizes = PACK_SIZES.filter(s => packs[s]);
    const vals = alloc(cost, sizes.map(s => packs[s] * s));
    const p = item(b.productId);
    // where the packs go: one freezer by default, or split across finished-goods freezers
    const fgW = whs('fg'); need(fgW.length, 'مفيش فريزر منتج تام متعرّف');
    const dest = (split && split.length ? split : [{ wh: fgW[0], packs }]).map(d => ({ wh: d.wh, packs: d.packs || {} }));
    for (const d of dest) need(whUse(d.wh) === 'fg', `"${whName(d.wh)}" مش فريزر منتج تام`);
    for (const s2 of PACK_SIZES) { const tot = dest.reduce((a, d) => a + (d.packs[s2] || 0), 0); need(tot === (packs[s2] || 0), `توزيع عبوات ${s2 / 1000} كجم على الفريزرات (${tot}) مش مساوي للعدد (${packs[s2] || 0})`); }
    sizes.forEach((s, i) => {
      const parts = dest.filter(d => d.packs[s] > 0);
      const v = alloc(vals[i], parts.map(d => d.packs[s]));
      parts.forEach((d, k) => newLot({ itemId: p.id, wh: d.wh, qty: d.packs[s] * s, value: v[k], inDate: date, prodDate: date, expDate: addDays(date, S.settings.fgShelfDays), packSize: s, src: { type: 'batch', id: b.id, no: b.no }, batchId: b.id }));
    });
    b.split = dest.filter(d => Object.values(d.packs).some(n => n > 0));
    b.je = post({ date, type: 'batch_close', ref: { type: 'batch', id: b.id, no: b.no }, memo: `قفل التشغيلة ${b.no}: ${p.name} ${fmtQty(output, 'kg')}`, lines: [{ acc: '1305', dr: cost }, { acc: '1304', cr: cost }] }).no;
    Object.assign(b, { status: 'closed', packs: { ...packs }, output, inputKg, waste: inputKg - output, cost, costPerKg: mulDiv(cost, 1000, output), closedAt: stamp(date), closeDate: date, closedBy: S.currentUser });
    audit('batch_close', b.no, `قفل ${b.no}: ناتج ${fmtQty(output, 'kg')} من ${fmtQty(inputKg, 'kg')} (هدر ${fmtQty(b.waste, 'kg')})، تكلفة الكيلو ${money(b.costPerKg)}`, date);
    return b;
  });
}

function priceFor(p, cust) { return cust.kind === 'wholesale' ? p.priceWholesale : p.priceRetail; }
let orderCredit = false; // set only while decideOrder approves a WhatsApp order (pay on delivery)
function invoice({ date, customerId, lines, discount = 0, method, vatIncluded = false, deliveryFee = 0 }) {
  return tx(() => {
    perm('sales', 'accountant'); checkDate(date);
    const c = partner(customerId); need(c.type === 'customer', 'اختار عميل');
    need(METHOD_NAME[method], 'اختار طريقة الدفع');
    if (method === 'credit' && !orderCredit) need(c.terms === 'credit', `${c.name} عميل كاش، مينفعش آجل`);
    lines = (lines || []).filter(l => l.count > 0);
    need(lines.length, 'أضف صنف واحد على الأقل');
    need(isInt(discount) && discount >= 0, 'الخصم غير صحيح');
    const no = nextNo('INV', 5);
    const doc = { id: uid('V'), no, date, customerId, kind: c.kind, method, lines: [], gross: 0, discount, net: 0, vat: 0, total: 0, cost: 0, by: S.currentUser, at: stamp(date) };
    for (const ln of lines) {
      const p = item(ln.productId); need(p.cat === 'product', 'صنف غير قابل للبيع');
      need(packsOf(p).includes(ln.packSize), 'حجم العبوة مش متاح للمنتج ده');
      need(isInt(ln.count) && ln.count > 0, 'عدد غير صحيح');
      const price = ln.pricePerKg != null ? ln.pricePerKg : priceFor(p, c);
      need(isInt(price) && price > 0, `سعر "${p.name}" غير صحيح`);
      if (ln.pricePerKg != null && ln.pricePerKg !== priceFor(p, c)) perm();
      const qty = ln.count * ln.packSize;
      const parts = consume(p.id, qty, whs('fg'), ln.packSize);
      const cost = parts.reduce((s, x) => s + x.value, 0);
      const amount = mulDiv(qty, price, 1000);
      doc.lines.push({ productId: p.id, packSize: ln.packSize, count: ln.count, qty, pricePerKg: price, amount, cost, parts });
      doc.gross += amount; doc.cost += cost;
    }
    need(discount <= doc.gross, 'الخصم أكبر من قيمة الفاتورة');
    need(isInt(deliveryFee) && deliveryFee >= 0 && (!deliveryFee || vatIncluded), 'رسوم التوصيل غير صحيحة');
    if (vatIncluded) { // price already includes VAT (WhatsApp orders): split it out
      doc.vatIncluded = true; doc.deliveryFee = deliveryFee; doc.total = doc.gross - discount + deliveryFee;
      doc.net = mulDiv(doc.total, 100, 100 + S.settings.vatRate); doc.vat = doc.total - doc.net;
      doc.deliveryNet = deliveryFee ? mulDiv(deliveryFee, 100, 100 + S.settings.vatRate) : 0;
    } else {
      doc.net = doc.gross - discount;
      doc.vat = Math.round(doc.net * S.settings.vatRate / 100);
      doc.total = doc.net + doc.vat;
    }
    const revAcc = c.kind === 'wholesale' ? '4102' : '4101';
    const ref = { type: 'invoice', id: doc.id, no };
    doc.je = post({ date, type: 'sale', ref, memo: `فاتورة بيع ${no} · ${c.name}`, lines: [
      { acc: '1201', dr: doc.total, partner: c.id }, { acc: revAcc, cr: doc.net - (doc.deliveryNet || 0) }, ...(doc.deliveryNet ? [{ acc: '4103', cr: doc.deliveryNet }] : []), { acc: '2102', cr: doc.vat },
      { acc: '5101', dr: doc.cost }, { acc: '1305', cr: doc.cost }] }).no;
    if (method !== 'credit') {
      doc.paidJe = post({ date, type: 'receipt', ref, memo: `تحصيل فاتورة ${no} (${METHOD_NAME[method]})`, lines: [{ acc: METHOD_ACC[method], dr: doc.total }, { acc: '1201', cr: doc.total, partner: c.id }] }).no;
    }
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    doc.eta = { uuid: Array.from({ length: 32 }, hex).join(''), status: 'valid' };
    S.docs.invoices.push(doc);
    audit('invoice', no, `فاتورة ${no} لـ ${c.name}: ${money(doc.total)} (${METHOD_NAME[method]})`, date);
    return doc;
  });
}

function cashBalance(acc) { return S.journal.reduce((s, j) => s + j.lines.filter(l => l.acc === acc).reduce((a, l) => a + l.dr - l.cr, 0), 0); }
function receipt({ date, customerId, amount, method, memo }) {
  return tx(() => {
    perm('accountant', 'sales'); checkDate(date);
    const c = partner(customerId); need(c.type === 'customer', 'اختار عميل');
    need(METHOD_ACC[method], 'اختار طريقة التحصيل');
    need(isInt(amount) && amount > 0, 'المبلغ غير صحيح');
    const no = nextNo('RC');
    const je = post({ date, type: 'receipt', ref: { type: 'receipt', no }, memo: `تحصيل ${no} من ${c.name}${memo ? ' · ' + memo : ''}`, lines: [{ acc: METHOD_ACC[method], dr: amount }, { acc: '1201', cr: amount, partner: c.id }] });
    const doc = { id: uid('RC'), no, date, customerId, amount, method, memo: memo || '', je: je.no, by: S.currentUser, at: je.at };
    S.docs.receipts.push(doc);
    audit('receipt', no, `تحصيل ${money(amount)} من ${c.name} (${METHOD_NAME[method]})`, date);
    return doc;
  });
}
/* ---------- WhatsApp orders: the bot places them (no stock or ledger effect); sales/owner approve → invoice on account ---------- */
const ORDER_METHODS = { cash: 'كاش عند الاستلام', instapay: 'إنستاباي' };
function normPhone(s) { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('20') && d.length === 12) d = '0' + d.slice(2); return d; }
function customerByPhone(phone) { const n = normPhone(phone); return n.length >= 8 ? S.partners.find(p => p.type === 'customer' && normPhone(p.phone) === n) || null : null; }
function orders() { return S.docs.orders || (S.docs.orders = []); }
function reservedQty(productId, packSize) { return orders().filter(o => o.status === 'pending').reduce((s, o) => s + o.lines.filter(l => l.productId === productId && l.packSize === packSize).reduce((a, l) => a + l.qty, 0), 0); }
function orderable(productId, packSize) { return Math.max(0, available(productId, whs('fg'), packSize) - reservedQty(productId, packSize)); }
const egpOf = p => p / 100;
function catalog(phone) { // read-only view for the bot: prices in EGP per kg, stock in whole packs not already promised to pending orders
  const c = customerByPhone(phone), kind = c && c.kind === 'wholesale' ? 'wholesale' : 'retail';
  return {
    customer: c ? { name: c.name, kind } : null, kind, vatRate: S.settings.vatRate,
    products: S.items.filter(i => i.cat === 'product' && i.active !== false).map(i => ({
      id: i.id, code: i.code, name: i.name, group: i.group || '', pricePerKg: egpOf(priceFor(i, { kind })), retailPerKg: egpOf(i.priceRetail), wholesalePerKg: egpOf(i.priceWholesale),
      packs: packsOf(i).map(size => ({ size, price: egpOf(mulDiv(size, priceFor(i, { kind }), 1000)), inStock: Math.floor(orderable(i.id, size) / size) })),
    })),
  };
}
function orderStatus(phone) {
  const n = normPhone(phone);
  return orders().filter(o => o.phone === n).slice(-3).map(o => ({ no: o.no, status: o.status, total: egpOf(o.total), at: o.at, reason: o.reason || '' }));
}
function olog(o, action, note) { (o.log || (o.log = [])).push({ at: stamp(today()), by: S.currentUser, action, note: String(note || '').slice(0, 200) }); if (o.log.length > 100) o.log.splice(0, o.log.length - 100); }
function placeOrder({ phone, name, address, method, lines, note, test, expectTotal }) {
  return tx(() => { // no perm(): only the shop endpoint (shared key) reaches this; it is not in the dashboard op list
    const ph = normPhone(phone);
    need(/^\d{8,15}$/.test(ph), 'رقم التليفون غير صحيح');
    need(name && String(name).trim().length >= 2 && String(name).trim().length <= 60, 'اكتب الاسم');
    need(address && String(address).trim().length >= 5 && String(address).trim().length <= 300, 'اكتب العنوان بالتفصيل');
    need(ORDER_METHODS[method], 'اختار الدفع: كاش أو إنستاباي');
    need(orders().filter(o => o.phone === ph && o.status === 'pending').length < 3, 'عندك ٣ طلبات لسه مستنية تأكيد');
    need(Array.isArray(lines) && lines.length && lines.length <= 30, 'الطلب فاضي');
    const merged = new Map();
    for (const ln of lines) {
      const p = item(ln.productId); need(p.cat === 'product' && p.active !== false, 'صنف غير متاح');
      need(packsOf(p).includes(ln.packSize), `عبوة ${ln.packSize} جم مش متاحة لـ ${p.name}`);
      need(isInt(ln.count) && ln.count > 0 && ln.count <= 200, 'عدد غير صحيح');
      const k = p.id + ':' + ln.packSize; merged.set(k, { productId: p.id, packSize: ln.packSize, count: (merged.get(k) || { count: 0 }).count + ln.count });
    }
    const c = customerByPhone(ph), kind = c && c.kind === 'wholesale' ? 'wholesale' : 'retail';
    const o = { id: uid('OR'), no: test ? nextNo('TST') : nextNo('ORD'), channel: 'whatsapp', status: 'pending', test: !!test, date: today(), at: stamp(today()),
      phone: ph, name: String(name).trim(), address: String(address).trim(), method, note: String(note || '').slice(0, 300), kind, customerId: c ? c.id : null, lines: [], total: 0 };
    for (const ln of merged.values()) {
      const p = item(ln.productId), qty = ln.count * ln.packSize, left = orderable(p.id, ln.packSize);
      need(left >= qty, `${p.name} عبوة ${ln.packSize} جم: المتاح ${Math.floor(left / ln.packSize)} بس`);
      const pricePerKg = priceFor(p, { kind }), amount = mulDiv(qty, pricePerKg, 1000);
      o.lines.push({ productId: p.id, name: p.name, packSize: ln.packSize, count: ln.count, qty, pricePerKg, amount }); o.total += amount;
    }
    if (expectTotal != null) need(Math.round(expectTotal * 100) === o.total, `السعر اتغير: الإجمالي الصح ${money(o.total)}`);
    olog(o, 'placed', `${o.lines.length} صنف · ${money(o.total)} · ${ORDER_METHODS[method]}`);
    orders().push(o);
    const pack = g => g >= 1000 ? `${g / 1000} كجم` : `${g} جم`;
    alert('info', 'order', `🛒 طلب واتساب ${o.no}${o.test ? ' (تجربة)' : ''}\n${o.name} · ${ph}\n${o.address}\n${o.lines.map(l => `• ${l.count} × ${l.name} ${pack(l.packSize)} = ${money(l.amount)}`).join('\n')}\nالإجمالي ${money(o.total)} شامل الضريبة · ${ORDER_METHODS[method]}${kind === 'wholesale' ? ' · عميل جملة' : ''}\nمستني موافقة من «طلبات واتساب»`, { type: 'order', id: o.id, no: o.no });
    if (o.test) S.alerts[S.alerts.length - 1].tg = 'test'; // test orders never reach the owner's Telegram
    audit('order', o.no, `طلب واتساب ${o.no} من ${o.name}: ${money(o.total)}${o.test ? ' (تجربة)' : ''}`);
    return { id: o.id, no: o.no, method, total: egpOf(o.total), kind, lines: o.lines.map(l => ({ name: l.name, packSize: l.packSize, count: l.count, amount: egpOf(l.amount) })) };
  });
}
function proofTarget(phone) { // the customer's latest InstaPay order that still waits for money
  const ph = normPhone(phone);
  return orders().filter(o => o.phone === ph && o.method === 'instapay' && !o.receiptNo && o.status !== 'rejected').slice(-1)[0] || null;
}
function orderProof({ phone, path }) {
  return tx(() => {
    const o = proofTarget(phone); need(o, 'مفيش طلب إنستاباي مستني تحويل على الرقم ده');
    need(typeof path === 'string' && /^orders\/[\w-]+\/[\w.-]+$/.test(path), 'مسار الصورة غير صحيح');
    o.proof = { path, at: stamp(today()), status: 'pending' }; olog(o, 'proof', 'صورة تحويل إنستاباي');
    audit('order_proof', o.no, `صورة تحويل لطلب ${o.no}`);
    return { id: o.id, no: o.no, test: o.test, name: o.name, phone: o.phone, total: egpOf(o.total) };
  });
}
function orderNotified({ id, kind }) {
  return tx(() => {
    const o = orders().find(x => x.id === id); need(o, 'الطلب غير موجود');
    need(['approved', 'paid', 'resend', 'nopay', 'rejected'].includes(kind), 'نوع الرسالة غير معروف');
    if (['approved', 'paid', 'resend'].includes(kind) && o.invoiceId) { o.invoiceSentAt = stamp(today()); olog(o, 'invoice_sent', kind); }
    else olog(o, 'confirm_sent', kind);
    return { ok: true };
  });
}
function orderView(id) { // read-only: what the bot needs to message the customer
  const o = orders().find(x => x.id === id); if (!o) return null;
  const inv = o.invoiceId ? S.docs.invoices.find(v => v.id === o.invoiceId) : null;
  return { id: o.id, no: o.no, status: o.status, test: !!o.test, phone: o.phone, name: o.name, address: o.address, method: o.method, methodName: ORDER_METHODS[o.method], paid: !!o.receiptNo, reason: o.reason || '',
    lines: o.lines.map(l => ({ name: l.name, packSize: l.packSize, count: l.count, amount: egpOf(l.amount) })), total: egpOf(o.total),
    invoice: inv ? { no: inv.no, date: inv.date, net: egpOf(inv.net), vat: egpOf(inv.vat), total: egpOf(inv.total), vatRate: S.settings.vatRate, deliveryFee: egpOf(inv.deliveryFee || 0) } : null,
    delivery: o.delivery ? { fee: egpOf(o.delivery.fee || 0), eta: (o.delivery.eta && o.delivery.eta.text) || '', note: o.delivery.note || '' } : null,
    paidAmount: egpOf(o.receiptNo && inv ? inv.total : o.paidAmount || 0), due: inv ? egpOf(Math.max(0, inv.total - (o.receiptNo ? inv.total : o.paidAmount || 0))) : null,
    receiptNo: o.receiptNo || '', sent: !!o.sentAt, invoiceSent: !!o.invoiceSentAt };
}
function decideOrder({ id, action, reason, deliveryFee, eta, note }) {
  return tx(() => {
    perm('sales', 'accountant');
    const o = orders().find(x => x.id === id); need(o, 'الطلب غير موجود');
    const T = today();
    if (action === 'delete') { need(o.test, 'المسح لطلبات التجربة بس'); S.docs.orders = orders().filter(x => x !== o); S.alerts = S.alerts.filter(a => !(a.ref && a.ref.type === 'order' && a.ref.id === o.id)); audit('order_delete', o.no, `مسح طلب التجربة ${o.no}`); return { ok: true }; }
    if (action === 'reject') {
      need(o.status === 'pending', 'الطلب ده اتعامل معاه قبل كده');
      Object.assign(o, { status: 'rejected', reason: String(reason || '').trim().slice(0, 200), decidedBy: S.currentUser, decidedAt: stamp(T) });
      olog(o, 'rejected', o.reason);
      audit('order_reject', o.no, `رفض طلب واتساب ${o.no}${o.reason ? ': ' + o.reason : ''}`); return o;
    }
    const cleanEta = e => { if (!e) return null; const text = String(e.text || '').trim(); need(text.length >= 2 && text.length <= 80, 'اكتب ميعاد التوصيل'); const at = e.at ? String(e.at) : ''; need(!at || /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(at), 'ميعاد التوصيل غير صحيح'); return at ? { text, at } : { text }; };
    const cleanNote = n => String(n || '').trim().slice(0, 160);
    const invOf = () => S.docs.invoices.find(v => v.id === o.invoiceId);
    const collect = (amount, memo) => { // record money from the customer against this order's invoice
      const inv = invOf(), due = inv.total - (o.paidAmount || 0); amount = Math.min(amount, due); if (amount <= 0) return null;
      const rc = receipt({ date: T, customerId: o.customerId, amount, method: o.method, memo: `طلب واتساب ${o.no}${memo ? ' · ' + memo : ''}` });
      o.paidAmount = (o.paidAmount || 0) + amount; (o.receipts = o.receipts || []).push(rc.no);
      if (o.paidAmount >= inv.total) Object.assign(o, { receiptNo: rc.no, paidAt: stamp(T), paidBy: S.currentUser });
      olog(o, 'paid', `${METHOD_NAME[o.method]} · ${rc.no} · ${money(amount)}${o.paidAmount < inv.total ? ` · باقي ${money(inv.total - o.paidAmount)}` : ''}`); return rc;
    };
    const approve = () => {
      need(o.status === 'pending', 'الطلب ده اتعامل معاه قبل كده'); need(!o.test, 'ده طلب تجربة: ارفضه أو امسحه');
      let c = (o.customerId && S.partners.find(p => p.id === o.customerId)) || customerByPhone(o.phone);
      if (!c) {
        const nm = S.partners.some(p => p.type === 'customer' && p.name === o.name) ? `${o.name} (${o.phone})` : o.name;
        c = { id: uid('CU'), type: 'customer', name: nm, phone: o.phone, address: o.address, kind: 'retail', terms: 'cash', taxId: '', supplies: '', items: [], createdAt: T, source: 'whatsapp' };
        S.partners.push(c); audit('partner_add', c.name, `إضافة عميل من واتساب: ${c.name}`);
      }
      const changed = o.lines.filter(l => l.pricePerKg !== priceFor(item(l.productId), c));
      if (changed.length) need(me().role === 'owner', `السعر اتغير من وقت الطلب (${changed.map(l => l.name).join('، ')}). المالك بس يقدر يوافق بسعر الطلب`);
      let inv; orderCredit = true;
      const fee = deliveryFee == null ? 0 : deliveryFee; need(isInt(fee) && fee >= 0 && fee <= 500000, 'رسوم التوصيل غير صحيحة');
      const when = cleanEta(eta);
      try { inv = invoice({ date: T, customerId: c.id, lines: o.lines.map(l => ({ productId: l.productId, packSize: l.packSize, count: l.count, pricePerKg: l.pricePerKg })), method: 'credit', vatIncluded: true, deliveryFee: fee }); } finally { orderCredit = false; }
      o.delivery = { fee, eta: when, note: cleanNote(note), setBy: S.currentUser, setAt: stamp(T) };
      olog(o, 'delivery', `${fee ? 'توصيل ' + money(fee) : 'توصيل مجاني'}${when ? ' · ' + when.text : ''}`);
      Object.assign(o, { status: 'approved', customerId: c.id, invoiceId: inv.id, invoiceNo: inv.no, decidedBy: S.currentUser, decidedAt: stamp(T) });
      olog(o, 'approved', `فاتورة ${inv.no}`);
      audit('order_approve', o.no, `موافقة على طلب واتساب ${o.no} ← فاتورة ${inv.no}`);
    };
    if (action === 'approve') { approve(); if (o.proof && o.proof.status === 'ok') collect(o.total, 'تحويل إنستاباي'); return o; }
    if (action === 'proofok') { // the owner checked the InstaPay transfer: it arrived
      need(o.proof && o.proof.status === 'pending' && !o.receiptNo, 'مفيش صورة تحويل مستنية مراجعة');
      o.proof.status = 'ok'; olog(o, 'proof', 'التحويل وصل');
      if (o.status === 'approved') collect(o.total, 'تحويل إنستاباي');
      return o;
    }
    if (action === 'send') { // send the customer the confirmation, delivery time and (when paid) the invoice
      need(o.status === 'approved', 'الطلب لازم يتوافق عليه الأول'); need(!o.test, 'ده طلب تجربة');
      if (eta) { o.delivery = Object.assign(o.delivery || {}, { eta: cleanEta(eta), note: cleanNote(note) }); }
      o.sentAt = stamp(T); o.sentBy = S.currentUser; if (o.receiptNo) o.invoiceSentAt = o.sentAt;
      olog(o, 'send', o.receiptNo ? 'التأكيد والفاتورة' : 'التأكيد وميعاد التوصيل'); return o;
    }
    if (action === 'eta') {
      need(o.status === 'approved', 'الطلب لازم يتوافق عليه الأول');
      o.delivery = Object.assign(o.delivery || {}, { eta: cleanEta(eta), note: note == null ? (o.delivery || {}).note || '' : cleanNote(note) });
      olog(o, 'edited', `ميعاد التوصيل اتغير: ${o.delivery.eta.text}`); return o;
    }
    if (action === 'paid') {
      need(!o.receiptNo, 'الطلب ده اتحصّل قبل كده');
      if (o.status === 'pending') { // InstaPay confirmed before review (Telegram «وصلت»): only mark the transfer, the invoice waits for the review
        need(o.proof && o.proof.status !== 'rejected', 'الطلب لازم يتوافق عليه الأول');
        o.proof.status = 'ok'; olog(o, 'proof', 'التحويل وصل'); return o;
      }
      need(o.status === 'approved', 'الطلب لازم يكون متوافق عليه');
      if (o.proof && o.proof.status === 'pending') o.proof.status = 'ok';
      collect(invOf().total, o.paidAmount ? 'الباقي عند الاستلام' : ''); if (o.sentAt && o.receiptNo) o.invoiceSentAt = stamp(T);
      return o;
    }
    if (action === 'nopay') { // the transfer screenshot did not match a real transfer
      need(o.proof && !o.receiptNo, 'مفيش صورة تحويل مستنية مراجعة');
      o.proof.status = 'rejected'; olog(o, 'proof_rejected', String(reason || 'التحويل موصلش').slice(0, 200)); return o;
    }
    if (action === 'resend') { need(o.status === 'approved' && o.invoiceId, 'الفاتورة بتتبعت بعد الموافقة'); olog(o, 'edited', 'طلب إعادة إرسال الفاتورة'); return o; }
    fail('عملية غير معروفة');
  });
}

function supplierPayment({ date, supplierId, amount, method, memo }) {
  return tx(() => {
    perm('accountant'); checkDate(date);
    const s = partner(supplierId); need(s.type === 'supplier', 'اختار مورد');
    need(METHOD_ACC[method], 'اختار طريقة السداد');
    need(isInt(amount) && amount > 0, 'المبلغ غير صحيح');
    need(cashBalance(METHOD_ACC[method]) >= amount, `رصيد ${METHOD_NAME[method]} مش كفاية`);
    const no = nextNo('PY');
    const je = post({ date, type: 'payment', ref: { type: 'payment', no }, memo: `سداد ${no} لـ ${s.name}${memo ? ' · ' + memo : ''}`, lines: [{ acc: '2101', dr: amount, partner: s.id }, { acc: METHOD_ACC[method], cr: amount }] });
    const doc = { id: uid('PY'), no, date, supplierId, amount, method, memo: memo || '', je: je.no, by: S.currentUser, at: je.at };
    S.docs.payments.push(doc);
    audit('payment', no, `سداد ${money(amount)} لـ ${s.name} (${METHOD_NAME[method]})`, date);
    return doc;
  });
}
const EXPENSE_ACCS = ['5201', '5202', '5203', '5301', '5302', '5401', '5402', '5403'];
function expense({ date, acc, amount, method, memo }) {
  return tx(() => {
    perm('accountant'); checkDate(date);
    need(EXPENSE_ACCS.includes(acc), 'اختار نوع المصروف');
    need(METHOD_ACC[method], 'اختار طريقة الدفع');
    need(isInt(amount) && amount > 0, 'المبلغ غير صحيح');
    need(cashBalance(METHOD_ACC[method]) >= amount, `رصيد ${METHOD_NAME[method]} مش كفاية`);
    const no = nextNo('EX');
    const name = ACCOUNTS.find(a => a.code === acc).name;
    const je = post({ date, type: 'expense', ref: { type: 'expense', no }, memo: `${name}${memo ? ' · ' + memo : ''}`, lines: [{ acc, dr: amount }, { acc: METHOD_ACC[method], cr: amount }] });
    const doc = { id: uid('EX'), no, date, acc, amount, method, memo: memo || '', je: je.no, by: S.currentUser, at: je.at };
    S.docs.expenses.push(doc);
    audit('expense', no, `مصروف ${name}: ${money(amount)}`, date);
    return doc;
  });
}
function cashTransfer({ date, from, to, amount }) {
  return tx(() => {
    perm('accountant'); checkDate(date);
    need(METHOD_ACC[from] && METHOD_ACC[to] && from !== to, 'اختار حسابين مختلفين');
    need(isInt(amount) && amount > 0, 'المبلغ غير صحيح');
    need(cashBalance(METHOD_ACC[from]) >= amount, `رصيد ${METHOD_NAME[from]} مش كفاية`);
    const no = nextNo('CT');
    const je = post({ date, type: 'cash', ref: { type: 'cash', no }, memo: `تحويل من ${METHOD_NAME[from]} إلى ${METHOD_NAME[to]}`, lines: [{ acc: METHOD_ACC[to], dr: amount }, { acc: METHOD_ACC[from], cr: amount }] });
    S.docs.cash.push({ id: uid('CT'), no, date, from, to, amount, je: je.no, by: S.currentUser, at: je.at });
    audit('cash', no, `تحويل ${money(amount)} من ${METHOD_NAME[from]} إلى ${METHOD_NAME[to]}`, date);
  });
}
function monthlyDepreciation(s) { return s.assets.reduce((sum, a) => sum + Math.round(a.value * a.rate / 100 / 12), 0); }
function depreciate({ month }) { // month 'YYYY-MM'
  return tx(() => {
    perm('accountant');
    need(/^\d{4}-\d{2}$/.test(month), 'الشهر غير صحيح');
    need(!S.docs.depreciation.some(d => d.month === month), 'إهلاك الشهر ده متسجل قبل كده');
    const date = monthEnd(month + '-01');
    need(date <= today(), 'الشهر لسه مخلصش');
    const amount = monthlyDepreciation(S); need(amount > 0, 'مفيش أصول');
    const je = post({ date, type: 'depreciation', ref: { type: 'depreciation', no: month }, memo: `إهلاك شهر ${month}`, lines: [{ acc: '5501', dr: amount }, { acc: '1599', cr: amount }] });
    S.docs.depreciation.push({ month, date, amount, je: je.no });
    audit('depreciation', month, `قيد إهلاك شهر ${month}: ${money(amount)}`, date);
  });
}

/* low stock & expiry watcher: raises a stored (and Telegram) alert once per crossing */
function itemQty(id) { return S.lots.filter(l => l.itemId === id && l.qty > 0).reduce((s, l) => s + l.qty, 0); }
function watch(date) {
  for (const it of S.items) {
    if (!it.minQty) continue;
    const q = itemQty(it.id);
    if (q < it.minQty && !S.flags.low[it.id]) { S.flags.low[it.id] = date; alert(q === 0 ? 'bad' : 'warn', 'low', `${it.name} قرب يخلص: فاضل ${fmtQty(q, it.unit)} والحد الأدنى ${fmtQty(it.minQty, it.unit)}`, { type: 'item', id: it.id, no: it.code }, date); }
    if (q >= it.minQty && S.flags.low[it.id]) delete S.flags.low[it.id];
  }
  for (const l of S.lots) {
    if (l.qty <= 0 || l.cat === 'byproduct' || S.flags.exp[l.id]) continue;
    const d = daysBetween(date, l.expDate), lim = l.cat === 'product' ? 14 : 3;
    if (d <= lim) { S.flags.exp[l.id] = date; const it = item(l.itemId); alert(d < 0 ? 'bad' : 'warn', 'exp', `${it.name} · دفعة ${l.code}: ${d < 0 ? 'صلاحيتها انتهت' : d === 0 ? 'صلاحيتها بتنتهي النهارده' : 'فاضل ' + d + ' يوم على انتهاء الصلاحية'} (${fmtQty(l.qty, it.unit)} في ${whName(l.wh)})`, { type: 'lot', id: l.id, no: l.code }, date); }
  }
}
function writeOff({ date, lotId, qty, reason }) {
  return tx(() => {
    perm('storekeeper'); checkDate(date);
    const l = S.lots.find(x => x.id === lotId); need(l, 'الدفعة غير موجودة');
    need(isInt(qty) && qty > 0 && qty <= l.qty, 'الكمية أكبر من رصيد الدفعة');
    need(reason && reason.trim().length >= 3, 'اكتب سبب الإعدام');
    const it = item(l.itemId);
    const p = takeFromLot(l, qty);
    const no = nextNo('WO');
    let je = null;
    if (p.value > 0) je = post({ date, type: 'writeoff', ref: { type: 'writeoff', no }, memo: `إعدام ${it.name} (دفعة ${l.code}) · ${reason.trim()}`, lines: [{ acc: '5102', dr: p.value }, { acc: CAT_ACC[it.cat], cr: p.value }] }).no;
    const doc = { id: uid('W'), no, date, lotCode: l.code, itemId: it.id, wh: l.wh, qty, value: p.value, reason: reason.trim(), je, by: S.currentUser, at: stamp(date) };
    S.docs.writeoffs.push(doc);
    audit('writeoff', no, `إعدام ${fmtQty(qty, it.unit)} ${it.name} من دفعة ${l.code} بقيمة ${money(p.value)} · ${doc.reason}`, date);
    return doc;
  });
}

/* ---------- users (auth accounts live on the server; this keeps names/roles for the books) ---------- */
function updateSelf({ name, avatar }) {
  return tx(() => {
    const u = S.users.find(x => x.id === S.currentUser); need(u, 'المستخدم غير موجود'); need(u.active !== false, 'الحساب ده موقوف');
    need(name && name.trim().length >= 2 && name.trim().length <= 40, 'الاسم لازم من ٢ لـ ٤٠ حرف');
    if (avatar !== undefined && avatar !== null && avatar !== '') { need(typeof avatar === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(avatar), 'الصورة لازم تكون PNG أو JPG'); need(avatar.length <= 90000, 'الصورة كبيرة، اختار صورة أصغر'); }
    const old = u.name; u.name = name.trim(); if (avatar !== undefined) u.avatar = avatar || '';
    audit('profile', u.username || u.id, old !== u.name ? `غيّر اسمه من ${old} إلى ${u.name}` : 'حدّث صورته');
    return { name: u.name, avatar: u.avatar || '' };
  });
}
function upsertUser({ id, username, name, role, active = true }) {
  return tx(() => {
    perm();
    need(id && username && name && name.trim(), 'بيانات المستخدم ناقصة');
    need(ROLES[role], 'الدور غير صحيح');
    const ex = S.users.find(u => u.id === id);
    if (ex) {
      if (ex.id === S.currentUser) need(role === 'owner' && active, 'مينفعش تشيل صلاحية المالك من حسابك');
      Object.assign(ex, { username, name: name.trim(), role, active });
      audit('user_edit', username, `تعديل المستخدم ${name.trim()} (${ROLES[role].name}${active ? '' : '، موقوف'})`);
      return ex;
    }
    need(!S.users.some(u => u.username === username), 'اسم المستخدم مستخدم قبل كده');
    const u = { id, username, name: name.trim(), role, active };
    S.users.push(u);
    audit('user_add', username, `إضافة مستخدم ${u.name} (${ROLES[role].name})`);
    return u;
  });
}

/* ---------- opening balances (one balanced entry; difference goes to capital) ---------- */
function openingBalances({ date, cash = 0, bank = 0, instapay = 0, assets = [], stock = [], customers = [], suppliers = [] }) {
  return tx(() => {
    perm('accountant'); checkDate(date);
    const lines = []; let dr = 0, cr = 0;
    const D = (acc, v, partnerId) => { if (v) { need(isInt(v) && v > 0, 'مبلغ غير صحيح'); lines.push({ acc, dr: v, partner: partnerId || null }); dr += v; } };
    const C = (acc, v, partnerId) => { if (v) { need(isInt(v) && v > 0, 'مبلغ غير صحيح'); lines.push({ acc, cr: v, partner: partnerId || null }); cr += v; } };
    D('1101', cash); D('1102', bank); D('1103', instapay);
    const no = nextNo('OB');
    for (const a of assets) {
      need(a.name && a.name.trim(), 'اكتب اسم الأصل'); need(['1501', '1502', '1503', '1504'].includes(a.acc), 'نوع الأصل غير صحيح');
      need(isInt(a.value) && a.value > 0, `قيمة "${a.name}" غير صحيحة`); need(isInt(a.rate) && a.rate >= 0 && a.rate <= 100, 'نسبة الإهلاك غير صحيحة');
      S.assets.push({ id: uid('FA'), name: a.name.trim(), acc: a.acc, value: a.value, rate: a.rate, date }); D(a.acc, a.value);
    }
    const stockAcc = {};
    for (const st of stock) {
      const it = item(st.itemId);
      need(isInt(st.qty) && st.qty > 0, `كمية "${it.name}" غير صحيحة`); need(isInt(st.unitCost) && st.unitCost > 0, `تكلفة "${it.name}" غير صحيحة`);
      need(isDay(st.expDate), `اكتب تاريخ صلاحية "${it.name}" صح`); need(!st.prodDate || (isDay(st.prodDate) && st.prodDate <= date), `تاريخ إنتاج "${it.name}" غير صحيح`);
      need(st.expDate && st.expDate > date, `صلاحية "${it.name}" لازم تكون بعد تاريخ البداية`);
      const wh = it.cat === 'product' ? (whUse(st.wh) === 'fg' ? st.wh : whs('fg')[0]) : it.cat === 'pack' ? whs('pack')[0] : (['raw', 'receiving'].includes(whUse(st.wh)) ? st.wh : whs('raw')[0]);
      if (it.cat === 'product') { need(packsOf(it).includes(st.packSize), `اختار عبوة "${it.name}"`); need(st.qty % st.packSize === 0, `كمية "${it.name}" لازم تكون عدد عبوات كامل`); }
      const value = mulDiv(st.qty, st.unitCost, unitBase(it.unit));
      newLot({ itemId: it.id, wh, qty: st.qty, value, inDate: date, prodDate: st.prodDate || date, expDate: st.expDate, packSize: it.cat === 'product' ? st.packSize : null, src: { type: 'opening', no } });
      stockAcc[CAT_ACC[it.cat]] = (stockAcc[CAT_ACC[it.cat]] || 0) + value;
    }
    for (const [acc, v] of Object.entries(stockAcc)) D(acc, v);
    for (const c of customers) { need(partner(c.id).type === 'customer', 'عميل غير صحيح'); D('1201', c.amount, c.id); }
    for (const s2 of suppliers) { need(partner(s2.id).type === 'supplier', 'مورد غير صحيح'); C('2101', s2.amount, s2.id); }
    need(dr > 0 || cr > 0, 'مفيش أرصدة');
    if (dr > cr) C('3101', dr - cr); else if (cr > dr) D('3101', cr - dr);
    const je = post({ date, type: 'opening', ref: { type: 'opening', no }, memo: `أرصدة افتتاحية ${no}`, lines });
    S.docs.openings = S.docs.openings || [];
    S.docs.openings.push({ no, date, je: je.no, by: S.currentUser, at: je.at, total: je.total });
    audit('opening', no, `تسجيل أرصدة افتتاحية ${no} بإجمالي ${money(je.total)}`, date);
    return je;
  });
}

/* go-live: wipe every transaction, keep the setup (items, prices, recipes, customers, suppliers, users, settings) */
function resetBooks() {
  return tx(() => {
    perm();
    const keep = { warehouses: S.warehouses, users: S.users, items: S.items, partners: S.partners, recipes: S.recipes, settings: S.settings, currentUser: S.currentUser, mode: S.mode, priceHistory: S.priceHistory };
    const by = S.currentUser, counts = `${S.journal.length} قيد، ${S.docs.invoices.length} فاتورة، ${S.docs.batches.length} تشغيلة`;
    S = Object.assign(freshState(), keep);
    S.partners = S.partners.filter(p => !p.sample);
    S.items.forEach(it => { S.flags.low[it.id] = today(); });
    S.currentUser = by;
    audit('reset', 'بدء التشغيل', `تصفير الحسابات لبدء التشغيل الفعلي (اتمسح ${counts} والعملاء والموردين التجريبيين)`);
  });
}

function saveWarehouse({ id, name, use }) {
  return tx(() => {
    perm('storekeeper');
    need(name && name.trim().length >= 2, 'اكتب اسم التلاجة أو المخزن'); need(WH_USE[use], 'اختار النوع');
    if (id) {
      const w = warehouses().find(x => x.id === id); need(w, 'المكان غير موجود');
      if (w.use !== use) need(!S.lots.some(l => l.wh === id && l.qty > 0), 'فيه بضاعة جوه، فرّغه الأول عشان تغيّر نوعه');
      const old = w.name; w.name = name.trim(); w.use = use;
      audit('warehouse', id, `تعديل ${old} ← ${w.name} (${WH_USE[use]})`); return w;
    }
    need(!warehouses().some(w => w.name === name.trim()), 'الاسم ده موجود قبل كده');
    const n = Math.max(0, ...warehouses().map(w => parseInt(w.id.slice(1), 10) || 0)) + 1;
    const w = { id: 'W' + n, name: name.trim(), use }; S.warehouses.push(w);
    audit('warehouse', w.id, `إضافة ${WH_USE[use]}: ${w.name}`); return w;
  });
}
function setRecipe(productId, mix) {
  return tx(() => {
    perm('supervisor');
    const p = item(productId); need(p.cat === 'product', 'اختار منتج');
    const clean = {}; let sum = 0;
    for (const [id, pc] of Object.entries(mix || {})) { if (!pc) continue; const it = item(id); need(['meat', 'spice', 'byproduct'].includes(it.cat), `"${it.name}" مش خامة`); need(typeof pc === 'number' && pc > 0 && pc <= 100, 'النسبة غير صحيحة'); clean[id] = pc; sum += pc; }
    need(!Object.keys(clean).length || Math.abs(sum - 100) < 0.01, `مجموع النسب لازم يكون 100% (دلوقتي ${sum}%)`);
    S.recipes = S.recipes || {}; S.recipes[productId] = clean;
    audit('recipe', p.code, `تعديل الوصفة المعتادة لـ ${p.name}`);
  });
}

/* ---------- master data ---------- */
function saveItem(o) {
  return tx(() => {
    perm();
    need(o.name && o.name.trim(), 'اكتب اسم الصنف');
    need(CAT_ACC[o.cat], 'اختار نوع الصنف');
    if (o.id) o.code = item(o.id).code; // codes never change once given
    else { // next free code in the category's series: RM meat, SP spices, PK packaging, FG products
      const pre = { carcass: 'RM', meat: 'RM', byproduct: 'RM', spice: 'SP', pack: 'PK', product: 'FG' }[o.cat];
      const used = S.items.filter(i => i.code.startsWith(pre + '-')).map(i => parseInt(i.code.slice(3), 10) || 0);
      o.code = `${pre}-${Math.max(0, ...used) + 1}`;
    }
    for (const f of ['priceRetail', 'priceWholesale', 'minQty', 'vat']) need(isInt(o[f] || 0) && (o[f] || 0) >= 0, 'قيمة غير صحيحة');
    if (o.cat === 'product') need(o.priceRetail > 0 && o.priceWholesale > 0, 'المنتج لازم له سعر قطاعي وجملة');
    if (o.id) {
      const it = item(o.id);
      for (const f of ['priceRetail', 'priceWholesale']) if (it[f] !== o[f]) {
        S.priceHistory.push({ id: uid('PH'), at: stamp(today()), user: S.currentUser, itemId: it.id, field: f, old: it[f], new: o[f] });
        audit('price', it.code, `تعديل ${f === 'priceRetail' ? 'سعر القطاعي' : 'سعر الجملة'} لـ ${it.name}: ${money(it[f])} ← ${money(o[f])}`);
      }
      if (it.unit !== o.unit) need(!S.lots.some(l => l.itemId === it.id), 'مينفعش تغيّر وحدة صنف عليه حركات');
      if (it.cat !== o.cat) need(!S.lots.some(l => l.itemId === it.id), 'مينفعش تغيّر نوع صنف عليه حركات');
      if (it.cat === 'product' && o.group) it.group = o.group;
      Object.assign(it, { name: o.name.trim(), code: o.code, cat: o.cat, unit: o.unit, priceRetail: o.priceRetail || 0, priceWholesale: o.priceWholesale || 0, minQty: o.minQty || 0, vat: o.vat || 0 });
      audit('item_edit', it.code, `تعديل بيانات الصنف ${it.name}`);
      return it;
    }
    need(!S.items.some(i => i.name === o.name.trim()), 'فيه صنف بنفس الاسم');
    const it = { id: uid('IT'), code: o.code, name: o.name.trim(), cat: o.cat, unit: o.cat === 'pack' ? 'pc' : o.unit, priceRetail: o.priceRetail || 0, priceWholesale: o.priceWholesale || 0, minQty: o.minQty || 0, vat: o.vat || 0, active: true };
    if (o.cat === 'product') { it.packs = PACK_SIZES.slice(); it.group = o.group || 'مصنعات'; }
    S.items.push(it);
    audit('item_add', it.code, `إضافة صنف جديد: ${it.name}`);
    return it;
  });
}
function savePartner(o) {
  return tx(() => {
    perm('sales', 'accountant', 'storekeeper');
    need(o.name && o.name.trim(), 'اكتب الاسم');
    need(['customer', 'supplier'].includes(o.type), 'النوع غير صحيح');
    if (o.type === 'customer') { need(['retail', 'wholesale'].includes(o.kind), 'اختار نوع العميل'); need(['cash', 'credit'].includes(o.terms), 'اختار طريقة التعامل'); }
    let items = [];
    if (o.type === 'supplier') {
      items = [...new Set(o.items || [])];
      for (const id of items) { const it = item(id); need(!['product', 'byproduct'].includes(it.cat), `"${it.name}" مش صنف بيتشرى من مورد`); }
      need(items.length, 'اختار الأصناف اللي المورد ده بيورّدها');
    }
    if (o.id) {
      const p = partner(o.id);
      const added = items.filter(i => !(p.items || []).includes(i)), removed = (p.items || []).filter(i => !items.includes(i));
      Object.assign(p, { name: o.name.trim(), phone: o.phone || '', kind: o.kind, terms: o.terms, taxId: o.taxId || '', supplies: o.supplies || '' }); if (o.type === 'supplier') p.items = items;
      audit('partner_edit', p.name, `تعديل بيانات ${p.name}${added.length ? ' · أصناف جديدة: ' + added.map(i => item(i).name).join('، ') : ''}${removed.length ? ' · اتشال: ' + removed.map(i => item(i).name).join('، ') : ''}`);
      return p;
    }
    need(!S.partners.some(x => x.type === o.type && x.name === o.name.trim()), 'الاسم ده متسجل قبل كده');
    const p = { id: uid(o.type === 'customer' ? 'CU' : 'SU'), type: o.type, name: o.name.trim(), phone: o.phone || '', kind: o.kind || null, terms: o.terms || 'credit', taxId: o.taxId || '', supplies: o.supplies || '', items, createdAt: today() };
    S.partners.push(p);
    audit('partner_add', p.name, `إضافة ${o.type === 'customer' ? 'عميل' : 'مورد'}: ${p.name}`);
    return p;
  });
}
function setUser(id) { need(S.users.some(u => u.id === id), 'مستخدم غير معروف'); S.currentUser = id; save(); }
function updateSettings(o) {
  return tx(() => {
    perm();
    need(isInt(o.issueLimitKg) && o.issueLimitKg > 0, 'حد الصرف غير صحيح');
    need(isInt(o.vatRate) && o.vatRate >= 0 && o.vatRate <= 100, 'نسبة الضريبة غير صحيحة');
    S.settings.issueLimitKg = o.issueLimitKg; S.settings.vatRate = o.vatRate; S.settings.telegram = !!o.telegram;
    S.settings.tgToken = (o.tgToken || '').trim(); S.settings.tgChat = (o.tgChat || '').trim();
    Object.assign(S.settings.company, o.company || {});
    audit('settings', 'الإعدادات', `تعديل الإعدادات: حد الصرف ${o.issueLimitKg} كجم، الضريبة ${o.vatRate}%`);
  });
}
function markAlertsRead(ids) { return tx(() => { S.alerts.forEach(a => { if (!ids || ids.includes(a.id)) a.read = true; }); }); }

/* ---------- reports ---------- */
function ledger({ from, to } = {}) { // per-account dr/cr inside [from,to]
  const m = {};
  for (const j of S.journal) {
    if ((from && j.date < from) || (to && j.date > to)) continue;
    for (const l of j.lines) { const a = m[l.acc] || (m[l.acc] = { dr: 0, cr: 0 }); a.dr += l.dr; a.cr += l.cr; }
  }
  return m;
}
function bal(m, code) { const a = m[code]; if (!a) return 0; return debitNature(code) ? a.dr - a.cr : a.cr - a.dr; }
function groupBal(m, prefixCodes) { return prefixCodes.reduce((s, c) => s + bal(m, c), 0); }
const leafUnder = code => [...LEAF].filter(c => { let a = ACCOUNTS.find(x => x.code === c); while (a) { if (a.code === code) return true; a = ACCOUNTS.find(x => x.code === a.parent); } return false; });

function trialBalance({ from, to }) {
  const open = from ? ledger({ to: addDays(from, -1) }) : {};
  const per = ledger({ from, to });
  const rows = [...LEAF].sort().map(code => {
    const o = open[code] || { dr: 0, cr: 0 }, p = per[code] || { dr: 0, cr: 0 };
    const net = (o.dr + p.dr) - (o.cr + p.cr);
    return { code, name: ACCOUNTS.find(a => a.code === code).name, openDr: Math.max(o.dr - o.cr, 0), openCr: Math.max(o.cr - o.dr, 0), dr: p.dr, cr: p.cr, endDr: Math.max(net, 0), endCr: Math.max(-net, 0) };
  }).filter(r => r.openDr || r.openCr || r.dr || r.cr);
  const sum = k => rows.reduce((s, r) => s + r[k], 0);
  return { rows, totals: { openDr: sum('openDr'), openCr: sum('openCr'), dr: sum('dr'), cr: sum('cr'), endDr: sum('endDr'), endCr: sum('endCr') } };
}
function incomeStatement({ from, to }) {
  const m = ledger({ from, to });
  const r = { retail: bal(m, '4101'), wholesale: bal(m, '4102'), delivery: bal(m, '4103') };
  r.revenue = r.retail + r.wholesale + r.delivery;
  r.cogs = bal(m, '5101');
  r.gross = r.revenue - r.cogs;
  r.factory = ['5102', '5201', '5202', '5203'].map(c => ({ code: c, amount: bal(m, c) }));
  r.selling = ['5301', '5302'].map(c => ({ code: c, amount: bal(m, c) }));
  r.admin = ['5401', '5402', '5403', '5501'].map(c => ({ code: c, amount: bal(m, c) }));
  const s = a => a.reduce((x, y) => x + y.amount, 0);
  r.factoryT = s(r.factory); r.sellingT = s(r.selling); r.adminT = s(r.admin);
  r.opex = r.factoryT + r.sellingT + r.adminT;
  r.net = r.gross - r.opex;
  return r;
}
function balanceSheet({ asOf }) {
  const m = ledger({ to: asOf });
  const B = c => bal(m, c);
  const fixed = ['1501', '1502', '1503', '1504'].map(c => ({ code: c, amount: B(c) }));
  const dep = B('1599'); // contra: debit nature => negative value
  const current = ['1101', '1102', '1103', '1201', '1301', '1302', '1303', '1304', '1305', '1401'].map(c => ({ code: c, amount: B(c) }));
  const liab = ['2101', '2102'].map(c => ({ code: c, amount: B(c) }));
  const earnings = leafUnder('4').reduce((s, c) => s + B(c), 0) - leafUnder('5').reduce((s, c) => s + B(c), 0);
  const equity = [{ code: '3101', amount: B('3101') }, { code: '3201', amount: B('3201') }];
  const sum = a => a.reduce((s, x) => s + x.amount, 0);
  const fixedNet = sum(fixed) + dep;
  const assets = fixedNet + sum(current);
  const liabT = sum(liab), equityT = sum(equity) + earnings;
  return { fixed, dep, fixedNet, current, currentT: sum(current), assets, liab, liabT, equity, earnings, equityT, balanced: assets === liabT + equityT, diff: assets - liabT - equityT };
}
function manufacturingAccount({ from, to }) {
  const before = ledger({ to: addDays(from, -1) }), end = ledger({ to });
  const raw = ['1301', '1302'], pack = ['1303'];
  const sumB = (m, cs) => cs.reduce((s, c) => s + bal(m, c), 0);
  const purch = { raw: 0, pack: 0 }, used = { raw: 0, pack: 0 }, returned = { raw: 0, pack: 0 }, lost = { raw: 0, pack: 0, fg: 0 }, openIn = { raw: 0, pack: 0, fg: 0, wip: 0 };
  let produced = 0;
  for (const j of S.journal) {
    if (j.date < from || j.date > to) continue;
    for (const l of j.lines) {
      const k = raw.includes(l.acc) ? 'raw' : pack.includes(l.acc) ? 'pack' : null;
      if (k && j.type === 'purchase') purch[k] += l.dr;
      if (k && j.type === 'issue') used[k] += l.cr;
      if (k && j.type === 'issue_reverse') returned[k] += l.dr;
      if (j.type === 'opening') { if (k) openIn[k] += l.dr - l.cr; if (l.acc === '1305') openIn.fg += l.dr - l.cr; if (l.acc === '1304') openIn.wip += l.dr - l.cr; }
      if (k && j.type === 'writeoff') lost[k] += l.cr;
      if (l.acc === '1305' && j.type === 'writeoff') lost.fg += l.cr;
      if (l.acc === '1305' && j.type === 'batch_close') produced += l.dr;
    }
  }
  const r = {
    rawOpen: sumB(before, raw) + openIn.raw, rawPurch: purch.raw, rawClose: sumB(end, raw),
    packOpen: sumB(before, pack) + openIn.pack, packPurch: purch.pack, packClose: sumB(end, pack),
    wipOpen: bal(before, '1304') + openIn.wip, wipClose: bal(end, '1304'),
    fgOpen: bal(before, '1305') + openIn.fg, fgClose: bal(end, '1305'),
  };
  r.rawLost = lost.raw; r.packLost = lost.pack; r.fgLost = lost.fg;
  r.rawUsed = r.rawOpen + r.rawPurch - r.rawLost - r.rawClose;
  r.packUsed = r.packOpen + r.packPurch - r.packLost - r.packClose;
  r.production = r.rawUsed + r.packUsed + r.wipOpen - r.wipClose;
  r.producedPosted = produced;
  r.cogs = r.fgOpen + r.production - r.fgLost - r.fgClose;
  const is = incomeStatement({ from, to });
  r.revenue = is.revenue; r.cogsPosted = is.cogs; r.gross = r.revenue - r.cogs;
  r.check = r.production === produced && r.cogs === is.cogs;
  return r;
}
function partnerBalance(id) {
  const p = partner(id); const acc = p.type === 'customer' ? '1201' : '2101';
  let b = 0; for (const j of S.journal) for (const l of j.lines) if (l.acc === acc && l.partner === id) b += p.type === 'customer' ? l.dr - l.cr : l.cr - l.dr;
  return b;
}
function partnerStatement(id) {
  const p = partner(id); const acc = p.type === 'customer' ? '1201' : '2101';
  let run = 0; const rows = [];
  for (const j of S.journal) for (const l of j.lines) if (l.acc === acc && l.partner === id) {
    const dr = l.dr, cr = l.cr; run += p.type === 'customer' ? dr - cr : cr - dr;
    rows.push({ date: j.date, no: j.no, memo: j.memo, ref: j.ref, dr, cr, run });
  }
  return rows;
}
/* integrity: books balanced, sub-ledgers match GL, inventory matches lots */
function integrity() {
  const m = ledger({});
  let dr = 0, cr = 0; for (const a of Object.values(m)) { dr += a.dr; cr += a.cr; }
  const checks = [];
  checks.push({ name: 'كل القيود متوازنة (المدين = الدائن)', ok: dr === cr && S.journal.every(j => j.lines.reduce((s, l) => s + l.dr - l.cr, 0) === 0), detail: `${S.journal.length} قيد` });
  for (const acc of ['1301', '1302', '1303', '1305']) {
    const lotsV = S.lots.filter(l => CAT_ACC[l.cat] === acc).reduce((s, l) => s + l.value, 0);
    checks.push({ name: `${ACCOUNTS.find(a => a.code === acc).name} = قيمة الدفعات في المخازن`, ok: lotsV === bal(m, acc), detail: `${money(bal(m, acc))}` });
  }
  const wip = S.docs.batches.filter(b => b.status === 'open').reduce((s, b) => s + b.issues.filter(i => !i.reversed).reduce((a, i) => a + i.value, 0), 0);
  checks.push({ name: 'إنتاج تحت التشغيل = تكلفة التشغيلات المفتوحة', ok: wip === bal(m, '1304'), detail: money(bal(m, '1304')) });
  const cust = S.partners.filter(p => p.type === 'customer').reduce((s, p) => s + partnerBalance(p.id), 0);
  checks.push({ name: 'رصيد العملاء = مجموع كشوف الحساب', ok: cust === bal(m, '1201'), detail: money(bal(m, '1201')) });
  const sup = S.partners.filter(p => p.type === 'supplier').reduce((s, p) => s + partnerBalance(p.id), 0);
  checks.push({ name: 'رصيد الموردين = مجموع كشوف الحساب', ok: sup === bal(m, '2101'), detail: money(bal(m, '2101')) });
  const bs = balanceSheet({ asOf: today() });
  checks.push({ name: 'الميزانية: الأصول = الخصوم + حقوق الملكية', ok: bs.balanced, detail: money(bs.assets) });
  checks.push({ name: 'مفيش رصيد سالب في المخازن أو الخزنة', ok: S.lots.every(l => l.qty >= 0 && l.value >= 0) && ['1101', '1102', '1103'].every(c => bal(m, c) >= 0), detail: '' });
  return checks;
}
/* live alerts: low stock & expiry (computed, not stored) */
function stockAlerts() {
  const out = [];
  for (const it of S.items) {
    if (!it.minQty) continue;
    const q = S.lots.filter(l => l.itemId === it.id && l.qty > 0).reduce((s, l) => s + l.qty, 0);
    if (q < it.minQty) out.push({ kind: 'low', level: q === 0 ? 'bad' : 'warn', itemId: it.id, qty: q, min: it.minQty, text: `${it.name}: فاضل ${fmtQty(q, it.unit)} (الحد الأدنى ${fmtQty(it.minQty, it.unit)})` });
  }
  const t = today();
  for (const l of S.lots) {
    if (l.qty <= 0 || l.cat === 'byproduct') continue;
    const d = daysBetween(t, l.expDate);
    const lim = l.cat === 'product' ? 14 : 3;
    if (d <= lim) out.push({ kind: 'exp', level: d < 0 ? 'bad' : 'warn', lotId: l.id, itemId: l.itemId, days: d, text: `${item(l.itemId).name} · دفعة ${l.code}: ${d < 0 ? 'انتهت صلاحيتها من ' + (-d) + ' يوم' : d === 0 ? 'صلاحيتها بتنتهي النهارده' : 'فاضل ' + d + ' يوم على الصلاحية'} (${fmtQty(l.qty, item(l.itemId).unit)})` });
  }
  return out;
}

/* ---------- money format (used in messages) ---------- */
function money(p, dec) { const v = p / 100; return v.toLocaleString('en-US', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: 2 }) + ' ج'; }

/* ---------- persistence ---------- */
function save() { if (!S || S.mode === 'live' || typeof localStorage === 'undefined' || !localStorage) return; try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { console.warn('save failed', e); } }
function load() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) { const s = JSON.parse(raw); if (s && s.version === DATA_VERSION) { S = ensureWarehouses(s); return true; } } } catch (e) { /* ignore */ }
  return false;
}
function reset() { seed(); save(); }
function exportJSON() { return JSON.stringify(S, null, 1); }


/* ---------- master data: raw materials, packaging and every product on boommeat.com ---------- */
const WEBSITE = [ // [group, name, retail EGP, packs(g), recipe raw code]
  ['مصنعات', 'انجوس برجر', 485, null, 'FG-401'], ['مصنعات', 'كفته حاتي الانجوس', 475, null, 'FG-402'], ['مصنعات', 'سجق الانجوس', 480, null, 'FG-403'],
  ['مصنعات', 'حواوشي الانجوس', 420, null, 'FG-404'], ['مصنعات', 'ميت بولز الانجوس', 475, null, 'FG-405'], ['مصنعات', 'كفته ارز', 415, null, 'FG-406'],
  ['قطعيات', 'كتف الانجوس', 575, 'RM-101'], ['قطعيات', 'سن الانجوس', 570, 'RM-102'], ['قطعيات', 'موزة الانجوس', 555, 'RM-103'], ['قطعيات', 'ريش الانجوس', 580, 'RM-104'],
  ['قطعيات', 'لحم مفروم انجوس ممتاز', 535, 'RM-105'], ['قطعيات', 'رقبه الانجوس', 570], ['قطعيات', 'بيكاتا الانجوس', 595], ['قطعيات', 'كبدة الانجوس', 640],
  ['قطعيات', 'كولاته الانجوس', 590], ['قطعيات', 'ستيك الانجوس', 595], ['قطعيات', 'قلب انجوس', 480], ['قطعيات', 'بفتيك الانجوس', 595],
  ['قطعيات', 'لحم مفروم انجوس مخصوص', 555], ['قطعيات', 'شاورما الانجوس', 585], ['قطعيات', 'كلاوي الانجوس', 470], ['قطعيات', 'كباب حله الانجوس', 595],
  ['قطعيات', 'عكاوي الانجوس', 515], ['قطعيات', 'كبدة الانجوس اسكندراني', 650], ['قطعيات', 'مكعبات خضار', 585], ['قطعيات', 'انتركوت الانجوس', 585],
  ['قطعيات', 'لحم مفروم سوبر انجوس', 580], ['قطعيات', 'روستو الانجوس', 580], ['قطعيات', 'انجوس ريب اي', 660], ['قطعيات', 'مخاصي الانجوس', 425],
  ['قطعيات مميزة', 'استربليون الانجوس', 825], ['قطعيات مميزة', 'انجوس اي راوند ستيك', 625], ['قطعيات مميزة', 'انجوس ريب اي قطع خاصة', 800], ['قطعيات مميزة', 'فلتو صولو الانجوس', 900],
  ['قطعيات مميزة', 'نيويورك ستيك', 1075], ['قطعيات مميزة', 'انجوس فلانك ستيك', 625], ['قطعيات مميزة', 'انجوس هانجر ستيك', 605], ['قطعيات مميزة', 'ستيك سمانه الانجوس', 620],
  ['قطعيات مميزة', 'انجوس مانسيه', 570], ['قطعيات مميزة', 'شورت ريبس الانجوس', 615], ['قطعيات مميزة', 'دوش الانجوس (بريسكيت)', 535],
  ['مقبلات', 'ممبار محشو بالارز', 405], ['لحوم باردة', 'هوت دوج الانجوس', 100], ['لحوم باردة', 'بيكون الانجوس', 150], ['لحوم باردة', 'لانشون فلفل الانجوس', 115],
  ['لحوم باردة', 'لانشون زيتون الانجوس', 115], ['لحوم باردة', 'سلامي الانجوس', 110], ['لحوم باردة', 'لانشون ساده الانجوس', 110], ['لحوم باردة', 'لانشون بسطرمه الانجوس', 115],
  ['لحوم باردة', 'روزبيف الانجوس', 150], ['لحوم باردة', 'بيبروني الانجوس', 110],
];
const GROUP_PACKS = { 'مصنعات': PACK_SIZES, 'قطعيات': PACK_SIZES, 'قطعيات مميزة': PACK_SIZES, 'مقبلات': PACK_SIZES, 'لحوم باردة': PACK_SIZES };
function masterData() {
  const kg = x => Math.round(x * 1000), egp = x => Math.round(x * 100);
  const I = (code, name, cat, unit, retail, extra = {}) => { const it = { id: 'it_' + code, code, name, cat, unit, priceRetail: egp(retail || 0), priceWholesale: egp(retail ? Math.round(retail * 0.9 / 5) * 5 : 0), minQty: 0, vat: 0, active: true, ...extra }; S.items.push(it); return it; };
  I('RM-100', 'ربع بقري انجوس بالعضم', 'carcass', 'kg', 0, { minQty: kg(300) });
  I('RM-190', 'عضم', 'byproduct', 'kg', 0);
  I('RM-106', 'دهن بقري (خام)', 'meat', 'kg', 140, { minQty: kg(60) });
  const MIN = { 'RM-101': 150, 'RM-102': 100, 'RM-103': 60, 'RM-104': 50, 'RM-105': 150 };
  let rn = 110, fn = 410;
  S.recipes = {};
  for (const [group, name, price, rawOrFg, fgCode] of WEBSITE) {
    // manufactured products have their own recipes; every cut/cold cut gets a matching raw item (100% recipe for cuts)
    const isMade = group === 'مصنعات';
    const code = isMade ? fgCode : 'FG-' + fn++;
    let rawId = null;
    if (group === 'قطعيات' || group === 'قطعيات مميزة') {
      const rc = rawOrFg || 'RM-' + rn++;
      rawId = I(rc, name + ' (خام)', 'meat', 'kg', price, { minQty: kg(MIN[rc] || 0) }).id;
    }
    const retail = group === 'لحوم باردة' ? price * 4 : price; // website cold-cut price assumed per 250 g pack
    I(code, name, 'product', 'kg', retail, { group, packs: GROUP_PACKS[group], minQty: isMade ? kg(code === 'FG-401' ? 120 : code === 'FG-402' || code === 'FG-403' ? 60 : 40) : 0 });
    if (rawId) S.recipes['it_' + code] = { [rawId]: 100 };
  }
  I('SP-201', 'توابل برجر', 'spice', 'kg', 0, { vat: 14, minQty: kg(15) });
  I('SP-202', 'توابل كفتة وحواوشي', 'spice', 'kg', 0, { vat: 14, minQty: kg(15) });
  I('SP-203', 'توابل سجق', 'spice', 'kg', 0, { vat: 14, minQty: kg(10) });
  I('SP-204', 'أرز مصري', 'spice', 'kg', 0, { vat: 0, minQty: kg(60) });
  I('SP-205', 'بقسماط', 'spice', 'kg', 0, { vat: 14, minQty: kg(20) });
  I('SP-206', 'توابل شاورما', 'spice', 'kg', 0, { vat: 14 });
  I('SP-207', 'ملح', 'spice', 'kg', 0, { vat: 0 });
  I('SP-208', 'فلفل أسود', 'spice', 'kg', 0, { vat: 14 });
  I('SP-209', 'ممبار وأمعاء للسجق', 'spice', 'kg', 0, { vat: 0 });
  I('PK-305', 'كيس فاكيوم نص كيلو', 'pack', 'pc', 0, { vat: 14, minQty: 800, packFor: 500 });
  I('PK-310', 'كيس فاكيوم ١ كيلو', 'pack', 'pc', 0, { vat: 14, minQty: 800, packFor: 1000 });
  I('PK-315', 'كيس فاكيوم ١.٥ كيلو', 'pack', 'pc', 0, { vat: 14, minQty: 300, packFor: 1500 });
  I('PK-320', 'كيس فاكيوم ٢ كيلو', 'pack', 'pc', 0, { vat: 14, minQty: 300, packFor: 2000 });
  I('PK-390', 'استيكر بوم ميت', 'pack', 'pc', 0, { vat: 14, minQty: 2000, sticker: true });
  S.items.sort((a, b) => a.code < b.code ? -1 : 1);
}
/* live start: master data only, no transactions */
function liveState(owner) {
  S = freshState();
  S.mode = 'live';
  S.users = [{ id: owner.id, username: owner.username, name: owner.name, role: 'owner', active: true }];
  S.currentUser = owner.id;
  masterData();
  S.partners.push({ id: 'c_cash', type: 'customer', name: 'عميل نقدي', phone: '', kind: 'retail', terms: 'cash', taxId: '', supplies: '', createdAt: today() });
  S.items.forEach(it => { S.flags.low[it.id] = today(); });
  S.settings.tgToken = ''; S.settings.tgChat = '';
  return S;
}
function setState(st) { S = ensureWarehouses(st); return S; }

/* ---------- demo data (generated through the same operations) ---------- */
function rngFactory(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function seed() {
  S = freshState();
  seeding = true; seedClock = 0;
  const R = rngFactory(20261111);
  const rnd = (a, b) => a + R() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const kg = x => Math.round(x * 1000);
  const egp = x => Math.round(x * 100);
  const as = (uidd, fn) => { const prev = S.currentUser; S.currentUser = uidd; try { return fn(); } finally { S.currentUser = prev; } };

  masterData();

  const P = (id, type, name, o = {}) => S.partners.push({ id, type, name, phone: o.phone || '', kind: o.kind || null, terms: o.terms || 'credit', taxId: o.taxId || '', supplies: o.supplies || '', items: o.items || [], createdAt: addDays(today(), -60), sample: o.sample !== false });
  P('s1', 'supplier', 'مزرعة الوادي للمواشي', { phone: '01001234567', supplies: 'لحوم بالعضم', items: ['it_RM-100'] });
  P('s2', 'supplier', 'النيل للحوم المبردة', { phone: '01112345678', supplies: 'قطعيات', items: ['it_RM-101', 'it_RM-102', 'it_RM-105', 'it_RM-106'] });
  P('s3', 'supplier', 'البهارات الذهبية', { phone: '01223456789', supplies: 'توابل وإضافات', items: ['it_SP-201', 'it_SP-202', 'it_SP-203', 'it_SP-204', 'it_SP-205'] });
  P('s4', 'supplier', 'العبوات الحديثة', { phone: '01534567890', supplies: 'أكياس فاكيوم', items: ['it_PK-305', 'it_PK-310', 'it_PK-315', 'it_PK-320'] });
  P('s5', 'supplier', 'مطبعة الشروق', { phone: '01045678901', supplies: 'استيكرات', items: ['it_PK-390'] });
  P('c1', 'customer', 'جاست سماش', { kind: 'wholesale', terms: 'credit', phone: '01098765432', taxId: '111-222-333' });
  P('c2', 'customer', 'مطعم النخيل', { kind: 'wholesale', terms: 'credit', phone: '01187654321', taxId: '222-333-444' });
  P('c3', 'customer', 'الواحة ماركت', { kind: 'wholesale', terms: 'credit', phone: '01276543210', taxId: '333-444-555' });
  P('c4', 'customer', 'برجرجي', { kind: 'wholesale', terms: 'credit', phone: '01565432109', taxId: '444-555-666' });
  P('c5', 'customer', 'عميل نقدي', { kind: 'retail', terms: 'cash' });
  P('c6', 'customer', 'أحمد سمير', { kind: 'retail', terms: 'cash', phone: '01011122233' });
  P('c7', 'customer', 'منى عادل', { kind: 'retail', terms: 'cash', phone: '01122233344' });
  P('c8', 'customer', 'كريم فوزي', { kind: 'retail', terms: 'cash', phone: '01233344455' });
  P('c9', 'customer', 'فندق النيل جراند (مثال)', { kind: 'wholesale', terms: 'credit', phone: '01055566677', taxId: '555-666-777' });
  P('c10', 'customer', 'سوبر ماركت الخير (مثال)', { kind: 'wholesale', terms: 'credit', phone: '01166677788', taxId: '666-777-888' });
  P('c11', 'customer', 'مطعم الشيف (مثال)', { kind: 'wholesale', terms: 'credit', phone: '01277788899' });
  P('c12', 'customer', 'هبة محمود', { kind: 'retail', terms: 'cash', phone: '01588899900' });
  const frozenRaw = S.items.filter(i => i.cat === 'meat' && !['it_RM-101', 'it_RM-102', 'it_RM-103', 'it_RM-104', 'it_RM-105', 'it_RM-106'].includes(i.id)).map(i => i.id);
  P('s6', 'supplier', 'الأمانة للحوم المجمدة (مثال)', { phone: '01099911122', supplies: 'قطعيات مجمدة', items: frozenRaw });
  S.partners.find(p => p.id === 'c5').sample = false;

  const end = today(), start = addDays(end, -29);
  S.items.forEach(it => { S.flags.low[it.id] = start; }); // empty factory on day 0 is not news
  as('u1', () => opening({ date: start, cash: egp(500000), bank: egp(4000000), assets: [
    { name: 'مفرمة صناعية', acc: '1501', value: egp(250000), rate: 10 }, { name: 'ماكينة تشكيل برجر', acc: '1501', value: egp(400000), rate: 10 },
    { name: 'ماكينة تغليف فاكيوم', acc: '1501', value: egp(180000), rate: 10 }, { name: 'غرفة تبريد + غرفة تجميد', acc: '1502', value: egp(600000), rate: 10 },
    { name: 'ديب فريزر × 4', acc: '1502', value: egp(160000), rate: 20 }, { name: 'عربية نقل مبردة', acc: '1503', value: egp(1200000), rate: 20 },
    { name: 'موازين × 3', acc: '1501', value: egp(30000), rate: 20 }, { name: 'طابعة باركود + طابعة فواتير', acc: '1504', value: egp(25000), rate: 33 },
    { name: 'تابلت × 3 + كمبيوتر', acc: '1504', value: egp(60000), rate: 33 }] }));

  // opening stock for EVERY item (sample): 500 kg of each website product, frozen cuts, spices, packaging
  as('u1', () => openingBalances({ date: start, stock: S.items.filter(i => !['byproduct', 'carcass'].includes(i.cat)).map(it => {
    if (it.cat === 'product') { const pk = packsOf(it).includes(1000) ? 1000 : Math.max(...packsOf(it).filter(z => z <= 1000)); return { wh: parseInt(it.code.slice(3), 10) % 2 ? 'W6' : 'W4', itemId: it.id, qty: kg(500), packSize: pk, unitCost: Math.round(it.priceWholesale * 0.7 / 100) * 100, expDate: addDays(start, it.group === 'لحوم باردة' ? 60 : 90) }; }
    if (it.cat === 'meat') return { itemId: it.id, qty: kg(it.id === 'it_RM-106' ? 80 : 250), unitCost: Math.round(it.priceRetail * 0.6 / 100) * 100, expDate: addDays(start, 120), wh: 'W2' };
    if (it.cat === 'spice') return { itemId: it.id, qty: kg(it.code === 'SP-204' ? 300 : 60), unitCost: egp(it.code === 'SP-204' ? 38 : it.code === 'SP-207' ? 8 : 120), expDate: addDays(start, 180), wh: 'W2' };
    return { itemId: it.id, qty: it.sticker ? 10000 : 3000, unitCost: egp(it.sticker ? 0.6 : 2.5), expDate: addDays(start, 720) };
  }) }));

  // the supervisor puts about 60% of each run in freezer 1 and the rest in freezer 2
  const splitPacks = packs => { const a = {}, b2 = {}; for (const [z, n] of Object.entries(packs)) { if (!n) continue; a[z] = Math.ceil(n * 0.6); b2[z] = n - a[z]; } return [{ wh: 'W4', packs: a }, { wh: 'W6', packs: b2 }]; };
  const RECIPES = {
    'it_FG-401': { mix: { 'it_RM-101': 48, 'it_RM-102': 24, 'it_RM-104': 10, 'it_RM-103': 8, 'it_RM-106': 8, 'it_SP-201': 2 }, sizes: { 1000: 0.55, 500: 0.45 } },
    'it_FG-402': { mix: { 'it_RM-105': 55, 'it_RM-103': 15, 'it_RM-106': 15, 'it_RM-101': 12, 'it_SP-202': 3 }, sizes: { 1000: 0.6, 500: 0.4 } },
    'it_FG-403': { mix: { 'it_RM-105': 45, 'it_RM-103': 20, 'it_RM-104': 10, 'it_RM-106': 20, 'it_SP-203': 5 }, sizes: { 2000: 0.2, 1000: 0.5, 500: 0.3 } },
    'it_FG-404': { mix: { 'it_RM-105': 60, 'it_RM-104': 25, 'it_RM-106': 10, 'it_SP-202': 5 }, sizes: { 2000: 0.25, 1000: 0.45, 500: 0.3 } },
    'it_FG-405': { mix: { 'it_RM-105': 70, 'it_RM-101': 20, 'it_SP-202': 3, 'it_SP-205': 7 }, sizes: { 1500: 0.3, 1000: 0.4, 500: 0.3 } },
    'it_FG-406': { mix: { 'it_RM-105': 60, 'it_SP-204': 30, 'it_RM-106': 7, 'it_SP-202': 3 }, sizes: { 1000: 0.6, 500: 0.4 } },
  };
  Object.entries(RECIPES).forEach(([k, v]) => { S.recipes[k] = v.mix; });
  const prodWeights = [['it_FG-401', 4], ['it_FG-402', 2], ['it_FG-403', 2], ['it_FG-404', 1], ['it_FG-405', 1], ['it_FG-406', 1]];
  const pickProduct = () => { const t = prodWeights.reduce((s, x) => s + x[1], 0); let r = R() * t; for (const [id, w] of prodWeights) { if ((r -= w) < 0) return id; } return prodWeights[0][0]; };
  const moveAll = (date, lots, to) => lots.forEach(l => as('u3', () => transfer({ date, lotId: l.id, qty: l.qty, toWh: to })));
  const wholesale = ['c1', 'c2', 'c3', 'c4'], retail = ['c5', 'c6', 'c7', 'c8'];

  const buySpices = date => {
    const d = as('u3', () => purchase({ date, supplierId: 's3', ref: 'BH-' + ri(1000, 9999), lines: [
      { itemId: 'it_SP-201', qty: kg(70), unitCost: egp(150), expDate: addDays(date, 180) }, { itemId: 'it_SP-202', qty: kg(70), unitCost: egp(140), expDate: addDays(date, 180) },
      { itemId: 'it_SP-203', qty: kg(40), unitCost: egp(165), expDate: addDays(date, 180) }, { itemId: 'it_SP-204', qty: kg(350), unitCost: egp(38), expDate: addDays(date, 240) },
      { itemId: 'it_SP-205', qty: kg(100), unitCost: egp(45), expDate: addDays(date, 120) }] }));
    moveAll(date, d.lines.map(l => S.lots.find(x => x.id === l.lotId)), 'W5');
  };
  const buyPack = date => {
    const d1 = as('u3', () => purchase({ date, supplierId: 's4', ref: 'AB-' + ri(1000, 9999), lines: [
      { itemId: 'it_PK-305', qty: 4000, unitCost: egp(1.8), expDate: addDays(date, 720) }, { itemId: 'it_PK-310', qty: 4000, unitCost: egp(2.4), expDate: addDays(date, 720) },
      { itemId: 'it_PK-315', qty: 1200, unitCost: egp(2.9), expDate: addDays(date, 720) }, { itemId: 'it_PK-320', qty: 1200, unitCost: egp(3.3), expDate: addDays(date, 720) }] }));
    const d2 = as('u3', () => purchase({ date, supplierId: 's5', ref: 'SH-' + ri(100, 999), lines: [{ itemId: 'it_PK-390', qty: 10000, unitCost: egp(0.6), expDate: addDays(date, 720) }] }));
    moveAll(date, [...d1.lines, ...d2.lines].map(l => S.lots.find(x => x.id === l.lotId)), 'W3');
  };
  const buyCarcass = date => {
    const q = kg(ri(8, 10) * 100);
    const d = as('u3', () => purchase({ date, supplierId: 's1', ref: 'WD-' + ri(1000, 9999), lines: [{ itemId: 'it_RM-100', qty: q, unitCost: egp(ri(226, 238)), prodDate: addDays(date, -1), expDate: addDays(date, 10) }] }));
    const lot = S.lots.find(x => x.id === d.lines[0].lotId);
    as('u3', () => transfer({ date, lotId: lot.id, qty: lot.qty, toWh: R() < 0.5 ? 'W2' : 'W5' }));
    const shares = [['it_RM-101', 0.17], ['it_RM-102', 0.12], ['it_RM-103', 0.08], ['it_RM-104', 0.09], ['it_RM-105', 0.22], ['it_RM-106', 0.08], ['it_RM-190', 0.20]];
    const outputs = shares.map(([id, s]) => ({ itemId: id, qty: Math.round(lot.qty * (s + rnd(-0.01, 0.01)) / 100) * 100 }));
    const cutQty = addDays(date, 5) > today() ? lot.qty - kg(100) : lot.qty; // the latest delivery keeps 100 kg on the hook
    outputs.forEach(o => { o.qty = Math.round(o.qty * cutQty / lot.qty / 100) * 100; });
    const outT = outputs.reduce((x, o) => x + o.qty, 0), cap = cutQty * 0.985; // real cutting always loses a little
    if (outT > cap) outputs.forEach(o => { o.qty = Math.floor(o.qty * cap / outT / 100) * 100; });
    as('u4', () => cutting({ date, lotId: lot.id, qty: cutQty, outputs }));
  };
  const buyCuts = date => {
    const d = as('u3', () => purchase({ date, supplierId: 's2', ref: 'NL-' + ri(1000, 9999), lines: [
      { itemId: 'it_RM-101', qty: kg(ri(12, 20) * 10), unitCost: egp(ri(330, 345)), prodDate: addDays(date, -2), expDate: addDays(date, 8) },
      { itemId: 'it_RM-102', qty: kg(ri(6, 12) * 10), unitCost: egp(ri(335, 350)), prodDate: addDays(date, -2), expDate: addDays(date, 8) },
      { itemId: 'it_RM-105', qty: kg(ri(30, 45) * 10), unitCost: egp(ri(318, 330)), prodDate: addDays(date, -1), expDate: addDays(date, 6) },
      { itemId: 'it_RM-106', qty: kg(ri(8, 12) * 10), unitCost: egp(95), prodDate: addDays(date, -2), expDate: addDays(date, 8) }] }));
    moveAll(date, d.lines.map(l => S.lots.find(x => x.id === l.lotId)), 'W2');
  };
  const runBatch = (date, productId, totalKg, close) => {
    const mix = RECIPES[productId].mix;
    let want = Object.entries(mix).map(([id, pct]) => [id, totalKg * pct / 100 * (1 + rnd(-0.06, 0.06))]);
    const fit = Math.min(1, ...want.map(([id, k]) => available(id, whs('raw')) / 1000 / k));
    if (fit < 0.45) return null;
    want = want.map(([id, k]) => [id, Math.max(500, Math.floor(k * fit * 2) * 500)]);
    if (want.some(([id, q]) => available(id, whs('raw')) < q)) return null;
    const b = as('u4', () => createBatch({ date, productId, planned: kg(totalKg) }));
    for (const [id, q] of want) {
      if (q > kg(60) && R() < 0.5) { const a = Math.round(q / 2 / 500) * 500; as('u5', () => issue({ batchId: b.id, itemId: id, qty: a, date })); as('u5', () => issue({ batchId: b.id, itemId: id, qty: q - a, date })); }
      else as('u5', () => issue({ batchId: b.id, itemId: id, qty: q, date }));
    }
    if (!close) return b;
    const input = want.reduce((s, x) => s + x[1], 0);
    let out = Math.floor(input * rnd(0.972, 0.99) / 500) * 500;
    const sizes = RECIPES[productId].sizes; const packs = {}; let rem = out;
    for (const s of [2000, 1500, 1000]) { if (!sizes[s]) continue; const n = Math.floor(out * sizes[s] / s); packs[s] = n; rem -= n * s; }
    packs[500] = rem / 500;
    as('u4', () => closeBatch({ batchId: b.id, date, packs, split: splitPacks(packs) }));
    return b;
  };
  const sell = (date, cid, targetKg) => {
    const c = S.partners.find(p => p.id === cid);
    const fg = S.items.filter(i => i.cat === 'product' && available(i.id, whs('fg')) > kg(i.group === 'مصنعات' ? 60 : 160)); // keep a sample balance of every product
    if (!fg.length) return null;
    const lines = []; let got = 0; const tried = new Set();
    while (got < targetKg && tried.size < 14) {
      const p = R() < 0.55 ? pick(fg.filter(x => x.group === 'مصنعات').concat(fg)) : pick(fg); const sizes = packsOf(p); const size = pick(c.kind === 'wholesale' ? sizes.slice(-3) : sizes.slice(0, 3));
      const key = p.id + size; if (tried.has(key)) { tried.add(key + Math.random()); continue; } tried.add(key);
      const reserve = kg(p.group === 'مصنعات' ? 40 : 120);
      const av = Math.floor(Math.max(0, Math.min(available(p.id, whs('fg'), size), available(p.id, whs('fg')) - reserve)) / size);
      if (!av) continue;
      const n = Math.min(av, Math.max(1, Math.round((targetKg - got) / size * rnd(0.4, 1))));
      lines.push({ productId: p.id, packSize: size, count: n }); got += n * size;
    }
    if (!lines.length) return null;
    const method = c.kind === 'wholesale' ? 'credit' : pick(['cash', 'cash', 'instapay']);
    const discount = c.kind === 'wholesale' && R() < 0.15 ? egp(ri(2, 6) * 100) : 0;
    return as('u6', () => invoice({ date, customerId: cid, lines, discount, method }));
  };

  let i = 0;
  for (let d = start; d <= end; d = addDays(d, 1), i++) {
    seedDay = d;
    const wd = dow(d);
    const isLast = d === end;
    if (i % 14 === 0) { buySpices(d); buyPack(d); }
    if (wd === 5) { // Friday: off, only month-end jobs
      if (d === monthEnd(d) && d < end) as('u2', () => depreciate({ month: d.slice(0, 7) }));
      continue;
    }
    // storekeeper disposes of expired stock and weekly bones
    for (const l of S.lots.filter(x => x.qty > 0 && whUse(x.wh) !== 'fg' && (x.cat === 'byproduct' ? wd === 3 : x.expDate < d))) as('u3', () => writeOff({ date: d, lotId: l.id, qty: l.qty, reason: l.cat === 'byproduct' ? 'تسليم العضم لمصنع الأعلاف' : 'انتهاء الصلاحية' }));
    if (i % 5 === 0 && !isLast) buyCarcass(d);
    if (i % 10 === 1) buyCuts(d);
    // production
    const nb = isLast ? 1 : ri(1, 2);
    for (let k = 0; k < nb; k++) {
      // supervisor plans around what is in the fridge: product whose main cut is most available
      const pid = R() < 0.35 ? pickProduct() : Object.keys(RECIPES).map(id => [id, Object.entries(RECIPES[id].mix).reduce((s, [m, pct]) => s + (pct >= 10 ? available(m, whs('raw')) * pct : 0), 0) * rnd(0.7, 1.3)]).sort((a, b) => b[1] - a[1])[0][0];
      const big = R() < 0.12 && pid === 'it_FG-401';
      runBatch(d, pid, big ? ri(170, 185) : ri(100, 150), true);
    }
    // packaging batch for a cut: raw cut → vacuum packs (one or two a day)
    if (!isLast) for (let k = 0; k < ri(1, 2); k++) {
      const cuts = S.items.filter(it => it.cat === 'product' && ['قطعيات', 'قطعيات مميزة'].includes(it.group));
      const cands = cuts.map(p => { const raw = Object.keys(S.recipes[p.id] || {})[0]; return { p, raw, av: raw ? available(raw, whs('raw')) - kg(60) : 0 }; }).filter(x => x.av >= kg(30)); // leave 60 kg of each raw cut in the chiller
      if (!cands.length) break;
      const { p, raw, av } = pick(cands);
      const q = Math.min(av, kg(ri(30, 90))) - (Math.min(av, kg(ri(30, 90))) % 500);
      if (q < kg(20)) continue;
      const b = as('u4', () => createBatch({ date: d, productId: p.id, planned: q }));
      as('u5', () => issue({ batchId: b.id, itemId: raw, qty: q, date: d }));
      const out = Math.floor(q * rnd(0.985, 0.996) / 250) * 250;
      const sizes = packsOf(p), big = sizes.includes(1000) ? 1000 : sizes[sizes.length - 1], small = sizes[0];
      const nBig = Math.floor(out * 0.7 / big), rest = out - nBig * big;
      const packs = { [big]: nBig }; packs[small] = (packs[small] || 0) + Math.floor(rest / small); // only the last few grams that don't fill a pack are waste
      const total = Object.entries(packs).reduce((sum, [z, n]) => sum + z * n, 0);
      if (total > 0 && total <= q) as('u4', () => closeBatch({ batchId: b.id, date: d, packs, split: splitPacks(packs) }));
    }
    // cold cuts line: minced beef + seasoning into ¼ / ½ kg packs
    if (!isLast && R() < 0.8) {
      const cold = S.items.filter(it => it.group === 'لحوم باردة' || it.group === 'مقبلات');
      const p = cold.slice().sort((a, b) => available(a.id, whs('fg')) - available(b.id, whs('fg')))[ri(0, 2)];
      const mix = [['it_RM-105', 0.9], ['it_RM-106', 0.05], ['it_SP-207', 0.03], ['it_SP-208', 0.02]];
      const total = kg(ri(40, 70));
      const want = mix.map(([id, f]) => [id, Math.round(total * f / 500) * 500 || 500]);
      if (want.every(([id, q]) => available(id, whs('raw')) >= q)) {
        const b = as('u4', () => createBatch({ date: d, productId: p.id, planned: total }));
        for (const [id, q] of want) as('u5', () => issue({ batchId: b.id, itemId: id, qty: q, date: d }));
        const inKg = want.reduce((x, w) => x + w[1], 0), out = Math.floor(inKg * rnd(0.975, 0.99) / 500) * 500;
        const sizes = packsOf(p); const half = sizes.includes(500) ? 500 : sizes[0];
        const n250 = sizes.includes(250) ? Math.floor(out * 0.6 / 500) * 2 : 0; // even count keeps the rest in whole ½ kg packs
        const packs = { 250: n250 }; packs[half] = (packs[half] || 0) + (out - n250 * 250) / half;
        if (Number.isInteger(packs[half]) && out > 0) as('u4', () => closeBatch({ batchId: b.id, date: d, packs, split: splitPacks(packs) }));
      }
    }
    // sales
    if (i > 0) {
      for (let k = 0; k < ri(4, 6); k++) sell(d, pick(wholesale), kg(ri(40, 95)));
      for (let k = 0; k < ri(3, 6); k++) sell(d, pick(retail), kg(ri(1, 5)));
    }
    // weekly receipts (Thursday) & supplier payments (Sunday)
    if (wd === 4) for (const cid of wholesale) { const b = partnerBalance(cid); if (b > 0) { const amt = Math.round(b * rnd(0.6, 0.9) / 10000) * 10000; if (amt > 0) as('u2', () => receipt({ date: d, customerId: cid, amount: amt, method: pick(['bank', 'bank', 'instapay', 'cash']) })); } }
    if (wd === 0) for (const sid of ['s1', 's2', 's3', 's4', 's5']) { const b = partnerBalance(sid); const can = cashBalance('1102'); const amt = Math.min(Math.round(b * 0.7 / 10000) * 10000, Math.floor(can * 0.5 / 10000) * 10000); if (amt > 0) as('u2', () => supplierPayment({ date: d, supplierId: sid, amount: amt, method: 'bank' })); }
    // expenses
    const dom = +d.slice(8);
    const ex = (acc, amt, method, memo) => { if (cashBalance(METHOD_ACC[method]) >= amt) as('u2', () => expense({ date: d, acc, amount: amt, method, memo })); };
    if (dom === 1) ex('5401', egp(60000), 'bank', 'إيجار المصنع');
    if (dom === 5) ex('5403', egp(6500), 'cash', 'أدوات نظافة ومكتبية');
    if (dom === 10) ex('5203', egp(8200), 'cash', 'صيانة المفرمة');
    if (dom === 15) ex('5301', egp(25000), 'bank', 'إعلانات فيسبوك وإنستجرام');
    if (dom === 25) ex('5202', egp(45300), 'bank', 'فاتورة الكهرباء');
    if (dom === 28) { ex('5201', egp(180000), 'bank', 'مرتبات عمال الإنتاج'); ex('5402', egp(90000), 'bank', 'مرتبات الإدارة'); }
    if (wd === 1) ex('5302', egp(ri(25, 40) * 100), 'cash', 'نقل وتوصيل');
    const cashNow = cashBalance('1101');
    if (cashNow > egp(400000)) as('u2', () => cashTransfer({ date: d, from: 'cash', to: 'bank', amount: Math.floor((cashNow - egp(150000)) / 1000000) * 1000000 }));
    if (d === monthEnd(d) && d < end) as('u2', () => depreciate({ month: d.slice(0, 7) }));
  }
  // today: one batch in progress (partially issued) + one just opened + a pending correction
  const b1 = as('u4', () => createBatch({ date: end, productId: 'it_FG-401', planned: kg(150) }));
  const iss = [];
  for (const [id, q] of [['it_RM-101', kg(92)], ['it_RM-102', kg(45)], ['it_RM-106', kg(12)]]) if (available(id, whs('raw')) >= q) iss.push(as('u5', () => issue({ batchId: b1.id, itemId: id, qty: q, date: end })));
  if (iss[1]) as('u5', () => requestCorrection({ batchId: b1.id, issueId: iss[1].id, newQty: kg(44), reason: 'كتبت ٤٥ والميزان كان ٤٤' }));
  as('u4', () => createBatch({ date: end, productId: 'it_FG-403', planned: kg(100) }));
  seeding = false; seedDay = null;
  S.currentUser = 'u1';
  S.alerts.forEach(a => { if (a.at.slice(0, 10) < addDays(end, -2)) a.read = true; });
}

/* ---------- boot ---------- */
function init() { if (!load()) { seed(); save(); } return S; }

root.ERP = {
  init, reset, save, exportJSON, get S() { return S; },
  ACCOUNTS, LEAF, CAT_NAME, CAT_ACC, METHOD_NAME, WAREHOUSES, WH_USE, warehouses, whs, whUse, PACK_SIZES, ROLES, EXPENSE_ACCS,
  today, addDays, daysBetween, monthStart, monthEnd, mulDiv,
  item, partner, userName, whName, me, available, cashBalance, partnerBalance, partnerStatement, batchById, issuedOf, priceFor, monthlyDepreciation,
  opening, purchase, transfer, cutting, createBatch, issue, requestCorrection, decideCorrection, closeBatch, invoice, receipt, catalog, orderStatus, placeOrder, decideOrder, orderProof, orderNotified, orderView, proofTarget, normPhone, ORDER_METHODS, supplierPayment, expense, cashTransfer, depreciate, writeOff, watch,
  saveItem, savePartner, resetBooks, updateSelf, saveWarehouse, setUser, updateSettings, markAlertsRead, upsertUser, openingBalances, setRecipe, liveState, setState, packsOf, WEBSITE, cairoNow,
  ledger, bal, trialBalance, incomeStatement, balanceSheet, manufacturingAccount, integrity, stockAlerts, fmtQty, money, accType, debitNature, leafUnder,
};
})(typeof window !== 'undefined' ? window : globalThis);
