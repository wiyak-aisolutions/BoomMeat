// Boom Meat ERP — a production batch in three stages (meat → spices → packing), each closed by its own worker,
// with an output sheet like butchery: lines of product × pack size × count, also for a second product from the same batch.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
const { OPS } = await import(dir + '/supabase/functions/_shared/core.mjs');
let pass = 0, fail = 0; const out = [];
const ok = (claim, cond, detail = '') => { if (cond) pass++; else { fail++; out.push(`✗ ${claim}${detail !== '' ? ' — ' + JSON.stringify(detail) : ''}`); } };
const S = () => E.S, T = E.today();
const asId = id => { S().currentUser = id; }, as = r => asId(S().users.find(u => u.role === r).id);
const refused = fn => { const snap = JSON.stringify(S()); try { fn(); return ''; } catch (e) { E.setState(JSON.parse(snap)); return e.message || 'error'; } };
const sound = () => E.integrity().every(c => c.ok) && E.balanceSheet({ asOf: T }).balanced;
E.reset(); as('owner');
const workers = S().users.filter(u => u.role === 'worker'), meatMan = workers[0], spiceMan = workers[1], packer = S().users.find(u => u.role === 'packer'), boss = S().users.find(u => u.role === 'supervisor');
ok('demo has two production workers and a packer', workers.length >= 2 && !!packer);
for (const op of ['finishMeat', 'finishSpice', 'finishPack', 'batchOutput', 'batchDropOutput']) ok(`server accepts ${op}`, OPS.has(op) && typeof E[op] === 'function');

const prods = S().items.filter(i => i.cat === 'product' && i.group === 'مصنعات');
const P1 = prods.find(p => E.packsOf(p).includes(500) && E.packsOf(p).includes(1000)), P2 = prods.find(p => p.id !== P1.id && E.packsOf(p).includes(500));
const meat = S().items.find(i => i.cat === 'meat' && !i.rework && E.available(i.id, E.whs('raw')) > 60000);
const spice = S().items.find(i => i.cat === 'spice' && E.available(i.id, E.whs('raw')) > 3000);
const bag500 = S().items.find(i => i.packFor === 500), bag1000 = S().items.find(i => i.packFor === 1000), stk = S().items.find(i => i.sticker);
const fg = E.whs('fg'), bal = id => E.available(id, E.packStores());
const B = id => S().docs.batches.find(x => x.id === id);

/* ---------- stage 1: meat ---------- */
asId(boss.id); const b = E.createBatch({ date: T, productId: P1.id, planned: 50000 });
asId(meatMan.id); E.issue({ batchId: b.id, itemId: meat.id, qty: 49000, date: T });
ok('worker cannot add spices before the meat is closed', /اللحوم يقفل/.test(refused(() => E.issue({ batchId: b.id, itemId: spice.id, qty: 1000, date: T }))));
ok('nobody records output from the worker role', !!refused(() => E.batchOutput({ batchId: b.id, packSize: 500, count: 1 })));
asId(packer.id); ok('packer waits for his stage', !!refused(() => E.batchOutput({ batchId: b.id, packSize: 500, count: 1 })) && !!refused(() => E.finishPack({ batchId: b.id })));
asId(meatMan.id); E.finishMeat({ batchId: b.id });
ok('meat closed by its worker → spice stage', B(b.id).status === 'spice' && B(b.id).meatDoneBy === meatMan.id && E.running(B(b.id)));
ok('meat stage cannot be closed twice', !!refused(() => E.finishMeat({ batchId: b.id })));

/* ---------- stage 2: spices ---------- */
asId(spiceMan.id);
ok('no meat in the spice stage', !!refused(() => E.issue({ batchId: b.id, itemId: meat.id, qty: 500, date: T })));
E.issue({ batchId: b.id, itemId: spice.id, qty: 1000, date: T });
E.finishSpice({ batchId: b.id });
ok('spices closed by their worker → packing', B(b.id).status === 'packing' && B(b.id).spiceDoneBy === spiceMan.id && E.batchKg(B(b.id)) === 50000);

/* ---------- stage 3: packing — bags, stickers and the output sheet ---------- */
asId(packer.id);
const bag0 = bal(bag500.id), bagK0 = bal(bag1000.id), stk0 = bal(stk.id);
E.issue({ batchId: b.id, itemId: bag500.id, qty: 40, date: T });
ok('packer issues bags by hand', E.issuedOf(B(b.id), bag500.id) === 40 && bal(bag500.id) === bag0 - 40);
ok('packer cannot close before counting the packs', /عدد العبوات/.test(refused(() => E.finishPack({ batchId: b.id }))));
const l1 = E.batchOutput({ batchId: b.id, productId: P1.id, packSize: 500, count: 40, wh: fg[0] });
E.batchOutput({ batchId: b.id, packSize: 1000, count: 20 }); // no product = the batch's own
const l3 = E.batchOutput({ batchId: b.id, productId: P2.id, packSize: 500, count: 16, wh: fg[0] }); // a second product from the same dough
ok('output sheet: 20 + 20 + 8 kg, nothing in stock yet', E.batchOutKg(B(b.id)) === 48000 && B(b.id).outputs.length === 3 && !S().lots.some(l => l.batchId === b.id));
ok('output cannot pass the input', /أكبر من الخامات/.test(refused(() => E.batchOutput({ batchId: b.id, packSize: 1000, count: 3 }))));
ok('a size the product does not have is refused', !!refused(() => E.batchOutput({ batchId: b.id, productId: P1.id, packSize: 20001, count: 1 })) && !!refused(() => E.batchOutput({ batchId: b.id, productId: meat.id, packSize: 500, count: 1 })));
ok('bad counts refused', !!refused(() => E.batchOutput({ batchId: b.id, packSize: 500, count: 0 })) && !!refused(() => E.batchOutput({ batchId: b.id, packSize: 500, count: 1.5 })));
ok('a raw store is not a freezer', !!refused(() => E.batchOutput({ batchId: b.id, packSize: 500, count: 1, wh: E.whs('raw')[0] })));
E.batchDropOutput({ batchId: b.id, lineId: l3.id }); E.batchOutput({ batchId: b.id, productId: P2.id, packSize: 500, count: 18, wh: fg[fg.length - 1] });
ok('a line can be dropped and typed again', E.batchOutKg(B(b.id)) === 49000 && !B(b.id).outputs.some(o => o.id === l3.id));
asId(meatMan.id); ok('other workers cannot touch the output', !!refused(() => E.batchDropOutput({ batchId: b.id, lineId: l1.id })));
asId(packer.id); E.finishPack({ batchId: b.id });
ok('packing closed by the packer; the batch waits for the supervisor', B(b.id).status === 'packing' && B(b.id).packDoneBy === packer.id);
ok('after closing his part the packer cannot change it', !!refused(() => E.batchOutput({ batchId: b.id, packSize: 500, count: 1 })) && !!refused(() => E.batchDropOutput({ batchId: b.id, lineId: l1.id })) && !!refused(() => E.issue({ batchId: b.id, itemId: bag500.id, qty: 1, date: T })));
ok('packer cannot close the batch itself', !!refused(() => E.closeBatch({ batchId: b.id, date: T })));

/* ---------- final close from the sheet ---------- */
asId(boss.id);
const fgBefore = [P1, P2].map(p => E.available(p.id, fg));
const c = E.closeBatch({ batchId: b.id, date: T });
const lots = S().lots.filter(l => l.batchId === b.id);
ok('closed from the sheet: 49 kg out of 50, 1 kg waste', c.status === 'closed' && c.output === 49000 && c.waste === 1000 && c.inputKg === 50000);
ok('each product and size became its own lot', lots.length === 3 && lots.filter(l => l.itemId === P1.id).length === 2 && lots.find(l => l.itemId === P2.id).qty === 9000 && lots.find(l => l.itemId === P2.id).wh === fg[fg.length - 1]);
ok('stock went up for both products', E.available(P1.id, fg) === fgBefore[0] + 40000 && E.available(P2.id, fg) === fgBefore[1] + 9000);
ok('the whole cost is on the packs, shared by weight', lots.reduce((s, l) => s + l.inValue, 0) === c.cost && Math.abs(lots.find(l => l.itemId === P2.id).inValue - Math.round(c.cost * 9000 / 49000)) <= 2);
ok('the batch remembers what it made', JSON.stringify(c.made) === JSON.stringify([{ productId: P1.id, packSize: 500, count: 40 }, { productId: P1.id, packSize: 1000, count: 20 }, { productId: P2.id, packSize: 500, count: 18 }]) && c.packs[500] === 58 && c.packs[1000] === 20);
ok('bags: the 40 issued by hand stay, 1 kg bags and stickers issued at close', E.issuedOf(c, bag500.id) === 40 && E.issuedOf(c, bag1000.id) === 20 && bal(bagK0 && bag1000.id) === bagK0 - 20 && E.issuedOf(c, stk.id) === 78 && bal(stk.id) === stk0 - 78);
ok('books stay sound', sound());

/* ---------- reopen keeps the sheet; the supervisor fixes it ---------- */
as('owner'); E.reopenBatch({ batchId: b.id, reason: 'عدد غلط' });
ok('reopened: back at packing, sheet kept, packer flag cleared', B(b.id).status === 'packing' && B(b.id).outputs.length === 3 && !B(b.id).packDoneAt && !S().lots.some(l => l.batchId === b.id && l.qty > 0) && bal(stk.id) === stk0);
asId(boss.id); E.batchDropOutput({ batchId: b.id, lineId: l1.id }); E.batchOutput({ batchId: b.id, productId: P1.id, packSize: 500, count: 38, wh: fg[0] });
const c2 = E.closeBatch({ batchId: b.id, date: T });
ok('closed again with the fixed count', c2.output === 48000 && c2.packs[500] === 56 && sound());

/* ---------- a product without spices skips the spice stage ---------- */
asId(boss.id); const n = E.createBatch({ date: T, productId: P1.id, planned: 5000 });
asId(meatMan.id); E.issue({ batchId: n.id, itemId: meat.id, qty: 5000, date: T }); E.finishMeat({ batchId: n.id, noSpice: true });
ok('no spices: straight to packing', B(n.id).status === 'packing' && B(n.id).noSpice === true);
asId(boss.id); const m = E.createBatch({ date: T, productId: P1.id, planned: 5000 });
asId(meatMan.id); E.issue({ batchId: m.id, itemId: meat.id, qty: 5000, date: T }); E.finishMeat({ batchId: m.id });
asId(spiceMan.id); E.finishSpice({ batchId: m.id, noSpice: true });
ok('spice worker can say «بدون توابل»', B(m.id).status === 'packing' && B(m.id).noSpice === true && B(m.id).spiceDoneBy === spiceMan.id);
asId(boss.id); const q = E.createBatch({ date: T, productId: P1.id, planned: 5000 });
E.issue({ batchId: q.id, itemId: meat.id, qty: 5000, date: T }); E.issue({ batchId: q.id, itemId: spice.id, qty: 500, date: T });
ok('with spices already on it, the batch cannot skip the spice stage', /مرحلة التوابل/.test(refused(() => E.finishMeat({ batchId: q.id, noSpice: true }))));

/* ---------- the old close form (counts typed at close) still works, and the supervisor can do every stage ---------- */
E.finishMeat({ batchId: q.id }); E.finishSpice({ batchId: q.id });
const cq = E.closeBatch({ batchId: q.id, date: T, packs: { 500: 4, 1000: 3 }, split: [{ wh: fg[0], packs: { 500: 4, 1000: 3 } }] });
ok('typed counts close as before', cq.status === 'closed' && cq.output === 5000 && cq.made.length === 2 && S().lots.filter(l => l.batchId === q.id).length === 2 && sound());
ok('a batch with no sheet and no counts does not close', /عدد العبوات/.test(refused(() => E.closeBatch({ batchId: n.id, date: T }))));
as('owner'); E.cancelBatch({ batchId: n.id, reason: 'تجربة' }); E.cancelBatch({ batchId: m.id, reason: 'تجربة' });
ok('cancel still returns everything', B(n.id).status === 'cancelled' && sound());

/* ---------- «من غير» at close: flagged only when nothing of that kind was issued by hand ---------- */
const mk = () => { asId(boss.id); const x = E.createBatch({ date: T, productId: P1.id, planned: 5000 }); E.issue({ batchId: x.id, itemId: meat.id, qty: 5000, date: T }); E.finishMeat({ batchId: x.id, noSpice: true }); E.batchOutput({ batchId: x.id, packSize: 500, count: 9 }); return x; };
const h1 = mk(); E.issue({ batchId: h1.id, itemId: bag500.id, qty: 9, date: T }); E.issue({ batchId: h1.id, itemId: stk.id, qty: 9, date: T });
const s0 = bal(stk.id), g0 = bal(bag500.id), ch1 = E.closeBatch({ batchId: h1.id, date: T, bags: { 500: '' }, sticker: '' });
ok('bags and stickers issued by hand: no second issue, no warning', !ch1.noPack && bal(stk.id) === s0 && bal(bag500.id) === g0);
const h2 = mk(), ch2 = E.closeBatch({ batchId: h2.id, date: T, bags: { 500: '' }, sticker: '' });
ok('nothing issued and «من غير» picked: the batch says so', (ch2.noPack || []).length === 2 && sound());

/* ---------- a sticker for each pack size (the kilo and the half kilo carry different stickers) ---------- */
as('owner'); const stk2 = E.saveItem({ name: 'استيكر كيلو', cat: 'pack', unit: 'pc' });
const printer = S().partners.find(x => x.type === 'supplier' && (x.items || []).includes(stk.id)); E.savePartner({ ...printer, items: [...printer.items, stk2.id] });
E.purchase({ date: T, supplierId: printer.id, ref: 'STK2', lines: [{ itemId: stk2.id, qty: 500, unitCost: 50, expDate: E.addDays(T, 300) }] });
asId(boss.id); const sb = E.createBatch({ date: T, productId: P1.id, planned: 20000 }); E.issue({ batchId: sb.id, itemId: meat.id, qty: 20000, date: T }); E.finishMeat({ batchId: sb.id, noSpice: true });
E.batchOutput({ batchId: sb.id, packSize: 500, count: 10 }); E.batchOutput({ batchId: sb.id, packSize: 1000, count: 12 }); E.batchOutput({ batchId: sb.id, productId: P2.id, packSize: 500, count: 4 });
const a1 = bal(stk.id), a2 = bal(stk2.id);
const cs = E.closeBatch({ batchId: sb.id, date: T, bags: { 500: bag500.id, 1000: bag1000.id }, stickers: { 500: stk.id, 1000: stk2.id } });
ok('each size took its own sticker, by its own count', a1 - bal(stk.id) === 14 && a2 - bal(stk2.id) === 12 && !cs.noPack && cs.picks.stickers[1000] === stk2.id && sound());
const sb2 = mk(), b1 = bal(stk.id), cs2 = E.closeBatch({ batchId: sb2.id, date: T, bags: { 500: bag500.id }, stickers: { 500: stk.id } });
ok('one sticker for one size', b1 - bal(stk.id) === 9 && !cs2.noPack);
const sb3 = mk(); E.batchOutput({ batchId: sb3.id, packSize: 200, count: 2 }); const c1 = bal(stk.id), g1 = bal(bag500.id);
const cs3 = E.closeBatch({ batchId: sb3.id, date: T, bags: { 500: bag500.id, 200: bag500.id }, stickers: { 500: stk.id, 200: stk.id } });
ok('the same bag and sticker for two sizes are issued for both', c1 - bal(stk.id) === 11 && g1 - bal(bag500.id) === 11 && sound());
const sb4 = mk(), cs4 = E.closeBatch({ batchId: sb4.id, date: T, bags: { 500: bag500.id }, stickers: { 500: '' } });
ok('a size left without a sticker is flagged', (cs4.noPack || []).join() === 'استيكر');

/* ---------- an open butchery run on the worker screen: workers add its output and bags, the supervisor opens and closes ---------- */
asId(boss.id); const rawLot = S().lots.find(l => l.qty > 60000 && ['meat', 'carcass'].includes(E.item(l.itemId).cat) && !E.item(l.itemId).rework);
const run = E.openButchery({ date: T, lotId: rawLot.id, qty: 50000 }), RUN = () => S().docs.butcheries.find(x => x.id === run.id);
const cutIt = S().items.find(i => i.cat === 'meat' && !i.rework && i.active !== false);
asId(meatMan.id);
const o1 = E.butcheryOutput({ id: run.id, itemId: cutIt.id, qty: 12500 }); E.butcheryOutput({ id: run.id, itemId: cutIt.id, count: 6, packSize: 500 });
ok('worker adds butchery output', RUN().outputs.length === 2 && E.butOut(RUN()) === 15500 && RUN().outputs[0].by === meatMan.id);
E.butcheryEditOutput({ id: run.id, lineId: o1.id, qty: 12000 }); E.butcheryPack({ id: run.id, itemId: bag1000.id, qty: 12 });
ok('worker fixes a line and records bags', E.butOut(RUN()) === 15000 && RUN().packs.length === 1);
ok('worker cannot open, feed or close a butchery run', !!refused(() => E.openButchery({ date: T, lotId: rawLot.id, qty: 1000 })) && !!refused(() => E.butcheryInput({ id: run.id, lotId: rawLot.id, qty: 1000 })) && !!refused(() => E.closeButchery({ id: run.id, date: T, wh: E.whs('raw')[0] })) && !!refused(() => E.newCutItem({ name: 'قطعية تجربة', cat: 'meat' })));
ok('output still cannot pass the input', !!refused(() => E.butcheryOutput({ id: run.id, itemId: cutIt.id, qty: 999000 })));
asId(packer.id); E.butcheryOutput({ id: run.id, itemId: cutIt.id, qty: 1000 }); E.butcheryDropOutput({ id: run.id, lineId: RUN().outputs[RUN().outputs.length - 1].id });
ok('packer can add and drop too', RUN().outputs.length === 2);
asId(boss.id); E.closeButchery({ id: run.id, date: T, wh: E.whs('raw')[0] });
ok('supervisor closes it; books stay sound', RUN().status === 'closed' && sound());
asId(meatMan.id); ok('a closed run is locked for workers', !!refused(() => E.butcheryOutput({ id: run.id, itemId: cutIt.id, qty: 1000 })));

/* ---------- butchery like a production batch: opened empty, the workers issue the raw meat by item; each output line picks its fridge ---------- */
asId(boss.id); const er = E.openButchery({ date: T, note: 'معلم حسن' }), ER = () => S().docs.butcheries.find(x => x.id === er.id);
ok('a run opens with no lot', ER().status === 'open' && ER().inputs.length === 0 && E.butIn(ER()) === 0);
const lotsIn = (id, ws) => S().lots.filter(l => l.itemId === id && l.qty > 0 && ws.includes(l.wh)).sort((a, c) => (a.expDate || '').localeCompare(c.expDate || '') || a.n - c.n);
const rawIt = S().items.filter(i => ['carcass', 'meat', 'byproduct'].includes(i.cat) && !i.rework && !i.waste && i.unit === 'kg' && i.active !== false).sort((a, c) => lotsIn(c.id, E.rawStores()).length - lotsIn(a.id, E.rawStores()).length)[0];
const lots0 = lotsIn(rawIt.id, E.rawStores()), have = E.available(rawIt.id, E.rawStores()), take = Math.min(have, lots0[0].qty + 1000);
asId(meatMan.id);
E.butcheryIssue({ id: er.id, itemId: rawIt.id, qty: take });
ok('the worker issues by item, oldest lot first, one line per lot', E.butIn(ER()) === take && ER().inputs[0].lotId === lots0[0].id && ER().inputs.every(i => i.by === meatMan.id && i.itemId === rawIt.id) && (take <= lots0[0].qty || ER().inputs.length === 2) && E.available(rawIt.id, E.rawStores()) === have - take);
ok('only raw meat or spices go in', !!refused(() => E.butcheryIssue({ id: er.id, itemId: bag500.id, qty: 1000 })) && !!refused(() => E.butcheryIssue({ id: er.id, itemId: P1.id, qty: 1000 })) && !!refused(() => E.butcheryIssue({ id: er.id, itemId: rawIt.id, qty: have * 10 })));
asId(packer.id); ok('the packer does not issue meat', !!refused(() => E.butcheryIssue({ id: er.id, itemId: rawIt.id, qty: 500 })));
asId(spiceMan.id); ok('a worker cannot take back another worker\'s line', /انت صرفته/.test(refused(() => E.butcheryDropInput({ id: er.id, inputId: ER().inputs[0].id }))));
asId(meatMan.id); E.butcheryIssue({ id: er.id, itemId: rawIt.id, qty: 500 }); const extra = ER().inputs[ER().inputs.length - 1];
E.butcheryDropInput({ id: er.id, inputId: extra.id });
ok('the worker takes back his own line', E.butIn(ER()) === take && E.available(rawIt.id, E.rawStores()) === have - take);
const [rawA, rawB] = E.whs('raw'), [fgA, fgB] = E.whs('fg'), rec = E.whs('receiving')[0];
const ready = S().items.find(i => i.cat === 'product' && i.group !== 'مصنعات' && E.packsOf(i).includes(1000));
const bl1 = E.butcheryOutput({ id: er.id, itemId: cutIt.id, qty: 4000, wh: rawB });
E.butcheryOutput({ id: er.id, itemId: cutIt.id, qty: 3000, wh: rawA });
E.butcheryOutput({ id: er.id, itemId: cutIt.id, qty: 1000 }); // no fridge: the default at close
if (ready) E.butcheryOutput({ id: er.id, itemId: ready.id, count: 2, packSize: 1000, wh: fgB });
ok('each line keeps its fridge', ER().outputs[0].wh === rawB && ER().outputs[1].wh === rawA && !ER().outputs[2].wh);
ok('a cut cannot go to a freezer, a product cannot go to a fridge', !!refused(() => E.butcheryOutput({ id: er.id, itemId: cutIt.id, qty: 500, wh: fgA })) && (!ready || !!refused(() => E.butcheryOutput({ id: er.id, itemId: ready.id, count: 1, packSize: 1000, wh: rawA }))) && !!refused(() => E.butcheryOutput({ id: er.id, itemId: cutIt.id, qty: 500, wh: 'W99' })));
E.butcheryEditOutput({ id: er.id, lineId: bl1.id, qty: 4000, wh: rec });
ok('the fridge can be changed on a line', ER().outputs[0].wh === rec);
E.butcheryPack({ id: er.id, itemId: bag1000.id, qty: 4 });
asId(boss.id); const ec = E.closeButchery({ id: er.id, date: T, wh: rawB });
const lotOf = o => S().lots.find(l => l.code === o.lotCode);
ok('close puts every line in its own fridge', ec.status === 'closed' && lotOf(ER().outputs[0]).wh === rec && lotOf(ER().outputs[1]).wh === rawA && lotOf(ER().outputs[2]).wh === rawB && (!ready || lotOf(ER().outputs[3]).wh === fgB) && sound());
asId(boss.id); const em = E.openButchery({ date: T });
ok('an empty run does not close', /مفيش خامة/.test(refused(() => E.closeButchery({ id: em.id, date: T }))));
as('owner'); E.cancelButchery({ id: em.id, reason: 'تجربة' });
ok('an empty run can be cancelled', S().docs.butcheries.find(x => x.id === em.id).status === 'cancelled' && sound());

/* ---------- butchery: spices and packaging are optional ---------- */
asId(boss.id); const sr = E.openButchery({ date: T }), SR = () => S().docs.butcheries.find(x => x.id === sr.id);
asId(meatMan.id); E.butcheryIssue({ id: sr.id, itemId: rawIt.id, qty: 5000 });
const sp0 = E.available(spice.id, E.rawStores()); E.butcheryIssue({ id: sr.id, itemId: spice.id, qty: 200 });
ok('spices can go on a butchery run', E.butIn(SR()) === 5200 && E.available(spice.id, E.rawStores()) === sp0 - 200 && SR().inputs.some(i => i.itemId === spice.id));
E.butcheryOutput({ id: sr.id, itemId: cutIt.id, qty: 5000, wh: rawA });
asId(boss.id); const sc = E.closeButchery({ id: sr.id, date: T });
ok('closes with no packaging at all', sc.status === 'closed' && SR().packs.length === 0 && sc.cost === SR().inputs.reduce((a, i) => a + i.value, 0) && sound());
asId(boss.id); const nr = E.openButchery({ date: T }); asId(meatMan.id); E.butcheryIssue({ id: nr.id, itemId: rawIt.id, qty: 3000 }); E.butcheryOutput({ id: nr.id, itemId: cutIt.id, qty: 2900 });
asId(boss.id); ok('and with no spices', E.closeButchery({ id: nr.id, date: T }).status === 'closed' && sound());

console.log(`stage checks: ${pass} passed, ${fail} failed`); out.forEach(l => console.log(l));
process.exit(fail ? 1 : 0);
