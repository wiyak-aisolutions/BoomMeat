// Boom Meat ERP — Supabase Edge Function. Every write to the books goes through here.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import '../_shared/engine.js';
import { runOp, runAdmin } from '../_shared/core.mjs';

// deno-lint-ignore no-explicit-any
const E = (globalThis as any).ERP;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const DOMAIN = 'boom-erp.local';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

let snapDay = '';
const db = {
  async load() {
    const { data, error } = await admin.from('erp_state').select('version,state').eq('id', 1).single();
    if (error) throw new Error('تعذر تحميل البيانات: ' + error.message);
    return data;
  },
  async save(state: unknown, base: number) {
    const { data, error } = await admin.rpc('erp_save', { p_state: state, p_base: base });
    if (error) throw new Error('تعذر الحفظ: ' + error.message);
    return data; // null on version conflict
  },
  async log(entry: Record<string, unknown>) { await admin.from('erp_ops').insert(entry); },
  // one full copy of the books per day: check first with a tiny query, so a normal save does not upload the whole state twice
  async snapshot(day: string, state: unknown, version: number) {
    if (snapDay === day) return;
    const { data } = await admin.from('erp_snapshots').select('day').eq('day', day).maybeSingle();
    if (!data) await admin.from('erp_snapshots').upsert({ day, state, version }, { onConflict: 'day', ignoreDuplicates: true });
    snapDay = day;
  },
};

async function getSecret(key: string) {
  const { data } = await admin.from('erp_secrets').select('value').eq('key', key).maybeSingle();
  return data?.value || '';
}
async function telegram(chat: string, text: string) {
  const token = await getSecret('telegram_token');
  if (!token) return { ok: false, error: 'مفيش توكن' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) });
    const j = await r.json();
    return j.ok ? { ok: true } : { ok: false, error: j.description || 'فشل الإرسال' };
  } catch (_e) { return { ok: false, error: 'مفيش اتصال بتليجرام' }; }
}

const auth = {
  async create(username: string, password: string) {
    const { data, error } = await admin.auth.admin.createUser({ email: `${username}@${DOMAIN}`, password, email_confirm: true });
    if (error) return { error: error.message.includes('already') ? 'اسم المستخدم موجود قبل كده' : error.message };
    return { id: data.user.id };
  },
  async upsertProfile(p: Record<string, unknown>) { const { error } = await admin.from('profiles').upsert(p); if (error) throw new Error(error.message); },
  async getProfile(id: string) { const { data } = await admin.from('profiles').select('*').eq('user_id', id).maybeSingle(); return data; },
  async setBanned(id: string, banned: boolean) { await admin.auth.admin.updateUserById(id, { ban_duration: banned ? '876000h' : 'none' }); },
  async setPassword(id: string, password: string) { const { error } = await admin.auth.admin.updateUserById(id, { password }); return error ? { error: error.message } : {}; },
  async setSecret(key: string, value: string) { await admin.from('erp_secrets').upsert({ key, value }); },
  async deleteUser(id: string) { await admin.auth.admin.deleteUser(id); },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json(401, { error: 'سجل دخول الأول' });
    const { data: profile } = await admin.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    const { op, args } = await req.json();
    if (['createUser', 'updateUser', 'resetPassword', 'setTelegramToken', 'approveRequest', 'rejectRequest', 'tgLinkCode'].includes(op)) {
      const r = await runAdmin({ E, db, profile, op, args, auth });
      return json(r.status, r.body);
    }
    if (op === 'testTelegram') {
      if (!profile || profile.role !== 'owner') return json(403, { error: 'الصلاحية دي للمالك بس' });
      const r = await telegram(String(args?.chat || ''), '✅ بوم ميت: تنبيهات السيستم اتوصلت بتليجرام');
      return json(r.ok ? 200 : 400, r.ok ? { ok: true } : { error: r.error });
    }
    const r = await runOp({ E, db, profile, op, args, telegram });
    return json(r.status, r.body);
  } catch (e) {
    return json(500, { error: (e as Error).message || 'خطأ في السيرفر' });
  }
});
