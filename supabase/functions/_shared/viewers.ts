// Boom Meat ERP — Telegram viewers: people the owner invited to SEE alerts and ask the bot, never to approve anything.
// Stored in erp_secrets.tg_viewers as JSON [{ chat, name, at }]. Copies are best effort and never carry buttons.
// deno-lint-ignore-file no-explicit-any

export type Viewer = { chat: string, name: string, at: string };
export const MAX_VIEWERS = 10;
export const VIEWER_NOTE = '👀 للعلم بس · المالك هو اللي بيوافق';

async function secret(admin: any, key: string) { const { data } = await admin.from('erp_secrets').select('value').eq('key', key).maybeSingle(); return data?.value || ''; }

export async function getViewers(admin: any): Promise<Viewer[]> {
  try { const v = JSON.parse(await secret(admin, 'tg_viewers') || '[]'); return Array.isArray(v) ? v.filter(x => x && typeof x.chat === 'string' && x.chat) : []; } catch (_e) { return []; }
}
export async function setViewers(admin: any, list: Viewer[]) {
  await admin.from('erp_secrets').upsert({ key: 'tg_viewers', value: JSON.stringify(list.slice(0, MAX_VIEWERS)) });
}

// a plain-text copy of an owner message to every viewer
export async function copyText(admin: any, text: string) {
  const vs = await getViewers(admin); if (!vs.length) return;
  const token = await secret(admin, 'telegram_token'); if (!token) return;
  for (const v of vs) {
    try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: v.chat, text: text.slice(0, 4000) }) }); } catch (_e) { /* best effort */ }
  }
}

// a photo copy (InstaPay screenshot) without the owner's buttons
export async function copyPhoto(admin: any, bytes: Uint8Array, mime: string, name: string, caption: string) {
  const vs = await getViewers(admin); if (!vs.length) return;
  const token = await secret(admin, 'telegram_token'); if (!token) return;
  for (const v of vs) {
    const fd = new FormData();
    fd.append('chat_id', v.chat);
    fd.append('caption', caption.slice(0, 1000));
    fd.append('photo', new Blob([bytes], { type: mime }), name);
    try { await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: fd }); } catch (_e) { /* best effort */ }
  }
}
