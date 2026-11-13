// Boom Meat ERP — WhatsApp bot endpoint (called by n8n, not by browsers).
// Deployed WITHOUT JWT verification; every call must carry the shared key from erp_secrets.shop_key.
// catalog/status are read-only; order adds a PENDING order (no stock or ledger effect) and alerts the owner.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import '../_shared/engine.js';
import { runShop } from '../_shared/core.mjs';

// deno-lint-ignore no-explicit-any
const E = (globalThis as any).ERP;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function secret(key: string) { const { data } = await admin.from('erp_secrets').select('value').eq('key', key).maybeSingle(); return data?.value || ''; }
let snapDay = '';
const db = {
  async load() { const { data, error } = await admin.from('erp_state').select('version,state').eq('id', 1).single(); if (error) throw new Error(error.message); return data; },
  async save(state: unknown, base: number) { const { data, error } = await admin.rpc('erp_save', { p_state: state, p_base: base }); if (error) throw new Error(error.message); return data; },
  async log(entry: Record<string, unknown>) { await admin.from('erp_ops').insert(entry); },
  // one full copy of the books per day: check first with a tiny query, so a normal save does not upload the whole state twice
  async snapshot(day: string, state: unknown, version: number) {
    if (snapDay === day) return;
    const { data } = await admin.from('erp_snapshots').select('day').eq('day', day).maybeSingle();
    if (!data) await admin.from('erp_snapshots').upsert({ day, state, version }, { onConflict: 'day', ignoreDuplicates: true });
    snapDay = day;
  },
};
async function telegram(chat: string, text: string) {
  const token = await secret('telegram_token');
  if (!token) return { ok: false, error: 'مفيش توكن' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) });
    const j = await r.json();
    return j.ok ? { ok: true } : { ok: false, error: j.description || 'فشل الإرسال' };
  } catch (_e) { return { ok: false, error: 'مفيش اتصال بتليجرام' }; }
}
// InstaPay screenshot from WhatsApp: store it privately, attach it to the customer's order, and ask the owner on Telegram
async function uploadProof(b: Record<string, string>) {
  const t = await runShop({ E, db, action: 'proofTarget', body: { phone: b.phone }, telegram });
  const target = t.body?.result;
  if (!target) return json(404, { error: 'no_order' });
  const mime = /^image\/(jpeg|png|webp)$/.test(b.mime || '') ? b.mime : 'image/jpeg';
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(String(b.image || '')), c => c.charCodeAt(0)); } catch (_e) { return json(400, { error: 'bad_image' }); }
  if (!bytes.length || bytes.length > 6 * 1024 * 1024) return json(400, { error: 'bad_image' });
  const path = `orders/${target.id}/${Date.now()}.${mime.split('/')[1].replace('jpeg', 'jpg')}`;
  const up = await admin.storage.from('order-proofs').upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) return json(500, { error: 'upload_failed' });
  const r = await runShop({ E, db, action: 'proof', body: { phone: b.phone, path }, telegram });
  if (r.status !== 200) return json(r.status, r.body);
  const o = r.body.result;
  if (!o.test) {
    const chat = await secret('owner_chat'), token = await secret('telegram_token');
    if (chat && token) {
      const fd = new FormData();
      fd.append('chat_id', chat);
      fd.append('caption', `💳 تحويل إنستاباي · ${o.no}\n${o.name} · ${o.phone}\nالمبلغ المطلوب: ${o.total} ج\n\nالتحويل وصل؟`);
      fd.append('reply_markup', JSON.stringify({ inline_keyboard: [[{ text: 'وصلت ✅', callback_data: `pay:ok:${o.id}` }, { text: 'موصلتش ❌', callback_data: `pay:no:${o.id}` }]] }));
      fd.append('photo', new Blob([bytes], { type: mime }), 'proof.' + path.split('.').pop());
      try { await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: fd }); } catch (_e) { /* the dashboard still shows it */ }
    }
  }
  return json(200, { ok: true, result: o });
}
function same(a: string, b: string) { if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  try {
    const want = await secret('shop_key');
    if (!want || !same(req.headers.get('x-shop-key') || '', want)) return json(401, { error: 'unauthorized' });
    const body = await req.json();
    if (body?.action === 'upload') return await uploadProof(body);
    const r = await runShop({ E, db, action: body?.action, body, telegram });
    return json(r.status, r.body);
  } catch (e) { return json(500, { error: (e as Error).message || 'خطأ في السيرفر' }); }
});
