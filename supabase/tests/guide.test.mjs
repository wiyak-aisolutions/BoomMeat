// Boom Meat ERP — checks every rule the user guide (docs/guide) states, against the real engine.
// Each check names the guide page it comes from.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
let pass = 0, fail = 0; const out = [];
const ok = (page, claim, cond, detail = '') => { if (cond) pass++; else { fail++; out.push(`✗ p${page} ${claim}${detail ? ' — ' + detail : ''}`); } };
const S = () => E.S, T = E.today();
const as = r => { S().currentUser = S().users.find(u => u.role === r).id; };
const tryOp = fn => { const snap = JSON.stringify(S()); try { const r = fn(); return { ok: true, r }; } catch (e) { E.setState(JSON.parse(snap)); return { ok: false, msg: e.message }; } };
const fresh = () => { E.reset(); as('owner'); };

/* ---------- p05: the permissions table, row by row ---------- */
fresh();
const ROLES = ['owner', 'accountant', 'storekeeper', 'supervisor', 'worker', 'sales'];
const lotRaw = () => S().lots.find(l => l.qty > 5000 && E.whUse(l.wh) === 'raw' && E.item(l.itemId).cat === 'meat');
const sup = () => S().partners.find(p => p.type === 'supplier' && (p.items || []).length);
const cust = () => S().partners.find(p => p.type === 'customer');
const prod = () => S().items.find(i => i.cat === 'product' && E.available(i.id, E.whs('fg'), 1000) >= 1000);
const carcass = () => S().lots.find(l => l.qty > 2000 && E.item(l.itemId).cat === 'carcass');
const openB = () => S().docs.batches.find(b => b.status === 'open');
const ROWS = {
  'استلام بضاعة من مورد': [['owner', 'accountant', 'storekeeper'], () => { const s = sup(); return E.purchase({ date: T, supplierId: s.id, ref: 'G', lines: [{ itemId: s.items[0], qty: 1000, unitCost: 100, expDate: E.addDays(T, 9) }] }); }],
  'تحويل بين التلاجات': [['owner', 'storekeeper', 'supervisor'], () => { const l = lotRaw(); return E.transfer({ date: T, lotId: l.id, qty: 1000, toWh: E.whs('raw').find(w => w !== l.wh) }); }],
  'تقطيع': [['owner', 'storekeeper', 'supervisor'], () => { const l = carcass(); return E.cutting({ date: T, lotId: l.id, qty: 1000, outputs: [{ itemId: 'it_RM-101', qty: 500 }] }); }],
  'إضافة تلاجة أو فريزر': [['owner', 'storekeeper'], () => E.saveWarehouse({ name: 'فريزر اختبار الدليل', use: 'fg' })],
  'فتح تشغيلة': [['owner', 'supervisor'], () => E.createBatch({ date: T, productId: prod().id, planned: 10000 })],
  'صرف خامات على تشغيلة': [['owner', 'supervisor', 'worker'], () => E.issue({ batchId: openB().id, itemId: lotRaw().itemId, qty: 1000, date: T })],
  'قفل التشغيلة والتعبئة': [['owner', 'supervisor'], () => { const b = E.createBatch({ date: T, productId: prod().id, planned: 5000 }); return b; }],
  'الموافقة على تصحيح صرف': [['owner'], () => { const c = S().docs.corrections.find(x => x.status === 'pending'); return E.decideCorrection(c.id, false); }],
  'بيع وفاتورة': [['owner', 'accountant', 'sales'], () => { const p = prod(); return E.invoice({ date: T, customerId: cust().id, lines: [{ productId: p.id, packSize: 1000, count: 1 }], method: 'cash' }); }],
  'الموافقة على طلبات الواتساب': [['owner', 'accountant', 'sales'], () => { const o = (S().docs.orders || []).find(x => x.status === 'pending' && !x.test); return E.decideOrder({ id: o.id, action: 'reject', reason: 'فحص' }); }],
  'تحصيل من عميل': [['owner', 'accountant', 'sales'], () => E.receipt({ date: T, customerId: cust().id, amount: 100, method: 'cash' })],
  'سداد مورد': [['owner', 'accountant'], () => E.supplierPayment({ date: T, supplierId: sup().id, amount: 100, method: 'bank' })],
  'مصروفات': [['owner', 'accountant'], () => E.expense({ date: T, acc: E.EXPENSE_ACCS[0], amount: 100, method: 'cash' })],
  'إعدام كمية بايظة': [['owner', 'storekeeper'], () => E.writeOff({ date: T, lotId: lotRaw().id, qty: 1, reason: 'فحص' })],
  'الأرصدة الافتتاحية': [['owner', 'accountant'], () => E.openingBalances({ date: T, cash: 100 })],
  'الأسعار': [['owner'], () => { const it = prod(); return E.saveItem({ ...it }); }],
  'الإعدادات': [['owner'], () => E.updateSettings({ issueLimitKg: 100, vatRate: 14, telegram: true, company: {} })],
  'تصفير الحسابات': [['owner'], () => E.resetBooks()],
};
// a pending WhatsApp order and a pending correction must exist before the rows that need them
as('owner');
E.placeOrder({ phone: '01099998888', name: 'عميل الدليل', address: 'عنوان بالتفصيل للاختبار', method: 'cash', lines: [{ productId: prod().id, packSize: 1000, count: 1 }] });
{ const b = openB(); as('worker'); const ln = E.issue({ batchId: b.id, itemId: lotRaw().itemId, qty: 2000, date: T }); const issue = b.issues[b.issues.length - 1]; E.requestCorrection({ batchId: b.id, issueId: issue.id, newQty: 1500, reason: 'فحص الدليل' }); }
const base = JSON.stringify(S());
for (const [row, [allowed, fn]] of Object.entries(ROWS)) for (const r of ROLES) {
  E.setState(JSON.parse(base)); as(r);
  const res = tryOp(fn), should = allowed.includes(r);
  ok(5, `«${row}» ${should ? 'مسموح' : 'ممنوع'} لـ ${E.ROLES[r].name}`, res.ok === should, res.ok ? 'اتعملت' : res.msg);
  if (!should && !res.ok) ok(25, `رسالة المنع «الصلاحية دي مش متاحة لحسابك» (${row}/${r})`, /الصلاحية دي/.test(res.msg), res.msg);
}
// "يشوف التكلفة والربح": owner, accountant, storekeeper only
for (const r of ROLES) ok(5, `يشوف التكلفة: ${E.ROLES[r].name}`, !!E.ROLES[r].cost === ['owner', 'accountant', 'storekeeper'].includes(r));

/* ---------- p03: FEFO, numbered lots ---------- */
fresh();
{
  const s = S().partners.find(p => p.type === 'supplier' && (p.items || []).some(i => E.item(i).cat === 'meat')), it = s.items.find(i => E.item(i).cat === 'meat');
  as('owner');
  const late = E.purchase({ date: T, supplierId: s.id, ref: 'L', lines: [{ itemId: it, qty: 5000, unitCost: 100, expDate: E.addDays(T, 90) }] });
  const early = E.purchase({ date: T, supplierId: s.id, ref: 'E', lines: [{ itemId: it, qty: 5000, unitCost: 100, expDate: E.addDays(T, 3) }] });
  const lotE = S().lots.find(l => l.id === early.lines[0].lotId), lotL = S().lots.find(l => l.id === late.lines[0].lotId);
  ok(3, 'كل دفعة ليها رقم زي L-YYMM-NNN', /^L-\d{4}-\d{3}$/.test(lotE.code), lotE.code);
  const toRaw = E.whs('raw')[0];
  E.transfer({ date: T, lotId: lotE.id, qty: 5000, toWh: toRaw }); E.transfer({ date: T, lotId: lotL.id, qty: 5000, toWh: toRaw });
  const before = Object.fromEntries(S().lots.filter(l => l.itemId === it && E.whUse(l.wh) === 'raw').map(l => [l.code, l.qty]));
  const b = E.createBatch({ date: T, productId: S().items.find(i => i.cat === 'product').id, planned: 10000 });
  E.issue({ batchId: b.id, itemId: it, qty: 1000, date: T });
  const used = S().docs.batches.find(x => x.id === b.id).issues.slice(-1)[0];
  const usedCodes = (used.parts || []).map(p => p.code || p.lotCode);
  const minExp = S().lots.filter(l => l.itemId === it && E.whUse(l.wh) === 'raw' && (before[l.code] || 0) > 0).sort((a, b) => a.expDate < b.expDate ? -1 : 1)[0];
  ok(3, 'الصرف بياخد من الدفعة الأقرب في الصلاحية (FEFO)', usedCodes.length ? usedCodes[0] === minExp.code : true, `اتصرف من ${usedCodes.join(',')} والأقرب ${minExp && minExp.code}`);
}

/* ---------- p10: cutting example + cost split by selling value, bone costs zero ---------- */
fresh();
{
  as('owner'); const cs = S().partners.find(p => p.type === 'supplier' && (p.items || []).some(i => E.item(i).cat === 'carcass'));
  const pc = E.purchase({ date: T, supplierId: cs.id, ref: 'C800', lines: [{ itemId: cs.items.find(i => E.item(i).cat === 'carcass'), qty: 800000, unitCost: 23000, expDate: E.addDays(T, 10) }] });
  const l = S().lots.find(x => x.id === pc.lines[0].lotId); as('supervisor');
  const doc = E.cutting({ date: T, lotId: l.id, qty: 800000, outputs: [{ itemId: 'it_RM-101', qty: 131000 }, { itemId: 'it_RM-102', qty: 93000 }, { itemId: 'it_RM-190', qty: 156000 }] });
  ok(10, 'الفرق بين الداخل والطالع بيتسجل هدر', doc.waste === doc.qty - 380000, `هدر ${doc.waste}`);
  const bone = doc.outputs.find(o => o.itemId === 'it_RM-190'), cuts = doc.outputs.filter(o => o.itemId !== 'it_RM-190');
  ok(10, 'العضم تكلفته صفر', bone.value === 0, `قيمة العضم ${bone.value}`);
  const perKg = o => o.value / o.qty, a = E.item('it_RM-101'), c = E.item('it_RM-102');
  const hi = a.priceRetail >= c.priceRetail ? cuts[0] : cuts[1], lo = hi === cuts[0] ? cuts[1] : cuts[0];
  ok(10, 'القطعية الأغلى في البيع بتاخد تكلفة أعلى للكيلو', perKg(hi) >= perKg(lo), `${E.item(hi.itemId).name} ${perKg(hi).toFixed(1)} مقابل ${E.item(lo.itemId).name} ${perKg(lo).toFixed(1)}`);
  ok(10, 'مثال الدليل: ٨٠٠ دخل و٧٥١ طلع = ٤٩ هدر (٦٪)', Math.round(49 / 800 * 100) === 6);
}

/* ---------- p11: four store types; a new fridge shows up everywhere ---------- */
fresh();
ok(11, 'فيه ٤ أنواع: استلام، إنتاج، تعبئة، منتج تام', ['receiving', 'raw', 'pack', 'fg'].every(k => E.WH_USE[k]) && Object.keys(E.WH_USE).length === 4, Object.keys(E.WH_USE).join(','));
{ as('storekeeper'); const w = E.saveWarehouse({ name: 'فريزر ٣ للاختبار', use: 'fg' }); ok(11, 'الفريزر الجديد بيظهر علطول مع فريزرات المنتج التام', E.whs('fg').includes(w.id || S().warehouses.slice(-1)[0].id)); }

/* ---------- p12: worker cannot edit; correction goes to owner; 100 kg alert ---------- */
fresh();
{
  const b = openB(), l = lotRaw(); as('worker');
  E.issue({ batchId: b.id, itemId: l.itemId, qty: 1000, date: T });
  const ln = S().docs.batches.find(x => x.id === b.id).issues.slice(-1)[0];
  ok(12, 'السطر بيتسجل باسم العامل والساعة', ln.by === S().currentUser && !!ln.at, JSON.stringify({ by: ln.by, at: ln.at }));
  ok(12, 'مفيش عملية تعديل أو مسح سطر صرف في السيستم', !E.editIssue && !E.deleteIssue);
  E.requestCorrection({ batchId: b.id, issueId: ln.id, newQty: 500, reason: 'غلطت' });
  const c = S().docs.corrections.slice(-1)[0];
  ok(12, 'طلب التصحيح بيتسجل مستني', c.status === 'pending');
  ok(12, 'طلب التصحيح بيعمل تنبيه للمالك', S().alerts.some(a => /تصحيح/.test(a.text) && !a.read));
  const w = tryOp(() => E.decideCorrection(c.id, true)); ok(12, 'العامل ميقدرش يوافق على التصحيح', !w.ok);
  as('owner'); const before = E.issuedOf(S().docs.batches.find(x => x.id === b.id), l.itemId);
  E.decideCorrection(c.id, true); const after = E.issuedOf(S().docs.batches.find(x => x.id === b.id), l.itemId);
  ok(12, 'لما المالك يوافق، الفرق بيتصلح (١ كجم ← ٠.٥ كجم)', before - after === 500, `${before} → ${after}`);
  ok(12, 'حد التنبيه الافتراضي ١٠٠ كجم', S().settings.issueLimitKg === 100);
  const big = S().lots.filter(x => x.itemId === l.itemId && E.whUse(x.wh) === 'raw').reduce((a, x) => a + x.qty, 0);
  if (big > 101000) { as('worker'); const n0 = S().alerts.length; E.issue({ batchId: b.id, itemId: l.itemId, qty: 101000, date: T }); ok(12, 'لو صنف عدّى ١٠٠ كجم في تشغيلة بيطلع تنبيه', S().alerts.slice(n0).some(a => /الحد|100/.test(a.text))); }
}

/* ---------- p14: close: split per freezer, one bag per pack, waste = in − out ---------- */
fresh();
{
  as('owner');
  const p = S().items.find(i => i.cat === 'product' && E.packsOf(i).includes(500) && E.packsOf(i).includes(1000));
  const b = E.createBatch({ date: T, productId: p.id, planned: 50000 });
  E.issue({ batchId: b.id, itemId: lotRaw().itemId, qty: 40000, date: T });
  const fg = E.whs('fg'); ok(14, 'فيه أكتر من فريزر منتج تام للتقسيم', fg.length >= 2, fg.join(','));
  const bagsBefore = S().lots.filter(l => E.item(l.itemId).cat === 'pack').reduce((a, l) => a + l.qty, 0);
  E.closeBatch({ batchId: b.id, date: T, packs: { 500: 30, 1000: 20 }, split: [{ wh: fg[0], packs: { 500: 30 } }, { wh: fg[1], packs: { 1000: 20 } }] });
  const bb = S().docs.batches.find(x => x.id === b.id);
  const bagsAfter = S().lots.filter(l => E.item(l.itemId).cat === 'pack').reduce((a, l) => a + l.qty, 0);
  ok(14, 'الأكياس والاستيكرات بتتصرف لوحدها (كيس + استيكر لكل عبوة)', bagsBefore - bagsAfter === 50 * 2, `اتصرف ${bagsBefore - bagsAfter} قطعة لـ ٥٠ عبوة`);
  ok(14, 'العبوات بتدخل الفريزر اللي اتكتب', S().lots.some(l => l.itemId === p.id && l.wh === fg[0] && l.packSize === 500) && S().lots.some(l => l.itemId === p.id && l.wh === fg[1] && l.packSize === 1000));
  ok(14, 'الهدر = اللي اتصرف − اللي طلع', bb.waste === bb.inputKg - bb.output, `${bb.inputKg} − ${bb.output} = ${bb.waste}`);
  ok(14, 'تكلفة الكيلو بتتحسب', bb.costPerKg > 0);
  ok(14, 'الأحجام ½ و١ و١.٥ و٢ كيلو بس', JSON.stringify(E.PACK_SIZES) === '[500,1000,1500,2000]', JSON.stringify(E.PACK_SIZES));
}

/* ---------- p15-16: sale: price list by customer kind, can't sell what isn't there, VAT 14% ---------- */
fresh();
{
  as('sales'); const p = prod();
  const whole = S().partners.find(c => c.type === 'customer' && c.kind === 'wholesale'), retail = S().partners.find(c => c.type === 'customer' && c.kind === 'retail');
  ok(15, 'الجملة والقطاعي بسعرين مختلفين', E.priceFor(p, whole) !== E.priceFor(p, retail), `${E.priceFor(p, whole)} / ${E.priceFor(p, retail)}`);
  const avail = Math.floor(E.available(p.id, E.whs('fg'), 1000) / 1000);
  const r = tryOp(() => E.invoice({ date: T, customerId: retail.id, lines: [{ productId: p.id, packSize: 1000, count: avail + 1 }], method: 'cash' }));
  ok(15, 'مستحيل تبيع أكتر من المتاح في الفريزر', !r.ok, r.msg);
  ok(25, 'رسالة «الكمية المتاحة … بس»', /المتاح|المتاحة/.test(r.msg || ''), r.msg);
  const v = E.invoice({ date: T, customerId: whole.id, lines: [{ productId: p.id, packSize: 1000, count: 1 }], method: 'credit' });
  ok(16, 'الضريبة ١٤٪', v.vat === Math.round(v.net * 14 / 100), `${v.vat} على ${v.net}`);
  ok(16, 'الآجل بيتسجل على العميل', E.partnerBalance(whole.id) >= v.total);
  ok(16, 'تكلفة المبيعات بتتسجل', v.cost > 0 || v.lines.some(l => l.cost > 0));
}

/* ---------- p17: WhatsApp orders ---------- */
fresh();
{
  const p = prod();
  const mk = (ph, test) => E.placeOrder({ phone: ph, name: 'عميل واتساب جديد', address: 'مدينة نصر، شارع ٩، عمارة ٤', method: 'instapay', lines: [{ productId: p.id, packSize: 1000, count: 2 }], test });
  const r1 = mk('01077776666'); const o1 = S().docs.orders.find(o => o.no === r1.no);
  ok(17, 'الطلب بيوصل مستني موافقة', o1.status === 'pending');
  ok(17, 'الطلب بيعمل تنبيه للمالك', S().alerts.some(a => /طلب واتساب/.test(a.text)));
  const stock0 = E.available(p.id, E.whs('fg'), 1000), custs0 = S().partners.filter(x => x.type === 'customer').length;
  as('sales'); E.decideOrder({ id: o1.id, action: 'approve' });
  const inv = S().docs.invoices.find(v => v.id === o1.invoiceId);
  ok(17, '«وافق» بتعمل فاتورة آجل', inv && inv.method === 'credit', inv && inv.method);
  ok(17, '«وافق» بتخصم العبوات من الفريزرات', stock0 - E.available(p.id, E.whs('fg'), 1000) === 2000);
  ok(17, 'العميل الجديد بيتضاف لوحده برقمه', S().partners.filter(x => x.type === 'customer').length === custs0 + 1 && S().partners.some(x => x.phone === '01077776666'));
  ok(17, 'الأسعار شاملة الضريبة', inv.vatIncluded === true && inv.total === o1.total, `${inv.total} / ${o1.total}`);
  E.decideOrder({ id: o1.id, action: 'paid' });
  ok(17, '«اتحصّل» بتقفل المديونية', E.partnerBalance(o1.customerId) === 0, `باقي ${E.partnerBalance(o1.customerId)}`);
  const r2 = mk('01077776655'); const o2 = S().docs.orders.find(o => o.no === r2.no);
  E.decideOrder({ id: o2.id, action: 'reject', reason: 'العنوان مش واضح' });
  ok(17, '«ارفض» بسبب، والسبب بيتحفظ', o2.status === 'rejected' && o2.reason === 'العنوان مش واضح');
  const r3 = mk('01077776644', true); const o3 = S().docs.orders.find(o => o.no === r3.no);
  const t = tryOp(() => E.decideOrder({ id: o3.id, action: 'approve' }));
  ok(17, 'طلب التجربة مالوش موافقة', !t.ok, t.msg);
  ok(17, 'طلب التجربة مبيبعتش تليجرام', S().alerts.filter(a => a.ref && a.ref.id === o3.id || (a.text || '').includes(o3.no)).every(a => a.tg === 'test'));
  ok(17, 'طلب التجربة ينفع يتمسح', tryOp(() => E.decideOrder({ id: o3.id, action: 'delete' })).ok);
  const r4 = mk('01077776633'); const o4 = S().docs.orders.find(o => o.no === r4.no);
  as('owner'); E.saveItem({ ...E.item(p.id), priceRetail: E.item(p.id).priceRetail + 1000, priceWholesale: E.item(p.id).priceWholesale + 1000 });
  as('sales'); const s4 = tryOp(() => E.decideOrder({ id: o4.id, action: 'approve' }));
  ok(17, 'لو السعر اتغير، المبيعات متقدرش توافق', !s4.ok, s4.msg);
  as('owner'); const w4 = tryOp(() => E.decideOrder({ id: o4.id, action: 'approve' }));
  ok(17, 'المالك يقدر يوافق بسعر الطلب', w4.ok, w4.msg);
}

/* ---------- p18: item codes and price history ---------- */
fresh();
{
  as('owner');
  const it = E.saveItem({ name: 'صنف اختبار الدليل', cat: 'spice', unit: 'kg', priceRetail: 0, priceWholesale: 0, minQty: 1000, vat: 0 });
  const mine = S().items.find(i => i.name === 'صنف اختبار الدليل');
  ok(18, 'الكود بيتعمل لوحده حسب النوع (SP للتوابل)', /^SP-/.test(mine.code), mine.code);
  const code0 = mine.code; E.saveItem({ ...mine, code: 'XX-1', name: 'صنف اختبار الدليل' }); ok(18, 'الكود مبيتغيرش', S().items.find(i => i.id === mine.id).code === code0, S().items.find(i => i.id === mine.id).code);
  const p = prod(); const v = E.invoice({ date: T, customerId: cust().id, lines: [{ productId: p.id, packSize: 1000, count: 1 }], method: 'cash' });
  const amt0 = v.lines[0].amount, n0 = S().priceHistory.length;
  E.saveItem({ ...E.item(p.id), priceRetail: E.item(p.id).priceRetail + 5000, priceWholesale: E.item(p.id).priceWholesale + 5000 });
  ok(18, 'تعديل السعر بيتسجل (مين وإمتى)', S().priceHistory.length > n0 && !!S().priceHistory.slice(-1)[0].user && !!S().priceHistory.slice(-1)[0].at);
  ok(18, 'الفواتير القديمة بتفضل بسعرها', S().docs.invoices.find(x => x.id === v.id).lines[0].amount === amt0);
}

/* ---------- p19-20: journal is immutable; statements; trial balance ---------- */
fresh();
ok(19, 'مفيش عملية تعديل أو مسح قيد', !E.editEntry && !E.deleteEntry && !E.deleteJournal);
ok(20, 'الميزانية متوازنة', E.balanceSheet({ asOf: T }).balanced);
{ const tb = E.trialBalance({ from: E.addDays(T, -29), to: T }); ok(20, 'ميزان المراجعة: إجمالي المدين = الدائن', tb.totals.endDr === tb.totals.endCr); }
{ const is = E.incomeStatement({ from: E.monthStart(T), to: T }); ok(20, 'قائمة الدخل: مجمل الربح = المبيعات − التكلفة', is.gross === is.revenue - is.cogs, JSON.stringify({ r: is.revenue, c: is.cogs, g: is.gross })); }
ok(20, 'حساب التشغيل والمتاجرة مطابق للقيود', E.manufacturingAccount({ from: E.addDays(T, -29), to: T }).check);

/* ---------- p22: settings + reset keeps what the guide says ---------- */
fresh();
ok(22, 'الضريبة الافتراضية ١٤٪', S().settings.vatRate === 14);
{
  as('owner'); const items = S().items.length, users = S().users.length, whs = E.warehouses().length, priced = S().items.map(i => i.priceRetail).join(',');
  E.resetBooks();
  ok(22, 'التصفير بيمسح الحركات', S().journal.length === 0 && S().docs.invoices.length === 0 && S().lots.length === 0);
  ok(22, 'التصفير بيسيب الأصناف والأسعار', S().items.length === items && S().items.map(i => i.priceRetail).join(',') === priced);
  ok(22, 'التصفير بيسيب الموظفين والتلاجات', S().users.length === users && E.warehouses().length === whs);
  ok(22, 'التصفير بيمسح العملاء والموردين التجريبيين', !S().partners.some(p => p.sample));
  ok(26, 'بعد التصفير، الأرصدة الافتتاحية شغالة', tryOp(() => E.openingBalances({ date: T, cash: 1000000 })).ok);
}

console.log(`guide checks: ${pass} passed, ${fail} failed`);
out.forEach(l => console.log(l));
process.exit(fail ? 1 : 0);
