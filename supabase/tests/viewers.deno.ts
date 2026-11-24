// Boom Meat ERP — Telegram viewers, end to end through the real tg function.
// Run: deno run -A tests/viewers.deno.ts   (Telegram and the database are faked in memory; nothing leaves this machine)
// deno-lint-ignore-file no-explicit-any
import { createRequire } from 'node:module';

const URL0 = 'http://fake.supabase';
Deno.env.set('SUPABASE_URL', URL0); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service');

// the books: the sample data, owned by owner-1
const require = createRequire(import.meta.url);
(globalThis as any).localStorage = undefined;
require('../../engine.js');
const E = (globalThis as any).ERP; E.reset();
const st = JSON.parse(JSON.stringify(E.S));
st.users.find((u: any) => u.role === 'owner').id = 'owner-1'; st.currentUser = 'owner-1';
const tables: Record<string, any[]> = {
  erp_secrets: [{ key: 'telegram_token', value: 'T' }, { key: 'tg_webhook_secret', value: 'S' }, { key: 'owner_chat', value: '111' },
    { key: 'tg_view_code', value: 'abcdefghjk' }, { key: 'tg_view_exp', value: String(Date.now() + 3600e3) }],
  erp_state: [{ id: 1, version: 1, state: st }],
  profiles: [{ user_id: 'owner-1', username: 'owner', name: 'المالك', role: 'owner', active: true }],
  erp_ops: [],
};
const sent: any[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = (init.method || 'GET').toUpperCase();
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
  if (url.host === 'api.telegram.org') {
    const m = url.pathname.split('/').pop();
    let body: any = {};
    if (init.body instanceof FormData) { for (const [k, v] of init.body.entries()) body[k] = typeof v === 'string' ? v : '[file]'; } else if (init.body) body = JSON.parse(init.body);
    sent.push({ m, ...body });
    return json({ ok: true, result: { message_id: 1 } });
  }
  if (url.origin === URL0 && url.pathname.startsWith('/rest/v1/rpc/erp_save')) {
    const { p_state, p_base } = JSON.parse(init.body); const row = tables.erp_state[0];
    if (row.version !== p_base) return json(null); row.version++; row.state = p_state; return json(row.version);
  }
  if (url.origin === URL0 && url.pathname.startsWith('/rest/v1/')) {
    const t = url.pathname.slice(9); const rows = tables[t] || (tables[t] = []);
    const filters: [string, string, string][] = [];
    for (const [k, v] of url.searchParams) { const m = v.match(/^(eq|neq)\.(.*)$/); if (m && k !== 'select' && k !== 'order' && k !== 'limit') filters.push([k, m[1], decodeURIComponent(m[2])]); }
    const hit = (r: any) => filters.every(([k, op, v]) => op === 'eq' ? String(r[k]) === v : String(r[k]) !== v);
    if (method === 'GET') {
      const out = rows.filter(hit);
      const acc = new Headers(init.headers).get('accept') || '';
      return acc.includes('vnd.pgrst.object') ? (out.length === 1 ? json(out[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406)) : json(out);
    }
    if (method === 'POST') {
      const body = JSON.parse(init.body); const list = Array.isArray(body) ? body : [body];
      const keyCol = t === 'erp_secrets' ? 'key' : t === 'profiles' ? 'user_id' : '';
      for (const b of list) { const i = keyCol ? rows.findIndex(r => r[keyCol] === b[keyCol]) : -1; if (i >= 0) rows[i] = { ...rows[i], ...b }; else rows.push(b); }
      return json(list, 201);
    }
    return json([]);
  }
  return realFetch(input, init);
}) as typeof fetch;

let handler: (req: Request) => Promise<Response> = async () => new Response();
(Deno as any).serve = (h: any) => { handler = h; return {}; };
await import('../functions/tg/index.ts');

const secret = (k: string) => tables.erp_secrets.find(r => r.key === k)?.value;
const viewers = () => JSON.parse(secret('tg_viewers') || '[]');
const hook = (u: any) => handler(new Request('http://x/tg', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'S', 'content-type': 'application/json' }, body: JSON.stringify(u) }));
const msg = (chat: string, text: string, from: any = { first_name: 'Omar', last_name: 'Fekry' }) => hook({ message: { chat: { id: Number(chat) }, text, from } });
const tap = (chat: string, data: string) => hook({ callback_query: { id: 'cb', data, message: { chat: { id: Number(chat) }, message_id: 9 } } });
const to = (chat: string) => sent.filter(s => String(s.chat_id) === chat && s.m === 'sendMessage');
const last = (chat: string) => to(chat).at(-1) || {};
let pass = 0, fail = 0;
const ok = (c: string, cond: unknown, d: unknown = '') => { if (cond) pass++; else { fail++; console.log('✗', c, JSON.stringify(d).slice(0, 300)); } };

// 1. join with the owner's one-time link
await msg('222', '/start vabcdefghjk');
ok('the viewer is stored with their Telegram name', viewers().length === 1 && viewers()[0].chat === '222' && viewers()[0].name === 'Omar Fekry', viewers());
ok('the viewer gets a welcome', /متابع/.test(last('222').text));
ok('the welcome menu has no password button', !JSON.stringify(last('222').reply_markup || {}).includes('q:password') && JSON.stringify(last('222').reply_markup || {}).includes('q:stock'));
ok('the owner is told, with a remove button', /بقى متابع/.test(last('111').text) && JSON.stringify(last('111').reply_markup).includes('vrm:222'));
ok('the link is used up', !secret('tg_view_code'));

// 2. the same link again, from someone else
await msg('333', '/start vabcdefghjk');
ok('a used link does not work twice', viewers().length === 1 && /انتهى/.test(last('333').text));

// 3. the viewer asks
await msg('222', 'مخزون ريش');
ok('the viewer can ask about stock', /ريش/.test(last('222').text) && /المخزون/.test(last('222').text));
await msg('222', 'الخزنة فيها كام');
ok('the viewer can ask about cash', /الخزنة/.test(last('222').text));
await msg('222', 'نسيت الباسورد');
ok('the viewer cannot reset passwords', /المالك بس/.test(last('222').text) && !sent.some(s => s.m === 'sendMessage' && String(s.chat_id) === '222' && /مين اللي نسي/.test(s.text || '')));
await msg('222', 'انت مين');
ok('help for a viewer has no password button', !JSON.stringify(last('222').reply_markup || {}).includes('q:password'));
await tap('222', 'q:sales');
ok('menu buttons work for a viewer', /مبيعات/.test(last('222').text));

// 4. the viewer cannot approve anything
const n0 = sent.length;
await tap('222', 'pay:ok:ORD1');
ok('an approval button from a viewer is refused', sent.slice(n0).some(s => s.m === 'answerCallbackQuery' && /المالك بس/.test(s.text)) && !sent.slice(n0).some(s => s.m === 'sendMessage'));
await tap('222', 'q:password');
ok('the password button from a viewer is refused', sent.slice(n0).filter(s => s.m === 'answerCallbackQuery').length === 2);
await tap('222', 'r:owner:someone');
ok('a role button from a viewer is refused', sent.slice(n0).filter(s => s.m === 'answerCallbackQuery').length === 3);
await tap('222', 'vrm:222');
ok('a viewer cannot remove viewers', viewers().length === 1);

// 5. strangers
await msg('444', 'مخزون');
ok('a stranger still gets the private notice', /خاص بإدارة/.test(last('444').text));

// 6. the owner still has everything
await msg('111', 'نسيت الباسورد');
ok('the owner still gets the password flow', /مين اللي نسي/.test(last('111').text));

// 7. the owner removes the viewer from Telegram
await tap('111', 'vrm:222');
ok('the owner removes a viewer', viewers().length === 0);
ok('the removed viewer is told', /شالك/.test(last('222').text));
await msg('222', 'مخزون');
ok('a removed viewer gets no answers', /خاص بإدارة/.test(last('222').text));

// 8. an expired link
tables.erp_secrets.push({ key: 'tg_view_code', value: 'zzzzzzzzzz' }); tables.erp_secrets.find(r => r.key === 'tg_view_exp').value = String(Date.now() - 1000);
tables.erp_secrets = tables.erp_secrets.filter((r, i, a) => a.findLastIndex(x => x.key === r.key) === i);
await msg('555', '/start vzzzzzzzzzz');
ok('an expired link does not work', viewers().length === 0 && /انتهى/.test(last('555').text));

// 9. the owner's own Telegram cannot become a viewer
tables.erp_secrets.find(r => r.key === 'tg_view_code').value = 'yyyyyyyyyy'; tables.erp_secrets.find(r => r.key === 'tg_view_exp').value = String(Date.now() + 1000e3);
await msg('111', '/start vyyyyyyyyyy');
ok('the owner is never added as a viewer', viewers().length === 0);

// 10. copies: alerts and photos go to viewers without buttons
const { copyText, copyPhoto, setViewers } = await import('../functions/_shared/viewers.ts');
const { createClient } = await import('npm:@supabase/supabase-js@2.45.4');
const admin = createClient(URL0, 'service', { auth: { persistSession: false } });
await setViewers(admin, [{ chat: '222', name: 'Omar', at: '' }, { chat: '666', name: 'Sara', at: '' }]);
const n1 = sent.length;
await copyText(admin, '🟠 بوم ميت\nكتف قرب يخلص');
ok('an alert copy reaches every viewer', sent.slice(n1).filter(s => s.m === 'sendMessage').map(s => s.chat_id).sort().join() === '222,666');
ok('alert copies carry no buttons', sent.slice(n1).every(s => !s.reply_markup));
await copyPhoto(admin, new Uint8Array([1, 2, 3]), 'image/jpeg', 'p.jpg', 'تحويل');
ok('a proof photo reaches viewers without buttons', sent.slice(n1).filter(s => s.m === 'sendPhoto').length === 2 && sent.slice(n1).filter(s => s.m === 'sendPhoto').every(s => !s.reply_markup));

console.log(`viewer checks: ${pass} passed, ${fail} failed`);
Deno.exit(fail ? 1 : 0);
