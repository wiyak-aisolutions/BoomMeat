/* Boom Meat ERP — overview, workflow, alerts, production, inventory, purchasing */
(function () {
'use strict';
const U = window.UI, E = U.E, S = U.S;
const { esc, tx, fm, fm0, kgf, qtyf, pct, df, tf, packName, toG, toP, toI, canCost, isOwner, ic, PAGES, ACTS, page, modal, run, toast, val, table, bars, spark, donut, hbars, lolli, ring, area, statusPill, expPill, itemOptions, partnerOptions, chatter, tabs, searchBox, match, barcode, TG } = U;
const money = p => `${fm0(p)} <em>ج</em>`;
const sumBy = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

/* ========== OVERVIEW ========== */
let HOME_DAYS = 14;
ACTS['home-days'] = n => { HOME_DAYS = +n; U.render(); };
PAGES.home = () => {
  const s = S(), t = E.today(), ms = E.monthStart(t), cost = canCost();
  const inv = s.docs.invoices;
  const invT = inv.filter(v => v.date === t), invM = inv.filter(v => v.date >= ms);
  const lmStart = E.monthStart(E.addDays(ms, -1)), lmSame = E.addDays(lmStart, +t.slice(8) - 1);
  const invLM = inv.filter(v => v.date >= lmStart && v.date <= lmSame);
  const salesM = sumBy(invM, v => v.net), salesLM = sumBy(invLM, v => v.net);
  const ch = salesLM ? (salesM - salesLM) / salesLM * 100 : null;
  const L = E.ledger({});
  const stockV = ['1301', '1302', '1303', '1304', '1305'].reduce((a, c) => a + E.bal(L, c), 0);
  const is = E.incomeStatement({ from: ms, to: t });
  const bM = s.docs.batches.filter(b => b.status === 'closed' && b.closeDate >= ms);
  const inKg = sumBy(bM, b => b.inputKg), outKg = sumBy(bM, b => b.output);
  const open = s.docs.batches.filter(b => b.status === 'open');
  const al = E.stockAlerts(), low = al.filter(a => a.kind === 'low'), exp = al.filter(a => a.kind === 'exp');
  const pend = s.docs.corrections.filter(c => c.status === 'pending');
  const allOk = cost ? E.integrity().every(c => c.ok) : true;
  const days = Array.from({ length: 14 }, (_, i) => E.addDays(t, -i));
  const daily = days.map(d => ({ label: df(d).split(' ')[0], w: sumBy(inv.filter(v => v.date === d && v.kind === 'wholesale'), v => v.net), r: sumBy(inv.filter(v => v.date === d && v.kind === 'retail'), v => v.net) }));
  const h = +E.cairoNow().time.slice(0, 2);
  const greet = h < 12 ? 'صباح الخير' : 'مساء الخير';
  const quick = U.quickFor();
  // KPI rows: money first (owner/accountant), operations second
  const isLM = E.incomeStatement({ from: lmStart, to: lmSame });
  const dl = (a, b) => { if (!b) return ''; const c = (a - b) / Math.abs(b) * 100; return `<span class="delta ${c >= 0 ? 'up' : 'dn'}">${c >= 0 ? '▲' : '▼'} ${Math.abs(c).toFixed(1)}%</span>`; };
  // monthly target: average day of the last 30 days × days in this month, +10%, rounded up to 10,000 EGP
  const d30 = Array.from({ length: 30 }, (_, i) => E.addDays(t, -i)), avgDay = sumBy(inv.filter(v => d30.includes(v.date)), v => v.net) / 30;
  const dim = new Date(+t.slice(0, 4), +t.slice(5, 7), 0).getDate();
  const target = s.settings.salesTarget || Math.ceil(avgDay * dim * 1.1 / 1000000) * 1000000, dayTarget = Math.round(target / dim);
  const tp = target ? salesM / target : 0;
  const k1 = cost ? [
    `<div class="kpi main"><div class="ic">${ic('chart')}</div><small>مبيعات الشهر</small><b>${money(salesM)}</b><span class="t">${ch == null ? 'قبل الضريبة' : `${dl(salesM, salesLM)} عن نفس الفترة اللي فاتت`}</span><div class="goalbar" title="${Math.round(tp * 100)}%"><i style="width:${Math.min(100, tp * 100)}%"></i></div><span class="t">${Math.round(tp * 100)}% من هدف الشهر ${fm0(target)} ج</span></div>`,
    `<div class="kpi"><div class="ic">${ic('tag')}</div><small>مجمل الربح الشهر</small><b>${money(is.gross)}</b><span class="t">${dl(is.gross, isLM.gross)} هامش ${pct(is.gross, is.revenue)}</span></div>`,
    `<div class="kpi"><div class="ic">${ic('cash')}</div><small>صافي الربح الشهر</small><b style="color:var(--${is.net >= 0 ? 'ok' : 'bad'});-webkit-text-fill-color:var(--${is.net >= 0 ? 'ok' : 'bad'})">${money(is.net)}</b><span class="t">${dl(is.net, isLM.net)} بعد كل المصروفات</span></div>`,
    `<div class="kpi"><div class="ic">${ic('box')}</div><small>قيمة المخزون</small><b>${money(stockV)}</b><span class="t ${low.length ? 'w' : ''}">${low.length ? low.length + ' صنف قرب يخلص' : 'كل الأصناف فوق الحد'}</span></div>`,
  ] : [
    `<div class="kpi main"><div class="ic">${ic('batch')}</div><small>تشغيلات جارية</small><b>${open.length}</b><span class="t">${s.docs.batches.filter(b => b.date === t).length} اتفتحت النهارده</span></div>`,
    `<div class="kpi"><div class="ic">${ic('box')}</div><small>إنتاج الشهر</small><b>${kgf(outKg)} <em>كجم</em></b><span class="t">${bM.length} تشغيلة</span></div>`,
    `<div class="kpi"><div class="ic">${ic('knife')}</div><small>هدر الإنتاج</small><b>${pct(inKg - outKg, inKg)}</b><span class="t">${kgf(inKg - outKg)} كجم الشهر ده</span></div>`,
    `<div class="kpi"><div class="ic">${ic('bell')}</div><small>أصناف قربت تخلص</small><b>${low.length}</b><span class="t ${exp.length ? 'w' : ''}">${exp.length} دفعة صلاحيتها قربت</span></div>`,
  ];
  const k2 = cost ? [
    `<div class="kpi sm"><small>مبيعات النهارده</small><b>${money(sumBy(invT, v => v.net))}</b><span class="t">${invT.length} فاتورة</span></div>`,
    `<div class="kpi sm"><small>مديونيات العملاء</small><b>${money(E.bal(L, '1201'))}</b><span class="t">آجل على المطاعم والمحلات</span></div>`,
    `<div class="kpi sm"><small>مستحق للموردين</small><b>${money(E.bal(L, '2101'))}</b><span class="t">الخزنة والبنك: ${fm0(['1101', '1102', '1103'].reduce((a, c) => a + E.bal(L, c), 0))} ج</span></div>`,
    `<div class="kpi sm"><small>إنتاج الشهر</small><b>${kgf(outKg)} <em>كجم</em></b><span class="t ${inKg && (inKg - outKg) / inKg > 0.03 ? 'dn' : 'up'}">هدر ${pct(inKg - outKg, inKg)} · ${bM.length} تشغيلة · ${open.length} جارية</span></div>`,
  ] : [];
  const reqN = U.pendingRequests ? U.pendingRequests() : 0;
  const alertsList = [...(reqN ? [{ level: 'info', text: `${reqN} طلب حساب جديد مستني موافقتك`, go: 'users' }] : []), ...pend.map(c => ({ level: 'info', text: `طلب تصحيح ${c.no} مستني موافقة المالك`, go: 'batch/' + c.batchId })), ...low.map(a => ({ level: a.level, text: a.text, go: 'stock' })), ...exp.map(a => ({ level: a.level, text: a.text, go: 'stock' }))];
  const byWh = E.warehouses().map(w => ({ label: w.name, v: sumBy(s.lots.filter(l => l.wh === w.id && l.qty > 0 && E.item(l.itemId).unit === 'kg'), l => l.qty) }));
  const custMix = [['wholesale', 'مطاعم ومحلات (جملة)', '#D2452F'], ['retail', 'أفراد (قطاعي)', '#F2B33D']].map(([k, l, c]) => ({ label: l, v: sumBy(invM.filter(v => v.kind === k), v => v.net), c }));
  const prodSales = {}; invM.forEach(v => v.lines.forEach(l => { prodSales[l.productId] = (prodSales[l.productId] || 0) + l.qty; }));
  const topProd = Object.entries(prodSales).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, q]) => ({ label: E.item(id).name, v: q }));
  const lastB = s.docs.batches.filter(b => b.status === 'closed').slice(-12).reverse();
  const sales = Array.from({ length: HOME_DAYS }, (_, i) => E.addDays(t, i - HOME_DAYS + 1)).map(d => ({ label: df(d).split(' ')[0], v: sumBy(inv.filter(v => v.date === d), v => v.net) }));
  const CASH = ['1101', '1102', '1103'], cashNow = CASH.reduce((a, c) => a + E.bal(L, c), 0);
  const cashDelta = {}; s.journal.forEach(j => j.lines.forEach(l => { if (CASH.includes(l.acc)) cashDelta[j.date] = (cashDelta[j.date] || 0) + l.dr - l.cr; }));
  const cashSeries = []; { let run = cashNow; for (let i = 0; i < 14; i++) { const d = E.addDays(t, -i); cashSeries.unshift(run); run -= cashDelta[d] || 0; } }
  page('نظرة عامة', `
    <div class="card hero"><button class="me-btn" data-act="me" aria-label="حسابي">${U.avatar(E.me(), 'hero-av')}</button><div style="min-width:0"><h2>${greet}، ${esc(E.me().name)}</h2><p>${U.dfl(t)}</p>
      <div class="chips"><span class="chip"><b>${open.length}</b> تشغيلة جارية</span><span class="chip ${alertsList.length ? 'warn' : ''}"><b>${alertsList.length}</b> تنبيه</span></div></div><span class="grow"></span>
      ${cost ? `<span data-go="reports" class="pill ${allOk ? 'ok' : 'bad'}" role="button" tabindex="0" style="cursor:pointer">${allOk ? '✓ الحسابات متوازنة والمخزون مطابق' : '✗ فيه فرق في الحسابات'}</span>` : ''}</div>
    ${quick.length ? `<div class="qas">${quick.map((q, i) => `<button class="qa ${i % 2 ? 'y' : ''}" data-act="quick" data-arg="${q[0]}"><i>${ic(q[3])}</i><span><b>${q[1]}</b><small>${q[2]}</small></span></button>`).join('')}</div>` : ''}
    <div class="sec-title"><h2>${cost ? 'الأرقام' : 'الإنتاج'}</h2></div>
    <div class="kpis">${k1.join('')}</div>${k2.length ? `<div class="kpis">${k2.join('')}</div>` : ''}
    ${cost ? `<div class="sec-title"><h2>المبيعات مقابل الهدف</h2></div>
    <div class="grid g-main">
      <div class="card"><div class="hd"><h3>المبيعات اليومية</h3><span class="sub">صافي قبل الضريبة · الخط المتقطع هدف اليوم</span><div class="tools"><div class="seg" role="tablist">${[7, 14, 30].map(n => `<button class="${HOME_DAYS === n ? 'on' : ''}" data-act="home-days" data-arg="${n}" role="tab" aria-selected="${HOME_DAYS === n}">${n} يوم</button>`).join('')}</div></div></div>
        <div class="bd">${lolli(sales, { target: dayTarget, fmt: v => fm0(v) + ' ج' })}<div class="chips" style="margin-top:10px"><span class="chip"><b>${sales.filter(d => d.v >= dayTarget).length}</b> يوم وصل للهدف من ${HOME_DAYS}</span><span class="chip"><b>${fm0(sumBy(sales, d => d.v))} ج</b> إجمالي الفترة</span><span class="chip"><b>${fm0(Math.max(...sales.map(d => d.v)))} ج</b> أعلى يوم</span></div></div></div>
      <div style="display:grid;gap:16px;align-content:start">
        <div class="card"><div class="hd"><h3>هدف الشهر</h3><span class="sub">${s.settings.salesTarget ? 'متحدد في الإعدادات' : 'متوسط آخر ٣٠ يوم +١٠٪'}</span></div><div class="bd gauge-card">${ring(tp, { size: 132, sw: 13, label: Math.round(tp * 100) + '%', sub: 'من الهدف' })}<div class="g-side"><div><small>اتباع لحد دلوقتي</small><b>${fm0(salesM)} ج</b></div><div><small>فاضل</small><b>${fm0(Math.max(0, target - salesM))} ج</b></div><div><small>المطلوب في اليوم</small><b>${fm0(Math.max(0, target - salesM) / Math.max(1, dim - +t.slice(8) + 1))} ج</b></div></div></div></div>
        <div class="card"><div class="hd"><h3>الخزنة والبنك</h3><span class="sub">آخر ١٤ يوم</span><div class="tools"><button class="btn sm" data-go="treasury">التفاصيل</button></div></div><div class="bd"><b style="font:800 26px var(--head)">${fm0(cashNow)} <em style="font-size:14px;color:var(--muted)">ج</em></b><div class="chips" style="margin:6px 0 4px">${[['1101', 'خزنة'], ['1102', 'بنك'], ['1103', 'إنستاباي']].map(([c, n]) => `<span class="chip">${n} <b>${fm0(E.bal(L, c))}</b></span>`).join('')}</div>${area(cashSeries)}</div></div>
      </div>
    </div>` : ''}
    <div class="sec-title"><h2>${cost ? 'التنبيهات وتوزيع المبيعات' : 'المبيعات والتنبيهات'}</h2></div>
    <div class="grid g-main">
      <div class="card"><div class="hd"><h3>المبيعات آخر ١٤ يوم</h3><span class="sub">جملة وقطاعي</span><div class="tools legend"><span><i style="background:#D2452F"></i>جملة</span><span><i style="background:#F2B33D"></i>قطاعي</span></div></div>
        <div class="bd">${bars(daily.map(d => ({ label: d.label, v: d.w, v2: d.r, top: d.w + d.r ? Math.round((d.w + d.r) / 100000) + 'k' : '' })), { color: '#D2452F', stack: '#F2B33D', fmt: v => fm0(v) + ' ج' })}</div></div>
      <div class="card"><div class="hd"><h3>محتاج انتباهك</h3><div class="tools"><button class="btn sm" data-go="alerts">كل التنبيهات</button></div></div><div class="bd"><div class="list">
        ${alertsList.slice(0, 8).map(a => `<div class="li" data-go="${a.go}" style="cursor:pointer"><span class="d" style="background:var(--${a.level === 'bad' ? 'bad' : a.level === 'warn' ? 'warn' : 'info'})"></span><div class="x">${tx(a.text)}</div></div>`).join('') || '<div class="empty">كله تمام، مفيش تنبيهات</div>'}
        ${alertsList.length > 8 ? `<div class="crumb" style="padding-top:8px">و ${alertsList.length - 8} تنبيه كمان</div>` : ''}</div></div></div>
    </div>
    <div class="sec-title"><h2>الإنتاج والمخزون</h2></div>
    <div class="grid g3">
      <div class="card"><div class="hd"><h3>تشغيلات جارية</h3><div class="tools"><button class="btn sm" data-go="batches">الكل</button></div></div><div class="bd"><div class="list">
        ${open.map(b => `<div class="li" data-go="batch/${b.id}" style="cursor:pointer"><span class="d" style="background:var(--warn)"></span><div class="x"><b class="mono">${esc(b.no)}</b> · ${esc(E.item(b.productId).name)}<small>اتصرف ${kgf(sumBy(b.issues.filter(i => !i.reversed && E.item(i.itemId).cat !== 'pack'), i => i.qty))} من ${kgf(b.planned)} كجم مخطط</small></div></div>`).join('') || '<div class="empty">مفيش تشغيلات مفتوحة</div>'}</div></div></div>
      <div class="card"><div class="hd"><h3>${cost ? 'تكلفة الكيلو · آخر التشغيلات' : 'ناتج آخر التشغيلات'}</h3></div><div class="bd">${bars(lastB.map(b => ({ label: b.no.replace('T-', ''), v: cost ? b.costPerKg : b.output, top: cost ? fm0(b.costPerKg) : kgf(b.output) })), { fmt: v => cost ? fm0(v) + ' ج/كجم' : kgf(v) + ' كجم' })}</div></div>
      <div class="card"><div class="hd"><h3>المخزون حسب المكان</h3><span class="sub">كجم</span></div><div class="bd">${hbars(byWh, v => kgf(v))}</div></div>
    </div>
    <div class="grid g2">
      <div class="card"><div class="hd"><h3>المبيعات حسب نوع العميل</h3><span class="sub">الشهر ده</span></div><div class="bd">${donut(custMix)}</div></div>
      <div class="card"><div class="hd"><h3>الأكثر مبيعًا الشهر ده</h3><span class="sub">كجم</span></div><div class="bd">${topProd.length ? hbars(topProd, v => kgf(v)) : '<div class="empty">لسه مفيش مبيعات الشهر ده</div>'}</div></div>
    </div>`);
};

/* ========== WORKFLOW + TRACE ========== */
PAGES.flow = () => {
  const s = S(), t = E.today(), ms = E.monthStart(t);
  const L = E.ledger({});
  const whAll = use => s.lots.filter(l => E.whUse(l.wh) === use && l.qty > 0);
  const kgOf = lots => sumBy(lots.filter(l => E.item(l.itemId).unit === 'kg'), l => l.qty);
  const vOf = lots => sumBy(lots, l => l.value);
  const pM = s.docs.purchases.filter(p => p.date >= ms), cM = s.docs.cuttings.filter(c => c.date >= ms);
  const bOpen = s.docs.batches.filter(b => b.status === 'open'), bM = s.docs.batches.filter(b => b.status === 'closed' && b.closeDate >= ms);
  const vM = s.docs.invoices.filter(v => v.date >= ms);
  const cost = canCost();
  const ok = E.integrity().every(c => c.ok);
  const st = (go, title, v, sub, je, who) => `<div class="stage" data-go="${go}" role="link" tabindex="0"><h4>${title}</h4><div class="v">${v}</div><small>${sub}</small>${who ? `<span class="who">${who}</span>` : ''}${je && cost ? `<div class="je">${je}</div>` : ''}</div>`;
  const stages = [
    st('suppliers', 'الموردين', `${s.partners.filter(p => p.type === 'supplier').length} مورد`, 'لحوم · توابل · أكياس · استيكرات', 'مستحق لهم: ' + fm0(E.bal(L, '2101')) + ' ج', 'المحاسب'),
    st('purchases', 'الاستلام بالباركود', `${pM.length} فاتورة`, `الشهر ده · ${fm0(sumBy(pM, p => p.total))} ج`, 'من: المخزون · إلى: المورد', 'أمين المخزن'),
    st('stock', 'مخزن الاستلام', `${kgf(kgOf(whAll('receiving')))} كجم`, 'كل دفعة: إنتاج · دخول · صلاحية', '', 'أمين المخزن'),
    st('cutting', 'التقطيع', `${cM.length} عملية`, `الشهر ده · هدر ${kgf(sumBy(cM, c => c.waste))} كجم`, 'التكلفة تتوزع بالقيمة البيعية', 'مشرف الإنتاج'),
    st('stock', `تلاجات الإنتاج (${E.whs('raw').length})`, `${kgf(kgOf(whAll('raw')))} كجم`, cost ? `قيمتها ${fm0(vOf(whAll('raw')))} ج` : 'لحوم وتوابل', '', 'أمين المخزن'),
    st('worker', 'الصرف على التشغيلة', `${bOpen.length} جارية`, `حد التنبيه ${s.settings.issueLimitKg} كجم للصنف`, 'من: تحت التشغيل · إلى: الخامات', 'العامل من التابلت'),
    st('batches', 'قفل التشغيلة والتعبئة', `${bM.length} تشغيلة`, `الشهر ده · ${kgf(sumBy(bM, b => b.output))} كجم`, 'من: المنتج التام · إلى: تحت التشغيل', 'مشرف الإنتاج'),
    st('stock', `فريزرات المنتج التام (${E.whs('fg').length})`, `${kgf(kgOf(whAll('fg')))} كجم`, 'عبوات ½ لحد ٢.٥ كيلو', cost ? 'قيمته ' + fm0(E.bal(L, '1305')) + ' ج' : '', 'أمين المخزن'),
    st('invoices', 'الفاتورة', `${vM.length} فاتورة`, `الشهر ده · ${fm0(sumBy(vM, v => v.total))} ج`, 'العميل / المبيعات + الضريبة · تكلفة المبيعات / المنتج التام', 'المبيعات'),
    st('customers', 'التحصيل', `${fm0(E.bal(L, '1201'))} ج`, 'مديونيات العملاء الآجل', 'من: الخزنة/البنك · إلى: العميل', 'المحاسب'),
    st('reports', 'القوائم المالية', ok ? '✓ متوازنة' : '✗ فيه فرق', 'دخل · ميزانية · تشغيل ومتاجرة', '', 'المالك والمحاسب'),
  ];
  // trace
  const closed = s.docs.batches.filter(b => b.status === 'closed');
  const tb = closed.find(b => b.id === U.FILTER.traceB) || closed[closed.length - 1];
  let trace = '<div class="empty">مفيش تشغيلات مقفولة</div>';
  if (tb) {
    const ups = []; tb.issues.filter(i => !i.reversed).forEach(i => i.parts.forEach(p => { const l = s.lots.find(x => x.id === p.lotId); ups.push({ i, p, l }); }));
    const sup = {}; ups.forEach(({ l, p }) => { const src = l.src; let pid = null, no = src.no; if (src.type === 'purchase') pid = (s.docs.purchases.find(x => x.id === src.id) || {}).supplierId; if (src.type === 'cutting') { const c = s.docs.cuttings.find(x => x.id === src.id); const cl = c && s.lots.find(x => x.code === c.srcLot); if (cl) { pid = (s.docs.purchases.find(x => x.id === cl.src.id) || {}).supplierId; no = cl.src.no + ' ← ' + src.no; } } const k = (pid || '-') + no; sup[k] = sup[k] || { pid, no, v: 0 }; sup[k].v += p.value; });
    const fgLots = s.lots.filter(l => l.batchId === tb.id).map(l => l.id);
    const downs = s.docs.invoices.filter(v => v.lines.some(l => l.parts.some(p => fgLots.includes(p.lotId)))).map(v => ({ v, q: sumBy(v.lines, l => sumBy(l.parts.filter(p => fgLots.includes(p.lotId)), p => p.qty)) }));
    trace = `<div class="trace">
      <div class="card"><div class="hd"><h3>جاي من</h3><span class="sub">الموردين وفواتيرهم</span></div><div class="bd"><div class="list">${Object.values(sup).map(x => `<div class="li"><span class="d" style="background:var(--yel)"></span><div class="x"><b>${esc(x.pid ? E.partner(x.pid).name : '—')}</b><small class="mono">${esc(x.no)}</small></div>${cost ? `<b class="num">${fm0(x.v)} ج</b>` : ''}</div>`).join('')}</div></div></div>
      <div class="arrow">←</div>
      <div class="card"><div class="hd"><h3>${esc(tb.no)} · ${esc(E.item(tb.productId).name)}</h3></div><div class="bd"><div class="list">${tb.issues.filter(i => !i.reversed).map(i => `<div class="li"><span class="d" style="background:var(--red)"></span><div class="x">${esc(E.item(i.itemId).name)} · ${qtyf(i.qty, E.item(i.itemId).unit)}<small class="mono">${i.parts.map(p => esc(p.code)).join('، ')}</small></div>${cost ? `<b class="num">${fm0(i.value)}</b>` : ''}</div>`).join('')}</div>
        <div class="note ok" style="margin-top:10px">ناتج ${kgf(tb.output)} كجم · هدر ${pct(tb.waste, tb.inputKg)}${cost ? ` · تكلفة الكيلو <b>${fm(tb.costPerKg)} ج</b>` : ''}</div></div></div>
      <div class="arrow">←</div>
      <div class="card"><div class="hd"><h3>راح لمين</h3><span class="sub">الفواتير اللي اتباع فيها</span></div><div class="bd"><div class="list">${downs.map(d => `<div class="li" data-go="invoice/${d.v.id}" style="cursor:pointer"><span class="d" style="background:var(--ok)"></span><div class="x"><b>${esc(E.partner(d.v.customerId).name)}</b><small class="mono">${esc(d.v.no)} · ${df(d.v.date)}</small></div><b class="num">${kgf(d.q)} كجم</b></div>`).join('') || '<div class="empty">لسه متباعش منها حاجة</div>'}</div></div></div>
    </div>`;
  }
  page('مسار البضاعة', `
    <div class="note info">المسار كامل من المورد للفاتورة بأرقام حية. كل مرحلة بتعمل قيدها المحاسبي لوحدها، ودوس على أي مرحلة تفتح شاشتها.</div>
    <div class="flow">${stages.join('')}</div>
    <div class="card"><div class="hd"><h3>تتبع تشغيلة من المورد للعميل</h3><div class="tools"><select class="f" id="trace-b" style="width:auto">${closed.slice().reverse().map(b => `<option value="${b.id}" ${tb && b.id === tb.id ? 'selected' : ''}>${esc(b.no)} · ${esc(E.item(b.productId).name)} · ${df(b.closeDate)}</option>`).join('')}</select></div></div><div class="bd">${trace}</div></div>`);
  const sel = document.getElementById('trace-b'); if (sel) sel.onchange = () => { U.FILTER.traceB = sel.value; U.render(); };
};

/* ========== ALERTS ========== */
PAGES.alerts = () => {
  const s = S(); const tb = tabs('al', [['new', 'الجديدة'], ['all', 'الكل'], ['live', 'المخزون والصلاحية دلوقتي']], 'new');
  const KIND = { limit: 'تجاوز حد الصرف', correction: 'طلب تصحيح', low: 'صنف قرب يخلص', exp: 'صلاحية', request: 'طلب حساب', order: 'طلب واتساب' };
  let body;
  if (tb.cur === 'live') {
    const live = E.stockAlerts();
    body = table('al-live', [{ t: 'النوع', f: a => a.kind === 'low' ? '<span class="pill warn">نقص</span>' : '<span class="pill bad">صلاحية</span>' }, { t: 'التفاصيل', f: a => tx(a.text) }], live, { empty: 'كل الأصناف فوق الحد الأدنى ومفيش صلاحيات قريبة' });
  } else {
    const rows = s.alerts.filter(a => tb.cur === 'all' || !a.read).slice().reverse();
    body = table('al', [
      { t: 'الوقت', f: a => tf(a.at) }, { t: 'النوع', f: a => `<span class="pill ${a.level === 'bad' ? 'bad' : a.level === 'warn' ? 'warn' : 'info'}">${KIND[a.kind] || a.kind}</span>` },
      { t: 'التنبيه', f: a => tx(a.text) + (a.ref && a.ref.type === 'batch' ? ` <a href="#batch/${esc(a.ref.id)}">فتح</a>` : '') + (a.kind === 'request' && isOwner() ? ` <a href="#users">موافقة</a>` : '') + (a.kind === 'order' ? ` <a href="#orders">فتح</a>` : '') },
      { t: 'تليجرام', f: a => { const x = TG[a.tg] || ['mut', '—']; return `<span class="pill ${x[0]}" title="${esc(a.tgErr || '')}">${x[1]}</span>`; } },
      { t: '', f: a => a.read ? '<span class="pill mut">مقروء</span>' : `<button class="btn sm" data-act="al-read" data-arg="${a.id}">تم</button>` },
    ], rows, { empty: 'مفيش تنبيهات جديدة' });
  }
  const st = s.settings;
  page('التنبيهات', `<div class="bar">${tb.html}<span class="grow"></span>${s.alerts.some(a => !a.read) ? '<button class="btn" data-act="al-read">تعليم الكل كمقروء</button>' : ''}</div>
    ${!st.tgToken ? `<div class="note">التنبيهات بتتسجل هنا. ولو عايزها توصل على <b>تليجرام</b>، حط توكن البوت ورقم الشات في ${isOwner() ? '<a href="#settings">الإعدادات</a>' : 'الإعدادات'}.</div>` : ''}
    <div class="card"><div class="bd">${body}</div></div>`);
};
ACTS['al-read'] = id => run(() => E.markAlertsRead(id ? [id] : null));

/* ========== BATCHES ========== */
PAGES.batches = () => {
  const s = S(); const cost = canCost();
  const tb = tabs('bt', [['all', 'الكل'], ['open', 'جارية'], ['closed', 'مقفولة']], 'all');
  const prod = U.FILTER.bprod || '';
  const rows = s.docs.batches.filter(b => (tb.cur === 'all' || b.status === tb.cur) && (!prod || b.productId === prod) && match('bq', b.no, E.item(b.productId).name)).slice().reverse();
  const closed = s.docs.batches.filter(b => b.status === 'closed' && (!prod || b.productId === prod));
  const cols = [
    { t: 'الرقم', f: b => `<b class="mono">${esc(b.no)}</b>` }, { t: 'المنتج', f: b => esc(E.item(b.productId).name) }, { t: 'التاريخ', f: b => df(b.date) },
    { t: 'الحالة', f: b => statusPill(b.status) + (s.docs.corrections.some(c => c.batchId === b.id && c.status === 'pending') ? ' <span class="pill info">تصحيح</span>' : '') },
    { t: 'الخامات', n: 1, f: b => kgf(b.status === 'closed' ? b.inputKg : sumBy(b.issues.filter(i => !i.reversed && E.item(i.itemId).unit === 'kg' && E.item(i.itemId).cat !== 'pack'), i => i.qty)) + ' كجم' },
    { t: 'الناتج', n: 1, f: b => b.status === 'closed' ? kgf(b.output) + ' كجم' : '—' },
    { t: 'الهدر', n: 1, f: b => b.status === 'closed' ? `<span class="${b.waste / b.inputKg > 0.03 ? 'pill bad' : ''}">${pct(b.waste, b.inputKg)}</span>` : '—' },
  ];
  if (cost) cols.push({ t: 'التكلفة', n: 1, f: b => b.status === 'closed' ? fm(b.cost) : fm(sumBy(b.issues.filter(i => !i.reversed), i => i.value)) }, { t: 'تكلفة الكيلو', n: 1, f: b => b.status === 'closed' ? `<b>${fm(b.costPerKg)}</b>` : '—' });
  const avgCost = closed.length ? Math.round(sumBy(closed, b => b.cost) * 1000 / Math.max(sumBy(closed, b => b.output), 1)) : 0;
  page('التشغيلات', `
    <div class="kpis">
      <div class="kpi"><small>جارية دلوقتي</small><b>${s.docs.batches.filter(b => b.status === 'open').length}</b></div>
      <div class="kpi"><small>إجمالي الناتج${prod ? '' : ' (كل المنتجات)'}</small><b>${kgf(sumBy(closed, b => b.output))} <em>كجم</em></b><span class="t">${closed.length} تشغيلة مقفولة</span></div>
      <div class="kpi"><small>متوسط الهدر</small><b>${pct(sumBy(closed, b => b.waste), sumBy(closed, b => b.inputKg))}</b></div>
      ${cost ? `<div class="kpi"><small>متوسط تكلفة الكيلو</small><b>${fm(avgCost)} <em>ج</em></b></div>` : ''}
    </div>
    <div class="bar">${tb.html}<select class="f" id="bprod" style="width:auto"><option value="">كل المنتجات</option>${itemOptions(i => i.cat === 'product', prod)}</select>${searchBox('bq', 'ابحث برقم التشغيلة')}<span class="grow"></span>
      ${['owner', 'supervisor'].includes(U.role()) ? `<button class="btn p" data-act="b-new">${ic('plus')} تشغيلة جديدة</button>` : ''}</div>
    <div class="card"><div class="bd">${table('bt', cols, rows, { onRow: b => 'batch/' + b.id })}</div></div>`);
  document.getElementById('bprod').onchange = e => { U.FILTER.bprod = e.target.value; U.render(); };
};
ACTS['b-new'] = () => modal('تشغيلة جديدة', `<div class="fgrid">
  <label class="fld"><span>المنتج</span><select class="f" id="nb-p">${itemOptions(i => i.cat === 'product')}</select></label>
  <label class="fld"><span>الكمية المخططة (كجم)</span><input class="f" id="nb-q" type="number" min="1" step="0.5" value="100"></label>
  <label class="fld"><span>التاريخ</span><input class="f" id="nb-d" type="date" value="${E.today()}" max="${E.today()}"></label></div>
  <div class="note info">التشغيلة هتاخد رقم تلقائي. والعامل يصرف عليها من شاشة العامل.</div>`, { saveText: 'فتح التشغيلة', save: async () => { const b = await E.createBatch({ date: val('nb-d'), productId: val('nb-p'), planned: toG(val('nb-q')) }); toast(`اتفتحت ${b.no}`, 'ok'); setTimeout(() => U.go('batch', b.id)); } });

PAGES.batch = id => {
  const s = S(), b = E.batchById(id), p = E.item(b.productId), cost = canCost(), r = U.role();
  const live = b.issues.filter(i => !i.reversed);
  const inKg = sumBy(live.filter(i => E.item(i.itemId).unit === 'kg' && E.item(i.itemId).cat !== 'pack'), i => i.qty);
  const curCost = sumBy(live, i => i.value);
  const corr = s.docs.corrections.filter(c => c.batchId === b.id);
  const lim = s.settings.issueLimitKg * 1000;
  const prev = s.docs.batches.filter(x => x.status === 'closed' && x.productId === b.productId && x.id !== b.id).slice(-10);
  const avgPrev = prev.length ? Math.round(sumBy(prev, x => x.cost) * 1000 / sumBy(prev, x => x.output)) : 0;
  const issueCols = [
    { t: 'الصنف', f: i => `${esc(E.item(i.itemId).name)}${i.note ? ` <span class="pill mut">${esc(i.note)}</span>` : ''}` },
    { t: 'الكمية', n: 1, f: i => `<b>${qtyf(i.qty, E.item(i.itemId).unit)}</b>` },
    { t: 'الدفعات (FEFO)', f: i => `<span class="mono">${i.parts.map(p_ => esc(p_.code)).join('، ')}</span>` },
  ];
  if (cost) issueCols.push({ t: 'القيمة', n: 1, f: i => fm(i.value) });
  issueCols.push({ t: 'بواسطة', f: i => esc(E.userName(i.by)) }, { t: 'الوقت', f: i => tf(i.at) },
    { t: '', f: i => i.reversed ? `<span class="pill bad">اتعكس (${esc(i.reversedBy)})</span>` : (b.status === 'open' && E.item(i.itemId).cat !== 'pack' && !corr.some(c => c.issueId === i.id && c.status === 'pending') && ['owner', 'supervisor', 'worker'].includes(r) ? `<span class="lock">${ic('lock')} مقفول</span> <button class="btn sm" data-act="corr-req" data-arg="${b.id}|${i.id}">طلب تصحيح</button>` : `<span class="lock">${ic('lock')} مقفول</span>`) });
  const totals = {}; live.forEach(i => { totals[i.itemId] = (totals[i.itemId] || 0) + i.qty; });
  page(`${b.no} · ${esc(p.name)}`, `<div class="sheet">
    <div class="sheet-hd"><div class="statusbar"><span class="${b.status === 'open' ? 'on' : ''}">جارية</span><span class="${b.status === 'closed' ? 'on' : ''}">مقفولة</span></div><span class="grow" style="flex:1"></span>
      ${b.status === 'open' && ['owner', 'supervisor'].includes(r) ? `<button class="btn" data-act="b-issue" data-arg="${b.id}">${ic('plus')} صرف خامة</button><button class="btn p" data-act="b-close" data-arg="${b.id}">${ic('check')} قفل التشغيلة</button>` : ''}
      ${b.status === 'open' && r === 'worker' ? `<button class="btn p" data-go="worker">شاشة الصرف</button>` : ''}</div>
    ${corr.filter(c => c.status === 'pending').map(c => `<div class="note info"><b>طلب تصحيح ${esc(c.no)}</b> من ${esc(E.userName(c.by))}: ${esc(E.item(c.itemId).name)} من ${qtyf(c.oldQty, 'kg')} إلى ${qtyf(c.newQty, 'kg')} · السبب: ${esc(c.reason)}
      ${isOwner() ? `<div class="bar" style="margin-top:8px"><button class="btn sm ok" data-act="corr-ok" data-arg="${c.id}">موافقة</button><button class="btn sm dan" data-act="corr-no" data-arg="${c.id}">رفض</button><span class="crumb">الموافقة بتعكس السطر الأصلي وتسجل الكمية الصح، والسطر الأصلي بيفضل ظاهر.</span></div>` : '<div class="crumb">مستني موافقة المالك</div>'}</div>`).join('')}
    <div class="card"><div class="bd"><div class="kv">
      <div><span>المنتج</span><b>${esc(p.name)}</b></div><div><span>التاريخ</span><b>${df(b.date)}</b></div><div><span>المخطط</span><b>${kgf(b.planned)} كجم</b></div>
      <div><span>فتحها</span><b>${esc(E.userName(b.openedBy))}</b></div>${b.status === 'closed' ? `<div><span>قفلها</span><b>${esc(E.userName(b.closedBy))} · ${tf(b.closedAt)}</b></div>` : ''}</div>
      <div class="smart" style="margin-top:14px">
        <div><small>الخامات المصروفة</small><b>${kgf(b.status === 'closed' ? b.inputKg : inKg)} كجم</b></div>
        <div><small>الناتج</small><b>${b.status === 'closed' ? kgf(b.output) + ' كجم' : '—'}</b></div>
        <div><small>الهدر</small><b>${b.status === 'closed' ? `${kgf(b.waste)} كجم · ${pct(b.waste, b.inputKg)}` : '—'}</b></div>
        ${cost ? `<div><small>التكلفة${b.status === 'open' ? ' لحد دلوقتي' : ''}</small><b>${fm(b.status === 'closed' ? b.cost : curCost)} ج</b></div>
        <div><small>تكلفة الكيلو</small><b>${b.status === 'closed' ? fm(b.costPerKg) + ' ج' : '—'}</b></div>
        <div><small>متوسط آخر ${prev.length} تشغيلات</small><b>${avgPrev ? fm(avgPrev) + ' ج' : '—'}</b></div>` : ''}
      </div></div></div>
    <div class="grid g-main">
      <div class="card"><div class="hd"><h3>الصرف</h3><span class="sub">كل سطر مقفول بعد التأكيد، والتصحيح بطلب للمالك</span></div><div class="bd">${table('iss-' + b.id, issueCols, b.issues.map(i => ({ ...i, _cls: i.reversed ? 'muted' : '' })), { empty: 'لسه مفيش صرف' })}</div></div>
      <div class="card"><div class="hd"><h3>إجمالي كل صنف</h3><span class="sub">الحد ${s.settings.issueLimitKg} كجم</span></div><div class="bd">
        ${hbars(Object.entries(totals).filter(([iid]) => E.item(iid).unit === 'kg').map(([iid, q]) => ({ label: E.item(iid).name, v: q, c: q > lim ? 'var(--bad)' : 'var(--red)' })), v => kgf(v) + ' كجم')}
      </div></div>
    </div>
    ${b.status === 'closed' ? `<div class="card"><div class="hd"><h3>العبوات الناتجة</h3><span class="sub">اتوزعت على الفريزرات</span></div><div class="bd">${table('bpk', [{ t: 'العبوة', f: l => packName(l.packSize) }, { t: 'الفريزر', f: l => `<b>${esc(E.whName(l.wh))}</b>` }, { t: 'الدفعة', f: l => `<span class="mono">${esc(l.code)}</span>` }, { t: 'العدد الأصلي', n: 1, f: l => l.inQty / l.packSize }, { t: 'المتبقي', n: 1, f: l => l.qty / l.packSize }, ...(cost ? [{ t: 'تكلفة العبوة', n: 1, f: l => fm(Math.round(l.inValue / (l.inQty / l.packSize))) }] : []), { t: 'الصلاحية', f: l => df(l.expDate) }], s.lots.filter(l => l.batchId === b.id && l.src.type === 'batch'))}</div></div>` : ''}
    <div class="card"><div class="hd"><h3>سجل التشغيلة</h3></div><div class="bd">${chatter(b.no)}</div></div></div>`, { crumb: '<a href="#batches">التشغيلات</a> / ' + esc(b.no) });
};
ACTS['corr-ok'] = id => run(() => E.decideCorrection(id, true), 'اتوافق على التصحيح');
ACTS['corr-no'] = id => run(() => E.decideCorrection(id, false), 'اترفض الطلب');
ACTS['corr-req'] = arg => {
  const [bid, iid] = arg.split('|'); const b = E.batchById(bid); const i = b.issues.find(x => x.id === iid); const it = E.item(i.itemId);
  modal('طلب تصحيح', `<div class="note">السطر الأصلي: <b>${esc(it.name)} · ${qtyf(i.qty, it.unit)}</b>. مش هيتعدل غير لما المالك يوافق.</div>
    <div class="fgrid"><label class="fld"><span>الكمية الصحيحة (${it.unit === 'kg' ? 'كجم' : 'قطعة'})</span><input class="f" id="cr-q" type="number" min="0" step="0.1"></label></div>
    <label class="fld"><span>السبب</span><textarea class="f" id="cr-r" placeholder="مثلًا: الميزان كان ٤٤ كجم"></textarea></label>`,
  { saveText: 'إرسال للمالك', save: async () => { await E.requestCorrection({ batchId: bid, issueId: iid, newQty: it.unit === 'kg' ? toG(val('cr-q')) : toI(val('cr-q')), reason: val('cr-r') }); toast('اتبعت للمالك', 'ok'); } });
};
function issueForm(bid) {
  return `<div class="fgrid"><label class="fld"><span>الصنف (من تلاجات الإنتاج)</span><select class="f" id="is-i">${S().items.filter(i => ['meat', 'spice'].includes(i.cat)).map(i => `<option value="${i.id}">${esc(i.name)} · متاح ${kgf(E.available(i.id, E.whs('raw')))} كجم</option>`).join('')}</select></label>
    <label class="fld"><span>الكمية (كجم)</span><input class="f" id="is-q" type="number" min="0.1" step="0.1"></label></div>
    <div class="note">بعد التأكيد السطر بيتقفل ومينفعش يتعدل. الأكياس والاستيكرات بتتصرف تلقائي عند القفل.</div>`;
}
ACTS['b-issue'] = bid => modal('صرف خامة على التشغيلة', issueForm(bid), { saveText: 'تأكيد الصرف', save: async () => { const l = await E.issue({ batchId: bid, itemId: val('is-i'), qty: toG(val('is-q')), date: E.today() }); toast(`اتصرف ${kgf(l.qty)} كجم`, 'ok'); } });
ACTS['b-close'] = bid => {
  const b = E.batchById(bid);
  const inKg = sumBy(b.issues.filter(i => !i.reversed && E.item(i.itemId).unit === 'kg' && E.item(i.itemId).cat !== 'pack'), i => i.qty);
  const sizes = E.packsOf(E.item(b.productId));
  const bags = sizes.map(sz => S().items.find(i => i.packFor === sz));
  const fz = E.warehouses().filter(w => w.use === 'fg');
  const grid = `<div class="tw"><table class="t split"><thead><tr><th>العبوة</th>${fz.map(w => `<th class="n">${esc(w.name)}</th>`).join('')}<th class="n">الإجمالي</th></tr></thead><tbody>
    ${sizes.map((sz, k) => `<tr><td><b>${packName(sz)}</b><div class="crumb">متاح ${bags[k] ? E.available(bags[k].id, E.whs('pack')) : 0} كيس</div></td>${fz.map(w => `<td class="n"><input class="f pk" data-sz="${sz}" data-wh="${w.id}" type="number" min="0" step="1" value="0" style="width:90px"></td>`).join('')}<td class="n"><b class="pk-tot" data-sz="${sz}">0</b></td></tr>`).join('')}
  </tbody></table></div>`;
  modal(`قفل ${esc(b.no)}`, `<div class="note info">الخامات المصروفة: <b>${kgf(inKg)} كجم</b>. اكتب عدد العبوات من كل حجم <b>في كل فريزر</b>، والسيستم يحسب الناتج والهدر ويصرف الأكياس والاستيكرات تلقائي.</div>
    ${grid}<label class="fld" style="max-width:220px"><span>تاريخ القفل</span><input class="f" id="cl-d" type="date" value="${E.today()}" max="${E.today()}"></label>
    <div class="smart"><div><small>الناتج</small><b id="cl-out">0 كجم</b></div><div><small>الهدر</small><b id="cl-w">—</b></div><div><small>عدد العبوات</small><b id="cl-n">0</b></div></div>`,
  { wide: true, saveText: 'قفل التشغيلة', save: async () => {
    const packs = {}, split = fz.map(w => ({ wh: w.id, packs: {} }));
    document.querySelectorAll('.pk').forEach(el => { const n = toI(el.value || '0') || 0; const z = +el.dataset.sz; packs[z] = (packs[z] || 0) + n; split.find(d => d.wh === el.dataset.wh).packs[z] = n; });
    const r = await E.closeBatch({ batchId: bid, date: val('cl-d'), packs, split }); toast(`اتقفلت ${r.no}: ${kgf(r.output)} كجم`, 'ok');
  } });
  const upd = () => { let out = 0, n = 0; const per = {}; document.querySelectorAll('.pk').forEach(el => { const c = toI(el.value || '0') || 0; out += c * +el.dataset.sz; n += c; per[el.dataset.sz] = (per[el.dataset.sz] || 0) + c; });
    document.querySelectorAll('.pk-tot').forEach(el => { el.textContent = per[el.dataset.sz] || 0; });
    document.getElementById('cl-out').textContent = kgf(out) + ' كجم'; document.getElementById('cl-n').textContent = n; const w = inKg - out; const el = document.getElementById('cl-w'); el.textContent = w < 0 ? 'الناتج أكبر من الخامات!' : `${kgf(w)} كجم · ${pct(w, inKg)}`; el.style.color = w < 0 ? 'var(--bad)' : ''; };
  document.querySelectorAll('.pk').forEach(el => { el.oninput = upd; });
};

/* ========== WORKER (tablet) ========== */
const WK = { batch: null, item: null, qty: '', cat: 'meat' };
PAGES.worker = () => {
  const s = S(); const open = s.docs.batches.filter(b => b.status === 'open');
  if (WK.batch && !open.some(b => b.id === WK.batch)) { WK.batch = null; WK.item = null; }
  if (!WK.batch && open.length === 1) WK.batch = open[0].id;
  const b = WK.batch && E.batchById(WK.batch);
  const lim = s.settings.issueLimitKg * 1000;
  let right = '';
  if (b) {
    const items = s.items.filter(i => i.cat === WK.cat);
    const it = WK.item && E.item(WK.item);
    const g = toG(WK.qty || '0') || 0;
    const already = it ? E.issuedOf(b, it.id) : 0;
    const av = it ? E.available(it.id, E.whs('raw')) : 0;
    right = `<div class="card"><div class="hd"><h3>٢. اختار الصنف</h3><div class="tools seg"><button class="${WK.cat === 'meat' ? 'on' : ''}" data-act="wk-cat" data-arg="meat">لحوم</button><button class="${WK.cat === 'spice' ? 'on' : ''}" data-act="wk-cat" data-arg="spice">توابل وإضافات</button></div></div><div class="bd"><div class="wk-items">
      ${items.map(i => { const a = E.available(i.id, E.whs('raw')); return `<button class="wk-i ${WK.item === i.id ? 'on' : ''}" data-act="wk-item" data-arg="${i.id}" ${a ? '' : 'disabled'}><b>${esc(i.name)}</b><small>متاح ${kgf(a)} كجم</small>${E.issuedOf(b, i.id) ? `<small style="color:var(--red)">اتصرف ${kgf(E.issuedOf(b, i.id))} كجم</small>` : ''}</button>`; }).join('')}</div></div></div>
    ${it ? `<div class="card"><div class="hd"><h3>٣. الكمية بالكيلو: ${esc(it.name)}</h3></div><div class="bd" style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">
      <div style="display:flex;flex-direction:column;gap:10px"><div class="wk-qty" id="wk-qty">${esc(WK.qty || '0')}</div>
      <div class="pad">${['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map(k => `<button data-act="wk-key" data-arg="${k}">${k}</button>`).join('')}</div></div>
      <div style="display:flex;flex-direction:column;gap:10px;flex:1;min-width:220px">
        <div class="kv"><div><span>المتاح</span><b>${kgf(av)} كجم</b></div><div><span>اتصرف قبل كده</span><b>${kgf(already)} كجم</b></div><div><span>الإجمالي بعد الصرف</span><b>${kgf(already + g)} كجم</b></div></div>
        ${already + g > lim ? `<div class="note bad">هتعدّي حد ${s.settings.issueLimitKg} كجم للصنف ده. الصرف هيتسجل، وهيروح تنبيه للمالك على تليجرام.</div>` : ''}
        ${g > av ? `<div class="note bad">الكمية أكبر من المتاح في التلاجة.</div>` : ''}
        <button class="btn p lg" data-act="wk-go" ${g > 0 && g <= av ? '' : 'disabled'}>${ic('check')} تأكيد صرف ${kgf(g)} كجم</button>
        <span class="crumb">بعد التأكيد مينفعش تعدّل. لو غلطت ابعت طلب تصحيح.</span></div></div></div>` : ''}
    <div class="card"><div class="hd"><h3>اللي اتصرف على ${esc(b.no)}</h3></div><div class="bd">${table('wk-' + b.id, [
      { t: 'الصنف', f: i => esc(E.item(i.itemId).name) }, { t: 'الكمية', n: 1, f: i => `<b>${qtyf(i.qty, E.item(i.itemId).unit)}</b>` }, { t: 'بواسطة', f: i => esc(E.userName(i.by)) }, { t: 'الوقت', f: i => i.at.slice(11, 16) },
      { t: '', f: i => i.reversed ? `<span class="pill bad">اتعكس</span>` : S().docs.corrections.some(c => c.issueId === i.id && c.status === 'pending') ? '<span class="pill info">طلب تصحيح مستني</span>' : `<span class="lock">${ic('lock')} مقفول</span> <button class="btn sm" data-act="corr-req" data-arg="${b.id}|${i.id}">طلب تصحيح</button>` }],
      b.issues.filter(i => E.item(i.itemId).cat !== 'pack').slice().reverse().map(i => ({ ...i, _cls: i.reversed ? 'muted' : '' })), { empty: 'لسه مفيش صرف' })}</div></div>`;
  }
  page('شاشة العامل', `<div class="wk">
    <div class="card"><div class="hd"><h3>١. اختار التشغيلة</h3></div><div class="bd">${open.length ? `<div class="wk-batches">${open.map(x => `<button class="wk-b ${WK.batch === x.id ? 'on' : ''}" data-act="wk-batch" data-arg="${x.id}"><span class="mono">${esc(x.no)}</span><b>${esc(E.item(x.productId).name)}</b><small>مخطط ${kgf(x.planned)} كجم · اتصرف ${kgf(sumBy(x.issues.filter(i => !i.reversed && E.item(i.itemId).cat !== 'pack'), i => i.qty))} كجم</small></button>`).join('')}</div>` : '<div class="empty">مفيش تشغيلة مفتوحة. المشرف يفتح تشغيلة الأول.</div>'}</div></div>
    ${right}</div>`, { crumb: esc(E.me().name) });
};
ACTS['wk-batch'] = id => { WK.batch = id; WK.item = null; WK.qty = ''; U.render(); };
ACTS['wk-cat'] = c => { WK.cat = c; WK.item = null; WK.qty = ''; U.render(); };
ACTS['wk-item'] = id => { WK.item = id; WK.qty = ''; U.render(); const q = document.getElementById('wk-qty'); if (q) q.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); };
ACTS['wk-key'] = k => { if (k === '⌫') WK.qty = WK.qty.slice(0, -1); else if (k === '.') { if (!WK.qty.includes('.')) WK.qty = (WK.qty || '0') + '.'; } else if (WK.qty.length < 7 && !(WK.qty.includes('.') && WK.qty.split('.')[1].length >= 3)) WK.qty = (WK.qty === '0' ? '' : WK.qty) + k; U.render(); };
ACTS['wk-go'] = () => {
  const it = E.item(WK.item), g = toG(WK.qty);
  modal('تأكيد الصرف', `<div style="font-size:18px">هتصرف <b>${kgf(g)} كجم ${esc(it.name)}</b> على التشغيلة <b>${esc(E.batchById(WK.batch).no)}</b>.</div><div class="note">بعد التأكيد السطر بيتقفل ومينفعش يتعدل.</div>`,
    { saveText: 'أيوه، صرف', save: async () => { await E.issue({ batchId: WK.batch, itemId: WK.item, qty: g, date: E.today() }); toast(`اتسجل ${kgf(g)} كجم ${it.name} ✓`, 'ok'); WK.item = null; WK.qty = ''; } });
};

/* ========== CUTTING ========== */
PAGES.cutting = () => {
  const s = S(), cost = canCost();
  const rows = s.docs.cuttings.slice().reverse();
  const cols = [{ t: 'الرقم', f: c => `<b class="mono">${esc(c.no)}</b>` }, { t: 'التاريخ', f: c => df(c.date) }, { t: 'الدفعة', f: c => `<span class="mono">${esc(c.srcLot)}</span>` }, { t: 'الداخل', n: 1, f: c => kgf(c.qty) + ' كجم' },
    { t: 'الناتج', f: c => c.outputs.map(o => `${esc(E.item(o.itemId).name)} ${kgf(o.qty)}`).join(' · ') }, { t: 'الهدر', n: 1, f: c => `${kgf(c.waste)} كجم · ${pct(c.waste, c.qty)}` }];
  if (cost) cols.push({ t: 'التكلفة', n: 1, f: c => fm(c.cost) });
  page('التقطيع', `<div class="note info">لما الدفعة تيجي بالعضم بتتقطع لقطعيات. تكلفة الدفعة بتتوزع على القطعيات <b>بنسبة قيمتها البيعية</b>، والعضم تكلفته صفر، والفرق بين الداخل والناتج بيتسجل هدر.</div>
    <div class="bar"><span class="grow"></span>${['owner', 'supervisor', 'storekeeper'].includes(U.role()) ? `<button class="btn p" data-act="cut-new">${ic('plus')} عملية تقطيع</button>` : ''}</div>
    <div class="card"><div class="bd">${table('cut', cols, rows)}</div></div>`);
};
ACTS['cut-new'] = () => {
  const s = S(); const lots = s.lots.filter(l => l.cat === 'carcass' && l.qty > 0);
  const outs = s.items.filter(i => i.cat === 'meat' || i.cat === 'byproduct');
  if (!lots.length) { toast('مفيش دفعات لحم بالعضم في المخزن', 'bad'); return; }
  modal('عملية تقطيع', `<div class="fgrid"><label class="fld"><span>الدفعة</span><select class="f" id="ct-l">${lots.map(l => `<option value="${l.id}" data-q="${l.qty}">${esc(l.code)} · ${esc(E.item(l.itemId).name)} · ${kgf(l.qty)} كجم · ${esc(E.whName(l.wh))}</option>`).join('')}</select></label>
    <label class="fld"><span>الكمية الداخلة للتقطيع (كجم)</span><input class="f" id="ct-q" type="number" step="0.1" value="${lots[0].qty / 1000}"></label>
    <label class="fld"><span>التاريخ</span><input class="f" id="ct-d" type="date" value="${E.today()}" max="${E.today()}"></label></div>
    <b>الناتج (كجم)</b><div class="fgrid">${outs.map(i => `<label class="fld"><span>${esc(i.name)}</span><input class="f co" data-id="${i.id}" type="number" min="0" step="0.1" value="0"></label>`).join('')}</div>
    <div class="smart"><div><small>مجموع الناتج</small><b id="ct-s">0</b></div><div><small>الهدر</small><b id="ct-w">—</b></div></div>`,
  { wide: true, saveText: 'تسجيل التقطيع', save: async () => { const outputs = [...document.querySelectorAll('.co')].map(el => ({ itemId: el.dataset.id, qty: toG(el.value || '0') || 0 })); const c = await E.cutting({ date: val('ct-d'), lotId: val('ct-l'), qty: toG(val('ct-q')), outputs }); toast(`اتسجل ${c.no}`, 'ok'); } });
  const upd = () => { const q = toG(val('ct-q')) || 0; const sm = [...document.querySelectorAll('.co')].reduce((a, el) => a + (toG(el.value || '0') || 0), 0); document.getElementById('ct-s').textContent = kgf(sm) + ' كجم'; const w = q - sm; const el = document.getElementById('ct-w'); el.textContent = w < 0 ? 'الناتج أكبر من الداخل!' : `${kgf(w)} كجم · ${pct(w, q)}`; el.style.color = w < 0 ? 'var(--bad)' : ''; };
  document.querySelectorAll('.co,#ct-q').forEach(el => { el.oninput = upd; });
  document.getElementById('ct-l').onchange = e => { document.getElementById('ct-q').value = e.target.selectedOptions[0].dataset.q / 1000; upd(); };
};

/* ========== STOCK ========== */
PAGES.stock = () => {
  const s = S(), cost = canCost();
  const tb = tabs('st', [['wh', 'التلاجات والمخازن'], ['items', 'حسب الصنف'], ['lots', 'الدفعات والصلاحية'], ['tr', 'التحويلات'], ['wo', 'الإعدام والهالك']], 'wh');
  const cat = U.FILTER.scat || '', wh = U.FILTER.swh || '';
  const catSel = `<select class="f" id="s-cat" style="width:auto"><option value="">كل الأنواع</option>${Object.entries(E.CAT_NAME).map(([k, n]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  const whSel = `<select class="f" id="s-wh" style="width:auto"><option value="">كل الأماكن</option>${E.warehouses().map(w => `<option value="${w.id}" ${wh === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>`;
  let body = '', bar = '';
  const canMove = ['owner', 'storekeeper', 'supervisor'].includes(U.role()), canWO = ['owner', 'storekeeper'].includes(U.role());
  if (tb.cur === 'items') {
    const rows = s.items.filter(i => (!cat || i.cat === cat) && match('sq', i.name, i.code)).map(i => { const ls = s.lots.filter(l => l.itemId === i.id && l.qty > 0 && (!wh || l.wh === wh)); return { i, q: sumBy(ls, l => l.qty), v: sumBy(ls, l => l.value) }; });
    const cols = [{ t: 'الكود', f: r => `<span class="mono">${esc(r.i.code)}</span>` }, { t: 'الصنف', f: r => esc(r.i.name) }, { t: 'النوع', f: r => E.CAT_NAME[r.i.cat] }, { t: 'الرصيد', n: 1, f: r => `<b>${qtyf(r.q, r.i.unit)}</b>` }, { t: 'الحد الأدنى', n: 1, f: r => r.i.minQty ? qtyf(r.i.minQty, r.i.unit) : '—' },
      { t: 'الحالة', f: r => !r.i.minQty ? '' : r.q === 0 ? '<span class="pill bad">خلص</span>' : r.q < r.i.minQty ? '<span class="pill warn">قرب يخلص</span>' : '<span class="pill ok">كويس</span>' }];
    if (cost) cols.push({ t: 'القيمة', n: 1, f: r => fm(r.v) }, { t: 'متوسط التكلفة', n: 1, f: r => r.q ? fm(E.mulDiv(r.v, r.i.unit === 'kg' ? 1000 : 1, r.q)) + (r.i.unit === 'kg' ? ' /كجم' : ' /قطعة') : '—' });
    const tot = cost ? `<tr class="tot"><td colspan="${cols.length - 2}">الإجمالي</td><td class="n">${fm(sumBy(rows, r => r.v))}</td><td></td></tr>` : '';
    bar = catSel + whSel + searchBox('sq', 'ابحث بالاسم أو الكود');
    body = table('st-i', cols, rows, { foot: tot });
  } else if (tb.cur === 'lots') {
    const rows = s.lots.filter(l => l.qty > 0 && (!cat || l.cat === cat) && (!wh || l.wh === wh) && match('sq', l.code, E.item(l.itemId).name)).sort((a, b) => a.expDate < b.expDate ? -1 : 1);
    const cols = [{ t: 'الدفعة', f: l => `<span class="mono">${esc(l.code)}</span>` }, { t: 'الصنف', f: l => esc(E.item(l.itemId).name) + (l.packSize ? ` <span class="pill mut">${packName(l.packSize)}</span>` : '') }, { t: 'المكان', f: l => esc(E.whName(l.wh)) },
      { t: 'الرصيد', n: 1, f: l => `<b>${qtyf(l.qty, E.item(l.itemId).unit)}</b>${l.packSize ? ` <small>(${l.qty / l.packSize} عبوة)</small>` : ''}` }, { t: 'إنتاج', f: l => df(l.prodDate) }, { t: 'دخول', f: l => df(l.inDate) }, { t: 'صلاحية', f: l => `${df(l.expDate)} ${expPill(l.expDate)}` },
      { t: 'المصدر', f: l => `<span class="mono">${esc(l.src.no)}</span>` }];
    if (cost) cols.push({ t: 'القيمة', n: 1, f: l => fm(l.value) });
    cols.push({ t: '', f: l => `<button class="btn sm" data-act="lbl" data-arg="${l.id}">باركود</button>${canMove ? ` <button class="btn sm" data-act="tr-new" data-arg="${l.id}">تحويل</button>` : ''}${canWO ? ` <button class="btn sm dan" data-act="wo-new" data-arg="${l.id}">إعدام</button>` : ''}` });
    bar = catSel + whSel + searchBox('sq', 'ابحث برقم الدفعة أو الصنف');
    body = table('st-l', cols, rows);
  } else if (tb.cur === 'wh') {
    const t0 = E.today();
    const canEditWh = ['owner', 'storekeeper'].includes(U.role());
    const USE_ICON = { receiving: 'truck', raw: 'box', pack: 'tag', fg: 'batch' };
    bar = canEditWh ? `<span class="grow"></span><button class="btn p" data-act="wh-edit">${ic('plus')} تلاجة أو فريزر جديد</button>` : '';
    body = `<div class="fridges">${E.warehouses().map(w => {
      const ls = s.lots.filter(l => l.wh === w.id && l.qty > 0);
      const by = {};
      ls.forEach(l => { const k = l.itemId; const r = by[k] || (by[k] = { it: E.item(k), q: 0, v: 0, lots: 0, batches: new Set(), soon: 0, packs: {} }); r.q += l.qty; r.v += l.value; r.lots++; if (l.src.type === 'batch') r.batches.add(l.src.no); if (E.daysBetween(t0, l.expDate) <= (l.cat === 'product' ? 14 : 3)) r.soon++; if (l.packSize) r.packs[l.packSize] = (r.packs[l.packSize] || 0) + l.qty / l.packSize; });
      const rows = Object.values(by).sort((x, y) => y.q - x.q);
      const kgTot = sumBy(rows.filter(r => r.it.unit === 'kg'), r => r.q), vTot = sumBy(rows, r => r.v), soon = sumBy(rows, r => r.soon);
      return `<section class="card fridge f-${w.use}"><div class="hd"><span class="fr-ic">${ic(USE_ICON[w.use] || 'box')}</span><div><h3>${esc(w.name)}</h3><span class="sub">${E.WH_USE[w.use]}</span></div>
        <div class="tools">${canEditWh ? `<button class="btn sm" data-act="wh-edit" data-arg="${w.id}">تعديل</button>` : ''}</div></div>
        <div class="bd"><div class="fr-stats"><div><small>الوزن</small><b>${kgf(kgTot)} كجم</b></div><div><small>أصناف</small><b>${rows.length}</b></div><div><small>دفعات</small><b>${ls.length}</b></div>${cost ? `<div><small>القيمة</small><b>${fm0(vTot)} ج</b></div>` : ''}${soon ? `<div class="warn"><small>صلاحية قريبة</small><b>${soon}</b></div>` : ''}</div>
        ${rows.length ? `<div class="tw"><table class="t"><thead><tr><th>الصنف</th><th class="n">الكمية</th>${w.use === 'fg' ? '<th>العبوات</th><th>من تشغيلات</th>' : '<th class="n">دفعات</th>'}${cost ? '<th class="n">القيمة</th>' : ''}</tr></thead><tbody>
          ${rows.map(r => `<tr><td><b>${esc(r.it.name)}</b>${r.soon ? ' <span class="pill warn">صلاحية قريبة</span>' : ''}</td><td class="n">${qtyf(r.q, r.it.unit)}</td>${w.use === 'fg' ? `<td>${Object.entries(r.packs).map(([z, n]) => `<span class="pill mut">${packName(+z)} × ${n}</span>`).join(' ')}</td><td>${[...r.batches].slice(-4).map(no => `<span class="mono">${esc(no)}</span>`).join('، ')}${r.batches.size > 4 ? ` +${r.batches.size - 4}` : ''}</td>` : `<td class="n">${r.lots}</td>`}${cost ? `<td class="n">${fm(r.v)}</td>` : ''}</tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">فاضية</div>'}</div></section>`;
    }).join('')}</div>`;
  } else if (tb.cur === 'tr') {
    body = table('st-t', [{ t: 'الرقم', f: t => `<span class="mono">${esc(t.no)}</span>` }, { t: 'التاريخ', f: t => df(t.date) }, { t: 'الصنف', f: t => esc(E.item(t.itemId).name) }, { t: 'الدفعة', f: t => `<span class="mono">${esc(t.lotCode)}</span>` }, { t: 'الكمية', n: 1, f: t => qtyf(t.qty, E.item(t.itemId).unit) }, { t: 'من', f: t => esc(E.whName(t.from)) }, { t: 'إلى', f: t => esc(E.whName(t.to)) }, { t: 'بواسطة', f: t => esc(E.userName(t.by)) }], s.docs.transfers.slice().reverse());
  } else {
    const rows = s.docs.writeoffs.slice().reverse();
    body = table('st-w', [{ t: 'الرقم', f: w => `<span class="mono">${esc(w.no)}</span>` }, { t: 'التاريخ', f: w => df(w.date) }, { t: 'الصنف', f: w => esc(E.item(w.itemId).name) }, { t: 'الدفعة', f: w => `<span class="mono">${esc(w.lotCode)}</span>` }, { t: 'الكمية', n: 1, f: w => qtyf(w.qty, E.item(w.itemId).unit) }, ...(cost ? [{ t: 'القيمة', n: 1, f: w => fm(w.value) }] : []), { t: 'السبب', f: w => esc(w.reason) }, { t: 'بواسطة', f: w => esc(E.userName(w.by)) }], rows,
      { foot: cost ? `<tr class="tot"><td colspan="5">الإجمالي</td><td class="n">${fm(sumBy(rows, w => w.value))}</td><td colspan="2"></td></tr>` : '' });
  }
  page('المخزون والدفعات', `<div class="bar">${tb.html}</div><div class="bar">${bar}</div>${tb.cur === 'wh' ? body : `<div class="card"><div class="bd">${body}</div></div>`}`);
  const c1 = document.getElementById('s-cat'); if (c1) c1.onchange = e => { U.FILTER.scat = e.target.value; U.render(); };
  const c2 = document.getElementById('s-wh'); if (c2) c2.onchange = e => { U.FILTER.swh = e.target.value; U.render(); };
};
ACTS['wh-edit'] = id => {
  const w = id ? E.warehouses().find(x => x.id === id) : { name: '', use: 'fg' };
  modal(id ? 'تعديل ' + esc(w.name) : 'تلاجة أو فريزر جديد', `<div class="fgrid"><label class="fld"><span>الاسم</span><input class="f" id="wh-n" value="${esc(w.name)}" placeholder="مثلًا: فريزر ٣"></label>
    <label class="fld"><span>النوع</span><select class="f" id="wh-u">${Object.entries(E.WH_USE).map(([k, n]) => `<option value="${k}" ${w.use === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <div class="note info"><b>تلاجة إنتاج:</b> اللحوم والتوابل اللي بيتصرف منها على التشغيلات. <b>فريزر منتج تام:</b> العبوات الجاهزة، ومنه بيتباع. <b>مخزن استلام:</b> البضاعة أول ما توصل من المورد.</div>`,
  { save: async () => { await E.saveWarehouse({ id, name: val('wh-n'), use: val('wh-u') }); toast('اتحفظ', 'ok'); } });
};
function labelHtml(l, btn) { const it = E.item(l.itemId); return `<div class="label"><b>${esc(it.name)}</b><span>${qtyf(l.inQty, it.unit)} · ${esc(E.whName(l.wh))}</span>${U.barcode(l.code)}<span>إنتاج ${esc(l.prodDate)} · دخول ${esc(l.inDate)}</span><b>صلاحية ${esc(l.expDate)}</b>${btn ? `<button class="btn sm no-print lbl-btn" data-act="lbl" data-arg="${l.id}">${ic('print')} اطبع الملصق ده</button>` : ''}</div>`; }
// print stickers: each label on its own page, sized for a thermal label printer (60×40 mm)
function printLabels(list) {
  const body = list.map(([l, n]) => Array.from({ length: n }, () => `<div class="st">${labelHtml(l)}</div>`).join('')).join('');
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0'; document.body.appendChild(f);
  const d = f.contentDocument;
  d.open(); d.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800&display=swap" rel="stylesheet"><style>
@page{size:60mm 40mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Cairo,sans-serif;color:#000}
.st{width:60mm;height:40mm;padding:1.6mm 2.2mm;page-break-after:always;break-after:page;overflow:hidden}.st:last-child{page-break-after:auto;break-after:auto}
.label{display:flex;flex-direction:column;gap:0;font-size:7.5pt;line-height:1.25;height:100%}.label b{font-size:9pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.label b:last-child{font-size:8.5pt}
.label svg{width:100%;height:15mm;margin:.6mm 0}</style></head><body>${body}</body></html>`); d.close();
  const go = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 1500); };
  (d.fonts ? d.fonts.ready : Promise.resolve()).then(() => setTimeout(go, 150));
}
ACTS.lbl = id => { const l = S().lots.find(x => x.id === id), it = E.item(l.itemId);
  modal('طباعة ملصق الدفعة', `<div class="labels" style="max-width:320px">${labelHtml(l)}</div>
  <label class="fld" style="margin-top:12px"><span>عدد النسخ</span><input class="f" id="lbl-n" type="number" min="1" max="500" value="1"></label>
  <div class="note">كل ملصق بيطلع في صفحة لوحده بمقاس ٦٠×٤٠ مم (مقاس طابعة الملصقات).</div>`,
  { foot: `<button class="btn p" data-act="lbl-go" data-arg="${id}">${ic('print')} اطبع</button>` }); };
U.printLabels = printLabels;
ACTS['lbl-go'] = id => { const n = Math.max(1, Math.min(500, toI(val('lbl-n')) || 1)); printLabels([[S().lots.find(x => x.id === id), n]]); };
ACTS['lbl-all'] = pid => { const p = S().docs.purchases.find(x => x.id === pid); printLabels(p.lines.map(l => [S().lots.find(x => x.id === l.lotId), 1])); };
ACTS['tr-new'] = id => { const l = S().lots.find(x => x.id === id), it = E.item(l.itemId);
  modal('تحويل دفعة', `<div class="note info">${esc(it.name)} · دفعة <b class="mono">${esc(l.code)}</b> · في ${esc(E.whName(l.wh))} · الرصيد ${qtyf(l.qty, it.unit)}</div>
  <div class="fgrid"><label class="fld"><span>الكمية (${it.unit === 'kg' ? 'كجم' : 'قطعة'})</span><input class="f" id="tr-q" type="number" step="${it.unit === 'kg' ? '0.1' : '1'}" value="${it.unit === 'kg' ? l.qty / 1000 : l.qty}"></label>
  <label class="fld"><span>إلى</span><select class="f" id="tr-to">${E.warehouses().filter(w => w.id !== l.wh && (w.use === 'fg') === (E.whUse(l.wh) === 'fg')).map(w => `<option value="${w.id}">${esc(w.name)} · ${E.WH_USE[w.use]}</option>`).join('')}</select></label>
  <label class="fld"><span>التاريخ</span><input class="f" id="tr-d" type="date" value="${E.today()}" max="${E.today()}"></label></div>`,
  { saveText: 'تحويل', save: async () => { await E.transfer({ date: val('tr-d'), lotId: id, qty: it.unit === 'kg' ? toG(val('tr-q')) : toI(val('tr-q')), toWh: val('tr-to') }); toast('اتحولت', 'ok'); } }); };
ACTS['wo-new'] = id => { const l = S().lots.find(x => x.id === id), it = E.item(l.itemId);
  modal('إعدام كمية من دفعة', `<div class="note bad">${esc(it.name)} · دفعة <b class="mono">${esc(l.code)}</b> · الرصيد ${qtyf(l.qty, it.unit)}${canCost() ? ` · القيمة ${fm(l.value)} ج` : ''}. القيمة بتتسجل في حساب "هالك وتالف المخزون".</div>
  <div class="fgrid"><label class="fld"><span>الكمية</span><input class="f" id="wo-q" type="number" step="${it.unit === 'kg' ? '0.1' : '1'}" value="${it.unit === 'kg' ? l.qty / 1000 : l.qty}"></label>
  <label class="fld"><span>التاريخ</span><input class="f" id="wo-d" type="date" value="${E.today()}" max="${E.today()}"></label></div>
  <label class="fld"><span>السبب</span><input class="f" id="wo-r" value="${E.daysBetween(E.today(), l.expDate) < 0 ? 'انتهاء الصلاحية' : ''}"></label>`,
  { saveText: 'تسجيل الإعدام', save: async () => { await E.writeOff({ date: val('wo-d'), lotId: id, qty: it.unit === 'kg' ? toG(val('wo-q')) : toI(val('wo-q')), reason: val('wo-r') }); toast('اتسجل الإعدام', 'ok'); } }); };

/* ========== PURCHASES ========== */
PAGES.purchases = () => {
  const s = S();
  const rows = s.docs.purchases.filter(p => match('pq', p.no, p.ref, E.partner(p.supplierId).name)).slice().reverse();
  page('الاستلام والمشتريات', `<div class="bar">${searchBox('pq', 'ابحث برقم الفاتورة أو المورد')}<span class="grow"></span>${['owner', 'storekeeper'].includes(U.role()) ? `<button class="btn p" data-act="po-new">${ic('plus')} استلام بضاعة</button>` : ''}</div>
    <div class="card"><div class="bd">${table('po', [{ t: 'الرقم', f: p => `<b class="mono">${esc(p.no)}</b>` }, { t: 'التاريخ', f: p => df(p.date) }, { t: 'المورد', f: p => esc(E.partner(p.supplierId).name) }, { t: 'فاتورة المورد', f: p => `<span class="mono">${esc(p.ref)}</span>` },
      { t: 'الأصناف', f: p => p.lines.map(l => esc(E.item(l.itemId).name)).join('، ') }, { t: 'قبل الضريبة', n: 1, f: p => fm(p.net) }, { t: 'الضريبة', n: 1, f: p => fm(p.vat) }, { t: 'الإجمالي', n: 1, f: p => `<b>${fm(p.total)}</b>` }], rows, { onRow: p => 'purchase/' + p.id })}</div></div>`);
};
PAGES.purchase = id => {
  const p = S().docs.purchases.find(x => x.id === id); if (!p) { U.go('purchases'); return; }
  const lots = p.lines.map(l => S().lots.find(x => x.id === l.lotId));
  page(`${esc(p.no)} · ${esc(E.partner(p.supplierId).name)}`, `<div class="sheet">
    <div class="card"><div class="bd"><div class="kv"><div><span>المورد</span><b><a href="#supplier/${p.supplierId}">${esc(E.partner(p.supplierId).name)}</a></b></div><div><span>فاتورة المورد</span><b class="mono">${esc(p.ref)}</b></div><div><span>التاريخ</span><b>${df(p.date)}</b></div><div><span>استلم</span><b>${esc(E.userName(p.by))}</b></div><div><span>القيد</span><b class="mono">${esc(p.je)}</b></div></div></div></div>
    <div class="card"><div class="bd">${table('pol', [{ t: 'الصنف', f: l => esc(E.item(l.itemId).name) }, { t: 'الدفعة', f: l => `<span class="mono">${esc(l.lotCode)}</span>` }, { t: 'الكمية', n: 1, f: l => qtyf(l.qty, E.item(l.itemId).unit) }, { t: 'السعر', n: 1, f: l => fm(l.unitCost) }, { t: 'القيمة', n: 1, f: l => fm(l.value) }, { t: 'الضريبة', n: 1, f: l => fm(l.vat) }, { t: 'إنتاج', f: l => df(l.prodDate) }, { t: 'صلاحية', f: l => df(l.expDate) }], p.lines,
      { foot: `<tr class="tot"><td colspan="4">الإجمالي</td><td class="n">${fm(p.net)}</td><td class="n">${fm(p.vat)}</td><td colspan="2" class="n">${fm(p.total)}</td></tr>` })}</div></div>
    <div class="card"><div class="hd"><h3>ملصقات الباركود</h3><div class="tools"><button class="btn" data-act="lbl-all" data-arg="${p.id}">${ic('print')} اطبع كل الملصقات</button></div></div><div class="bd"><div class="labels">${lots.map(l => labelHtml(l, true)).join('')}</div></div></div></div>`, { crumb: '<a href="#purchases">المشتريات</a> / ' + esc(p.no) });
};
const DEF_EXP = { carcass: 10, meat: 7, spice: 180, pack: 720 };
const PO = { sup: null, lines: [] };
ACTS['po-new'] = () => {
  const s = S(); const sups = s.partners.filter(p => p.type === 'supplier');
  if (!sups.length) { toast('ضيف مورد الأول من شاشة الموردين', 'bad'); U.go('suppliers'); return; }
  if (!PO.sup || !sups.some(p => p.id === PO.sup)) PO.sup = sups[0].id;
  PO.lines = [];
  modal('استلام بضاعة من مورد', `<div class="fgrid">
      <label class="fld"><span>المورد</span><select class="f" id="po-s">${partnerOptions('supplier', PO.sup)}</select></label>
      <label class="fld"><span>رقم فاتورة المورد</span><input class="f" id="po-r" placeholder="مثلًا 1045"></label>
      <label class="fld"><span>تاريخ الاستلام</span><input class="f" id="po-d" type="date" value="${E.today()}" max="${E.today()}"></label></div>
    <div id="po-items"></div>
    <div class="tw"><table class="t" id="po-t"><thead><tr><th style="min-width:200px">الصنف</th><th class="n">الكمية</th><th class="n">السعر للوحدة (ج)</th><th>تاريخ الإنتاج</th><th>تاريخ الصلاحية</th><th class="n">القيمة</th><th></th></tr></thead><tbody id="po-lines"></tbody></table></div>
    <div class="smart"><div><small>قبل الضريبة</small><b id="po-net">0.00</b></div><div><small>الضريبة</small><b id="po-vat">0.00</b></div><div style="background:var(--red-soft)"><small>إجمالي الفاتورة</small><b id="po-tot">0.00</b></div></div>
    <div class="crumb">كل صنف بياخد دفعة بباركود ويدخل <b>مخزن الاستلام</b>. القيد: المخزون مدين، والمورد دائن بالإجمالي.</div>`,
  { wide: true, saveText: 'تسجيل الاستلام', save: async () => {
    readPo();
    const lines = PO.lines.filter(l => l.itemId && l.qty).map(l => { const it = E.item(l.itemId); return { itemId: it.id, qty: it.unit === 'kg' ? toG(l.qty) : toI(l.qty), unitCost: toP(l.cost), prodDate: l.prod, expDate: l.exp }; });
    if (!lines.length) throw new Error('اختار صنف واحد على الأقل واكتب الكمية');
    const d = await E.purchase({ date: val('po-d'), supplierId: PO.sup, ref: val('po-r'), lines }); toast(`اتسجل ${d.no}`, 'ok'); setTimeout(() => U.go('purchase', d.id));
  } });
  document.getElementById('po-s').onchange = e => { readPo(); PO.sup = e.target.value; PO.lines = []; drawPo(); };
  drawPo();
};
function supItems() { const sp = E.partner(PO.sup); const all = S().items.filter(i => !['product', 'byproduct'].includes(i.cat)); return sp.items && sp.items.length ? all.filter(i => sp.items.includes(i.id)) : all; }
function readPo() { document.querySelectorAll('#po-lines tr').forEach((tr, k) => { const l = PO.lines[k]; if (!l) return; l.qty = tr.querySelector('.pl-q').value; l.cost = tr.querySelector('.pl-c').value; l.prod = tr.querySelector('.pl-p').value; l.exp = tr.querySelector('.pl-e').value; }); }
function drawPo() {
  const sp = E.partner(PO.sup), items = supItems();
  const last = id => { const p = S().docs.purchases.slice().reverse().find(x => x.supplierId === PO.sup && x.lines.some(l => l.itemId === id)); return p ? p.lines.find(l => l.itemId === id).unitCost : null; };
  document.getElementById('po-items').innerHTML = `<div class="bar" style="gap:6px"><span class="crumb" style="font-weight:800">أصناف ${esc(sp.name)}:</span>${items.map(i => `<button class="btn sm ${PO.lines.some(l => l.itemId === i.id) ? 'p' : ''}" data-act="po-pick" data-arg="${i.id}">${esc(i.name)}</button>`).join('')}</div>${sp.items && sp.items.length ? '' : '<div class="note" style="margin-top:8px">المورد ده لسه مش متحدد أصنافه، فكل الأصناف ظاهرة. حددها من شاشة الموردين.</div>'}`;
  document.getElementById('po-lines').innerHTML = PO.lines.map((l, k) => { const it = E.item(l.itemId), u = it.unit === 'kg' ? 'كجم' : 'قطعة'; const v = Math.round((parseFloat(l.qty) || 0) * (parseFloat(l.cost) || 0) * 100);
    return `<tr><td><b>${esc(it.name)}</b><div class="crumb">${E.CAT_NAME[it.cat]}${it.vat ? ' · ضريبة ' + it.vat + '%' : ''}${last(it.id) != null ? ' · آخر سعر ' + fm(last(it.id)) : ''}</div></td>
      <td data-l="الكمية"><div style="display:flex;align-items:center;gap:6px"><input class="f pl-q" type="number" min="0" step="${it.unit === 'kg' ? '0.001' : '1'}" value="${esc(l.qty || '')}" style="width:100px"><span class="crumb" style="white-space:nowrap">${u}</span></div></td>
      <td data-l="السعر"><div style="display:flex;align-items:center;gap:6px"><input class="f pl-c" type="number" min="0" step="0.01" value="${esc(l.cost || '')}" style="width:100px"><span class="crumb" style="white-space:nowrap">/ ${u}</span></div></td>
      <td data-l="تاريخ الإنتاج"><input class="f pl-p" type="date" value="${l.prod}" max="${E.today()}"></td><td data-l="تاريخ الصلاحية"><input class="f pl-e" type="date" value="${l.exp}"></td>
      <td class="n" data-l="القيمة"><b class="pl-v">${fm(v)}</b></td><td><button class="btn sm dan" data-act="po-del" data-arg="${k}" aria-label="شيل السطر">✕</button></td></tr>`; }).join('') || `<tr><td colspan="7"><div class="empty">دوس على الأصناف اللي فوق عشان تضيفها للفاتورة</div></td></tr>`;
  document.querySelectorAll('#po-lines input').forEach(el => { el.oninput = poTotals; });
  poTotals();
}
function poTotals() {
  readPo(); let net = 0, vat = 0;
  document.querySelectorAll('#po-lines tr').forEach((tr, k) => { const l = PO.lines[k]; if (!l) return; const it = E.item(l.itemId); const v = Math.round((parseFloat(l.qty) || 0) * (parseFloat(l.cost) || 0) * 100); tr.querySelector('.pl-v').textContent = fm(v); net += v; vat += Math.round(v * it.vat / 100); });
  document.getElementById('po-net').textContent = fm(net); document.getElementById('po-vat').textContent = fm(vat); document.getElementById('po-tot').textContent = fm(net + vat);
}
ACTS['po-pick'] = id => { readPo(); const k = PO.lines.findIndex(l => l.itemId === id); if (k >= 0) PO.lines.splice(k, 1); else { const it = E.item(id); PO.lines.push({ itemId: id, qty: '', cost: '', prod: E.today(), exp: E.addDays(E.today(), DEF_EXP[it.cat] || 30) }); } drawPo(); const q = document.querySelectorAll('.pl-q'); if (k < 0 && q.length) q[q.length - 1].focus(); };
ACTS['po-del'] = k => { readPo(); PO.lines.splice(+k, 1); drawPo(); };

/* ========== SUPPLIERS ========== */
PAGES.suppliers = () => {
  const s = S(), ms = E.monthStart(E.today());
  const rows = s.partners.filter(p => p.type === 'supplier' && match('sp', p.name, p.phone, (p.items || []).map(i => E.item(i).name).join(' ')));
  page('الموردين', `<div class="bar">${searchBox('sp', 'ابحث بالاسم أو الصنف')}<span class="grow"></span>${['owner', 'storekeeper', 'accountant'].includes(U.role()) ? `<button class="btn p" data-act="partner-new" data-arg="supplier">${ic('plus')} مورد جديد</button>` : ''}</div>
    <div class="card"><div class="bd">${table('sp', [{ t: 'المورد', f: p => `<b>${esc(p.name)}</b>` }, { t: 'بيورّد', f: p => (p.items || []).length ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${p.items.slice(0, 4).map(i => `<span class="pill mut">${esc(E.item(i).name)}</span>`).join('')}${p.items.length > 4 ? `<span class="pill mut">+${p.items.length - 4}</span>` : ''}</div>` : '<span class="pill warn">مش متحدد</span>' }, { t: 'التليفون', f: p => `<span class="mono">${esc(p.phone)}</span>` },
      { t: 'مشتريات الشهر', n: 1, f: p => fm(sumBy(s.docs.purchases.filter(x => x.supplierId === p.id && x.date >= ms), x => x.total)) }, { t: 'المستحق له', n: 1, f: p => `<b>${fm(E.partnerBalance(p.id))}</b>` }], rows, { onRow: p => 'supplier/' + p.id, empty: 'لسه مفيش موردين. دوس "مورد جديد" وحدد أصنافه.' })}</div></div>`);
};
PAGES.supplier = id => {
  const p = E.partner(id); const st = E.partnerStatement(id); const s = S();
  const pur = s.docs.purchases.filter(x => x.supplierId === id);
  const itemRows = (p.items || []).map(iid => { const lines = pur.flatMap(x => x.lines.filter(l => l.itemId === iid).map(l => ({ ...l, date: x.date }))); const it = E.item(iid); return { it, qty: sumBy(lines, l => l.qty), val: sumBy(lines, l => l.value), last: lines[lines.length - 1] }; });
  page(esc(p.name), `<div class="kpis"><div class="kpi main"><small>المستحق له</small><b>${fm0(E.partnerBalance(id))} <em>ج</em></b></div><div class="kpi"><small>فواتير الشراء</small><b>${pur.length}</b></div><div class="kpi"><small>إجمالي المشتريات</small><b>${fm0(sumBy(pur, x => x.total))} <em>ج</em></b></div><div class="kpi"><small>عدد الأصناف</small><b>${(p.items || []).length}</b></div></div>
    <div class="bar"><span class="grow"></span>${['owner', 'storekeeper'].includes(U.role()) ? `<button class="btn" data-act="po-from" data-arg="${id}">${ic('truck')} استلام من المورد ده</button>` : ''}${['owner', 'accountant'].includes(U.role()) ? `<button class="btn p" data-act="pay-new" data-arg="${id}">سداد للمورد</button>` : ''}<button class="btn" data-act="partner-edit" data-arg="${id}">تعديل البيانات والأصناف</button></div>
    <div class="card"><div class="hd"><h3>الأصناف اللي بيورّدها</h3></div><div class="bd">${table('spi', [{ t: 'الصنف', f: r => `<b>${esc(r.it.name)}</b> <span class="crumb">${esc(r.it.code)}</span>` }, { t: 'النوع', f: r => E.CAT_NAME[r.it.cat] }, { t: 'اشترينا منه', n: 1, f: r => r.qty ? qtyf(r.qty, r.it.unit) : '—' }, { t: 'بقيمة', n: 1, f: r => r.val ? fm(r.val) : '—' }, { t: 'آخر سعر', n: 1, f: r => r.last ? fm(r.last.unitCost) + (r.it.unit === 'kg' ? ' /كجم' : ' /قطعة') : '—' }, { t: 'آخر استلام', f: r => r.last ? df(r.last.date) : '—' }, { t: 'الرصيد عندنا', n: 1, f: r => qtyf(E.available(r.it.id), r.it.unit) }], itemRows, { empty: 'حدد أصناف المورد من "تعديل البيانات والأصناف"' })}</div></div>
    <div class="card"><div class="hd"><h3>كشف الحساب</h3></div><div class="bd">${table('sst', [{ t: 'التاريخ', f: r => df(r.date) }, { t: 'القيد', f: r => `<span class="mono">${esc(r.no)}</span>` }, { t: 'البيان', f: r => tx(r.memo) }, { t: 'مدين (سداد)', n: 1, f: r => r.dr ? fm(r.dr) : '' }, { t: 'دائن (مشتريات)', n: 1, f: r => r.cr ? fm(r.cr) : '' }, { t: 'الرصيد', n: 1, f: r => `<b>${fm(r.run)}</b>` }], st.slice().reverse())}</div></div>`, { crumb: '<a href="#suppliers">الموردين</a>' });
};
ACTS['po-from'] = id => { PO.sup = id; ACTS['po-new'](); PO.sup = id; };

U.sumBy = sumBy;
})();
