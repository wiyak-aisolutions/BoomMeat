// Boom Meat ERP — Nov 2026 batch 2: owner edits, change requests (app/Telegram), sales returns, receiving edits, open butchery, per-person screens.
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

E.reset(); as('owner');
const cust = S().partners.find(p => p.type === 'customer' && p.terms === 'credit' && !(p.branches || []).length);
const cashCust = S().partners.find(p => p.type === 'customer' && p.terms !== 'credit' && !(p.branches || []).length);
const prod = S().items.find(i => i.cat === 'product' && E.available(i.id, E.whs('fg'), 1000) >= 5000);

/* ---------- sales returns ---------- */
as('sales');
const v0 = E.invoice({ date: T, customerId: cust.id, lines: [{ productId: prod.id, packSize: 1000, count: 4 }], method: 'credit' });
const V = () => S().docs.invoices.find(x => x.id === v0.id);
const bal0 = E.partnerBalance(cust.id), fg0 = E.available(prod.id, E.whs('fg'), 1000);
const req = E.invoiceReturn({ invoiceId: v0.id, lines: [{ idx: 0, count: 1 }], restock: true, reason: 'العميل رجّع كرتونة' });
ok('sales return becomes a request', req.requested && S().docs.changes.at(-1).status === 'pending' && E.partnerBalance(cust.id) === bal0);
ok('request alert carries Telegram buttons', JSON.stringify(S().alerts.at(-1).kb) === JSON.stringify([['✅ موافقة', 'chg:ok:' + S().docs.changes.at(-1).id], ['❌ رفض', 'chg:no:' + S().docs.changes.at(-1).id]]));
ok('request needs a reason', /سبب/.test(refused(() => E.invoiceReturn({ invoiceId: v0.id, lines: [{ idx: 0, count: 1 }] })) || ''));
ok('impossible request is refused up front', !!refused(() => E.invoiceReturn({ invoiceId: v0.id, lines: [{ idx: 0, count: 9 }], reason: 'كتير' })));
as('accountant'); ok('only the owner decides', !!refused(() => E.decideChange(S().docs.changes.at(-1).id, true)));
as('owner'); E.decideChange(S().docs.changes.at(-1).id, true);
ok('approved return: stock back, balance down', E.available(prod.id, E.whs('fg'), 1000) === fg0 + 1000 && E.partnerBalance(cust.id) === bal0 - V().total / 4 && V().lines[0].returned === 1);
ok('books sound after return', sound(), JSON.stringify(E.integrity().filter(c => !c.ok)));
E.invoiceReturn({ invoiceId: v0.id, lines: [{ idx: 0, count: 1 }], restock: false });
ok('owner return as waste: no stock back', E.available(prod.id, E.whs('fg'), 1000) === fg0 + 1000 && sound());
E.invoiceReturn({ invoiceId: v0.id, lines: [{ idx: 0, count: 2 }], restock: true });
ok('full return clears the invoice exactly', E.invoiceReturned(V()) === V().total && E.partnerBalance(cust.id) === bal0 - V().total && sound());
ok('nothing left to return', !!refused(() => E.invoiceReturn({ invoiceId: v0.id, lines: [{ idx: 0, count: 1 }] })));
const v1 = E.invoice({ date: T, customerId: cashCust.id, lines: [{ productId: prod.id, packSize: 1000, count: 2 }], method: 'cash' });
const sub0 = E.cashBalance('1101');
E.invoiceReturn({ invoiceId: v1.id, lines: [{ idx: 0, count: 1 }], restock: true, refund: 'cash' });
ok('refund from the cash box when chosen', E.cashBalance('1101') === sub0 - v1.total / 2 && E.partnerBalance(cashCust.id) === 0 && sound());
const v2 = E.invoice({ date: T, customerId: cust.id, lines: [{ productId: prod.id, packSize: 1000, count: 2 }], method: 'credit' });
E.invoiceReturn({ invoiceId: v2.id, lines: [{ idx: 0, count: 1 }], restock: true });
ok('collect is capped by returns', /المتبقي/.test(refused(() => E.receipt({ date: T, customerId: cust.id, amount: v2.total, method: 'cash', invoiceId: v2.id })) || ''));

/* ---------- invoice price edit ---------- */
const v3 = E.invoice({ date: T, customerId: cust.id, lines: [{ productId: prod.id, packSize: 1000, count: 2 }], method: 'credit' });
const b3 = E.partnerBalance(cust.id), t3 = v3.total;
E.invoicePrice({ invoiceId: v3.id, idx: 0, pricePerKg: v3.lines[0].pricePerKg + 2000 });
ok('owner raises a price: customer owes more', E.partnerBalance(cust.id) === b3 + 4000 && S().docs.invoices.find(x => x.id === v3.id).total === t3 + 4000 && sound());
as('sales'); const r3 = E.invoicePrice({ invoiceId: v3.id, idx: 0, pricePerKg: 30000, reason: 'سعر متفق عليه' });
ok('sales price edit is a request', r3.requested);
as('owner'); E.decideChange(S().docs.changes.at(-1).id, false);
ok('rejected request changes nothing', S().docs.changes.at(-1).status === 'rejected' && E.partnerBalance(cust.id) === b3 + 4000);

/* ---------- receiving edit (20 kg booked, 19 found) ---------- */
as('storekeeper');
const sup = S().partners.find(p => p.type === 'supplier' && (p.items || []).length);
const raw = E.item(sup.items[0]);
const po = E.purchase({ date: T, supplierId: sup.id, ref: 'E1', lines: [{ itemId: raw.id, qty: raw.unit === 'kg' ? 20000 : 20, unitCost: 10000, expDate: E.addDays(T, 9) }] });
const supBal = E.partnerBalance(sup.id), q19 = raw.unit === 'kg' ? 19000 : 19;
const r4 = E.editPurchaseLine({ purchaseId: po.id, line: 0, qty: q19, reason: 'الوزن الصح ١٩' });
ok('storekeeper edit → request', r4.requested && S().lots.find(l => l.id === po.lines[0].lotId).qty === (raw.unit === 'kg' ? 20000 : 20));
as('owner'); E.decideChange(S().docs.changes.at(-1).id, true);
const P = () => S().docs.purchases.find(x => x.id === po.id);
ok('approved: lot, invoice and supplier follow', S().lots.find(l => l.id === po.lines[0].lotId).qty === q19 && P().total === 190000 && E.partnerBalance(sup.id) === supBal - 10000 && P().edits.length === 1);
ok('books sound after receiving edit', sound(), JSON.stringify(E.integrity().filter(c => !c.ok)) + ' mfg ' + E.manufacturingAccount({ from: E.addDays(T, -40), to: T }).check);
E.editPurchaseLine({ purchaseId: po.id, line: 0, unitCost: 11000 });
ok('owner price fix on receiving', P().total === mulDivSafe(q19, 11000, raw.unit === 'kg' ? 1000 : 1) && sound());
function mulDivSafe(a, b, c) { return Math.round(a * b / c); }

/* ---------- owner correction applies at once ---------- */
as('supervisor');
const B = E.createBatch({ date: T, productId: prod.id, planned: 10000 });
const meat = S().items.find(i => i.cat === 'meat' && !i.rework && E.available(i.id, E.whs('raw')) > 20000);
as('worker'); const ln = E.issue({ batchId: B.id, itemId: meat.id, qty: 10000, date: T });
as('owner'); const cr = E.requestCorrection({ batchId: B.id, issueId: ln.id, newQty: 9000, reason: 'الميزان' });
ok('owner correction applies directly', cr.status === 'approved' && E.issuedOf(S().docs.batches.find(b => b.id === B.id), meat.id) === 9000 && sound());
as('worker'); const ln2 = S().docs.batches.find(b => b.id === B.id).issues.find(i => !i.reversed);
const cr2 = E.requestCorrection({ batchId: B.id, issueId: ln2.id, newQty: 8500, reason: 'غلط' });
ok('worker correction waits, with buttons', cr2.status === 'pending' && S().alerts.at(-1).kb[0][1] === 'cor:ok:' + cr2.id);

/* ---------- a manufactured product made without spices closes normally ---------- */
as('supervisor');
const made2 = S().items.find(i => i.cat === 'product' && i.group === 'مصنعات');
const NB = E.createBatch({ date: T, productId: made2.id, planned: 5000 });
const meat2 = S().items.find(i => i.cat === 'meat' && !i.rework && E.available(i.id, E.whs('raw')) > 6000);
as('worker'); E.issue({ batchId: NB.id, itemId: meat2.id, qty: 5000, date: T }); E.finishMeat({ batchId: NB.id, noSpice: true });
as('supervisor'); E.closeBatch({ batchId: NB.id, date: T, packs: { 500: 9 } });
const NBx = S().docs.batches.find(b => b.id === NB.id);
ok('batch without spices: handed over, marked, closed', NBx.status === 'closed' && NBx.noSpice === true && NBx.output === 4500 && sound());

/* ---------- open butchery ---------- */
as('supervisor');
const rawLot = S().lots.find(l => E.item(l.itemId).cat === 'meat' && !E.item(l.itemId).rework && l.qty > 30000 && E.whUse(l.wh) === 'raw');
const run0 = E.openButchery({ date: T, lotId: rawLot.id, qty: 30000, note: 'صرة بالعضم' });
const R = () => S().docs.butcheries.find(x => x.id === run0.id);
ok('butchery takes a raw (non-calf) item', R().inputs[0].qty === 30000 && sound());
const cut = S().items.find(i => i.cat === 'product' && i.group === 'قطعيات');
const made = S().items.find(i => i.cat === 'product' && i.group === 'مصنعات');
ok('manufactured products refused as output', /المصنّعات/.test(refused(() => E.butcheryOutput({ id: run0.id, itemId: made.id, count: 2, packSize: 1000 })) || ''));
ok('ready product needs count × pack', /العدد/.test(refused(() => E.butcheryOutput({ id: run0.id, itemId: cut.id, qty: 5000 })) || ''));
const o1 = E.butcheryOutput({ id: run0.id, itemId: cut.id, count: 10, packSize: 1000 });
const bone = S().items.find(i => i.cat === 'byproduct');
const o2 = E.butcheryOutput({ id: run0.id, itemId: bone.id, qty: 8000 });
E.butcheryEditOutput({ id: run0.id, lineId: o2.id, qty: 9000 });
ok('edit an output line', R().outputs.find(o => o.id === o2.id).qty === 9000);
ok('edit cannot exceed input', !!refused(() => E.butcheryEditOutput({ id: run0.id, lineId: o2.id, qty: 25000 })));
const lot2 = S().lots.find(l => E.item(l.itemId).cat === 'meat' && !E.item(l.itemId).rework && l.qty > 5000 && l.id !== rawLot.id && E.whUse(l.wh) === 'raw');
E.butcheryInput({ id: run0.id, lotId: lot2.id, qty: 5000 }); const q2 = S().lots.find(l => l.id === lot2.id).qty;
E.butcheryDropInput({ id: run0.id, inputId: R().inputs[1].id });
ok('drop a wrong input: stock back', S().lots.find(l => l.id === lot2.id).qty === q2 + 5000 && R().inputs.length === 1 && sound());
const bag = S().items.find(i => i.cat === 'pack' && i.packFor === 1000), bag0 = E.available(bag.id, E.whs('pack'));
E.butcheryPack({ id: run0.id, itemId: bag.id, qty: 10 }); E.butcheryDropPack({ id: run0.id, packId: R().packs[0].id });
ok('drop a bags line: bags back', E.available(bag.id, E.whs('pack')) === bag0 && sound());
const fgBefore = E.available(cut.id, E.whs('fg'), 1000);
ok('close refused without bags', /الأكياس/.test(refused(() => E.closeButchery({ id: run0.id, date: T })) || ''));
E.butcheryPack({ id: run0.id, itemId: bag.id, qty: 12 });
E.closeButchery({ id: run0.id, date: T });
ok('ready product lands in the freezer as packs', E.available(cut.id, E.whs('fg'), 1000) === fgBefore + 10000 && R().loss === 30000 - 19000);
ok('books + manufacturing sound after butchery with products', sound(), JSON.stringify(E.integrity().filter(c => !c.ok)) + ' mfg ' + JSON.stringify((({ production, producedPosted, cogs, cogsPosted }) => ({ production, producedPosted, cogs, cogsPosted }))(E.manufacturingAccount({ from: E.addDays(T, -40), to: T }))));

/* ---------- butchery: edit input weight, owner cancels, bags cost on its own ---------- */
as('storekeeper');
const calfPo2 = E.purchase({ date: T, supplierId: S().partners.find(p => p.type === 'supplier').id, ref: 'B2', lines: [{ itemId: S().items.find(i => i.cat === 'carcass').id, qty: 400000, unitCost: 30000, expDate: E.addDays(T, 9) }] });
const lotC = calfPo2.lines[0].lotId, LC = () => S().lots.find(l => l.id === lotC);
as('supervisor'); const rb = E.openButchery({ date: T, lotId: lotC, qty: 290000 });
const RB = () => S().docs.butcheries.find(x => x.id === rb.id), inId = rb.inputs[0].id;
const req2 = E.butcheryEditInput({ id: rb.id, inputId: inId, qty: 280000, reason: 'الميزان كان غلط' });
ok('supervisor weight edit → owner request', req2.requested && RB().inputs[0].qty === 290000);
as('owner'); E.decideChange(S().docs.changes.at(-1).id, true);
ok('approved: run 280 kg, 10 kg back in stock', RB().inputs[0].qty === 280000 && LC().qty === 120000 && sound());
E.butcheryEditInput({ id: rb.id, inputId: inId, qty: 300000 });
ok('owner raises the weight directly', RB().inputs[0].qty === 300000 && LC().qty === 100000 && E.butCost(RB()) === RB().inputs[0].value && sound());
E.butcheryPack({ id: rb.id, itemId: bag.id, qty: 20 });
const bagCost = RB().packs.reduce((a, p) => a + p.value, 0);
ok('bags cost on its own, added to the run', bagCost > 0 && E.butCost(RB()) === RB().inputs[0].value + bagCost);
const bag500b = E.available(bag.id, E.whs('pack'));
E.cancelButchery({ id: rb.id, reason: 'اتسجلت غلط' });
ok('owner cancels an open run: calf and bags back', RB().status === 'cancelled' && LC().qty === 400000 && E.available(bag.id, E.whs('pack')) === bag500b + 20 && sound());
ok('cancel needs a reason', !!refused(() => E.cancelButchery({ id: rb.id, reason: '' })));
as('supervisor'); const rc = E.openButchery({ date: T, lotId: lotC, qty: 200000 }); E.butcheryPack({ id: rc.id, itemId: bag.id, qty: 10 });
const cutR = S().items.find(i => i.cat === 'meat' && i.priceRetail > 0 && !i.rework);
E.butcheryOutput({ id: rc.id, itemId: cutR.id, qty: 150000 }); E.butcheryOutput({ id: rc.id, itemId: cut.id, count: 5, packSize: 1000 });
E.closeButchery({ id: rc.id, date: T });
ok('supervisor cannot cancel', !!refused(() => E.cancelButchery({ id: rc.id, reason: 'غلط' })));
as('owner'); E.cancelButchery({ id: rc.id, reason: 'اتقفلت بالغلط' });
const RC = S().docs.butcheries.find(x => x.id === rc.id);
ok('owner cancels a closed run with untouched output: all back, output gone', RC.status === 'cancelled' && LC().qty === 400000 && RC.outputs.every(o => S().lots.find(l => l.code === o.lotCode).qty === 0) && sound(), JSON.stringify(E.integrity().filter(c => !c.ok)) + ' mfg ' + E.manufacturingAccount({ from: E.addDays(T, -40), to: T }).check);
as('supervisor'); const rd = E.openButchery({ date: T, lotId: lotC, qty: 100000 }); E.butcheryPack({ id: rd.id, itemId: bag.id, qty: 5 });
E.butcheryOutput({ id: rd.id, itemId: cutR.id, qty: 80000 }); E.closeButchery({ id: rd.id, date: T });
const outLot = S().lots.find(l => l.code === S().docs.butcheries.find(x => x.id === rd.id).outputs[0].lotCode);
as('storekeeper'); E.transfer({ date: T, lotId: outLot.id, qty: 1000, toWh: E.whs('raw').find(w => w !== outLot.wh) || E.whs('receiving')[0] });
as('owner'); ok('cannot cancel once its output was used', /مينفعش التشغيلة تتلغي/.test(refused(() => E.cancelButchery({ id: rd.id, reason: 'غلط' })) || ''));
as('owner'); const msg = refused(() => E.reopenButchery({ id: rd.id, reason: 'وزن غلط' }));
ok('reopen refused with a clear reason when a cut moved', /اتنقل منها/.test(msg || '') && /مينفعش التشغيلة تتفتح/.test(msg || ''), msg);
// reopen → edit → close again
as('supervisor'); const re = E.openButchery({ date: T, lotId: lotC, qty: 50000 }); E.butcheryPack({ id: re.id, itemId: bag.id, qty: 4 });
const reOut = E.butcheryOutput({ id: re.id, itemId: cutR.id, qty: 40000 }); E.butcheryOutput({ id: re.id, itemId: cut.id, count: 3, packSize: 1000 }); E.closeButchery({ id: re.id, date: T });
const RE = () => S().docs.butcheries.find(x => x.id === re.id), oldLot = RE().outputs[0].lotCode;
as('supervisor'); ok('supervisor cannot reopen', !!refused(() => E.reopenButchery({ id: re.id, reason: 'فتح' })));
as('owner'); E.reopenButchery({ id: re.id, reason: 'وزن القطعية غلط' });
ok('reopened: status open, cut lots out of stock, books sound', RE().status === 'open' && S().lots.find(l => l.code === oldLot).qty === 0 && sound(), JSON.stringify(E.integrity().filter(c => !c.ok)) + ' mfg ' + E.manufacturingAccount({ from: E.addDays(T, -40), to: T }).check);
as('supervisor'); E.butcheryEditOutput({ id: re.id, lineId: reOut.id, qty: 42000 }); E.closeButchery({ id: re.id, date: T });
ok('edited and closed again: books sound', RE().status === 'closed' && RE().outputs[0].qty === 42000 && RE().reopens.length === 1 && sound());
// a sold cut blocks reopen with the invoice number
const fgCut = S().lots.find(l => l.code === RE().outputs[1].lotCode);
as('sales'); const sv = E.invoice({ date: T, customerId: cust.id, lines: [{ productId: cut.id, packSize: 1000, count: Math.floor(E.available(cut.id, E.whs('fg'), 1000) / 1000) }], method: 'credit' }); // sells every 1 kg pack, so this run's lot too
as('owner'); const m2 = refused(() => E.reopenButchery({ id: re.id, reason: 'تاني' })) || '', m3 = refused(() => E.cancelButchery({ id: re.id, reason: 'تاني' })) || '';
ok('sold cut: reopen refused and names the invoice', m2.includes('اتباع منها') && m2.includes(sv.no) && RE().status === 'closed', m2);
ok('cancel message names it too', m3.includes('مينفعش التشغيلة تتلغي'), m3);
ok('books sound after all butchery edits', sound());

/* ---------- production batch: owner reopens / cancels a closed batch ---------- */
as('supervisor');
const pb = S().items.find(i => i.cat === 'product' && i.group === 'مصنعات');
const mt = S().items.find(i => i.cat === 'meat' && !i.rework && E.available(i.id, E.whs('raw')) > 30000);
const B1 = E.createBatch({ date: T, productId: pb.id, planned: 20000 });
as('worker'); E.issue({ batchId: B1.id, itemId: mt.id, qty: 20000, date: T }); E.finishMeat({ batchId: B1.id });
as('supervisor'); E.returnRework({ batchId: B1.id, qty: 1000, date: T });
const bag5 = S().items.find(i => i.packFor === 500), bags0 = E.available(bag5.id, E.whs('pack'));
E.closeBatch({ batchId: B1.id, date: T, packs: { 500: 36 } });
const BB1 = () => S().docs.batches.find(b => b.id === B1.id);
ok('batch closed, bags issued', BB1().status === 'closed' && E.available(bag5.id, E.whs('pack')) === bags0 - 36);
as('supervisor'); ok('supervisor cannot reopen a batch', !!refused(() => E.reopenBatch({ batchId: B1.id, reason: 'فحص' })));
as('owner'); E.reopenBatch({ batchId: B1.id, reason: 'عدد العبوات غلط' });
ok('reopened: packs out of the freezer, bags back, status packing', BB1().status === 'packing' && E.available(bag5.id, E.whs('pack')) === bags0 && E.available(pb.id, E.whs('fg'), 500) === E.available(pb.id, E.whs('fg'), 500) && sound(), JSON.stringify(E.integrity().filter(c => !c.ok)) + ' mfg ' + E.manufacturingAccount({ from: E.addDays(T, -40), to: T }).check);
as('supervisor'); E.closeBatch({ batchId: B1.id, date: T, packs: { 500: 37 } });
ok('closed again with the right count, books sound', BB1().status === 'closed' && BB1().output === 18500 && BB1().reopens.length === 1 && sound());
as('sales'); const sold = E.invoice({ date: T, customerId: cust.id, lines: [{ productId: pb.id, packSize: 500, count: Math.floor(E.available(pb.id, E.whs('fg'), 500) / 500) }], method: 'credit' });
as('owner'); const mb = refused(() => E.reopenBatch({ batchId: B1.id, reason: 'تاني' })) || '';
ok('sold packs block reopen, naming the invoice', mb.includes(sold.no) && mb.includes('مينفعش التشغيلة تتفتح'), mb);
// cancel an open batch and a closed one
as('supervisor'); const B2 = E.createBatch({ date: T, productId: pb.id, planned: 5000 }); as('worker'); E.issue({ batchId: B2.id, itemId: mt.id, qty: 5000, date: T });
const mt0 = E.available(mt.id, E.whs('raw'));
as('owner'); E.cancelBatch({ batchId: B2.id, reason: 'اتفتحت غلط' });
ok('cancel an open batch: meat back', S().docs.batches.find(b => b.id === B2.id).status === 'cancelled' && E.available(mt.id, E.whs('raw')) === mt0 + 5000 && sound());
as('supervisor'); const B3 = E.createBatch({ date: T, productId: pb.id, planned: 5000 }); as('worker'); E.issue({ batchId: B3.id, itemId: mt.id, qty: 6000, date: T });
as('supervisor'); E.returnRework({ batchId: B3.id, qty: 500, date: T }); E.closeBatch({ batchId: B3.id, date: T, packs: { 500: 10 } });
const mt1 = E.available(mt.id, E.whs('raw'));
as('owner'); E.cancelBatch({ batchId: B3.id, reason: 'تجربة' });
ok('cancel a closed batch: meat, rework and bags all back, books sound', S().docs.batches.find(b => b.id === B3.id).status === 'cancelled' && E.available(mt.id, E.whs('raw')) === mt1 + 6000 && sound(), JSON.stringify(E.integrity().filter(c => !c.ok)) + ' mfg ' + E.manufacturingAccount({ from: E.addDays(T, -40), to: T }).check);

/* ---------- per-person screens ---------- */
as('owner');
const acc = S().users.find(u => u.role === 'accountant');
E.updateUserAccess({ userId: acc.id, pages: ['home', 'treasury'] });
ok('owner sets one person\'s screens', JSON.stringify(S().settings.userAccess[acc.id]) === '["home","treasury"]');
E.updateUserAccess({ userId: acc.id, pages: null });
ok('back to the role default', !S().settings.userAccess[acc.id]);
as('accountant'); ok('only the owner sets screens', !!refused(() => E.updateUserAccess({ userId: acc.id, pages: [] })));

/* ---------- server path: request → Telegram buttons → owner approves through runOp ---------- */
{
  const { runOp } = await import(dir + '/supabase/functions/_shared/core.mjs');
  E.reset(); const st0 = JSON.parse(JSON.stringify(S())); st0.settings.telegram = true; st0.settings.tgChat = '42';
  const store = { version: 1, state: st0 };
  const db = { async load() { return { version: store.version, state: JSON.parse(JSON.stringify(store.state)) }; }, async save(st, base) { if (base !== store.version) return null; store.state = JSON.parse(JSON.stringify(st)); return ++store.version; }, async log() {}, async snapshot() {} };
  const sent = []; const telegram = async (chat, text, markup) => { sent.push({ chat, text, markup }); return { ok: true }; };
  const u = r => { const x = st0.users.find(y => y.role === r); return { user_id: x.id, username: x.id, name: x.name, role: r, active: true }; };
  const vv = store.state.docs.invoices.find(x => x.lines.length && !x.vat);
  const r1 = await runOp({ E, db, profile: u('sales'), op: 'invoiceReturn', args: [{ invoiceId: vv.id, lines: [{ idx: 0, count: 1 }], reason: 'مرتجع فحص' }], telegram, copy: null });
  const m = sent.at(-1);
  ok('server: sales return request saved', r1.status === 200 && r1.body.result.requested, JSON.stringify(r1.body));
  ok('server: Telegram got approve/reject buttons', m && m.markup && m.markup.inline_keyboard[0].length === 2 && /^chg:ok:/.test(m.markup.inline_keyboard[0][0].callback_data), JSON.stringify(m && m.markup));
  const id = m.markup.inline_keyboard[0][0].callback_data.split(':')[2];
  const r2 = await runOp({ E, db, profile: u('owner'), op: 'decideChange', args: [id, true], telegram: null, copy: null });
  ok('server: owner approves → return applied', r2.status === 200 && store.state.docs.returns.length === 1 && store.state.docs.changes.find(c => c.id === id).status === 'approved', JSON.stringify(r2.body).slice(0, 200));
}

/* ---------- every server operation is wired in the live client ---------- */
{
  const fs = await import('fs');
  const core = fs.readFileSync(dir + '/supabase/functions/_shared/core.mjs', 'utf8'), app = fs.readFileSync(dir + '/app.js', 'utf8');
  const ops = [...core.match(/export const OPS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([a-zA-Z]+)'/g)].map(m => m[1]).filter(o => o !== 'dailyCheck');
  const live = [...app.match(/const LIVE_OPS = \[([\s\S]*?)\];/)[1].matchAll(/'([a-zA-Z]+)'/g)].map(m => m[1]);
  const missing = ops.filter(o => !live.includes(o));
  ok('every server op is in LIVE_OPS (else live mode only changes the browser)', !missing.length, missing.join(', '));
  ok('every live op exists in the engine', live.every(o => typeof E[o] === 'function'), live.filter(o => typeof E[o] !== 'function').join(', '));
}

console.log(`edit checks: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
