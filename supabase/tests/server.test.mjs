import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const require = createRequire(import.meta.url);
globalThis.localStorage = undefined;
require(dir + '/engine.js');
const E = globalThis.ERP;
const { runOp, runAdmin } = await import(dir + '/supabase/functions/_shared/core.mjs');
// in-memory db
const store = { version: 0, state: JSON.parse(JSON.stringify(E.liveState({ id: 'owner-1', username: 'owner', name: 'المالك' }))) };
const logs = [];
let interfere = null;
const db = {
  async load() { return { version: store.version, state: JSON.parse(JSON.stringify(store.state)) }; },
  async save(st, base) { if (interfere) { const f = interfere; interfere = null; await f(); } if (base !== store.version) return null; store.state = JSON.parse(JSON.stringify(st)); store.version++; return store.version; },
  async log(e) { logs.push(e); },
  async snapshot() {},
};
const profiles = { 'owner-1': { user_id: 'owner-1', username: 'owner', name: 'المالك', role: 'owner', active: true } };
const auth = {
  async create(u, p) { const id = 'u-' + u; return { id }; },
  async upsertProfile(p) { profiles[p.user_id] = p; },
  async getProfile(id) { return profiles[id]; },
  async setBanned() {}, async setPassword() { return {}; }, async setSecret() {},
};
const owner = profiles['owner-1'];
const ok = (name, r) => console.log((r.status === 200 ? 'OK  ' : 'ERR ') + name, r.status === 200 ? '' : r.body.error);
const tgSent = [];
const telegram = async (chat, text) => { tgSent.push(text); return { ok: true }; };
// admin creates users
for (const [u, role] of [['acc', 'accountant'], ['store', 'storekeeper'], ['sup', 'supervisor'], ['worker1', 'worker'], ['sales1', 'sales']])
  ok('create ' + u, await runAdmin({ E, db, profile: owner, op: 'createUser', args: { username: u, password: 'Passw0rd!', name: 'اسم ' + u, role }, auth }));
ok('bad username', await runAdmin({ E, db, profile: owner, op: 'createUser', args: { username: 'A B', password: 'Passw0rd!', name: 'x', role: 'sales' }, auth }));
ok('non-owner admin', await runAdmin({ E, db, profile: profiles['u-acc'], op: 'createUser', args: { username: 'zz1', password: 'Passw0rd!', name: 'x', role: 'sales' }, auth }));
console.log('users in books', store.state.users.map(u => u.username + ':' + u.role).join(', '));
// settings telegram chat
ok('settings', await runOp({ E, db, profile: owner, op: 'updateSettings', args: [{ issueLimitKg: 100, vatRate: 14, telegram: true, tgChat: '123', company: {} }] }));
// partners & opening
ok('customer', await runOp({ E, db, profile: profiles['u-sales1'], op: 'savePartner', args: [{ type: 'customer', name: 'جاست سماش', kind: 'wholesale', terms: 'credit' }] }));
ok('supplier', await runOp({ E, db, profile: profiles['u-store'], op: 'savePartner', args: [{ type: 'supplier', name: 'مزرعة الوادي', items: ['it_RM-101', 'it_RM-102', 'it_RM-106', 'it_SP-201'] }] }));
const T = E.today(), sup = () => store.state.partners.find(p => p.type === 'supplier'), cus = () => store.state.partners.find(p => p.name === 'جاست سماش');
ok('worker cannot opening', await runOp({ E, db, profile: profiles['u-worker1'], op: 'openingBalances', args: [{ date: T, cash: 100 }] }));
ok('opening', await runOp({ E, db, profile: profiles['u-acc'], op: 'openingBalances', args: [{ date: T, cash: 5000000, bank: 200000000, stock: [{ itemId: 'it_PK-310', qty: 2000, unitCost: 240, expDate: E.addDays(T, 300) }, { itemId: 'it_PK-305', qty: 2000, unitCost: 180, expDate: E.addDays(T, 300) }, { itemId: 'it_PK-390', qty: 5000, unitCost: 60, expDate: E.addDays(T, 300) }] }] }));
ok('purchase', await runOp({ E, db, profile: profiles['u-store'], op: 'purchase', args: [{ date: T, supplierId: sup().id, ref: 'WD-1', lines: [{ itemId: 'it_RM-101', qty: 300000, unitCost: 33000, expDate: E.addDays(T, 8) }, { itemId: 'it_RM-102', qty: 200000, unitCost: 34000, expDate: E.addDays(T, 8) }, { itemId: 'it_RM-106', qty: 50000, unitCost: 9500, expDate: E.addDays(T, 8) }, { itemId: 'it_SP-201', qty: 20000, unitCost: 15000, expDate: E.addDays(T, 90) }] }] }));
for (const l of store.state.lots.filter(l => l.wh === 'W1')) ok('transfer ' + l.code, await runOp({ E, db, profile: profiles['u-store'], op: 'transfer', args: [{ date: T, lotId: l.id, qty: l.qty, toWh: 'W2' }] }));
let r = await runOp({ E, db, profile: profiles['u-sup'], op: 'createBatch', args: [{ date: T, productId: 'it_FG-401', planned: 150000 }] }); ok('batch', r); const bid = r.body.result.id;
// concurrency: worker issue while another save sneaks in
interfere = async () => { const row = await db.load(); E.setState(row.state); E.S.currentUser = 'u-store'; E.savePartner({ type: 'supplier', name: 'مورد متزامن', items: ['it_SP-207'] }); await db.save(E.S, row.version); };
r = await runOp({ E, db, profile: profiles['u-worker1'], op: 'issue', args: [{ batchId: bid, itemId: 'it_RM-101', qty: 110000 }], telegram }); ok('issue with conflict retry', r);
console.log('both saved:', store.state.partners.some(p => p.name === 'مورد متزامن'), store.state.docs.batches[0].issues.length === 1, 'telegram sent', tgSent.length, 'alert tg', store.state.alerts.map(a => a.tg).join(','));
ok('issue2', await runOp({ E, db, profile: profiles['u-worker1'], op: 'issue', args: [{ batchId: bid, itemId: 'it_RM-102', qty: 30000 }], telegram }));
ok('issue3', await runOp({ E, db, profile: profiles['u-worker1'], op: 'issue', args: [{ batchId: bid, itemId: 'it_SP-201', qty: 3000 }], telegram }));
ok('worker cannot close', await runOp({ E, db, profile: profiles['u-worker1'], op: 'closeBatch', args: [{ batchId: bid, date: T, packs: { 1000: 70, 500: 136 } }] }));
ok('close', await runOp({ E, db, profile: profiles['u-sup'], op: 'closeBatch', args: [{ batchId: bid, date: T, packs: { 1000: 70, 500: 136 } }] }));
ok('worker cannot invoice', await runOp({ E, db, profile: profiles['u-worker1'], op: 'invoice', args: [{ date: T, customerId: cus().id, lines: [{ productId: 'it_FG-401', packSize: 1000, count: 5 }], method: 'credit' }] }));
ok('invoice', await runOp({ E, db, profile: profiles['u-sales1'], op: 'invoice', args: [{ date: T, customerId: cus().id, lines: [{ productId: 'it_FG-401', packSize: 1000, count: 20 }], method: 'credit' }] }));
ok('unknown op', await runOp({ E, db, profile: owner, op: 'reset', args: [] }));
ok('deactivate worker', await runAdmin({ E, db, profile: owner, op: 'updateUser', args: { id: 'u-worker1', role: 'worker', active: false }, auth }));
ok('inactive worker blocked', await runOp({ E, db, profile: profiles['u-worker1'], op: 'issue', args: [{ batchId: bid, itemId: 'it_RM-101', qty: 1000 }] }));
ok('owner cannot demote self', await runAdmin({ E, db, profile: owner, op: 'updateUser', args: { id: 'owner-1', role: 'sales', active: true }, auth }));
ok('daily check', await runOp({ E, db, profile: owner, op: 'dailyCheck', args: [] }));
E.setState(store.state);
console.log('integrity', E.integrity().every(c => c.ok), 'version', store.state.version, store.version, 'audit who:', [...new Set(store.state.audit.map(a => a.user))].join(','));
console.log('failed ops logged', logs.filter(l => !l.ok).length);
ok('non-owner reset refused', await runOp({ E, db, profile: profiles['u-acc'], op: 'resetBooks', args: [] }));
ok('owner reset', await runOp({ E, db, profile: owner, op: 'resetBooks', args: [] }));
E.setState(store.state);
console.log('after reset: journal', store.state.journal.length, 'lots', store.state.lots.length, 'partners kept', store.state.partners.length, 'backup logged', logs.some(l => l.op === 'backup_before_reset' && l.args.journal.length > 0), 'integrity', E.integrity().every(c => c.ok));
