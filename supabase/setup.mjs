// Boom Meat ERP — one-time setup of a fresh Supabase project.
// Usage: SUPABASE_ACCESS_TOKEN=... node supabase/setup.mjs https://<ref>.supabase.co
// Creates the schema, locks sign-ups, creates the starting accounts, the empty live books,
// deploys the `erp` function, and writes config.js + a private accounts file.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const url = (process.argv[2] || '').replace(/\/$/, '');
const pat = process.env.SUPABASE_ACCESS_TOKEN;
const ref = (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/) || [])[1];
if (!ref || !pat) { console.error('usage: SUPABASE_ACCESS_TOKEN=... node supabase/setup.mjs https://<ref>.supabase.co'); process.exit(1); }
const API = `https://api.supabase.com/v1/projects/${ref}`;
const mgmt = async (method, p, body) => {
  const r = await fetch(API + p, { method, headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t}`);
  try { return JSON.parse(t); } catch { return t; }
};
const step = m => console.log('\n▶ ' + m);

step('API keys');
const keys = await mgmt('GET', '/api-keys?reveal=true');
const pickKey = (...tests) => { for (const t of tests) { const k = keys.find(t); if (k && k.api_key) return k.api_key; } return null; };
const anon = pickKey(k => k.name === 'anon', k => k.type === 'publishable');
const service = pickKey(k => k.name === 'service_role', k => k.type === 'secret');
if (!anon || !service) throw new Error('could not read project API keys: ' + JSON.stringify(keys.map(k => [k.name, k.type])));
const H = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

step('schema');
await mgmt('POST', '/database/query', { query: readFileSync(path.join(here, 'schema.sql'), 'utf8') });
const existing = await mgmt('POST', '/database/query', { query: 'select count(*)::int as n from public.erp_state' });
if (existing[0].n > 0) { console.error('erp_state already has data — setup was run before. Stopping so nothing gets overwritten.'); process.exit(1); }

step('auth: no public sign-ups');
await mgmt('PATCH', '/config/auth', { disable_signup: true });

step('accounts');
const words = 'abcdefghjkmnpqrstuvwxyz23456789';
const pw = () => Array.from({ length: 12 }, () => words[randomInt(words.length)]).join('').replace(/^(.{4})(.{4})/, '$1-$2-');
const ACCOUNTS = [
  ['owner', 'المالك', 'owner'], ['accountant', 'المحاسب', 'accountant'], ['store', 'أمين المخزن', 'storekeeper'],
  ['supervisor', 'مشرف الإنتاج', 'supervisor'], ['worker1', 'عامل الإنتاج ١', 'worker'], ['sales', 'المبيعات', 'sales'],
];
const made = [];
for (const [username, name, role] of ACCOUNTS) {
  const password = pw();
  const r = await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email: `${username}@boom-erp.local`, password, email_confirm: true }) });
  const j = await r.json(); if (!r.ok) throw new Error(`create ${username}: ${JSON.stringify(j)}`);
  made.push({ id: j.id, username, name, role, password });
  console.log('  ✓', username);
}
const pr = await fetch(`${url}/rest/v1/profiles`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(made.map(u => ({ user_id: u.id, username: u.username, name: u.name, role: u.role, active: true }))) });
if (!pr.ok) throw new Error('profiles: ' + await pr.text());

step('empty live books');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(path.join(root, 'engine.js'));
const E = globalThis.ERP;
const owner = made[0];
E.liveState({ id: owner.id, username: owner.username, name: owner.name });
for (const u of made.slice(1)) E.upsertUser({ id: u.id, username: u.username, name: u.name, role: u.role, active: true });
const st = await fetch(`${url}/rest/v1/erp_state`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ id: 1, version: 1, state: E.S }) });
if (!st.ok) throw new Error('erp_state: ' + await st.text());
await mgmt('POST', '/database/query', { query: 'update public.erp_ping set version = 1 where id = 1' });

step('deploy function');
copyFileSync(path.join(root, 'engine.js'), path.join(here, 'functions/_shared/engine.js'));
execFileSync('npx', ['--yes', 'supabase@2.122.0', 'functions', 'deploy', 'erp', '--project-ref', ref, '--use-api'], { cwd: root, stdio: 'inherit', env: { ...process.env, SUPABASE_ACCESS_TOKEN: pat } });

step('config.js + accounts file');
writeFileSync(path.join(root, 'config.js'), `/* Boom Meat ERP — server connection (public anon key; data is protected by login + row level security). */\nwindow.BOOM_CONFIG = { url: ${JSON.stringify(url)}, anonKey: ${JSON.stringify(anon)} };\n`);
const priv = path.resolve(root, '..', 'private'); mkdirSync(priv, { recursive: true });
writeFileSync(path.join(priv, 'boom-erp-accounts.txt'), `حسابات سيستم بوم ميت (سرّي — متتبعتش في جروبات)\nاللينك: (لينك الاستضافة)\n\n` + made.map(u => `${u.name}\n  اسم الدخول: ${u.username}\n  الباسورد:   ${u.password}\n`).join('\n'));
console.log('\n✅ done. Accounts saved to', path.join(priv, 'boom-erp-accounts.txt'));
