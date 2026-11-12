// WhatsApp orders: catalog, placing pending orders (shop endpoint), approve → invoice on account, paid, reject, test orders.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const require = createRequire(import.meta.url);
globalThis.localStorage = undefined;
require(dir + '/engine.js');
const E = globalThis.ERP;
const { runOp, runShop } = await import(dir + '/supabase/functions/_shared/core.mjs');
const store = { version: 0, state: JSON.parse(JSON.stringify(E.liveState({ id: 'owner-1', username: 'owner', name: 'المالك' }))) };
const logs = [];
const db = {
  async load() { return { version: store.version, state: JSON.parse(JSON.stringify(store.state)) }; },
  async save(st, base) { if (base !== store.version) return null; store.state = JSON.parse(JSON.stringify(st)); store.version++; return store.version; },
  async log(e) { logs.push(e); }, async snapshot() {},
};
const P = r => ({ user_id: r + '-1', username: r, name: r, role: r, active: true });
const owner = P('owner'), sales = P('sales'), worker = P('worker');
const tg = []; const telegram = async (chat, text) => { tg.push(text); return { ok: true }; };
let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'OK  ' : 'FAIL') + ' ' + name, cond ? '' : extra); if (!cond) fails++; };
const T = E.today();
await runOp({ E, db, profile: owner, op: 'updateSettings', args: [{ issueLimitKg: 100, vatRate: 14, telegram: true, tgChat: '123', company: {} }] });
let r = await runOp({ E, db, profile: owner, op: 'openingBalances', args: [{ date: T, cash: 100000, stock: [
  { itemId: 'it_FG-401', qty: 10000, packSize: 1000, unitCost: 30000, expDate: E.addDays(T, 60), wh: 'W4' },
  { itemId: 'it_FG-401', qty: 5000, packSize: 500, unitCost: 30000, expDate: E.addDays(T, 60), wh: 'W4' }] }] });
check('opening stock', r.status === 200, r.body.error);
await runOp({ E, db, profile: sales, op: 'savePartner', args: [{ type: 'customer', name: 'مطعم الجملة', phone: '01011112222', kind: 'wholesale', terms: 'credit' }] });

r = await runShop({ E, db, action: 'catalog', body: { phone: '+20 100 000 0001' } });
const burger = r.body.result.products.find(p => p.id === 'it_FG-401');
check('catalog retail price', r.body.result.kind === 'retail' && burger.pricePerKg === 485 && burger.packs.find(x => x.size === 1000).inStock === 10, JSON.stringify(burger));
check('catalog has 51 products', r.body.result.products.length === 51, r.body.result.products.length);
r = await runShop({ E, db, action: 'catalog', body: { phone: '201011112222' } });
check('wholesale customer by phone', r.body.result.kind === 'wholesale' && r.body.result.customer.name === 'مطعم الجملة', JSON.stringify(r.body.result.customer));

const order = (o = {}) => ({ phone: '201000000001', name: 'أحمد', address: 'الحي الرابع، مدينة ١٥ مايو', method: 'cash', lines: [{ productId: 'it_FG-401', packSize: 1000, count: 2 }], ...o });
r = await runShop({ E, db, action: 'order', body: { order: order({ expectTotal: 970 }) }, telegram });
check('place order', r.status === 200 && r.body.result.no === 'ORD-0001' && r.body.result.total === 970, JSON.stringify(r.body));
check('owner telegram sent', tg.length === 1 && tg[0].includes('ORD-0001') && tg[0].includes('970'), tg.join('|'));
check('no stock or ledger effect', store.state.journal.length === 1 && E.available('it_FG-401', ['W4'], 1000) === 10000);
r = await runShop({ E, db, action: 'catalog', body: {} });
check('pending order reserves stock', r.body.result.products.find(p => p.id === 'it_FG-401').packs.find(x => x.size === 1000).inStock === 8);
r = await runShop({ E, db, action: 'order', body: { order: order({ lines: [{ productId: 'it_FG-401', packSize: 1000, count: 9 }] }) }, telegram });
check('over stock refused', r.status === 400 && r.body.error.includes('المتاح 8'), r.body.error);
r = await runShop({ E, db, action: 'order', body: { order: order({ expectTotal: 900 }) }, telegram });
check('price mismatch refused', r.status === 400 && r.body.error.includes('السعر اتغير'), r.body.error);
r = await runShop({ E, db, action: 'order', body: { order: order({ method: 'visa' }) }, telegram });
check('bad method refused', r.status === 400);
r = await runShop({ E, db, action: 'order', body: { order: order({ lines: [{ productId: 'it_FG-401', packSize: 250, count: 1 }] }) }, telegram });
check('bad pack refused', r.status === 400);
r = await runShop({ E, db, action: 'order', body: { order: order({ test: true, method: 'instapay', lines: [{ productId: 'it_FG-401', packSize: 500, count: 1 }] }) }, telegram });
check('test order numbered apart, no telegram', r.status === 200 && r.body.result.no === 'TST-0001' && tg.length === 1, JSON.stringify(r.body) + tg.length);
const wo = await runShop({ E, db, action: 'order', body: { order: order({ phone: '01011112222', name: 'مطعم الجملة', lines: [{ productId: 'it_FG-401', packSize: 1000, count: 1 }] }) }, telegram });
check('wholesale order priced wholesale', wo.body.result.kind === 'wholesale' && wo.body.result.total === 435, JSON.stringify(wo.body));
r = await runShop({ E, db, action: 'status', body: { phone: '01000000001' } });
check('status by phone', r.body.result.length === 2 && r.body.result[0].status === 'pending', JSON.stringify(r.body));
check('bad action', (await runShop({ E, db, action: 'nope', body: {} })).status === 400);

const O = no => store.state.docs.orders.find(o => o.no === no);
r = await runOp({ E, db, profile: worker, op: 'decideOrder', args: [{ id: O('ORD-0001').id, action: 'approve' }] });
check('worker cannot approve', r.status === 400);
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: O('TST-0001').id, action: 'approve' }] });
check('test order cannot be approved', r.status === 400);
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: O('ORD-0001').id, action: 'approve' }] });
check('sales approves → invoice', r.status === 200 && O('ORD-0001').status === 'approved' && O('ORD-0001').invoiceNo, r.body.error);
const inv = store.state.docs.invoices[0];
check('invoice VAT included, on account', inv.total === 97000 && inv.net + inv.vat === 97000 && inv.vat === 11912 && inv.method === 'credit' && !inv.paidJe, JSON.stringify({ t: inv.total, n: inv.net, v: inv.vat }));
const cu = store.state.partners.find(p => p.id === O('ORD-0001').customerId);
check('new customer created from WhatsApp', cu && cu.phone === '01000000001' && cu.source === 'whatsapp');
check('stock left freezer', E.setState(store.state) && E.available('it_FG-401', ['W4'], 1000) === 8000);
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: O('ORD-0001').id, action: 'approve' }] });
check('cannot approve twice', r.status === 400);
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: O('ORD-0001').id, action: 'paid' }] });
check('mark paid → receipt', r.status === 200 && O('ORD-0001').receiptNo && E.setState(store.state) && E.partnerBalance(cu.id) === 0, r.body.error);
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: wo.body.result && O('ORD-0002').id, action: 'reject', reason: 'مفيش توصيل للمنطقة دي' }] });
check('reject with reason', r.status === 200 && O('ORD-0002').status === 'rejected' && O('ORD-0002').reason);
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: O('ORD-0001').id, action: 'delete' }] });
check('real order cannot be deleted', r.status === 400);
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: O('TST-0001').id, action: 'delete' }] });
check('test order deleted with its alert', r.status === 200 && !O('TST-0001') && !store.state.alerts.some(a => a.ref && a.ref.no === 'TST-0001'));
// price changed between order and approval
await runShop({ E, db, action: 'order', body: { order: order({ phone: '01200000000' }) }, telegram });
E.setState(store.state); const it = JSON.parse(JSON.stringify(store.state.items.find(i => i.id === 'it_FG-401')));
await runOp({ E, db, profile: owner, op: 'saveItem', args: [{ ...it, priceRetail: 50000 }] });
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: O('ORD-0003').id, action: 'approve' }] });
check('price change: sales blocked', r.status === 400 && r.body.error.includes('السعر اتغير'), r.body.error);
r = await runOp({ E, db, profile: owner, op: 'decideOrder', args: [{ id: O('ORD-0003').id, action: 'approve' }] });
check('price change: owner approves at order price', r.status === 200 && store.state.docs.invoices.at(-1).total === 97000, r.body.error);
E.setState(store.state);
check('books balanced', E.integrity().every(c => c.ok), JSON.stringify(E.integrity().filter(c => !c.ok)));
console.log(fails ? `\n${fails} ORDER CHECKS FAILED` : '\nALL ORDER CHECKS PASSED');
process.exit(fails ? 1 : 0);
