// Boom Meat ERP — every alert the owner gets on Telegram is also copied to viewers (and nothing else is).
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
const { runOp } = await import(dir + '/supabase/functions/_shared/core.mjs');
E.reset();
const st = JSON.parse(JSON.stringify(E.S)); st.settings.tgChat = '111'; st.settings.telegram = true;
const worker = st.users.find(u => u.role === 'worker');
const store = { version: 1, state: st };
const db = { async load() { return { version: store.version, state: JSON.parse(JSON.stringify(store.state)) }; },
  async save(s, b) { if (b !== store.version) return null; store.state = JSON.parse(JSON.stringify(s)); return ++store.version; }, async log() {}, async snapshot() {} };
const owner = [], copies = [];
const telegram = async (chat, text) => { owner.push([chat, text]); return { ok: true }; };
const copy = async text => { copies.push(text); };
let pass = 0, fail = 0; const ok = (c, cond, d = '') => { if (cond) pass++; else { fail++; console.log('✗', c, d); } };
const b = st.docs.batches.find(x => x.status === 'open'); const ln = b.issues.find(i => !i.reversed);
const profile = { user_id: worker.id, username: worker.username || 'w', name: worker.name, role: 'worker', active: true };
const r = await runOp({ E, db, profile, op: 'requestCorrection', args: [{ batchId: b.id, issueId: ln.id, newQty: ln.qty + 1000, reason: 'غلط في الوزن' }], telegram, copy });
ok('the correction request saved', r.status === 200, r.body);
ok('the owner got it on Telegram', owner.length === 1 && /طلب تصحيح من/.test(owner[0][1]), owner);
ok('the viewers got the same text', copies.length === 1 && copies[0] === owner[0][1], copies);
ok('the alert names who asked', owner[0] && owner[0][1].includes(worker.name));
// telegram off → nobody gets it
store.state.settings.telegram = false; owner.length = 0; copies.length = 0;
const ln2 = store.state.docs.batches.find(x => x.id === b.id).issues.find(i => !i.reversed && i.id !== ln.id);
if (ln2) { await runOp({ E, db, profile, op: 'requestCorrection', args: [{ batchId: b.id, issueId: ln2.id, newQty: ln2.qty + 500, reason: 'غلط تاني' }], telegram, copy });
  ok('alerts switched off reach nobody', owner.length === 0 && copies.length === 0); }
// a failing viewer copy never breaks the owner's save
store.state.settings.telegram = true; owner.length = 0;
const bad = async () => { throw new Error('telegram down'); };
const ln3 = store.state.docs.batches.find(x => x.id === b.id).issues.find(i => !i.reversed && ![ln.id, ln2 && ln2.id].includes(i.id));
if (ln3) { const r3 = await runOp({ E, db, profile, op: 'requestCorrection', args: [{ batchId: b.id, issueId: ln3.id, newQty: ln3.qty + 200, reason: 'غلط تالت' }], telegram, copy: bad });
  ok('a broken viewer copy does not break the save', r3.status === 200 && owner.length === 1); }
console.log(`viewer alert checks: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
