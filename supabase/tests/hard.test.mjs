// Boom Meat ERP — HARD audit.
//  1. Many seeds of random operations, including freezer splits, new fridges, WhatsApp orders, profile edits.
//     After EVERY operation: every integrity check holds; a rejected operation leaves the books byte-identical.
//  2. Malformed input battery: every write operation is called with garbage; each call must throw cleanly and change nothing.
//  3. Accounting identities on the final books of every seed.
// Run: node supabase/tests/hard.test.mjs [seeds] [opsPerSeed]
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
const SEEDS = +process.argv[2] || 6, OPS = +process.argv[3] || 900;
let fails = 0; const bad = m => { fails++; if (fails <= 40) console.log('✗', m); };
const S = () => E.S, T = E.today();

function identities(tag) {
  const from = E.addDays(T, -40);
  const tb = E.trialBalance({ from, to: T }); if (tb.totals.endDr !== tb.totals.endCr) bad(`${tag}: trial balance not balanced`);
  if (!E.balanceSheet({ asOf: T }).balanced) bad(`${tag}: balance sheet not balanced`);
  if (!E.manufacturingAccount({ from, to: T }).check) bad(`${tag}: manufacturing account mismatch`);
  for (const j of S().journal) { const dr = j.lines.reduce((a, l) => a + (l.dr || 0), 0), cr = j.lines.reduce((a, l) => a + (l.cr || 0), 0); if (dr !== cr) { bad(`${tag}: entry ${j.no} unbalanced`); break; } if (j.lines.some(l => !Number.isInteger(l.dr || 0) || !Number.isInteger(l.cr || 0) || (l.dr || 0) < 0 || (l.cr || 0) < 0)) { bad(`${tag}: entry ${j.no} has a non-integer or negative amount`); break; } }
  for (const l of S().lots) if (!Number.isInteger(l.qty) || !Number.isInteger(l.value) || l.qty < 0 || l.value < 0 || (l.qty === 0 && l.value !== 0)) { bad(`${tag}: lot ${l.code} qty ${l.qty} value ${l.value}`); break; }
  for (const v of S().docs.invoices) { if (v.total !== v.net + v.vat) { bad(`${tag}: invoice ${v.no} total != net + vat`); break; } if (!v.vatIncluded && v.lines.reduce((a, l) => a + l.amount, 0) - (v.discount || 0) !== v.net) { bad(`${tag}: invoice ${v.no} lines - discount != net`); break; } }
  for (const b of S().docs.batches.filter(x => x.status === 'closed')) { if (b.output > b.inputKg) { bad(`${tag}: batch ${b.no} output > input`); break; } if (b.split && b.split.reduce((a, s) => a + Object.entries(s.packs).reduce((x, [z, n]) => x + z * n, 0), 0) !== b.output) { bad(`${tag}: batch ${b.no} freezer split != output`); break; } }
  for (const a of ['1101', '1102', '1103']) if (E.cashBalance(a) < 0) bad(`${tag}: negative cash ${a}`);
  const again = JSON.parse(JSON.stringify(S())); E.setState(again); if (!E.integrity().every(c => c.ok)) bad(`${tag}: integrity lost after save/reload`);
}

/* ---------- 1. multi-seed fuzz ---------- */
let accepted = 0, rejected = 0;
for (let sd = 1; sd <= SEEDS; sd++) {
  E.reset();
  let seed = sd * 7919; const R = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = a => { if (!a.length) throw new Error('لا يوجد'); return a[Math.floor(R() * a.length)]; }, ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const owner = S().users.find(u => u.role === 'owner').id; S().currentUser = owner;
  const prods = () => S().items.filter(i => i.cat === 'product');
  const ops = {
    purchase: () => { const sup = pick(S().partners.filter(p => p.type === 'supplier' && (p.items || []).length)); const it = pick(sup.items); return E.purchase({ date: T, supplierId: sup.id, ref: 'HZ', lines: [{ itemId: it, qty: ri(1, 300) * (E.item(it).unit === 'kg' ? 1000 : 1), unitCost: ri(100, 40000), expDate: E.addDays(T, ri(2, 200)) }] }); },
    transfer: () => { const l = pick(S().lots.filter(x => x.qty > 0)); return E.transfer({ date: T, lotId: l.id, qty: R() < 0.1 ? l.qty + 1 : ri(1, l.qty), toWh: pick(E.warehouses()).id }); },
    createBatch: () => E.createBatch({ date: T, productId: pick(prods()).id, planned: ri(1, 200) * 1000 }),
    issue: () => { const b = pick(S().docs.batches.filter(x => x.status === 'open').concat(S().docs.batches.slice(-2))); return E.issue({ batchId: b.id, itemId: pick(S().items.filter(i => ['meat', 'spice'].includes(i.cat))).id, qty: ri(1, 120) * 500, date: T }); },
    closeSplit: () => { const b = pick(S().docs.batches.filter(x => x.status === 'open')); const sizes = E.packsOf(E.item(b.productId)); const packs = {}; const split = E.whs('fg').map(w => ({ wh: w, packs: {} })); for (const z of sizes) if (R() < 0.6) { const n = ri(1, 60); packs[z] = n; const a = ri(0, n); split[0].packs[z] = a; split[split.length - 1].packs[z] = (split[split.length - 1].packs[z] || 0) + (split.length > 1 ? n - a : 0); if (split.length === 1) split[0].packs[z] = n; } if (R() < 0.15) split[0].packs[sizes[0]] = (split[0].packs[sizes[0]] || 0) + 1; /* wrong on purpose */ return E.closeBatch({ batchId: b.id, date: T, packs, split }); },
    closePlain: () => { const b = pick(S().docs.batches.filter(x => x.status === 'open')); return E.closeBatch({ batchId: b.id, date: T, packs: { [pick(E.packsOf(E.item(b.productId)))]: ri(1, 150) } }); },
    invoice: () => { const c = pick(S().partners.filter(p => p.type === 'customer')); const n = ri(1, 4); return E.invoice({ date: T, customerId: c.id, lines: Array.from({ length: n }, () => { const p = pick(prods()); return { productId: p.id, packSize: pick(E.packsOf(p)), count: ri(1, 30) }; }), discount: R() < 0.2 ? ri(0, 3000) * 100 : 0, method: pick(['cash', 'credit', 'bank', 'instapay']) }); },
    receipt: () => E.receipt({ date: T, customerId: pick(S().partners.filter(p => p.type === 'customer')).id, amount: ri(1, 50000) * 100, method: pick(['cash', 'bank', 'instapay']) }),
    payment: () => E.supplierPayment({ date: T, supplierId: pick(S().partners.filter(p => p.type === 'supplier')).id, amount: ri(1, 300000) * 100, method: pick(['cash', 'bank']) }),
    expense: () => E.expense({ date: T, acc: pick(E.EXPENSE_ACCS), amount: ri(1, 30000) * 100, method: pick(['cash', 'bank', 'instapay']) }),
    cashTransfer: () => E.cashTransfer({ date: T, from: pick(['cash', 'bank', 'instapay']), to: pick(['cash', 'bank', 'instapay']), amount: ri(1, 100000) * 100 }),
    writeOff: () => { const l = pick(S().lots.filter(x => x.qty > 0)); return E.writeOff({ date: T, lotId: l.id, qty: ri(1, l.qty), reason: 'فحص' }); },
    correction: () => { const b = pick(S().docs.batches.filter(x => x.status === 'open' && x.issues.some(i => !i.reversed))); const ln = pick(b.issues.filter(i => !i.reversed)); return E.requestCorrection({ batchId: b.id, issueId: ln.id, newQty: Math.max(0, ln.qty - 500), reason: 'فحص تصحيح' }); },
    decide: () => { const c = pick(S().docs.corrections.filter(x => x.status === 'pending')); return E.decideCorrection(c.id, R() < 0.7); },
    price: () => { const it = pick(prods()); return E.saveItem({ ...it, priceRetail: it.priceRetail + 500, priceWholesale: it.priceWholesale + 500 }); },
    fridge: () => E.saveWarehouse({ name: 'فريزر فحص ' + ri(1, 99999), use: pick(['fg', 'raw', 'pack', 'receiving', 'nonsense']) }),
    self: () => E.updateSelf({ name: R() < 0.2 ? 'x' : 'اسم فحص ' + ri(1, 99), avatar: R() < 0.1 ? 'data:image/jpeg;base64,' + 'A'.repeat(200000) : '' }),
    order: () => { const p = pick(prods()); return E.placeOrder({ phone: '0100' + ri(1000000, 9999999), name: 'عميل فحص', address: 'عنوان فحص بالتفصيل', method: pick(['cash', 'instapay', 'visa']), lines: [{ productId: p.id, packSize: pick(E.packsOf(p)), count: ri(1, 12) }], test: R() < 0.3 }); },
    orderDecide: () => { const o = pick((S().docs.orders || []).filter(x => x.status !== 'rejected')); return E.decideOrder({ id: o.id, action: pick(['approve', 'reject', 'paid', 'delete']) }); },
  };
  const names = Object.keys(ops);
  for (let n = 0; n < OPS; n++) {
    const name = pick(names); const before = JSON.stringify(S());
    try { ops[name](); accepted++; }
    catch (e) { rejected++; if (JSON.stringify(S()) !== before) bad(`seed ${sd}: ${name} was rejected ("${e.message}") but changed the books`); if (!(e instanceof Error) || /undefined|null|is not|Cannot/.test(e.message)) bad(`seed ${sd}: ${name} crashed instead of refusing: ${e.message}`); }
    const broken = E.integrity().filter(c => !c.ok);
    if (broken.length) { bad(`seed ${sd} after ${name} #${n}: ${broken.map(c => c.name).join(' | ')}`); break; }
  }
  identities('seed ' + sd);
}
console.log(`fuzz: ${SEEDS} seeds × ${OPS} ops → ${accepted} accepted, ${rejected} refused`);

/* ---------- 2. malformed input battery ---------- */
E.reset(); S().currentUser = S().users.find(u => u.role === 'owner').id;
const lot = S().lots.find(l => l.qty > 5000 && E.whUse(l.wh) === 'raw'), openB = S().docs.batches.find(b => b.status === 'open');
const prod = S().items.find(i => i.cat === 'product'), cust = S().partners.find(p => p.type === 'customer'), sup = S().partners.find(p => p.type === 'supplier');
const JUNK = [undefined, null, '', 'abc', -1, 0, 1.5, NaN, Infinity, 1e15, '100', [], {}, true, '<script>alert(1)</script>', '2026-13-45', '٥'];
const cases = {
  purchase: v => E.purchase({ date: T, supplierId: sup.id, ref: 'X', lines: [{ itemId: sup.items[0], qty: v, unitCost: 100, expDate: E.addDays(T, 5) }] }),
  purchaseCost: v => E.purchase({ date: T, supplierId: sup.id, ref: 'X', lines: [{ itemId: sup.items[0], qty: 1000, unitCost: v, expDate: E.addDays(T, 5) }] }),
  purchaseDate: v => E.purchase({ date: v, supplierId: sup.id, ref: 'X', lines: [{ itemId: sup.items[0], qty: 1000, unitCost: 100, expDate: E.addDays(T, 5) }] }),
  purchaseExp: v => E.purchase({ date: T, supplierId: sup.id, ref: 'X', lines: [{ itemId: sup.items[0], qty: 1000, unitCost: 100, expDate: v }] }),
  purchaseSup: v => E.purchase({ date: T, supplierId: v, ref: 'X', lines: [{ itemId: sup.items[0], qty: 1000, unitCost: 100, expDate: E.addDays(T, 5) }] }),
  purchaseLines: v => E.purchase({ date: T, supplierId: sup.id, ref: 'X', lines: v }),
  transfer: v => E.transfer({ date: T, lotId: lot.id, qty: v, toWh: E.whs('raw').find(w => w !== lot.wh) || 'W1' }),
  transferWh: v => E.transfer({ date: T, lotId: lot.id, qty: 1000, toWh: v }),
  createBatch: v => E.createBatch({ date: T, productId: prod.id, planned: v }),
  createBatchP: v => E.createBatch({ date: T, productId: v, planned: 10000 }),
  issue: v => E.issue({ batchId: openB.id, itemId: lot.itemId, qty: v, date: T }),
  issueB: v => E.issue({ batchId: v, itemId: lot.itemId, qty: 1000, date: T }),
  closeBatch: v => E.closeBatch({ batchId: openB.id, date: T, packs: { 500: v } }),
  closeBatchPacks: v => E.closeBatch({ batchId: openB.id, date: T, packs: v }),
  closeBatchSplit: v => E.closeBatch({ batchId: openB.id, date: T, packs: { 500: 2 }, split: v }),
  invoice: v => E.invoice({ date: T, customerId: cust.id, lines: [{ productId: prod.id, packSize: 500, count: v }], method: 'cash' }),
  invoicePack: v => E.invoice({ date: T, customerId: cust.id, lines: [{ productId: prod.id, packSize: v, count: 1 }], method: 'cash' }),
  invoiceDisc: v => E.invoice({ date: T, customerId: cust.id, lines: [{ productId: prod.id, packSize: 500, count: 1 }], discount: v, method: 'cash' }),
  invoiceMethod: v => E.invoice({ date: T, customerId: cust.id, lines: [{ productId: prod.id, packSize: 500, count: 1 }], method: v }),
  receipt: v => E.receipt({ date: T, customerId: cust.id, amount: v, method: 'cash' }),
  supplierPayment: v => E.supplierPayment({ date: T, supplierId: sup.id, amount: v, method: 'bank' }),
  expense: v => E.expense({ date: T, acc: E.EXPENSE_ACCS[0], amount: v, method: 'cash' }),
  expenseAcc: v => E.expense({ date: T, acc: v, amount: 100, method: 'cash' }),
  cashTransfer: v => E.cashTransfer({ date: T, from: 'cash', to: 'bank', amount: v }),
  writeOff: v => E.writeOff({ date: T, lotId: lot.id, qty: v, reason: 'فحص' }),
  saveWarehouse: v => E.saveWarehouse({ name: v, use: 'fg' }),
  saveWarehouseUse: v => E.saveWarehouse({ name: 'تلاجة فحص', use: v }),
  updateSelf: v => E.updateSelf({ name: v }),
  updateSelfAvatar: v => E.updateSelf({ name: 'اسم سليم', avatar: v }),
  placeOrder: v => E.placeOrder({ phone: '01012345678', name: 'عميل', address: 'عنوان بالتفصيل', method: 'cash', lines: [{ productId: prod.id, packSize: 500, count: v }] }),
  placeOrderPhone: v => E.placeOrder({ phone: v, name: 'عميل', address: 'عنوان بالتفصيل', method: 'cash', lines: [{ productId: prod.id, packSize: 500, count: 1 }] }),
  decideOrder: v => E.decideOrder({ id: v, action: 'approve' }),
};
// values that are legitimately valid for a given case are skipped
const VALID = { purchaseExp: [], updateSelfAvatar: [undefined, null, ''], invoiceDisc: [undefined, null, '', 0], closeBatchSplit: [undefined, null], purchaseLines: [], saveWarehouse: ['abc', '100', '<script>alert(1)</script>', '2026-13-45', '٥'], updateSelf: ['abc', '100', '2026-13-45', '<script>alert(1)</script>'], placeOrderPhone: ['2026-13-45'], closeBatch: [], invoice: [], placeOrder: [] };
let tried = 0, wrongly = [];
for (const [name, fn] of Object.entries(cases)) for (const v of JUNK) {
  if ((VALID[name] || []).some(x => Object.is(x, v))) continue;
  const before = JSON.stringify(S()); tried++;
  try { fn(v); wrongly.push(`${name}(${typeof v === 'number' ? v : JSON.stringify(v)})`); E.setState(JSON.parse(before)); }
  catch (e) { if (JSON.stringify(S()) !== before) bad(`malformed ${name}(${JSON.stringify(v)}) refused but changed the books`); if (/undefined|Cannot read|is not a function|is not iterable|null \(/.test(e.message)) bad(`malformed ${name}(${JSON.stringify(v)}) crashed: ${e.message}`); }
  if (!E.integrity().every(c => c.ok)) { bad(`malformed ${name}(${JSON.stringify(v)}) broke integrity`); E.setState(JSON.parse(before)); }
}
console.log(`malformed input: ${tried} bad calls, ${tried - wrongly.length} refused cleanly`);
if (wrongly.length) { console.log('ACCEPTED (review each):'); wrongly.forEach(w => console.log('  •', w)); }
console.log(fails ? `\n${fails} PROBLEM(S)` : (wrongly.length ? '\nNO INTEGRITY PROBLEMS — but some bad input was accepted (listed above)' : '\nALL HARD CHECKS PASSED'));
process.exit(fails ? 1 : 0);
