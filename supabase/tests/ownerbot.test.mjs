// Boom Meat ERP — the owner's Telegram questions get a real answer.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const dir = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
globalThis.localStorage = undefined;
createRequire(import.meta.url)(dir + '/engine.js');
const E = globalThis.ERP; E.reset(); E.S.currentUser = E.S.users.find(u => u.role === 'owner').id;
const { ownerReply, intentOf } = await import(dir + '/supabase/functions/_shared/ownerbot.mjs');
let pass = 0, fail = 0;
const ok = (c, cond, d = '') => { if (cond) pass++; else { fail++; console.log('✗', c, d); } };
const cases = { 'نسيت كلمة السر': 'password', 'نسيت الباسورد': 'password', 'مش عارف ادخل': 'password', 'مخزون': 'stock', 'فاضل كام كيلو ريش': 'stock',
  'الخزنة فيها كام': 'cash', 'مبيعات النهارده': 'sales', 'فيه طلبات؟': 'orders', 'مين عليه فلوس': 'debts', 'التنبيهات': 'alerts', 'انت مين': 'help', '؟؟': 'help', '/start': 'help' };
for (const [q, k] of Object.entries(cases)) ok(`«${q}» → ${k}`, intentOf(q) === k, intentOf(q));
const ask = q => ownerReply(E, q);
ok('a stock question names the item', /ريش الانجوس/.test(ask('مخزون ريش').text));
ok('a bare item name is a stock question', /كتف الانجوس/.test(ask('كتف').text));
ok('cash shows the safe, bank and InstaPay', /الخزنة/.test(ask('الخزنة').text) && /البنك/.test(ask('الخزنة').text) && /إنستاباي/.test(ask('الخزنة').text));
ok('debts list customers', /فلوس عند العملاء/.test(ask('مين عليه فلوس').text));
ok('unknown gets the menu, never silence', !!ask('اشتري عربية').keyboard && !!ask('اشتري عربية').text);
ok('every answer fits one Telegram message', ['مخزون', 'الخزنة', 'مبيعات', 'طلبات', 'تنبيهات', 'عملاء', 'انت مين'].every(q => ask(q).text.length < 4000));
ok('password asks the tg function to handle it', ask('نسيت كلمة السر').intent === 'password');
const before = JSON.stringify(E.S); ['مخزون', 'الخزنة', 'مبيعات', 'طلبات', 'تنبيهات', 'عملاء'].forEach(ask);
ok('answers never change the books', JSON.stringify(E.S) === before);
console.log(`owner bot checks: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
