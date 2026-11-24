// Paymob card orders: pay link stored on the order, verified callback → prepaid (pending) or receipt (approved), duplicates and mismatches.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const require = createRequire(import.meta.url);
globalThis.localStorage = undefined;
require(dir + '/engine.js');
const E = globalThis.ERP;
const { runOp, runShop } = await import(dir + '/supabase/functions/_shared/core.mjs');
const store = { version: 0, state: JSON.parse(JSON.stringify(E.liveState({ id: 'owner-1', username: 'owner', name: 'المالك' }))) };
const db = {
  async load() { return { version: store.version, state: JSON.parse(JSON.stringify(store.state)) }; },
  async save(st, base) { if (base !== store.version) return null; store.state = JSON.parse(JSON.stringify(st)); store.version++; return store.version; },
  async log() {}, async snapshot() {},
};
const P = r => ({ user_id: r + '-1', username: r, name: r, role: r, active: true });
const owner = P('owner'), sales = P('sales');
const tg = []; const telegram = async (chat, text) => { tg.push(text); return { ok: true }; };
let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'OK  ' : 'FAIL') + ' ' + name, cond ? '' : extra); if (!cond) fails++; };
const T = E.today();
await runOp({ E, db, profile: owner, op: 'updateSettings', args: [{ issueLimitKg: 100, vatRate: 14, telegram: true, tgChat: '123', company: {} }] });
await runOp({ E, db, profile: owner, op: 'openingBalances', args: [{ date: T, cash: 100000, stock: [
  { itemId: 'it_FG-401', qty: 10000, packSize: 1000, unitCost: 30000, expDate: E.addDays(T, 60), wh: 'W4' }] }] });
const order = (o = {}) => ({ phone: '01900000001', name: 'تجربة فيزا', address: 'عنوان تجربة طويل', method: 'card', lines: [{ productId: 'it_FG-401', packSize: 1000, count: 2 }], ...o });
const O = id => store.state.docs.orders.find(o => o.id === id);
const bal = acc => store.state.journal.reduce((s, j) => s + j.lines.filter(l => l.acc === acc).reduce((a, l) => a + l.dr - l.cr, 0), 0);

// 1) pending order paid by card, then approved
let r = await runShop({ E, db, action: 'order', body: { order: order() }, telegram });
check('card order placed', r.status === 200 && r.body.result.method === 'card' && r.body.result.total === 1070, JSON.stringify(r.body));
const a = r.body.result.id;
r = await runShop({ E, db, action: 'payLink', body: { link: { id: a, url: 'https://accept.paymob.com/unifiedcheckout/?x', intentionId: 'pi_1', paymobOrderId: '9001', ref: a + '-AB12C', amountCents: 107000 } } });
check('pay link stored', r.status === 200 && O(a).pay.paymobOrderId === '9001', JSON.stringify(r.body));
r = await runShop({ E, db, action: 'payLink', body: { link: { id: a, url: 'u', paymobOrderId: '9002', amountCents: 100 } } });
check('pay link with wrong amount refused', r.status === 400, JSON.stringify(r.body));
r = await runShop({ E, db, action: 'cardPaid', body: { card: { paymobOrderId: '9001', ref: a + '-AB12C', txId: '555', amountCents: 107000, pan: '2346' } }, telegram });
check('callback on pending → prepaid, notify proofok', r.status === 200 && r.body.result.notify === 'proofok' && O(a).card.status === 'paid' && !O(a).receiptNo, JSON.stringify(r.body));
check('owner told on telegram', tg.some(t => t.includes('دفع فيزا وصل') && t.includes('555')), tg.join('|'));
r = await runShop({ E, db, action: 'cardPaid', body: { card: { paymobOrderId: '9001', txId: '555', amountCents: 107000 } }, telegram });
check('duplicate callback ignored', r.status === 200 && r.body.result.problem === 'duplicate' && r.body.result.notify === null, JSON.stringify(r.body));
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: a, action: 'approve' }] });
check('approve collects the card money into 1104', r.status === 200 && O(a).receiptNo && bal('1104') === 107000, JSON.stringify(r.body) + bal('1104'));
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: a, action: 'out' }] });
check('paid card order can go out', r.status === 200, JSON.stringify(r.body));

// 2) approved first, then paid by card → receipt at once, notify paid
r = await runShop({ E, db, action: 'order', body: { order: order({ lines: [{ productId: 'it_FG-401', packSize: 1000, count: 1 }] }) }, telegram });
const b = r.body.result.id;
await runShop({ E, db, action: 'payLink', body: { link: { id: b, url: 'u', paymobOrderId: '9100', ref: b + '-ZZ', amountCents: 58500 } } });
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: b, action: 'out' }] });
check('unpaid card order cannot go out', r.status === 400, JSON.stringify(r.body));
await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: b, action: 'approve' }] });
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: b, action: 'out' }] });
check('approved but unpaid card order cannot go out', r.status === 400, JSON.stringify(r.body));
r = await runShop({ E, db, action: 'cardPaid', body: { card: { paymobOrderId: '9100', txId: '777', amountCents: 58500 } }, telegram });
check('callback on approved → receipt, notify paid', r.status === 200 && r.body.result.notify === 'paid' && O(b).receiptNo && O(b).paidBy === 'paymob' && bal('1104') === 165500, JSON.stringify(r.body) + bal('1104'));

// 3) wrong amount / unknown order: alert only, no money booked
r = await runShop({ E, db, action: 'order', body: { order: order({ lines: [{ productId: 'it_FG-401', packSize: 1000, count: 1 }] }) }, telegram });
const c = r.body.result.id;
await runShop({ E, db, action: 'payLink', body: { link: { id: c, url: 'u', paymobOrderId: '9200', amountCents: 58500 } } });
r = await runShop({ E, db, action: 'cardPaid', body: { card: { paymobOrderId: '9200', txId: '888', amountCents: 100 } }, telegram });
check('wrong amount → review alert, not paid', r.status === 200 && r.body.result.problem === 'mismatch' && !O(c).card && tg.some(t => t.includes('محتاج مراجعة')), JSON.stringify(r.body));
r = await runShop({ E, db, action: 'cardPaid', body: { card: { paymobOrderId: '424242', ref: 'OR-nope-AA', txId: '999', amountCents: 100 } }, telegram });
check('unknown order → alert', r.status === 200 && r.body.result.problem === 'no_order' && tg.some(t => t.includes('طلب مش معروف')), JSON.stringify(r.body));
r = await runOp({ E, db, profile: sales, op: 'decideOrder', args: [{ id: c, action: 'paid' }] });
check('manual paid on pending card order refused', r.status === 400, JSON.stringify(r.body));
check('orderView shows cardPaid', E.setState(store.state) || (E.orderView(a).cardPaid === true && E.orderView(c).cardPaid === false));
check('books balanced', (() => { const r2 = E.trialBalance ? null : null; return store.state.journal.every(j => j.lines.reduce((s, l) => s + l.dr - l.cr, 0) === 0); })());

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
