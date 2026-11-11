// Boom Meat ERP — audit: random operation fuzzing + permission matrix.
// After EVERY operation: the books must balance and stock must reconcile; a rejected
// operation must leave the books byte-for-byte unchanged.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
let fails = 0; const bad = m => { fails++; console.log('✗', m); };
/* ---------- 0. every shipped script parses, and the translation dictionary is sane ---------- */
{
  const { execFileSync } = await import('node:child_process');
  for (const f of ['engine.js', 'app.js', 'pages-ops.js', 'pages-fin.js', 'pages-setup.js', 'i18n.js', 'config.js']) {
    try { execFileSync(process.execPath, ['--check', dir + '/' + f], { stdio: 'pipe' }); } catch (e) { bad(`${f} does not parse: ${String(e.stderr).split('\n')[4] || ''}`); }
  }
  const w = {}; try { new Function('window', (await import('node:fs')).readFileSync(dir + '/i18n.js', 'utf8'))(w); } catch (e) { bad('i18n.js: ' + e.message); }
  const M = w.BOOM_EN || {}; const keys = Object.keys(M);
  if (keys.length < 500) bad('translation dictionary looks empty (' + keys.length + ' entries)');
  if (keys.some(k => !k.trim()) || Object.values(M).some(v => typeof v !== 'string' || !v.trim())) bad('translation dictionary has empty entries');
  console.log(`scripts parse · ${keys.length} translations`);
}

/* ---------- 1. fuzz ---------- */
E.reset();
let seed = 7; const R = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(R() * a.length)];
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const T = E.today();
const S = () => E.S;
const ok = [], rejected = [];
const ops = {
  purchase: () => { const sup = pick(S().partners.filter(p => p.type === 'supplier')); const it = pick(sup.items); return E.purchase({ date: T, supplierId: sup.id, ref: 'FZ', lines: [{ itemId: R() < 0.1 ? 'it_FG-401' : it, qty: R() < 0.1 ? 0 : ri(1, 300) * (E.item(it).unit === 'kg' ? 1000 : 1), unitCost: R() < 0.05 ? -5 : ri(100, 40000), expDate: R() < 0.05 ? T : E.addDays(T, ri(2, 200)) }] }); },
  transfer: () => { const l = pick(S().lots.filter(x => x.qty > 0)); return E.transfer({ date: T, lotId: l.id, qty: R() < 0.1 ? l.qty + 1 : ri(1, l.qty), toWh: pick(['W1', 'W2', 'W3', 'W4']) }); },
  createBatch: () => E.createBatch({ date: T, productId: pick(S().items.filter(i => i.cat === 'product')).id, planned: ri(1, 200) * 1000 }),
  issue: () => { const b = pick(S().docs.batches.filter(x => x.status === 'open').concat(S().docs.batches.slice(-2))); return E.issue({ batchId: b.id, itemId: pick(S().items.filter(i => ['meat', 'spice'].includes(i.cat))).id, qty: ri(1, 120) * 500, date: T }); },
  closeBatch: () => { const b = pick(S().docs.batches.filter(x => x.status === 'open')); const sizes = E.packsOf(E.item(b.productId)); const z = pick(sizes); return E.closeBatch({ batchId: b.id, date: T, packs: { [z]: ri(1, 200) } }); },
  invoice: () => { const c = pick(S().partners.filter(p => p.type === 'customer')); const p = pick(S().items.filter(i => i.cat === 'product')); return E.invoice({ date: T, customerId: c.id, lines: [{ productId: p.id, packSize: pick(E.packsOf(p)), count: ri(1, 40) }], discount: R() < 0.2 ? ri(0, 5000) * 100 : 0, method: pick(['cash', 'credit', 'bank', 'instapay']) }); },
  receipt: () => E.receipt({ date: T, customerId: pick(S().partners.filter(p => p.type === 'customer')).id, amount: ri(1, 50000) * 100, method: pick(['cash', 'bank', 'instapay']) }),
  payment: () => E.supplierPayment({ date: T, supplierId: pick(S().partners.filter(p => p.type === 'supplier')).id, amount: ri(1, 300000) * 100, method: pick(['cash', 'bank']) }),
  expense: () => E.expense({ date: R() < 0.05 ? E.addDays(T, 2) : T, acc: pick(E.EXPENSE_ACCS), amount: ri(1, 30000) * 100, method: pick(['cash', 'bank', 'instapay']) }),
  cashTransfer: () => E.cashTransfer({ date: T, from: pick(['cash', 'bank', 'instapay']), to: pick(['cash', 'bank', 'instapay']), amount: ri(1, 100000) * 100 }),
  writeOff: () => { const l = pick(S().lots.filter(x => x.qty > 0)); return E.writeOff({ date: T, lotId: l.id, qty: ri(1, l.qty), reason: R() < 0.1 ? '' : 'فحص' }); },
  cutting: () => { const l = S().lots.find(x => x.cat === 'carcass' && x.qty > 0); if (!l) throw new Error('no carcass'); const q = Math.min(l.qty, ri(50, 400) * 1000); return E.cutting({ date: T, lotId: l.id, qty: q, outputs: [{ itemId: 'it_RM-101', qty: Math.round(q * 0.3) }, { itemId: 'it_RM-105', qty: Math.round(q * 0.4) }, { itemId: 'it_RM-190', qty: Math.round(q * 0.2) }] }); },
  correction: () => { const b = pick(S().docs.batches.filter(x => x.status === 'open' && x.issues.some(i => !i.reversed))); const ln = pick(b.issues.filter(i => !i.reversed)); return E.requestCorrection({ batchId: b.id, issueId: ln.id, newQty: Math.max(0, ln.qty - 500), reason: 'فحص تصحيح' }); },
  decide: () => { const c = pick(S().docs.corrections.filter(x => x.status === 'pending')); return E.decideCorrection(c.id, R() < 0.7); },
  price: () => { const it = pick(S().items.filter(i => i.cat === 'product')); return E.saveItem({ ...it, priceRetail: it.priceRetail + 500, priceWholesale: it.priceWholesale + 500 }); },
};
const names = Object.keys(ops);
for (let n = 0; n < 1200; n++) {
  const name = pick(names);
  const before = JSON.stringify(E.S);
  try { ops[name](); ok.push(name); }
  catch (e) {
    rejected.push(name);
    if (JSON.stringify(E.S) !== before) bad(`${name} was rejected ("${e.message}") but changed the books`);
  }
  const broken = E.integrity().filter(c => !c.ok);
  if (broken.length) { bad(`after ${name} #${n}: ${broken.map(c => c.name).join(' | ')}`); break; }
}
const t = E.today(), from = E.addDays(t, -29);
if (!E.manufacturingAccount({ from, to: t }).check) bad('manufacturing account does not match the entries');
if (!E.balanceSheet({ asOf: t }).balanced) bad('balance sheet not balanced');
const tb = E.trialBalance({ from, to: t }); if (tb.totals.endDr !== tb.totals.endCr) bad('trial balance not balanced');
if (S().lots.some(l => l.qty < 0 || l.value < 0)) bad('negative lot');
['1101', '1102', '1103'].forEach(a => { if (E.cashBalance(a) < 0) bad('negative cash ' + a); });
console.log(`fuzz: ${ok.length} accepted, ${rejected.length} rejected, ${S().journal.length} entries`);

/* ---------- 2. permission matrix ---------- */
E.reset();
const roleUser = r => E.S.users.find(u => u.role === r).id;
const MATRIX = { // op: roles allowed (owner always allowed)
  purchase: ['storekeeper', 'accountant'], transfer: ['storekeeper', 'supervisor'], cutting: ['supervisor', 'storekeeper'], createBatch: ['supervisor'], issue: ['worker', 'supervisor'],
  closeBatch: ['supervisor'], invoice: ['sales', 'accountant'], receipt: ['accountant', 'sales'], supplierPayment: ['accountant'], expense: ['accountant'], writeOff: ['storekeeper'],
  saveItem: [], updateSettings: [], decideCorrection: [], resetBooks: [], openingBalances: ['accountant'],
};
const calls = {
  purchase: () => E.purchase({ date: T, supplierId: 's3', ref: 'P', lines: [{ itemId: 'it_SP-201', qty: 1000, unitCost: 100, expDate: E.addDays(T, 9) }] }),
  transfer: () => { const l = E.S.lots.find(x => x.qty > 1000 && x.wh === 'W1' || (x.qty > 1000 && x.wh === 'W2' && x.cat === 'meat')); return E.transfer({ date: T, lotId: l.id, qty: 1, toWh: l.wh === 'W1' ? 'W2' : 'W1' }); },
  cutting: () => { const l = E.S.lots.find(x => x.cat === 'carcass' && x.qty > 2000); return E.cutting({ date: T, lotId: l.id, qty: 1000, outputs: [{ itemId: 'it_RM-101', qty: 500 }] }); },
  createBatch: () => E.createBatch({ date: T, productId: 'it_FG-401', planned: 10000 }),
  issue: () => E.issue({ batchId: E.S.docs.batches.find(b => b.status === 'open').id, itemId: 'it_SP-201', qty: 100, date: T }),
  closeBatch: () => { const b = E.S.docs.batches[E.S.docs.batches.length - 1]; return E.closeBatch({ batchId: b.id, date: T, packs: { 500: 1 } }); },
  invoice: () => E.invoice({ date: T, customerId: 'c1', lines: [{ productId: 'it_FG-401', packSize: 1000, count: 1 }], method: 'credit' }),
  receipt: () => E.receipt({ date: T, customerId: 'c1', amount: 100, method: 'cash' }),
  supplierPayment: () => E.supplierPayment({ date: T, supplierId: 's1', amount: 100, method: 'bank' }),
  expense: () => E.expense({ date: T, acc: '5403', amount: 100, method: 'bank' }),
  writeOff: () => { const l = E.S.lots.find(x => x.qty > 10 && x.cat === 'spice'); return E.writeOff({ date: T, lotId: l.id, qty: 1, reason: 'فحص' }); },
  saveItem: () => { const it = E.item('it_SP-201'); return E.saveItem({ ...it }); },
  updateSettings: () => E.updateSettings({ issueLimitKg: 100, vatRate: 14, telegram: true, company: {} }),
  decideCorrection: () => { const c = E.S.docs.corrections.find(x => x.status === 'pending'); return E.decideCorrection(c.id, false); },
  resetBooks: () => E.resetBooks(),
  openingBalances: () => E.openingBalances({ date: T, cash: 100 }),
};
const roles = ['owner', 'accountant', 'storekeeper', 'supervisor', 'worker', 'sales'];
let checked = 0;
for (const [op, allowed] of Object.entries(MATRIX)) for (const r of roles) {
  const snap = JSON.stringify(E.S);
  if (op === 'closeBatch') { E.S.currentUser = roleUser('owner'); const nb = E.createBatch({ date: T, productId: 'it_FG-401', planned: 5000 }); E.issue({ batchId: nb.id, itemId: 'it_SP-201', qty: 1000, date: T }); }
  E.S.currentUser = roleUser(r);
  let did = true, msg = '';
  try { calls[op](); } catch (e) { did = false; msg = e.message; }
  const should = r === 'owner' || allowed.includes(r);
  const permErr = /الصلاحية/.test(msg);
  if (should && !did) bad(`${r} should be able to ${op} but got: ${msg}`);
  if (!should && (did || !permErr)) bad(`${r} must NOT be able to ${op} (${did ? 'it worked' : msg})`);
  E.setState(JSON.parse(snap)); checked++;
}
console.log(`permissions: ${checked} role×operation checks`);
console.log(fails ? `\n${fails} PROBLEM(S)` : '\nALL AUDIT CHECKS PASSED');
process.exit(fails ? 1 : 0);
