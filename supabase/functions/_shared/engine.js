/* Boom Meat ERP — engine: inventory (FIFO lots), manufacturing, sales, double-entry accounting.
   Money is stored as integer piasters (1 EGP = 100). Weight is stored as integer grams. Pieces as integers.
   Every operation posts its own balanced journal entry; nothing is typed into the ledger by hand. */
(function (root) {
'use strict';

const STORE_KEY = 'boom-erp-v1';
const DATA_VERSION = 5;

/* ---------- chart of accounts ---------- */
// money: where the account can pay or receive (cash box, bank, wallet, credit card, loan). sys: the workflow depends on it (never deleted)
const BASE_ACCOUNTS = [
  ['1', 'الأصول', null], ['11', 'الأصول الثابتة', '1'],
  ['1501', 'آلات ومعدات الإنتاج', '11'], ['1502', 'معدات التبريد والتجميد', '11'], ['1503', 'السيارات', '11'], ['1504', 'أجهزة وأثاث', '11'],
  ['1599', 'مجمع الإهلاك', '11'],
  ['12', 'الأصول المتداولة', '1'],
  ['1107', 'الخزنة الرئيسية (المالك)', '12', 'cash'], ['1101', 'الخزنة الفرعية (المحاسب)', '12', 'cash'],
  ['1111', 'بنك CIB', '12', 'bank'], ['1112', 'البنك الأهلي المصري', '12', 'bank'], ['1113', 'بنك مصر ١', '12', 'bank'], ['1114', 'بنك مصر ٢', '12', 'bank'], ['1115', 'بنك مصر ٣', '12', 'bank'],
  ['1102', 'البنك (حساب قديم)', '12', 'bank'], ['1106', 'فودافون كاش', '12', 'wallet'], ['1103', 'حساب إنستاباي (طلبات واتساب)', '12', 'wallet'], ['1104', 'حساب Paymob (فيزا أونلاين)', '12', 'gateway'],
  ['1201', 'العملاء', '12'], ['1202', 'سلف العاملين', '12'], ['1203', 'عهد مع السواقين والمندوبين', '12'],
  ['1301', 'مخزون خامات اللحوم', '12'], ['1302', 'مخزون التوابل والإضافات', '12'], ['1303', 'مخزون مواد التعبئة', '12'],
  ['1304', 'إنتاج تحت التشغيل', '12'], ['1305', 'مخزون المنتج التام', '12'], ['1401', 'ضريبة القيمة المضافة على المشتريات', '12'],
  ['2', 'الخصوم', null], ['21', 'الخصوم المتداولة', '2'], ['2101', 'الموردين', '21'], ['2102', 'ضريبة القيمة المضافة على المبيعات', '21'],
  ['2111', 'كريدت ١', '21', 'credit'], ['2112', 'كريدت ٢', '21', 'credit'], ['2113', 'كريدت ٣', '21', 'credit'], ['2114', 'كريدت ٤', '21', 'credit'],
  ['22', 'القروض', '2'], ['2201', 'قرض البنك الأهلي ١', '22', 'loan'], ['2202', 'قرض البنك الأهلي ٢', '22', 'loan'], ['2203', 'قرض البنك الأهلي ٣', '22', 'loan'], ['2204', 'قرض البنك الأهلي ٤', '22', 'loan'],
  ['3', 'حقوق الملكية', null], ['3101', 'رأس المال', '3'], ['3201', 'الأرباح المحتجزة', '3'], ['3301', 'جاري الشركاء', '3'],
  ['4', 'الإيرادات', null], ['4101', 'مبيعات قطاعي (أفراد)', '4'], ['4102', 'مبيعات جملة (مطاعم ومحلات)', '4'], ['4103', 'إيراد التوصيل', '4'], ['4104', 'إيرادات أخرى', '4'],
  ['5', 'التكاليف والمصروفات', null], ['51', 'تكلفة المبيعات', '5'], ['5101', 'تكلفة البضاعة المباعة', '51'],
  ['52', 'مصروفات المصنع', '5'], ['5102', 'هالك وتالف المخزون', '52'], ['5201', 'أجور الإنتاج', '52'], ['5202', 'كهرباء ومياه المصنع', '52'], ['5203', 'صيانة', '52'],
  ['53', 'مصروفات البيع والتسويق', '5'], ['5301', 'تسويق وإعلانات', '53'], ['5302', 'نقل وتوصيل', '53'],
  ['54', 'مصروفات إدارية وعمومية', '5'], ['5401', 'إيجار', '54'], ['5402', 'مرتبات إدارية', '54'], ['5403', 'مصروفات عمومية', '54'],
  ['5501', 'الإهلاك', '54'],
  ['56', 'مصروفات تمويلية وبنكية', '5'], ['5601', 'فوائد وتكلفة القروض', '56'], ['5602', 'عمولات ومصاريف بنكية', '56'],
].map(([code, name, parent, money]) => ({ code, name, parent, sys: true, ...(money ? { money } : {}) }));
// the live chart = the base + what the owner added/renamed (S.coa); rebuilt in place so every module sees the same arrays
const ACCOUNTS = [];
const LEAF = new Set();
const EXPENSE_ACCS = [];
const AUTO_EXP = new Set(['5101', '5102', '5501']); // booked by the system only (cost of sales, write-offs, depreciation)
function applyCoa(coa) {
  coa = coa || {};
  ACCOUNTS.length = 0;
  for (const a of BASE_ACCOUNTS) ACCOUNTS.push({ ...a, name: (coa.names && coa.names[a.code]) || a.name });
  for (const a of coa.added || []) ACCOUNTS.push({ ...a, sys: false });
  LEAF.clear(); ACCOUNTS.filter(a => !ACCOUNTS.some(b => b.parent === a.code)).forEach(a => LEAF.add(a.code));
  EXPENSE_ACCS.length = 0; [...LEAF].filter(c => c[0] === '5' && !AUTO_EXP.has(c)).sort().forEach(c => EXPENSE_ACCS.push(c));
}
applyCoa();
const accOf = code => ACCOUNTS.find(a => a.code === code);
const accLabel = code => (accOf(code) || {}).name || code;
const moneyKind = code => (accOf(code) || {}).money || null;
const accType = code => ({ 1: 'asset', 2: 'liability', 3: 'equity', 4: 'income', 5: 'expense' })[code[0]];
const debitNature = code => code[0] === '1' || code[0] === '5';
const CAT_ACC = { carcass: '1301', meat: '1301', byproduct: '1301', spice: '1302', pack: '1303', product: '1305' };
const CAT_NAME = { carcass: 'لحوم بالعضم', meat: 'قطعيات ولحوم', byproduct: 'نواتج تقطيع', spice: 'توابل وإضافات', pack: 'مواد تعبئة', product: 'منتج تام' };
const METHOD_ACC = { cash: '1101', main: '1107', bank: '1102', instapay: '1103', card: '1104', vodafone: '1106' };
const METHOD_NAME = { cash: 'كاش', main: 'الخزنة الرئيسية', bank: 'تحويل بنكي', instapay: 'إنستاباي', card: 'فيزا (Paymob)', vodafone: 'فودافون كاش', credit: 'آجل' };
// a method is a fixed key above, or the code of any money account (a bank, a credit card…)
const methodAcc = m => METHOD_ACC[m] || (moneyKind(m) && LEAF.has(m) ? m : null);
const methodName = m => METHOD_NAME[m] || accLabel(m);
const payLabel = m => METHOD_NAME[m] || ({ cash: 'كاش', bank: 'تحويل بنكي', wallet: 'محفظة', credit: 'كريدت' })[moneyKind(m)] || accLabel(m); // what the customer reads (never our internal account names)
const isOut = acc => ['cash', 'bank', 'wallet', 'gateway'].includes(moneyKind(acc)); // real money we hold (must not go negative)
// everyone but the owner works from the sub treasury only (owner's rule, Nov 2026); WhatsApp order money keeps its own route
const STAFF_ACC = '1101';
let orderMoney = false;
function staffOnly(acc) { if (!seeding && !orderMoney && !cardReceipt && me().role !== 'owner') need(acc === STAFF_ACC, `${accLabel(acc)} للمالك بس. المحاسب بيشتغل من الخزنة الفرعية بس`); }
function useAcc(acc, { pay = false } = {}) { // who may move money through this account
  need(acc, 'اختار الحساب'); staffOnly(acc);
  if (acc === '1107') need(me().role === 'owner', 'الخزنة الرئيسية للمالك بس');
  if (acc === '1106') fail('فودافون كاش للتحويل الداخلي بس (من وإلى الخزنة)');
  const k = moneyKind(acc); need(k && k !== 'loan', 'الحساب ده مش بيدفع ولا بيقبض');
  if (k === 'credit') need(pay, 'الكريدت بيتدفع بيه بس، مش بيتحصل عليه');
  return acc;
}
const enough = (acc, amount) => { if (isOut(acc)) need(cashBalance(acc) >= amount, `رصيد ${accLabel(acc)} مش كفاية`); };
// store kinds: receiving (goods in), raw (production chillers: meat & spices), pack (packaging), fg (finished-goods freezers)
const WH_USE = { receiving: 'مخزن استلام', raw: 'تلاجة إنتاج (خامات)', pack: 'مخزن تعبئة', fg: 'فريزر منتج تام' };
const WAREHOUSES = [
  { id: 'W1', name: 'مخزن الاستلام', use: 'receiving' }, { id: 'W2', name: 'تلاجة الإنتاج ١', use: 'raw' },
  { id: 'W3', name: 'مخزن التعبئة والتغليف', use: 'pack' }, { id: 'W4', name: 'فريزر المنتج التام ١', use: 'fg' },
  { id: 'W5', name: 'تلاجة الإنتاج ٢', use: 'raw' }, { id: 'W6', name: 'فريزر المنتج التام ٢', use: 'fg' },
];
const MEAT_SECTIONS = ['بلدي فريش', 'برازيلي', 'دهون']; // worker-screen sections; the owner can add more from the item form
const PACK_SIZES = [200, 250, 500, 1000]; // standard packs (Nov 2026: 1.5 kg and 2 kg dropped); any other weight is an «open weight» tray
const packsOf = p => (p.packs && p.packs.length ? p.packs : PACK_SIZES);
const isOpenWeight = g => isInt(g) && g >= 50 && g <= 20000 && !PACK_SIZES.includes(g);
const ROLES = {
  owner: { name: 'المالك (أدمن)', cost: true },
  accountant: { name: 'محاسب', cost: true },
  storekeeper: { name: 'أمين مخزن', cost: true },
  supervisor: { name: 'مشرف إنتاج', cost: false },
  worker: { name: 'عامل إنتاج', cost: false },
  sales: { name: 'مبيعات', cost: false },
  packer: { name: 'عامل تقفيل (جاف)', cost: false },
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
  applyCoa();
  return {
    coa: { added: [], names: {} }, staff: [],
    version: DATA_VERSION, mode: 'demo', warehouses: JSON.parse(JSON.stringify(WAREHOUSES)), seq: {}, createdAt: new Date().toISOString(),
    settings: {
      vatRate: 0, issueLimitKg: 100, fgShelfDays: 90, deliveryFee: 10000, telegram: true, tgToken: '', tgChat: '',
      company: { name: 'بوم ميت للحوم', nameEn: 'Boom Meat', address: 'المنطقة الصناعية · مدينة ١٥ مايو · القاهرة', phone: '(+2) 01033004411', taxId: '000-000-000' },
    },
    users: [
      { id: 'u1', name: 'المالك', role: 'owner' }, { id: 'u2', name: 'محمد سالم', role: 'accountant' },
      { id: 'u3', name: 'خالد عبد الله', role: 'storekeeper' }, { id: 'u4', name: 'أحمد فتحي', role: 'supervisor' },
      { id: 'u5', name: 'محمود حسن', role: 'worker' }, { id: 'u6', name: 'سارة يوسف', role: 'sales' }, { id: 'u7', name: 'حسن علي', role: 'packer' },
    ],
    currentUser: 'u1',
    items: [], partners: [], lots: [], journal: [], audit: [], alerts: [], priceHistory: [], flags: { low: {}, exp: {} },
    assets: [],
    docs: { purchases: [], transfers: [], cuttings: [], butcheries: [], batches: [], invoices: [], receipts: [], payments: [], expenses: [], cash: [], corrections: [], depreciation: [], writeoffs: [], orders: [], deposits: [], advances: [], custody: [], liabPays: [], butcheries: [], returns: [], changes: [] },
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
const item = id => { const it = S.items.find(i => i.id === id); if (!it) fail('صنف غير معروف'); return it; };
const partner = id => { const p = S.partners.find(x => x.id === id); if (!p) fail('عميل/مورد غير معروف'); return p; };
const warehouses = () => (S && S.warehouses) || WAREHOUSES;
const whName = id => (warehouses().find(w => w.id === id) || {}).name || id;
const whUse = id => (warehouses().find(w => w.id === id) || {}).use;
const whs = use => warehouses().filter(w => w.use === use).map(w => w.id);
function migratePacks(st) { // Nov 2026, once: products sell 200 g / 250 g / ½ / 1 kg; bags for 200 g & 250 g and the rework item exist
  if (!st.items || (st.migr && st.migr.packs2026)) return;
  st.migr = { ...(st.migr || {}), packs2026: true };
  for (const it of st.items) if (it.cat === 'product' && it.packs && it.packs.some(g => g === 1500 || g === 2000)) // only products that had 1.5/2 kg: those go, 200 g & 250 g come; every other size stays (e.g. 2.5 kg)
    it.packs = [...new Set([200, 250, ...it.packs.filter(g => g !== 1500 && g !== 2000)])].sort((a, b) => a - b);
  const nextCode = pre => `${pre}-${Math.max(0, ...st.items.filter(i => i.code.startsWith(pre + '-')).map(i => parseInt(i.code.slice(3), 10) || 0)) + 1}`;
  for (const [g, name] of [[200, 'كيس فاكيوم ٢٠٠ جرام'], [250, 'كيس فاكيوم ٢٥٠ جرام']]) if (!st.items.some(i => i.cat === 'pack' && i.packFor === g)) st.items.push({ id: 'it_bag' + g, code: nextCode('PK'), name, cat: 'pack', unit: 'pc', priceRetail: 0, priceWholesale: 0, minQty: 300, vat: 0, active: true, packFor: g });
  if (!st.items.some(i => i.rework)) st.items.push({ id: 'it_rework', code: nextCode('RM'), name: 'إعادة تصنيع (عجينة برجر)', cat: 'meat', unit: 'kg', priceRetail: 0, priceWholesale: 0, minQty: 0, vat: 0, active: true, rework: true, sub: 'إعادة تصنيع' });
}
function migrateWaste(st) { // Nov 2026: a butchery output line «إعدام» (thrown away, cost 0, no stock)
  if (!st.items || st.items.some(i => i.waste)) return;
  const n = Math.max(0, ...st.items.filter(i => i.code.startsWith('RM-')).map(i => parseInt(i.code.slice(3), 10) || 0)) + 1;
  st.items.push({ id: 'it_waste', code: `RM-${n}`, name: 'إعدام', cat: 'byproduct', unit: 'kg', priceRetail: 0, priceWholesale: 0, minQty: 0, vat: 0, active: true, waste: true, fixedCost: 0 });
}
function ensureWarehouses(st) { // books saved before stores became configurable
  if (!st.warehouses) st.warehouses = JSON.parse(JSON.stringify(WAREHOUSES));
  for (const w of st.warehouses) if (!w.use) w.use = (WAREHOUSES.find(x => x.id === w.id) || {}).use || 'raw';
  st.coa = st.coa || { added: [], names: {} }; applyCoa(st.coa);
  st.staff = st.staff || [];
  migratePacks(st); migrateWaste(st);
  for (const k of ['deposits', 'advances', 'custody', 'liabPays', 'butcheries', 'returns', 'changes']) if (st.docs && !st.docs[k]) st.docs[k] = [];
  if (st.settings) st.settings.vatRate = 0; // Boom Meat sells and buys without VAT (owner's decision, Nov 2026); old invoices keep the VAT they were booked with
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
    S = JSON.parse(snap); applyCoa(S.coa); // the chart may have changed inside the failed operation
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
      const vat = 0; // no VAT on purchases
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
    for (const id of new Set(doc.lines.map(l => l.itemId))) averageCost(id);
    audit('purchase', no, `استلام بضاعة من ${sup.name} بقيمة ${money(doc.total)} (${doc.lines.length} صنف)`, date);
    return doc;
  });
}

function averageCost(itemId) { // every delivery of the same item carries the weighted average cost of what's still in stock
  const ls = S.lots.filter(l => l.itemId === itemId && l.qty > 0 && l.src && (l.src.type === 'purchase' || l.src.type === 'opening'));
  if (ls.length < 2) return;
  const total = ls.reduce((a, l) => a + l.value, 0), vals = alloc(total, ls.map(l => l.qty));
  ls.forEach((l, k) => { l.value = vals[k]; });
}
function itemCost(itemId) { // what one kg (or piece) costs us now: stock average, else the last purchase, else the last batch / butchery cost
  const a = avgCostPerUnit(itemId); if (a) return { v: a, src: 'المخزون' };
  for (const p of S.docs.purchases.slice().reverse()) { const ln = p.lines.find(l => l.itemId === itemId); if (ln) return { v: ln.unitCost, src: 'آخر شراء' }; }
  const b = S.docs.batches.slice().reverse().find(x => x.status === 'closed' && x.productId === itemId && x.costPerKg); if (b) return { v: b.costPerKg, src: 'آخر تشغيلة' };
  for (const r of butcheries().slice().reverse()) { const o = r.status === 'closed' && r.outputs.find(x => x.itemId === itemId && x.value != null && x.qty); if (o) return { v: mulDiv(o.value, 1000, o.qty), src: 'آخر جزارة' }; }
  return { v: 0, src: '' };
}
const avgCostPerUnit = itemId => { const ls = S.lots.filter(l => l.itemId === itemId && l.qty > 0); const q = ls.reduce((a, l) => a + l.qty, 0); return q ? mulDiv(ls.reduce((a, l) => a + l.value, 0), unitBase(item(itemId).unit), q) : 0; };
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

/* ---------- butchery runs (تشغيلة جزارة): like a production batch, for whole calves ----------
   open with the calf (carcass lot) → add bags used → record every output line (meat, fat, bone… by kg or by packs)
   → close: inputs + bags cost is spread on the outputs by sale value (bone and other by-products carry 0), loss = in − out */
const butcheries = () => S.docs.butcheries || (S.docs.butcheries = []);
const butById = id => { const r = butcheries().find(x => x.id === id); need(r, 'تشغيلة الجزارة غير موجودة'); return r; };
const butIn = r => r.inputs.reduce((s, i) => s + i.qty, 0);
const butOut = r => r.outputs.reduce((s, o) => s + o.qty, 0);
const butCost = r => r.inputs.reduce((s, i) => s + i.value, 0) + r.packs.reduce((s, p) => s + p.value, 0);
function takeCarcass(r, lotId, qty, date) {
  const l = S.lots.find(x => x.id === lotId); need(l && l.qty > 0, 'الدفعة غير موجودة');
  const src = item(l.itemId); need(['carcass', 'meat', 'byproduct'].includes(src.cat), 'تشغيلة الجزارة بتاخد لحمة خام (عجل، صرة بالعضم، قطعيات…)'); // open to any raw meat (Nov 2026)
  need(isInt(qty) && qty > 0 && qty <= l.qty, `الكمية أكبر من رصيد الدفعة (${fmtQty(l.qty, 'kg')})`);
  const part = takeFromLot(l, qty);
  const je = post({ date, type: 'butchery', ref: { type: 'butchery', id: r.id, no: r.no }, memo: `دخول ${src.name} ${fmtQty(qty, 'kg')} (دفعة ${l.code}) على تشغيلة الجزارة ${r.no}`, lines: [{ acc: '1304', dr: part.value }, { acc: CAT_ACC[src.cat], cr: part.value }] });
  r.inputs.push({ id: uid('BI'), lotId: l.id, code: l.code, itemId: l.itemId, qty, value: part.value, wh: l.wh, expDate: l.expDate, je: je.no, at: stamp(date), by: S.currentUser });
}
function openButchery({ date, lotId, qty, note }) {
  return tx(() => {
    perm('supervisor', 'storekeeper'); checkDate(date);
    const no = nextNo('BU');
    const r = { id: uid('BU'), no, date, status: 'open', note: String(note || '').slice(0, 200), inputs: [], packs: [], outputs: [], by: S.currentUser, at: stamp(date) };
    takeCarcass(r, lotId, qty, date);
    butcheries().push(r);
    audit('butchery_open', no, `فتح تشغيلة جزارة ${no}: ${item(r.inputs[0].itemId).name} ${fmtQty(qty, 'kg')}`, date);
    return r;
  });
}
function butcheryInput({ id, lotId, qty, date }) { // another calf / quarter into the same run
  return tx(() => {
    perm('supervisor', 'storekeeper'); date = date || today(); checkDate(date);
    const r = butById(id); need(r.status === 'open', 'التشغيلة مقفولة'); need(date >= r.date, 'التاريخ قبل فتح التشغيلة');
    takeCarcass(r, lotId, qty, date);
    audit('butchery_in', r.no, `إضافة ${fmtQty(qty, 'kg')} على ${r.no}`, date);
    return r;
  });
}
function butcheryPack({ id, itemId, qty, date }) { // bags/trays used in the run: their cost goes into the cuts
  return tx(() => {
    perm('supervisor', 'storekeeper'); date = date || today(); checkDate(date);
    const r = butById(id); need(r.status === 'open', 'التشغيلة مقفولة');
    const it = item(itemId); need(it.cat === 'pack', 'اختار كيس أو مادة تعبئة');
    need(isInt(qty) && qty > 0, 'العدد غير صحيح');
    const parts = consume(it.id, qty, whs('pack'));
    const value = parts.reduce((s, p) => s + p.value, 0);
    const je = post({ date, type: 'butchery', ref: { type: 'butchery', id: r.id, no: r.no }, memo: `صرف ${it.name} على تشغيلة الجزارة ${r.no}`, lines: [{ acc: '1304', dr: value }, { acc: CAT_ACC.pack, cr: value }] });
    r.packs.push({ id: uid('BP'), itemId: it.id, qty, value, parts, je: je.no, at: stamp(date), by: S.currentUser });
    audit('butchery_pack', r.no, `صرف ${fmtQty(qty, 'pc')} ${it.name} على ${r.no}`, date);
    return r;
  });
}
function butcheryOutput({ id, itemId, qty, count, packSize, note }) { // one line of the output sheet (no stock move until close)
  return tx(() => {
    perm('supervisor', 'storekeeper');
    const r = butById(id); need(r.status === 'open', 'التشغيلة مقفولة');
    const it = item(itemId); butOutItemOk(it);
    if (it.cat === 'product') need(count && packSize, `"${it.name}" منتج جاهز للبيع: اكتب العدد ووزن العبوة`);
    if (count != null && count !== '' && count !== 0) { need(isInt(count) && count > 0 && isInt(packSize) && packSize >= 50 && packSize <= 20000, 'اكتب العدد ووزن الحتة'); qty = count * packSize; } else { count = null; packSize = null; }
    need(isInt(qty) && qty > 0, 'اكتب الوزن');
    need(butOut(r) + qty <= butIn(r), `الناتج هيبقى أكبر من الداخل (${fmtQty(butIn(r), 'kg')})`);
    const ln = { id: uid('BO'), itemId: it.id, qty, count, packSize, note: String(note || '').slice(0, 100), by: S.currentUser, at: stamp(today()) };
    r.outputs.push(ln);
    return ln;
  });
}
const butOutItemOk = it => need(it.cat === 'meat' || it.cat === 'byproduct' || (it.cat === 'product' && it.group !== 'مصنعات'), `"${it.name}" مش ناتج جزارة (المصنّعات بتطلع من التشغيلات العادية)`);
function butcheryEditOutput({ id, lineId, qty, count, packSize, note }) { // fix a line while the run is open
  return tx(() => {
    perm('supervisor', 'storekeeper');
    const r = butById(id); need(r.status === 'open', 'التشغيلة مقفولة');
    const o = r.outputs.find(x => x.id === lineId); need(o, 'السطر غير موجود');
    const it = item(o.itemId);
    if (count) { need(isInt(count) && count > 0 && isInt(packSize || o.packSize) && (packSize || o.packSize) >= 50, 'اكتب العدد ووزن الحتة'); packSize = packSize || o.packSize; qty = count * packSize; } else { need(it.cat !== 'product', 'المنتج الجاهز بالعدد'); count = null; packSize = null; }
    need(isInt(qty) && qty > 0, 'اكتب الوزن');
    need(butOut(r) - o.qty + qty <= butIn(r), `الناتج هيبقى أكبر من الداخل (${fmtQty(butIn(r), 'kg')})`);
    const was = fmtQty(o.qty, 'kg');
    Object.assign(o, { qty, count, packSize, note: note != null ? String(note).slice(0, 100) : o.note });
    audit('butchery_edit', r.no, `تعديل ناتج ${it.name}: ${was} ← ${fmtQty(qty, 'kg')}`);
    return o;
  });
}
function butcheryDropInput({ id, inputId }) { // take an input back out (wrong lot / wrong weight) while the run is open
  return tx(() => {
    perm('supervisor', 'storekeeper');
    const r = butById(id); need(r.status === 'open', 'التشغيلة مقفولة');
    const k = r.inputs.findIndex(i => i.id === inputId); need(k >= 0, 'السطر غير موجود'); need(r.inputs.length > 1, 'دي الدفعة الوحيدة على التشغيلة: ضيف التانية الأول');
    const inp = r.inputs[k]; need(butOut(r) <= butIn(r) - inp.qty, 'الناتج المسجل أكبر من الداخل من غير الدفعة دي');
    const l = S.lots.find(x => x.id === inp.lotId); need(l, 'الدفعة غير موجودة');
    l.qty += inp.qty; l.value += inp.value;
    post({ date: today(), type: 'butchery', ref: { type: 'butchery', id: r.id, no: r.no }, memo: `رجوع ${item(inp.itemId).name} ${fmtQty(inp.qty, 'kg')} من تشغيلة الجزارة ${r.no} للمخزن`, lines: [{ acc: CAT_ACC[item(inp.itemId).cat], dr: inp.value }, { acc: '1304', cr: inp.value }] });
    r.inputs.splice(k, 1);
    audit('butchery_in_drop', r.no, `شيل ${fmtQty(inp.qty, 'kg')} (${inp.code}) من ${r.no}`);
    return r;
  });
}
function butcheryDropPack({ id, packId }) {
  return tx(() => {
    perm('supervisor', 'storekeeper');
    const r = butById(id); need(r.status === 'open', 'التشغيلة مقفولة');
    const k = r.packs.findIndex(p => p.id === packId); need(k >= 0, 'السطر غير موجود');
    const pk = r.packs[k]; restore(pk.parts);
    post({ date: today(), type: 'butchery', ref: { type: 'butchery', id: r.id, no: r.no }, memo: `رجوع ${item(pk.itemId).name} من تشغيلة الجزارة ${r.no}`, lines: [{ acc: CAT_ACC.pack, dr: pk.value }, { acc: '1304', cr: pk.value }] });
    r.packs.splice(k, 1); audit('butchery_pack_drop', r.no, `رجوع ${pk.qty} ${item(pk.itemId).name}`);
    return r;
  });
}
/* fix the weight of a calf/lot already on the run (owner directly; anyone else asks the owner) */
function checkButcheryInput({ id, inputId, qty, reason }) {
  perm('supervisor', 'storekeeper');
  const r = butById(id); need(r.status === 'open', 'التشغيلة مقفولة: لو الوزن غلط، المالك يلغيها وتتعمل من جديد');
  const inp = r.inputs.find(i => i.id === inputId); need(inp, 'السطر غير موجود');
  need(isInt(qty) && qty > 0 && qty !== inp.qty, 'اكتب الوزن الصح');
  const l = S.lots.find(x => x.id === inp.lotId); need(l, 'الدفعة غير موجودة');
  if (qty > inp.qty) need(l.qty >= qty - inp.qty, `الدفعة ${l.code} فاضل فيها ${fmtQty(l.qty, 'kg')} بس`);
  else need(butOut(r) <= butIn(r) - (inp.qty - qty), 'الناتج المسجل هيبقى أكبر من الداخل');
  return `${r.no} · ${item(inp.itemId).name} (${inp.code}): ${fmtQty(inp.qty, 'kg')} ← ${fmtQty(qty, 'kg')}`;
}
function _butcheryEditInput(a) {
  const text = checkButcheryInput(a);
  const r = butById(a.id), inp = r.inputs.find(i => i.id === a.inputId), l = S.lots.find(x => x.id === inp.lotId), acc = CAT_ACC[item(inp.itemId).cat];
  const ref = { type: 'butchery', id: r.id, no: r.no };
  if (a.qty > inp.qty) {
    const part = takeFromLot(l, a.qty - inp.qty);
    post({ date: today(), type: 'butchery', ref, memo: `تعديل وزن ${item(inp.itemId).name} على ${r.no}: +${fmtQty(part.qty, 'kg')}`, lines: [{ acc: '1304', dr: part.value }, { acc, cr: part.value }] });
    inp.value += part.value;
  } else {
    const back = inp.qty - a.qty, v = mulDiv(inp.value, back, inp.qty);
    l.qty += back; l.value += v;
    post({ date: today(), type: 'butchery', ref, memo: `تعديل وزن ${item(inp.itemId).name} على ${r.no}: −${fmtQty(back, 'kg')} رجعت المخزن`, lines: [{ acc, dr: v }, { acc: '1304', cr: v }] });
    inp.value -= v;
  }
  (r.edits = r.edits || []).push({ at: stamp(today()), by: S.currentUser, inputId: inp.id, from: inp.qty, to: a.qty, reason: String(a.reason || '').slice(0, 200) });
  inp.qty = a.qty;
  audit('butchery_in_edit', r.no, `تعديل وزن: ${text}`);
  return r;
}
function butcheryEditInput(a) { return editable('butcheryEditInput', a, checkButcheryInput, _butcheryEditInput); }
/* what was already done with a lot (for a clear refusal instead of negative stock) */
function lotUsage(l) {
  const u = [], kg = q => fmtQty(q, item(l.itemId).unit);
  for (const v of S.docs.invoices) for (const ln of v.lines) for (const p of ln.parts || []) if (p.lotId === l.id) u.push(`اتباع منها ${kg(p.qty)} في فاتورة ${v.no}`);
  for (const b of S.docs.batches) for (const i of b.issues) if (!i.reversed) for (const p of i.parts || []) if (p.lotId === l.id) u.push(`اتصرف منها ${kg(p.qty)} على التشغيلة ${b.no}`);
  for (const r of butcheries()) if (r.status !== 'cancelled') for (const i of r.inputs) if (i.lotId === l.id) u.push(`دخل منها ${kg(i.qty)} تشغيلة الجزارة ${r.no}`);
  for (const t of S.docs.transfers) if (t.lotCode === l.code && t.qty < l.inQty) u.push(`اتنقل منها ${kg(t.qty)} (${t.no})`);
  for (const w of S.docs.writeoffs) if (w.lotCode === l.code) u.push(`اتعدم منها ${kg(w.qty)} (${w.no})`);
  if (!u.length) u.push(`اتصرف منها ${kg(l.inQty - l.qty)}`);
  return u.slice(0, 3).join('، ');
}
function wholeOutputs(r, verb) { // every output lot of a closed run must be untouched
  return r.outputs.filter(o => o.lotCode).map(o => {
    const l = S.lots.find(x => x.code === o.lotCode && x.src && x.src.id === r.id) || S.lots.find(x => x.code === o.lotCode);
    need(l, `دفعة الناتج ${o.lotCode} مش موجودة`);
    need(l.qty === l.inQty && l.value === l.inValue, `القطعية «${item(o.itemId).name}» (${o.lotCode}) ${lotUsage(l)}. مينفعش التشغيلة ${verb} غير لما ترجّع ده الأول (مرتجع أو تصحيح)`);
    return l;
  });
}
/* the owner reopens a closed run: the cuts leave stock, their cost goes back to the run, and it can be edited and closed again */
function reopenButchery({ id, reason }) {
  return tx(() => {
    perm(); // owner only
    const r = butById(id); need(r.status === 'closed', 'التشغيلة مش مقفولة');
    reason = String(reason || '').trim().slice(0, 200); need(reason.length >= 3, 'اكتب سبب الفتح');
    const lots = wholeOutputs(r, 'تتفتح');
    let toRaw = 0, toFg = 0;
    lots.forEach(l => { if (item(l.itemId).cat === 'product') toFg += l.value; else toRaw += l.value; l.qty = 0; l.value = 0; l.cancelled = true; });
    post({ date: today(), type: 'butchery_reopen', ref: { type: 'butchery', id: r.id, no: r.no }, memo: `فتح تشغيلة الجزارة ${r.no} تاني · ${reason}`, lines: [{ acc: '1304', dr: toRaw + toFg }, { acc: CAT_ACC.meat, cr: toRaw }, { acc: '1305', cr: toFg }] });
    r.outputs.forEach(o => { delete o.value; delete o.lotCode; });
    (r.reopens = r.reopens || []).push({ at: stamp(today()), by: S.currentUser, reason, closedAt: r.closedAt });
    Object.assign(r, { status: 'open' }); ['inKg', 'outKg', 'loss', 'cost', 'closeDate', 'closedAt', 'closedBy', 'je'].forEach(k => delete r[k]);
    audit('butchery_reopen', r.no, `فتح ${r.no} تاني: الناتج اتشال من المخزن ورجعت تكلفته للتشغيلة · ${reason}`);
    return r;
  });
}
/* the owner cancels a run: everything goes back where it came from, the run stays in the log as «اتلغت» */
function cancelButchery({ id, reason }) {
  return tx(() => {
    perm(); // owner only
    const r = butById(id); need(r.status === 'open' || r.status === 'closed', 'التشغيلة اتلغت قبل كده');
    reason = String(reason || '').trim().slice(0, 200); need(reason.length >= 3, 'اكتب سبب الإلغاء');
    const lines = [];
    if (r.status === 'closed') { // the output lots must still be whole (nothing sold, moved or used from them)
      const outLots = wholeOutputs(r, 'تتلغي');
      outLots.forEach(l => { lines.push({ acc: item(l.itemId).cat === 'product' ? '1305' : CAT_ACC.meat, cr: l.value }); l.qty = 0; l.value = 0; l.cancelled = true; });
    } else lines.push({ acc: '1304', cr: butCost(r) });
    for (const inp of r.inputs) { const l = S.lots.find(x => x.id === inp.lotId); l.qty += inp.qty; l.value += inp.value; lines.push({ acc: CAT_ACC[item(inp.itemId).cat], dr: inp.value }); }
    for (const pk of r.packs) { restore(pk.parts); lines.push({ acc: CAT_ACC.pack, dr: pk.value }); }
    const merged = {}; for (const l of lines) { const k = l.acc + (l.dr ? ':d' : ':c'); merged[k] = merged[k] || { acc: l.acc, dr: 0, cr: 0 }; merged[k].dr += l.dr || 0; merged[k].cr += l.cr || 0; }
    post({ date: today(), type: 'butchery_cancel', ref: { type: 'butchery', id: r.id, no: r.no }, memo: `إلغاء تشغيلة الجزارة ${r.no} · ${reason}`, lines: Object.values(merged) });
    Object.assign(r, { wasStatus: r.status, status: 'cancelled', cancelReason: reason, cancelledBy: S.currentUser, cancelledAt: stamp(today()) });
    audit('butchery_cancel', r.no, `إلغاء ${r.no}: كل الدفعات والأكياس رجعت المخزن · ${reason}`);
    return r;
  });
}
function butcheryDropOutput({ id, lineId }) {
  return tx(() => {
    perm('supervisor', 'storekeeper');
    const r = butById(id); need(r.status === 'open', 'التشغيلة مقفولة');
    const k = r.outputs.findIndex(o => o.id === lineId); need(k >= 0, 'السطر غير موجود');
    r.outputs.splice(k, 1); return r;
  });
}
function newCutItem({ name, cat, sub, priceRetail }) { // the floor adds a new cut/by-product without waiting for the owner
  return tx(() => {
    perm('supervisor', 'storekeeper');
    name = String(name || '').trim().slice(0, 60); need(name.length >= 2, 'اكتب اسم الصنف');
    need(!S.items.some(i => i.name === name), 'فيه صنف بنفس الاسم');
    need(cat === 'meat' || cat === 'byproduct', 'اختار: قطعية ولا ناتج (عضم، دهن…)');
    need(isInt(priceRetail || 0) && (priceRetail || 0) >= 0, 'السعر غير صحيح');
    if (cat === 'meat') need(priceRetail > 0, 'القطعية محتاجة سعر بيع للكيلو عشان التكلفة تتوزع صح');
    const used = S.items.filter(i => i.code.startsWith('RM-')).map(i => parseInt(i.code.slice(3), 10) || 0);
    const it = { id: uid('IT'), code: `RM-${Math.max(0, ...used) + 1}`, name, cat, unit: 'kg', priceRetail: cat === 'meat' ? priceRetail : 0, priceWholesale: 0, minQty: 0, vat: 0, active: true };
    const sb = String(sub || '').trim().slice(0, 40); if (sb) it.sub = sb;
    S.items.push(it);
    audit('item_add', it.code, `إضافة صنف من تشغيلة الجزارة: ${name}`);
    return it;
  });
}
function closeButchery({ id, date, wh, fgWh }) {
  return tx(() => {
    perm('supervisor', 'storekeeper'); checkDate(date);
    const r = butById(id); need(r.status === 'open', 'التشغيلة مقفولة بالفعل'); need(date >= r.date, 'تاريخ القفل قبل فتح التشغيلة');
    need(r.outputs.length, 'سجل الناتج الأول');
    need(r.packs.some(p => p.qty > 0), 'سجّل الأكياس اللي اتصرفت على التشغيلة الأول (عددها بيدخل في التكلفة)');
    const inKg = butIn(r), outKg = butOut(r); need(outKg <= inKg, 'الناتج أكبر من الداخل');
    const dest = wh || r.inputs[0].wh; need(['raw', 'receiving'].includes(whUse(dest)), 'اختار تلاجة إنتاج أو مخزن الاستلام');
    const cost = butCost(r);
    const fz = fgWh || whs('fg')[0]; if (r.outputs.some(o => item(o.itemId).cat === 'product')) need(whUse(fz) === 'fg', 'اختار فريزر للمنتجات الجاهزة');
    // fixed-cost lines first (e.g. مفاريم 350، غضاريف 35، بوش 150 للكيلو؛ عضم وإعدام صفر), the rest is spread by sale value
    const fixed = r.outputs.map(o => { const it = item(o.itemId); return it.waste ? 0 : isInt(it.fixedCost) && it.cat !== 'product' ? mulDiv(o.qty, it.fixedCost, 1000) : it.cat === 'byproduct' ? 0 : null; });
    const unpriced = r.outputs.filter((o, k) => fixed[k] == null && !(item(o.itemId).priceRetail > 0)).map(o => item(o.itemId).name);
    need(!unpriced.length, `القطعيات دي ملهاش سعر بيع ولا تكلفة ثابتة، فكانت هتطلع تكلفتها صفر: ${[...new Set(unpriced)].join('، ')}. حط لها سعر بيع أو تكلفة ثابتة من «الأصناف والأسعار» وبعدين اقفل`);
    const fixedT = fixed.reduce((a, v) => a + (v || 0), 0);
    need(fixedT <= cost, `التكلفة الثابتة للقطعيات (${money(fixedT)}) أكبر من تكلفة التشغيلة (${money(cost)}). راجع التكلفة الثابتة في الأصناف`);
    const weights = r.outputs.map((o, k) => fixed[k] != null ? 0 : mulDiv(o.qty, item(o.itemId).priceRetail, 1000));
    need(cost - fixedT === 0 || weights.some(w => w > 0), 'لازم قطعية واحدة على الأقل ليها سعر بيع عشان باقي التكلفة يتوزع عليها');
    const spread = alloc(cost - fixedT, weights.some(w => w > 0) ? weights : weights.map(() => 0));
    const values = r.outputs.map((o, k) => fixed[k] != null ? fixed[k] : spread[k]);
    const exp = r.inputs.map(i => i.expDate).sort()[0];
    let toRaw = 0, toFg = 0;
    r.outputs.forEach((o, k) => { const isP = item(o.itemId).cat === 'product';
      if (item(o.itemId).waste) { o.value = 0; o.waste = true; return; } // «إعدام»: thrown away, no stock lot
      const lot = newLot({ itemId: o.itemId, wh: isP ? fz : dest, qty: o.qty, value: values[k], inDate: date, prodDate: date, expDate: isP ? addDays(date, S.settings.fgShelfDays) : exp, packSize: isP ? o.packSize : null, src: { type: 'butchery', id: r.id, no: r.no } });
      o.value = values[k]; o.lotCode = lot.code; if (isP) toFg += values[k]; else toRaw += values[k]; });
    r.je = post({ date, type: 'butchery_close', ref: { type: 'butchery', id: r.id, no: r.no }, memo: `قفل تشغيلة الجزارة ${r.no}: ناتج ${fmtQty(outKg, 'kg')} من ${fmtQty(inKg, 'kg')}`, lines: [{ acc: CAT_ACC.meat, dr: toRaw }, { acc: '1305', dr: toFg }, { acc: '1304', cr: cost }] }).no;
    Object.assign(r, { status: 'closed', inKg, outKg, loss: inKg - outKg, cost, wh: dest, closeDate: date, closedAt: stamp(date), closedBy: S.currentUser });
    audit('butchery_close', r.no, `قفل ${r.no}: داخل ${fmtQty(inKg, 'kg')}، ناتج ${fmtQty(outKg, 'kg')}، فقد ${fmtQty(inKg - outKg, 'kg')} (${(inKg ? (inKg - outKg) * 100 / inKg : 0).toFixed(1)}٪)`, date);
    return r;
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
const running = b => b.status === 'open' || b.status === 'packing'; // packing = the meat side is done, the dry (packing) worker adds packaging
const batchKg = b => b.issues.filter(i => !i.reversed && item(i.itemId).unit === 'kg' && item(i.itemId).cat !== 'pack').reduce((s, i) => s + i.qty, 0) - (b.returns || []).reduce((s, r) => s + r.qty, 0);
function batchCostNow(b) { return b.issues.filter(i => !i.reversed).reduce((s, i) => s + i.value, 0) - (b.returns || []).reduce((s, r) => s + r.value, 0); }
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
    perm('worker', 'supervisor', 'packer'); date = date || today(); checkDate(date);
    const b = batchById(batchId); need(running(b), 'التشغيلة مقفولة');
    need(date >= b.date, 'تاريخ الصرف قبل تاريخ التشغيلة');
    const it = item(itemId), r = me().role;
    if (it.cat === 'pack') { need(r !== 'worker', 'مواد التعبئة بيصرفها عامل التقفيل'); need(b.status === 'packing' || r !== 'packer', 'التشغيلة لسه عند عامل اللحوم'); }
    else { need(r !== 'packer', 'عامل التقفيل بيصرف مواد تعبئة بس'); need(b.status === 'open', 'عامل اللحوم خلّص التشغيلة دي، اتحولت للتقفيل'); }
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
    const b = batchById(batchId); need(running(b), 'التشغيلة مقفولة، التصحيح مش متاح');
    const ln = b.issues.find(i => i.id === issueId); need(ln && !ln.reversed, 'السطر غير موجود');
    need(isInt(newQty) && newQty >= 0 && newQty !== ln.qty, 'اكتب الكمية الصحيحة');
    need(reason && reason.trim().length >= 3, 'اكتب سبب التصحيح');
    need(!S.docs.corrections.some(c => c.issueId === issueId && c.status === 'pending'), 'فيه طلب تصحيح مفتوح على السطر ده');
    const it = item(ln.itemId);
    const c = { id: uid('R'), no: nextNo('RQ'), batchId, issueId, itemId: ln.itemId, oldQty: ln.qty, newQty, reason: reason.trim(), status: 'pending', by: S.currentUser, at: stamp(today()) };
    S.docs.corrections.push(c);
    if (me().role === 'owner') { _decideCorrection(c, true); return c; } // the owner's own correction applies at once
    alert('info', 'correction', `طلب تصحيح من ${userName(S.currentUser)} على ${b.no}: ${it.name} من ${fmtQty(ln.qty, it.unit)} إلى ${fmtQty(newQty, it.unit)} · السبب: ${c.reason}`, { type: 'batch', id: b.id, no: b.no });
    S.alerts[S.alerts.length - 1].kb = [['✅ موافقة', 'cor:ok:' + c.id], ['❌ رفض', 'cor:no:' + c.id]];
    audit('correction_request', b.no, `طلب تصحيح ${c.no}: ${it.name} ${fmtQty(ln.qty, it.unit)} ← ${fmtQty(newQty, it.unit)}`);
    return c;
  });
}
function decideCorrection(id, approve) {
  return tx(() => {
    perm(); // owner only
    const c = S.docs.corrections.find(x => x.id === id); need(c && c.status === 'pending', 'الطلب غير موجود');
    return _decideCorrection(c, approve);
  });
}
function _decideCorrection(c, approve) {
  {
    const b = batchById(c.batchId);
    const it = item(c.itemId);
    if (approve) {
      need(running(b), 'التشغيلة اتقفلت، ارفض الطلب');
      const ln = b.issues.find(i => i.id === c.issueId);
      restore(ln.parts);
      ln.reversed = true; ln.reversedBy = c.no;
      post({ date: today(), type: 'issue_reverse', ref: { type: 'batch', id: b.id, no: b.no }, memo: `عكس صرف ${it.name} على ${b.no} (تصحيح ${c.no})`, lines: [{ acc: CAT_ACC[it.cat], dr: ln.value }, { acc: '1304', cr: ln.value }] });
      if (c.newQty > 0) _issue(b, c.itemId, c.newQty, today(), `تصحيح ${c.no}`);
    }
    c.status = approve ? 'approved' : 'rejected'; c.decidedBy = S.currentUser; c.decidedAt = stamp(today());
    audit('correction_' + c.status, b.no, `${approve ? 'موافقة على' : 'رفض'} طلب التصحيح ${c.no} (${it.name})`);
    return c;
  }
}
function finishMeat({ batchId, noSpice = false }) { // the meat worker is done: the batch moves to the dry (packing) worker (noSpice: made without spices on purpose)
  return tx(() => {
    perm('worker', 'supervisor');
    const b = batchById(batchId); need(b.status === 'open', 'التشغيلة مش عند عامل اللحوم');
    need(batchKg(b) > 0, 'مفيش خامات اتصرفت على التشغيلة');
    const spiced = b.issues.some(i => !i.reversed && item(i.itemId).cat === 'spice');
    b.status = 'packing'; b.meatDoneAt = stamp(today()); b.meatDoneBy = S.currentUser; if (noSpice || !spiced) b.noSpice = true;
    audit('batch_packing', b.no, `عامل اللحوم خلّص ${b.no}: اتحولت للتقفيل${b.noSpice ? ' (بدون توابل)' : ''}`);
    alert('info', 'packing', `التشغيلة ${b.no} جاهزة للتقفيل`, { type: 'batch', id: b.id, no: b.no });
    return b;
  });
}
const reworkItem = () => { const it = S.items.find(i => i.rework); need(it, 'مفيش صنف «إعادة تصنيع» معرّف'); return it; };
function returnRework({ batchId, qty, date }) { // dough left in the machine goes back to the chiller as «إعادة تصنيع», at its share of the batch cost
  return tx(() => {
    perm('supervisor'); date = date || today(); checkDate(date);
    const b = batchById(batchId); need(running(b), 'التشغيلة مقفولة'); need(date >= b.date, 'التاريخ قبل التشغيلة');
    const kg = batchKg(b), meatCost = b.issues.filter(i => !i.reversed && item(i.itemId).cat !== 'pack').reduce((s, i) => s + i.value, 0) - (b.returns || []).reduce((s, r) => s + r.value, 0);
    need(isInt(qty) && qty > 0 && qty < kg, `الكمية لازم تكون أقل من الخامات اللي على التشغيلة (${fmtQty(kg, 'kg')})`);
    const value = mulDiv(meatCost, qty, kg), it = reworkItem();
    const exps = b.issues.filter(i => !i.reversed && item(i.itemId).cat !== 'pack').flatMap(i => i.parts.map(p => (S.lots.find(l => l.id === p.lotId) || {}).expDate)).filter(Boolean).sort();
    const rawW = whs('raw'); need(rawW.length, 'مفيش تلاجة إنتاج');
    const lot = newLot({ itemId: it.id, wh: rawW[0], qty, value, inDate: date, prodDate: date, expDate: exps[0] && exps[0] > date ? exps[0] : addDays(date, 2), src: { type: 'batch', id: b.id, no: b.no } });
    const je = post({ date, type: 'rework', ref: { type: 'batch', id: b.id, no: b.no }, memo: `إعادة تصنيع ${fmtQty(qty, 'kg')} من ${b.no} للتلاجة`, lines: [{ acc: CAT_ACC.meat, dr: value }, { acc: '1304', cr: value }] });
    (b.returns = b.returns || []).push({ id: uid('RW'), qty, value, lotCode: lot.code, je: je.no, at: stamp(date), by: S.currentUser });
    audit('rework', b.no, `رجوع ${fmtQty(qty, 'kg')} عجينة من ${b.no} كـ«إعادة تصنيع» (${lot.code})`, date);
    return lot;
  });
}
function bagItemFor(size) { const it = S.items.find(i => i.cat === 'pack' && i.packFor === size); need(it, 'مفيش كيس معرّف للعبوة ' + size / 1000 + ' كجم'); return it; }
function stickerItem() { const it = S.items.find(i => i.cat === 'pack' && i.sticker); need(it, 'مفيش استيكر معرّف'); return it; }

function closeBatch({ batchId, date, packs, split }) {
  return tx(() => {
    perm('supervisor'); checkDate(date);
    const b = batchById(batchId); need(running(b), 'التشغيلة مقفولة بالفعل');
    need(date >= b.date, 'تاريخ القفل قبل تاريخ التشغيلة');
    const inputKg = batchKg(b);
    need(inputKg > 0, 'مفيش خامات اتصرفت على التشغيلة');
    packs = Object.fromEntries(Object.entries(packs || {}).map(([k, v]) => [parseInt(k, 10), v]).filter(([, v]) => v));
    let output = 0, count = 0;
    const p = item(b.productId), pSizes = packsOf(p);
    for (const [g, n] of Object.entries(packs)) { const s = +g; need(isInt(n) && n > 0, 'عدد عبوات غير صحيح'); need(pSizes.includes(s) || isOpenWeight(s), `العبوة ${s} جم مش متاحة للمنتج ده`); output += n * s; count += n; }
    need(count > 0, 'سجل عدد العبوات الناتجة');
    need(output <= inputKg, `الناتج (${fmtQty(output, 'kg')}) أكبر من الخامات المصروفة (${fmtQty(inputKg, 'kg')})`);
    need(!S.docs.corrections.some(c => c.batchId === b.id && c.status === 'pending'), 'فيه طلب تصحيح مستني موافقة على التشغيلة دي');
    // packaging: one bag per standard pack (unless the packing worker already issued that bag) + one sticker per pack; open-weight trays are issued by hand
    const sizes = Object.keys(packs).map(Number).sort((a, c) => a - c);
    for (const s of sizes) if (PACK_SIZES.includes(s) || OLD_BAG(s)) { const bag = bagItemFor(s); if (!issuedOf(b, bag.id)) _issue(b, bag.id, packs[s], date, 'تعبئة تلقائية'); }
    if (!issuedOf(b, stickerItem().id)) _issue(b, stickerItem().id, count, date, 'تعبئة تلقائية');
    const cost = batchCostNow(b);
    const vals = alloc(cost, sizes.map(s => packs[s] * s));
    // where the packs go: one freezer by default, or split across finished-goods freezers
    const fgW = whs('fg'); need(fgW.length, 'مفيش فريزر منتج تام متعرّف');
    const dest = (split && split.length ? split : [{ wh: fgW[0], packs }]).map(d => ({ wh: d.wh, packs: Object.fromEntries(Object.entries(d.packs || {}).map(([k, v]) => [parseInt(k, 10), v])) }));
    for (const d of dest) { need(whUse(d.wh) === 'fg', `"${whName(d.wh)}" مش فريزر منتج تام`); for (const [k, v] of Object.entries(d.packs)) need(isInt(v) && v >= 0 && packs[k] != null || !v, `عبوة ${k} جم مش في الناتج`); }
    for (const s2 of sizes) { const tot = dest.reduce((a, d) => a + (d.packs[s2] || 0), 0); need(tot === packs[s2], `توزيع عبوات ${s2} جم على الفريزرات (${tot}) مش مساوي للعدد (${packs[s2]})`); }
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
const OLD_BAG = s => !!S.items.find(i => i.cat === 'pack' && i.packFor === s); // a bag defined for a non-standard size (e.g. old 1.5 kg) is still used

/* the owner reopens or cancels a closed production batch (same rules as butchery): only while its finished packs are untouched */
function _unclose(b, why) {
  const lots = S.lots.filter(l => l.batchId === b.id && l.src && l.src.type === 'batch' && l.src.id === b.id && !l.cancelled); // lots from an earlier close that was reopened are already gone
  for (const l of lots) need(l.qty === l.inQty && l.value === l.inValue, `العبوات «${item(l.itemId).name} ${l.packSize} جم» (${l.code}) ${lotUsage(l)}. مينفعش التشغيلة ${why} غير لما ترجّع ده الأول (مرتجع أو تصحيح)`);
  const val = lots.reduce((a, l) => a + l.value, 0);
  lots.forEach(l => { l.qty = 0; l.value = 0; l.cancelled = true; });
  const ref = { type: 'batch', id: b.id, no: b.no };
  post({ date: today(), type: 'batch_reopen', ref, memo: `فتح التشغيلة ${b.no} تاني: العبوات اتشالت من الفريزر`, lines: [{ acc: '1304', dr: val }, { acc: '1305', cr: val }] });
  for (const ln of b.issues.filter(i => !i.reversed && i.note === 'تعبئة تلقائية')) { // bags & stickers issued by the close come back
    restore(ln.parts); ln.reversed = true; ln.reversedBy = 'فتح التشغيلة';
    post({ date: today(), type: 'issue_reverse', ref, memo: `رجوع ${item(ln.itemId).name} (تعبئة تلقائية) من ${b.no}`, lines: [{ acc: CAT_ACC[item(ln.itemId).cat], dr: ln.value }, { acc: '1304', cr: ln.value }] });
  }
  (b.reopens = b.reopens || []).push({ at: stamp(today()), by: S.currentUser, closedAt: b.closedAt, packs: b.packs });
  b.status = b.meatDoneAt ? 'packing' : 'open';
  ['packs', 'split', 'output', 'inputKg', 'waste', 'cost', 'costPerKg', 'closedAt', 'closeDate', 'closedBy', 'je'].forEach(k => delete b[k]);
  b.packs = null; b.output = 0; b.waste = 0; b.cost = 0; b.inputKg = 0;
}
function reopenBatch({ batchId, reason }) {
  return tx(() => {
    perm(); // owner only
    const b = batchById(batchId); need(b.status === 'closed', 'التشغيلة مش مقفولة');
    reason = String(reason || '').trim().slice(0, 200); need(reason.length >= 3, 'اكتب سبب الفتح');
    _unclose(b, 'تتفتح'); b.reopens[b.reopens.length - 1].reason = reason;
    audit('batch_reopen', b.no, `فتح ${b.no} تاني: العبوات اتشالت من الفريزر والأكياس رجعت · ${reason}`);
    return b;
  });
}
function cancelBatch({ batchId, reason }) {
  return tx(() => {
    perm(); // owner only
    const b = batchById(batchId); need(b.status !== 'cancelled', 'التشغيلة اتلغت قبل كده');
    reason = String(reason || '').trim().slice(0, 200); need(reason.length >= 3, 'اكتب سبب الإلغاء');
    if (b.status === 'closed') _unclose(b, 'تتلغي');
    need(!S.docs.corrections.some(c => c.batchId === b.id && c.status === 'pending'), 'فيه طلب تصحيح مستني على التشغيلة دي: اتعامل معاه الأول');
    const ref = { type: 'batch', id: b.id, no: b.no };
    for (const r of b.returns || []) { // rework that went back to the chiller must still be whole
      const l = S.lots.find(x => x.code === r.lotCode && x.src && x.src.id === b.id); need(l && l.qty === l.inQty, `عجينة إعادة التصنيع (${r.lotCode}) ${l ? lotUsage(l) : 'مش موجودة'}. مينفعش التشغيلة تتلغي`);
      post({ date: today(), type: 'rework', ref, memo: `إلغاء إعادة تصنيع ${r.lotCode} مع إلغاء ${b.no}`, lines: [{ acc: '1304', dr: l.value }, { acc: CAT_ACC.meat, cr: l.value }] }); r.value = l.value; l.qty = 0; l.value = 0; l.cancelled = true;
    }
    for (const ln of b.issues.filter(i => !i.reversed)) {
      restore(ln.parts); ln.reversed = true; ln.reversedBy = 'إلغاء التشغيلة';
      post({ date: today(), type: 'issue_reverse', ref, memo: `رجوع ${item(ln.itemId).name} من ${b.no} (إلغاء)`, lines: [{ acc: CAT_ACC[item(ln.itemId).cat], dr: ln.value }, { acc: '1304', cr: ln.value }] });
    }
    b.returns = []; // their value went back to the batch and out again with the issues
    Object.assign(b, { status: 'cancelled', cancelReason: reason, cancelledBy: S.currentUser, cancelledAt: stamp(today()) });
    audit('batch_cancel', b.no, `إلغاء ${b.no}: كل الخامات والأكياس رجعت المخزن · ${reason}`);
    return b;
  });
}
function priceFor(p, cust) { // a customer's own price list wins (e.g. Healthy); then wholesale / retail
  const own = cust && cust.prices && cust.prices[p.id]; if (isInt(own) && own > 0) return own;
  return cust && cust.kind === 'wholesale' ? (p.priceWholesale || p.priceRetail) : p.priceRetail;
}
const SELL_RAW = ['meat', 'carcass', 'byproduct', 'spice', 'pack']; // ANY stock item can be sold as it is (owner, Nov 2026): by weight, or by piece for packaging
const sellStores = it => (it.cat === 'pack' ? whs('pack') : [...whs('raw'), ...whs('receiving')]);
const rawSellable = it => SELL_RAW.includes(it.cat) && !it.waste && !it.rework;
function setCustomerPrices({ customerId, prices }) {
  return tx(() => {
    perm('accountant');
    const c = partner(customerId); need(c.type === 'customer', 'اختار عميل');
    need(prices && typeof prices === 'object' && !Array.isArray(prices), 'قايمة الأسعار غير صحيحة');
    const out = {};
    for (const [id, v] of Object.entries(prices)) {
      if (v == null || v === 0 || v === '') continue;
      const it = item(id); need(it.cat === 'product' || rawSellable(it), `"${it.name}" مش صنف بيتباع`);
      need(isInt(v) && v > 0 && v <= 10000000, `سعر "${it.name}" غير صحيح`); out[id] = v;
    }
    const before = Object.keys(c.prices || {}).length;
    if (Object.keys(out).length) c.prices = out; else delete c.prices;
    audit('customer_prices', c.name, `قايمة أسعار ${c.name}: ${Object.keys(out).length} صنف (كانت ${before})`);
    return c.prices || {};
  });
}
let orderCredit = false; // set only while decideOrder approves a WhatsApp order (pay on delivery)
function invoice({ date, customerId, lines, discount = 0, method, vatIncluded = false, deliveryFee = 0, branchId }) {
  return tx(() => {
    perm('sales', 'accountant'); checkDate(date);
    const c = partner(customerId); need(c.type === 'customer', 'اختار عميل');
    need(method === 'credit' || methodAcc(method), 'اختار طريقة الدفع'); if (method !== 'credit') useAcc(methodAcc(method));
    if (method === 'credit' && !orderCredit) need(c.terms === 'credit', `${c.name} عميل كاش، مينفعش آجل`);
    lines = (lines || []).filter(l => l.count > 0);
    need(lines.length, 'أضف صنف واحد على الأقل');
    need(isInt(discount) && discount >= 0, 'الخصم غير صحيح');
    // a customer with branches (e.g. Healthy): every delivery names its branch; all of them share one account
    const br = c.branches && c.branches.length ? c.branches.find(b => b.id === branchId) : null;
    need(!(c.branches && c.branches.length) || br || orderCredit, `اختار فرع ${c.name}`); // a WhatsApp order has no branch picker: it goes on the main account
    const no = nextNo('INV', 5);
    const doc = { id: uid('V'), no, date, customerId, kind: c.kind, method, lines: [], gross: 0, discount, net: 0, vat: 0, total: 0, cost: 0, by: S.currentUser, at: stamp(date) };
    if (br) { doc.branchId = br.id; doc.branchName = br.name; }
    for (const ln of lines) {
      const p = item(ln.productId);
      if (p.cat !== 'product') { // a stock item sold as it is: count = grams (kg items) or pieces, packSize 1
        need(rawSellable(p), 'صنف غير قابل للبيع');
        need(isInt(ln.count) && ln.count > 0, p.unit === 'kg' ? `اكتب وزن "${p.name}"` : `اكتب عدد "${p.name}"`);
        const price = ln.pricePerKg != null ? ln.pricePerKg : priceFor(p, c);
        need(isInt(price) && price > 0, `سعر "${p.name}" غير صحيح (حطّ سعر بيع للصنف أو اكتبه في الفاتورة)`);
        const parts = consume(p.id, ln.count, sellStores(p));
        const cost = parts.reduce((s, x) => s + x.value, 0), amount = mulDiv(ln.count, price, unitBase(p.unit));
        doc.lines.push({ productId: p.id, raw: true, unit: p.unit, packSize: 1, count: ln.count, qty: ln.count, pricePerKg: price, amount, cost, parts });
        doc.gross += amount; doc.cost += cost; const a = CAT_ACC[p.cat]; doc.rawCosts = doc.rawCosts || {}; doc.rawCosts[a] = (doc.rawCosts[a] || 0) + cost; continue;
      }
      need(p.cat === 'product', 'صنف غير قابل للبيع');
      need(packsOf(p).includes(ln.packSize) || (isInt(ln.packSize) && available(p.id, whs('fg'), ln.packSize) > 0), 'حجم العبوة مش متاح للمنتج ده');
      need(isInt(ln.count) && ln.count > 0, 'عدد غير صحيح');
      const price = ln.pricePerKg != null ? ln.pricePerKg : priceFor(p, c);
      need(isInt(price) && price > 0, `سعر "${p.name}" غير صحيح`);
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
    doc.je = post({ date, type: 'sale', ref, memo: `فاتورة بيع ${no} · ${c.name}${br ? ' · فرع ' + br.name : ''}`, lines: [
      { acc: '1201', dr: doc.total, partner: c.id }, { acc: revAcc, cr: doc.net - (doc.deliveryNet || 0) }, ...(doc.deliveryNet ? [{ acc: '4103', cr: doc.deliveryNet }] : []), { acc: '2102', cr: doc.vat },
      { acc: '5101', dr: doc.cost }, { acc: '1305', cr: doc.cost - Object.values(doc.rawCosts || {}).reduce((a, b) => a + b, 0) }, ...Object.entries(doc.rawCosts || {}).map(([acc, v]) => ({ acc, cr: v }))] }).no;
    if (method !== 'credit') {
      doc.paidJe = post({ date, type: 'receipt', ref, memo: `تحصيل فاتورة ${no} (${methodName(method)})`, lines: [{ acc: methodAcc(method), dr: doc.total }, { acc: '1201', cr: doc.total, partner: c.id }] }).no;
    }
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    doc.eta = { uuid: Array.from({ length: 32 }, hex).join(''), status: 'valid' };
    S.docs.invoices.push(doc);
    audit('invoice', no, `فاتورة ${no} لـ ${c.name}: ${money(doc.total)} (${methodName(method)})`, date);
    return doc;
  });
}

function cashBalance(acc) { return S.journal.reduce((s, j) => s + j.lines.filter(l => l.acc === acc).reduce((a, l) => a + l.dr - l.cr, 0), 0); }
let cardReceipt = false; // set only while a verified Paymob callback books its receipt
function invoicePaid(v) { // money already collected against one sale invoice
  const o = orders().find(x => x.invoiceId === v.id);
  return (v.method !== 'credit' ? v.total : 0) + (o ? o.paidAmount || 0 : 0) + S.docs.receipts.filter(r => r.invoiceId === v.id).reduce((s, r) => s + r.amount, 0);
}
function receipt({ date, customerId, amount, method, memo, invoiceId }) {
  return tx(() => {
    if (!cardReceipt) perm('accountant', 'sales'); checkDate(date);
    const c = partner(customerId); need(c.type === 'customer', 'اختار عميل');
    need(methodAcc(method), 'اختار طريقة التحصيل'); useAcc(methodAcc(method));
    need(isInt(amount) && amount > 0, 'المبلغ غير صحيح');
    let inv = null;
    if (invoiceId) {
      inv = S.docs.invoices.find(v => v.id === invoiceId); need(inv && inv.customerId === c.id, 'الفاتورة مش للعميل ده');
      need(!orders().some(o => o.invoiceId === inv.id), 'فاتورة طلب واتساب: التحصيل بيتسجل من شاشة الطلب');
      need(amount <= inv.total - invoiceReturned(inv) - invoicePaid(inv), `المتبقي على الفاتورة ${money(inv.total - invoiceReturned(inv) - invoicePaid(inv))} بس`);
    }
    const no = nextNo('RC');
    const je = post({ date, type: 'receipt', ref: { type: 'receipt', no }, memo: `تحصيل ${no} من ${c.name}${inv ? ' · فاتورة ' + inv.no : ''}${memo ? ' · ' + memo : ''}`, lines: [{ acc: methodAcc(method), dr: amount }, { acc: '1201', cr: amount, partner: c.id }] });
    const doc = { id: uid('RC'), no, date, customerId, amount, method, memo: memo || '', je: je.no, by: S.currentUser, at: je.at, ...(inv ? { invoiceId: inv.id } : {}) };
    S.docs.receipts.push(doc);
    audit('receipt', no, `تحصيل ${money(amount)} من ${c.name} (${methodName(method)})`, date);
    return doc;
  });
}
/* ---------- edits after saving: the owner edits directly; anyone else sends a request the owner approves (app or Telegram) ---------- */
const CHANGE_OPS = { editPurchaseLine: 'تعديل استلام', invoiceReturn: 'مرتجع فاتورة', invoicePrice: 'تعديل سعر في فاتورة', butcheryEditInput: 'تعديل وزن في تشغيلة جزارة' };
const changes = () => S.docs.changes || (S.docs.changes = []);
function asRequest(op, args, text) {
  const reason = String(args.reason || '').trim().slice(0, 200); need(reason.length >= 3, 'اكتب سبب التعديل');
  need(!changes().some(c => c.status === 'pending' && c.op === op && JSON.stringify(c.args) === JSON.stringify(args)), 'نفس الطلب مستني موافقة المالك');
  const c = { id: uid('CH'), no: nextNo('CHG'), op, args: JSON.parse(JSON.stringify(args)), text, reason, status: 'pending', by: S.currentUser, at: stamp(today()) };
  changes().push(c);
  alert('info', 'change', `طلب ${CHANGE_OPS[op]} ${c.no} من ${userName(S.currentUser)}: ${text} · السبب: ${reason}`, { type: 'change', id: c.id, no: c.no });
  S.alerts[S.alerts.length - 1].kb = [['✅ موافقة', 'chg:ok:' + c.id], ['❌ رفض', 'chg:no:' + c.id]];
  audit('change_request', c.no, `طلب ${CHANGE_OPS[op]}: ${text}`);
  return { requested: true, no: c.no };
}
function decideChange(id, approve, note) {
  return tx(() => {
    perm(); // owner only
    const c = changes().find(x => x.id === id); need(c && c.status === 'pending', 'الطلب غير موجود أو اتعامل معاه قبل كده');
    let result = null;
    if (approve) result = CHANGE_IMPL[c.op]({ ...c.args, reason: `${c.reason} (طلب ${c.no})` });
    Object.assign(c, { status: approve ? 'approved' : 'rejected', decidedBy: S.currentUser, decidedAt: stamp(today()), note: String(note || '').slice(0, 200) });
    audit('change_' + c.status, c.no, `${approve ? 'موافقة على' : 'رفض'} ${CHANGE_OPS[c.op]} ${c.no}: ${c.text}`);
    return { change: c, result };
  });
}
// every edit: check it first (so a request is never sent for something impossible), then apply only if the owner is the one asking
function editable(op, args, check, apply) {
  return tx(() => {
    const text = check(args);
    if (me().role !== 'owner') return asRequest(op, args, text);
    return apply(args);
  });
}

/* receiving: fix weight / price after saving (e.g. 20 kg booked, 19 kg found) — stock and the supplier's account follow */
function checkPurchaseLine({ purchaseId, line, qty, unitCost, reason }) {
  perm('storekeeper', 'accountant');
  const p = S.docs.purchases.find(x => x.id === purchaseId); need(p, 'فاتورة الاستلام غير موجودة');
  const ln = p.lines[line]; need(ln, 'السطر غير موجود');
  const it = item(ln.itemId);
  qty = qty == null ? ln.qty : qty; unitCost = unitCost == null ? ln.unitCost : unitCost;
  need(isInt(qty) && qty > 0 && isInt(unitCost) && unitCost > 0, 'اكتب الكمية والسعر صح');
  need(qty !== ln.qty || unitCost !== ln.unitCost, 'مفيش تغيير');
  const value = mulDiv(qty, unitCost, unitBase(it.unit));
  const lot = S.lots.find(l => l.id === ln.lotId); need(lot, 'الدفعة غير موجودة');
  need(lot.qty + qty - ln.qty >= 0, `اتصرف من الدفعة ${lot.code} أكتر من الكمية الجديدة. فاضل فيها ${fmtQty(lot.qty, it.unit)} بس`);
  need(lot.value + value - ln.value >= 0, 'القيمة الجديدة أقل من اللي اتصرف من الدفعة');
  need(reason == null || String(reason).trim().length >= 3 || me().role === 'owner', 'اكتب سبب التعديل');
  return `${p.no} · ${it.name}: ${fmtQty(ln.qty, it.unit)} × ${money(ln.unitCost)} ← ${fmtQty(qty, it.unit)} × ${money(unitCost)}`;
}
function _editPurchaseLine(a) {
  const text = checkPurchaseLine(a);
  const p = S.docs.purchases.find(x => x.id === a.purchaseId), ln = p.lines[a.line], it = item(ln.itemId), sup = partner(p.supplierId);
  const qty = a.qty == null ? ln.qty : a.qty, unitCost = a.unitCost == null ? ln.unitCost : a.unitCost;
  const value = mulDiv(qty, unitCost, unitBase(it.unit)), dq = qty - ln.qty, dv = value - ln.value;
  const lot = S.lots.find(l => l.id === ln.lotId);
  lot.qty += dq; lot.inQty += dq; lot.value += dv; lot.inValue += dv;
  const acc = CAT_ACC[it.cat];
  if (dv) post({ date: today(), type: 'purchase_edit', ref: { type: 'purchase', id: p.id, no: p.no }, memo: `تعديل استلام ${p.no} · ${sup.name} · ${it.name}`, lines: dv > 0 ? [{ acc, dr: dv }, { acc: '2101', cr: dv, partner: sup.id }] : [{ acc: '2101', dr: -dv, partner: sup.id }, { acc, cr: -dv }] });
  (p.edits = p.edits || []).push({ at: stamp(today()), by: S.currentUser, line: a.line, from: { qty: ln.qty, unitCost: ln.unitCost }, to: { qty, unitCost }, reason: String(a.reason || '').slice(0, 200) });
  Object.assign(ln, { qty, unitCost, value }); p.net += dv; p.total += dv;
  averageCost(ln.itemId);
  audit('purchase_edit', p.no, `تعديل استلام: ${text}`);
  return p;
}
function editPurchaseLine(a) { return editable('editPurchaseLine', a, checkPurchaseLine, _editPurchaseLine); }

/* sales returns (credit note): the goods go back to the freezer (or to waste), the sale and the customer's balance are reversed; refund from a cash box only if asked */
const returns = () => S.docs.returns || (S.docs.returns = []);
const invoiceReturned = v => v.returned || 0;
function checkReturn({ invoiceId, lines, restock = true, refund, reason, date }) {
  perm('sales', 'accountant');
  const v = S.docs.invoices.find(x => x.id === invoiceId); need(v, 'الفاتورة غير موجودة');
  lines = (lines || []).filter(l => l.count > 0); need(lines.length, 'اختار اللي راجع');
  if (date) checkDate(date);
  for (const l of lines) { const L = v.lines[l.idx]; need(L, 'سطر غير موجود'); need(isInt(l.count) && l.count <= L.count - (L.returned || 0), `${item(L.productId).name}: المتاح للمرتجع ${L.count - (L.returned || 0)} عبوة بس`); }
  if (refund) { need(methodAcc(refund), 'اختار الخزنة اللي هترجع منها'); }
  return `${v.no} · ${partner(v.customerId).name}: ${lines.map(l => `${l.count} × ${item(v.lines[l.idx].productId).name} ${v.lines[l.idx].packSize} جم`).join('، ')}${restock ? '' : ' (هالك)'}${refund ? ' · رد فلوس' : ''}`;
}
function _invoiceReturn(a) {
  const text = checkReturn(a);
  const { invoiceId, restock = true, refund } = a, date = a.date || today();
  const v = S.docs.invoices.find(x => x.id === invoiceId), c = partner(v.customerId);
  const lines = a.lines.filter(l => l.count > 0);
  const no = nextNo('RT');
  let gross = 0, cost = 0; const rawBack = {}, out = [];
  for (const l of lines) {
    const L = v.lines[l.idx];
    const amt = l.count === L.count - (L.returned || 0) ? L.amount - (L.retAmount || 0) : mulDiv(L.amount, l.count, L.count);
    const cst = l.count === L.count - (L.returned || 0) ? L.cost - (L.retCost || 0) : mulDiv(L.cost, l.count, L.count);
    L.returned = (L.returned || 0) + l.count; L.retAmount = (L.retAmount || 0) + amt; L.retCost = (L.retCost || 0) + cst;
    let lotCode = null;
    if (restock && cst >= 0 && L.raw) {
      const src = (L.parts || []).map(p => S.lots.find(x => x.id === p.lotId)).find(Boolean), rit = item(L.productId);
      const lot = newLot({ itemId: L.productId, wh: src && sellStores(rit).includes(src.wh) ? src.wh : sellStores(rit)[0], qty: l.count, value: cst, inDate: date, prodDate: src ? src.prodDate : date, expDate: src ? src.expDate : addDays(date, 3), src: { type: 'return', id: v.id, no } });
      lotCode = lot.code;
    } else if (restock && cst >= 0) {
      const src = (L.parts || []).map(p => S.lots.find(x => x.id === p.lotId)).find(Boolean);
      const lot = newLot({ itemId: L.productId, wh: src && whUse(src.wh) === 'fg' ? src.wh : whs('fg')[0], qty: l.count * L.packSize, value: cst, inDate: date, prodDate: src ? src.prodDate : date, expDate: src ? src.expDate : addDays(date, S.settings.fgShelfDays), packSize: L.packSize, src: { type: 'return', id: v.id, no } });
      lotCode = lot.code;
    }
    out.push({ idx: l.idx, productId: L.productId, packSize: L.packSize, count: l.count, amount: amt, cost: cst, lotCode, raw: !!L.raw });
    gross += amt; cost += cst; if (L.raw) { const a = CAT_ACC[item(L.productId).cat]; rawBack[a] = (rawBack[a] || 0) + cst; }
  }
  const rawSum = Object.values(rawBack).reduce((a, b) => a + b, 0);
  const all = v.lines.every(L => (L.returned || 0) >= L.count);
  const goods = v.total - (v.deliveryFee || 0), goodsVat = v.vat - ((v.deliveryFee || 0) - (v.deliveryNet || 0));
  const total = all ? goods - invoiceReturned(v) : mulDiv(goods, gross, v.gross);
  const vat = all ? goodsVat - (v.returnedVat || 0) : (v.vat ? mulDiv(goodsVat, gross, v.gross) : 0);
  const revAcc = v.kind === 'wholesale' ? '4102' : '4101';
  const ref = { type: 'return', id: v.id, no };
  const je = post({ date, type: 'return', ref, memo: `مرتجع ${no} على فاتورة ${v.no} · ${c.name}${restock ? '' : ' (هالك)'}`, lines: [
    { acc: revAcc, dr: total - vat }, { acc: '2102', dr: vat }, { acc: '1201', cr: total, partner: c.id },
    { acc: '1305', dr: cost - rawSum }, ...Object.entries(rawBack).map(([acc, v]) => ({ acc, dr: v })), { acc: '5101', cr: cost }] });
  if (!restock && cost) post({ date, type: 'writeoff', ref, memo: `هالك مرتجع ${no} (مش هيتباع تاني)`, lines: [{ acc: '5102', dr: cost }, { acc: '1305', cr: cost - rawSum }, ...Object.entries(rawBack).map(([acc, v]) => ({ acc, cr: v }))] }); // the goods came back but are thrown away
  let refundJe = null;
  if (refund && total) { const acc = useAcc(methodAcc(refund), { pay: true }); need(moneyKind(acc) !== 'credit', 'رد الفلوس بيكون من خزنة أو بنك'); enough(acc, total);
    refundJe = post({ date, type: 'refund', ref, memo: `رد فلوس مرتجع ${no} لـ ${c.name}`, lines: [{ acc: '1201', dr: total, partner: c.id }, { acc, cr: total }] }).no; }
  v.returned = invoiceReturned(v) + total; v.returnedVat = (v.returnedVat || 0) + vat;
  const doc = { id: uid('RT'), no, date, invoiceId: v.id, invNo: v.no, customerId: c.id, lines: out, total, vat, cost, restock: !!restock, refund: refund || null, je: je.no, refundJe, reason: String(a.reason || '').slice(0, 200), by: S.currentUser, at: je.at };
  returns().push(doc);
  audit('return', no, `مرتجع: ${text} · ${money(total)}`, date);
  return doc;
}
function invoiceReturn(a) { return editable('invoiceReturn', a, checkReturn, _invoiceReturn); }

/* price fix on a saved invoice line (the difference goes on the customer's account) */
function checkInvoicePrice({ invoiceId, idx, pricePerKg, reason }) {
  perm('sales', 'accountant');
  const v = S.docs.invoices.find(x => x.id === invoiceId); need(v, 'الفاتورة غير موجودة');
  const L = v.lines[idx]; need(L, 'السطر غير موجود');
  need(!v.vat && !v.vatIncluded, 'الفاتورة دي عليها ضريبة أو جاية من واتساب: اعمل مرتجع وفاتورة جديدة');
  need(!L.returned, 'السطر ده عليه مرتجع، اعمل مرتجع للباقي وفاتورة جديدة');
  need(isInt(pricePerKg) && pricePerKg > 0 && pricePerKg !== L.pricePerKg, 'اكتب السعر الجديد');
  const d = mulDiv(L.qty, pricePerKg, L.unit === 'pc' ? 1 : 1000) - L.amount; need(v.gross + d >= v.discount, 'الخصم هيبقى أكبر من الفاتورة');
  return `${v.no} · ${item(L.productId).name}: ${money(L.pricePerKg)} ← ${money(pricePerKg)} للكيلو (${d >= 0 ? '+' : '−'}${money(Math.abs(d))})`;
}
function _invoicePrice(a) {
  const text = checkInvoicePrice(a);
  const v = S.docs.invoices.find(x => x.id === a.invoiceId), L = v.lines[a.idx], c = partner(v.customerId);
  const amount = mulDiv(L.qty, a.pricePerKg, L.unit === 'pc' ? 1 : 1000), d = amount - L.amount, revAcc = v.kind === 'wholesale' ? '4102' : '4101';
  post({ date: today(), type: 'invoice_edit', ref: { type: 'invoice', id: v.id, no: v.no }, memo: `تعديل سعر في فاتورة ${v.no} · ${c.name}`, lines: d > 0 ? [{ acc: '1201', dr: d, partner: c.id }, { acc: revAcc, cr: d }] : [{ acc: revAcc, dr: -d }, { acc: '1201', cr: -d, partner: c.id }] });
  (v.edits = v.edits || []).push({ at: stamp(today()), by: S.currentUser, idx: a.idx, from: L.pricePerKg, to: a.pricePerKg, reason: String(a.reason || '').slice(0, 200) });
  L.pricePerKg = a.pricePerKg; L.amount = amount; v.gross += d; v.net += d; v.total += d;
  audit('invoice_edit', v.no, `تعديل سعر: ${text}`);
  return v;
}
function invoicePrice(a) { return editable('invoicePrice', a, checkInvoicePrice, _invoicePrice); }
const CHANGE_IMPL = { editPurchaseLine: _editPurchaseLine, invoiceReturn: _invoiceReturn, invoicePrice: _invoicePrice, butcheryEditInput: _butcheryEditInput };

/* ---------- WhatsApp orders: the bot places them (no stock or ledger effect); sales/owner approve → invoice on account ---------- */
const ORDER_METHODS = { cash: 'كاش عند الاستلام', instapay: 'إنستاباي', card: 'فيزا أونلاين (Paymob)' };
const PREPAID = m => m === 'instapay' || m === 'card'; // money must arrive before the order goes out
function normPhone(s) { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('20') && d.length === 12) d = '0' + d.slice(2); return d; }
function customerByPhone(phone) { const n = normPhone(phone); return n.length >= 8 ? S.partners.find(p => p.type === 'customer' && normPhone(p.phone) === n) || null : null; }
function orders() { return S.docs.orders || (S.docs.orders = []); }
function reservedQty(productId, packSize) { return orders().filter(o => o.status === 'pending').reduce((s, o) => s + o.lines.filter(l => l.productId === productId && l.packSize === packSize).reduce((a, l) => a + l.qty, 0), 0); }
function orderable(productId, packSize) { return Math.max(0, available(productId, whs('fg'), packSize) - reservedQty(productId, packSize)); }
const egpOf = p => p / 100;
const deliveryFeeNow = () => (isInt(S.settings.deliveryFee) && S.settings.deliveryFee >= 0 ? S.settings.deliveryFee : 10000); // fixed delivery, piasters
const orderGrand = o => o.total + (o.fee || 0); // what the customer pays: items + delivery (older orders had no fee on the order)
function catalog(phone) { // read-only view for the bot: prices in EGP per kg, stock in whole packs not already promised to pending orders
  const c = customerByPhone(phone), kind = c && c.kind === 'wholesale' ? 'wholesale' : 'retail';
  return {
    customer: c ? { name: c.name, kind } : null, kind, vatRate: S.settings.vatRate, deliveryFee: egpOf(deliveryFeeNow()),
    products: S.items.filter(i => i.cat === 'product' && i.active !== false).map(i => ({
      id: i.id, code: i.code, name: i.name, group: i.group || '', pricePerKg: egpOf(priceFor(i, c || { kind })), retailPerKg: egpOf(i.priceRetail), wholesalePerKg: egpOf(i.priceWholesale),
      packs: packsOf(i).map(size => ({ size, price: egpOf(mulDiv(size, priceFor(i, c || { kind }), 1000)), inStock: Math.floor(orderable(i.id, size) / size) })),
    })),
  };
}
function orderStatus(phone) {
  const n = normPhone(phone);
  return orders().filter(o => o.phone === n).slice(-3).map(o => ({ no: o.no, status: o.status, total: egpOf(orderGrand(o)), delivered: !!o.deliveredAt, out: !!o.outAt, at: o.at, reason: o.reason || '' }));
}
function olog(o, action, note) { (o.log || (o.log = [])).push({ at: stamp(today()), by: S.currentUser, action, note: String(note || '').slice(0, 200) }); if (o.log.length > 100) o.log.splice(0, o.log.length - 100); }
function placeOrder({ phone, name, address, method, lines, note, test, expectTotal }) {
  return tx(() => { // no perm(): only the shop endpoint (shared key) reaches this; it is not in the dashboard op list
    const ph = normPhone(phone);
    need(/^\d{8,15}$/.test(ph), 'رقم التليفون غير صحيح');
    need(name && String(name).trim().length >= 2 && String(name).trim().length <= 60, 'اكتب الاسم');
    need(address && String(address).trim().length >= 5 && String(address).trim().length <= 300, 'اكتب العنوان بالتفصيل');
    need(ORDER_METHODS[method], 'اختار الدفع: كاش أو إنستاباي أو فيزا');
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
      phone: ph, name: String(name).trim(), address: String(address).trim(), method, note: String(note || '').slice(0, 300), kind, customerId: c ? c.id : null, lines: [], total: 0, fee: deliveryFeeNow() };
    for (const ln of merged.values()) {
      const p = item(ln.productId), qty = ln.count * ln.packSize, left = orderable(p.id, ln.packSize);
      need(left >= qty, `${p.name} عبوة ${ln.packSize} جم: المتاح ${Math.floor(left / ln.packSize)} بس`);
      const pricePerKg = priceFor(p, c || { kind }), amount = mulDiv(qty, pricePerKg, 1000);
      o.lines.push({ productId: p.id, name: p.name, packSize: ln.packSize, count: ln.count, qty, pricePerKg, amount }); o.total += amount;
    }
    if (expectTotal != null) need(Math.round(expectTotal * 100) === o.total, `السعر اتغير: الإجمالي الصح ${money(o.total)}`);
    olog(o, 'placed', `${o.lines.length} صنف · ${money(orderGrand(o))} شامل التوصيل · ${ORDER_METHODS[method]}`);
    orders().push(o);
    const pack = g => g >= 1000 ? `${g / 1000} كجم` : `${g} جم`;
    alert('info', 'order', `🛒 طلب واتساب ${o.no}${o.test ? ' (تجربة)' : ''}\n${o.name} · ${ph}\n${o.address}\n${o.lines.map(l => `• ${l.count} × ${l.name} ${pack(l.packSize)} = ${money(l.amount)}`).join('\n')}${o.fee ? `\n• التوصيل = ${money(o.fee)}` : ''}\nالإجمالي ${money(orderGrand(o))} شامل الضريبة والتوصيل · ${ORDER_METHODS[method]}${kind === 'wholesale' ? ' · عميل جملة' : ''}\nمستني موافقة من «طلبات واتساب»`, { type: 'order', id: o.id, no: o.no });
    if (o.test) S.alerts[S.alerts.length - 1].tg = 'test'; // test orders never reach the owner's Telegram
    audit('order', o.no, `طلب واتساب ${o.no} من ${o.name}: ${money(orderGrand(o))}${o.test ? ' (تجربة)' : ''}`);
    return { id: o.id, no: o.no, method, total: egpOf(orderGrand(o)), itemsTotal: egpOf(o.total), deliveryFee: egpOf(o.fee || 0), kind, lines: o.lines.map(l => ({ name: l.name, packSize: l.packSize, count: l.count, amount: egpOf(l.amount) })) };
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
    return { id: o.id, no: o.no, test: o.test, name: o.name, phone: o.phone, total: egpOf(orderGrand(o)) };
  });
}
function orderNotified({ id, kind, image }) { // image: the receipt picture went out (only then is the invoice "sent")
  return tx(() => {
    const o = orders().find(x => x.id === id); need(o, 'الطلب غير موجود');
    need(['approved', 'paid', 'resend', 'nopay', 'rejected', 'proofok', 'eta', 'out'].includes(kind), 'نوع الرسالة غير معروف');
    if (image === true && o.invoiceId) { o.invoiceSentAt = stamp(today()); olog(o, 'invoice_sent', kind); }
    else olog(o, 'confirm_sent', kind);
    return { ok: true };
  });
}
function orderPayLink({ id, url, intentionId, paymobOrderId, ref, amountCents }) { // shop endpoint: a Paymob pay link was made for this order
  return tx(() => {
    const o = orders().find(x => x.id === id); need(o && o.method === 'card', 'مفيش طلب فيزا بالرقم ده');
    need(!(o.card && o.card.status === 'paid') && !o.receiptNo, 'الطلب ده اتدفع خلاص');
    need(isInt(amountCents) && amountCents === orderGrand(o), 'مبلغ لينك الدفع مش مطابق للطلب');
    o.pay = { url: String(url || '').slice(0, 600), intentionId: String(intentionId || ''), paymobOrderId: String(paymobOrderId || ''), ref: String(ref || ''), amount: amountCents, at: stamp(today()) };
    (o.payRefs || (o.payRefs = [])).push(o.pay.paymobOrderId); if (o.payRefs.length > 10) o.payRefs.shift();
    olog(o, 'paylink', `لينك دفع Paymob · ${money(amountCents)}`);
    return { ok: true };
  });
}
function orderCardPaid({ paymobOrderId, ref, txId, amountCents, pan }) { // Paymob callback, HMAC already verified by the paymob function
  return tx(() => {
    const pid = String(paymobOrderId || ''), oid = String(ref || '').replace(/-[A-Z0-9]{1,8}$/, '');
    const o = orders().find(x => x.method === 'card' && ((pid && (x.payRefs || []).includes(pid)) || (oid && x.id === oid)));
    if (!o) { alert('bad', 'order', `💳⚠️ دفع Paymob وصل لطلب مش معروف\nالمبلغ ${money(amountCents)} · عملية ${txId}\nراجع لوحة Paymob`); return { notify: null, problem: 'no_order' }; }
    if (o.card && o.card.txId === String(txId)) return { id: o.id, notify: null, problem: 'duplicate' }; // Paymob retries callbacks
    if (o.receiptNo || (o.card && o.card.status === 'paid') || o.status === 'rejected' || !isInt(amountCents) || amountCents !== orderGrand(o)) {
      alert('bad', 'order', `💳⚠️ دفع Paymob على طلب ${o.no} محتاج مراجعة\nالمبلغ ${money(amountCents)} (المطلوب ${money(orderGrand(o))}) · عملية ${txId}\n${o.status === 'rejected' ? 'الطلب مرفوض: رجّع الفلوس من لوحة Paymob' : o.receiptNo || o.card ? 'الطلب مدفوع قبل كده: دفع مكرر' : 'المبلغ مختلف'}`, { type: 'order', id: o.id, no: o.no });
      if (o.test) S.alerts[S.alerts.length - 1].tg = 'test';
      olog(o, 'card_problem', `عملية ${txId} · ${money(amountCents)}`); return { id: o.id, notify: null, problem: 'mismatch' };
    }
    o.card = { status: 'paid', txId: String(txId), amount: amountCents, pan: String(pan || '').slice(-4), at: stamp(today()) };
    olog(o, 'card_paid', `Paymob · عملية ${o.card.txId} · ${money(amountCents)}`);
    let notify = 'proofok';
    if (o.status === 'approved') { // already approved: book the receipt now, as the system user
      const inv = S.docs.invoices.find(v => v.id === o.invoiceId), due = inv.total - (o.paidAmount || 0), amount = Math.min(amountCents, due);
      if (amount > 0) {
        let rc; cardReceipt = true;
        try { rc = receipt({ date: today(), customerId: o.customerId, amount, method: 'card', memo: `طلب واتساب ${o.no} · Paymob · عملية ${o.card.txId}` }); } finally { cardReceipt = false; }
        o.paidAmount = (o.paidAmount || 0) + amount; (o.receipts = o.receipts || []).push(rc.no);
        if (o.paidAmount >= inv.total) Object.assign(o, { receiptNo: rc.no, paidAt: stamp(today()), paidBy: 'paymob' });
        olog(o, 'paid', `فيزا (Paymob) · ${rc.no} · ${money(amount)}`); notify = 'paid';
      }
    }
    alert('info', 'order', `💳 دفع فيزا وصل ✅ · ${o.no}${o.test ? ' (تجربة)' : ''}\n${o.name} · ${o.phone}\nالمبلغ ${money(amountCents)} · كارت ${o.card.pan ? '•••• ' + o.card.pan : ''}\nعملية Paymob ${o.card.txId}${o.status === 'pending' ? '\nالطلب لسه مستني موافقة من «طلبات واتساب»' : ''}`, { type: 'order', id: o.id, no: o.no });
    if (o.test) S.alerts[S.alerts.length - 1].tg = 'test';
    audit('order_card_paid', o.no, `دفع فيزا Paymob لطلب ${o.no}: ${money(amountCents)}`);
    return { id: o.id, no: o.no, test: !!o.test, notify };
  });
}
function orderView(id) { // read-only: what the bot needs to message the customer
  const o = orders().find(x => x.id === id); if (!o) return null;
  const inv = o.invoiceId ? S.docs.invoices.find(v => v.id === o.invoiceId) : null;
  return { id: o.id, no: o.no, status: o.status, test: !!o.test, phone: o.phone, name: o.name, address: o.address, method: o.method, methodName: ORDER_METHODS[o.method], paid: !!o.receiptNo, reason: o.reason || '',
    lines: o.lines.map(l => ({ name: l.name, packSize: l.packSize, count: l.count, amount: egpOf(l.amount) })), total: egpOf(orderGrand(o)), itemsTotal: egpOf(o.total), deliveryFee: egpOf(o.fee || 0),
    invoice: inv ? { no: inv.no, date: inv.date, net: egpOf(inv.net), vat: egpOf(inv.vat), total: egpOf(inv.total), vatRate: S.settings.vatRate, deliveryFee: egpOf(inv.deliveryFee || 0) } : null,
    delivery: o.delivery ? { fee: egpOf(o.delivery.fee || 0), eta: (o.delivery.eta && o.delivery.eta.text) || '', note: o.delivery.note || '' } : null,
    paidAmount: egpOf(o.receiptNo && inv ? inv.total : o.paidAmount || 0), due: inv ? egpOf(Math.max(0, inv.total - (o.receiptNo ? inv.total : o.paidAmount || 0))) : null,
    receiptNo: o.receiptNo || '', cardPaid: !!(o.card && o.card.status === 'paid'), sent: !!o.sentAt, invoiceSent: !!o.invoiceSentAt, out: !!o.outAt, delivered: !!o.deliveredAt };
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
      let rc; orderMoney = true;
      try { rc = receipt({ date: T, customerId: o.customerId, amount, method: o.method, memo: `طلب واتساب ${o.no}${memo ? ' · ' + memo : ''}` }); } finally { orderMoney = false; }
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
      const fee = o.fee != null ? o.fee : deliveryFee == null ? 0 : deliveryFee; need(isInt(fee) && fee >= 0 && fee <= 500000, 'رسوم التوصيل غير صحيحة'); // new orders carry the fixed fee; older ones keep the typed one
      const when = cleanEta(eta);
      try { inv = invoice({ date: T, customerId: c.id, lines: o.lines.map(l => ({ productId: l.productId, packSize: l.packSize, count: l.count, pricePerKg: l.pricePerKg })), method: 'credit', vatIncluded: true, deliveryFee: fee }); } finally { orderCredit = false; }
      o.delivery = { fee, eta: when, note: cleanNote(note), setBy: S.currentUser, setAt: stamp(T) };
      olog(o, 'delivery', `${fee ? 'توصيل ' + money(fee) : 'توصيل مجاني'}${when ? ' · ' + when.text : ''}`);
      Object.assign(o, { status: 'approved', customerId: c.id, invoiceId: inv.id, invoiceNo: inv.no, decidedBy: S.currentUser, decidedAt: stamp(T) });
      olog(o, 'approved', `فاتورة ${inv.no}`);
      audit('order_approve', o.no, `موافقة على طلب واتساب ${o.no} ← فاتورة ${inv.no}`);
    };
    if (action === 'approve') { approve(); if (o.proof && o.proof.status === 'ok') collect(orderGrand(o), 'تحويل إنستاباي'); else if (o.card && o.card.status === 'paid') collect(o.card.amount, `Paymob · عملية ${o.card.txId}`); return o; }
    if (action === 'proofok') { // the owner checked the InstaPay transfer: it arrived
      need(o.proof && o.proof.status === 'pending' && !o.receiptNo, 'مفيش صورة تحويل مستنية مراجعة');
      o.proof.status = 'ok'; olog(o, 'proof_ok', 'التحويل وصل');
      if (o.status === 'approved') collect(orderGrand(o), 'تحويل إنستاباي');
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
        need(o.method !== 'card' && o.proof && o.proof.status !== 'rejected', 'الطلب لازم يتوافق عليه الأول');
        o.proof.status = 'ok'; olog(o, 'proof_ok', 'التحويل وصل'); return o;
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
    if (action === 'out') { // the order left with the driver
      need(o.status === 'approved', 'الطلب لازم يتوافق عليه الأول'); need(!o.test, 'ده طلب تجربة'); need(!o.deliveredAt, 'الطلب ده اتسلّم خلاص');
      need(!PREPAID(o.method) || o.receiptNo, 'الدفع لسه متأكدش: أكّد إن الفلوس وصلت الأول');
      o.outAt = stamp(T); o.outBy = S.currentUser; olog(o, 'out', ''); return o;
    }
    if (action === 'delivered') { // the customer got it: closes the order (cash is collected on delivery)
      need(o.status === 'approved', 'الطلب لازم يتوافق عليه الأول'); need(!o.test, 'ده طلب تجربة'); need(!o.deliveredAt, 'الطلب ده اتسلّم خلاص');
      if (!o.receiptNo) { need(!PREPAID(o.method), 'الدفع لسه متأكدش: أكّد إن الفلوس وصلت الأول'); collect(invOf().total, 'كاش عند الاستلام'); if (o.sentAt && o.receiptNo) o.invoiceSentAt = stamp(T); }
      if (!o.outAt) { o.outAt = stamp(T); o.outBy = S.currentUser; }
      o.deliveredAt = stamp(T); o.deliveredBy = S.currentUser; olog(o, 'delivered', ''); return o;
    }
    if (action === 'resend') { need(o.status === 'approved' && o.invoiceId, 'الفاتورة بتتبعت بعد الموافقة'); olog(o, 'edited', 'طلب إعادة إرسال الفاتورة'); return o; }
    fail('عملية غير معروفة');
  });
}

function supplierPayment({ date, supplierId, amount, method, memo }) {
  return tx(() => {
    perm('accountant'); checkDate(date);
    const s = partner(supplierId); need(s.type === 'supplier', 'اختار مورد');
    const acc = useAcc(methodAcc(method), { pay: true });
    need(isInt(amount) && amount > 0, 'المبلغ غير صحيح'); enough(acc, amount);
    const no = nextNo('PY');
    const je = post({ date, type: 'payment', ref: { type: 'payment', no }, memo: `سداد ${no} لـ ${s.name}${memo ? ' · ' + memo : ''}`, lines: [{ acc: '2101', dr: amount, partner: s.id }, { acc, cr: amount }] });
    const doc = { id: uid('PY'), no, date, supplierId, amount, method, memo: memo || '', je: je.no, by: S.currentUser, at: je.at };
    S.docs.payments.push(doc);
    audit('payment', no, `سداد ${money(amount)} لـ ${s.name} (${methodName(method)})`, date);
    return doc;
  });
}
function expense({ date, acc, amount, method, memo }) {
  return tx(() => {
    perm('accountant'); checkDate(date);
    need(EXPENSE_ACCS.includes(acc), 'اختار نوع المصروف');
    const pacc = useAcc(methodAcc(method), { pay: true });
    need(isInt(amount) && amount > 0, 'المبلغ غير صحيح'); enough(pacc, amount);
    const no = nextNo('EX');
    const name = ACCOUNTS.find(a => a.code === acc).name;
    const je = post({ date, type: 'expense', ref: { type: 'expense', no }, memo: `${name}${memo ? ' · ' + memo : ''}`, lines: [{ acc, dr: amount }, { acc: pacc, cr: amount }] });
    const doc = { id: uid('EX'), no, date, acc, amount, method, memo: memo || '', je: je.no, by: S.currentUser, at: je.at };
    S.docs.expenses.push(doc);
    audit('expense', no, `مصروف ${name}: ${money(amount)}`, date);
    return doc;
  });
}
const TRANSFERABLE = ['cash', 'bank', 'wallet', 'gateway'];
function cashTransfer({ date, from, to, amount, memo }) {
  return tx(() => {
    perm('accountant'); checkDate(date);
    const fa = methodAcc(from), ta = methodAcc(to);
    need(fa && ta && fa !== ta, 'اختار حسابين مختلفين');
    need(TRANSFERABLE.includes(moneyKind(fa)) && TRANSFERABLE.includes(moneyKind(ta)), 'التحويل بيكون بين الخزن والبنوك والمحافظ بس');
    for (const a of [fa, ta]) { if (a === '1107') need(me().role === 'owner', 'الخزنة الرئيسية للمالك بس'); staffOnly(a); }
    need(isInt(amount) && amount > 0, 'المبلغ غير صحيح'); enough(fa, amount);
    const no = nextNo('CT');
    const je = post({ date, type: 'cash', ref: { type: 'cash', no }, memo: `تحويل من ${accLabel(fa)} إلى ${accLabel(ta)}${memo ? ' · ' + String(memo).slice(0, 120) : ''}`, lines: [{ acc: ta, dr: amount }, { acc: fa, cr: amount }] });
    S.docs.cash.push({ id: uid('CT'), no, date, from, to, amount, memo: memo || '', je: je.no, by: S.currentUser, at: je.at });
    audit('cash', no, `تحويل ${money(amount)} من ${accLabel(fa)} إلى ${accLabel(ta)}`, date);
  });
}
/* ---------- money in from anywhere (a cheque cashed, a partner's money, a loan, other income) ---------- */
const DEPOSIT_KINDS = { cheque: 'شيك', cash: 'كاش', transfer: 'تحويل', other: 'أخرى' };
const depositSources = () => ACCOUNTS.filter(a => LEAF.has(a.code) && ((a.code[0] === '3' && a.code !== '3201') || moneyKind(a.code) === 'loan' || a.code[0] === '4' && !['4101', '4102', '4103'].includes(a.code) || TRANSFERABLE.includes(moneyKind(a.code)))).map(a => a.code);
function deposit({ date, to, amount, source, kind, memo, ref }) {
  return tx(() => {
    perm('accountant'); checkDate(date);
    const ta = methodAcc(to); need(ta && TRANSFERABLE.includes(moneyKind(ta)) && ta !== '1104', 'اختار الخزنة أو البنك اللي الفلوس داخلة فيه');
    if (ta === '1107') need(me().role === 'owner', 'الخزنة الرئيسية للمالك بس');
    staffOnly(ta);
    need(depositSources().includes(source) && source !== ta, 'اختار الفلوس جاية منين');
    if (moneyKind(source)) staffOnly(source);
    if (source === '1107') need(me().role === 'owner', 'الخزنة الرئيسية للمالك بس');
    need(DEPOSIT_KINDS[kind], 'اختار نوع الفلوس (شيك، كاش، تحويل…)');
    need(isInt(amount) && amount > 0, 'المبلغ غير صحيح');
    memo = String(memo || '').trim().slice(0, 200); need(memo.length >= 2, 'اكتب البيان: الفلوس دي إيه؟');
    if (TRANSFERABLE.includes(moneyKind(source))) enough(source, amount);
    const no = nextNo('DP');
    const je = post({ date, type: 'deposit', ref: { type: 'deposit', no }, memo: `إضافة فلوس (${DEPOSIT_KINDS[kind]}${ref ? ' رقم ' + String(ref).slice(0, 40) : ''}) إلى ${accLabel(ta)} من ${accLabel(source)} · ${memo}`, lines: [{ acc: ta, dr: amount }, { acc: source, cr: amount }] });
    const doc = { id: uid('DP'), no, date, to: ta, source, kind, ref: ref ? String(ref).slice(0, 40) : '', amount, memo, je: je.no, by: S.currentUser, at: je.at };
    S.docs.deposits.push(doc);
    audit('deposit', no, `إضافة ${money(amount)} إلى ${accLabel(ta)} (${DEPOSIT_KINDS[kind]}) من ${accLabel(source)}: ${memo}`, date);
    return doc;
  });
}
/* ---------- paying a loan or a credit card: principal + bank cost ---------- */
function payLiability({ date, acc, from, amount, cost = 0, memo }) {
  return tx(() => {
    perm(); checkDate(date); // loans and credit cards are the owner's
    need(['loan', 'credit'].includes(moneyKind(acc)), 'اختار القرض أو الكريدت');
    const fa = methodAcc(from); need(fa && TRANSFERABLE.includes(moneyKind(fa)) && fa !== '1104', 'اختار هتدفع منين');
    if (fa === '1107') need(me().role === 'owner', 'الخزنة الرئيسية للمالك بس');
    need(isInt(amount) && amount >= 0 && isInt(cost) && cost >= 0 && amount + cost > 0, 'المبلغ غير صحيح');
    if (amount) need(amount <= bal(ledger({}), acc), `المبلغ أكبر من رصيد ${accLabel(acc)}`);
    enough(fa, amount + cost);
    const no = nextNo('LP');
    const costAcc = moneyKind(acc) === 'loan' ? '5601' : '5602';
    const je = post({ date, type: 'liability', ref: { type: 'liability', no }, memo: `سداد ${accLabel(acc)} من ${accLabel(fa)}${cost ? ` (منها ${accLabel(costAcc)} ${money(cost)})` : ''}${memo ? ' · ' + String(memo).slice(0, 120) : ''}`,
      lines: [{ acc, dr: amount }, { acc: costAcc, dr: cost }, { acc: fa, cr: amount + cost }] });
    const doc = { id: uid('LP'), no, date, acc, from: fa, amount, cost, memo: memo || '', je: je.no, by: S.currentUser, at: je.at };
    S.docs.liabPays.push(doc);
    audit('liability', no, `سداد ${money(amount + cost)} على ${accLabel(acc)}`, date);
    return doc;
  });
}
/* ---------- staff advances (سلف) and money custody with drivers (عهد): who has the company's money ---------- */
function staffId(name) {
  name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60); need(name.length >= 2, 'اكتب اسم العامل');
  let st = S.staff.find(x => x.name === name);
  if (!st) { st = { id: uid('ST'), name, at: stamp(today()) }; S.staff.push(st); }
  return st.id;
}
const staffName = id => (S.staff.find(x => x.id === id) || {}).name || '—';
function personBalance(kind, id) { return (kind === 'advance' ? S.docs.advances : S.docs.custody).filter(d => d.staffId === id).reduce((s, d) => s + (d.out || 0) - (d.back || 0) - (d.spent || 0), 0); }
function advance({ date, name, amount, method, memo }) {
  return tx(() => {
    perm('accountant'); checkDate(date);
    const fa = useAcc(methodAcc(method), { pay: true }); need(moneyKind(fa) !== 'credit', 'السلفة بتتصرف من خزنة أو بنك');
    need(isInt(amount) && amount > 0, 'المبلغ غير صحيح'); enough(fa, amount);
    const sid = staffId(name), no = nextNo('ADV');
    const je = post({ date, type: 'advance', ref: { type: 'advance', no }, memo: `سلفة لـ ${staffName(sid)}${memo ? ' · ' + String(memo).slice(0, 120) : ''}`, lines: [{ acc: '1202', dr: amount }, { acc: fa, cr: amount }] });
    const doc = { id: uid('ADV'), no, date, staffId: sid, out: amount, from: fa, memo: memo || '', je: je.no, by: S.currentUser, at: je.at };
    S.docs.advances.push(doc);
    audit('advance', no, `سلفة ${money(amount)} لـ ${staffName(sid)}`, date);
    return doc;
  });
}
function advanceBack({ date, name, amount, method, memo }) { // the worker paid some back (or it was taken from his pay)
  return tx(() => {
    perm('accountant'); checkDate(date);
    const sid = staffId(name), ta = useAcc(methodAcc(method)); need(moneyKind(ta) !== 'credit', 'اختار الخزنة أو البنك');
    need(isInt(amount) && amount > 0 && amount <= personBalance('advance', sid), `المبلغ أكبر من السلفة اللي على ${staffName(sid)}`);
    const no = nextNo('ADV');
    const je = post({ date, type: 'advance', ref: { type: 'advance', no }, memo: `رد سلفة من ${staffName(sid)}${memo ? ' · ' + String(memo).slice(0, 120) : ''}`, lines: [{ acc: ta, dr: amount }, { acc: '1202', cr: amount }] });
    const doc = { id: uid('ADV'), no, date, staffId: sid, back: amount, to: ta, memo: memo || '', je: je.no, by: S.currentUser, at: je.at };
    S.docs.advances.push(doc);
    audit('advance', no, `رد سلفة ${money(amount)} من ${staffName(sid)}`, date);
    return doc;
  });
}
function custody({ date, name, amount, method, memo }) { // money handed to a driver/rep to spend on the road
  return tx(() => {
    perm('accountant'); checkDate(date);
    const fa = useAcc(methodAcc(method), { pay: true }); need(moneyKind(fa) !== 'credit', 'العهدة بتتصرف من خزنة أو بنك');
    need(isInt(amount) && amount > 0, 'المبلغ غير صحيح'); enough(fa, amount);
    const sid = staffId(name), no = nextNo('CU');
    const je = post({ date, type: 'custody', ref: { type: 'custody', no }, memo: `عهدة مع ${staffName(sid)}${memo ? ' · ' + String(memo).slice(0, 120) : ''}`, lines: [{ acc: '1203', dr: amount }, { acc: fa, cr: amount }] });
    const doc = { id: uid('CU'), no, date, staffId: sid, out: amount, from: fa, memo: memo || '', je: je.no, by: S.currentUser, at: je.at };
    S.docs.custody.push(doc);
    audit('custody', no, `عهدة ${money(amount)} مع ${staffName(sid)}`, date);
    return doc;
  });
}
function settleCustody({ date, name, back = 0, method, spent = 0, acc, memo }) { // he came back: money returned and/or spent on an expense
  return tx(() => {
    perm('accountant'); checkDate(date);
    const sid = staffId(name);
    need(isInt(back) && back >= 0 && isInt(spent) && spent >= 0 && back + spent > 0, 'اكتب اللي رجع واللي اتصرف');
    need(back + spent <= personBalance('custody', sid), `ده أكتر من العهدة اللي مع ${staffName(sid)}`);
    const ta = back ? useAcc(methodAcc(method)) : null; if (back) need(moneyKind(ta) !== 'credit', 'اختار الخزنة أو البنك');
    if (spent) need(EXPENSE_ACCS.includes(acc), 'اختار نوع المصروف');
    const no = nextNo('CU');
    const je = post({ date, type: 'custody', ref: { type: 'custody', no }, memo: `تسوية عهدة ${staffName(sid)}${memo ? ' · ' + String(memo).slice(0, 120) : ''}`,
      lines: [...(back ? [{ acc: ta, dr: back }] : []), ...(spent ? [{ acc, dr: spent }] : []), { acc: '1203', cr: back + spent }] });
    const doc = { id: uid('CU'), no, date, staffId: sid, back, spent, to: ta, acc: spent ? acc : null, memo: memo || '', je: je.no, by: S.currentUser, at: je.at };
    S.docs.custody.push(doc);
    audit('custody', no, `تسوية عهدة ${staffName(sid)}: رجع ${money(back)} · اتصرف ${money(spent)}`, date);
    return doc;
  });
}
/* ---------- the owner edits the chart: add accounts (a new bank, a new expense…), rename, delete unused ones ---------- */
const NEW_UNDER = { '11': 'fixed', '12': 'current', '21': 'liab', '22': 'loan', '3': 'equity', '4': 'income', '52': 'exp', '53': 'exp', '54': 'exp', '56': 'exp' };
function saveAccount({ code, name, parent, money: mk }) {
  return tx(() => {
    perm(); // owner only
    name = String(name || '').trim().slice(0, 60); need(name.length >= 2, 'اكتب اسم الحساب');
    need(!ACCOUNTS.some(a => a.name === name && a.code !== code), 'فيه حساب بنفس الاسم');
    if (code) { // rename only: codes, parents and kinds never change, so old entries stay where they are
      const a = accOf(code); need(a, 'الحساب غير موجود');
      if (a.sys) S.coa.names[code] = name; else S.coa.added.find(x => x.code === code).name = name;
      applyCoa(S.coa); audit('account', code, `تغيير اسم الحساب ${code} إلى ${name}`); return accOf(code);
    }
    need(NEW_UNDER[parent], 'اختار المجموعة اللي الحساب تحتها');
    const kinds = { current: ['', 'cash', 'bank', 'wallet'], liab: ['', 'credit'], loan: ['loan'] }[NEW_UNDER[parent]] || [''];
    mk = mk || (NEW_UNDER[parent] === 'loan' ? 'loan' : ''); need(kinds.includes(mk), 'نوع الحساب مش مناسب للمجموعة دي');
    const base = parent.length === 1 ? parent + '9' : parent; // 3 → 39xx, 4 → 49xx, 52 → 52xx…
    const used = ACCOUNTS.filter(a => a.code.length === 4 && a.code.startsWith(base)).map(a => parseInt(a.code.slice(2), 10));
    const n = Math.max(parent.length === 1 ? 0 : 50, ...used) + 1; need(n <= 99, 'المجموعة دي اتملت');
    const a = { code: base + String(n).padStart(2, '0'), name, parent, ...(mk ? { money: mk } : {}) };
    S.coa.added.push(a); applyCoa(S.coa);
    audit('account', a.code, `إضافة حساب ${a.code} ${name} تحت ${accLabel(parent)}`);
    return accOf(a.code);
  });
}
function deleteAccount(code) {
  return tx(() => {
    perm();
    const a = accOf(code); need(a && !a.sys, 'ده حساب أساسي في السيستم، ينفع تغيّر اسمه بس');
    need(!S.journal.some(j => j.lines.some(l => l.acc === code)), 'الحساب عليه قيود، مينفعش يتمسح');
    S.coa.added = S.coa.added.filter(x => x.code !== code); applyCoa(S.coa);
    audit('account', code, `مسح الحساب ${code} ${a.name}`);
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
function cleanPacks(list) { // a product's pack sizes, in grams: standard ones or any open weight
  need(Array.isArray(list), 'اختار العبوات');
  const out = [...new Set(list.map(Number))].filter(g => PACK_SIZES.includes(g) || isOpenWeight(g)).sort((a, b) => a - b);
  need(out.length, 'اختار عبوة واحدة على الأقل'); return out;
}
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
    const sub = o.cat === 'meat' || o.cat === 'byproduct' ? String(o.sub || '').trim().slice(0, 40) : ''; // worker-screen section (بلدي فريش، برازيلي، دهون…)
    const fixedCost = (o.cat === 'meat' || o.cat === 'byproduct') && o.fixedCost !== '' && o.fixedCost != null ? o.fixedCost : null; // butchery: this cut always carries this cost per kg
    if (fixedCost != null) need(isInt(fixedCost) && fixedCost >= 0 && fixedCost <= 10000000, 'التكلفة الثابتة غير صحيحة');
    if (o.id) {
      const it = item(o.id);
      for (const f of ['priceRetail', 'priceWholesale']) if (it[f] !== o[f]) {
        S.priceHistory.push({ id: uid('PH'), at: stamp(today()), user: S.currentUser, itemId: it.id, field: f, old: it[f], new: o[f] });
        audit('price', it.code, `تعديل ${f === 'priceRetail' ? 'سعر القطاعي' : 'سعر الجملة'} لـ ${it.name}: ${money(it[f])} ← ${money(o[f])}`);
      }
      if (it.unit !== o.unit) need(!S.lots.some(l => l.itemId === it.id), 'مينفعش تغيّر وحدة صنف عليه حركات');
      if (it.cat !== o.cat) need(!S.lots.some(l => l.itemId === it.id), 'مينفعش تغيّر نوع صنف عليه حركات');
      if (it.cat === 'product' && o.group) it.group = o.group;
      if (it.cat === 'product' && o.packs) it.packs = cleanPacks(o.packs);
      if (sub) it.sub = sub; else delete it.sub;
      if (fixedCost != null) it.fixedCost = fixedCost; else delete it.fixedCost;
      Object.assign(it, { name: o.name.trim(), code: o.code, cat: o.cat, unit: o.unit, priceRetail: o.priceRetail || 0, priceWholesale: o.priceWholesale || 0, minQty: o.minQty || 0, vat: o.vat || 0 });
      audit('item_edit', it.code, `تعديل بيانات الصنف ${it.name}`);
      return it;
    }
    need(!S.items.some(i => i.name === o.name.trim()), 'فيه صنف بنفس الاسم');
    const it = { id: uid('IT'), code: o.code, name: o.name.trim(), cat: o.cat, unit: o.cat === 'pack' ? 'pc' : o.unit, priceRetail: o.priceRetail || 0, priceWholesale: o.priceWholesale || 0, minQty: o.minQty || 0, vat: o.vat || 0, active: true };
    if (o.cat === 'product') { it.packs = o.packs ? cleanPacks(o.packs) : PACK_SIZES.slice(); it.group = o.group || 'مصنعات'; }
    if (o.cat === 'pack' && o.packFor) { need(isInt(o.packFor) && o.packFor >= 50 && o.packFor <= 20000 && !S.items.some(i => i.cat === 'pack' && i.packFor === o.packFor), 'فيه كيس معرّف للوزن ده'); it.packFor = o.packFor; }
    if (sub) it.sub = sub;
    if (fixedCost != null) it.fixedCost = fixedCost;
    S.items.push(it);
    audit('item_add', it.code, `إضافة صنف جديد: ${it.name}`);
    return it;
  });
}
// branches of one customer: [{ id, name, address, phone }]; ids are kept so old invoices still point at their branch
function cleanBranches(list, old) {
  need(list.length <= 200, 'الفروع كتير أوي');
  const out = [];
  for (const b of list) {
    const name = String((b && b.name) || '').trim().slice(0, 80); if (!name) continue;
    need(!out.some(x => x.name === name), `الفرع «${name}» متكرر`);
    const prev = (b.id && old.find(x => x.id === b.id)) || old.find(x => x.name === name);
    out.push({ id: prev ? prev.id : uid('BR'), name, address: String(b.address || '').trim().slice(0, 300), phone: String(b.phone || '').trim().slice(0, 40) });
  }
  return out;
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
      if (o.type === 'customer' && Array.isArray(o.branches)) { const b = cleanBranches(o.branches, p.branches || []); if (b.length) p.branches = b; else delete p.branches; }
      audit('partner_edit', p.name, `تعديل بيانات ${p.name}${added.length ? ' · أصناف جديدة: ' + added.map(i => item(i).name).join('، ') : ''}${removed.length ? ' · اتشال: ' + removed.map(i => item(i).name).join('، ') : ''}`);
      return p;
    }
    need(!S.partners.some(x => x.type === o.type && x.name === o.name.trim()), 'الاسم ده متسجل قبل كده');
    const branches = o.type === 'customer' && Array.isArray(o.branches) ? cleanBranches(o.branches, []) : null;
    const p = { id: uid(o.type === 'customer' ? 'CU' : 'SU'), type: o.type, name: o.name.trim(), phone: o.phone || '', kind: o.kind || null, terms: o.terms || 'credit', taxId: o.taxId || '', supplies: o.supplies || '', items, createdAt: today() };
    if (branches && branches.length) p.branches = branches;
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
    S.settings.issueLimitKg = o.issueLimitKg; S.settings.vatRate = 0; S.settings.telegram = !!o.telegram;
    S.settings.tgToken = (o.tgToken || '').trim(); S.settings.tgChat = (o.tgChat || '').trim();
    Object.assign(S.settings.company, o.company || {});
    audit('settings', 'الإعدادات', `تعديل الإعدادات: حد الصرف ${o.issueLimitKg} كجم`);
  });
}
function updateAccess(map) { // the owner decides which screens each role sees (the engine still guards every operation)
  return tx(() => {
    perm();
    need(map && typeof map === 'object' && !Array.isArray(map), 'بيانات الصلاحيات غير صحيحة');
    const out = {};
    for (const [page, roles] of Object.entries(map)) {
      need(/^[a-z]{2,20}$/.test(page) && Array.isArray(roles), 'بيانات الصلاحيات غير صحيحة');
      out[page] = [...new Set(roles.filter(r => ROLES[r] && r !== 'owner' && r !== 'pending'))];
    }
    S.settings.access = out;
    audit('access', 'الصلاحيات', `تعديل الشاشات المسموحة لكل دور (${Object.keys(out).length} شاشة)`);
    return out;
  });
}
function updateUserAccess({ userId, pages }) { // per person: null = follow the role; a list = exactly these screens
  return tx(() => {
    perm();
    const u = S.users.find(x => x.id === userId); need(u, 'المستخدم غير موجود'); need(u.role !== 'owner', 'المالك بيشوف كل حاجة');
    const ua = S.settings.userAccess || (S.settings.userAccess = {});
    if (pages == null) delete ua[userId];
    else { need(Array.isArray(pages) && pages.every(p => /^[a-z]{2,20}$/.test(p)), 'بيانات الصلاحيات غير صحيحة'); ua[userId] = [...new Set(pages)]; }
    audit('access', u.name, pages == null ? `${u.name} رجع يتبع صلاحيات دوره` : `تحديد شاشات ${u.name} (${pages.length} شاشة)`);
    return ua[userId] || null;
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
  r.other = leafUnder('4').filter(c => !['4101', '4102', '4103'].includes(c)).map(c => ({ code: c, amount: bal(m, c) }));
  r.otherT = r.other.reduce((x, y) => x + y.amount, 0);
  r.revenue = r.retail + r.wholesale + r.delivery + r.otherT;
  r.cogs = bal(m, '5101');
  r.gross = r.revenue - r.cogs;
  const grp = g => leafUnder(g).sort().map(c => ({ code: c, amount: bal(m, c) }));
  r.factory = grp('52'); r.selling = grp('53'); r.admin = grp('54'); r.finance = grp('56');
  const s = a => a.reduce((x, y) => x + y.amount, 0);
  r.factoryT = s(r.factory); r.sellingT = s(r.selling); r.adminT = s(r.admin); r.financeT = s(r.finance);
  r.opex = r.factoryT + r.sellingT + r.adminT + r.financeT;
  r.net = r.gross - r.opex;
  return r;
}
function balanceSheet({ asOf }) {
  const m = ledger({ to: asOf });
  const B = c => bal(m, c);
  const fixed = leafUnder('11').filter(c => c !== '1599').sort().map(c => ({ code: c, amount: B(c) }));
  const dep = B('1599'); // contra: debit nature => negative value
  const order = c => ACCOUNTS.findIndex(a => a.code === c);
  const current = leafUnder('12').sort((a, b) => order(a) - order(b)).map(c => ({ code: c, amount: B(c) })).filter(x => x.amount || !['1102', '1401'].includes(x.code));
  const liab = leafUnder('21').sort((a, b) => order(a) - order(b)).map(c => ({ code: c, amount: B(c) })).filter(x => x.amount || x.code !== '2102');
  const loans = leafUnder('22').sort((a, b) => order(a) - order(b)).map(c => ({ code: c, amount: B(c) }));
  const earnings = leafUnder('4').reduce((s, c) => s + B(c), 0) - leafUnder('5').reduce((s, c) => s + B(c), 0);
  const equity = leafUnder('3').sort((a, b) => order(a) - order(b)).map(c => ({ code: c, amount: B(c) }));
  const sum = a => a.reduce((s, x) => s + x.amount, 0);
  const fixedNet = sum(fixed) + dep;
  const assets = fixedNet + sum(current);
  const liabT = sum(liab) + sum(loans), equityT = sum(equity) + earnings;
  return { fixed, dep, fixedNet, current, currentT: sum(current), assets, liab, loans, loansT: sum(loans), liabT, equity, earnings, equityT, balanced: assets === liabT + equityT, diff: assets - liabT - equityT };
}
function manufacturingAccount({ from, to }) {
  const before = ledger({ to: addDays(from, -1) }), end = ledger({ to });
  const raw = ['1301', '1302'], pack = ['1303'];
  const sumB = (m, cs) => cs.reduce((s, c) => s + bal(m, c), 0);
  const purch = { raw: 0, pack: 0 }, used = { raw: 0, pack: 0 }, returned = { raw: 0, pack: 0 }, lost = { raw: 0, pack: 0, fg: 0 }, openIn = { raw: 0, pack: 0, fg: 0, wip: 0 };
  let produced = 0; const sold = { raw: 0, pack: 0 };
  for (const j of S.journal) {
    if (j.date < from || j.date > to) continue;
    for (const l of j.lines) {
      const k = raw.includes(l.acc) ? 'raw' : pack.includes(l.acc) ? 'pack' : null;
      if (k && j.type === 'purchase') purch[k] += l.dr;
      if (k && j.type === 'purchase_edit') purch[k] += l.dr - l.cr;
      if (k && j.type === 'sale') sold[k] += l.cr;
      if (k && j.type === 'return') sold[k] -= l.dr;
      if (k && j.type === 'issue') used[k] += l.cr;
      if (k && j.type === 'issue_reverse') returned[k] += l.dr;
      if (j.type === 'opening') { if (k) openIn[k] += l.dr - l.cr; if (l.acc === '1305') openIn.fg += l.dr - l.cr; if (l.acc === '1304') openIn.wip += l.dr - l.cr; }
      if (k && j.type === 'writeoff') lost[k] += l.cr;
      if (l.acc === '1305' && j.type === 'writeoff') lost.fg += l.cr;
      if (l.acc === '1305' && (j.type === 'batch_close' || j.type === 'butchery_close')) produced += l.dr;
      if (l.acc === '1305' && (j.type === 'butchery_cancel' || j.type === 'butchery_reopen' || j.type === 'batch_reopen')) produced -= l.cr;
    }
  }
  const r = {
    rawOpen: sumB(before, raw) + openIn.raw, rawPurch: purch.raw, rawClose: sumB(end, raw),
    packOpen: sumB(before, pack) + openIn.pack, packPurch: purch.pack, packClose: sumB(end, pack),
    wipOpen: bal(before, '1304') + openIn.wip, wipClose: bal(end, '1304'),
    fgOpen: bal(before, '1305') + openIn.fg, fgClose: bal(end, '1305'),
  };
  r.rawLost = lost.raw; r.packLost = lost.pack; r.fgLost = lost.fg;
  r.rawSold = sold.raw; r.packSold = sold.pack; // stock items sold as they are (no production step)
  r.rawUsed = r.rawOpen + r.rawPurch - r.rawLost - r.rawClose - sold.raw;
  r.packUsed = r.packOpen + r.packPurch - r.packLost - r.packClose - sold.pack;
  r.production = r.rawUsed + r.packUsed + r.wipOpen - r.wipClose;
  r.producedPosted = produced;
  r.cogs = r.fgOpen + r.production - r.fgLost - r.fgClose + sold.raw + sold.pack;
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
function partnerTotals(id) { // customer: billed / collected / still owes · supplier: billed / paid / still owed
  const p = partner(id); const acc = p.type === 'customer' ? '1201' : '2101';
  let up = 0, down = 0; for (const j of S.journal) for (const l of j.lines) if (l.acc === acc && l.partner === id) { if (p.type === 'customer') { up += l.dr; down += l.cr; } else { up += l.cr; down += l.dr; } }
  return { billed: up, settled: down, balance: up - down };
}
function partnerStatement(id) {
  const p = partner(id); const acc = p.type === 'customer' ? '1201' : '2101';
  let run = 0; const rows = [];
  for (const j of S.journal) for (const l of j.lines) if (l.acc === acc && l.partner === id) {
    const dr = l.dr, cr = l.cr; run += p.type === 'customer' ? dr - cr : cr - dr;
    const v = j.ref && j.ref.type === 'invoice' ? S.docs.invoices.find(x => x.id === j.ref.id) : null;
    rows.push({ date: j.date, no: j.no, memo: j.memo, ref: j.ref, dr, cr, run, branch: v && v.branchName ? v.branchName : '' });
  }
  return rows;
}
// one bill for a customer with branches: every branch's deliveries in the period, a subtotal per branch, and the grand total
function branchBill({ customerId, from, to }) {
  const c = partner(customerId); need(c.type === 'customer', 'اختار عميل'); need(isDay(from) && isDay(to) && from <= to, 'الفترة غير صحيحة');
  const invs = S.docs.invoices.filter(v => v.customerId === customerId && v.date >= from && v.date <= to).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.no < b.no ? -1 : 1);
  const names = [...(c.branches || []).map(b => b.name)]; for (const v of invs) if (!names.includes(v.branchName || '')) names.push(v.branchName || '');
  const branches = names.map(name => { const list = invs.filter(v => (v.branchName || '') === name); return { name: name || 'من غير فرع', invoices: list.map(v => ({ no: v.no, date: v.date, total: v.total, paid: invoicePaid(v), kg: v.lines.reduce((s, l) => s + l.qty, 0) })), total: list.reduce((s, v) => s + v.total, 0), kg: list.reduce((s, v) => s + v.lines.reduce((a, l) => a + l.qty, 0), 0) }; }).filter(b => b.invoices.length);
  const total = invs.reduce((s, v) => s + v.total, 0), paid = invs.reduce((s, v) => s + invoicePaid(v), 0);
  return { customer: { id: c.id, name: c.name, phone: c.phone, taxId: c.taxId }, from, to, branches, total, paid, due: total - paid, balance: partnerBalance(c.id), count: invs.length };
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
  const wip = S.docs.batches.filter(running).reduce((s, b) => s + batchCostNow(b), 0) + butcheries().filter(r => r.status === 'open').reduce((s, r) => s + butCost(r), 0);
  checks.push({ name: 'إنتاج تحت التشغيل = تكلفة التشغيلات المفتوحة', ok: wip === bal(m, '1304'), detail: money(bal(m, '1304')) });
  const cust = S.partners.filter(p => p.type === 'customer').reduce((s, p) => s + partnerBalance(p.id), 0);
  checks.push({ name: 'رصيد العملاء = مجموع كشوف الحساب', ok: cust === bal(m, '1201'), detail: money(bal(m, '1201')) });
  const sup = S.partners.filter(p => p.type === 'supplier').reduce((s, p) => s + partnerBalance(p.id), 0);
  checks.push({ name: 'رصيد الموردين = مجموع كشوف الحساب', ok: sup === bal(m, '2101'), detail: money(bal(m, '2101')) });
  const bs = balanceSheet({ asOf: today() });
  checks.push({ name: 'الميزانية: الأصول = الخصوم + حقوق الملكية', ok: bs.balanced, detail: money(bs.assets) });
  checks.push({ name: 'مفيش رصيد سالب في المخازن أو الخزنة', ok: S.lots.every(l => l.qty >= 0 && l.value >= 0) && [...LEAF].filter(isOut).every(c => bal(m, c) >= 0), detail: '' });
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
  I('RM-106', 'دهن بقري (خام)', 'meat', 'kg', 140, { minQty: kg(60), sub: 'دهون' });
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
      rawId = I(rc, name + ' (خام)', 'meat', 'kg', price, { minQty: kg(MIN[rc] || 0), sub: 'بلدي فريش' }).id;
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
  I('PK-315', 'كيس فاكيوم ٢٠٠ جرام', 'pack', 'pc', 0, { minQty: 300, packFor: 200 });
  I('PK-320', 'كيس فاكيوم ٢٥٠ جرام', 'pack', 'pc', 0, { minQty: 300, packFor: 250 });
  I('PK-330', 'طبق فوم (وزن مفتوح)', 'pack', 'pc', 0, { minQty: 200 });
  I('RM-199', 'إعادة تصنيع (عجينة برجر)', 'meat', 'kg', 0, { rework: true, sub: 'إعادة تصنيع' });
  I('RM-198', 'إعدام', 'byproduct', 'kg', 0, { waste: true, fixedCost: 0 });
  S.migr = { packs2026: true };
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
  P('s4', 'supplier', 'العبوات الحديثة', { phone: '01534567890', supplies: 'أكياس فاكيوم', items: ['it_PK-305', 'it_PK-310', 'it_PK-315', 'it_PK-320', 'it_PK-330'] });
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
  as('u1', () => openingBalances({ date: start, stock: S.items.filter(i => !['byproduct', 'carcass'].includes(i.cat) && !i.rework).map(it => {
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
      { itemId: 'it_PK-315', qty: 1200, unitCost: egp(1.2), expDate: addDays(date, 720) }, { itemId: 'it_PK-320', qty: 1200, unitCost: egp(1.4), expDate: addDays(date, 720) }, { itemId: 'it_PK-330', qty: 600, unitCost: egp(2.5), expDate: addDays(date, 720) }] }));
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
    const cutQty = addDays(date, 10) > end ? lot.qty - kg(100) : lot.qty; // the last deliveries of the sample month keep 100 kg on the hook (never depends on today's date)
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
  ACCOUNTS, LEAF, MEAT_SECTIONS, itemCost, reopenBatch, cancelBatch, setCustomerPrices, rawSellable, avgCostPerUnit, sellStores, reopenButchery, lotUsage, butcheryEditInput, cancelButchery, updateUserAccess, butcheryEditOutput, butcheryDropInput, butcheryDropPack, CHANGE_OPS, decideChange, editPurchaseLine, invoiceReturn, invoicePrice, invoiceReturned, payLabel, updateAccess, finishMeat, returnRework, batchKg, batchCostNow, running, isOpenWeight, openButchery, butcheryInput, butcheryPack, butcheryOutput, butcheryDropOutput, newCutItem, closeButchery, butIn, butOut, butCost, BASE_ACCOUNTS, DEPOSIT_KINDS, depositSources, moneyKind, methodAcc, methodName, accLabel, staffName, personBalance, deposit, payLiability, advance, advanceBack, custody, settleCustody, saveAccount, deleteAccount, CAT_NAME, CAT_ACC, METHOD_NAME, WAREHOUSES, WH_USE, warehouses, whs, whUse, PACK_SIZES, ROLES, EXPENSE_ACCS,
  today, addDays, daysBetween, monthStart, monthEnd, mulDiv,
  item, partner, userName, whName, me, available, cashBalance, invoicePaid, partnerBalance, partnerTotals, partnerStatement, branchBill, batchById, issuedOf, priceFor, monthlyDepreciation,
  opening, purchase, transfer, cutting, createBatch, issue, requestCorrection, decideCorrection, closeBatch, invoice, receipt, catalog, orderStatus, placeOrder, decideOrder, orderProof, orderNotified, orderPayLink, orderCardPaid, orderView, proofTarget, normPhone, ORDER_METHODS, supplierPayment, expense, cashTransfer, depreciate, writeOff, watch,
  saveItem, savePartner, resetBooks, updateSelf, saveWarehouse, setUser, updateSettings, markAlertsRead, upsertUser, openingBalances, setRecipe, liveState, setState, packsOf, WEBSITE, cairoNow,
  ledger, bal, trialBalance, incomeStatement, balanceSheet, manufacturingAccount, integrity, stockAlerts, fmtQty, money, accType, debitNature, leafUnder,
};
})(typeof window !== 'undefined' ? window : globalThis);
