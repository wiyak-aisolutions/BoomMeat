// Boom Meat ERP — Nov 2026 pricing batch: customer price lists, selling any stock item, fixed-cost butchery cuts + «إعدام», average purchase cost.
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
const mfg = () => { const m = E.manufacturingAccount({ from: E.addDays(T, -40), to: T }); return JSON.stringify({ p: m.production, pp: m.producedPosted, c: m.cogs, cp: m.cogsPosted }); };

E.reset(); as('owner');
const cust = S().partners.find(p => p.type === 'customer' && p.terms === 'credit' && !(p.branches || []).length);
const prod = S().items.find(i => i.cat === 'product' && E.available(i.id, E.whs('fg'), 1000) >= 5000);

/* ---------- customer price list ---------- */
as('sales'); ok('sales cannot set a price list', !!refused(() => E.setCustomerPrices({ customerId: cust.id, prices: { [prod.id]: 30000 } })));
as('accountant'); E.setCustomerPrices({ customerId: cust.id, prices: { [prod.id]: 30000 } });
as('sales');
const v1 = E.invoice({ date: T, customerId: cust.id, lines: [{ productId: prod.id, packSize: 1000, count: 2 }], method: 'credit' });
ok('invoice uses the customer\'s own price', v1.lines[0].pricePerKg === 30000 && v1.total === 60000);
const v2 = E.invoice({ date: T, customerId: cust.id, lines: [{ productId: prod.id, packSize: 1000, count: 1, pricePerKg: 31000 }], method: 'credit' });
ok('still editable on the invoice', v2.lines[0].pricePerKg === 31000);
const other = S().partners.find(p => p.type === 'customer' && p.id !== cust.id && p.kind === cust.kind && !(p.branches || []).length);
ok('other customers keep the normal price', E.priceFor(prod, other) === (cust.kind === 'wholesale' ? prod.priceWholesale : prod.priceRetail));
ok('bad price refused', !!refused(() => { as('owner'); E.setCustomerPrices({ customerId: cust.id, prices: { [prod.id]: -5 } }); }));
as('owner'); const branchCust = E.savePartner({ type: 'customer', name: 'هيلثي فحص', kind: 'wholesale', terms: 'credit', branches: [{ name: 'فرع ١' }, { name: 'فرع ٢' }] });
E.setCustomerPrices({ customerId: branchCust.id, prices: { [prod.id]: 28000 } });
as('sales'); const vb = E.invoice({ date: T, customerId: branchCust.id, branchId: S().partners.find(p => p.id === branchCust.id).branches[1].id, lines: [{ productId: prod.id, packSize: 1000, count: 1 }], method: 'credit' });
ok('a customer with branches: every branch gets its price', vb.lines[0].pricePerKg === 28000 && vb.branchName === 'فرع ٢');

/* ---------- sell any stock item ---------- */
const meat = S().items.find(i => i.cat === 'meat' && !i.rework && i.priceRetail > 0 && E.available(i.id, [...E.whs('raw'), ...E.whs('receiving')]) > 20000);
const spice = S().items.find(i => i.cat === 'spice' && E.available(i.id, E.whs('raw')) > 5000);
const pk = S().items.find(i => i.cat === 'pack' && E.available(i.id, E.whs('pack')) > 50);
const m0 = E.available(meat.id, [...E.whs('raw'), ...E.whs('receiving')]);
const vr = E.invoice({ date: T, customerId: cust.id, lines: [{ productId: meat.id, count: 12500 }, { productId: spice.id, count: 2000, pricePerKg: 15000 }, { productId: pk.id, count: 40, pricePerKg: 300 }, { productId: prod.id, packSize: 1000, count: 1 }], method: 'credit' });
ok('raw meat sold by weight from the chiller', E.available(meat.id, [...E.whs('raw'), ...E.whs('receiving')]) === m0 - 12500 && vr.lines[0].raw && vr.lines[0].amount === E.mulDiv(12500, E.priceFor(meat, cust), 1000));
ok('spice by kg, packaging by piece', vr.lines[1].amount === 30000 && vr.lines[2].amount === 12000);
ok('books + manufacturing sound after selling stock items', sound(), JSON.stringify(E.integrity().filter(c => !c.ok)) + ' ' + mfg());
const noPrice = S().items.find(i => i.cat === 'spice' && !i.priceRetail && E.available(i.id, E.whs('raw')) > 1000);
if (noPrice) ok('an item with no sale price needs a price on the invoice', /سعر/.test(refused(() => E.invoice({ date: T, customerId: cust.id, lines: [{ productId: noPrice.id, count: 1000 }], method: 'credit' })) || ''));
ok('waste item is never sold', !!refused(() => E.invoice({ date: T, customerId: cust.id, lines: [{ productId: S().items.find(i => i.waste).id, count: 1000, pricePerKg: 1000 }], method: 'credit' })));
as('owner');
E.invoiceReturn({ invoiceId: vr.id, lines: [{ idx: 0, count: 2500 }, { idx: 2, count: 10 }], restock: true });
ok('return of raw by kg and packaging by piece goes back to stock', E.available(meat.id, [...E.whs('raw'), ...E.whs('receiving')]) === m0 - 10000 && sound(), mfg());
E.invoiceReturn({ invoiceId: vr.id, lines: [{ idx: 1, count: 500 }], restock: false });
ok('raw return as waste keeps the books sound', sound(), mfg());
const vp = E.invoice({ date: T, customerId: cust.id, lines: [{ productId: pk.id, count: 20, pricePerKg: 300 }], method: 'credit' });
E.invoicePrice({ invoiceId: vp.id, idx: 0, pricePerKg: 350 });
ok('price edit on a piece line: 20 pcs × 3.50', S().docs.invoices.find(x => x.id === vp.id).lines[0].amount === 7000 && sound());

/* ---------- butchery: fixed-cost cuts and «إعدام» ---------- */
as('owner');
const minced = S().items.find(i => i.cat === 'meat' && !i.rework && /مفروم/.test(i.name));
const bone = S().items.find(i => i.cat === 'byproduct' && !i.waste), waste = S().items.find(i => i.waste);
const cutA = S().items.find(i => i.cat === 'meat' && !i.rework && i.priceRetail > 0 && i.id !== minced.id);
E.saveItem({ ...E.item(minced.id), fixedCost: 35000 });
ok('owner sets a fixed cost per kg', E.item(minced.id).fixedCost === 35000);
as('storekeeper');
const po = E.purchase({ date: T, supplierId: S().partners.find(p => p.type === 'supplier').id, ref: 'FX', lines: [{ itemId: S().items.find(i => i.cat === 'carcass').id, qty: 300000, unitCost: 30000, expDate: E.addDays(T, 9) }] });
as('supervisor'); const r0 = E.openButchery({ date: T, lotId: po.lines[0].lotId, qty: 300000 });
E.butcheryPack({ id: r0.id, itemId: S().items.find(i => i.packFor === 500).id, qty: 10 });
E.butcheryOutput({ id: r0.id, itemId: minced.id, qty: 40000 }); E.butcheryOutput({ id: r0.id, itemId: cutA.id, qty: 150000 });
E.butcheryOutput({ id: r0.id, itemId: bone.id, qty: 60000 }); E.butcheryOutput({ id: r0.id, itemId: waste.id, qty: 30000 });
E.closeButchery({ id: r0.id, date: T });
const R = S().docs.butcheries.find(x => x.id === r0.id);
ok('minced carries exactly 350/kg', R.outputs[0].value === 40 * 35000);
ok('bone and «إعدام» carry 0', R.outputs[2].value === 0 && R.outputs[3].value === 0);
ok('the rest of the cost goes to the other cut', R.outputs[1].value === R.cost - 40 * 35000);
ok('«إعدام» makes no stock lot and counts as output', !R.outputs[3].lotCode && R.outKg === 280000 && R.loss === 20000);
ok('books sound after fixed-cost close', sound(), mfg());
as('owner'); E.reopenButchery({ id: r0.id, reason: 'فحص' });
ok('reopen works with an «إعدام» line', S().docs.butcheries.find(x => x.id === r0.id).status === 'open' && sound(), mfg());
E.saveItem({ ...E.item(minced.id), fixedCost: 9000000 });
ok('fixed cost bigger than the run is refused', /التكلفة الثابتة/.test(refused(() => { as('supervisor'); E.closeButchery({ id: r0.id, date: T }); }) || ''));

/* ---------- average purchase cost ---------- */
as('storekeeper');
const sup = S().partners.find(p => p.type === 'supplier' && (p.items || []).length);
const it = E.item(sup.items.find(id => E.item(id).unit === 'kg') || sup.items[0]);
const pA = E.purchase({ date: T, supplierId: sup.id, ref: 'AV1', lines: [{ itemId: it.id, qty: 10000, unitCost: 20000, expDate: E.addDays(T, 9) }] });
const pB = E.purchase({ date: T, supplierId: sup.id, ref: 'AV2', lines: [{ itemId: it.id, qty: 10000, unitCost: 30000, expDate: E.addDays(T, 9) }] });
const la = S().lots.find(l => l.id === pA.lines[0].lotId), lb = S().lots.find(l => l.id === pB.lines[0].lotId);
const unitA = E.mulDiv(la.value, 1000, la.qty), unitB = E.mulDiv(lb.value, 1000, lb.qty);
ok('two deliveries at 200 and 300 end up at the same average cost', Math.abs(unitA - unitB) <= 1, `${unitA} vs ${unitB}`);
ok('average sits between the two prices', unitA > 20000 && unitA < 30000);
ok('books sound after averaging', sound(), mfg());

/* ---------- WhatsApp: a known customer gets their own price in the catalog ---------- */
as('owner'); const phoneCust = S().partners.find(p => p.type === 'customer' && p.phone && !(p.branches || []).length && p.id !== cust.id);
E.setCustomerPrices({ customerId: phoneCust.id, prices: { [prod.id]: 33300 } });
ok('catalog shows the customer\'s price', E.catalog(phoneCust.phone).products.find(p => p.id === prod.id).pricePerKg === 333);

/* ---------- a cut with no sale price and no fixed cost can't close at cost 0 ---------- */
as('owner'); const noP = E.saveItem({ name: 'برسكت فحص بدون سعر', cat: 'meat', unit: 'kg', priceRetail: 0, priceWholesale: 0, minQty: 0, vat: 0 });
as('storekeeper'); const po2 = E.purchase({ date: T, supplierId: S().partners.find(p => p.type === 'supplier').id, ref: 'NP', lines: [{ itemId: S().items.find(i => i.cat === 'carcass').id, qty: 100000, unitCost: 30000, expDate: E.addDays(T, 9) }] });
as('supervisor'); const rn = E.openButchery({ date: T, lotId: po2.lines[0].lotId, qty: 100000 }); E.butcheryPack({ id: rn.id, itemId: S().items.find(i => i.packFor === 500).id, qty: 5 });
E.butcheryOutput({ id: rn.id, itemId: noP.id, qty: 20000 }); E.butcheryOutput({ id: rn.id, itemId: cutA.id, qty: 60000 });
const mm = refused(() => E.closeButchery({ id: rn.id, date: T })) || '';
ok('close refused naming the unpriced cut', mm.includes('برسكت فحص بدون سعر') && mm.includes('سعر بيع أو تكلفة ثابتة'), mm);
as('owner'); E.saveItem({ ...E.item(noP.id), fixedCost: 25000 }); as('supervisor'); E.closeButchery({ id: rn.id, date: T });
ok('with a fixed cost it closes and carries it', S().docs.butcheries.find(x => x.id === rn.id).outputs[0].value === 20 * 25000 && sound());

console.log(`pricing checks: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
