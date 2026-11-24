// Tell the WhatsApp bot (n8n) to message a customer about their order: confirmation, paid, invoice, not received, rejected.
// Best effort: the books are already saved; a failed message is logged by the bot and can be resent from the dashboard.
// deno-lint-ignore no-explicit-any
export async function notifyBot(admin: any, id: string, kind: string) {
  try {
    const { data } = await admin.from('erp_secrets').select('key,value').in('key', ['bot_notify_url', 'shop_key']);
    const m: Record<string, string> = {}; for (const r of data || []) m[r.key] = r.value;
    if (!m.bot_notify_url || !m.shop_key) return { ok: false, error: 'bot not linked' };
    const r = await fetch(m.bot_notify_url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-shop-key': m.shop_key }, body: JSON.stringify({ id, kind }), signal: AbortSignal.timeout(8000) });
    return { ok: r.ok };
  } catch (_e) { return { ok: false, error: 'bot unreachable' }; }
}
