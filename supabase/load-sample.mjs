// Fills the LIVE books with the sample month (all items, 30 days of operations), mapped onto the real user accounts.
// Usage: SUPABASE_ACCESS_TOKEN=... node supabase/load-sample.mjs https://<ref>.supabase.co
// Undo any time from inside the system: Settings → Reset the books (removes sample customers/suppliers too).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const url = (process.argv[2] || '').replace(/\/$/, ''); const ref = (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/) || [])[1];
const pat = process.env.SUPABASE_ACCESS_TOKEN; if (!ref || !pat) { console.error('usage'); process.exit(1); }
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${pat}` } })).json();
const service = (keys.find(k => k.name === 'service_role') || keys.find(k => k.type === 'secret')).api_key;
const H = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
const profiles = await (await fetch(`${url}/rest/v1/profiles?select=*`, { headers: H })).json();
const cur = (await (await fetch(`${url}/rest/v1/erp_state?id=eq.1&select=version,state`, { headers: H })).json())[0];
globalThis.localStorage = undefined;
createRequire(import.meta.url)(path.join(here, '..', 'engine.js'));
const E = globalThis.ERP;
E.reset(); // builds the sample books (demo users u1..u6)
const S = E.S;
const byRole = r => profiles.find(p => p.role === r && p.active);
const map = {}; for (const u of S.users) { const p = byRole(u.role); if (!p) throw new Error('no live user for role ' + u.role); map[u.id] = p.user_id; }
const swap = o => { if (Array.isArray(o)) return o.map(swap); if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = swap(o[k]); return o; } return typeof o === 'string' && map[o] ? map[o] : o; };
swap(S);
S.users = profiles.map(p => ({ id: p.user_id, username: p.username, name: p.name, role: p.role, active: p.active }));
S.mode = 'live'; S.currentUser = byRole('owner').user_id;
S.settings = { ...S.settings, ...cur.state.settings };
E.setState(S);
const bad = E.integrity().filter(c => !c.ok); if (bad.length) throw new Error('integrity failed: ' + bad.map(c => c.name).join(', '));
const r = await fetch(`${url}/rest/v1/rpc/erp_save`, { method: 'POST', headers: H, body: JSON.stringify({ p_state: S, p_base: cur.version }) });
const v = await r.json(); if (!r.ok || v == null) throw new Error('save failed: ' + JSON.stringify(v));
await fetch(`${url}/rest/v1/erp_ops`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ username: 'setup', op: 'load_sample_month', args: { from_version: cur.version }, ok: true, version: v }) });
console.log('loaded sample books → version', v, '| invoices', S.docs.invoices.length, '| batches', S.docs.batches.length, '| items with stock', new Set(S.lots.filter(l => l.qty > 0).map(l => l.itemId)).size);
