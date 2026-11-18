// Boom Meat ERP — security checks (Nov 2026): who downloads what, who may call what, and the public doors.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
const { runOp, runState, runShop, requestGate, sameSecret, OPS } = await import(dir + '/supabase/functions/_shared/core.mjs');
let pass = 0, fail = 0;
const ok = (c, cond, d = '') => { if (cond) pass++; else { fail++; console.log('✗ ' + c + (d ? ' — ' + d : '')); } };
const T = E.today();

/* ---------- a busy set of books with marked ("canary") money values ---------- */
E.reset(); const S0 = E.S;
const owner = S0.users.find(u => u.role === 'owner');
S0.currentUser = owner.id;
const meat = S0.items.find(i => i.cat === 'meat' && !i.rework && E.available(i.id, E.whs('raw')) > 60000), prod = S0.items.find(i => i.cat === 'product' && E.available(i.id, E.whs('fg'), 500) >= 5000);
const cust = S0.partners.find(p => p.type === 'customer' && p.terms === 'credit'), sup = S0.partners.find(p => p.type === 'supplier');
if (sup.items && !sup.items.includes(meat.id)) sup.items.push(meat.id);
E.saveItem({ ...meat, fixedCost: 77771 });
E.purchase({ date: T, supplierId: sup.id, ref: 'SEC', lines: [{ itemId: meat.id, qty: 10000, unitCost: 77773, expDate: E.addDays(T, 9) }] });
const inv = E.invoice({ date: T, customerId: cust.id, method: 'credit', lines: [{ productId: prod.id, packSize: 500, count: 2, pricePerKg: 55553 }] });
E.expense({ date: T, acc: (E.EXPENSE_ACCS[0].code || E.EXPENSE_ACCS[0]), amount: 77779, method: 'cash', memo: 'canary expense' });
const lot = S0.lots.find(l => l.itemId === meat.id && l.qty > 30000); const bu = E.openButchery({ date: T, lotId: lot.id, qty: 20000 });
E.placeOrder({ phone: '01055550000', name: 'عميل واتساب', address: 'شارع الفحص ١٢، القاهرة', method: 'cash', lines: [{ productId: prod.id, packSize: 500, count: 1 }] });
S0.settings.tgChat = '999888777'; S0.settings.salesTarget = 77777700;
const BOOKS = JSON.parse(JSON.stringify(E.S));
const user = r => BOOKS.users.find(u => u.role === r) || { id: 'x_' + r, role: r, active: true };
const view = r => E.redactFor(JSON.parse(JSON.stringify(BOOKS)), user(r));

/* ---------- who gets the whole books ---------- */
for (const r of ['owner', 'accountant', 'storekeeper']) ok(r + ' gets the whole books', E.fullBooks(BOOKS, user(r)) && JSON.stringify(view(r)) === JSON.stringify(BOOKS));
for (const r of ['supervisor', 'worker', 'packer', 'sales', 'pending']) ok(r + ' gets a filtered copy', !E.fullBooks(BOOKS, user(r)) && view(r).redacted === true);
ok('a stopped owner account gets nothing whole', !E.fullBooks(BOOKS, { ...user('owner'), active: false }));
ok('an unknown role gets nothing whole', !E.fullBooks(BOOKS, { id: 'z', role: 'admin', active: true }));

/* ---------- what must never be in a filtered copy ---------- */
const moneyAccs = new Set(['1201', '2101']);
for (const r of ['supervisor', 'worker', 'packer', 'sales']) {
  const v = view(r), J = JSON.stringify(v);
  ok(r + ': no stock values', v.lots.every(l => l.value === 0 && l.inValue === 0));
  ok(r + ': journal has only customer/supplier lines', v.journal.every(j => j.lines.every(l => moneyAccs.has(l.acc))));
  ok(r + ': no batch / butchery costs', v.docs.batches.every(b => !b.cost && b.costPerKg == null && b.issues.every(i => !i.value && (i.parts || []).every(p => !p.value))) && (v.docs.butcheries || []).every(x => x.inputs.every(i => !i.value && (i.parts || []).every(p => !p.value))));
  ok(r + ': no invoice cost', v.docs.invoices.every(x => x.cost === 0 && x.lines.every(l => l.cost === 0 && (l.parts || []).every(p => !p.value))));
  ok(r + ': no treasury documents', ['expenses', 'cash', 'depreciation', 'deposits', 'advances', 'custody', 'liabPays', 'openings'].every(k => (v.docs[k] || []).length === 0));
  ok(r + ': no audit log, staff, assets', !v.audit.length && !v.staff.length && !v.assets.length);
  ok(r + ': no Telegram chat id, no sales target', v.settings.tgChat === undefined && v.settings.salesTarget === undefined && !J.includes('999888777'));
  ok(r + ': canary costs absent', !J.includes('77779') && !J.includes('canary expense') && !J.includes('"fixedCost"'), ['77779'].filter(x => J.includes(x)).join(',')); // 77771 is a fixed number = the sale price, which everyone may see
  ok(r + ': items keep sale prices but not fixed costs', v.items.length === BOOKS.items.length && v.items.every(i => i.fixedCost === undefined));
  ok(r + ': stock quantities intact', v.lots.length === BOOKS.lots.length && v.lots.every((l, k) => l.qty === BOOKS.lots[k].qty));
}
{ const v = view('worker'), J = JSON.stringify(v);
  ok('worker: no partners, invoices, purchases, receipts', !v.partners.length && !v.docs.invoices.length && !v.docs.purchases.length && !v.docs.receipts.length && !v.journal.length);
  ok('worker: no purchase cost, no customer name or phone', !J.includes('77773') && !J.includes(cust.name) && !J.includes('01055550000') && !J.includes('عميل واتساب'));
  ok('worker: pending orders only as held stock', v.docs.orders.length === 1 && Object.keys(v.docs.orders[0]).sort().join() === 'id,lines,status');
  ok('worker: no order or account-request alerts', v.alerts.every(a => !['order', 'request', 'change'].includes(a.kind))); }
{ const v = view('sales');
  ok('sales: customers yes, suppliers no', v.partners.length > 0 && v.partners.every(p => p.type === 'customer'));
  ok('sales: invoices with amounts, purchases none', v.docs.invoices.length === BOOKS.docs.invoices.length && v.docs.invoices.some(x => x.total > 0) && !v.docs.purchases.length && !JSON.stringify(v).includes('77773'));
  ok('sales: customer balance still right', (() => { E.setState(v); const b = E.partnerBalance(cust.id); E.setState(JSON.parse(JSON.stringify(BOOKS))); return b === E.partnerBalance(cust.id); })());
  ok('sales: orders with customer details', v.docs.orders.length === 1 && v.docs.orders[0].phone === '01055550000'); }
E.setState(JSON.parse(JSON.stringify(BOOKS)));

/* ---------- the owner's own screen choices drive it ---------- */
{ const st = JSON.parse(JSON.stringify(BOOKS)), w = user('worker'), s = user('sales');
  st.settings.userAccess = { [w.id]: ['worker', 'treasury'] };
  ok('worker given «الخزنة» by the owner gets the whole books', E.fullBooks(st, w));
  st.settings.userAccess = { [w.id]: ['worker', 'customers'], [s.id]: ['stock'] };
  ok('worker given «العملاء» sees customers, still no costs', E.redactFor(st, w).partners.some(p => p.type === 'customer') && E.redactFor(st, w).lots.every(l => l.value === 0));
  ok('sales limited to «المخزون» loses customers and invoices', !E.redactFor(st, s).partners.length && !E.redactFor(st, s).docs.invoices.length);
  st.settings.userAccess = {}; st.settings.access = { customers: ['supervisor'], invoices: ['accountant'], orders: ['accountant'] };
  ok('role screens set by the owner are followed', E.redactFor(st, user('supervisor')).partners.some(p => p.type === 'customer') && !E.redactFor(st, s).partners.length);
  st.settings.userAccess = { [w.id]: ['users', 'settings', 'access'] };
  ok('owner-only screens never unlock anything', !E.fullBooks(st, w) && !E.redactFor(st, w).partners.length); }
{ // the menu in app.js and the server's screen table must be the same list
  const app = readFileSync(dir + '/app.js', 'utf8'), src = app.slice(app.indexOf('const ALL ='), app.indexOf('const ACCESS'));
  const NAV = new Function(src + '; return NAV;')(), m = {}; NAV.forEach(([, items]) => items.forEach(([id, , , roles]) => { m[id] = roles.filter(x => x !== 'owner').sort().join(); }));
  const eng = Object.fromEntries(Object.entries(E.SCREEN_ROLES).map(([k, v]) => [k, v.slice().sort().join()]));
  ok('server screen table = dashboard menu', JSON.stringify(Object.keys(m).sort()) === JSON.stringify(Object.keys(eng).sort()) && Object.keys(m).every(k => m[k] === eng[k]), Object.keys(m).filter(k => m[k] !== eng[k]).join(',')); }

/* ---------- the server door for the books ---------- */
const store = { version: 7, state: JSON.parse(JSON.stringify(BOOKS)) }, logs = [];
const db = { async load() { return { version: store.version, state: JSON.parse(JSON.stringify(store.state)) }; }, async save(st, base) { if (base !== store.version) return null; store.state = JSON.parse(JSON.stringify(st)); return ++store.version; }, async log(e) { logs.push(e); }, async snapshot() {} };
const prof = (r, extra = {}) => { const u = user(r); return { user_id: u.id, username: u.username || r, name: u.name || r, role: r, active: true, ...extra }; };
{ const r = await runState({ E, db, profile: prof('worker') });
  ok('state op: worker gets a filtered copy', r.status === 200 && r.body.version === 7 && r.body.state.redacted === true && !JSON.stringify(r.body.state).includes('77773'));
  const o = await runState({ E, db, profile: prof('owner') }); ok('state op: owner gets everything', o.status === 200 && !o.body.state.redacted && JSON.stringify(o.body.state).includes('77773'));
  ok('state op: pending refused', (await runState({ E, db, profile: prof('pending') })).status === 403);
  ok('state op: stopped account refused', (await runState({ E, db, profile: prof('sales', { active: false }) })).status === 403);
  ok('state op: no profile refused', (await runState({ E, db, profile: null })).status === 403);
  ok('state op: made-up role refused', (await runState({ E, db, profile: prof('worker', { role: 'root' }) })).status === 403);
  ok('state op: books untouched', store.version === 7); }

/* ---------- operations: unknown, malformed, wrong role ---------- */
{ const bad = async (p, op, args) => { const v = store.version, r = await runOp({ E, db, profile: p, op, args }); return r.status !== 200 && store.version === v ? r.body.error : null; };
  ok('unknown op refused', await bad(prof('owner'), 'setState', [{}]) === 'عملية غير معروفة');
  ok('engine internals are not callable', ['setState', 'reset', 'redactFor', 'placeOrder', 'orderCardPaid', 'upsertUser', 'setUser', 'constructor', '__proto__', 'toString'].every(x => !OPS.has(x)));
  for (const a of [null, 'x', 5, [null], [[]], ['x'], [{}, {}, {}, {}, {}]]) ok('malformed args refused cleanly: ' + JSON.stringify(a), /[؀-ۿ]/.test(await bad(prof('owner'), 'invoice', a) || ''), String(await bad(prof('owner'), 'invoice', a)));
  ok('pending account cannot run anything', (await runOp({ E, db, profile: prof('pending'), op: 'updateSelf', args: [{ name: 'xx' }] })).status === 403);
  ok('stopped account cannot run anything', (await runOp({ E, db, profile: prof('owner', { active: false }), op: 'resetBooks', args: [] })).status === 403);
  ok('worker cannot reset the books', !!(await bad(prof('worker'), 'resetBooks', [])));
  ok('sales cannot change settings', !!(await bad(prof('sales'), 'updateSettings', [{ vatRate: 0 }])));
  ok('accountant cannot change screens', !!(await bad(prof('accountant'), 'updateUserAccess', [{ userId: user('worker').id, pages: ['treasury'] }])));
  ok('nobody but the owner edits an item price', !!(await bad(prof('accountant'), 'saveItem', [{ ...BOOKS.items.find(i => i.id === prod.id), priceRetail: 1 }])));
  // alerts
  const unread = () => store.state.alerts.filter(a => !a.read).length, n0 = unread(); ok('there are unread alerts', n0 > 0);
  ok('sales cannot mark everything read', !!(await bad(prof('sales'), 'markAlertsRead', [null])) && unread() === n0);
  ok('worker (no alerts screen) cannot mark alerts', !!(await bad(prof('worker'), 'markAlertsRead', [[store.state.alerts.find(a => !a.read).id]])) && unread() === n0);
  ok('bad alert lists refused', !!(await bad(prof('owner'), 'markAlertsRead', ['x'])) && !!(await bad(prof('owner'), 'markAlertsRead', [[{}]])));
  const one = store.state.alerts.find(a => !a.read).id; await runOp({ E, db, profile: prof('sales'), op: 'markAlertsRead', args: [[one]] });
  ok('sales marks one alert it names', unread() === n0 - 1);
  ok('the daily check still runs for a worker', (await runOp({ E, db, profile: prof('worker'), op: 'dailyCheck', args: [] })).status === 200);
  await runOp({ E, db, profile: prof('accountant'), op: 'markAlertsRead', args: [null] }); ok('accountant marks all read', unread() === 0);
  // batch corrections
  const b = store.state.docs.batches.find(x => x.status === 'open' && x.issues.some(i => !i.reversed)), is = b.issues.find(i => !i.reversed);
  ok('sales cannot file a batch correction', !!(await bad(prof('sales'), 'requestCorrection', [{ batchId: b.id, issueId: is.id, newQty: is.qty - 100, reason: 'فحص أمان' }])));
  ok('accountant cannot file a batch correction', !!(await bad(prof('accountant'), 'requestCorrection', [{ batchId: b.id, issueId: is.id, newQty: is.qty - 100, reason: 'فحص أمان' }])));
  ok('worker can file one (waits for the owner)', (await runOp({ E, db, profile: prof('worker'), op: 'requestCorrection', args: [{ batchId: b.id, issueId: is.id, newQty: is.qty - 100, reason: 'فحص أمان' }] })).status === 200 && store.state.docs.corrections.at(-1).status === 'pending'); }

/* ---------- WhatsApp orders: fake orders cannot lock the catalog ---------- */
{ E.setState(JSON.parse(JSON.stringify(BOOKS))); E.S.currentUser = 'bot';
  const p = E.S.items.find(i => i.id === prod.id), line = [{ productId: p.id, packSize: 500, count: 1 }], free0 = E.catalog('0100').products.find(x => x.id === p.id).packs.find(k => k.size === 500).inStock;
  let made = 0, msg = ''; try { for (let i = 0; i < 80; i++) { E.placeOrder({ phone: '0111' + String(1000000 + i), name: 'وهمي', address: 'شارع الفحص ١٢، القاهرة', method: 'cash', lines: line }); made++; } } catch (e) { msg = e.message; }
  ok('pending orders are capped', made === 59 && /طلبات كتير/.test(msg), made + ' ' + msg);
  ok('a fourth order from one phone is refused', (() => { try { for (let i = 0; i < 4; i++) E.placeOrder({ phone: '01055550000', name: 'وهمي', address: 'شارع الفحص ١٢، القاهرة', method: 'cash', lines: line }); return false; } catch (e) { return true; } })());
  const held = free0 - E.catalog('0100').products.find(x => x.id === p.id).packs.find(k => k.size === 500).inStock; ok('pending orders hold stock', held >= 59, String(held));
  for (const o of E.S.docs.orders) if (o.status === 'pending') o.date = E.addDays(T, -3);
  ok('orders older than two days stop holding stock', E.catalog('0100').products.find(x => x.id === p.id).packs.find(k => k.size === 500).inStock === free0 + 1);
  const shop = await runShop({ E, db, action: 'resetBooks', body: {} }); ok('the bot door cannot run dashboard operations', shop.status === 400);
  for (const a of ['invoice', 'saveItem', 'decideOrder', 'updateSettings', 'state']) ok('bot door refuses «' + a + '»', (await runShop({ E, db, action: a, body: { order: {} } })).status === 400); }

/* ---------- the public account-request form ---------- */
{ const now = 1e12; let log = [], okN = 0;
  for (let i = 0; i < 6; i++) { const g = requestGate(log, now + i * 1000, 'aaa'); log = g.log; if (g.ok) okN++; }
  ok('one address: 3 requests an hour', okN === 3);
  ok('the same address is let in again after an hour', requestGate(log, now + 3601e3, 'aaa').ok);
  log = []; okN = 0; for (let i = 0; i < 20; i++) { const g = requestGate(log, now + i * 1000, 'ip' + i); log = g.log; if (g.ok) okN++; }
  ok('everyone: 8 in ten minutes', okN === 8);
  log = []; okN = 0; for (let i = 0; i < 100; i++) { const g = requestGate(log, now + i * 700e3, 'ip' + i); log = g.log; if (g.ok) okN++; }
  ok('everyone: 30 a day', okN <= 35 && okN >= 30 && requestGate(log, now + 100 * 700e3, 'new').ok === (log.filter(x => now + 100 * 700e3 - x.t < 864e5).length < 30));
  ok('a broken or forged log does not open the gate wider', requestGate('x', now, 'a').ok && requestGate([{ t: now + 1e9, ip: 'a' }, null, 5], now, 'a').log.length === 1 && requestGate(Array.from({ length: 30 }, (_, i) => ({ t: now - i * 1000, ip: 'z' + i })), now, 'a').ok === false);
  ok('secret compare', sameSecret('abc123', 'abc123') && !sameSecret('abc123', 'abc124') && !sameSecret('', '') && !sameSecret(null, null) && !sameSecret('abc', 'abcd') && !sameSecret(undefined, 'undefined')); }

console.log(`security checks: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
