// Boom Meat ERP — the daily Excel backup: every book as sheets (rows of plain values), each money/qty sheet with a «الإجمالي» row.
// Pure JS on top of the engine so it runs the same in Node tests and in the Deno function that sends it to Telegram.
const egp = p => Math.round(p) / 100;
const kg = g => Math.round(g) / 1000;
const sum = (rows, k) => rows.reduce((s, r) => s + (typeof r[k] === 'number' ? r[k] : 0), 0);
function withTotal(head, rows, numCols) { // numCols: indexes to add up
  if (!rows.length) return [head, ['لا يوجد']];
  const tot = head.map((_, i) => (i === 0 ? 'الإجمالي' : numCols.includes(i) ? Math.round(sum(rows, i) * 1000) / 1000 : ''));
  return [head, ...rows, tot];
}

export function backupSheets(E) {
  const S = E.S, T = E.today(), L = E.ledger({});
  const name = id => { try { return E.partner(id).name; } catch (_e) { return id; } };
  const it = id => { try { return E.item(id); } catch (_e) { return { name: id, unit: 'kg', code: '' }; } };
  const money = E.ACCOUNTS.filter(a => E.LEAF.has(a.code) && a.money);
  const sheets = [];

  // 1. summary
  const cust = S.partners.filter(p => p.type === 'customer'), sup = S.partners.filter(p => p.type === 'supplier');
  const stockV = S.lots.reduce((s, l) => s + (l.qty > 0 ? l.value : 0), 0);
  sheets.push({ name: 'ملخص', rows: [
    ['بوم ميت · نسخة احتياطية', T],
    ['الفلوس المتاحة (خزن + بنوك + محافظ)', egp(money.filter(a => ['cash', 'bank', 'wallet', 'gateway'].includes(a.money)).reduce((s, a) => s + E.cashBalance(a.code), 0))],
    ['علينا للكريدت والقروض', egp(-money.filter(a => ['credit', 'loan'].includes(a.money)).reduce((s, a) => s + E.cashBalance(a.code), 0))],
    ['مستحق على العملاء', egp(cust.reduce((s, p) => s + E.partnerBalance(p.id), 0))],
    ['مستحق للموردين', egp(sup.reduce((s, p) => s + E.partnerBalance(p.id), 0))],
    ['قيمة المخزون', egp(stockV)],
    ['الدفاتر متوازنة', E.integrity().every(c => c.ok) ? 'نعم' : 'لا — راجع فحص الدقة'],
  ] });

  // 2. treasury & banks
  sheets.push({ name: 'الخزنة والبنوك', rows: withTotal(['الحساب', 'الكود', 'النوع', 'الرصيد (ج)'], money.map(a => [a.name, a.code, { cash: 'خزنة', bank: 'بنك', wallet: 'محفظة', gateway: 'أونلاين', credit: 'كريدت (علينا)', loan: 'قرض (علينا)' }[a.money], egp(['credit', 'loan'].includes(a.money) ? -E.cashBalance(a.code) : E.cashBalance(a.code))]), []) });

  // 3-4. customers / suppliers
  const pRows = list => list.map(p => { const t = E.partnerTotals(p.id); return [p.name, p.phone || '', egp(t.billed), egp(t.settled), egp(t.balance)]; });
  sheets.push({ name: 'العملاء', rows: withTotal(['العميل', 'التليفون', 'إجمالي الفواتير', 'اتحصل', 'عليه'], pRows(cust), [2, 3, 4]) });
  sheets.push({ name: 'الموردين', rows: withTotal(['المورد', 'التليفون', 'إجمالي المشتريات', 'اتدفع له', 'له'], pRows(sup), [2, 3, 4]) });

  // 5. invoices
  sheets.push({ name: 'الفواتير', rows: withTotal(['الرقم', 'التاريخ', 'العميل', 'الدفع', 'الكمية (كجم)', 'الإجمالي', 'اتحصل', 'الباقي'],
    S.docs.invoices.map(v => { const paid = E.invoicePaid(v); return [v.no, v.date, name(v.customerId), E.methodName(v.method), kg(v.lines.reduce((s, l) => s + l.qty, 0)), egp(v.total), egp(paid), egp(v.total - paid)]; }), [4, 5, 6, 7]) });

  // 6. purchases, expenses
  sheets.push({ name: 'المشتريات', rows: withTotal(['الرقم', 'التاريخ', 'المورد', 'فاتورة المورد', 'الأصناف', 'الإجمالي'], S.docs.purchases.map(p => [p.no, p.date, name(p.supplierId), p.ref || '', p.lines.map(l => it(l.itemId).name).join('، '), egp(p.total)]), [5]) });
  sheets.push({ name: 'المصروفات', rows: withTotal(['الرقم', 'التاريخ', 'النوع', 'البيان', 'الدفع من', 'المبلغ'], S.docs.expenses.map(x => [x.no, x.date, E.accLabel(x.acc), x.memo || '', E.methodName(x.method), egp(x.amount)]), [5]) });

  // 7. stock (one row per lot)
  sheets.push({ name: 'المخزون', rows: withTotal(['الصنف', 'الكود', 'النوع', 'المخزن', 'الدفعة', 'الكمية', 'الوحدة', 'العبوة (جم)', 'الصلاحية', 'القيمة'],
    S.lots.filter(l => l.qty > 0).map(l => { const i = it(l.itemId); return [i.name, i.code, E.CAT_NAME[i.cat] || '', E.whName(l.wh), l.code, i.unit === 'kg' ? kg(l.qty) : l.qty, i.unit === 'kg' ? 'كجم' : 'قطعة', l.packSize || '', l.expDate || '', egp(l.value)]; }), [9]) });

  // 8. production
  sheets.push({ name: 'التشغيلات', rows: withTotal(['الرقم', 'التاريخ', 'المنتج', 'الحالة', 'الخامات (كجم)', 'الناتج (كجم)', 'الهدر (كجم)', 'التكلفة'],
    S.docs.batches.map(b => [b.no, b.date, it(b.productId).name, { open: 'لحوم', packing: 'تقفيل', closed: 'مقفولة' }[b.status] || b.status, kg(b.status === 'closed' ? b.inputKg : E.batchKg(b)), b.status === 'closed' ? kg(b.output) : '', b.status === 'closed' ? kg(b.waste) : '', egp(b.status === 'closed' ? b.cost : E.batchCostNow(b))]), [4, 5, 6, 7]) });
  sheets.push({ name: 'الجزارة', rows: withTotal(['الرقم', 'التاريخ', 'الحالة', 'الداخل (كجم)', 'الناتج (كجم)', 'الفقد (كجم)', 'التكلفة'],
    (S.docs.butcheries || []).map(r => [r.no, r.date, r.status === 'open' ? 'شغالة' : 'مقفولة', kg(E.butIn(r)), kg(E.butOut(r)), kg(E.butIn(r) - E.butOut(r)), egp(E.butCost(r))]), [3, 4, 5, 6]) });

  // 9. advances & custody
  const people = (S.staff || []).map(p => [p.name, egp(E.personBalance('advance', p.id)), egp(E.personBalance('custody', p.id))]).filter(r => r[1] || r[2]);
  sheets.push({ name: 'السلف والعهد', rows: withTotal(['الاسم', 'سلف عليه', 'عهدة معاه'], people, [1, 2]) });

  // 10. full journal, line by line
  sheets.push({ name: 'القيود', rows: withTotal(['التاريخ', 'رقم القيد', 'البيان', 'كود الحساب', 'الحساب', 'الطرف', 'مدين', 'دائن'],
    S.journal.flatMap(j => j.lines.map(l => [j.date, j.no, j.memo, l.acc, E.accLabel(l.acc), l.partner ? name(l.partner) : '', egp(l.dr), egp(l.cr)])), [6, 7]) });

  // 11. trial balance
  sheets.push({ name: 'ميزان المراجعة', rows: withTotal(['الكود', 'الحساب', 'مدين', 'دائن'], [...E.LEAF].sort().map(c => { const a = L[c] || { dr: 0, cr: 0 }; const n = a.dr - a.cr; return [c, E.accLabel(c), egp(Math.max(n, 0)), egp(Math.max(-n, 0))]; }).filter(r => r[2] || r[3]), [2, 3]) });
  return sheets;
}

// should the hourly trigger send now? 11:00 Cairo, once per day
// due from 11:00 Cairo until it goes out: a failed hour (Telegram down) is retried the next hour, not skipped for the day
export const backupDue = (cairo, lastDay) => cairo.time.slice(0, 2) >= '11' && lastDay !== cairo.date;
