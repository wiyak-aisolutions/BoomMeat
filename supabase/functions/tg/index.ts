// Boom Meat ERP — public endpoint: account requests from the sign-in page + the Telegram bot webhook.
// Deployed WITHOUT JWT verification; it protects itself: Telegram calls must carry the webhook secret,
// approvals only count from the owner's linked chat, and requests are validated and capped.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import '../_shared/engine.js';
import { syncUser } from '../_shared/core.mjs';

// deno-lint-ignore no-explicit-any
const E = (globalThis as any).ERP;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const DOMAIN = 'boom-erp.local';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function secret(key: string) { const { data } = await admin.from('erp_secrets').select('value').eq('key', key).maybeSingle(); return data?.value || ''; }
async function setSecret(key: string, value: string) { await admin.from('erp_secrets').upsert({ key, value }); }
async function tg(method: string, body: Record<string, unknown>) {
  const token = await secret('telegram_token'); if (!token) return { ok: false };
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return await r.json();
}
const db = {
  async load() { const { data, error } = await admin.from('erp_state').select('version,state').eq('id', 1).single(); if (error) throw new Error(error.message); return data; },
  async save(state: unknown, base: number) { const { data, error } = await admin.rpc('erp_save', { p_state: state, p_base: base }); if (error) throw new Error(error.message); return data; },
  async log(entry: Record<string, unknown>) { await admin.from('erp_ops').insert(entry); },
};
const esc = (s: string) => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));

const ROLE_AR: Record<string, string> = { owner: 'أدمن (كل الصلاحيات)', accountant: 'محاسب', storekeeper: 'أمين مخزن', supervisor: 'مشرف إنتاج', worker: 'عامل إنتاج', sales: 'مبيعات' };
const roleKeyboard = (id: string) => ({ inline_keyboard: [
  [{ text: '💼 محاسب', callback_data: `r:accountant:${id}` }, { text: '🛒 مبيعات', callback_data: `r:sales:${id}` }],
  [{ text: '📦 أمين مخزن', callback_data: `r:storekeeper:${id}` }, { text: '🧑‍🏭 مشرف إنتاج', callback_data: `r:supervisor:${id}` }],
  [{ text: '🔪 عامل إنتاج', callback_data: `r:worker:${id}` }, { text: '👑 أدمن', callback_data: `a:owner:${id}` }],
  [{ text: '✅ قبول وأحدد بعدين', callback_data: `ok:${id}` }, { text: '❌ رفض', callback_data: `no:${id}` }],
] });
const requestText = (p: { name: string, username: string, phone?: string }) => `🆕 <b>طلب حساب جديد · بوم ميت</b>\n\nالاسم: ${esc(p.name)}\nاسم الدخول: <code>${esc(p.username)}</code>\nالتليفون: ${esc(p.phone || '')}\n\nاختار صلاحيته، وهيقدر يدخل على طول:`;
async function sendRequest(chat: string, p: { user_id: string, name: string, username: string, phone?: string }) {
  await tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: requestText(p), reply_markup: roleKeyboard(p.user_id) });
}
async function requestAccount(b: Record<string, string>) {
  const name = String(b.name || '').trim(), username = String(b.username || '').trim().toLowerCase(), password = String(b.password || ''), phone = String(b.phone || '').trim();
  if (name.length < 3 || name.length > 60) return json(400, { error: 'اكتب اسمك (٣ حروف على الأقل)', field: 'name' });
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json(400, { error: 'اسم الدخول: حروف إنجليزي صغيرة وأرقام بس (٣ حروف على الأقل)', field: 'username' });
  if (password.length < 8 || password.length > 72) return json(400, { error: 'الباسورد لازم ٨ حروف على الأقل', field: 'password' });
  if (!/^[0-9+\s-]{8,20}$/.test(phone)) return json(400, { error: 'اكتب رقم تليفون صحيح', field: 'phone' });
  const { count } = await admin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'pending').eq('active', false);
  if ((count || 0) >= 30) return json(429, { error: 'فيه طلبات كتير مستنية. حاول بعدين أو كلم المالك' });
  const { data: exists } = await admin.from('profiles').select('user_id').eq('username', username).maybeSingle();
  if (exists) return json(400, { error: 'اسم الدخول ده متاخد، اختار اسم تاني', field: 'username' });
  const { data, error } = await admin.auth.admin.createUser({ email: `${username}@${DOMAIN}`, password, email_confirm: true, ban_duration: '876000h' });
  if (error || !data.user) return json(400, { error: error && /already/i.test(error.message) ? 'اسم الدخول ده متاخد، اختار اسم تاني' : 'تعذر تسجيل الطلب', field: 'username' });
  const { error: pe } = await admin.from('profiles').insert({ user_id: data.user.id, username, name, role: 'pending', active: false, phone });
  if (pe) { await admin.auth.admin.deleteUser(data.user.id); return json(400, { error: 'تعذر تسجيل الطلب' }); }
  await db.log({ user_id: data.user.id, username, op: 'account_request', args: { name, phone }, ok: true, error: null, version: null });
  const chat = await secret('owner_chat');
  // also show it inside the system: bell, "needs your attention", alerts page
  for (let i = 0; i < 4; i++) {
    const row = await db.load();
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).reduce((o: Record<string, string>, p) => { o[p.type] = p.value; return o; }, {});
    row.state.alerts.push({ id: 'ALR-' + data.user.id.slice(0, 8) + Date.now().toString(36), at: `${now.year}-${now.month}-${now.day}T${now.hour}:${now.minute}`, level: 'info', kind: 'request', text: `طلب حساب جديد: ${name} (${username}) · ${phone}`, ref: { type: 'user', id: data.user.id, no: username }, read: false, tg: chat ? 'sent' : 'noconfig' });
    if ((await db.save(row.state, row.version)) != null) break;
  }
  if (chat) await sendRequest(chat, { user_id: data.user.id, name, username, phone });
  return json(200, { ok: true });
}

async function ownerProfile() { const { data } = await admin.from('profiles').select('*').eq('role', 'owner').eq('active', true).limit(1).maybeSingle(); return data; }

async function telegramUpdate(u: Record<string, any>) {
  const ownerChat = await secret('owner_chat');
  if (u.message) {
    const chat = String(u.message.chat.id), text = String(u.message.text || '');
    const m = text.match(/^\/start\s+([a-z0-9]{10})$/);
    if (m) {
      const code = await secret('tg_link_code'), exp = Number(await secret('tg_link_exp') || 0);
      if (code && m[1] === code && Date.now() < exp) {
        await setSecret('owner_chat', chat); await setSecret('tg_link_code', ''); 
        for (let i = 0; i < 4; i++) { const row = await db.load(); row.state.settings.tgChat = chat; row.state.settings.telegram = true; if ((await db.save(row.state, row.version)) != null) break; }
        await tg('sendMessage', { chat_id: chat, text: '✅ اتربط تليجرام بسيستم بوم ميت. هتوصلك هنا التنبيهات وطلبات الحسابات الجديدة.' });
        // send every request that is still waiting, so nothing made before linking is missed
        const { data: waiting } = await admin.from('profiles').select('*').eq('role', 'pending').eq('active', false).order('created_at');
        for (const p of waiting || []) await sendRequest(chat, p);
        return;
      }
      await tg('sendMessage', { chat_id: chat, text: 'الكود ده انتهى أو غلط. اعمل كود جديد من الإعدادات في السيستم.' }); return;
    }
    if (chat !== ownerChat) await tg('sendMessage', { chat_id: chat, text: 'البوت ده خاص بإدارة بوم ميت.' });
    return;
  }
  const cq = u.callback_query; if (!cq) return;
  const chat = String(cq.message?.chat?.id || '');
  if (!ownerChat || chat !== ownerChat) { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'مش مسموح' }); return; }
  const parts = String(cq.data || '').split(':');
  const act = parts[0], id = parts[parts.length - 1], pickRole = parts.length === 3 ? parts[1] : '';
  const { data: p } = await admin.from('profiles').select('*').eq('user_id', id).maybeSingle();
  if (!p || p.role !== 'pending') { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'الطلب ده اتعامل معاه قبل كده' }); return; }
  const owner = await ownerProfile();
  const mid = cq.message.message_id;
  if (act === 'a') { // admin needs a second tap
    await tg('editMessageText', { chat_id: chat, message_id: mid, parse_mode: 'HTML', text: `⚠️ <b>متأكد إنك عايز ${esc(p.name)} يبقى أدمن؟</b>\n\nالأدمن بيشوف ويعدّل كل حاجة: الأسعار، والحسابات، والمستخدمين، والإعدادات، وتصفير الحسابات.`,
      reply_markup: { inline_keyboard: [[{ text: '👑 أيوه، أدمن', callback_data: `r:owner:${id}` }], [{ text: '↩️ رجوع', callback_data: `back:${id}` }]] } });
    await tg('answerCallbackQuery', { callback_query_id: cq.id }); return;
  }
  if (act === 'back') { await tg('editMessageText', { chat_id: chat, message_id: mid, parse_mode: 'HTML', text: requestText(p), reply_markup: roleKeyboard(id) }); await tg('answerCallbackQuery', { callback_query_id: cq.id }); return; }
  if (act === 'r' && ROLE_AR[pickRole]) {
    await admin.from('profiles').update({ active: true, role: pickRole }).eq('user_id', id);
    await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
    await syncUser({ E, db, profile: owner, user: { id, username: p.username, name: p.name, role: pickRole, active: true } });
    await tg('editMessageText', { chat_id: chat, message_id: mid, parse_mode: 'HTML', text: `✅ <b>اتقبل:</b> ${esc(p.name)} (<code>${esc(p.username)}</code>)\nالصلاحية: <b>${ROLE_AR[pickRole]}</b>\nيقدر يدخل دلوقتي.` });
    await db.log({ user_id: owner?.user_id, username: owner?.username, op: 'approve_request_tg', args: { id, role: pickRole }, ok: true, error: null, version: null });
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'اتقبل · ' + ROLE_AR[pickRole] }); return;
  }
  if (p.active && act !== 'no') { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'اتقبل قبل كده، اختار صلاحيته' }); return; }
  if (act === 'ok') {
    await admin.from('profiles').update({ active: true }).eq('user_id', id);
    await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
    await syncUser({ E, db, profile: owner, user: { id, username: p.username, name: p.name, role: 'pending', active: true } });
    await tg('editMessageText', { chat_id: chat, message_id: mid, parse_mode: 'HTML', text: `✅ <b>اتقبل:</b> ${esc(p.name)} (<code>${esc(p.username)}</code>)\nلسه محتاج صلاحية. اختارها من هنا أو من "المستخدمين والصلاحيات":`, reply_markup: { inline_keyboard: roleKeyboard(id).inline_keyboard.slice(0, 3) } });
    await db.log({ user_id: owner?.user_id, username: owner?.username, op: 'approve_request_tg', args: { id }, ok: true, error: null, version: null });
  } else if (act === 'no') {
    await admin.auth.admin.deleteUser(id);
    await tg('editMessageText', { chat_id: chat, message_id: cq.message.message_id, parse_mode: 'HTML', text: `❌ <b>اترفض:</b> ${esc(p.name)} (<code>${esc(p.username)}</code>)` });
    await db.log({ user_id: owner?.user_id, username: owner?.username, op: 'reject_request_tg', args: { id }, ok: true, error: null, version: null });
  }
  await tg('answerCallbackQuery', { callback_query_id: cq.id, text: act === 'ok' ? 'اتقبل' : 'اترفض' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  try {
    const tgSecret = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (tgSecret !== null) {
      const want = await secret('tg_webhook_secret');
      if (!want || tgSecret !== want) return json(401, { error: 'bad secret' });
      await telegramUpdate(await req.json());
      return json(200, { ok: true });
    }
    const body = await req.json();
    if (body && body.action === 'request') return await requestAccount(body);
    return json(400, { error: 'طلب غير معروف' });
  } catch (e) { return json(500, { error: (e as Error).message || 'خطأ في السيرفر' }); }
});
