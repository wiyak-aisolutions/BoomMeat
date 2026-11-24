// Boom Meat ERP — v101: a raw cut (صره) everywhere + closing a batch with the bags the client really buys.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
let pass = 0, fail = 0;
const ok = (c, cond, d = '') => { if (cond) pass++; else { fail++; console.log('✗ ' + c + (d ? ' — ' + d : '')); } };
const S = () => E.S, T = E.today();
const as = r => { S().currentUser = S().users.find(u => u.role === r).id; };
const refused = fn => { const snap = JSON.stringify(S()); try { fn(); return null; } catch (e) { E.setState(JSON.parse(snap)); return e.message; } };
const sound = () => E.integrity().every(c => c.ok) && E.manufacturingAccount({ from: E.addDays(T, -40), to: T }).check;
const avAll = id => E.available(id, E.warehouses().map(w => w.id));

E.reset(); as('owner');
const sup = S().partners.find(p => p.type === 'supplier');
const sorra = E.saveItem({ name: 'صره فحص', cat: 'meat', unit: 'kg', priceRetail: 34000, priceWholesale: 32000 });
const bag = E.saveItem({ name: 'اكياس فاكيوم فحص 25*35', cat: 'pack', unit: 'pc', priceRetail: 1 });
if (sup.items && sup.items.length) sup.items.push(sorra.id, bag.id);
as('storekeeper'); E.purchase({ date: T, supplierId: sup.id, ref: 'S1', lines: [{ itemId: sorra.id, qty: 80000, unitCost: 26000, expDate: E.addDays(T, 9) }, { itemId: bag.id, qty: 1000, unitCost: 900, expDate: E.addDays(T, 400) }] });

/* sale screen / invoice by weight + customer price list */
as('owner'); const cust = S().partners.find(p => p.type === 'customer' && !(p.branches || []).length);
E.setCustomerPrices({ customerId: cust.id, prices: { [sorra.id]: 31000 } });
as('sales'); const v = E.invoice({ date: T, customerId: cust.id, method: 'credit', lines: [{ productId: sorra.id, packSize: 1, count: 5500 }] });
ok('invoice: صره by weight at the customer price', v.lines[0].raw && v.lines[0].pricePerKg === 31000 && v.lines[0].amount === 170500 && sound());
as('owner'); E.invoicePrice({ invoiceId: v.id, idx: 0, pricePerKg: 30000, reason: 'فحص' });
ok('price edit on the raw line', S().docs.invoices.find(x => x.id === v.id).lines[0].pricePerKg === 30000 && sound());
const a0 = avAll(sorra.id); E.invoiceReturn({ invoiceId: v.id, lines: [{ idx: 0, count: 1500 }], restock: true, reason: 'فحص' });
ok('return puts صره back', avAll(sorra.id) === a0 + 1500 && sound());

/* bot catalog + order by weight → invoice */
const cr = E.catalog('01011112222').raw.find(r => r.id === sorra.id);
ok('catalog: صره by weight with stock', cr && cr.unit === 'kg' && cr.stock === avAll(sorra.id) / 1000 && cr.pricePerKg === 340, JSON.stringify(cr));
ok('catalog: no packaging', !E.catalog('01011112222').raw.some(r => E.item(r.id).cat === 'pack'));
const o = E.placeOrder({ phone: '01011112222', name: 'فحص صره', address: 'شارع الفحص ١٢، القاهرة', method: 'cash', lines: [{ productId: sorra.id, grams: 2000 }] });
ok('order: grams and reservation', o.lines[0].raw && o.lines[0].grams === 2000 && E.catalog('01011112222').raw.find(r => r.id === sorra.id).stock === cr.stock - 2);
ok('order: under ¼ kg refused', !!refused(() => E.placeOrder({ phone: '01011113333', name: 'فحص', address: 'شارع الفحص ١٢، القاهرة', method: 'cash', lines: [{ productId: sorra.id, grams: 100 }] })));
ok('order: bags are not orderable', !!refused(() => E.placeOrder({ phone: '01011113333', name: 'فحص', address: 'شارع الفحص ١٢، القاهرة', method: 'cash', lines: [{ productId: bag.id, grams: 1000 }] })));
as('owner'); E.decideOrder({ id: o.id, action: 'approve' });
const oi = S().docs.invoices.find(x => x.id === S().docs.orders.find(y => y.id === o.id).invoiceId);
ok('approved order: invoice with the صره line', oi && oi.lines[0].raw && oi.lines[0].count === 2000 && sound());

/* butchery input + output, batch issue */
as('supervisor'); const lot = S().lots.filter(l => l.itemId === sorra.id && l.qty > 0).sort((a, c) => c.qty - a.qty)[0];
const r = E.openButchery({ date: T, lotId: lot.id, qty: 20000 });
E.butcheryPack({ id: r.id, itemId: bag.id, qty: 30 });
E.butcheryOutput({ id: r.id, itemId: sorra.id, qty: 18000 }); E.closeButchery({ id: r.id, date: T });
ok('butchery: صره in and out, bags from receiving', S().docs.butcheries.find(x => x.id === r.id).status === 'closed' && E.available(bag.id, E.packStores()) === 970 && sound());
const prod = S().items.find(i => i.cat === 'product' && E.packsOf(i).includes(500));
const b = E.createBatch({ date: T, productId: prod.id, planned: 10000 });
E.issue({ batchId: b.id, itemId: sorra.id, qty: 6000, date: T });
ok('batch issue: صره', b.issues.some(i => i.itemId === sorra.id) && sound());

/* closing a batch: picked bag, empty linked bag, linking a bought bag to a size */
E.closeBatch({ batchId: b.id, date: T, packs: { 500: 10 }, bags: { 500: bag.id }, sticker: '' });
const bc = S().docs.batches.find(x => x.id === b.id);
ok('close with the picked bag', bc.issues.some(i => i.itemId === bag.id && i.qty === 10 && i.note === 'تعبئة تلقائية') && bc.noPack.includes('استيكر') && sound());
ok('picked bag short → refused', !!refused(() => { const b2 = E.createBatch({ date: T, productId: prod.id, planned: 10000 }); E.issue({ batchId: b2.id, itemId: sorra.id, qty: 6000, date: T }); E.closeBatch({ batchId: b2.id, date: T, packs: { 500: 10 }, bags: { 500: S().items.find(i => i.cat === 'pack' && !avAll(i.id)).id } }); }));
const sys = S().items.find(i => i.packFor === 500); S().lots.filter(l => l.itemId === sys.id).forEach(l => { l.qty = 0; l.value = 0; });
// keep the books matching after zeroing those lots in this test: post nothing, just compare stock checks on other lines below
const b3 = E.createBatch({ date: T, productId: prod.id, planned: 10000 }); E.issue({ batchId: b3.id, itemId: sorra.id, qty: 6000, date: T });
const why = refused(() => E.closeBatch({ batchId: b3.id, date: T, packs: { 500: 10 } }));
ok('linked bag empty, nothing picked → closes, flagged', !why && (S().docs.batches.find(x => x.id === b3.id).noPack || []).some(x => x.includes('كيس')), why || '');
as('owner'); E.saveItem({ ...E.item(bag.id), packFor: 500 });
ok('link a bought bag to ½ kg (old one unlinked)', E.item(bag.id).packFor === 500 && !E.item(sys.id).packFor && S().items.filter(i => i.packFor === 500).length === 1);
E.saveItem({ ...E.item(bag.id), packFor: 0 });
ok('unlink', !E.item(bag.id).packFor);
E.saveItem({ ...E.item(bag.id), sticker: true });
ok('one sticker item', S().items.filter(i => i.sticker).length === 1 && E.item(bag.id).sticker);
as('owner'); E.reopenBatch({ batchId: b3.id, reason: 'فحص' });
ok('reopen clears the flag', !S().docs.batches.find(x => x.id === b3.id).noPack);

console.log(`sorra checks: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
