// Boom Meat ERP — November 2026 changes: no VAT, open price for sales, invoice collection, Vodafone Cash, meat sections, partner totals.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
let pass = 0, fail = 0;
const ok = (claim, cond, detail = '') => { if (cond) pass++; else { fail++; console.log('✗ ' + claim + (detail ? ' — ' + detail : '')); } };
const S = () => E.S, T = E.today();
const as = r => { S().currentUser = S().users.find(u => u.role === r).id; };
const refused = fn => { const snap = JSON.stringify(S()); try { fn(); return null; } catch (e) { E.setState(JSON.parse(snap)); return e.message; } };

E.reset(); as('owner');
const credit = S().partners.find(p => p.type === 'customer' && p.terms === 'credit');
const prod = S().items.find(i => i.cat === 'product' && E.available(i.id, E.whs('fg'), 1000) >= 3000);

// no VAT anywhere, even if old books said 14
ok('VAT forced to 0 on load', E.setState({ ...JSON.parse(JSON.stringify(S())), settings: { ...S().settings, vatRate: 14 } }).settings.vatRate === 0);
as('sales');
const v = E.invoice({ date: T, customerId: credit.id, lines: [{ productId: prod.id, packSize: 1000, count: 2, pricePerKg: 33300 }], method: 'credit' });
ok('sale has no VAT', v.vat === 0 && v.total === v.net && v.net === 66600, `${v.vat} ${v.total} ${v.net}`);
ok('sales can type their own price per kg', v.lines[0].pricePerKg === 33300);
ok('books still balanced', E.integrity().every(c => c.ok));

// collect against the invoice
ok('nothing collected yet on a credit invoice', E.invoicePaid(v) === 0);
const rc = E.receipt({ date: T, customerId: credit.id, amount: 40000, method: 'cash', invoiceId: v.id });
ok('receipt linked to invoice', rc.invoiceId === v.id && E.invoicePaid(v) === 40000);
ok('cannot collect more than what is left', /المتبقي/.test(refused(() => E.receipt({ date: T, customerId: credit.id, amount: 30000, method: 'cash', invoiceId: v.id })) || ''));
E.receipt({ date: T, customerId: credit.id, amount: 26600, method: 'cash', invoiceId: v.id });
ok('invoice fully collected', E.invoicePaid(v) === v.total);
const other = S().partners.find(p => p.type === 'customer' && p.id !== credit.id);
ok('invoice of another customer refused', !!refused(() => E.receipt({ date: T, customerId: other.id, amount: 100, method: 'cash', invoiceId: v.id })));
const cashInv = E.invoice({ date: T, customerId: credit.id, lines: [{ productId: prod.id, packSize: 1000, count: 1 }], method: 'cash' });
ok('cash invoice counts as paid', E.invoicePaid(cashInv) === cashInv.total);

// Vodafone Cash: internal transfers only (the owner moves it; staff work from the sub treasury only)
as('accountant');
ok('Vodafone Cash refused for collection', /فودافون/.test(refused(() => E.receipt({ date: T, customerId: credit.id, amount: 100, method: 'vodafone' })) || ''));
ok('Vodafone Cash refused for expenses', /فودافون/.test(refused(() => E.expense({ date: T, acc: '5403', amount: 100, method: 'vodafone' })) || ''));
ok('accountant cannot move money to Vodafone Cash', !!refused(() => E.cashTransfer({ date: T, from: 'cash', to: 'vodafone', amount: 100 })));
ok('accountant cannot pay from a bank', /الفرعية/.test(refused(() => E.expense({ date: T, acc: '5403', amount: 100, method: '1111' })) || ''));
ok('accountant cannot collect into a bank', /الفرعية/.test(refused(() => E.receipt({ date: T, customerId: credit.id, amount: 100, method: '1112' })) || ''));
ok('accountant cannot pay a loan', !!refused(() => E.payLiability({ date: T, acc: '2201', from: 'cash', amount: 0, cost: 100 })));
as('sales');
ok('sales cannot sell into a bank', /الفرعية/.test(refused(() => E.invoice({ date: T, customerId: credit.id, lines: [{ productId: prod.id, packSize: 1000, count: 1 }], method: '1111' })) || ''));
as('owner');
const before = E.cashBalance('1106');
E.cashTransfer({ date: T, from: 'cash', to: 'vodafone', amount: 5000 });
ok('transfer into Vodafone Cash', E.cashBalance('1106') === before + 5000);
E.cashTransfer({ date: T, from: 'vodafone', to: 'cash', amount: 2000 });
ok('transfer out of Vodafone Cash', E.cashBalance('1106') === before + 3000);
ok('books balanced after transfers', E.integrity().every(c => c.ok));

// partner totals
const t = E.partnerTotals(credit.id);
ok('partner totals add up', t.billed - t.settled === t.balance && t.balance === E.partnerBalance(credit.id));

// purchases carry no VAT
as('storekeeper');
const sup = S().partners.find(p => p.type === 'supplier' && (p.items || []).length);
const po = E.purchase({ date: T, supplierId: sup.id, ref: 'NV', lines: [{ itemId: sup.items[0], qty: 1000, unitCost: 10000, expDate: E.addDays(T, 9) }] });
ok('purchase has no VAT', po.vat === 0 && po.total === po.net);

// meat sections
as('owner');
const raw = S().items.find(i => i.cat === 'meat');
E.saveItem({ ...raw, sub: 'برازيلي' });
ok('owner sets a meat section', E.item(raw.id).sub === 'برازيلي');
E.saveItem({ ...raw, sub: 'لحوم مستوردة' });
ok('owner can add a new section', E.item(raw.id).sub === 'لحوم مستوردة');
ok('demo fat is under دهون', S().items.some(i => i.sub === 'دهون'));

/* ---------- phase 2: treasuries, banks, loans, advances, custody, chart edits ---------- */
E.reset(); as('owner');
const bs = () => E.balanceSheet({ asOf: T }).balanced && E.integrity().every(c => c.ok);
E.deposit({ date: T, to: 'main', amount: 1000000, source: '3301', kind: 'cheque', ref: '445', memo: 'شيك من الشريك' });
ok('owner deposits a cheque into the main treasury', E.cashBalance('1107') === 1000000 && bs());
E.cashTransfer({ date: T, from: 'main', to: 'cash', amount: 300000 });
ok('main → sub transfer', E.cashBalance('1107') === 700000);
as('accountant');
ok('accountant cannot touch the main treasury', /الرئيسية/.test(refused(() => E.cashTransfer({ date: T, from: 'main', to: 'cash', amount: 100 })) || ''));
ok('accountant cannot spend from main', /الرئيسية/.test(refused(() => E.expense({ date: T, acc: '5403', amount: 100, method: 'main' })) || ''));
ok('accountant deposits only into the sub treasury', /الفرعية/.test(refused(() => E.deposit({ date: T, to: '1111', amount: 100, source: '4104', kind: 'cash', memo: 'فحص' })) || ''));
const sub0 = E.cashBalance('1101');
E.expense({ date: T, acc: '5403', amount: 5000, method: 'cash' });
ok('accountant spends from the sub treasury', E.cashBalance('1101') === sub0 - 5000);
ok('deposit needs a statement', /البيان/.test(refused(() => E.deposit({ date: T, to: 'cash', amount: 100, source: '4104', kind: 'cash', memo: '' })) || ''));
as('owner');
E.deposit({ date: T, to: '1112', amount: 5000000, source: '2201', kind: 'transfer', memo: 'صرف قرض الأهلي ١' });
ok('loan drawn into NBE', E.cashBalance('1112') === 5000000 && E.balanceSheet({ asOf: T }).loansT === 5000000 && bs());
E.payLiability({ date: T, acc: '2201', from: '1112', amount: 400000, cost: 60000, memo: 'قسط' });
ok('loan instalment + interest', E.balanceSheet({ asOf: T }).loansT === 4600000 && E.cashBalance('1112') === 4540000 && E.incomeStatement({ from: T, to: T }).financeT >= 60000 && bs());
ok('cannot repay more than the loan', !!refused(() => E.payLiability({ date: T, acc: '2201', from: '1112', amount: 4600001 })));
E.expense({ date: T, acc: '5602', amount: 2500, method: '2111' });
ok('bank fee paid by credit card raises the card balance', E.bal(E.ledger({}), '2111') === 2500 && bs());
ok('credit card cannot receive money', !!refused(() => E.receipt({ date: T, customerId: credit.id, amount: 100, method: '2111' })));
as('accountant');
E.advance({ date: T, name: 'أحمد', amount: 20000, method: 'cash', memo: 'سلفة أول الشهر' });
E.advance({ date: T, name: 'أحمد', amount: 5000, method: 'cash' });
E.advance({ date: T, name: 'محمود', amount: 7000, method: 'cash' });
const ahmed = S().staff.find(x => x.name === 'أحمد');
ok('advances add up per worker', E.personBalance('advance', ahmed.id) === 25000 && S().staff.length === 2);
E.advanceBack({ date: T, name: 'أحمد', amount: 10000, method: 'cash' });
ok('advance paid back', E.personBalance('advance', ahmed.id) === 15000 && E.bal(E.ledger({}), '1202') === 22000 && bs());
E.custody({ date: T, name: 'سواق العربية', amount: 30000, method: 'cash' });
E.settleCustody({ date: T, name: 'سواق العربية', back: 10000, method: 'cash', spent: 15000, acc: '5302' });
ok('custody settled: part back, part spent', E.personBalance('custody', S().staff.find(x => x.name === 'سواق العربية').id) === 5000 && bs());
ok('cannot settle more than the custody', !!refused(() => E.settleCustody({ date: T, name: 'سواق العربية', back: 6000, method: 'cash' })));
as('owner');
const nb = E.saveAccount({ name: 'بنك QNB', parent: '12', money: 'bank' });
ok('owner adds a bank account', nb.code === '1251' && nb.money === 'bank');
E.deposit({ date: T, to: nb.code, amount: 1000, source: '3101', kind: 'cash', memo: 'فتح حساب' });
ok('new bank works as a method', E.cashBalance(nb.code) === 1000 && bs());
const ne = E.saveAccount({ name: 'مصروف جديد للفحص', parent: '54' });
ok('new expense account usable', E.EXPENSE_ACCS.includes(ne.code));
E.saveAccount({ code: '1111', name: 'بنك CIB الرئيسي' });
ok('owner renames a system account', E.accLabel('1111') === 'بنك CIB الرئيسي');
ok('system account cannot be deleted', !!refused(() => E.deleteAccount('1111')));
ok('used account cannot be deleted', !!refused(() => E.deleteAccount(nb.code)));
E.deleteAccount(ne.code);
ok('unused custom account deleted', !E.EXPENSE_ACCS.includes(ne.code));
as('accountant');
ok('accountant cannot edit the chart', !!refused(() => E.saveAccount({ name: 'حساب', parent: '54' })));
const snap = JSON.parse(JSON.stringify(S())); E.reset(); E.setState(snap);
ok('chart survives a reload', E.accLabel('1111') === 'بنك CIB الرئيسي' && E.LEAF.has(nb.code) && bs());

/* ---------- phase 3: butchery runs ---------- */
E.reset(); as('storekeeper');
const calfSup = S().partners.find(p => p.type === 'supplier');
const calfPo = E.purchase({ date: T, supplierId: calfSup.id, ref: 'CALF', lines: [{ itemId: S().items.find(i => i.cat === 'carcass').id, qty: 450000, unitCost: 30000, expDate: E.addDays(T, 10) }] });
as('supervisor');
const L1 = S().lots.find(l => l.id === calfPo.lines[0].lotId); const lotQty0 = L1.qty;
const run0 = E.openButchery({ date: T, lotId: L1.id, qty: 40000, note: 'عجل كبير' });
const R = () => S().docs.butcheries.find(x => x.id === run0.id), run = { id: run0.id };
ok('butchery opens with the calf weight', R().status === 'open' && E.butIn(R()) === 40000 && L1.qty === lotQty0 - 40000);
ok('calf cost moved to WIP, books balanced', E.integrity().every(c => c.ok), JSON.stringify(E.integrity().filter(c => !c.ok)));
const bag = S().items.find(i => i.cat === 'pack' && i.packFor === 500);
E.butcheryPack({ id: run.id, itemId: bag.id, qty: 30 });
ok('bags add to the run cost', E.butCost(R()) > R().inputs[0].value && E.integrity().every(c => c.ok));
const cut = S().items.find(i => i.cat === 'meat' && i.priceRetail > 0 && !i.rework), bone = S().items.find(i => i.cat === 'byproduct');
const fat = E.newCutItem({ name: 'دهن عجل فحص', cat: 'byproduct', sub: 'دهون' });
ok('supervisor adds a new cut item from the run', fat.code.startsWith('RM-') && fat.cat === 'byproduct');
ok('new cut needs a price', !!refused(() => E.newCutItem({ name: 'قطعية بدون سعر', cat: 'meat' })));
E.butcheryOutput({ id: run.id, itemId: cut.id, qty: 25000 });
E.butcheryOutput({ id: run.id, itemId: cut.id, count: 15, packSize: 500, note: '½ كيلو' });
E.butcheryOutput({ id: run.id, itemId: bone.id, qty: 6000 });
const l4 = E.butcheryOutput({ id: run.id, itemId: fat.id, qty: 1500 });
ok('output by count × pack', R().outputs[1].qty === 7500 && R().outputs[1].count === 15);
ok('output cannot exceed input', /أكبر من الداخل/.test(refused(() => E.butcheryOutput({ id: run.id, itemId: bone.id, qty: 1000 })) || ''));
E.butcheryDropOutput({ id: run.id, lineId: l4.id });
ok('drop an output line', R().outputs.length === 3);
E.butcheryOutput({ id: run.id, itemId: fat.id, qty: 1000 });
as('worker'); ok('worker cannot close a butchery run', !!refused(() => E.closeButchery({ id: run.id, date: T })));
as('supervisor');
const cost = E.butCost(R());
E.closeButchery({ id: run.id, date: T });
ok('closed: loss = in − out', R().status === 'closed' && R().loss === 40000 - 39500 && R().inKg === 40000);
ok('outputs got the whole cost, bone 0', R().outputs.reduce((a, o) => a + o.value, 0) === cost && R().outputs.find(o => o.itemId === bone.id).value === 0);
ok('cuts landed as lots', R().outputs.every(o => S().lots.some(l => l.code === o.lotCode)));
ok('books + manufacturing account still match', E.integrity().every(c => c.ok) && E.manufacturingAccount({ from: E.addDays(T, -29), to: T }).check !== false);
ok('closed run refuses more lines', !!refused(() => E.butcheryOutput({ id: run.id, itemId: cut.id, qty: 100 })));

/* ---------- phase 4: packs, open weight, rework, packing worker ---------- */
E.reset(); as('supervisor');
ok('products sell 200/250/½/1 kg', S().items.filter(i => i.cat === 'product').every(i => JSON.stringify(i.packs) === '[200,250,500,1000]'));
ok('rework item exists', S().items.some(i => i.rework));
const prodX = S().items.find(i => i.cat === 'product' && i.group === 'مصنعات');
const B0 = E.createBatch({ date: T, productId: prodX.id, planned: 20000 });
const BB = () => S().docs.batches.find(x => x.id === B0.id), B = { id: B0.id };
const meat = S().items.find(i => i.cat === 'meat' && !i.rework && E.available(i.id, E.whs('raw')) > 30000);
as('worker'); E.issue({ batchId: B.id, itemId: meat.id, qty: 20000, date: T });
const tray = S().items.find(i => i.code === 'PK-330');
ok('meat worker cannot issue packaging', /التقفيل/.test(refused(() => E.issue({ batchId: B.id, itemId: tray.id, qty: 5, date: T })) || ''));
E.finishMeat({ batchId: B.id });
ok('batch moves to packing', BB().status === 'packing');
ok('meat worker cannot issue after handing over', !!refused(() => E.issue({ batchId: B.id, itemId: meat.id, qty: 100, date: T })));
as('packer');
ok('packer cannot issue meat', /مواد تعبئة/.test(refused(() => E.issue({ batchId: B.id, itemId: meat.id, qty: 100, date: T })) || ''));
E.issue({ batchId: B.id, itemId: tray.id, qty: 4, date: T });
ok('packer issues trays', E.issuedOf(BB(), tray.id) === 4);
as('supervisor');
const cost0 = E.batchCostNow(BB());
const rl = E.returnRework({ batchId: B.id, qty: 2000, date: T });
ok('rework back to the chiller at its share of cost', rl.qty === 2000 && rl.value > 0 && E.batchCostNow(BB()) === cost0 - rl.value && E.batchKg(BB()) === 18000);
ok('books balanced after rework', E.integrity().every(c => c.ok));
const bag500 = S().items.find(i => i.packFor === 500), b500 = E.available(bag500.id, E.whs('pack'));
E.closeBatch({ batchId: B.id, date: T, packs: { 500: 20, 750: 4, 200: 10 }, split: [{ wh: E.whs('fg')[0], packs: { 500: 20, 750: 4, 200: 10 } }] });
ok('close with an open weight (750 g trays)', BB().status === 'closed' && BB().output === 10000 + 3000 + 2000 && S().lots.some(l => l.itemId === prodX.id && l.packSize === 750));
ok('bags issued for standard packs only', b500 - E.available(bag500.id, E.whs('pack')) === 20 && !BB().issues.some(i => E.item(i.itemId).packFor === 750));
ok('cost per kg uses net input (after rework)', BB().inputKg === 18000);
ok('books balanced after close', E.integrity().every(c => c.ok));
ok('odd size refused unless open weight', !!refused(() => { const b2 = E.createBatch({ date: T, productId: prodX.id, planned: 1000 }); as('worker'); E.issue({ batchId: b2.id, itemId: meat.id, qty: 1000, date: T }); as('supervisor'); E.closeBatch({ batchId: b2.id, date: T, packs: { 30: 1 } }); }));
as('sales');
const cust2 = S().partners.find(p => p.type === 'customer' && p.terms === 'credit');
const sold = E.invoice({ date: T, customerId: cust2.id, lines: [{ productId: prodX.id, packSize: 750, count: 2 }], method: 'credit' });
ok('open-weight trays sell from stock', sold.lines[0].qty === 1500);
ok('rework can be issued to a new batch', (() => { as('supervisor'); const b3 = E.createBatch({ date: T, productId: prodX.id, planned: 1000 }); as('worker'); E.issue({ batchId: b3.id, itemId: S().items.find(i => i.rework).id, qty: 1000, date: T }); return E.issuedOf(b3, S().items.find(i => i.rework).id) === 1000; })());
// legacy 1.5 kg stock stays sellable
as('owner');
const old = S().lots.find(l => l.packSize === 1000 && E.item(l.itemId).cat === 'product' && l.qty >= 3000);
old.packSize = 1500; old.qty = 3000; old.value = Math.round(old.value); // pretend a pre-November 1.5 kg lot
as('sales');
const s15 = E.invoice({ date: T, customerId: cust2.id, lines: [{ productId: old.itemId, packSize: 1500, count: 1 }], method: 'credit' });
ok('old 1.5 kg stock still sells', s15.lines[0].qty === 1500);
ok('catalog shows only standard packs', E.catalog().products.every(p => p.packs.every(x => [200, 250, 500, 1000].includes(x.size))));

// migration of an old book
const oldBook = JSON.parse(JSON.stringify(S())); delete oldBook.migr; oldBook.items = oldBook.items.filter(i => !i.rework && i.packFor !== 200 && i.packFor !== 250); oldBook.items.filter(i => i.cat === 'product').forEach((i, k) => { i.packs = k === 0 ? [500, 1000, 1500, 2000, 2500] : k === 1 ? [250, 500] : [500, 1000, 1500, 2000]; });
E.setState(oldBook);
ok('old book migrates: packs, bags, rework item', S().items.filter(i => i.cat === 'product').slice(2).every(i => JSON.stringify(i.packs) === '[200,250,500,1000]') && JSON.stringify(S().items.filter(i => i.cat === 'product')[0].packs) === '[200,250,500,1000,2500]' && JSON.stringify(S().items.filter(i => i.cat === 'product')[1].packs) === '[250,500]' && S().items.some(i => i.packFor === 200) && S().items.some(i => i.packFor === 250) && S().items.some(i => i.rework));
const n1 = S().items.length; E.setState(JSON.parse(JSON.stringify(S())));
ok('migration runs once', S().items.length === n1);

as('owner'); const pe = S().items.find(i => i.cat === 'product');
E.saveItem({ ...pe, packs: [250, 500, 750] });
ok('owner sets a product\'s packs (incl. an open weight)', JSON.stringify(E.item(pe.id).packs) === '[250,500,750]');
ok('a product needs at least one pack', !!refused(() => E.saveItem({ ...E.item(pe.id), packs: [] })));
console.log(`november checks: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
