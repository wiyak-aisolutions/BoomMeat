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

/* cash order: review with a 50 EGP delivery fee */
let o = order('cash', '01022223333'); as('sales');
const rev0 = E.incomeStatement({ from: T, to: T });
ok('approve needs a delivery time', !tryOp(() => E.decideOrder({ id: o.id, action: 'approve', deliveryFee: 5000, eta: { text: '' } })).ok);
ok('a negative delivery fee is refused', !tryOp(() => E.decideOrder({ id: o.id, action: 'approve', deliveryFee: -100, eta: { text: 'خلال ساعة' } })).ok);
E.decideOrder({ id: o.id, action: 'approve', deliveryFee: 5000, eta: { text: 'خلال ساعتين' }, note: 'المندوب هيكلمك' });
o = ord(o.id); const inv = S().docs.invoices.find(v => v.id === o.invoiceId);
ok('invoice total = order + delivery fee', inv.total === o.total + 5000, { inv: inv.total, order: o.total });
ok('invoice net + VAT = total', inv.net + inv.vat === inv.total);
const rev1 = E.incomeStatement({ from: T, to: T });
ok('delivery income goes to its own account (4103)', rev1.delivery - rev0.delivery === inv.deliveryNet && inv.deliveryNet > 0, { delta: rev1.delivery - rev0.delivery, net: inv.deliveryNet });
ok('total revenue includes delivery', rev1.revenue - rev0.revenue === inv.net);
ok('delivery saved on the order', o.delivery.fee === 5000 && o.delivery.eta.text === 'خلال ساعتين' && o.delivery.note === 'المندوب هيكلمك');
ok('cash order is not paid on approval', !o.receiptNo && E.partnerBalance(o.customerId) >= inv.total);
E.decideOrder({ id: o.id, action: 'send' }); o = ord(o.id);
ok('send records who and when', !!o.sentAt && !!o.sentBy);
ok('cash: no invoice sent before collection', !o.invoiceSentAt);
E.decideOrder({ id: o.id, action: 'eta', eta: { text: 'بكرة الصبح' } }); o = ord(o.id);
ok('delivery time can change after approval', o.delivery.eta.text === 'بكرة الصبح' && o.log.some(l => /ميعاد التوصيل اتغير/.test(l.note || '')));
ok('changing the time keeps the note', o.delivery.note === 'المندوب هيكلمك');
E.decideOrder({ id: o.id, action: 'paid' }); o = ord(o.id);
ok('cash collected → fully paid, invoice marked sent', !!o.receiptNo && !!o.invoiceSentAt && E.partnerBalance(o.customerId) === 0, E.partnerBalance(o.customerId));
ok('cannot collect twice', !tryOp(() => E.decideOrder({ id: o.id, action: 'paid' })).ok);

/* InstaPay: transfer confirmed before review, then a delivery fee is added → the fee is due on delivery */
as('owner'); let q = order('instapay', '01033334444');
q.proof = { path: 'orders/x/1.jpg', at: q.at, status: 'pending' };
E.decideOrder({ id: q.id, action: 'proofok' }); q = ord(q.id);
ok('«التحويل وصل» before review only confirms the transfer', q.status === 'pending' && q.proof.status === 'ok' && !q.invoiceNo);
as('sales'); E.decideOrder({ id: q.id, action: 'approve', deliveryFee: 3000, eta: { text: 'خلال ساعة' } }); q = ord(q.id);
const qinv = S().docs.invoices.find(v => v.id === q.invoiceId);
ok('approve collects the transferred amount', q.paidAmount === q.total && (q.receipts || []).length === 1);
ok('the delivery fee stays due', !q.receiptNo && E.partnerBalance(q.customerId) === 3000, E.partnerBalance(q.customerId));
E.decideOrder({ id: q.id, action: 'send' }); q = ord(q.id);
ok('partly paid: send is a confirmation, not the invoice', !!q.sentAt && !q.invoiceSentAt);
E.decideOrder({ id: q.id, action: 'paid' }); q = ord(q.id);
ok('the remaining fee collected on delivery → fully paid', !!q.receiptNo && E.partnerBalance(q.customerId) === 0 && q.paidAmount === qinv.total);

/* InstaPay, no delivery fee, approved first, then the transfer is confirmed */
as('owner'); let w = order('instapay', '01044445555'); w.proof = { path: 'orders/y/1.jpg', at: w.at, status: 'pending' };
as('sales'); E.decideOrder({ id: w.id, action: 'approve', deliveryFee: 0, eta: { text: 'النهارده بالليل' } });
as('owner'); E.decideOrder({ id: w.id, action: 'proofok' }); w = ord(w.id);
ok('confirmed after approval → fully paid', !!w.receiptNo && E.partnerBalance(w.customerId) === 0);
as('sales'); E.decideOrder({ id: w.id, action: 'send' }); w = ord(w.id);
ok('fully paid: send includes the invoice', !!w.invoiceSentAt);

/* permissions + the books */
as('worker'); ok('a worker cannot approve', !tryOp(() => E.decideOrder({ id: order('cash', '01055556666').id, action: 'approve', eta: { text: 'خلال ساعة' } })).ok);
ok('a worker cannot send', !tryOp(() => E.decideOrder({ id: o.id, action: 'send' })).ok);
as('owner');
ok('books balanced', E.integrity().every(c => c.ok), E.integrity().filter(c => !c.ok).map(c => c.name));
ok('balance sheet balanced', E.balanceSheet({ asOf: T }).balanced);
console.log(`delivery checks: ${pass} passed, ${fail} failed`); out.forEach(l => console.log(l));
process.exit(fail ? 1 : 0);
