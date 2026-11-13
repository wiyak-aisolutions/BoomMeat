// Boom Meat ERP — Paymob "Transaction processed" callback (deployed WITHOUT JWT verification: Paymob calls it).
// Trust comes only from the HMAC (PAYMOB_HMAC secret). A verified, successful payment marks the WhatsApp order paid:
// pending → prepaid (the invoice and receipt follow on approval); approved → receipt now. Then the customer is told on WhatsApp.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import '../_shared/engine.js';
import { runShop } from '../_shared/core.mjs';
import { copyText } from '../_shared/viewers.ts';
import { notifyBot } from '../_shared/notify.ts';
import { verifyHmac } from '../_shared/paymob.ts';

// deno-lint-ignore no-explicit-any
const E = (globalThis as any).ERP;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
async function secret(key: string) { const { data } = await admin.from('erp_secrets').select('value').eq('key', key).maybeSingle(); return data?.value || ''; }
const db = {
  async load() { const { data, error } = await admin.from('erp_state').select('version,state').eq('id', 1).single(); if (error) throw new Error(error.message); return data; },
  async save(state: unknown, base: number) { const { data, error } = await admin.rpc('erp_save', { p_state: state, p_base: base }); if (error) throw new Error(error.message); return data; },
  async log(entry: Record<string, unknown>) { await admin.from('erp_ops').insert(entry); },
};
async function telegram(chat: string, text: string) {
  const token = await secret('telegram_token');
  if (!token) return { ok: false, error: 'مفيش توكن' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) });
    const j = await r.json(); return j.ok ? { ok: true } : { ok: false, error: j.description || 'فشل الإرسال' };
  } catch (_e) { return { ok: false, error: 'مفيش اتصال بتليجرام' }; }
}

Deno.serve(async (req) => {
  // Paymob also sends the shopper's browser here (GET) when redirection_url is unset; just say thanks.
  if (req.method !== 'POST') return new Response('تم استلام الدفع، ارجع للواتساب 🙏', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  try {
    const hmac = new URL(req.url).searchParams.get('hmac') || '';
    const body = await req.json().catch(() => ({}));
    const obj = body?.obj;
    if (body?.type !== 'TRANSACTION' || !obj) return json(200, { ok: true, ignored: 'not_a_transaction' });
    if (!(await verifyHmac(obj, hmac))) return json(401, { error: 'bad_hmac' });
    if (obj.success !== true || obj.pending === true || obj.is_refunded || obj.is_voided || obj.is_auth) return json(200, { ok: true, ignored: 'not_a_successful_payment' });
    const card = { paymobOrderId: String(obj.order?.id || ''), ref: String(obj.order?.merchant_order_id || ''), txId: String(obj.id || ''),
      amountCents: Number(obj.amount_cents), pan: String(obj.source_data?.pan || '').slice(-4) };
    const r = await runShop({ E, db, action: 'cardPaid', body: { card }, telegram, copy: (t: string) => copyText(admin, t) });
    if (r.status !== 200) return json(200, { ok: false, error: r.body?.error }); // 200 so Paymob stops retrying; the owner got an alert from the engine when it matters
    const o = r.body.result;
    if (o && o.notify) await notifyBot(admin, o.id, o.notify);
    return json(200, { ok: true });
  } catch (e) { return json(500, { error: (e as Error).message || 'خطأ في السيرفر' }); }
});
