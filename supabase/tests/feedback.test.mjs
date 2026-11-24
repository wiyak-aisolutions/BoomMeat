// Boom Meat ERP — the customer's opinion after a delivery: asked by the bot, kept on the order, bad ones alert the owner.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP;
const { runShop } = await import(dir + '/supabase/functions/_shared/core.mjs');
let pass = 0, fail = 0; const out = [];
const ok = (claim, cond, detail = '') => { if (cond) pass++; else { fail++; out.push(`✗ ${claim}${detail !== '' ? ' — ' + JSON.stringify(detail) : ''}`); } };
const S = () => E.S, T = E.today();
const as = r => { S().currentUser = S().users.find(u => u.role === r).id; };
const tryOp = fn => { const snap = JSON.stringify(S()); try { return { ok: true, r: fn() }; } catch (e) { E.setState(JSON.parse(snap)); return { ok: false, msg: e.message }; } };
E.reset(); as('owner');
const p = S().items.find(i => i.cat === 'product' && E.available(i.id, E.whs('fg'), 1000) >= 8000);
const ord = id => S().docs.orders.find(o => o.id === id);
const order = phone => { const r = E.placeOrder({ phone, name: 'عميل الرأي', address: 'مدينة نصر، شارع ٩، عمارة ٤', method: 'cash', lines: [{ productId: p.id, packSize: 1000, count: 1 }] }); return ord(r.id); };
const deliver = o => { as('sales'); E.decideOrder({ id: o.id, action: 'approve', eta: { text: 'خلال ساعتين' } }); E.decideOrder({ id: o.id, action: 'send' }); E.decideOrder({ id: o.id, action: 'delivered' }); return ord(o.id); };
const PH = '01055556666';

/* before delivery there is nothing to rate */
let o = order(PH);
ok('no opinion question before a delivery', E.catalog(PH).feedback === null);
ok('an opinion needs a delivered order', !tryOp(() => E.orderFeedback({ phone: PH, rating: 3 })).ok);
ok('staff cannot record an opinion before delivery', !tryOp(() => E.decideOrder({ id: o.id, action: 'feedback', rating: 3 })).ok);
o = deliver(o);
ok('delivered, but the bot has not asked yet', E.catalog(PH).feedback === null && E.orderView(o.id).fbAsked === false);

/* the bot asked (after the receipt image went out) */
S().currentUser = 'bot';
E.orderNotified({ id: o.id, kind: 'deliveredpaid', image: true }); o = ord(o.id);
ok('asking is recorded once', !!o.fbAskedAt && o.log.filter(l => l.action === 'fb_asked').length === 1 && !!o.invoiceSentAt);
E.orderNotified({ id: o.id, kind: 'delivered' });
ok('a second notice does not ask twice', ord(o.id).log.filter(l => l.action === 'fb_asked').length === 1);
ok('catalog tells the bot who was asked', E.catalog(PH).feedback && E.catalog(PH).feedback.id === o.id && E.catalog(PH).feedback.rated === false, E.catalog(PH).feedback);
ok('other numbers are not asked', E.catalog('01000000001').feedback === null);
ok('international format is the same customer', E.catalog('201055556666').feedback && E.catalog('201055556666').feedback.id === o.id);

/* a rating tap, then the words */
const alerts0 = S().alerts.length;
let r = E.orderFeedback({ phone: '201055556666', id: o.id, rating: 3, text: '' }); o = ord(o.id);
ok('rating saved on the order', o.feedback.rating === 3 && o.feedback.text === '' && o.feedback.via === 'whatsapp' && r.no === o.no);
ok('still waiting for the words', E.catalog(PH).feedback.rated === true);
E.orderFeedback({ phone: PH, id: o.id, rating: null, text: '  اللحمة   طرية جدا ' }); o = ord(o.id);
ok('words added, rating kept', o.feedback.rating === 3 && o.feedback.text === 'اللحمة طرية جدا');
ok('the bot stops waiting once there are words', E.catalog(PH).feedback === null);
ok('a happy opinion sends no alert', S().alerts.length === alerts0);
ok('the order log shows it', o.log.filter(l => l.action === 'feedback').length === 2);
ok('orderView carries it', E.orderView(o.id).feedback.rating === 3 && E.orderView(o.id).fbAsked === true);
E.orderFeedback({ phone: PH, text: 'اللحمة طرية جدا' });
ok('the same words twice are kept once', ord(o.id).feedback.text === 'اللحمة طرية جدا');
E.orderFeedback({ phone: PH, text: 'والتوصيل سريع' });
ok('more words are appended (found by phone, no id)', ord(o.id).feedback.text === 'اللحمة طرية جدا · والتوصيل سريع');

/* refusals */
ok('bad rating refused', !tryOp(() => E.orderFeedback({ phone: PH, id: o.id, rating: 5 })).ok);
ok('nothing to save refused', !tryOp(() => E.orderFeedback({ phone: PH, id: o.id, rating: null, text: ' ' })).ok);
ok('another phone cannot rate this order', !tryOp(() => E.orderFeedback({ phone: '01000000001', id: o.id, rating: 1 })).ok);
ok('unknown order refused', !tryOp(() => E.orderFeedback({ phone: PH, id: 'nope', rating: 1 })).ok);
ok('long text is cut', (E.orderFeedback({ phone: PH, id: o.id, text: 'ط'.repeat(3000) }), ord(o.id).feedback.text.length <= 800));

/* an unhappy customer: the owner hears at once, and again with the details */
as('owner'); let b = deliver(order('01077778888')); S().currentUser = 'bot';
E.orderNotified({ id: b.id, kind: 'delivered' });
const a0 = S().alerts.length;
E.orderFeedback({ phone: '', id: b.id, rating: 1 }); // a WhatsApp username customer: no phone, the button names the order
ok('bad rating alerts the owner', S().alerts.length === a0 + 1 && S().alerts[a0].level === 'bad' && /مش راضي/.test(S().alerts[a0].text) && S().alerts[a0].ref.id === b.id);
E.orderFeedback({ phone: '01077778888', text: 'الاوردر اتأخر ساعتين' });
ok('the details alert again, with the words', S().alerts.length === a0 + 2 && /اتأخر/.test(S().alerts[a0 + 1].text));
E.orderFeedback({ phone: '01077778888', text: 'الاوردر اتأخر ساعتين' });
ok('repeating the same words does not alert again', S().alerts.length === a0 + 2);

/* the shop endpoint the bot calls */
let saved = JSON.parse(JSON.stringify(S())), version = 1; const sent = [];
const db = { load: async () => ({ version, state: JSON.parse(JSON.stringify(saved)) }), save: async (st, base) => { if (base !== version) return null; saved = JSON.parse(JSON.stringify(st)); return ++version; }, log: async () => {} };
as('owner'); const c = deliver(order('01033334444')); saved = JSON.parse(JSON.stringify(S()));
let sr = await runShop({ E, db, action: 'notified', body: { id: c.id, kind: 'delivered' }, telegram: async (ch, t) => { sent.push(t); return { ok: true }; } });
ok('shop: notified(delivered) accepted', sr.status === 200, sr.body);
sr = await runShop({ E, db, action: 'catalog', body: { phone: '01033334444' } });
ok('shop: catalog carries the question', sr.body.result.feedback && sr.body.result.feedback.id === c.id);
saved.settings.telegram = true; saved.settings.tgChat = '123';
sr = await runShop({ E, db, action: 'feedback', body: { phone: '01033334444', id: c.id, rating: 1, text: 'ناشفة' }, telegram: async (ch, t) => { sent.push(t); return { ok: true }; } });
ok('shop: feedback saved', sr.status === 200 && sr.body.result.rating === 1 && saved.docs.orders.find(x => x.id === c.id).feedback.text === 'ناشفة', sr.body);
ok('shop: the bad opinion reached Telegram', sent.some(t => /مش راضي/.test(t) && /ناشفة/.test(t)), sent);
sr = await runShop({ E, db, action: 'feedback', body: { phone: '01999999999', text: 'حلو' } });
ok('shop: no delivered order → refused, nothing saved', sr.status === 400);
E.setState(saved);

/* staff records an opinion heard on the phone */
as('sales');
E.decideOrder({ id: c.id, action: 'feedback', rating: 2, note: 'قال كويس بس الكمية قليلة' });
ok('staff opinion saved', ord(c.id).feedback.rating === 2 && /الكمية قليلة/.test(ord(c.id).feedback.text) && ord(c.id).feedback.via === 'staff');
as('storekeeper');
ok('other roles cannot', !tryOp(() => E.decideOrder({ id: c.id, action: 'feedback', rating: 3 })).ok);

/* old deliveries are not chased */
as('owner'); const old = ord(c.id); delete old.feedback; old.deliveredAt = E.addDays(T, -4) + 'T12:00';
ok('after 3 days the bot stops waiting for words', E.catalog('01033334444').feedback === null);
ok('but an opinion this week is still saved', tryOp(() => E.orderFeedback({ phone: '01033334444', text: 'كان تمام' })).ok);
old.deliveredAt = E.addDays(T, -9) + 'T12:00'; delete old.feedback;
ok('after a week it needs the order id', !tryOp(() => E.orderFeedback({ phone: '01033334444', text: 'كان تمام' })).ok && tryOp(() => E.orderFeedback({ phone: '01033334444', id: old.id, rating: 3 })).ok);

ok('books balanced', E.integrity().every(x => x.ok), E.integrity().filter(x => !x.ok).map(x => x.name));
console.log(`feedback checks: ${pass} passed, ${fail} failed`); out.forEach(l => console.log(l));
process.exit(fail ? 1 : 0);
