// Boom Meat ERP — answers the owner's questions on Telegram (read-only).
// ownerReply(E, text) reads the state already loaded into E and returns { text, keyboard? } in HTML.
// Only called for the owner's linked chat; password resets are handled by the tg function itself.

const norm = s => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْـ]/g, '').replace(/[؟?!.,،]/g, ' ').replace(/\s+/g, ' ').trim();
const esc = s => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

export const MENU = { inline_keyboard: [
  [{ text: '📦 المخزون', callback_data: 'q:stock' }, { text: '💰 الخزنة والبنك', callback_data: 'q:cash' }],
  [{ text: '🧾 مبيعات النهارده', callback_data: 'q:sales' }, { text: '🛒 طلبات واتساب', callback_data: 'q:orders' }],
  [{ text: '⚠️ التنبيهات', callback_data: 'q:alerts' }, { text: '👥 فلوس عند العملاء', callback_data: 'q:debts' }],
  [{ text: '🔑 نسيت الباسورد', callback_data: 'q:password' }],
] };

const INTENTS = [
  ['password', /باسورد|باسوورد|كلمه (ال)?سر|الرقم السري|password|نسيت|مش عارف ادخل|مش قادر ادخل/],
  ['orders', /طلب|اوردر|اوردرات|order|واتس/],
  ['sales', /مبيعات|بعنا|بيع|ايراد|فواتير|فاتوره|دخل|ربح|مكسب/],
  ['cash', /خزنه|خزينه|كاش|بنك|انستا|فلوس(نا)? (معانا|فين|في الخزنه)|رصيد|سيوله/],
  ['debts', /عليه فلوس|عليهم|مين عليه|ليهم|عملاء|عميل|ديون|مديونيه|فلوس (عند|برا|بره)|ليا|متحصلش|اجل|موردين|مورد|علينا/],
  ['alerts', /تنبيه|تنبيهات|ناقص|خلصان|قرب يخلص|صلاحيه|منتهي|مشكله/],
  ['stock', /مخزون|مخزن|ستوك|stock|فاضل|عندنا|كام كيلو|كميه|فريزر|ثلاجه/],
  ['help', /^\/?(start|help|menu)$|مساعده|انت مين|بتعمل ايه|تعمل ايه|اوامر|قايمه|^اهلا|^السلام|^هاي|^hi|^hello/],
];

export function intentOf(text) {
  const t = norm(text);
  if (!t) return 'help';
  for (const [k, re] of INTENTS) if (re.test(t)) return k;
  return '';
}

// items whose name words appear in the question ("كام كيلو ريش؟" → ريش الانجوس)
const STOP = new Set(['مخزون', 'المخزون', 'كام', 'فاضل', 'عندنا', 'كيلو', 'كميه', 'منتج', 'خام', 'تام', 'جم', 'كجم', 'في', 'من', 'علي', 'اللي', 'ايه', 'قد']);
function itemsIn(E, text) {
  const words = norm(text).split(' ').filter(w => w.length >= 3 && !STOP.has(w));
  if (!words.length) return [];
  const scored = E.S.items.map(it => {
    const name = norm(it.name).replace(/[()]/g, ' ');
    return { it, hits: words.filter(w => name.split(' ').some(n => n === w || n === 'ال' + w || 'ال' + n === w || (w.length >= 4 && n.startsWith(w)))).length };
  }).filter(x => x.hits > 0);
  const best = Math.max(0, ...scored.map(x => x.hits));
  return scored.filter(x => x.hits === best).map(x => x.it).slice(0, 8);
}

function itemStock(E, it) {
  const lots = E.S.lots.filter(l => l.itemId === it.id && l.qty > 0);
  const byWh = {};
  for (const l of lots) byWh[l.wh] = (byWh[l.wh] || 0) + l.qty;
  const total = lots.reduce((s, l) => s + l.qty, 0);
  let out = `<b>${esc(it.name)}</b>: ${E.fmtQty(total, it.unit)}`;
  if (it.minQty && total < it.minQty) out += ` ⚠️ أقل من الحد الأدنى (${E.fmtQty(it.minQty, it.unit)})`;
  const whs = Object.entries(byWh);
  if (whs.length > 1) out += '\n' + whs.map(([w, q]) => `   · ${esc(E.whName(w))}: ${E.fmtQty(q, it.unit)}`).join('\n');
  if (it.cat === 'product') {
    const packs = E.PACK_SIZES.map(g => [g, E.available(it.id, E.whs('fg'), g)]).filter(([, q]) => q > 0);
    if (packs.length) out += '\n   · عبوات: ' + packs.map(([g, q]) => `${Math.floor(q / g)} × ${g >= 1000 ? g / 1000 + ' كجم' : g + ' جم'}`).join(' · ');
  }
  return out;
}

function stock(E, text) {
  const hit = itemsIn(E, text);
  if (hit.length) return { text: '📦 <b>المخزون دلوقتي</b>\n\n' + hit.map(it => itemStock(E, it)).join('\n\n') };
  const qty = it => E.S.lots.filter(l => l.itemId === it.id && l.qty > 0).reduce((s, l) => s + l.qty, 0);
  const group = (cats, title) => {
    const rows = E.S.items.filter(it => cats.includes(it.cat)).map(it => [it, qty(it)]).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '';
    return `<b>${title}</b>\n` + rows.slice(0, 12).map(([it, q]) => `· ${esc(it.name)}: ${E.fmtQty(q, it.unit)}${it.minQty && q < it.minQty ? ' ⚠️' : ''}`).join('\n') + (rows.length > 12 ? `\n· و${rows.length - 12} صنف كمان` : '');
  };
  const parts = [group(['product'], 'المنتج التام'), group(['meat', 'carcass'], 'الخامات (لحوم)')].filter(Boolean);
  const low = E.stockAlerts().filter(a => a.kind === 'low').length;
  return { text: '📦 <b>المخزون دلوقتي</b>\n\n' + (parts.join('\n\n') || 'المخزن فاضي.') + (low ? `\n\n⚠️ فيه ${low} صنف تحت الحد الأدنى. ابعت «التنبيهات».` : '') + '\n\nعايز صنف معيّن؟ ابعت اسمه، مثلًا: «مخزون ريش».' };
}

function cash(E) {
  const rows = [['1101', 'الخزنة'], ['1102', 'البنك'], ['1103', 'إنستاباي']].map(([c, n]) => [n, E.cashBalance(c)]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  return { text: '💰 <b>الفلوس دلوقتي</b>\n\n' + rows.map(([n, v]) => `· ${n}: ${E.money(v)}`).join('\n') + `\n\n<b>الإجمالي: ${E.money(total)}</b>` };
}

function sales(E) {
  const T = E.today(), M = E.monthStart(T);
  const day = E.incomeStatement({ from: T, to: T }), month = E.incomeStatement({ from: M, to: T });
  const inv = E.S.docs.invoices.filter(v => v.date === T);
  const totalToday = inv.reduce((s, v) => s + v.total, 0);
  return { text: `🧾 <b>مبيعات النهارده</b> (${T})\n\n· ${inv.length} فاتورة بإجمالي ${E.money(totalToday)} شامل الضريبة\n· الإيراد من غير ضريبة: ${E.money(day.revenue)}\n· مجمل الربح: ${E.money(day.gross)}\n\n<b>من أول الشهر</b>\n· الإيراد: ${E.money(month.revenue)}\n· مجمل الربح: ${E.money(month.gross)}\n· صافي الربح: ${E.money(month.net)}` };
}

function orders(E) {
  const all = E.S.docs.orders || [];
  const pending = all.filter(o => o.status === 'pending' && !o.test);
  const unsent = all.filter(o => o.status === 'approved' && !o.sentAt && !o.test);
  const unpaid = all.filter(o => o.status === 'approved' && !o.receiptNo && !o.test);
  const line = o => `· ${esc(o.no)} · ${esc(o.name || o.phone)} · ${E.money(o.total)}${o.method === 'instapay' ? ' · إنستاباي' + (o.proof ? (o.proof.status === 'ok' ? ' ✅' : o.proof.status === 'rejected' ? ' ❌' : ' (صورة التحويل وصلت)') : '') : ' · كاش'}`;
  let out = `🛒 <b>طلبات واتساب</b>\n\n<b>مستنية موافقة: ${pending.length}</b>` + (pending.length ? '\n' + pending.slice(0, 10).map(line).join('\n') : '');
  if (unsent.length) out += `\n\n<b>اتوافق عليها ولسه متبعتتش للعميل: ${unsent.length}</b>\n` + unsent.slice(0, 6).map(line).join('\n');
  if (unpaid.length) out += `\n\n<b>لسه متحصلتش: ${unpaid.length}</b>`;
  return { text: out + '\n\nالمراجعة والموافقة من «طلبات واتساب» في السيستم.' };
}

function alerts(E) {
  const a = E.stockAlerts();
  if (!a.length) return { text: '✅ مفيش تنبيهات. المخزون فوق الحد الأدنى ومفيش حاجة قربت تنتهي صلاحيتها.' };
  const bad = a.filter(x => x.level === 'bad'), warn = a.filter(x => x.level !== 'bad');
  const list = xs => xs.slice(0, 10).map(x => '· ' + esc(x.text)).join('\n') + (xs.length > 10 ? `\n· و${xs.length - 10} كمان` : '');
  return { text: '⚠️ <b>التنبيهات</b>' + (bad.length ? `\n\n🔴 <b>محتاجة تتصرف دلوقتي</b>\n${list(bad)}` : '') + (warn.length ? `\n\n🟠 <b>خلي بالك</b>\n${list(warn)}` : '') };
}

function debts(E) {
  const ps = (E.S.partners || []).map(p => ({ p, b: E.partnerBalance(p.id) })).filter(x => x.b > 0);
  const cust = ps.filter(x => x.p.type === 'customer').sort((a, b) => b.b - a.b), sup = ps.filter(x => x.p.type !== 'customer').sort((a, b) => b.b - a.b);
  const sum = xs => xs.reduce((s, x) => s + x.b, 0);
  const list = xs => xs.slice(0, 8).map(x => `· ${esc(x.p.name)}: ${E.money(x.b)}`).join('\n');
  return { text: `👥 <b>فلوس عند العملاء: ${E.money(sum(cust))}</b>` + (cust.length ? '\n' + list(cust) : '\nمفيش.') + `\n\n🏭 <b>علينا للموردين: ${E.money(sum(sup))}</b>` + (sup.length ? '\n' + list(sup) : '\nمفيش.') };
}

const HELP = 'أهلًا 👋 أنا بوت إدارة <b>بوم ميت</b>، شغال معاك انت بس.\n\nاسألني بكلامك العادي، مثلًا:\n· «مخزون ريش» أو «فاضل كام كتف»\n· «الخزنة فيها كام»\n· «مبيعات النهارده»\n· «فيه طلبات؟»\n· «مين عليه فلوس»\n· «نسيت الباسورد»\n\nأو دوس على زرار:';

export function ownerReply(E, text, intent) {
  const k = intent || intentOf(text);
  if (k === 'password') return { intent: 'password' };
  if (k === 'stock') return stock(E, text);
  if (k === 'cash') return cash(E);
  if (k === 'sales') return sales(E);
  if (k === 'orders') return orders(E);
  if (k === 'alerts') return alerts(E);
  if (k === 'debts') return debts(E);
  if (k === 'help') return { text: HELP, keyboard: MENU };
  // a bare item name ("ريش") is a stock question
  if (itemsIn(E, text).length) return stock(E, text);
  return { text: 'مش فاهم قصدك 🙏 جرّب تسأل بطريقة تانية، أو اختار من هنا:', keyboard: MENU };
}
