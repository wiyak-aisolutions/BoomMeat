// Paymob (Unified Checkout / Intention API). Keys live only in Edge Function secrets:
// PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY, PAYMOB_HMAC, PAYMOB_INTEGRATION_ID (test-mode values until the owner goes live).
const env = (k: string) => (Deno.env.get(k) || '').trim();

export function paymobReady() { return !!(env('PAYMOB_SECRET_KEY') && env('PAYMOB_PUBLIC_KEY') && env('PAYMOB_HMAC') && env('PAYMOB_INTEGRATION_ID')); }

// order: orderView-like {id, no, name, phone, total (EGP)}; returns {url, intentionId, paymobOrderId, ref, amountCents}
export async function createPayLink(o: { id: string; no: string; name: string; phone: string; total: number }) {
  if (!paymobReady()) throw new Error('paymob_not_configured');
  const amountCents = Math.round(o.total * 100);
  let phone = String(o.phone || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '2' + phone;
  const parts = String(o.name || '').trim().split(/\s+/).filter(Boolean);
  const ref = `${o.id}-${Date.now().toString(36).toUpperCase().slice(-5)}`; // unique per attempt: Paymob rejects a reused reference
  const body = {
    amount: amountCents, currency: 'EGP', payment_methods: [Number(env('PAYMOB_INTEGRATION_ID'))],
    items: [{ name: `Boom Meat order ${o.no}`, amount: amountCents, quantity: 1 }],
    billing_data: { first_name: parts[0] || 'Customer', last_name: parts.slice(1).join(' ') || 'NA', email: 'orders@boommeat.com', phone_number: '+' + phone,
      apartment: 'NA', floor: 'NA', street: 'NA', building: 'NA', city: 'Cairo', state: 'Cairo', country: 'EG' },
    special_reference: ref,
    notification_url: `${env('SUPABASE_URL')}/functions/v1/paymob`,
  };
  const r = await fetch('https://accept.paymob.com/v1/intention/', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Token ${env('PAYMOB_SECRET_KEY')}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.client_secret) throw new Error('paymob_intention_failed ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  return {
    url: `https://accept.paymob.com/unifiedcheckout/?publicKey=${encodeURIComponent(env('PAYMOB_PUBLIC_KEY'))}&clientSecret=${encodeURIComponent(j.client_secret)}`,
    intentionId: String(j.id || ''), paymobOrderId: String(j.intention_order_id || ''), ref, amountCents,
  };
}

// "Transaction processed" callback: HMAC-SHA512 over these fields in this order, sent as ?hmac=
const FIELDS = ['amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture',
  'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success'];
// deno-lint-ignore no-explicit-any
const get = (o: any, path: string) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
// deno-lint-ignore no-explicit-any
export async function verifyHmac(obj: any, received: string) {
  const secret = env('PAYMOB_HMAC'); if (!secret || !received) return false;
  const msg = FIELDS.map(f => { const v = get(obj, f); return v == null ? '' : String(v); }).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  const hex = Array.from(sig, b => b.toString(16).padStart(2, '0')).join('');
  const want = received.toLowerCase(); if (hex.length !== want.length) return false;
  let d = 0; for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ want.charCodeAt(i);
  return d === 0;
}
