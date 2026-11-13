// Boom Meat ERP — WhatsApp order review: delivery fee in the invoice, delivery time, send, partial payments.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
let pass = 0, fail = 0; const out = [];
const ok = (claim, cond, detail = '') => { if (cond) pass++; else { fail++; out.push(`✗ ${claim}${detail !== '' ? ' — ' + JSON.stringify(detail) : ''}`); } };
const S = () => E.S, T = E.today();
const as = r => { S().currentUser = S().users.find(u => u.role === r).id; };
const tryOp = fn => { const snap = JSON.stringify(S()); try { return { ok: true, r: fn() }; } catch (e) { E.setState(JSON.parse(snap)); return { ok: false, msg: e.message }; } };
E.reset(); as('owner');
const p = S().items.find(i => i.cat === 'product' && E.available(i.id, E.whs('fg'), 1000) >= 5000);
const order = (method, phone) => { const r = E.placeOrder({ phone, name: 'عميل التوصيل', address: 'مدينة نصر، شارع ٩، عمارة ٤', method, lines: [{ productId: p.id, packSize: 1000, count: 2 }] }); return S().docs.orders.find(o => o.no === r.no); };
const ord = id => S().docs.orders.find(o => o.id === id);

/* the delivery fee is fixed (100 EGP) and part of the order from the start */
ok('catalog tells the bot the fixed fee', E.catalog('01099990000').deliveryFee === 100);
let o = order('cash', '01022223333');
ok('a new order carries the fixed fee', o.fee === 10000);
as('sales');
const rev0 = E.incomeStatement({ from: T, to: T });
ok('approve needs a delivery time', !tryOp(() => E.decideOrder({ id: o.id, action: 'approve', eta: { text: '' } })).ok);
E.decideOrder({ id: o.id, action: 'approve', deliveryFee: -100, eta: { text: 'خلال ساعتين' }, note: 'المندوب هيكلمك' }); // a typed fee is ignored
o = ord(o.id); const inv = S().docs.invoices.find(v => v.id === o.invoiceId);
ok('invoice total = order + fixed delivery', inv.total === o.total + 10000, { inv: inv.total, order: o.total });
ok('invoice net + VAT = total', inv.net + inv.vat === inv.total);
const rev1 = E.incomeStatement({ from: T, to: T });
ok('delivery income goes to its own account (4103)', rev1.delivery - rev0.delivery === inv.deliveryNet && inv.deliveryNet > 0, { delta: rev1.delivery - rev0.delivery, net: inv.deliveryNet });
ok('total revenue includes delivery', rev1.revenue - rev0.revenue === inv.net);
ok('delivery saved on the order', o.delivery.fee === 10000 && o.delivery.eta.text === 'خلال ساعتين' && o.delivery.note === 'المندوب هيكلمك');
ok('cash order is not paid on approval', !o.receiptNo && E.partnerBalance(o.customerId) >= inv.total);
E.decideOrder({ id: o.id, action: 'send' }); o = ord(o.id);
ok('send records who and when', !!o.sentAt && !!o.sentBy);
ok('cash: no invoice sent before collection', !o.invoiceSentAt);
E.decideOrder({ id: o.id, action: 'eta', eta: { text: 'بكرة الصبح' } }); o = ord(o.id);
ok('delivery time can change after approval', o.delivery.eta.text === 'بكرة الصبح' && o.log.some(l => /ميعاد التوصيل اتغير/.test(l.note || '')));
ok('changing the time keeps the note', o.delivery.note === 'المندوب هيكلمك');
E.decideOrder({ id: o.id, action: 'out' }); o = ord(o.id);
ok('«الأوردر خرج» is recorded', !!o.outAt && o.log.at(-1).action === 'out' && !o.receiptNo);
E.decideOrder({ id: o.id, action: 'delivered' }); o = ord(o.id);
ok('«الأوردر وصل» collects the cash once and closes the order', !!o.deliveredAt && !!o.receiptNo && (o.receipts || []).length === 1 && E.partnerBalance(o.customerId) === 0 && !!o.invoiceSentAt);
ok('the log shows paid then delivered', o.log.slice(-2).map(l => l.action).join() === 'paid,delivered');
ok('cannot deliver twice', !tryOp(() => E.decideOrder({ id: o.id, action: 'delivered' })).ok);
ok('cannot collect again', !tryOp(() => E.decideOrder({ id: o.id, action: 'paid' })).ok);

/* InstaPay: the customer transfers items + delivery at once → one collection, nothing left due */
as('owner'); let q = order('instapay', '01033334444');
q.proof = { path: 'orders/x/1.jpg', at: q.at, status: 'pending' };
as('sales');
ok('InstaPay without a confirmed transfer cannot go out', (() => { const id = order('instapay', '01077778888').id; return !tryOp(() => E.decideOrder({ id, action: 'out' })).ok && !tryOp(() => E.decideOrder({ id, action: 'delivered' })).ok; })());
as('owner'); E.decideOrder({ id: q.id, action: 'proofok' }); q = ord(q.id);
ok('«التحويل وصل» before review only confirms the transfer', q.status === 'pending' && q.proof.status === 'ok' && !q.invoiceNo);
as('sales'); E.decideOrder({ id: q.id, action: 'approve', eta: { text: 'خلال ساعة' } }); q = ord(q.id);
ok('approve collects the whole transfer: fully paid in one step', !!q.receiptNo && (q.receipts || []).length === 1 && E.partnerBalance(q.customerId) === 0, E.partnerBalance(q.customerId));
E.decideOrder({ id: q.id, action: 'send' }); q = ord(q.id);
ok('fully paid: send includes the invoice', !!q.sentAt && !!q.invoiceSentAt);
E.decideOrder({ id: q.id, action: 'out' }); E.decideOrder({ id: q.id, action: 'delivered' }); q = ord(q.id);
ok('paid InstaPay delivered without another receipt', !!q.deliveredAt && (q.receipts || []).length === 1);

/* InstaPay approved first, then the transfer is confirmed */
as('owner'); let w = order('instapay', '01044445555'); w.proof = { path: 'orders/y/1.jpg', at: w.at, status: 'pending' };
as('sales'); E.decideOrder({ id: w.id, action: 'approve', eta: { text: 'النهارده بالليل' } });
as('owner'); E.decideOrder({ id: w.id, action: 'proofok' }); w = ord(w.id);
ok('confirmed after approval → fully paid', !!w.receiptNo && E.partnerBalance(w.customerId) === 0);

/* an order placed before the fixed fee keeps the owner-typed fee */
as('owner'); let old = order('cash', '01066667777'); delete old.fee;
as('sales'); E.decideOrder({ id: old.id, action: 'approve', deliveryFee: 5000, eta: { text: 'خلال ساعة' } }); old = ord(old.id);
ok('older order: typed fee used', S().docs.invoices.find(v => v.id === old.invoiceId).total === old.total + 5000);

/* permissions + the books */
as('worker'); ok('a worker cannot approve', !tryOp(() => E.decideOrder({ id: order('cash', '01055556666').id, action: 'approve', eta: { text: 'خلال ساعة' } })).ok);
ok('a worker cannot send', !tryOp(() => E.decideOrder({ id: o.id, action: 'send' })).ok);
as('owner');
ok('books balanced', E.integrity().every(c => c.ok), E.integrity().filter(c => !c.ok).map(c => c.name));
ok('balance sheet balanced', E.balanceSheet({ asOf: T }).balanced);
console.log(`delivery checks: ${pass} passed, ${fail} failed`); out.forEach(l => console.log(l));
process.exit(fail ? 1 : 0);
