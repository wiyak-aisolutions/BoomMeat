// Boom Meat ERP — a customer with branches (Healthy): one account, every delivery names its branch, one consolidated bill.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
let pass = 0, fail = 0; const ok = (c, cond, d = '') => { if (cond) pass++; else { fail++; console.log('✗', c, JSON.stringify(d).slice(0, 300)); } };
const tryOp = fn => { const snap = JSON.stringify(E.S); try { return { ok: true, r: fn() }; } catch (e) { E.setState(JSON.parse(snap)); return { ok: false, msg: e.message }; } };
E.reset(); const S = E.S, T = E.today(); S.currentUser = S.users.find(u => u.role === 'owner').id;
const p = S.items.find(i => i.cat === 'product' && E.available(i.id, E.whs('fg'), 1000) >= 10000);
const h = E.savePartner({ type: 'customer', name: 'هيلثي', kind: 'wholesale', terms: 'credit', branches: [{ name: 'المقطم' }, { name: 'زهراء المعادي', address: 'شارع ٩' }, { name: 'شيراتون', phone: '0100' }, { name: '' }] });
ok('branches saved, blank names dropped', h.branches.length === 3 && h.branches.every(b => b.id && b.name), h.branches);
ok('duplicate branch names are refused', !tryOp(() => E.savePartner({ id: h.id, type: 'customer', name: 'هيلثي', kind: 'wholesale', terms: 'credit', branches: [{ name: 'فيصل' }, { name: 'فيصل' }] })).ok);
const [mq, zm, sh] = h.branches;
ok('a sale to a branched customer needs a branch', !tryOp(() => E.invoice({ date: T, customerId: h.id, method: 'credit', lines: [{ productId: p.id, packSize: 1000, count: 1 }] })).ok);
ok('an unknown branch is refused', !tryOp(() => E.invoice({ date: T, customerId: h.id, method: 'credit', branchId: 'nope', lines: [{ productId: p.id, packSize: 1000, count: 1 }] })).ok);
const v1 = E.invoice({ date: T, customerId: h.id, method: 'credit', branchId: mq.id, lines: [{ productId: p.id, packSize: 1000, count: 2 }] });
const v2 = E.invoice({ date: T, customerId: h.id, method: 'credit', branchId: zm.id, lines: [{ productId: p.id, packSize: 1000, count: 3 }] });
const v3 = E.invoice({ date: T, customerId: h.id, method: 'credit', branchId: mq.id, lines: [{ productId: p.id, packSize: 1000, count: 1 }] });
ok('the invoice carries its branch', v1.branchId === mq.id && v1.branchName === 'المقطم');
ok('all branches share one account', E.partnerBalance(h.id) === v1.total + v2.total + v3.total, E.partnerBalance(h.id));
const st = E.partnerStatement(h.id);
ok('the statement shows the branch on every invoice line', st.length === 3 && st.map(r => r.branch).join() === 'المقطم,زهراء المعادي,المقطم', st.map(r => r.branch));
ok('the journal memo names the branch', /فرع المقطم/.test(st[0].memo));
E.receipt({ date: T, customerId: h.id, amount: v2.total, method: '1101', memo: 'تحصيل', invoiceId: v2.id });
const b = E.branchBill({ customerId: h.id, from: E.monthStart(T), to: T });
ok('one bill: a group per branch that had deliveries', b.branches.length === 2 && b.branches[0].name === 'المقطم' && b.branches[0].invoices.length === 2, b.branches.map(x => x.name));
ok('branch subtotals add up to the bill total', b.branches.reduce((s, x) => s + x.total, 0) === b.total && b.total === v1.total + v2.total + v3.total);
ok('the bill shows paid and still due', b.paid === v2.total && b.due === v1.total + v3.total && b.balance === v1.total + v3.total, b);
ok('a period with no deliveries is empty', E.branchBill({ customerId: h.id, from: '2020-01-01', to: '2020-01-31' }).count === 0);
// renaming a branch keeps its id, so old invoices still point at it
E.savePartner({ id: h.id, type: 'customer', name: 'هيلثي', kind: 'wholesale', terms: 'credit', branches: [{ id: mq.id, name: 'المقطم شارع 9' }, { id: zm.id, name: 'زهراء المعادي' }, { id: sh.id, name: 'شيراتون' }] });
ok('renaming a branch keeps its id', E.partner(h.id).branches[0].id === mq.id && E.partner(h.id).branches[0].name === 'المقطم شارع 9');
// customers without branches are unchanged
const c = S.partners.find(x => x.type === 'customer' && !x.branches && x.terms === 'credit');
ok('a normal customer still sells without a branch', tryOp(() => E.invoice({ date: T, customerId: c.id, method: 'credit', lines: [{ productId: p.id, packSize: 1000, count: 1 }] })).ok);
ok('books balanced', E.integrity().every(x => x.ok), E.integrity().filter(x => !x.ok).map(x => x.name));
console.log(`branch checks: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
