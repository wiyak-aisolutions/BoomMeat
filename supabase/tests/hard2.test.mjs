// Boom Meat ERP — HARD audit of the Nov 2026 features (returns, edits after saving, change requests, open butchery,
// packing stage, rework, open weights, treasuries, advances/custody, per-person screens).
//  1. Many seeds × random operations by random roles, with deliberately bad numbers mixed in.
//     After EVERY operation: integrity + manufacturing account hold; a refused operation leaves the books byte-identical.
//  2. Malformed-input battery on every new operation: each must refuse cleanly and change nothing.
// Run: node supabase/tests/hard2.test.mjs [seeds] [opsPerSeed]
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
const SEEDS = +process.argv[2] || 5, OPS = +process.argv[3] || 700;
let fails = 0; const bad = m => { fails++; if (fails <= 40) console.log('✗', m); };
const S = () => E.S, T = E.today();
const sound = tag => {
  const from = E.addDays(T, -40);
  const bad1 = E.integrity().filter(c => !c.ok); if (bad1.length) bad(`${tag}: integrity ${bad1.map(c => c.name).join(' | ')}`);
  const m = E.manufacturingAccount({ from, to: T }); if (!m.check) bad(`${tag}: manufacturing account (prod ${m.production}/${m.producedPosted}, cogs ${m.cogs}/${m.cogsPosted})`);
  for (const l of S().lots) if (!Number.isInteger(l.qty) || !Number.isInteger(l.value) || l.qty < 0 || l.value < 0) { bad(`${tag}: lot ${l.code} qty ${l.qty} value ${l.value}`); break; }
  for (const v of S().docs.invoices) { const left = v.total - E.invoiceReturned(v) - E.invoicePaid(v); if (E.invoiceReturned(v) > v.total || v.lines.some(l => (l.returned || 0) > l.count)) { bad(`${tag}: ${v.no} returned more than sold`); break; } }
  for (const r of S().docs.butcheries || []) if (E.butOut(r) > E.butIn(r)) { bad(`${tag}: ${r.no} output > input`); break; }
  for (const a of E.ACCOUNTS.filter(x => E.LEAF.has(x.code) && ['cash', 'bank', 'wallet'].includes(x.money))) if (E.cashBalance(a.code) < 0) { bad(`${tag}: negative ${a.name}`); break; }
};

let accepted = 0, rejected = 0, requests = 0;
const tally = {};
for (let sd = 1; sd <= SEEDS; sd++) {
  E.reset();
  let seed = sd * 104729; const R = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = a => { if (!a.length) throw new Error('لا يوجد'); return a[Math.floor(R() * a.length)]; }, ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const as = r => { S().currentUser = S().users.find(u => u.role === r).id; };
  const anyRole = () => as(pick(['owner', 'owner', 'accountant', 'sales', 'storekeeper', 'supervisor', 'worker', 'packer']));
  const rawLots = () => S().lots.filter(l => l.qty > 0 && ['carcass', 'meat', 'byproduct'].includes(l.cat) && ['raw', 'receiving'].includes(E.whUse(l.wh)) && !E.item(l.itemId).rework);
  const fgStock = () => S().lots.filter(l => l.qty >= l.packSize && E.item(l.itemId).cat === 'product' && E.whUse(l.wh) === 'fg');
  const credCust = () => S().partners.filter(p => p.type === 'customer' && p.terms === 'credit' && !(p.branches || []).length);
  const ops = {
    sell: () => { const l = pick(fgStock()); const c = pick(credCust()); return E.invoice({ date: T, customerId: c.id, lines: [{ productId: l.itemId, packSize: l.packSize, count: R() < 0.1 ? 9999 : ri(1, Math.max(1, Math.floor(l.qty / l.packSize))) }], method: R() < 0.5 ? 'credit' : 'cash' }); },
    ret: () => { const v = pick(S().docs.invoices.slice(-40)); const k = ri(0, v.lines.length - 1), L = v.lines[k]; return E.invoiceReturn({ invoiceId: v.id, lines: [{ idx: R() < 0.05 ? 99 : k, count: R() < 0.15 ? L.count + 1 : ri(1, Math.max(1, L.count - (L.returned || 0))) }], restock: R() < 0.7, refund: R() < 0.3 ? 'cash' : null, reason: R() < 0.1 ? '' : 'فحص مرتجع' }); },
    price: () => { const v = pick(S().docs.invoices.slice(-40)); return E.invoicePrice({ invoiceId: v.id, idx: ri(0, v.lines.length - 1), pricePerKg: R() < 0.1 ? -5 : ri(5000, 80000), reason: 'فحص سعر' }); },
    poEdit: () => { const p = pick(S().docs.purchases.slice(-30)); const k = ri(0, p.lines.length - 1), ln = p.lines[k]; return E.editPurchaseLine({ purchaseId: p.id, line: k, qty: R() < 0.1 ? 0 : Math.max(1, ln.qty + ri(-Math.floor(ln.qty / 4), Math.floor(ln.qty / 4))), unitCost: R() < 0.5 ? ln.unitCost : ri(100, 50000), reason: 'فحص استلام' }); },
    decide: () => { const c = pick(S().docs.changes.filter(x => x.status === 'pending')); return E.decideChange(c.id, R() < 0.75); },
    corr: () => { const b = pick(S().docs.batches.filter(E.running)); const ln = pick(b.issues.filter(i => !i.reversed && E.item(i.itemId).cat !== 'pack')); return E.requestCorrection({ batchId: b.id, issueId: ln.id, newQty: R() < 0.1 ? -1 : Math.max(0, ln.qty + ri(-2000, 2000)), reason: 'فحص تصحيح' }); },
    corrDecide: () => { const c = pick(S().docs.corrections.filter(x => x.status === 'pending')); return E.decideCorrection(c.id, R() < 0.6); },
    buOpen: () => { const l = pick(rawLots()); return E.openButchery({ date: T, lotId: l.id, qty: R() < 0.1 ? l.qty + 1 : ri(1, l.qty), note: 'فحص' }); },
    buIn: () => { const r = pick(S().docs.butcheries.filter(x => x.status === 'open')); const l = pick(rawLots()); return E.butcheryInput({ id: r.id, lotId: l.id, qty: ri(1, l.qty) }); },
    buPack: () => { const r = pick(S().docs.butcheries.filter(x => x.status === 'open')); const it = pick(S().items.filter(i => i.cat === 'pack')); return E.butcheryPack({ id: r.id, itemId: it.id, qty: ri(1, 40) }); },
    buOut: () => { const r = pick(S().docs.butcheries.filter(x => x.status === 'open')); const it = pick(S().items.filter(i => ['meat', 'byproduct', 'product'].includes(i.cat) && !i.rework)); const left = E.butIn(r) - E.butOut(r);
      return it.cat === 'product' || R() < 0.3 ? E.butcheryOutput({ id: r.id, itemId: it.id, count: ri(1, 30), packSize: pick(it.cat === 'product' ? E.packsOf(it) : E.PACK_SIZES) }) : E.butcheryOutput({ id: r.id, itemId: it.id, qty: R() < 0.1 ? left + 1 : ri(1, Math.max(1, Math.floor(left * 0.6))) }); },
    buEdit: () => { const r = pick(S().docs.butcheries.filter(x => x.status === 'open' && x.outputs.length)); const o = pick(r.outputs); return o.count ? E.butcheryEditOutput({ id: r.id, lineId: o.id, count: ri(1, 40) }) : E.butcheryEditOutput({ id: r.id, lineId: o.id, qty: ri(1, E.butIn(r)) }); },
    buDropIn: () => { const r = pick(S().docs.butcheries.filter(x => x.status === 'open')); return E.butcheryDropInput({ id: r.id, inputId: pick(r.inputs).id }); },
    buDropPk: () => { const r = pick(S().docs.butcheries.filter(x => x.status === 'open' && x.packs.length)); return E.butcheryDropPack({ id: r.id, packId: pick(r.packs).id }); },
    buDropOut: () => { const r = pick(S().docs.butcheries.filter(x => x.status === 'open' && x.outputs.length)); return E.butcheryDropOutput({ id: r.id, lineId: pick(r.outputs).id }); },
    buClose: () => { const r = pick(S().docs.butcheries.filter(x => x.status === 'open')); return E.closeButchery({ id: r.id, date: T, wh: pick(E.whs('raw')), fgWh: pick(E.whs('fg')) }); },
    batch: () => E.createBatch({ date: T, productId: pick(S().items.filter(i => i.cat === 'product')).id, planned: ri(1000, 30000) }),
    issue: () => { const b = pick(S().docs.batches.filter(E.running)); const it = pick(S().items.filter(i => ['meat', 'spice', 'pack'].includes(i.cat))); const st = it.cat === 'pack' ? E.whs('pack') : E.whs('raw'); const av = E.available(it.id, st); return E.issue({ batchId: b.id, itemId: it.id, qty: R() < 0.1 ? av + 1 : ri(1, Math.max(1, Math.min(av, it.unit === 'kg' ? 20000 : 40))), date: T }); },
    handover: () => { const b = pick(S().docs.batches.filter(x => x.status === 'open')); return E.finishMeat({ batchId: b.id, noSpice: R() < 0.5 }); },
    rework: () => { const b = pick(S().docs.batches.filter(E.running)); return E.returnRework({ batchId: b.id, qty: R() < 0.1 ? 10 ** 9 : ri(100, 3000), date: T }); },
    close: () => { const b = pick(S().docs.batches.filter(E.running)); const kg = E.batchKg(b); const z = pick([200, 250, 500, 1000, 750, 1300]); const n = Math.max(1, Math.floor(kg * (R() < 0.1 ? 1.5 : 0.9) / z)); return E.closeBatch({ batchId: b.id, date: T, packs: { [z]: n } }); },
    deposit: () => E.deposit({ date: T, to: pick(['cash', '1111', '1107']), amount: ri(1, 500000), source: pick(['3301', '3101', '4104', '2201']), kind: pick(['cheque', 'cash', 'transfer']), memo: R() < 0.1 ? '' : 'فحص' }),
    move: () => E.cashTransfer({ date: T, from: pick(['cash', '1111', '1107', '1106']), to: pick(['cash', '1111', '1107', '1106']), amount: ri(1, 300000) }),
    advance: () => E.advance({ date: T, name: pick(['أحمد', 'محمود', 'سيد']), amount: ri(1, 50000), method: 'cash' }),
    custody: () => R() < 0.5 ? E.custody({ date: T, name: pick(['سواق ١', 'سواق ٢']), amount: ri(1, 50000), method: 'cash' }) : E.settleCustody({ date: T, name: pick(['سواق ١', 'سواق ٢']), back: ri(0, 20000), method: 'cash', spent: ri(0, 20000), acc: '5302' }),
    collect: () => { const v = pick(S().docs.invoices.filter(x => x.method === 'credit').slice(-30)); return E.receipt({ date: T, customerId: v.customerId, amount: ri(1, Math.max(1, v.total)), method: 'cash', invoiceId: v.id }); },
    screens: () => { const u = pick(S().users.filter(x => x.role !== 'owner')); return E.updateUserAccess({ userId: u.id, pages: R() < 0.3 ? null : ['home', pick(['treasury', 'invoices', 'worker', 'products'])] }); },
  };
  const names = Object.keys(ops);
  for (let i = 0; i < OPS; i++) {
    const n = pick(names); anyRole();
    const before = JSON.stringify(S());
    let res;
    try { res = ops[n](); accepted++; tally[n] = (tally[n] || 0) + 1; if (res && res.requested) requests++; }
    catch (e) {
      rejected++;
      if (!e.refused && e.message !== 'لا يوجد') bad(`seed ${sd} op ${i} ${n}: crash ${e.message}`);
      if (e.message === 'لا يوجد') { /* nothing to pick */ }
      else if (JSON.stringify(S()) !== before) bad(`seed ${sd} op ${i} ${n}: refused but books changed (${e.message})`);
      continue;
    }
    if (i % 7 === 0 || ['ret', 'poEdit', 'decide', 'buClose', 'close', 'price', 'buDropIn', 'corrDecide', 'rework'].includes(n)) sound(`seed ${sd} op ${i} ${n}`);
  }
  sound(`seed ${sd} end`);
  const again = JSON.parse(JSON.stringify(S())); E.setState(again); if (!E.integrity().every(c => c.ok)) bad(`seed ${sd}: integrity lost after save/reload`);
}
console.log(`fuzz: ${accepted} accepted (${requests} became owner requests), ${rejected} refused · ${SEEDS} seeds`);
console.log('accepted by op:', Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));

/* ---------- 2. malformed-input battery on the new operations ---------- */
E.reset(); S().currentUser = S().users.find(u => u.role === 'owner').id;
const garbage = [undefined, null, 0, -1, 1.5, NaN, Infinity, '', 'x', '١٢', {}, [], [1], { a: 1 }, true, 1e15, '<script>', '../../etc', -0];
const someInv = S().docs.invoices[0], somePo = S().docs.purchases[0];
const calls = {
  invoiceReturn: g => E.invoiceReturn({ invoiceId: g, lines: g }),
  invoiceReturn2: g => E.invoiceReturn({ invoiceId: someInv.id, lines: [{ idx: g, count: g }], refund: g }),
  invoicePrice: g => E.invoicePrice({ invoiceId: someInv.id, idx: g, pricePerKg: g }),
  editPurchaseLine: g => E.editPurchaseLine({ purchaseId: somePo.id, line: g, qty: g, unitCost: g }),
  decideChange: g => E.decideChange(g, g),
  openButchery: g => E.openButchery({ date: g, lotId: g, qty: g }),
  butcheryOutput: g => E.butcheryOutput({ id: g, itemId: g, qty: g, count: g, packSize: g }),
  butcheryEditOutput: g => E.butcheryEditOutput({ id: g, lineId: g, qty: g }),
  butcheryDropInput: g => E.butcheryDropInput({ id: g, inputId: g }),
  butcheryDropPack: g => E.butcheryDropPack({ id: g, packId: g }),
  closeButchery: g => E.closeButchery({ id: g, date: g, wh: g }),
  finishMeat: g => E.finishMeat({ batchId: g, noSpice: g }),
  returnRework: g => E.returnRework({ batchId: g, qty: g, date: g }),
  closeBatch: g => E.closeBatch({ batchId: (S().docs.batches.find(E.running) || {}).id, date: T, packs: { [String(g)]: g } }),
  updateUserAccess: g => E.updateUserAccess({ userId: g, pages: g }),
  updateAccess: g => E.updateAccess(g),
  deposit: g => E.deposit({ date: T, to: g, amount: g, source: g, kind: g, memo: g }),
  saveAccount: g => E.saveAccount({ name: g, parent: g, money: g }),
};
let battery = 0;
for (const [n, fn] of Object.entries(calls)) for (const g of garbage) {
  const before = JSON.stringify(S());
  try { fn(g); if (n !== 'updateAccess' || !(g && typeof g === 'object' && !Array.isArray(g))) bad(`malformed ${n}(${JSON.stringify(g)}) was accepted`); E.setState(JSON.parse(before)); }
  catch (e) { if (!e.refused) bad(`malformed ${n}(${JSON.stringify(g)}): crash ${e.message}`); if (JSON.stringify(S()) !== before) bad(`malformed ${n}(${JSON.stringify(g)}) changed the books`); }
  battery++;
}
console.log(`malformed input: ${battery} bad calls on new operations`);
console.log(fails ? `${fails} PROBLEM(S)` : 'ALL HARD CHECKS (NEW FEATURES) PASSED');
if (fails) process.exit(1);
