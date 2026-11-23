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
  const open = s.docs.batches.filter(b => b.status === 'open' || b.status === 'spice');
  const BU_ = s.docs.butcheries || [], buOpen = BU_.filter(r => r.status === 'open'), buM = BU_.filter(r => r.status === 'closed' && (r.closeDate || r.date) >= ms);
  const buIn = sumBy(buM, r => E.butIn(r)), buOut = sumBy(buM, r => E.butOut(r)), buCost = sumBy(buM, r => E.butCost(r)), buT = BU_.filter(r => r.status !== 'cancelled' && (r.closeDate || r.date) === t);
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
    `<div class="kpi main"><div class="ic">${ic('chart')}</div><small>مبيعات الشهر</small><b>${money(salesM)}</b><span class="t">${ch == null ? 'صافي' : `${dl(salesM, salesLM)} عن نفس الفترة اللي فاتت`}</span><div class="goalbar" title="${Math.round(tp * 100)}%"><i style="width:${Math.min(100, tp * 100)}%"></i></div><span class="t">${Math.round(tp * 100)}% من هدف الشهر ${fm0(target)} ج</span></div>`,
    `<div class="kpi"><div class="ic">${ic('tag')}</div><small>مجمل الربح الشهر</small><b>${money(is.gross)}</b><span class="t">${dl(is.gross, isLM.gross)} هامش ${pct(is.gross, is.revenue)}</span></div>`,
    `<div class="kpi"><div class="ic">${ic('cash')}</div><small>صافي الربح الشهر</small><b style="color:var(--${is.net >= 0 ? 'ok' : 'bad'});-webkit-text-fill-color:var(--${is.net >= 0 ? 'ok' : 'bad'})">${money(is.net)}</b><span class="t">${dl(is.net, isLM.net)} بعد كل المصروفات</span></div>`,
    `<div class="kpi"><div class="ic">${ic('box')}</div><small>قيمة المخزون</small><b>${money(stockV)}</b><span class="t ${low.length ? 'w' : ''}">${low.length ? low.length + ' صنف قرب يخلص' : 'كل الأصناف فوق الحد'}</span></div>`,
  ] : [
    `<div class="kpi main"><div class="ic">${ic('batch')}</div><small>تشغيلات جارية</small><b>${open.length}</b><span class="t">${s.docs.batches.filter(b => b.date === t).length} اتفتحت النهارده · ${buOpen.length} جزارة شغالة</span></div>`,
    `<div class="kpi"><div class="ic">${ic('box')}</div><small>إنتاج الشهر</small><b>${kgf(outKg)} <em>كجم</em></b><span class="t">${bM.length} تشغيلة</span></div>`,
    `<div class="kpi"><div class="ic">${ic('knife')}</div><small>هدر الإنتاج</small><b>${pct(inKg - outKg, inKg)}</b><span class="t">${kgf(inKg - outKg)} كجم الشهر ده</span></div>`,
    `<div class="kpi"><div class="ic">${ic('bell')}</div><small>أصناف قربت تخلص</small><b>${low.length}</b><span class="t ${exp.length ? 'w' : ''}">${exp.length} دفعة صلاحيتها قربت</span></div>`,
  ];
  const k2 = cost ? [
    `<div class="kpi sm"><small>مبيعات النهارده</small><b>${money(sumBy(invT, v => v.net))}</b><span class="t">${invT.length} فاتورة</span></div>`,
    `<div class="kpi sm"><small>مديونيات العملاء</small><b>${money(E.bal(L, '1201'))}</b><span class="t">آجل على المطاعم والمحلات</span></div>`,
    `<div class="kpi sm"><small>مستحق للموردين</small><b>${money(E.bal(L, '2101'))}</b><span class="t">الخزنة والبنك: ${fm0(U.moneyAccs('move').reduce((a, c) => a + E.bal(L, c), 0))} ج</span></div>`,
    `<div class="kpi sm"><small>إنتاج الشهر</small><b>${kgf(outKg)} <em>كجم</em></b><span class="t ${inKg && (inKg - outKg) / inKg > 0.03 ? 'dn' : 'up'}">هدر ${pct(inKg - outKg, inKg)} · ${bM.length} تشغيلة · ${open.length} جارية</span></div>`,
    `<div class="kpi sm"><small>الجزارة الشهر ده</small><b>${kgf(buOut)} <em>كجم</em></b><span class="t ${buIn && (buIn - buOut) / buIn > 0.3 ? 'dn' : 'up'}">فقد ${pct(buIn - buOut, buIn)} · ${buM.length} تشغيلة · ${buOpen.length} شغالة</span></div>`,
  ] : [`<div class="kpi sm"><small>الجزارة الشهر ده</small><b>${kgf(buOut)} <em>كجم</em></b><span class="t">فقد ${pct(buIn - buOut, buIn)} · ${buM.length} تشغيلة · ${buOpen.length} شغالة</span></div>`];
  const reqN = U.pendingRequests ? U.pendingRequests() : 0;
  const alertsList = [...(reqN ? [{ level: 'info', text: `${reqN} طلب حساب جديد مستني موافقتك`, go: 'users' }] : []), ...pend.map(c => ({ level: 'info', text: `طلب تصحيح ${c.no} مستني موافقة المالك`, go: 'batch/' + c.batchId })), ...low.map(a => ({ level: a.level, text: a.text, go: 'stock' })), ...exp.map(a => ({ level: a.level, text: a.text, go: 'stock' }))];
  const byWh = E.warehouses().map(w => ({ label: w.name, v: sumBy(s.lots.filter(l => l.wh === w.id && l.qty > 0 && E.item(l.itemId).unit === 'kg'), l => l.qty) }));
  const custMix = [['wholesale', 'مطاعم ومحلات (جملة)', '#D2452F'], ['retail', 'أفراد (قطاعي)', '#F2B33D']].map(([k, l, c]) => ({ label: l, v: sumBy(invM.filter(v => v.kind === k), v => v.net), c }));
  const prodSales = {}; invM.forEach(v => v.lines.forEach(l => { prodSales[l.productId] = (prodSales[l.productId] || 0) + l.qty; }));
  const topProd = Object.entries(prodSales).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, q]) => ({ label: E.item(id).name, v: q }));
  const lastB = s.docs.batches.filter(b => b.status === 'closed').slice(-12).reverse();
  const sales = Array.from({ length: HOME_DAYS }, (_, i) => E.addDays(t, i - HOME_DAYS + 1)).map(d => ({ label: df(d).split(' ')[0], v: sumBy(inv.filter(v => v.date === d), v => v.net) }));
  const CASH = U.moneyAccs('move'), cashNow = CASH.reduce((a, c) => a + E.bal(L, c), 0);
  const cashDelta = {}; s.journal.forEach(j => j.lines.forEach(l => { if (CASH.includes(l.acc)) cashDelta[j.date] = (cashDelta[j.date] || 0) + l.dr - l.cr; }));
  const cashSeries = []; { let run = cashNow; for (let i = 0; i < 14; i++) { const d = E.addDays(t, -i); cashSeries.unshift(run); run -= cashDelta[d] || 0; } }
  page('الرئيسية', `
    <div class="card hero"><button class="me-btn" data-act="me" aria-label="حسابي">${U.avatar(E.me(), 'hero-av')}</button><div style="min-width:0"><h2>${greet}، ${esc(E.me().name)}</h2><p>${esc(E.ROLES[E.me().role].name)}</p>
      <div class="chips"><span class="chip"><b>${open.length}</b> تشغيلة جارية</span><span class="chip"><b>${buOpen.length}</b> تشغيلة جزارة شغالة</span><span class="chip ${alertsList.length ? 'warn' : ''}"><b>${alertsList.length}</b> تنبيه</span></div></div><span class="grow"></span>
      ${U.isOwner() ? `<span data-go="reports" class="pill ${allOk ? 'ok' : 'bad'}" role="button" tabindex="0" style="cursor:pointer">${allOk ? '✓ الحسابات متوازنة والمخزون مطابق' : '✗ فيه فرق في الحسابات'}</span>` : ''}</div>
    ${quick.length ? `<div class="qas">${quick.map((q, i) => `<button class="qa ${i % 2 ? 'y' : ''}" data-act="quick" data-arg="${q[0]}"><i>${ic(q[3])}</i><span><b>${q[1]}</b><small>${q[2]}</small></span></button>`).join('')}</div>` : ''}
    <div class="sec-title"><h2>${cost ? 'الأرقام' : 'الإنتاج'}</h2></div>
    <div class="kpis">${(U.isOwner() ? k1 : k1.filter(k => !k.includes('الربح الشهر'))).join('')}</div>${k2.length ? `<div class="kpis">${k2.join('')}</div>` : ''}
    ${cost ? `<div class="sec-title"><h2>المبيعات مقابل الهدف</h2></div>
    <div class="grid g-main">
      <div class="card"><div class="hd"><h3>المبيعات اليومية</h3><span class="sub">صافي المبيعات · الخط المتقطع هدف اليوم</span><div class="tools"><div class="seg" role="tablist">${[7, 14, 30].map(n => `<button class="${HOME_DAYS === n ? 'on' : ''}" data-act="home-days" data-arg="${n}" role="tab" aria-selected="${HOME_DAYS === n}">${n} يوم</button>`).join('')}</div></div></div>
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
    <div style="margin-top:16px">
      <div class="card"><div class="hd"><h3>تشغيلات الجزارة</h3><div class="tools">${U.quickFor().some(q => q[0] === 'bu-new') ? `<button class="btn sm p" data-act="bu-new">${ic('plus')} تشغيلة جزارة جديدة</button>` : ''}<button class="btn sm" data-go="cutting">الكل</button></div></div><div class="bd">
        <div class="chips" style="margin-bottom:8px"><span class="chip"><b>${kgf(sumBy(buT, r => E.butOut(r)))} كجم</b> ناتج النهارده</span><span class="chip"><b>${kgf(buOut)} كجم</b> ناتج الشهر</span><span class="chip"><b>${pct(buIn - buOut, buIn)}</b> فقد الشهر</span>${cost ? `<span class="chip"><b>${buOut ? fm0(E.mulDiv(buCost, 1000, buOut)) : '—'} ج</b> تكلفة الكيلو</span>` : ''}</div>
        <div class="list">${buOpen.map(r => { const i = E.butIn(r), o = E.butOut(r); return `<div class="li" data-go="butchery/${r.id}" style="cursor:pointer"><span class="d" style="background:var(--warn)"></span><div class="x"><b class="mono">${esc(r.no)}</b> · ${r.inputs.map(x => esc(E.item(x.itemId).name)).join('، ')}<small>داخل ${kgf(i)} كجم · ناتج ${kgf(o)} كجم · فقد ${pct(i - o, i)}${cost ? ` · تكلفة ${fm0(E.butCost(r))} ج` : ''}</small></div></div>`; }).join('') || '<div class="empty">مفيش تشغيلة جزارة شغالة دلوقتي</div>'}</div></div></div>
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
  const bOpen = s.docs.batches.filter(b => b.status === 'open' || b.status === 'spice'), bM = s.docs.batches.filter(b => b.status === 'closed' && b.closeDate >= ms);
  const vM = s.docs.invoices.filter(v => v.date >= ms);
  const cost = canCost();
  const ok = E.integrity().every(c => c.ok);
  const st = (go, title, v, sub, je, who) => `<div class="stage" data-go="${go}" role="link" tabindex="0"><h4>${title}</h4><div class="v">${v}</div><small>${sub}</small>${who ? `<span class="who">${who}</span>` : ''}${je && cost ? `<div class="je">${je}</div>` : ''}</div>`;
  const stages = [
    st('suppliers', 'الموردين', `${s.partners.filter(p => p.type === 'supplier').length} مورد`, 'لحوم · توابل · أكياس · استيكرات', 'مستحق لهم: ' + fm0(E.bal(L, '2101')) + ' ج', 'المحاسب'),
    st('purchases', 'الاستلام بالباركود', `${pM.length} فاتورة`, `الشهر ده · ${fm0(sumBy(pM, p => p.total))} ج`, 'من: المخزون · إلى: المورد', 'أمين المخزن'),
    st('stock', 'مخزن الاستلام', `${kgf(kgOf(whAll('receiving')))} كجم`, 'كل دفعة: إنتاج · دخول · صلاحية', '', 'أمين المخزن'),
    st('cutting', 'الجزارة', `${cM.length} عملية`, `الشهر ده · هدر ${kgf(sumBy(cM, c => c.waste))} كجم`, 'التكلفة تتوزع بالقيمة البيعية', 'مشرف الإنتاج'),
    st('stock', `تلاجات الإنتاج (${E.whs('raw').length})`, `${kgf(kgOf(whAll('raw')))} كجم`, cost ? `قيمتها ${fm0(vOf(whAll('raw')))} ج` : 'لحوم وتوابل', '', 'أمين المخزن'),
    st('worker', 'الصرف على التشغيلة', `${bOpen.length} جارية`, `حد التنبيه ${s.settings.issueLimitKg} كجم للصنف`, 'من: تحت التشغيل · إلى: الخامات', 'العامل من التابلت'),
    st('batches', 'قفل التشغيلة والتعبئة', `${bM.length} تشغيلة`, `الشهر ده · ${kgf(sumBy(bM, b => b.output))} كجم`, 'من: المنتج التام · إلى: تحت التشغيل', 'مشرف الإنتاج'),
    st('stock', `فريزرات المنتج التام (${E.whs('fg').length})`, `${kgf(kgOf(whAll('fg')))} كجم`, 'عبوات ½ لحد ٢ كيلو', cost ? 'قيمته ' + fm0(E.bal(L, '1305')) + ' ج' : '', 'أمين المخزن'),
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
ACTS['al-read'] = id => run(() => E.markAlertsRead(id ? [id] : U.isOwner() || U.role() === 'accountant' ? null : S().alerts.filter(a => !a.read).map(a => a.id).slice(0, 500)));

/* ========== BATCHES ========== */
PAGES.batches = () => {
  const s = S(); const cost = canCost();
  const tb = tabs('bt', [['all', 'الكل'], ['open', 'جارية'], ['closed', 'مقفولة']], 'all');
  const prod = U.FILTER.bprod || '';
  const rows = s.docs.batches.filter(b => (tb.cur === 'all' || (tb.cur === 'open' ? E.running(b) : b.status === tb.cur)) && (!prod || b.productId === prod) && match('bq', b.no, E.item(b.productId).name)).slice().reverse();
  const closed = s.docs.batches.filter(b => b.status === 'closed' && (!prod || b.productId === prod));
  const cols = [
    { t: 'الرقم', f: b => `<b class="mono">${esc(b.no)}</b>` }, { t: 'المنتج', f: b => esc(E.item(b.productId).name) }, { t: 'التاريخ', f: b => df(b.date) },
    { t: 'الحالة', f: b => statusPill(b.status) + (s.docs.corrections.some(c => c.batchId === b.id && c.status === 'pending') ? ' <span class="pill info">تصحيح</span>' : '') },
    { t: 'الخامات', n: 1, f: b => kgf(b.status === 'closed' ? b.inputKg : E.batchKg(b)) + ' كجم' },
    { t: 'الناتج', n: 1, f: b => b.status === 'closed' ? kgf(b.output) + ' كجم' : '—' },
    { t: 'الهدر', n: 1, f: b => b.status === 'closed' ? `<span class="${b.waste / b.inputKg > 0.03 ? 'pill bad' : ''}">${pct(b.waste, b.inputKg)}</span>` : '—' },
  ];
  if (cost) cols.push({ t: 'التكلفة', n: 1, f: b => b.status === 'closed' ? fm(b.cost) : fm(E.batchCostNow(b)) }, { t: 'تكلفة الكيلو', n: 1, f: b => b.status === 'closed' ? `<b>${fm(b.costPerKg)}</b>` : '—' });
  const avgCost = closed.length ? Math.round(sumBy(closed, b => b.cost) * 1000 / Math.max(sumBy(closed, b => b.output), 1)) : 0;
  page('التشغيلات', `
    <div class="kpis">
      <div class="kpi"><small>جارية دلوقتي</small><b>${s.docs.batches.filter(E.running).length}</b><span class="t">${s.docs.batches.filter(b => b.status === 'packing').length} في التقفيل</span></div>
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
  const inKg = E.batchKg(b), curCost = E.batchCostNow(b), runs = E.running(b);
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
    { t: '', f: i => i.reversed ? `<span class="pill bad">اتعكس (${esc(i.reversedBy)})</span>` : (runs && !corr.some(c => c.issueId === i.id && c.status === 'pending') && ['owner', 'supervisor', 'worker'].includes(r) ? `<span class="lock">${ic('lock')} مقفول</span> <button class="btn sm" data-act="corr-req" data-arg="${b.id}|${i.id}">طلب تصحيح</button>` : `<span class="lock">${ic('lock')} مقفول</span>`) });
  const totals = {}; live.forEach(i => { totals[i.itemId] = (totals[i.itemId] || 0) + i.qty; });
  const boss = ['owner', 'supervisor'].includes(r);
  // three stages, each closed by its own worker: who worked on it and who closed it
  const names = ids => [...new Set(ids.filter(Boolean))].map(x => esc(E.userName(x))).join('، ');
  const hands = c => live.filter(i => i.note !== 'تعبئة تلقائية' && (c === 'meat' ? !['spice', 'pack'].includes(E.item(i.itemId).cat) : E.item(i.itemId).cat === c)).map(i => i.by);
  const stCard = (t, state, people, line) => `<div class="stg ${state}"><small>${t}</small><b>${people || '—'}</b><span>${line}</span></div>`;
  const stState = (done, now) => (done ? 'done' : now ? 'now' : '');
  const stages = b.status === 'cancelled' ? '' : `<div class="stgs">
    ${stCard('١. اللحوم', stState(b.meatDoneAt || b.status === 'closed', b.status === 'open'), names([...hands('meat'), b.meatDoneBy]), b.meatDoneAt ? `قفلها ${esc(E.userName(b.meatDoneBy))} · ${tf(b.meatDoneAt)}` : b.status === 'open' ? 'شغالة دلوقتي' : '')}
    ${stCard('٢. التوابل', stState(b.spiceDoneAt || b.noSpice || b.status === 'packing' || b.status === 'closed', b.status === 'spice'), b.noSpice ? 'بدون توابل' : names([...hands('spice'), b.spiceDoneBy]), b.spiceDoneAt ? `قفلها ${esc(E.userName(b.spiceDoneBy))} · ${tf(b.spiceDoneAt)}` : b.status === 'spice' ? 'شغالة دلوقتي' : b.status === 'open' ? 'بعد اللحوم' : '')}
    ${stCard('٣. الأكياس والتقفيل', stState(b.packDoneAt || b.status === 'closed', b.status === 'packing'), names([...hands('pack'), ...(b.outputs || []).map(o => o.by), b.packDoneBy]), b.packDoneAt ? `قفلها ${esc(E.userName(b.packDoneBy))} · ${tf(b.packDoneAt)}${b.status === 'packing' ? ' · مستنية القفل النهائي' : ''}` : b.status === 'packing' ? 'شغالة دلوقتي' : b.status === 'closed' ? '' : 'بعد التوابل')}</div>`;
  const made = b.status === 'closed' ? (b.made || Object.entries(b.packs || {}).map(([z, n]) => ({ productId: b.productId, packSize: +z, count: n }))) : [];
  const madeLine = made.map(m => `${m.count.toLocaleString('en-US')} × ${m.productId === b.productId ? '' : esc(E.item(m.productId).name) + ' '}${packName(m.packSize)}`).join(' + ');
  page(`${b.no} · ${esc(p.name)}`, `<div class="sheet">
    <div class="sheet-hd"><div class="statusbar"><span class="${b.status === 'open' ? 'on' : ''}">لحوم</span><span class="${b.status === 'spice' ? 'on' : ''}">توابل</span><span class="${b.status === 'packing' ? 'on' : ''}">تقفيل</span><span class="${b.status === 'closed' ? 'on' : ''}">مقفولة</span></div><span class="grow" style="flex:1"></span>
      ${b.status === 'open' && boss ? `<button class="btn" data-act="b-issue" data-arg="${b.id}">${ic('plus')} صرف لحوم</button><button class="btn" data-act="wk-done" data-arg="${b.id}">${ic('check')} قفل اللحوم</button>` : ''}
      ${b.status === 'spice' && boss ? `<button class="btn" data-act="b-issue" data-arg="${b.id}">${ic('plus')} صرف توابل</button><button class="btn" data-act="wk-spice" data-arg="${b.id}">${ic('check')} قفل التوابل</button>` : ''}
      ${runs && boss ? `<button class="btn" data-act="b-pack" data-arg="${b.id}">${ic('plus')} صرف أكياس واستيكرات</button>${b.status === 'packing' && !b.packDoneAt ? `<button class="btn" data-act="wk-packdone" data-arg="${b.id}">${ic('check')} قفل التقفيل</button>` : ''}<button class="btn" data-act="b-rework" data-arg="${b.id}">رجوع «إعادة تصنيع»</button><button class="btn p" data-act="b-close" data-arg="${b.id}">${ic('check')} قفل التشغيلة</button>` : ''}
      ${runs && ['worker', 'packer'].includes(r) ? `<button class="btn p" data-go="worker">شاشة الصرف</button>` : ''}
      ${U.isOwner() && b.status === 'closed' ? `<button class="btn" data-act="b-reopen" data-arg="${b.id}">افتح التشغيلة تاني</button>` : ''}${U.isOwner() && b.status !== 'cancelled' ? `<button class="btn dan" data-act="b-cancel" data-arg="${b.id}">إلغاء التشغيلة</button>` : ''}</div>
    ${b.status === 'cancelled' ? `<div class="note bad">التشغيلة دي اتلغت (${esc(E.userName(b.cancelledBy))} · ${tf(b.cancelledAt)}): ${esc(b.cancelReason)}. كل الخامات والأكياس رجعت المخزن.</div>` : ''}${b.status === 'closed' && b.noPack ? `<div class="note warn">اتقفلت من غير: ${b.noPack.map(esc).join('، ')}، فتكلفتهم مش داخلة على العبوات. لو اتستخدموا، افتح التشغيلة تاني واختارهم وانت بتقفل.</div>` : ''}${(b.reopens || []).length && b.status !== 'cancelled' ? `<div class="note">اتفتحت تاني ${b.reopens.length} مرة: ${b.reopens.map(x => esc(x.reason || '')).join('، ')}</div>` : ''}
    ${corr.filter(c => c.status === 'pending').map(c => `<div class="note info"><b>طلب تصحيح ${esc(c.no)}</b> من ${esc(E.userName(c.by))}: ${esc(E.item(c.itemId).name)} من ${qtyf(c.oldQty, 'kg')} إلى ${qtyf(c.newQty, 'kg')} · السبب: ${esc(c.reason)}
      ${isOwner() ? `<div class="bar" style="margin-top:8px"><button class="btn sm ok" data-act="corr-ok" data-arg="${c.id}">موافقة</button><button class="btn sm dan" data-act="corr-no" data-arg="${c.id}">رفض</button><span class="crumb">الموافقة بتعكس السطر الأصلي وتسجل الكمية الصح، والسطر الأصلي بيفضل ظاهر.</span></div>` : '<div class="crumb">مستني موافقة المالك</div>'}</div>`).join('')}
    <div class="card"><div class="bd"><div class="kv">
      <div><span>المنتج</span><b>${esc(p.name)}</b></div><div><span>التاريخ</span><b>${df(b.date)}</b></div><div><span>المخطط</span><b>${kgf(b.planned)} كجم</b></div>
      <div><span>فتحها</span><b>${esc(E.userName(b.openedBy))}</b></div>${b.status === 'closed' ? `<div><span>قفلها</span><b>${esc(E.userName(b.closedBy))} · ${tf(b.closedAt)}</b></div>` : ''}</div>
      ${stages}
      <div class="smart" style="margin-top:14px">
        <div><small>الخامات المصروفة${(b.returns || []).length ? ' (بعد إعادة التصنيع)' : ''}</small><b>${kgf(b.status === 'closed' ? b.inputKg : inKg)} كجم</b></div>
        <div><small>الناتج${runs && (b.outputs || []).length ? ' (لسه متقفلش)' : ''}</small><b>${b.status === 'closed' ? kgf(b.output) + ' كجم' : (b.outputs || []).length ? kgf(E.batchOutKg(b)) + ' كجم' : '—'}</b></div>
        <div><small>الهدر</small><b>${b.status === 'closed' ? `${kgf(b.waste)} كجم · ${pct(b.waste, b.inputKg)}` : (b.outputs || []).length ? `${kgf(inKg - E.batchOutKg(b))} كجم · ${pct(inKg - E.batchOutKg(b), inKg)}` : '—'}</b></div>
        ${cost ? `<div><small>التكلفة${runs ? ' لحد دلوقتي' : ''}</small><b>${fm(b.status === 'closed' ? b.cost : curCost)} ج</b></div>
        <div><small>تكلفة الكيلو</small><b>${b.status === 'closed' ? fm(b.costPerKg) + ' ج' : '—'}</b></div>
        ${U.isOwner() ? `<div><small>سعر البيع · الهامش</small><b>${p.priceRetail ? fm0(p.priceRetail) + ' ج' : '<span class="cs-miss">مفيش سعر بيع</span>'}${b.status === 'closed' && p.priceRetail ? ` <span class="cs-m ${p.priceRetail < b.costPerKg ? 'neg' : ''}">\u2066${((p.priceRetail - b.costPerKg) / p.priceRetail * 100).toFixed(0)}%\u2069</span>` : ''}</b></div>` : ''}
        <div><small>متوسط آخر ${prev.length} تشغيلات</small><b>${avgPrev ? fm(avgPrev) + ' ج' : '—'}</b></div>` : ''}
      </div></div></div>
    ${b.status === 'closed' ? `<div class="card"><div class="hd"><h3>الناتج النهائي</h3><span class="sub">${kgf(b.output)} كجم من ${kgf(b.inputKg)} كجم خامات</span></div><div class="bd">
      <div class="made">${made.map(m => `<div><small>${esc(E.item(m.productId).name)}</small><b>${m.count.toLocaleString('en-US')} <em>× ${packName(m.packSize)}</em></b><span>${kgf(m.count * m.packSize)} كجم</span></div>`).join('')}</div></div></div>` : ''}
    ${runs && b.status !== 'cancelled' ? outSheet(b, boss) : ''}
    <div class="grid g-main">
      <div class="card"><div class="hd"><h3>الصرف</h3><span class="sub">كل سطر مقفول بعد التأكيد، والتصحيح بطلب للمالك</span></div><div class="bd">${table('iss-' + b.id, issueCols, b.issues.map(i => ({ ...i, _cls: i.reversed ? 'muted' : '' })), { empty: 'لسه مفيش صرف' })}</div></div>
      <div class="card"><div class="hd"><h3>إجمالي كل صنف</h3><span class="sub">الحد ${s.settings.issueLimitKg} كجم</span></div><div class="bd">
        ${hbars(Object.entries(totals).filter(([iid]) => E.item(iid).unit === 'kg').map(([iid, q]) => ({ label: E.item(iid).name, v: q, c: q > lim ? 'var(--bad)' : 'var(--red)' })), v => kgf(v) + ' كجم')}
      </div></div>
    </div>
    ${(b.returns || []).length ? `<div class="card"><div class="hd"><h3>إعادة تصنيع (رجعت التلاجة)</h3></div><div class="bd">${table('brw-' + b.id, [{ t: 'الكمية', n: 1, f: x => `<b>${kgf(x.qty)} كجم</b>` }, { t: 'الدفعة', f: x => `<span class="mono">${esc(x.lotCode)}</span>` }, ...(cost ? [{ t: 'القيمة', n: 1, f: x => fm(x.value) }] : []), { t: 'بواسطة', f: x => esc(E.userName(x.by)) }, { t: 'الوقت', f: x => tf(x.at) }], b.returns)}</div></div>` : ''}
    ${b.status === 'closed' ? `<div class="card"><div class="hd"><h3>العبوات الناتجة</h3><span class="sub">اتوزعت على الفريزرات</span></div><div class="bd">${table('bpk', [{ t: 'المنتج', f: l => esc(E.item(l.itemId).name) }, { t: 'العبوة', f: l => packName(l.packSize) }, { t: 'الفريزر', f: l => `<b>${esc(E.whName(l.wh))}</b>` }, { t: 'الدفعة', f: l => `<span class="mono">${esc(l.code)}</span>` }, { t: 'العدد الأصلي', n: 1, f: l => l.inQty / l.packSize }, { t: 'المتبقي', n: 1, f: l => l.qty / l.packSize }, ...(cost ? [{ t: 'تكلفة العبوة', n: 1, f: l => fm(Math.round(l.inValue / (l.inQty / l.packSize))) }] : []), { t: 'الصلاحية', f: l => df(l.expDate) }], s.lots.filter(l => l.batchId === b.id && l.src.type === 'batch'))}</div></div>` : ''}
    <div class="card"><div class="hd"><h3>سجل التشغيلة</h3></div><div class="bd">${chatter(b.no)}</div></div></div>`, { crumb: '<a href="#batches">التشغيلات</a> / ' + esc(b.no) });
  outWire(b);
};
/* ---------- the output sheet of a running batch (like butchery): product × pack size × count, one line each ---------- */
const BO = { b: '', p: '', s: 0, g: '', n: '', w: '' };
function outSheet(b, canEdit) {
  const p0 = E.item(b.productId), inKg = E.batchKg(b), outs = b.outputs || [], outKg = E.batchOutKg(b), left = inKg - outKg, fz = E.warehouses().filter(w => w.use === 'fg');
  const head = p0.name.split(' ')[0], rank = i => (i.id === p0.id ? 0 : i.name.startsWith(head) ? 1 : 2);
  const prods = S().items.filter(i => i.cat === 'product' && i.active !== false).sort((a, c) => rank(a) - rank(c) || a.name.localeCompare(c.name, 'ar'));
  if (BO.b !== b.id || !prods.some(x => x.id === BO.p)) Object.assign(BO, { b: b.id, p: p0.id, s: 0, g: '', n: '', w: '' });
  const cur = E.item(BO.p), sizes = E.packsOf(cur); if (BO.s !== -1 && !sizes.includes(BO.s)) BO.s = sizes.find(z => !outs.some(o => o.productId === cur.id && o.packSize === z) && z >= 500) || (sizes.includes(1000) ? 1000 : sizes[sizes.length - 1]); // start at a size not typed yet
  if (!fz.some(w => w.id === BO.w)) BO.w = fz[0] ? fz[0].id : '';
  const n = x => x.toLocaleString('en-US');
  const eq = inKg > 0 ? E.packsOf(p0).map(z => `<b>${n(Math.floor(left / z))}</b> عبوة ${packName(z)}`).join(' أو ') : '';
  const form = !canEdit ? '' : `<div class="bo-form">
      <label class="fld"><span>المنتج</span><select class="f" id="bo-p">${prods.map(i => `<option value="${i.id}" ${i.id === BO.p ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label>
      <label class="fld"><span>العبوة</span><select class="f" id="bo-s">${sizes.map(z => `<option value="${z}" ${z === BO.s ? 'selected' : ''}>${packName(z)}</option>`).join('')}<option value="-1" ${BO.s === -1 ? 'selected' : ''}>وزن تاني (طبق)</option></select></label>
      ${BO.s === -1 ? `<label class="fld"><span>وزن الطبق (جرام)</span><input class="f" id="bo-g" type="number" inputmode="numeric" min="50" max="20000" step="10" placeholder="مثلاً 750" value="${esc(BO.g)}"></label>` : ''}
      <label class="fld"><span>العدد</span><input class="f" id="bo-n" type="number" inputmode="numeric" min="1" step="1" placeholder="كام عبوة" value="${esc(BO.n)}"></label>
      ${fz.length > 1 ? `<label class="fld"><span>الفريزر</span><select class="f" id="bo-w">${fz.map(w => `<option value="${w.id}" ${w.id === BO.w ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label>` : ''}
      <button class="btn p" data-act="bo-add" data-arg="${b.id}">${ic('plus')} إضافة ناتج</button>
      <small class="crumb bo-hint" id="bo-hint"></small></div>`;
  const cols = [{ t: 'المنتج', f: o => `<b>${esc(E.item(o.productId).name)}</b>` }, { t: 'العبوة', f: o => packName(o.packSize) }, { t: 'العدد', n: 1, f: o => `<b>${n(o.count)}</b>` }, { t: 'الوزن', n: 1, f: o => kgf(o.count * o.packSize) + ' كجم' },
    ...(fz.length > 1 ? [{ t: 'الفريزر', f: o => esc(E.whName(o.wh)) }] : []), { t: 'بواسطة', f: o => esc(E.userName(o.by)) }, { t: 'الوقت', f: o => tf(o.at) },
    ...(canEdit ? [{ t: '', f: o => `<button class="btn sm" data-act="bo-drop" data-arg="${b.id}|${o.id}">شيل</button>` }] : [])];
  return `<div class="card" id="bo-card"><div class="hd"><h3>الناتج النهائي</h3><span class="sub">كل منتج وعبوة في سطر. بيدخل الفريزر لما التشغيلة تتقفل</span></div><div class="bd">
    ${inKg > 0 ? `<div class="bo-eq">${outs.length ? `الباقي <b>${kgf(left)} كجم</b> من ${kgf(inKg)} كجم خامات` : `الخامات <b>${kgf(inKg)} كجم</b>`} = ${eq}</div>` : '<div class="note">لسه مفيش خامات اتصرفت على التشغيلة.</div>'}
    ${form}
    ${outs.length ? table('bo-' + b.id, cols, outs, { foot: `<tr class="tot"><td colspan="2">الإجمالي</td><td class="n">${n(outs.reduce((a, o) => a + o.count, 0))}</td><td class="n">${kgf(outKg)} كجم</td><td colspan="${cols.length - 4}">الهدر ${kgf(left)} كجم · ${pct(left, inKg)}</td></tr>` }) : `<div class="empty">${canEdit ? 'لسه مفيش ناتج. اكتب عدد العبوات من كل حجم ودوس «إضافة ناتج».' : 'لسه مفيش ناتج اتسجل.'}</div>`}
  </div></div>`;
}
function outWire(b) {
  const ps = document.getElementById('bo-p'); if (!ps) return;
  const sz = document.getElementById('bo-s'), nn = document.getElementById('bo-n'), gg = document.getElementById('bo-g'), ww = document.getElementById('bo-w'), hint = document.getElementById('bo-hint');
  const left = E.batchKg(b) - E.batchOutKg(b);
  const paint = () => { const z = BO.s === -1 ? toI(BO.g || '0') || 0 : BO.s, c = toI(BO.n || '0') || 0;
    if (!z || !c) { hint.textContent = z ? `الباقي يكفّي ${Math.floor(left / z).toLocaleString('en-US')} عبوة ${packName(z)}` : ''; hint.classList.remove('bad'); return; }
    const over = c * z > left; hint.classList.toggle('bad', over);
    hint.textContent = over ? `${c.toLocaleString('en-US')} × ${packName(z)} = ${kgf(c * z)} كجم، وده أكبر من الباقي (${kgf(left)} كجم)` : `${c.toLocaleString('en-US')} × ${packName(z)} = ${kgf(c * z)} كجم · يفضل ${kgf(left - c * z)} كجم`; };
  ps.onchange = () => { BO.p = ps.value; BO.s = 0; U.render(); };
  sz.onchange = () => { BO.s = +sz.value; U.render(); const f = document.getElementById(BO.s === -1 ? 'bo-g' : 'bo-n'); if (f) f.focus(); };
  nn.oninput = () => { BO.n = nn.value; paint(); }; if (gg) gg.oninput = () => { BO.g = gg.value; paint(); }; if (ww) ww.onchange = () => { BO.w = ww.value; };
  nn.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ACTS['bo-add'](b.id); } };
  paint();
}
ACTS['bo-add'] = async id => {
  const z = BO.s === -1 ? toI(BO.g || '0') || 0 : BO.s, c = toI(BO.n || '0') || 0, el = document.getElementById(!z ? 'bo-g' : 'bo-n');
  if (!z || !c) { if (el) { el.focus(); U.pinError && U.pinError(el, !z ? 'اكتب وزن الطبق بالجرام' : 'اكتب عدد العبوات'); } return; }
  const pn = E.item(BO.p).name, ok = await run(() => E.batchOutput({ batchId: id, productId: BO.p, packSize: z, count: c, wh: BO.w || undefined }), `اتضاف ${c.toLocaleString('en-US')} × ${pn} ${packName(z)}`);
  if (ok) { BO.n = ''; U.render(); const f = document.getElementById('bo-n'); if (f) f.focus(); }
};
ACTS['bo-drop'] = arg => { const [bid, lid] = arg.split('|'); run(() => E.batchDropOutput({ batchId: bid, lineId: lid }), 'اتشال السطر'); };
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
  const spice = E.batchById(bid).status === 'spice', cats = spice ? ['spice'] : ['meat', 'byproduct'];
  return `<div class="fgrid"><label class="fld"><span>${spice ? 'التوابل' : 'الصنف'} (من تلاجات الإنتاج)</span><select class="f" id="is-i">${S().items.filter(i => cats.includes(i.cat) && !i.waste && i.active !== false).map(i => `<option value="${i.id}">${esc(i.name)} · متاح ${kgf(E.available(i.id, E.rawStores()))} كجم</option>`).join('')}</select></label>
    <label class="fld"><span>الكمية (كجم)</span><input class="f" id="is-q" type="number" min="0.1" step="0.1"></label></div>
    <div class="note">بعد التأكيد السطر بيتقفل ومينفعش يتعدل. ${spice ? 'لما التوابل تخلص دوس «قفل التوابل» علشان التشغيلة تروح للتقفيل.' : 'التوابل بتتصرف في مرحلتها بعد ما اللحوم تتقفل.'}</div>`;
}
ACTS['b-issue'] = bid => modal(E.batchById(bid).status === 'spice' ? 'صرف توابل على التشغيلة' : 'صرف لحوم على التشغيلة', issueForm(bid), { saveText: 'تأكيد الصرف', save: async () => { const l = await E.issue({ batchId: bid, itemId: val('is-i'), qty: toG(val('is-q')), date: E.today() }); toast(`اتصرف ${kgf(l.qty)} كجم`, 'ok'); } });
ACTS['b-pack'] = bid => { const b = E.batchById(bid), mine = i => !i.reversed && E.item(i.itemId).cat === 'pack' && i.note !== 'تعبئة تلقائية';
  const prev = S().docs.batches.filter(x => x.id !== bid && x.issues.some(mine)).slice(-1)[0], cur = b.issues.filter(mine);
  packDialog({ title: 'أكياس واستيكرات على ' + b.no, note: 'تكلفتهم بتدخل على تكلفة العبوات. اللي يتصرف هنا مش بيتصرف تاني لوحده وقت القفل.',
    seed: (cur.length ? cur : prev ? prev.issues.filter(mine) : []).map(i => i.itemId), seedText: cur.length ? 'دي الأنواع اللي اتصرفت على التشغيلة دي قبل كده' : 'دي الأنواع اللي اتصرفت آخر تشغيلة',
    issueOne: (iid, q) => E.issue({ batchId: bid, itemId: iid, qty: q, date: E.today() }), okText: 'اتصرفت مواد التعبئة' }); };
ACTS['b-reopen'] = id => { const b = E.batchById(id); modal('فتح ' + esc(b.no) + ' تاني', `<div class="note">العبوات هتتشال من الفريزر، والأكياس والاستيكر اللي اتصرفوا تلقائي هيرجعوا المخزن، والتشغيلة ترجع جارية علشان تعدّل الصرف أو العدد وتقفلها تاني. ده بينفع بس لو محدش باع أو نقل من العبوات.</div><label class="fld"><span>السبب</span><input class="f" id="br-r" placeholder="مثلًا: عدد العبوات اتكتب غلط"></label>`,
  { saveText: 'افتحها', save: async () => { await E.reopenBatch({ batchId: id, reason: val('br-r') }); toast(`${b.no} اتفتحت تاني`, 'ok'); } }); };
ACTS['b-cancel'] = id => { const b = E.batchById(id); modal('إلغاء ' + esc(b.no), `<div class="note bad">كل الخامات والتوابل والأكياس اللي اتصرفت هترجع المخزن${b.status === 'closed' ? '، والعبوات هتتشال من الفريزر (لو محدش باع أو نقل منها)' : ''}. التشغيلة هتفضل في السجل باسم «اتلغت».</div><label class="fld"><span>سبب الإلغاء</span><input class="f" id="bc-r"></label>`,
  { saveText: 'إلغاء التشغيلة', save: async () => { await E.cancelBatch({ batchId: id, reason: val('bc-r') }); toast(`اتلغت ${b.no}`, 'ok'); } }); };
ACTS['b-rework'] = bid => { const b = E.batchById(bid); modal('رجوع «إعادة تصنيع»', `<div class="note info">العجينة اللي فضلت في الماكينة بترجع تلاجة الإنتاج كصنف <b>«إعادة تصنيع»</b>، بنصيبها من تكلفة الخامات، وتتصرف بعدين على أي تشغيلة. الخامات على ${esc(b.no)} دلوقتي: <b>${kgf(E.batchKg(b))} كجم</b>.</div>
  <div class="fgrid"><label class="fld"><span>الكمية (كجم)</span><input class="f" id="rw-q" type="number" min="0.1" step="0.1"></label></div>`, { saveText: 'رجّعها التلاجة', save: async () => { const l = await E.returnRework({ batchId: bid, qty: toG(val('rw-q')), date: E.today() }); toast(`رجع ${kgf(l.qty)} كجم إعادة تصنيع (${l.code})`, 'ok'); } }); };
ACTS['b-close'] = bid => {
  const b = E.batchById(bid), outs = b.outputs || [];
  if (!outs.length) { toast('سجّل الناتج الأول: المنتج والعبوة والعدد', 'bad'); const c = document.getElementById('bo-card'), f = document.getElementById('bo-n'); if (c) c.scrollIntoView({ block: 'center' }); if (f) f.focus(); return; }
  const inKg = E.batchKg(b), outKg = E.batchOutKg(b), count = outs.reduce((a, o) => a + o.count, 0), n = x => x.toLocaleString('en-US');
  const per = {}; outs.forEach(o => { per[o.packSize] = (per[o.packSize] || 0) + o.count; });
  const groups = []; outs.forEach(o => { const g = groups.find(x => x.p === o.productId && x.z === o.packSize); if (g) g.c += o.count; else groups.push({ p: o.productId, z: o.packSize, c: o.count }); });
  const ps = E.packStores(), stocked = S().items.filter(i => i.cat === 'pack' && i.active !== false).map(i => ({ i, n: E.available(i.id, ps) })).filter(x => x.n > 0).sort((a, c) => a.i.name.localeCompare(c.i.name, 'ar'));
  const isBag = x => !!x.i.packFor || /كيس|اكياس|أكياس|فاكيوم/.test(x.i.name), isStk = x => !!x.i.sticker || /استيكر|ستيكر/.test(x.i.name);
  const linked = sz => S().items.find(i => i.cat === 'pack' && i.packFor === sz && i.active !== false), stk0 = S().items.find(i => i.cat === 'pack' && i.sticker && i.active !== false);
  // what was already issued by hand on this batch is not issued again: the pick starts at «من غير» for it
  const hand = []; b.issues.filter(i => !i.reversed && E.item(i.itemId).cat === 'pack' && i.note !== 'تعبئة تلقائية').forEach(i => { const h = hand.find(x => x.i.id === i.itemId); if (h) h.q += i.qty; else hand.push({ i: E.item(i.itemId), q: i.qty }); });
  const handBag = hand.some(isBag), handStk = hand.some(isStk);
  const pickSel = (cls, extra, def, pref) => `<select class="f ${cls}" ${extra} style="min-width:190px"><option value="">من غير</option>${[...stocked.filter(pref), ...stocked.filter(x => !pref(x))].map(x => `<option value="${x.i.id}" ${def === x.i.id ? 'selected' : ''}>${esc(x.i.name)} · متاح ${n(x.n)}</option>`).join('')}</select>`;
  // start from what the last closed batch used for the same size (this product first), so the choice is made once
  const past = S().docs.batches.filter(x => x.status === 'closed' && x.picks).reverse().sort((x, y) => (y.productId === b.productId) - (x.productId === b.productId));
  const lastPick = (kind, sz) => { for (const x of past) { const v = x.picks[kind] && x.picks[kind][sz]; if (v && stocked.some(k => k.i.id === v)) return v; } return ''; };
  const defBag = sz => { if (handBag) return ''; const l = linked(sz); return l && stocked.some(x => x.i.id === l.id) ? l.id : lastPick('bags', sz) || (stocked.find(isBag) || {}).i?.id || ''; };
  const defStk = sz => (handStk ? '' : lastPick('stickers', sz) || (stk0 && stocked.some(x => x.i.id === stk0.id) ? stk0.id : (stocked.find(isStk) || {}).i?.id || ''));
  const allSizes = Object.keys(per).map(Number).sort((a, c) => a - c);
  const bagSizes = Object.keys(per).map(Number).sort((a, c) => a - c).filter(z => E.PACK_SIZES.includes(z) || linked(z));
  const w = inKg - outKg;
  modal(`قفل ${esc(b.no)}`, `<div class="note info">راجع الناتج. لما تقفل، العبوات بتدخل الفريزر والتكلفة بتتوزع عليها بالوزن.</div>
    <div class="made">${groups.map(g => `<div><small>${esc(E.item(g.p).name)}</small><b>${n(g.c)} <em>× ${packName(g.z)}</em></b><span>${kgf(g.c * g.z)} كجم</span></div>`).join('')}</div>
    <div class="smart" style="margin:14px 0"><div><small>الخامات</small><b>${kgf(inKg)} كجم</b></div><div><small>الناتج</small><b>${kgf(outKg)} كجم</b></div><div><small>الهدر</small><b>${kgf(w)} كجم · ${pct(w, inKg)}</b></div><div><small>عدد العبوات</small><b>${n(count)}</b></div></div>
    ${hand.length ? `<div class="note">اتصرف باليد على التشغيلة: ${hand.map(h => `${esc(h.i.name)} × ${n(h.q)}`).join('، ')}. دول مش هيتصرفوا تاني.</div>` : ''}
    <div class="tw"><table class="t cl-pk"><thead><tr><th>العبوة</th><th class="n">العدد</th><th>الكيس</th><th>الاستيكر</th></tr></thead><tbody>
      ${allSizes.map(z => `<tr><td><b>${packName(z)}</b></td><td class="n">${n(per[z])}</td><td>${bagSizes.includes(z) ? pickSel('cl-bag', `data-sz="${z}" aria-label="كيس ${packName(z)}"`, defBag(z), isBag) : '<span class="crumb">طبق: بيتصرف باليد</span>'}</td><td>${pickSel('cl-stk', `data-sz="${z}" aria-label="استيكر ${packName(z)}"`, defStk(z), isStk)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="crumb" style="margin:8px 0 12px">كل عبوة ليها الكيس والاستيكر بتوعها، وبيتصرفوا من المخزن بعدد العبوات. اختار «من غير» لو اتصرفوا قبل كده أو ما اتستخدموش. الاختيار بيتحفظ للتشغيلة الجاية.</div>
    <label class="fld" style="max-width:220px"><span>تاريخ القفل</span><input class="f" id="cl-d" type="date" value="${E.today()}" max="${E.today()}"></label>`,
  { wide: true, saveText: 'قفل التشغيلة', save: async () => {
    const bagsUsed = {}, stkUsed = {}; document.querySelectorAll('.cl-bag').forEach(el => { bagsUsed[+el.dataset.sz] = el.value; }); document.querySelectorAll('.cl-stk').forEach(el => { stkUsed[+el.dataset.sz] = el.value; });
    const r = await E.closeBatch({ batchId: bid, date: val('cl-d'), bags: bagsUsed, stickers: stkUsed }); toast(`اتقفلت ${r.no}: ${kgf(r.output)} كجم`, 'ok');
  } });
};

/* ========== WORKER (tablet) ========== */
const WK = { batch: null, item: null, qty: '', cat: 'meat', sub: '', q: '' };
PAGES.worker = () => {
  const s = S(), r = U.role();
  // the meat worker sees batches still at the meat stage; the dry (packing) worker sees batches handed to packing; the supervisor sees both
  // the owner and the supervisor switch between the two workers' views
  const VIEWS = { meat: ['open', 'عامل اللحوم'], spice: ['spice', 'عامل التوابل'], pack: ['packing', 'عامل التقفيل'], cut: ['', 'الجزارة'] };
  const mine = r === 'worker' ? ['meat', 'spice', 'cut'] : r === 'packer' ? ['pack', 'cut'] : ['meat', 'spice', 'pack', 'cut']; if (!mine.includes(WK.view)) WK.view = mine[0];
  const cnt = v => (v === 'cut' ? (s.docs.butcheries || []).filter(x => x.status === 'open').length : s.docs.batches.filter(x => x.status === VIEWS[v][0]).length);
  const views = `<div class="bar"><div class="seg wk-views">${mine.map(v => `<button class="${WK.view === v ? 'on' : ''}" data-act="wk-view" data-arg="${v}">${VIEWS[v][1]} <small>(${cnt(v)})</small></button>`).join('')}</div></div>`;
  if (WK.view === 'cut') { workerCut(views); return; } // an open butchery run: the workers add its output and bags here
  const stage = VIEWS[WK.view][0];
  const stageOk = x => x.status === stage && !(r === 'packer' && x.packDoneAt); // the packer's closed batches wait for the supervisor
  const open = s.docs.batches.filter(stageOk);
  if (WK.batch && !open.some(x => x.id === WK.batch)) { WK.batch = null; WK.item = null; }
  if (!WK.batch && open.length === 1) WK.batch = open[0].id;
  const b = WK.batch && E.batchById(WK.batch);
  const lim = s.settings.issueLimitKg * 1000;
  let right = '';
  if (b) {
    const packing = b.status === 'packing', spicing = b.status === 'spice', boss = ['owner', 'supervisor'].includes(r);
    const cats = packing ? [['pack', 'مواد تعبئة وتقفيل']] : spicing ? [['spice', 'توابل وإضافات']] : [['meat', 'لحوم']];
    if (!cats.some(([c]) => c === WK.cat)) { WK.cat = cats[0][0]; WK.sub = ''; WK.item = null; WK.qty = ''; }
    const store = c => (c === 'pack' ? E.packStores() : E.rawStores());
    const pool = s.items.filter(i => i.cat === WK.cat && i.active !== false);
    const subs = WK.cat === 'meat' ? [...new Set([...E.MEAT_SECTIONS, ...pool.map(i => i.sub).filter(Boolean)])].filter(x => E.MEAT_SECTIONS.includes(x) || pool.some(i => i.sub === x)) : [];
    const unsorted = WK.cat === 'meat' && pool.some(i => !i.sub);
    if (WK.sub && WK.sub !== '-' && !subs.includes(WK.sub)) WK.sub = '';
    const wq = WK.q.trim();
    const items = pool.filter(i => (!wq || i.name.includes(wq) || (i.code || '').toLowerCase().includes(wq.toLowerCase())) && (wq || !WK.sub || (WK.sub === '-' ? !i.sub : i.sub === WK.sub)));
    const it = WK.item && E.item(WK.item);
    const pc = it && it.unit === 'pc', show = (n, u) => (u === 'pc' ? `${n.toLocaleString('en-US')} قطعة` : `${kgf(n)} كجم`);
    const g = it ? ((pc ? toI(WK.qty || '0') : toG(WK.qty || '0')) || 0) : 0;
    const already = it ? E.issuedOf(b, it.id) : 0;
    const av = it ? E.available(it.id, store(it.cat)) : 0;
    const canHand = !packing && ['owner', 'supervisor', 'worker'].includes(r), stageCat = i => { const c = E.item(i.itemId).cat; return packing ? c === 'pack' : spicing ? c === 'spice' : c !== 'pack' && c !== 'spice'; };
    right = `<div class="card"><div class="hd"><h3>٢. اختار الصنف</h3><div class="tools seg">${cats.map(([c, t]) => `<button class="${WK.cat === c ? 'on' : ''}" data-act="wk-cat" data-arg="${c}">${t}</button>`).join('')}</div></div><div class="bd">
      ${packing ? '<div class="note info">التشغيلة دي عند التقفيل: سجّل الأكياس والاستيكرات والأطباق اللي اتصرفت، وبعدها عدد العبوات اللي طلعت تحت.</div>' : spicing ? '<div class="note info">عامل اللحوم قفل اللحمة. اصرف التوابل والإضافات، وبعدها اقفل التوابل.</div>' : ''}
      <div class="wk-filter"><input class="f" id="wk-q" type="search" placeholder="ابحث باسم الصنف" value="${esc(WK.q)}" aria-label="ابحث باسم الصنف">
        ${subs.length ? `<div class="seg wk-subs"><button class="${WK.sub ? '' : 'on'}" data-act="wk-sub" data-arg="">الكل</button>${subs.map(x => `<button class="${WK.sub === x ? 'on' : ''}" data-act="wk-sub" data-arg="${esc(x)}">${esc(x)}</button>`).join('')}${unsorted ? `<button class="${WK.sub === '-' ? 'on' : ''}" data-act="wk-sub" data-arg="-">من غير قسم</button>` : ''}</div>` : ''}</div>
      <div class="wk-items">
      ${items.length ? '' : '<div class="empty">مفيش صنف بالاسم ده</div>'}${items.map(i => { const a = E.available(i.id, store(i.cat)), done = E.issuedOf(b, i.id); return `<button class="wk-i ${WK.item === i.id ? 'on' : ''}" data-act="wk-item" data-arg="${i.id}" ${a ? '' : 'disabled'}><b>${esc(i.name)}</b><small>متاح ${show(a, i.unit)}</small>${done ? `<small style="color:var(--red)">اتصرف ${show(done, i.unit)}</small>` : ''}</button>`; }).join('')}</div></div></div>
    ${it ? `<div class="card"><div class="hd"><h3>٣. ${pc ? 'العدد' : 'الكمية بالكيلو'}: ${esc(it.name)}</h3></div><div class="bd wk-weigh">
      <div class="wk-pad"><div class="wk-qty ${WK.qty ? '' : 'empty'}" id="wk-qty"><b>${esc(WK.qty || '0')}</b><small>${pc ? 'قطعة' : 'كجم'}</small></div>
      <div class="pad">${['7', '8', '9', '4', '5', '6', '1', '2', '3', pc ? '' : '.', '0', '⌫'].map(k => k ? `<button data-act="wk-key" data-arg="${k}"${k === '⌫' ? ' aria-label="امسح رقم" title="امسح رقم"' : ''}>${k}</button>` : '<span></span>').join('')}</div></div>
      <div class="wk-side">
        <div class="wk-sum"><div><span>المتاح في المخزن</span><b>${show(av, it.unit)}</b></div><div><span>اتصرف قبل كده</span><b>${show(already, it.unit)}</b></div><div class="tot"><span>الإجمالي بعد الصرف</span><b>${show(already + g, it.unit)}</b></div></div>
        ${!pc && already + g > lim ? `<div class="note bad">هتعدّي حد ${s.settings.issueLimitKg} كجم للصنف ده. الصرف هيتسجل، وهيروح تنبيه للمالك على تليجرام.</div>` : ''}
        ${g > av ? `<div class="note bad">الكمية أكبر من المتاح في المخزن.</div>` : ''}
        <button class="btn p lg" data-act="wk-go" ${g > 0 && g <= av ? '' : 'disabled'}>${ic('check')} ${g > 0 ? `تأكيد صرف ${show(g, it.unit)}` : pc ? 'اكتب العدد الأول' : 'اكتب الوزن الأول'}</button>
        <span class="crumb wk-hint">بعد التأكيد مينفعش تعدّل. لو غلطت ابعت طلب تصحيح.</span></div></div></div>` : ''}
    ${canHand ? (spicing ? `<div class="card"><div class="bd bar"><span class="grow">خلّصت صرف التوابل على ${esc(b.no)}؟ اقفلها وابعتها لعامل التقفيل.</span><button class="btn p" data-act="wk-spice" data-arg="${b.id}">${ic('check')} قفلت التوابل، ابعتها للتقفيل</button></div></div>` : `<div class="card"><div class="bd bar"><span class="grow">خلّصت صرف اللحوم على ${esc(b.no)}؟ اقفلها وابعتها لعامل التوابل.</span><button class="btn p" data-act="wk-done" data-arg="${b.id}">${ic('check')} قفلت اللحوم، ابعتها للتوابل</button></div></div>`) : ''}
    ${packing ? outSheet(b, boss || (r === 'packer' && !b.packDoneAt)) + (!b.packDoneAt && (boss || r === 'packer') ? `<div class="card"><div class="bd bar"><span class="grow">سجّلت الأكياس والاستيكرات وعدد العبوات على ${esc(b.no)}؟ اقفل التقفيل، والمشرف يقفل التشغيلة.</span><button class="btn p" data-act="wk-packdone" data-arg="${b.id}">${ic('check')} قفلت التقفيل</button></div></div>` : '') : ''}
    <div class="card"><div class="hd"><h3>اللي اتصرف على ${esc(b.no)}</h3></div><div class="bd">${table('wk-' + b.id, [
      { t: 'الصنف', f: i => esc(E.item(i.itemId).name) + (i.note ? ` <span class="pill mut">${esc(i.note)}</span>` : '') }, { t: 'الكمية', n: 1, f: i => `<b>${qtyf(i.qty, E.item(i.itemId).unit)}</b>` }, { t: 'بواسطة', f: i => esc(E.userName(i.by)) }, { t: 'الوقت', f: i => i.at.slice(11, 16) },
      { t: '', f: i => i.reversed ? `<span class="pill bad">اتعكس</span>` : S().docs.corrections.some(c => c.issueId === i.id && c.status === 'pending') ? '<span class="pill info">طلب تصحيح مستني</span>' : `<span class="lock">${ic('lock')} مقفول</span> <button class="btn sm" data-act="corr-req" data-arg="${b.id}|${i.id}">طلب تصحيح</button>` }],
      b.issues.filter(stageCat).slice().reverse().map(i => ({ ...i, _cls: i.reversed ? 'muted' : '' })), { empty: 'لسه مفيش صرف' })}</div></div>`;
  }
  const kgIn = x => sumBy(x.issues.filter(i => !i.reversed && E.item(i.itemId).cat !== 'pack'), i => i.qty);
  page('شاشة العامل', `${views}<div class="wk">
    <div class="card"><div class="hd"><h3>١. اختار التشغيلة</h3>${stage === 'packing' ? '<span class="sub">اللي التوابل اتقفلت عليها</span>' : stage === 'spice' ? '<span class="sub">اللي عامل اللحوم قفلها</span>' : ''}</div><div class="bd">${open.length ? `<div class="wk-batches">${open.map(x => `<button class="wk-b ${WK.batch === x.id ? 'on' : ''}" data-act="wk-batch" data-arg="${x.id}"><span class="mono">${esc(x.no)}${x.status === 'packing' ? ' · تقفيل' : x.status === 'spice' ? ' · توابل' : ''}</span><b>${esc(E.item(x.productId).name)}</b><small>مخطط ${kgf(x.planned)} كجم · اتصرف ${kgf(kgIn(x))} كجم</small></button>`).join('')}</div>` : `<div class="empty">${stage === 'packing' ? 'مفيش تشغيلة مستنية تقفيل دلوقتي.' : stage === 'spice' ? 'مفيش تشغيلة مستنية توابل دلوقتي.' : 'مفيش تشغيلة مفتوحة. المشرف يفتح تشغيلة الأول.'}</div>`}</div></div>
    ${right}</div>`, { crumb: esc(E.me().name) });
  if (b && b.status === 'packing') outWire(b);
  const wq = document.getElementById('wk-q'); let tq;
  if (wq) wq.oninput = e => { clearTimeout(tq); tq = setTimeout(() => { WK.q = e.target.value; WK.item = null; WK.qty = ''; U.render(); const n = document.getElementById('wk-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
};
ACTS['wk-done'] = id => { const b = E.batchById(id), spiced = b.issues.some(i => !i.reversed && E.item(i.itemId).cat === 'spice');
  modal('قفل اللحوم', `<div style="font-size:17px">هتقفل مرحلة اللحوم على <b>${esc(b.no)}</b> (${kgf(E.batchKg(b))} كجم)، والتشغيلة تروح لعامل التوابل. بعدها مش هينفع تصرف عليها لحوم تاني.</div>
    ${spiced ? '' : '<label class="chk" style="margin-top:12px"><input type="checkbox" id="wk-nosp"> <span>المنتج ده <b>بدون توابل</b>: ابعته للتقفيل على طول</span></label>'}`,
  { saveText: 'أيوه، قفلت اللحوم', save: async () => { const el = document.getElementById('wk-nosp'), ns = !!(el && el.checked); await E.finishMeat({ batchId: id, noSpice: ns }); toast(`${b.no} اتحولت ${ns ? 'للتقفيل' : 'للتوابل'}`, 'ok'); WK.batch = null; } }); };
ACTS['wk-spice'] = id => { const b = E.batchById(id), spiced = b.issues.some(i => !i.reversed && E.item(i.itemId).cat === 'spice');
  modal('قفل التوابل', `<div style="font-size:17px">هتقفل مرحلة التوابل على <b>${esc(b.no)}</b>، والتشغيلة تروح لعامل التقفيل. بعدها مش هينفع تصرف عليها توابل تاني.</div>${spiced ? '' : '<div class="note info">مفيش توابل اتصرفت على التشغيلة دي. لو المنتج ده بيتعمل <b>بدون توابل</b> كمّل عادي، وهتتسجل «بدون توابل».</div>'}`,
  { saveText: spiced ? 'أيوه، قفلت التوابل' : 'كمّل بدون توابل', save: async () => { await E.finishSpice({ batchId: id, noSpice: !spiced }); toast(`${b.no} اتحولت للتقفيل`, 'ok'); WK.batch = null; } }); };
ACTS['wk-packdone'] = id => { const b = E.batchById(id), outs = b.outputs || [];
  if (!outs.length) { toast('سجّل عدد العبوات الناتجة الأول', 'bad'); const f = document.getElementById('bo-n'); if (f) f.focus(); return; }
  modal('قفل التقفيل', `<div style="font-size:17px">هتقفل التقفيل على <b>${esc(b.no)}</b>: <b>${kgf(E.batchOutKg(b))} كجم</b> في <b>${outs.reduce((a, o) => a + o.count, 0).toLocaleString('en-US')}</b> عبوة. المشرف هيراجع ويقفل التشغيلة.</div><div class="note">اتأكد إنك سجّلت كل الأكياس والاستيكرات والعبوات. بعد القفل التعديل من عند المشرف.</div>`,
  { saveText: 'أيوه، قفلت التقفيل', save: async () => { await E.finishPack({ batchId: id }); toast(`${b.no} مستنية القفل النهائي من المشرف`, 'ok'); WK.batch = null; } }); };
ACTS['wk-view'] = v => { WK.view = v; WK.batch = null; WK.item = null; WK.qty = ''; U.render(); };
ACTS['wk-run'] = id => { WK.run = id; BU.item = ''; BU.q = ''; WK.item = null; WK.qty = ''; WK.q = ''; WK.sub = ''; WK.cutCat = 'meat'; U.render(); };
function workerCut(views) {
  const runs = (S().docs.butcheries || []).filter(x => x.status === 'open');
  if (WK.run && !runs.some(x => x.id === WK.run)) WK.run = null;
  if (!WK.run && runs.length === 1) WK.run = runs[0].id;
  const r = WK.run && runs.find(x => x.id === WK.run), inName = x => [...new Set(x.inputs.map(i => E.item(i.itemId).name))].join('، ');
  let right = '';
  if (r) {
    const inKg = E.butIn(r), outKg = E.butOut(r), loss = inKg - outKg, bags = r.packs.reduce((a, p) => a + p.qty, 0);
    const cols = [{ t: 'الصنف', f: o => `<b>${esc(E.item(o.itemId).name)}</b>${o.count ? ` <small>(${o.count} × ${packName(o.packSize)})</small>` : ''}` }, { t: 'الكمية', n: 1, f: o => (o.count ? `${o.count} <small>(${kgf(o.qty)} كجم)</small>` : kgf(o.qty) + ' كجم') },
      { t: 'التلاجة', f: o => (o.wh ? esc(E.whName(o.wh)) : '<span class="crumb">وقت القفل</span>') }, { t: 'ملاحظات', f: o => esc(o.note || '') }, { t: 'بواسطة', f: o => esc(E.userName(o.by)) }, { t: 'الوقت', f: o => (o.at || '').slice(11, 16) },
      { t: '', f: o => `<button class="btn sm" data-act="bu-edit" data-arg="${r.id}|${o.id}">تعديل</button> <button class="btn sm dan" data-act="bu-drop" data-arg="${r.id}|${o.id}" aria-label="شيل السطر">✕</button>` }];
    right = `<div class="card"><div class="bd"><div class="smart"><div><small>الداخل</small><b>${kgf(inKg)} كجم</b></div><div><small>الناتج لحد دلوقتي</small><b>${kgf(outKg)} كجم</b></div><div><small>الباقي</small><b style="color:var(--${loss < 0 ? 'bad' : 'ink'})">${kgf(loss)} كجم · ${pct(loss, inKg)}</b></div><div><small>التغليف</small><b>${bags ? bags.toLocaleString('en-US') + ' قطعة' : '—'}</b></div></div></div></div>
      ${WK.cutCat === 'pack' ? cutPackCard(r) : cutPicker(r)}
      ${buForm(r, false)}
      <div class="card"><div class="hd"><h3>ناتج ${esc(r.no)}</h3><span class="sub">بيدخل المخزن لما المشرف يقفل التشغيلة</span></div><div class="bd">${table('wkc-' + r.id, cols, r.outputs.slice().reverse(), { empty: 'لسه مفيش ناتج. اختار الصنف واكتب وزنه ودوس «أضف السطر».' })}</div></div>`;
  }
  page('شاشة العامل', `${views}<div class="wk">
    <div class="card"><div class="hd"><h3>١. اختار تشغيلة الجزارة</h3></div><div class="bd">${runs.length ? `<div class="wk-batches">${runs.map(x => `<button class="wk-b ${WK.run === x.id ? 'on' : ''}" data-act="wk-run" data-arg="${x.id}"><span class="mono">${esc(x.no)} · جزارة</span><b>${esc(inName(x) || x.note || 'لسه مفيش خامة')}</b><small>الداخل ${kgf(E.butIn(x))} كجم · الناتج ${kgf(E.butOut(x))} كجم</small></button>`).join('')}</div>` : '<div class="empty">مفيش تشغيلة جزارة مفتوحة دلوقتي. المشرف أو أمين المخزن يفتحها الأول.</div>'}</div></div>
    ${right}</div>`, { crumb: esc(E.me().name) });
  buWire();
  const wq = document.getElementById('wkc-q'); let tq;
  if (wq) wq.oninput = e => { clearTimeout(tq); tq = setTimeout(() => { WK.q = e.target.value; WK.item = null; WK.qty = ''; U.render(); const n = document.getElementById('wkc-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}
/* raw meat a butchery run takes, and the worker's picker for it (sections, item buttons, number pad) */
const cutInItems = (spice) => S().items.filter(i => (spice ? i.cat === 'spice' : ['carcass', 'meat', 'byproduct'].includes(i.cat)) && !i.rework && !i.waste && i.unit === 'kg' && i.active !== false);
function cutPicker(r) {
  const sp = WK.cutCat === 'spice', s = S(), pool = cutInItems(sp), store = E.rawStores();
  const subs = sp ? [] : [...new Set([...E.MEAT_SECTIONS, ...pool.map(i => i.sub).filter(Boolean)])].filter(x => pool.some(i => i.sub === x));
  if (WK.sub && WK.sub !== '-' && !subs.includes(WK.sub)) WK.sub = '';
  const wq = (WK.q || '').trim(), mine = id => r.inputs.filter(x => x.itemId === id).reduce((a, x) => a + x.qty, 0);
  const items = pool.filter(i => (!wq || i.name.includes(wq) || (i.code || '').toLowerCase().includes(wq.toLowerCase())) && (wq || !WK.sub || (WK.sub === '-' ? !i.sub : i.sub === WK.sub)))
    .sort((a, c) => (E.available(c.id, store) > 0) - (E.available(a.id, store) > 0) || (a.cat === 'carcass' ? 0 : 1) - (c.cat === 'carcass' ? 0 : 1));
  const it = WK.item && pool.find(i => i.id === WK.item), g = it ? toG(WK.qty || '0') || 0 : 0, av = it ? E.available(it.id, store) : 0;
  const own = ['worker'].includes(U.role()), back = x => !own || x.by === E.me().id;
  const inCols = [{ t: 'الصنف', f: x => `<b>${esc(E.item(x.itemId).name)}</b>` }, { t: 'الوزن', n: 1, f: x => kgf(x.qty) + ' كجم' }, { t: 'الدفعة', f: x => `<span class="mono">${esc(x.code)}</span>` }, { t: 'بواسطة', f: x => esc(E.userName(x.by)) }, { t: 'الوقت', f: x => (x.at || '').slice(11, 16) },
    { t: '', f: x => (back(x) ? `<button class="btn sm dan" data-act="bu-indrop" data-arg="${r.id}|${x.id}" aria-label="رجّع السطر ده للمخزن">رجّع</button>` : '') }];
  return `<div class="card"><div class="hd"><h3>٢. اصرف على التشغيلة</h3><div class="tools seg">${[['meat', 'لحوم'], ['spice', 'توابل (لو فيه)'], ['pack', 'تغليف (لو فيه)']].map(([c, t]) => `<button class="${(WK.cutCat || 'meat') === c ? 'on' : ''}" data-act="wkc-cat" data-arg="${c}">${t}</button>`).join('')}</div></div><div class="bd">
      ${sp ? '<div class="note info">التوابل اختيارية: اصرفها بس لو القطعيات اتتبلت. وزنها وتكلفتها بيدخلوا على التشغيلة.</div>' : ''}
      <div class="wk-filter"><input class="f" id="wkc-q" type="search" placeholder="ابحث باسم الصنف" value="${esc(WK.q || '')}" aria-label="ابحث باسم الصنف">
        ${subs.length ? `<div class="seg wk-subs"><button class="${WK.sub ? '' : 'on'}" data-act="wk-sub" data-arg="">الكل</button>${subs.map(x => `<button class="${WK.sub === x ? 'on' : ''}" data-act="wk-sub" data-arg="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}</div>
      <div class="wk-items">${items.length ? '' : '<div class="empty">مفيش صنف بالاسم ده</div>'}${items.map(i => { const a = E.available(i.id, store), d = mine(i.id); return `<button class="wk-i ${WK.item === i.id ? 'on' : ''}" data-act="wk-item" data-arg="${i.id}" ${a ? '' : 'disabled'}><b>${esc(i.name)}</b><small>متاح ${kgf(a)} كجم</small>${d ? `<small style="color:var(--red)">اتصرف ${kgf(d)} كجم</small>` : ''}</button>`; }).join('')}</div></div></div>
    ${it ? `<div class="card"><div class="hd"><h3>الوزن بالكيلو: ${esc(it.name)}</h3></div><div class="bd wk-weigh">
      <div class="wk-pad"><div class="wk-qty ${WK.qty ? '' : 'empty'}" id="wk-qty"><b>${esc(WK.qty || '0')}</b><small>كجم</small></div>
      <div class="pad">${['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map(k => `<button data-act="wk-key" data-arg="${k}"${k === '⌫' ? ' aria-label="امسح رقم" title="امسح رقم"' : ''}>${k}</button>`).join('')}</div></div>
      <div class="wk-side">
        <div class="wk-sum"><div><span>المتاح في المخزن</span><b>${kgf(av)} كجم</b></div><div><span>اتصرف على التشغيلة</span><b>${kgf(mine(it.id))} كجم</b></div><div class="tot"><span>الإجمالي بعد الصرف</span><b>${kgf(mine(it.id) + g)} كجم</b></div></div>
        ${g > av ? '<div class="note bad">الوزن أكبر من المتاح في المخزن.</div>' : ''}
        <button class="btn p lg" data-act="wkc-go" data-arg="${r.id}" ${g > 0 && g <= av ? '' : 'disabled'}>${ic('check')} ${g > 0 ? `تأكيد صرف ${kgf(g)} كجم` : 'اكتب الوزن الأول'}</button>
        <span class="crumb wk-hint">بيتصرف من أقدم دفعة. لو غلطت تقدر ترجّع السطر من الجدول تحت.</span></div></div></div>` : ''}
    <div class="card"><div class="hd"><h3>اللي اتصرف على ${esc(r.no)}</h3></div><div class="bd">${table('wki-' + r.id, inCols, r.inputs.slice().reverse(), { empty: 'لسه مفيش خامة اتصرفت.' })}</div></div>`;
}
ACTS['wkc-cat'] = c => { WK.cutCat = c; WK.item = null; WK.qty = ''; WK.sub = ''; WK.q = ''; U.render(); };
// packaging on a butchery run (bags, trays, stickers): optional, the same multi-type dialog as the run page
function cutPackCard(r) {
  const n = r.packs.reduce((a, p) => a + p.qty, 0);
  return `<div class="card"><div class="hd"><h3>٢. اصرف على التشغيلة</h3><div class="tools seg">${[['meat', 'لحوم'], ['spice', 'توابل (لو فيه)'], ['pack', 'تغليف (لو فيه)']].map(([c, t]) => `<button class="${c === 'pack' ? 'on' : ''}" data-act="wkc-cat" data-arg="${c}">${t}</button>`).join('')}</div></div><div class="bd">
    <div class="note info">التغليف اختياري: سجّل الأكياس أو الأطباق أو الاستيكر بس لو اتستخدموا. تكلفتهم بتدخل على القطعيات.</div>
    <div class="bar" style="margin:12px 0"><span class="grow">${n ? r.packs.map(p_ => `${esc(E.item(p_.itemId).name)} × ${p_.qty.toLocaleString('en-US')}`).join('، ') : '<span class="crumb">لسه مفيش تغليف اتسجل على التشغيلة دي.</span>'}</span><button class="btn p" data-act="bu-pack" data-arg="${r.id}">${ic('plus')} صرف تغليف</button></div></div></div>`;
}
ACTS['wkc-go'] = id => { const it = E.item(WK.item), g = toG(WK.qty), r = (S().docs.butcheries || []).find(x => x.id === id);
  modal('تأكيد الصرف', `<div style="font-size:18px">هتصرف <b>${kgf(g)} كجم ${esc(it.name)}</b> على تشغيلة الجزارة <b>${esc(r.no)}</b>.</div>`,
    { saveText: 'أيوه، صرف', save: async () => { await E.butcheryIssue({ id, itemId: it.id, qty: g }); toast(`اتصرف ${kgf(g)} كجم ${it.name} ✓`, 'ok'); WK.item = null; WK.qty = ''; } }); };
ACTS['wk-batch'] = id => { WK.batch = id; WK.item = null; WK.qty = ''; U.render(); };
ACTS['wk-cat'] = c => { WK.cat = c; WK.sub = ''; WK.item = null; WK.qty = ''; U.render(); };
ACTS['wk-sub'] = x => { WK.sub = x || ''; WK.item = null; WK.qty = ''; U.render(); };
ACTS['wk-item'] = id => { WK.item = id; WK.qty = ''; U.render(); const q = document.getElementById('wk-qty'); if (q) q.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); };
ACTS['wk-key'] = k => { if (k === '.' && WK.item && E.item(WK.item).unit === 'pc') return; if (k === '⌫') WK.qty = WK.qty.slice(0, -1); else if (k === '.') { if (!WK.qty.includes('.')) WK.qty = (WK.qty || '0') + '.'; } else if (WK.qty.length < 7 && !(WK.qty.includes('.') && WK.qty.split('.')[1].length >= 3)) WK.qty = (WK.qty === '0' ? '' : WK.qty) + k; U.render(); };
ACTS['wk-go'] = () => {
  const it = E.item(WK.item), pc = it.unit === 'pc', g = pc ? toI(WK.qty) : toG(WK.qty), txt = pc ? `${g} قطعة` : `${kgf(g)} كجم`;
  modal('تأكيد الصرف', `<div style="font-size:18px">هتصرف <b>${txt} ${esc(it.name)}</b> على التشغيلة <b>${esc(E.batchById(WK.batch).no)}</b>.</div><div class="note">بعد التأكيد السطر بيتقفل ومينفعش يتعدل.</div>`,
    { saveText: 'أيوه، صرف', save: async () => { await E.issue({ batchId: WK.batch, itemId: WK.item, qty: g, date: E.today() }); toast(`اتسجل ${txt} ${it.name} ✓`, 'ok'); WK.item = null; WK.qty = ''; } });
};

/* ========== CUTTING ========== */
const BU = { q: '', item: '', mode: 'kg' }; // butchery output form state
PAGES.cutting = () => {
  const s = S(), cost = canCost(), tb = tabs('cu', [['runs', 'تشغيلات الجزارة'], ['old', 'تقطيع قديم']], 'runs');
  const can = ['owner', 'supervisor', 'storekeeper'].includes(U.role());
  const runs = (s.docs.butcheries || []).slice().reverse();
  let body;
  if (tb.cur === 'runs') {
    const cols = [{ t: 'الرقم', f: r => `<b class="mono">${esc(r.no)}</b>` }, { t: 'التاريخ', f: r => df(r.date) }, { t: 'الحالة', f: r => r.status === 'open' ? '<span class="pill warn">شغالة</span>' : r.status === 'cancelled' ? '<span class="pill bad">اتلغت</span>' : '<span class="pill ok">مقفولة</span>' },
      { t: 'الداخل', n: 1, f: r => kgf(E.butIn(r)) + ' كجم' }, { t: 'الناتج', n: 1, f: r => kgf(E.butOut(r)) + ' كجم' }, { t: 'الفقد', n: 1, f: r => r.status === 'closed' ? `${kgf(r.loss)} كجم · ${pct(r.loss, r.inKg)}` : '—' }];
    if (cost) cols.push({ t: 'التكلفة', n: 1, f: r => fm(E.butCost(r)) });
    body = `<div class="note info">تشغيلة الجزارة زي التشغيلة العادية: بتفتحها بوزن العجل، تضيف الأكياس اللي اتصرفت، وتسجل كل الناتج (لحمة، دهن، عضم…). عند القفل تكلفة العجل والأكياس بتتوزع على القطعيات <b>بنسبة قيمتها البيعية</b> (العضم والنواتج تكلفتها صفر)، والفقد = الداخل − الناتج.</div>
      <div class="bar"><span class="grow"></span>${can ? `<button class="btn p" data-act="bu-new">${ic('plus')} تشغيلة جزارة جديدة</button>` : ''}</div>
      <div class="card"><div class="bd">${table('bu', cols, runs, { onRow: r => 'butchery/' + r.id, empty: 'لسه مفيش تشغيلات جزارة' })}</div></div>`;
  } else {
    const cols = [{ t: 'الرقم', f: c => `<b class="mono">${esc(c.no)}</b>` }, { t: 'التاريخ', f: c => df(c.date) }, { t: 'الدفعة', f: c => `<span class="mono">${esc(c.srcLot)}</span>` }, { t: 'الداخل', n: 1, f: c => kgf(c.qty) + ' كجم' },
      { t: 'الناتج', f: c => c.outputs.map(o => `${esc(E.item(o.itemId).name)} ${kgf(o.qty)}`).join(' · ') }, { t: 'الهدر', n: 1, f: c => `${kgf(c.waste)} كجم · ${pct(c.waste, c.qty)}` }];
    if (cost) cols.push({ t: 'التكلفة', n: 1, f: c => fm(c.cost) });
    body = `<div class="card"><div class="bd">${table('cut', cols, s.docs.cuttings.slice().reverse(), { empty: 'مفيش' })}</div></div>`;
  }
  page('تشغيلات الجزارة', `<div class="bar">${tb.html}</div>${body}`);
};
const calfLots = () => S().lots.filter(l => ['carcass', 'meat', 'byproduct'].includes(E.item(l.itemId).cat) && !E.item(l.itemId).rework && l.qty > 0 && ['raw', 'receiving'].includes(E.whUse(l.wh))).sort((a, b) => ((E.item(a.itemId).cat === 'carcass' ? 0 : 1) - (E.item(b.itemId).cat === 'carcass' ? 0 : 1)) || b.n - a.n); // calves first, newest lot first
ACTS['bu-new'] = () => {
  const lots = calfLots();
  modal('تشغيلة جزارة جديدة', `<div class="note info">افتح التشغيلة، والعمال يصرفوا عليها الخامة (لحم بالعضم، زنود…) من «شاشة العامل» ← «الجزارة»، زي التشغيلة العادية. أو اختار دفعة معيّنة تدخل دلوقتي.</div>
    <div class="fgrid"><label class="fld"><span>الخامة</span><select class="f" id="bn-l"><option value="" data-q="0" data-info="العمال هيختاروا الأصناف والأوزان من شاشة العامل">العمال هيصرفوها من شاشة العامل</option>${lots.map(l => `<option value="${l.id}" data-q="${l.qty}" data-info="${kgf(l.qty)} كجم · ${esc(l.code)} · ${esc(E.whName(l.wh))}">${esc(E.item(l.itemId).name)} · ${kgf(l.qty)} كجم · ${esc(l.code)} · ${esc(E.whName(l.wh))}</option>`).join('')}</select><small class="crumb" id="bn-info">العمال هيختاروا الأصناف والأوزان من شاشة العامل</small></label>
    <label class="fld" id="bn-qf" hidden><span>الوزن الداخل (كجم)</span><input class="f" id="bn-q" type="number" min="0" step="0.5"></label>
    <label class="fld"><span>التاريخ</span><input class="f" id="bn-d" type="date" value="${E.today()}" max="${E.today()}"></label>
    <label class="fld"><span>ملاحظة (الجهة / المعلم)</span><input class="f" id="bn-n"></label></div>`,
  { saveText: 'فتح التشغيلة', save: async () => { const lot = val('bn-l'), r = await E.openButchery({ date: val('bn-d'), lotId: lot || undefined, qty: lot ? toG(val('bn-q')) : undefined, note: val('bn-n') }); toast(`اتفتحت ${r.no}`, 'ok'); setTimeout(() => U.go('butchery', r.id)); } });
  document.getElementById('bn-l').onchange = e => { const o = e.target.selectedOptions[0]; document.getElementById('bn-qf').hidden = !o.value; document.getElementById('bn-q').value = o.dataset.q / 1000; document.getElementById('bn-info').textContent = o.dataset.info; };
};
/* the «إضافة ناتج» form of a butchery run: used on the run's page and on the worker screen */
const buWhs = it => E.warehouses().filter(w => (it && it.cat === 'product' ? ['fg'] : ['raw', 'receiving']).includes(w.use)).sort((a, c) => (a.use === 'receiving') - (c.use === 'receiving')); // production fridges first
const buWhSel = (it, cur, id) => { const ws = buWhs(it), v = ws.some(w => w.id === cur) ? cur : (ws.find(w => w.use !== 'receiving') || ws[0] || {}).id; return `<select class="f" id="${id}">${ws.map(w => `<option value="${w.id}" ${w.id === v ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>`; };
function buForm(r, newItem) {
  const s = S();
  const outs = s.items.filter(i => ((i.cat === 'meat' || i.cat === 'byproduct') && !i.rework || (i.cat === 'product' && i.group !== 'مصنعات')) && i.active !== false);
  const q = BU.q.trim(), shown = outs.filter(i => !q || i.name.includes(q) || i.code.toLowerCase().includes(q.toLowerCase()));
  if (!shown.some(i => i.id === BU.item)) BU.item = (shown.find(i => i.cat !== 'product') || shown[0] || {}).id || '';
  const selIt = BU.item && E.item(BU.item); if (selIt && selIt.cat === 'product') BU.mode = 'n';
  return `<div class="card no-print"><div class="hd"><h3>إضافة ناتج</h3><span class="sub">بالوزن، أو بالعدد × وزن الحتة (زي ½ كيلو)</span></div><div class="bd">
      <div class="bar"><input class="f" id="bu-q" type="search" placeholder="ابحث في الأصناف" value="${esc(BU.q)}" style="max-width:260px"><span class="grow"></span>${newItem ? `<button class="btn sm" data-act="bu-newitem">${ic('plus')} صنف جديد</button>` : ''}</div>
      <div class="fgrid"><label class="fld"><span>الصنف</span><select class="f" id="bo-i">${[['meat', 'قطعيات ولحوم خام'], ['byproduct', 'نواتج (عضم، دهن…)'], ['product', 'منتجات جاهزة للبيع (بتدخل الفريزر)']].map(([c, t]) => { const l = shown.filter(i => i.cat === c); return l.length ? `<optgroup label="${t}">${l.map(i => `<option value="${i.id}" ${BU.item === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></label>
        <label class="fld"><span>الطريقة</span><select class="f" id="bo-m"><option value="kg" ${BU.mode === 'kg' ? 'selected' : ''} ${selIt && selIt.cat === 'product' ? 'disabled' : ''}>بالوزن (كجم)</option><option value="n" ${BU.mode === 'n' ? 'selected' : ''}>بالعدد</option></select></label>
        ${BU.mode === 'kg' ? '<label class="fld"><span>الوزن (كجم)</span><input class="f" id="bo-q" type="number" min="0" step="0.01"></label>' : `<label class="fld"><span>العدد</span><input class="f" id="bo-c" type="number" min="1" step="1"></label><label class="fld"><span>وزن الحتة</span><select class="f" id="bo-z">${(selIt && selIt.cat === 'product' ? E.packsOf(selIt) : E.PACK_SIZES).map(z => `<option value="${z}" ${z === 500 ? 'selected' : ''}>${packName(z)}</option>`).join('')}</select></label>`}
        <label class="fld"><span>التلاجة</span>${buWhSel(selIt, selIt && selIt.cat === 'product' ? BU.fz : BU.wh, 'bo-w')}</label>
        <label class="fld"><span>ملاحظة</span><input class="f" id="bo-n"></label></div>
      <div class="bar"><span class="grow"></span><button class="btn p" data-act="bu-add" data-arg="${r.id}">${ic('plus')} أضف السطر</button></div></div></div>`;
}
function buWire() {
  const bq = document.getElementById('bu-q'); let t;
  if (bq) bq.oninput = e => { clearTimeout(t); t = setTimeout(() => { BU.q = e.target.value; U.render(); const n = document.getElementById('bu-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  const bm = document.getElementById('bo-m'); if (bm) bm.onchange = e => { BU.mode = e.target.value; BU.item = val('bo-i'); U.render(); };
  const bi = document.getElementById('bo-i'), was = BU.item && E.item(BU.item).cat === 'product';
  if (bi) bi.onchange = e => { BU.item = e.target.value; const it = E.item(BU.item); if (it.cat === 'product' || was || (BU.mode === 'n' && it.cat !== 'product')) U.render(); };
  const bw = document.getElementById('bo-w'); if (bw) bw.onchange = e => { if (E.item(val('bo-i')).cat === 'product') BU.fz = e.target.value; else BU.wh = e.target.value; }; // the next line starts in the same fridge
}
PAGES.butchery = id => {
  const s = S(), r = (s.docs.butcheries || []).find(x => x.id === id); if (!r) { U.go('cutting'); return; }
  const cost = canCost(), can = ['owner', 'supervisor', 'storekeeper'].includes(U.role()) && r.status === 'open';
  const inKg = E.butIn(r), outKg = E.butOut(r), loss = inKg - outKg;
  const lineName = o => `${esc(E.item(o.itemId).name)}${o.count ? ` <small>(${o.count} × ${packName(o.packSize)})</small>` : ''}`;
  const sale = E.butSale(r), bc = E.butCost(r), cpk = outKg ? E.mulDiv(bc, 1000, outKg) : 0, profit = sale.v - bc;
  page(`${esc(r.no)} · تشغيلة جزارة`, `<div class="sheet">
    <div class="sheet-hd no-print"><div class="statusbar"><span class="${r.status === 'open' ? 'on' : ''}">شغالة</span><span class="${r.status === 'closed' ? 'on' : ''}">مقفولة</span>${r.status === 'cancelled' ? '<span class="on">اتلغت</span>' : ''}</div><span class="grow" style="flex:1"></span>
      ${can ? `<button class="btn" data-act="bu-issue" data-arg="${r.id}">${ic('plus')} صرف خامة</button><button class="btn" data-act="bu-in" data-arg="${r.id}">${ic('plus')} دفعة معيّنة</button><button class="btn" data-act="bu-pack" data-arg="${r.id}">${ic('plus')} تغليف (لو فيه)</button><button class="btn p" data-act="bu-close" data-arg="${r.id}">${ic('check')} قفل التشغيلة</button>` : ''}
      ${U.isOwner() && r.status === 'closed' ? `<button class="btn" data-act="bu-reopen" data-arg="${r.id}">افتح التشغيلة تاني</button>` : ''}
      ${U.isOwner() && r.status !== 'cancelled' ? `<button class="btn dan" data-act="bu-cancel" data-arg="${r.id}">إلغاء التشغيلة</button>` : ''}
      <button class="btn" data-act="print">${ic('print')} طباعة الإذن</button></div>
    <div class="smart no-print"><div><small>الداخل (العجل)</small><b>${kgf(inKg)} كجم</b></div><div><small>الناتج</small><b>${kgf(outKg)} كجم</b></div>
      <div><small>الفقد</small><b style="color:var(--${loss < 0 ? 'bad' : 'ink'})">${kgf(loss)} كجم · ${pct(loss, inKg)}</b></div>${cost ? `<div><small>تكلفة الخامة (العجل)</small><b>${fm(r.inputs.reduce((a, i) => a + i.value, 0))} ج</b></div><div><small>تكلفة التغليف (${r.packs.reduce((a, p) => a + p.qty, 0)} قطعة)</small><b>${fm(r.packs.reduce((a, p) => a + p.value, 0))} ج</b></div><div><small>التكلفة كلها</small><b>${fm(E.butCost(r))} ج</b></div>${U.isOwner() ? `<div><small>تكلفة الكيلو</small><b>${outKg ? fm(cpk) + ' ج' : '—'}</b></div><div><small>قيمة البيع${sale.miss ? ` <span class="cs-miss">(${sale.miss} صنف من غير سعر)</span>` : ''}</small><b>${fm(sale.v)} ج</b></div><div><small>الربح المتوقع</small><b style="color:var(--${profit < 0 ? 'bad' : 'ok'})">${fm(profit)} ج</b></div><div><small>الهامش</small><b style="color:var(--${profit < 0 ? 'bad' : 'ok'})">${sale.v ? '\u2066' + (profit / sale.v * 100).toFixed(0) + '%\u2069' : '—'}</b></div>` : ''}` : `<div><small>الأكياس</small><b>${r.packs.reduce((a, p) => a + p.qty, 0)} كيس</b></div>`}</div>
    ${r.status === 'cancelled' ? `<div class="note bad no-print">التشغيلة دي اتلغت (${esc(E.userName(r.cancelledBy))} · ${tf(r.cancelledAt)}): ${esc(r.cancelReason)}. كل الدفعات والأكياس رجعت المخزن.</div>` : ''}
    ${can ? buForm(r, true) : ''}
    <div class="inv bu-doc">
      <div class="inv-h"><div><img src="boom-logo.png" alt="Boom Meat"></div><div class="r"><b style="font-size:20px">إذن إضافة منتج خام</b><div>رقم: <span class="mono">${esc(r.no)}</span></div><div>التاريخ: ${esc(r.closeDate || r.date)}</div>${r.note ? `<div>الجهة: ${esc(r.note)}</div>` : ''}</div></div>
      <div class="inv-m"><div><small>الداخل</small>${r.inputs.length ? '' : '<span class="crumb">لسه مفيش خامة. العمال بيصرفوها من شاشة العامل.</span>'}${r.inputs.map(i => `${esc(E.item(i.itemId).name)} · ${kgf(i.qty)} كجم <span class="mono">(${esc(i.code)})</span>${i.by ? ` <small class="crumb no-print">${esc(E.userName(i.by))}</small>` : ''}${can ? ` <button class="btn sm no-print" data-act="bu-inedit" data-arg="${r.id}|${i.id}">تعديل الوزن</button>` : ''}${can ? ` <button class="btn sm dan no-print" data-act="bu-indrop" data-arg="${r.id}|${i.id}" aria-label="شيل الدفعة دي">✕</button>` : ''}`).join('<br>')}</div>
        <div><small>التغليف</small>${r.packs.length ? r.packs.map(p_ => `${esc(E.item(p_.itemId).name)} × ${p_.qty}${can ? ` <button class="btn sm dan no-print" data-act="bu-pkdrop" data-arg="${r.id}|${p_.id}" aria-label="رجّع الأكياس دي">✕</button>` : ''}`).join('<br>') : '—'}</div></div>
      <table><thead><tr><th>م</th><th>الصنف</th><th>الوحدة</th><th class="n">الكمية</th><th>التلاجة</th>${cost && r.status === 'closed' ? '<th class="n">التكلفة</th>' : ''}<th>ملاحظات</th>${can ? '<th class="no-print"></th>' : ''}</tr></thead>
        <tbody>${r.outputs.map((o, k) => `<tr><td>${k + 1}</td><td>${lineName(o)}</td><td>${o.count ? 'عدد' : 'كجم'}</td><td class="n">${o.count ? `${o.count} <small>(${kgf(o.qty)} كجم)</small>` : kgf(o.qty)}</td><td>${o.wh ? esc(E.whName(o.wh)) : '<span class="crumb">وقت القفل</span>'}</td>${cost && r.status === 'closed' ? `<td class="n">${fm(o.value)}</td>` : ''}<td>${esc(o.note || '')}${o.lotCode ? ` <span class="mono">${esc(o.lotCode)}</span>` : ''}</td>${can ? `<td class="no-print" style="white-space:nowrap"><button class="btn sm" data-act="bu-edit" data-arg="${r.id}|${o.id}">تعديل</button> <button class="btn sm dan" data-act="bu-drop" data-arg="${r.id}|${o.id}" aria-label="شيل السطر">✕</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="7"><div class="empty">لسه مفيش ناتج</div></td></tr>`}
          <tr class="tot"><td colspan="3">الإجمالي</td><td class="n">${kgf(outKg)} كجم</td><td></td>${cost && r.status === 'closed' ? `<td class="n">${fm(E.butCost(r))}</td>` : ''}<td>الداخل ${kgf(inKg)} كجم · الفقد ${kgf(loss)} كجم (${pct(loss, inKg)})</td>${can ? '<td class="no-print"></td>' : ''}</tr></tbody></table>
      <div style="display:flex;gap:40px;font-size:12.5px;color:#666;padding-top:18px"><span style="border-top:1px solid #999;padding-top:4px;min-width:140px">المسئول</span><span style="border-top:1px solid #999;padding-top:4px;min-width:140px">المستلم</span></div>
    </div>
    <div class="card no-print"><div class="hd"><h3>سجل التشغيلة</h3></div><div class="bd">${chatter(r.no)}</div></div></div>`, { crumb: '<a href="#cutting">تشغيلات الجزارة</a> / ' + esc(r.no) });
  buWire();
};
ACTS['bu-add'] = async id => {
  const n = BU.mode === 'n';
  const wh = val('bo-w'), it = E.item(val('bo-i')); if (it.cat === 'product') BU.fz = wh; else BU.wh = wh;
  const ok = await run(() => E.butcheryOutput({ id, itemId: val('bo-i'), qty: n ? null : toG(val('bo-q')), count: n ? toI(val('bo-c')) : null, packSize: n ? toI(val('bo-z')) : null, wh, note: val('bo-n') }), `اتضاف السطر · ${E.whName(wh)}`);
  if (ok) BU.item = '';
};
ACTS['bu-drop'] = arg => { const [id, lineId] = arg.split('|'); run(() => E.butcheryDropOutput({ id, lineId }), 'اتشال السطر'); };
ACTS['bu-issue'] = id => { const its = [...cutInItems(), ...cutInItems(true)].filter(i => E.available(i.id, E.rawStores()) > 0);
  if (!its.length) { toast('مفيش لحمة خام في التلاجات أو مخزن الاستلام', 'bad'); return; }
  modal('صرف على التشغيلة', `<div class="fgrid"><label class="fld"><span>الصنف</span><select class="f" id="bx-i">${[[false, 'لحوم'], [true, 'توابل (اختياري)']].map(([sp, t]) => { const g = its.filter(i => (i.cat === 'spice') === sp); return g.length ? `<optgroup label="${t}">${g.map(i => `<option value="${i.id}">${esc(i.name)} · متاح ${kgf(E.available(i.id, E.rawStores()))} كجم</option>`).join('')}</optgroup>` : ''; }).join('')}</select></label>
    <label class="fld"><span>الوزن (كجم)</span><input class="f" id="bx-q" type="number" min="0.1" step="0.1"></label></div><div class="note">بيتصرف من أقدم دفعة الأول، زي التشغيلة العادية.</div>`,
  { saveText: 'تأكيد الصرف', save: async () => { const g = toG(val('bx-q')); await E.butcheryIssue({ id, itemId: val('bx-i'), qty: g }); toast(`اتصرف ${kgf(g)} كجم`, 'ok'); } }); };
ACTS['bu-in'] = id => { const lots = calfLots(); if (!lots.length) { toast('مفيش لحمة خام تانية في المخزن', 'bad'); return; }
  modal('عجل / دفعة تانية على نفس التشغيلة', `<div class="fgrid"><label class="fld"><span>الدفعة</span><select class="f" id="bi-l">${lots.map(l => `<option value="${l.id}" data-q="${l.qty}" data-info="${kgf(l.qty)} كجم · ${esc(l.code)} · ${esc(E.whName(l.wh))}">${esc(E.item(l.itemId).name)}</option>`).join('')}</select><small class="crumb" id="bi-info">${kgf(lots[0].qty)} كجم · ${esc(lots[0].code)} · ${esc(E.whName(lots[0].wh))}</small></label><label class="fld"><span>الوزن (كجم)</span><input class="f" id="bi-q" type="number" min="0" step="0.5" value="${lots[0].qty / 1000}"></label></div>`,
  { saveText: 'إضافة', save: async () => { await E.butcheryInput({ id, lotId: val('bi-l'), qty: toG(val('bi-q')) }); toast('اتضاف', 'ok'); } });
  document.getElementById('bi-l').onchange = e => { const o = e.target.selectedOptions[0]; document.getElementById('bi-q').value = o.dataset.q / 1000; document.getElementById('bi-info').textContent = o.dataset.info; }; };
function packDialog({ title, note, seed, seedText, issueOne, okText }) { const ps = E.packStores(), all = S().items.filter(i => i.cat === 'pack' && i.active !== false).map(i => ({ i, n: E.available(i.id, ps) }));
  const kind = x => (x.i.packFor || /كيس|اكياس|أكياس|فاكيوم/.test(x.i.name) ? 0 : x.i.sticker || /استيكر|ستيكر/.test(x.i.name) ? 1 : 2), by = (a, c) => kind(a) - kind(c) || a.i.name.localeCompare(c.i.name, 'ar');
  const opt = ({ i, n }) => `<option value="${i.id}">${esc(i.name)}${i.packFor ? ` (كيس ${packName(i.packFor)})` : ''} · متاح ${n.toLocaleString('en-US')}</option>`, has = all.filter(x => x.n > 0).sort(by), none = all.filter(x => !x.n).sort(by);
  const grp = (l, k, t) => { const g = l.filter(x => kind(x) === k); return g.length ? `<optgroup label="${t}">${g.map(opt).join('')}</optgroup>` : ''; };
  const opts = `${grp(has, 0, 'أكياس')}${grp(has, 1, 'استيكرات')}${grp(has, 2, 'مواد تعبئة تانية')}${none.length ? `<optgroup label="غيرهم (مفيش منهم دلوقتي)">${none.map(opt).join('')}</optgroup>` : ''}`;
  const stock = iid => (all.find(x => x.i.id === iid) || { n: 0 }).n, cost = canCost();
  // smart start: the types this run already used, else the ones the last run used, else the first bag in stock
  seed = [...new Set(seed || [])].filter(iid => all.some(x => x.i.id === iid));
  const start = seed.length ? seed : has[0] ? [has[0].i.id] : all[0] ? [all[0].i.id] : [];
  const row = iid => `<div class="bp-r"><label class="fld"><span>الصنف</span><select class="f bp-i">${opts}</select></label><label class="fld"><span>العدد</span><input class="f bp-q" type="number" min="1" step="1" inputmode="numeric"></label><button type="button" class="icon-btn bp-del" aria-label="شيل السطر">${ic('x')}</button><small class="crumb bp-m"></small></div>`;
  modal(title, `<div class="note info">${note} بيتصرف من مخزن التعبئة أو مخزن الاستلام. تقدر تصرف كذا نوع مرة واحدة.</div>
    ${seed.length ? `<div class="crumb">${seedText}، اكتب العدد بس أو غيّر النوع.</div>` : ''}
    <div id="bp-rows">${start.map(row).join('')}</div>
    <div class="bp-foot"><button type="button" class="btn" id="bp-add">${ic('plus')} نوع تاني</button><b id="bp-sum"></b></div>`,
  { saveText: 'صرف', save: async () => {
    const lines = [...document.querySelectorAll('.bp-r')].map(r => ({ itemId: r.querySelector('.bp-i').value, raw: r.querySelector('.bp-q').value.trim() })).filter(l => l.raw !== '');
    if (!lines.length) throw new Error('اكتب العدد قدام نوع واحد على الأقل');
    const sum = {}; for (const l of lines) { const q = toI(l.raw); if (!(q > 0)) throw new Error(`العدد غير صحيح قدام "${E.item(l.itemId).name}"`); sum[l.itemId] = (sum[l.itemId] || 0) + q; } // the same type twice is added up
    for (const [iid, q] of Object.entries(sum)) if (q > stock(iid)) throw new Error(`"${E.item(iid).name}" المتاح منه ${stock(iid).toLocaleString('en-US')} بس، وانت كاتب ${q.toLocaleString('en-US')}`);
    const done = [];
    for (const [iid, q] of Object.entries(sum)) {
      try { await issueOne(iid, q); done.push(`${E.item(iid).name} × ${q}`); }
      catch (err) { throw new Error(done.length ? `اتصرف: ${done.join('، ')}. ووقف عند "${E.item(iid).name}": ${err.message}` : err.message); }
    }
    toast(done.length > 1 ? `اتصرف ${done.length === 2 ? 'نوعين' : done.length + ' أنواع'}: ${done.join('، ')}` : okText, 'ok');
  } });
  const box = document.getElementById('bp-rows');
  const paint = () => { const rs = [...box.querySelectorAll('.bp-r')]; let tot = 0, n = 0; const used = {};
    rs.forEach(r => { const iid = r.querySelector('.bp-i').value, q = toI(r.querySelector('.bp-q').value || '0') || 0; used[iid] = (used[iid] || 0) + q; });
    rs.forEach(r => { const iid = r.querySelector('.bp-i').value, q = toI(r.querySelector('.bp-q').value || '0') || 0, c = E.itemCost(iid).v, m = r.querySelector('.bp-m'), over = used[iid] > stock(iid);
      r.querySelector('.bp-q').classList.toggle('invalid', over); r.querySelector('.bp-del').hidden = rs.length < 2;
      m.className = 'crumb bp-m' + (over ? ' bad' : ''); m.textContent = over ? `المتاح ${stock(iid).toLocaleString('en-US')} بس` : q && cost && c ? `${fm0(c * q)} ج` : '';
      if (q > 0) { n += q; tot += c * q; } });
    document.getElementById('bp-sum').textContent = n ? `الإجمالي ${n.toLocaleString('en-US')} قطعة${cost && tot ? ` · ${fm0(tot)} ج` : ''}` : ''; };
  const pick = (r, iid) => { if (iid) r.querySelector('.bp-i').value = iid; };
  [...box.querySelectorAll('.bp-r')].forEach((r, i) => pick(r, start[i]));
  box.addEventListener('input', paint); box.addEventListener('change', paint);
  box.addEventListener('click', e => { const d = e.target.closest('.bp-del'); if (d && box.children.length > 1) { d.closest('.bp-r').remove(); paint(); } });
  document.getElementById('bp-add').onclick = () => { const taken = new Set([...box.querySelectorAll('.bp-i')].map(x => x.value)), nx = has.find(x => !taken.has(x.i.id)); box.insertAdjacentHTML('beforeend', row()); const r = box.lastElementChild; pick(r, nx ? nx.i.id : ''); paint(); r.querySelector('.bp-q').focus(); };
  paint(); const q0 = box.querySelector('.bp-q'); if (q0) q0.focus(); }
ACTS['bu-pack'] = id => { const runs = S().docs.butcheries || [], cur = runs.find(x => x.id === id), prev = runs.filter(x => x.id !== id && (x.packs || []).length).slice(-1)[0], mine = cur && cur.packs.length;
  packDialog({ title: 'تغليف على التشغيلة (أكياس، أطباق، استيكر)', note: 'اختياري: سجّله بس لو اتستخدم. تكلفته بتتضاف على تكلفة القطعيات.', seed: ((mine ? cur.packs : prev ? prev.packs : []) || []).map(p => p.itemId), seedText: mine ? 'دي الأنواع اللي اتصرفت على التشغيلة دي قبل كده' : 'دي الأنواع اللي اتصرفت آخر تشغيلة',
    issueOne: (iid, q) => E.butcheryPack({ id, itemId: iid, qty: q }), okText: 'اتصرف التغليف' }); };
ACTS['bu-newitem'] = () => modal('صنف جديد من الجزارة', `<div class="fgrid"><label class="fld"><span>الاسم</span><input class="f" id="ni2-n" placeholder="مثلًا: كباب حلة"></label>
  <label class="fld"><span>النوع</span><select class="f" id="ni2-c"><option value="meat">قطعية (ليها سعر بيع)</option><option value="byproduct">ناتج (عضم، دهن، فضلات…) تكلفته صفر</option></select></label>
  <label class="fld"><span>سعر بيع الكيلو (ج) للقطعية</span><input class="f" id="ni2-p" type="number" min="0" step="1"></label>
  <label class="fld"><span>القسم في شاشة العامل</span><input class="f" id="ni2-s" list="ni2-sl" placeholder="بلدي فريش، برازيلي، دهون…"><datalist id="ni2-sl">${E.MEAT_SECTIONS.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label></div>
  <div class="crumb">سعر البيع بيستخدم بس في توزيع تكلفة العجل على القطعيات. المالك يقدر يعدّله من «الأصناف والأسعار».</div>`,
  { saveText: 'إضافة الصنف', save: async () => { const it = await E.newCutItem({ name: val('ni2-n'), cat: val('ni2-c'), sub: val('ni2-s'), priceRetail: toP(val('ni2-p') || '0') || 0 }); BU.item = it.id; BU.q = ''; toast(`اتضاف ${it.name}`, 'ok'); } });
ACTS['bu-edit'] = arg => { const [id, lineId] = arg.split('|'); const o = S().docs.butcheries.find(x => x.id === id).outputs.find(x => x.id === lineId), it = E.item(o.itemId);
  modal('تعديل سطر ' + esc(it.name), `<div class="fgrid">${o.count ? `<label class="fld"><span>العدد</span><input class="f" id="be-c" type="number" min="1" step="1" value="${o.count}"></label><label class="fld"><span>وزن الحتة</span><select class="f" id="be-z">${(it.cat === 'product' ? E.packsOf(it) : E.PACK_SIZES).map(z => `<option value="${z}" ${z === o.packSize ? 'selected' : ''}>${packName(z)}</option>`).join('')}</select></label>` : `<label class="fld"><span>الوزن (كجم)</span><input class="f" id="be-q" type="number" min="0" step="0.01" value="${o.qty / 1000}"></label>`}<label class="fld"><span>التلاجة</span>${buWhSel(it, o.wh, 'be-w')}</label><label class="fld"><span>ملاحظة</span><input class="f" id="be-n" value="${esc(o.note || '')}"></label></div>`,
  { saveText: 'حفظ', save: async () => { await E.butcheryEditOutput({ id, lineId, qty: o.count ? null : toG(val('be-q')), count: o.count ? toI(val('be-c')) : null, packSize: o.count ? toI(val('be-z')) : null, wh: val('be-w'), note: val('be-n') }); toast('اتعدل السطر', 'ok'); } }); };
ACTS['bu-inedit'] = arg => { const [id, inputId] = arg.split('|'); const r = S().docs.butcheries.find(x => x.id === id), i = r.inputs.find(x => x.id === inputId), own = U.isOwner();
  modal('تعديل وزن ' + esc(E.item(i.itemId).name), `${own ? '<div class="note">إنت المالك: التعديل هيتنفذ على طول، والفرق بيرجع المخزن أو يتاخد منه، ويتسجل في سجل الحركات. متأكد؟</div>' : '<div class="note info">التعديل هيتبعت للمالك يوافق عليه (من السيستم أو تليجرام).</div>'}
    <div class="fgrid"><label class="fld"><span>الوزن الصح (كجم)</span><input class="f" id="bw-q" type="number" min="0" step="0.5" value="${i.qty / 1000}"></label></div>
    <label class="fld"><span>السبب${own ? ' (اختياري)' : ''}</span><input class="f" id="bw-r" placeholder="مثلًا: الميزان كان غلط"></label>`,
  { saveText: own ? 'تأكيد التعديل' : 'ابعت للمالك', save: async () => { const x = await E.butcheryEditInput({ id, inputId, qty: toG(val('bw-q')), reason: val('bw-r') }); toast(x && x.requested ? `اتبعت للمالك (${x.no})` : 'اتعدل الوزن', 'ok'); } }); };
ACTS['bu-reopen'] = id => { const r = S().docs.butcheries.find(x => x.id === id);
  modal('فتح ' + esc(r.no) + ' تاني', `<div class="note">الناتج هيتشال من المخزن وتكلفته ترجع للتشغيلة، وتقدر تعدّل الأوزان والسطور وتقفلها تاني. ده بينفع بس لو محدش باع أو صرف أو نقل من الناتج.</div>
    <label class="fld"><span>السبب</span><input class="f" id="bo-rr" placeholder="مثلًا: وزن القطعيات اتكتب غلط"></label>`,
  { saveText: 'افتحها', save: async () => { await E.reopenButchery({ id, reason: val('bo-rr') }); toast(`${r.no} اتفتحت تاني`, 'ok'); } }); };
ACTS['bu-cancel'] = id => { const r = S().docs.butcheries.find(x => x.id === id);
  modal('إلغاء ' + esc(r.no), `<div class="note bad">${r.status === 'closed' ? 'التشغيلة مقفولة: الناتج بتاعها هيتشال من المخزن، والعجل والأكياس هيرجعوا. ده بينفع بس لو محدش صرف أو باع من الناتج.' : 'العجل والأكياس هيرجعوا المخزن بنفس وزنهم وقيمتهم.'} التشغيلة هتفضل في السجل باسم «اتلغت».</div>
    <label class="fld"><span>سبب الإلغاء</span><input class="f" id="bx-r" placeholder="مثلًا: اتسجلت على العجل الغلط"></label>`,
  { saveText: 'إلغاء التشغيلة', save: async () => { await E.cancelButchery({ id, reason: val('bx-r') }); toast(`اتلغت ${r.no}`, 'ok'); } }); };
ACTS['bu-indrop'] = arg => { const [id, inputId] = arg.split('|'); modal('شيل دفعة من التشغيلة', '<p>الدفعة دي هترجع المخزن بنفس وزنها وقيمتها. متأكد؟</p>', { saveText: 'أيوه، رجّعها', save: async () => { await E.butcheryDropInput({ id, inputId }); toast('رجعت المخزن', 'ok'); } }); };
ACTS['bu-pkdrop'] = arg => { const [id, packId] = arg.split('|'); run(() => E.butcheryDropPack({ id, packId }), 'رجعت الأكياس'); };
ACTS['bu-close'] = id => {
  const r = S().docs.butcheries.find(x => x.id === id), inKg = E.butIn(r), outKg = E.butOut(r);
  const rw = E.warehouses().filter(w => ['raw', 'receiving'].includes(w.use)), fz = E.warehouses().filter(w => w.use === 'fg');
  const noWh = r.outputs.filter(o => !o.wh), cutsNoWh = noWh.some(o => E.item(o.itemId).cat !== 'product'), hasP = noWh.some(o => E.item(o.itemId).cat === 'product');
  const byWh = {}; r.outputs.filter(o => o.wh && !E.item(o.itemId).waste).forEach(o => { byWh[o.wh] = (byWh[o.wh] || 0) + o.qty; });
  modal(`قفل ${esc(r.no)}`, `<div class="smart"><div><small>الداخل</small><b>${kgf(inKg)} كجم</b></div><div><small>الناتج</small><b>${kgf(outKg)} كجم</b></div><div><small>الفقد</small><b>${kgf(inKg - outKg)} كجم · ${pct(inKg - outKg, inKg)}</b></div></div>
    <div class="note">بعد القفل الناتج بيدخل المخزن كدفعات بباركود، وتكلفة الخامة والتوابل والتغليف (لو فيه) بتتوزع عليه. مينفعش تعدّل بعد كده.</div>
    ${Object.keys(byWh).length ? `<div class="made" style="margin:12px 0">${Object.entries(byWh).map(([w, q]) => `<div><small>${esc(E.whName(w))}</small><b>${kgf(q)} <em>كجم</em></b></div>`).join('')}</div>` : ''}
    <div class="fgrid">${cutsNoWh ? `<label class="fld"><span>${Object.keys(byWh).length ? 'السطور اللي ملهاش تلاجة تدخل' : 'الناتج يدخل'}</span><select class="f" id="bc-w">${rw.map(w => `<option value="${w.id}" ${w.id === (r.inputs[0] || {}).wh ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label>` : ''}${hasP ? `<label class="fld"><span>المنتجات الجاهزة تدخل</span><select class="f" id="bc-f">${fz.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></label>` : ''}<label class="fld"><span>تاريخ القفل</span><input class="f" id="bc-d" type="date" value="${E.today()}" max="${E.today()}"></label></div>`,
  { saveText: 'قفل التشغيلة', save: async () => { const x = await E.closeButchery({ id, date: val('bc-d'), wh: cutsNoWh ? val('bc-w') : undefined, fgWh: hasP ? val('bc-f') : undefined }); toast(`اتقفلت ${x.no}: فقد ${kgf(x.loss)} كجم`, 'ok'); } });
};

/* ========== PRODUCTS (finished goods we hold, by freezer) ========== */
PAGES.products = () => {
  const s = S(), cost = canCost(), fz = E.warehouses().filter(w => w.use === 'fg'), wf = U.FILTER.pfz || '', gf = U.FILTER.pgr || '';
  const groups = [...new Set(s.items.filter(i => i.cat === 'product').map(i => i.group).filter(Boolean))], prNew = E.addDays(E.today(), -1);
  const rows = [];
  s.lots.filter(l => l.qty > 0 && E.item(l.itemId).cat === 'product' && fz.some(w => w.id === l.wh) && (!wf || l.wh === wf)).forEach(l => {
    const it = E.item(l.itemId); if (gf && it.group !== gf) return; if (!match('pq', it.name, it.code, l.code)) return;
    const k = l.itemId + '|' + l.wh + '|' + l.packSize; let r = rows.find(x => x.k === k);
    if (!r) { r = { k, it, wh: l.wh, size: l.packSize, qty: 0, value: 0, exp: l.expDate, batches: new Set(), nw: 0 }; rows.push(r); }
    if (l.inDate >= prNew) r.nw = 1;
    r.qty += l.qty; r.value += l.value; if (l.expDate < r.exp) r.exp = l.expDate; if (l.src && l.src.no) r.batches.add(l.src.no);
  });
  rows.sort((a, b) => (b.nw - a.nw) || a.it.name.localeCompare(b.it.name, 'ar') || a.wh.localeCompare(b.wh) || a.size - b.size); // packs that came in today or yesterday first
  const cols = [{ t: 'المنتج', f: r => `<b>${esc(r.it.name)}</b>${r.nw ? ' <span class="pill info">جديد</span>' : ''}` }, { t: 'القسم', f: r => esc(r.it.group || '') }, { t: 'الفريزر', f: r => esc(E.whName(r.wh)) }, { t: 'العبوة', f: r => packName(r.size) },
    { t: 'العدد', n: 1, f: r => `<b>${Math.floor(r.qty / r.size)}</b>` }, { t: 'الكمية', n: 1, f: r => kgf(r.qty) + ' كجم' }, { t: 'أقرب صلاحية', f: r => `${df(r.exp)} ${expPill(r.exp)}` }, { t: 'التشغيلات', f: r => `<span class="mono">${[...r.batches].sort().reverse().slice(0, 3).map(esc).join('، ')}</span>` }];
  if (cost) cols.push({ t: 'القيمة', n: 1, f: r => fm(r.value) }, { t: 'تكلفة الكيلو', n: 1, f: r => `<b>${fm(E.mulDiv(r.value, 1000, r.qty))}</b>` }, { t: 'سعر البيع للكيلو', n: 1, f: r => fm(r.it.priceRetail) + (r.it.priceWholesale && r.it.priceWholesale !== r.it.priceRetail ? ` <small>جملة ${fm0(r.it.priceWholesale)}</small>` : '') });
  // raw cuts with a sale price (e.g. صره): stock per fridge, cost and price, sold by weight from the sale screen and the WhatsApp bot
  const rawRows = [];
  s.items.filter(i => ['meat', 'carcass', 'byproduct'].includes(i.cat) && E.rawSellable(i) && i.active !== false && i.priceRetail > 100 && match('pq', i.name, i.code)).forEach(it => {
    for (const w of E.sellStores(it)) { const ls = s.lots.filter(l => l.itemId === it.id && l.wh === w && l.qty > 0); if (!ls.length) continue;
      rawRows.push({ it, wh: w, qty: sumBy(ls, l => l.qty), value: sumBy(ls, l => l.value), exp: ls.map(l => l.expDate).sort()[0] }); }
  });
  rawRows.sort((a, b) => a.it.name.localeCompare(b.it.name, 'ar'));
  const rawCols = [{ t: 'الصنف', f: r => `<b>${esc(r.it.name)}</b>` }, { t: 'المكان', f: r => esc(E.whName(r.wh)) }, { t: 'الكمية', n: 1, f: r => r.it.unit === 'kg' ? kgf(r.qty) + ' كجم' : r.qty + ' قطعة' }, { t: 'أقرب صلاحية', f: r => `${df(r.exp)} ${expPill(r.exp)}` },
    ...(cost ? [{ t: 'تكلفة الكيلو', n: 1, f: r => fm(E.mulDiv(r.value, r.it.unit === 'kg' ? 1000 : 1, r.qty)) }] : []), { t: 'سعر البيع', n: 1, f: r => fm(r.it.priceRetail) + (r.it.priceWholesale && r.it.priceWholesale !== r.it.priceRetail ? ` <small>جملة ${fm0(r.it.priceWholesale)}</small>` : '') },
    ...(U.isOwner() ? [{ t: 'الهامش', n: 1, f: r => { const c = E.mulDiv(r.value, r.it.unit === 'kg' ? 1000 : 1, r.qty); return c ? `<span class="cs-m ${r.it.priceRetail < c ? 'neg' : ''}">\u2066${((r.it.priceRetail - c) / r.it.priceRetail * 100).toFixed(0)}%\u2069</span>` : '—'; } }] : [])];
  page('المنتجات', `<div class="kpis">${fz.map(w => { const l = s.lots.filter(x => x.wh === w.id && x.qty > 0 && E.item(x.itemId).cat === 'product'); return `<div class="kpi ${wf === w.id ? 'main' : ''}"><small>${esc(w.name)}</small><b>${kgf(sumBy(l, x => x.qty))} <em>كجم</em></b><span class="t">${new Set(l.map(x => x.itemId)).size} منتج</span></div>`; }).join('')}</div>
    <div class="bar">${searchBox('pq', 'ابحث باسم المنتج أو الدفعة')}<select class="f" id="p-fz" style="width:auto"><option value="">كل الفريزرات</option>${fz.map(w => `<option value="${w.id}" ${wf === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>
      <select class="f" id="p-gr" style="width:auto"><option value="">كل الأقسام</option>${groups.map(g => `<option ${gf === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
    <div class="card"><div class="bd">${table('prd', cols, rows, { empty: 'مفيش منتج في الفريزرات' })}</div></div>
    <div class="card"><div class="hd"><h3>قطعيات خام بتتباع بالوزن</h3><span class="sub">زي الصره: بتتباع من التلاجة على طول، أو تدخل جزارة أو تشغيلة</span></div><div class="bd">${table('prd-raw', rawCols, rawRows, { empty: 'مفيش قطعيات خام ليها سعر بيع في التلاجات' })}</div></div>`);
  document.getElementById('p-fz').onchange = e => { U.FILTER.pfz = e.target.value; U.render(); };
  document.getElementById('p-gr').onchange = e => { U.FILTER.pgr = e.target.value; U.render(); };
};

/* ========== STOCK ========== */
PAGES.stock = () => {
  const s = S(), cost = canCost(), newFrom = E.addDays(E.today(), -1), isNew = l => l.inDate >= newFrom; // came in today or yesterday
  const tb = tabs('st', [['wh', 'التلاجات والمخازن'], ['items', 'حسب الصنف'], ['lots', 'الدفعات والصلاحية'], ['tr', 'التحويلات'], ['wo', 'الإعدام والهالك']], 'wh');
  const cat = U.FILTER.scat || '', wh = U.FILTER.swh || '';
  const catSel = `<select class="f" id="s-cat" style="width:auto"><option value="">كل الأنواع</option>${Object.entries(E.CAT_NAME).map(([k, n]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  const whSel = `<select class="f" id="s-wh" style="width:auto"><option value="">كل الأماكن</option>${E.warehouses().map(w => `<option value="${w.id}" ${wh === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>`;
  let body = '', bar = '';
  const canMove = ['owner', 'storekeeper', 'supervisor'].includes(U.role()), canWO = ['owner', 'storekeeper'].includes(U.role());
  if (tb.cur === 'items') {
    const rows = s.items.filter(i => (!cat || i.cat === cat) && match('sq', i.name, i.code)).map(i => { const ls = s.lots.filter(l => l.itemId === i.id && l.qty > 0 && (!wh || l.wh === wh)); return { i, q: sumBy(ls, l => l.qty), v: sumBy(ls, l => l.value), nw: ls.some(isNew) }; }).map((r, k) => ({ ...r, k })).sort((a, b) => (b.nw - a.nw) || ((b.q > 0) - (a.q > 0)) || a.k - b.k); // just received first, then what we have, then the rest
    const cols = [{ t: 'الكود', f: r => `<span class="mono">${esc(r.i.code)}</span>` }, { t: 'الصنف', f: r => esc(r.i.name) + (r.nw ? ' <span class="pill info">جديد</span>' : '') }, { t: 'النوع', f: r => E.CAT_NAME[r.i.cat] }, { t: 'الرصيد', n: 1, f: r => `<b>${qtyf(r.q, r.i.unit)}</b>` }, { t: 'الحد الأدنى', n: 1, f: r => r.i.minQty ? qtyf(r.i.minQty, r.i.unit) : '—' },
      { t: 'الحالة', f: r => !r.i.minQty ? '' : r.q === 0 ? '<span class="pill bad">خلص</span>' : r.q < r.i.minQty ? '<span class="pill warn">قرب يخلص</span>' : '<span class="pill ok">كويس</span>' }];
    if (cost) cols.push({ t: 'القيمة', n: 1, f: r => fm(r.v) }, { t: 'سعر البيع', n: 1, f: r => r.i.priceRetail ? fm(r.i.priceRetail) : '—' }, { t: 'متوسط التكلفة', n: 1, f: r => r.q ? fm(E.mulDiv(r.v, r.i.unit === 'kg' ? 1000 : 1, r.q)) + (r.i.unit === 'kg' ? ' /كجم' : ' /قطعة') : '—' });
    const tot = cost ? `<tr class="tot"><td colspan="${cols.length - 3}">الإجمالي</td><td class="n">${fm(sumBy(rows, r => r.v))}</td><td></td><td></td></tr>` : '';
    bar = catSel + whSel + searchBox('sq', 'ابحث بالاسم أو الكود');
    body = table('st-i', cols, rows, { foot: tot });
  } else if (tb.cur === 'lots') {
    const rows = s.lots.filter(l => l.qty > 0 && (!cat || l.cat === cat) && (!wh || l.wh === wh) && match('sq', l.code, E.item(l.itemId).name)).sort((a, b) => (isNew(b) - isNew(a)) || (isNew(a) ? b.n - a.n : (a.expDate < b.expDate ? -1 : 1))); // what just came in first, then the nearest expiry
    const cols = [{ t: 'الدفعة', f: l => `<span class="mono">${esc(l.code)}</span>${isNew(l) ? ' <span class="pill info">جديد</span>' : ''}` }, { t: 'الصنف', f: l => esc(E.item(l.itemId).name) + (l.packSize ? ` <span class="pill mut">${packName(l.packSize)}</span>` : '') }, { t: 'المكان', f: l => esc(E.whName(l.wh)) },
      { t: 'الرصيد', n: 1, f: l => `<b>${qtyf(l.qty, E.item(l.itemId).unit)}</b>${l.packSize ? ` <small>(${l.qty / l.packSize} عبوة)</small>` : ''}` }, { t: 'إنتاج', f: l => df(l.prodDate) }, { t: 'دخول', f: l => df(l.inDate) }, { t: 'صلاحية', f: l => `${df(l.expDate)} ${expPill(l.expDate)}` },
      { t: 'المصدر', f: l => `<span class="mono">${esc(l.src.no)}</span>` }];
    if (cost) cols.push({ t: 'القيمة', n: 1, f: l => fm(l.value) }, { t: 'تكلفة الكيلو', n: 1, f: l => { const it = E.item(l.itemId); return l.qty ? `<b>${fm(E.mulDiv(l.value, it.unit === 'kg' ? 1000 : 1, l.qty))}</b>${it.unit === 'kg' ? '' : ' <small>للقطعة</small>'}` : '—'; } }, { t: 'سعر البيع', n: 1, f: l => { const it = E.item(l.itemId); return it.priceRetail ? fm(it.priceRetail) + (it.priceWholesale && it.priceWholesale !== it.priceRetail ? ` <small>جملة ${fm0(it.priceWholesale)}</small>` : '') : '<span class="cs-miss">مفيش سعر بيع</span>'; } }, ...(U.isOwner() ? [{ t: 'الهامش', n: 1, f: l => { const it = E.item(l.itemId), c = l.qty ? E.mulDiv(l.value, it.unit === 'kg' ? 1000 : 1, l.qty) : 0; return c && it.priceRetail > 100 ? `<span class="cs-m ${it.priceRetail < c ? 'neg' : ''}">\u2066${((it.priceRetail - c) / it.priceRetail * 100).toFixed(0)}%\u2069</span>` : '—'; } }] : []));
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
      { t: 'الأصناف', f: p => p.lines.map(l => esc(E.item(l.itemId).name)).join('، ') }, { t: 'الإجمالي', n: 1, f: p => `<b>${fm(p.total)}</b>` }], rows, { onRow: p => 'purchase/' + p.id })}</div></div>`);
};
PAGES.purchase = id => {
  const p = S().docs.purchases.find(x => x.id === id); if (!p) { U.go('purchases'); return; }
  const lots = p.lines.map(l => S().lots.find(x => x.id === l.lotId));
  page(`${esc(p.no)} · ${esc(E.partner(p.supplierId).name)}`, `<div class="sheet">
    <div class="card"><div class="bd"><div class="kv"><div><span>المورد</span><b><a href="#supplier/${p.supplierId}">${esc(E.partner(p.supplierId).name)}</a></b></div><div><span>فاتورة المورد</span><b class="mono">${esc(p.ref)}</b></div><div><span>التاريخ</span><b>${df(p.date)}</b></div><div><span>استلم</span><b>${esc(E.userName(p.by))}</b></div><div><span>القيد</span><b class="mono">${esc(p.je)}</b></div></div></div></div>
    ${['owner', 'storekeeper', 'accountant'].includes(U.role()) ? `<div class="bar no-print"><span class="grow"></span><button class="btn" data-act="po-edit" data-arg="${p.id}">تعديل الكميات أو الأسعار</button><button class="btn" data-act="print">${ic('print')} طباعة</button></div>` : ''}
    <div class="card"><div class="bd">${table('pol', [{ t: 'الصنف', f: l => esc(E.item(l.itemId).name) }, { t: 'الدفعة', f: l => `<span class="mono">${esc(l.lotCode)}</span>` }, { t: 'الكمية', n: 1, f: l => qtyf(l.qty, E.item(l.itemId).unit) }, { t: 'السعر', n: 1, f: l => fm(l.unitCost) }, { t: 'القيمة', n: 1, f: l => fm(l.value) }, ...(p.vat ? [{ t: 'الضريبة', n: 1, f: l => fm(l.vat) }] : []), { t: 'إنتاج', f: l => df(l.prodDate) }, { t: 'صلاحية', f: l => df(l.expDate) }], p.lines,
      { foot: `<tr class="tot"><td colspan="4">الإجمالي</td><td class="n">${fm(p.net)}</td>${p.vat ? `<td class="n">${fm(p.vat)}</td><td colspan="2" class="n">${fm(p.total)}</td>` : '<td colspan="2"></td>'}</tr>` })}</div></div>
    ${(p.edits || []).length ? `<div class="card"><div class="hd"><h3>التعديلات</h3></div><div class="bd">${table('poe-' + p.id, [{ t: 'الوقت', f: e => tf(e.at) }, { t: 'الصنف', f: e => esc(E.item(p.lines[e.line].itemId).name) }, { t: 'قبل', n: 1, f: e => `${qtyf(e.from.qty, E.item(p.lines[e.line].itemId).unit)} × ${fm(e.from.unitCost)}` }, { t: 'بعد', n: 1, f: e => `<b>${qtyf(e.to.qty, E.item(p.lines[e.line].itemId).unit)} × ${fm(e.to.unitCost)}</b>` }, { t: 'بواسطة', f: e => esc(E.userName(e.by)) }, { t: 'السبب', f: e => esc(e.reason || '') }], p.edits.slice().reverse())}</div></div>` : ''}
    <div class="card"><div class="hd"><h3>ملصقات الباركود</h3><div class="tools"><button class="btn" data-act="lbl-all" data-arg="${p.id}">${ic('print')} اطبع كل الملصقات</button></div></div><div class="bd"><div class="labels">${lots.map(l => labelHtml(l, true)).join('')}</div></div></div></div>`, { crumb: '<a href="#purchases">المشتريات</a> / ' + esc(p.no) });
};
ACTS['po-edit'] = id => {
  const p = S().docs.purchases.find(x => x.id === id), own = U.isOwner();
  modal('تعديل استلام ' + esc(p.no), `${own ? '<div class="note">إنت المالك: التعديل هيتنفذ على طول، والمخزن وحساب المورد بيتظبطوا، ويتسجل في سجل الحركات. متأكد؟</div>' : '<div class="note info">التعديل هيتبعت للمالك يوافق عليه (من السيستم أو تليجرام).</div>'}
    <div class="fgrid"><label class="fld"><span>الصنف</span><select class="f" id="pe-l">${p.lines.map((l, k) => `<option value="${k}">${esc(E.item(l.itemId).name)} · ${qtyf(l.qty, E.item(l.itemId).unit)} × ${fm(l.unitCost)}</option>`).join('')}</select></label>
      <label class="fld"><span>الكمية الصح</span><input class="f" id="pe-q" type="number" min="0" step="0.001" value="${p.lines[0].qty / (E.item(p.lines[0].itemId).unit === 'kg' ? 1000 : 1)}"></label>
      <label class="fld"><span>السعر للوحدة (ج)</span><input class="f" id="pe-c" type="number" min="0" step="0.01" value="${p.lines[0].unitCost / 100}"></label></div>
    <label class="fld"><span>السبب${own ? ' (اختياري)' : ''}</span><input class="f" id="pe-r" placeholder="مثلًا: الوزن الصح ١٩ كيلو"></label>`,
  { saveText: own ? 'تأكيد التعديل' : 'ابعت للمالك', save: async () => {
    const k = toI(val('pe-l')), it = E.item(p.lines[k].itemId);
    const r = await E.editPurchaseLine({ purchaseId: id, line: k, qty: it.unit === 'kg' ? toG(val('pe-q')) : toI(val('pe-q')), unitCost: toP(val('pe-c')), reason: val('pe-r') });
    toast(r && r.requested ? `اتبعت للمالك (${r.no})` : 'اتعدل الاستلام', 'ok'); } });
  document.getElementById('pe-l').onchange = e => { const l = p.lines[+e.target.value], it = E.item(l.itemId); document.getElementById('pe-q').value = l.qty / (it.unit === 'kg' ? 1000 : 1); document.getElementById('pe-c').value = l.unitCost / 100; };
};
const DEF_EXP = { carcass: 10, meat: 7, spice: 180, pack: 720 };
const PO = { sup: null, lines: [], q: '', newOpen: false };
ACTS['po-new'] = () => {
  const s = S(); const sups = s.partners.filter(p => p.type === 'supplier');
  if (!sups.length) { toast('ضيف مورد الأول من شاشة الموردين', 'bad'); U.go('suppliers'); return; }
  if (!PO.sup || !sups.some(p => p.id === PO.sup)) PO.sup = sups[0].id;
  PO.lines = []; PO.q = ''; PO.newOpen = false;
  modal('استلام بضاعة من مورد', `<div class="fgrid">
      <label class="fld"><span>المورد</span><select class="f" id="po-s">${partnerOptions('supplier', PO.sup)}</select></label>
      <label class="fld"><span>رقم فاتورة المورد</span><input class="f" id="po-r" placeholder="مثلًا 1045"></label>
      <label class="fld"><span>تاريخ الاستلام</span><input class="f" id="po-d" type="date" value="${E.today()}" max="${E.today()}"></label></div>
    <div id="po-items"></div>
    <div class="tw"><table class="t" id="po-t"><thead><tr><th style="min-width:200px">الصنف</th><th class="n">الكمية</th><th class="n">السعر للوحدة (ج)</th><th>تاريخ الإنتاج</th><th>تاريخ الصلاحية</th><th class="n">القيمة</th><th></th></tr></thead><tbody id="po-lines"></tbody></table></div>
    <div class="smart"><div style="background:var(--red-soft)"><small>إجمالي الفاتورة</small><b id="po-tot">0.00</b></div></div>
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
  document.getElementById('po-items').innerHTML = `<div class="bar" style="gap:6px"><span class="crumb" style="font-weight:800">أصناف ${esc(sp.name)}:</span>${items.length > 6 ? `<input class="f" id="po-q" type="search" placeholder="ابحث في الأصناف" value="${esc(PO.q)}" aria-label="ابحث في أصناف المورد" style="width:180px;height:34px">` : ''}${items.map(i => `<button class="btn sm ${PO.lines.some(l => l.itemId === i.id) ? 'p' : ''}" data-act="po-pick" data-arg="${i.id}" data-name="${esc(i.name)}" ${PO.q.trim() && !i.name.includes(PO.q.trim()) ? 'hidden' : ''}>${esc(i.name)}</button>`).join('')}${U.isOwner() ? `<button class="btn sm" data-act="po-newform" style="border-style:dashed">${ic('plus')} صنف جديد</button>` : ''}</div>
    ${PO.newOpen ? `<div class="po-new" style="margin-top:8px;padding:10px;border:1px dashed var(--line);border-radius:12px"><div class="fgrid"><label class="fld"><span>اسم الصنف الجديد</span><input class="f" id="po-ni-n" placeholder="مثلًا: كتف ضاني"></label>
      <label class="fld"><span>النوع</span><select class="f" id="po-ni-c"><option value="meat">لحوم وقطعيات (بالكيلو)</option><option value="carcass">لحوم بالعضم (بالكيلو)</option><option value="spice">توابل وإضافات (بالكيلو)</option><option value="pack">مواد تعبئة ومستلزمات (بالقطعة)</option></select></label>
      <label class="fld"><span>القسم (اختياري)</span><input class="f" id="po-ni-s" placeholder="مثلًا: برازيلى"></label></div>
      <div class="bar"><button class="btn p sm" data-act="po-newitem">ضيفه للمورد وللفاتورة</button><button class="btn sm" data-act="po-newform">إلغاء</button></div></div>` : ''}${sp.items && sp.items.length ? '' : '<div class="note" style="margin-top:8px">المورد ده لسه مش متحدد أصنافه، فكل الأصناف ظاهرة. حددها من شاشة الموردين.</div>'}`;
  document.getElementById('po-lines').innerHTML = PO.lines.map((l, k) => { const it = E.item(l.itemId), u = it.unit === 'kg' ? 'كجم' : 'قطعة'; const v = Math.round((parseFloat(l.qty) || 0) * (parseFloat(l.cost) || 0) * 100);
    return `<tr><td><b>${esc(it.name)}</b><div class="crumb">${E.CAT_NAME[it.cat]}${last(it.id) != null ? ' · آخر سعر ' + fm(last(it.id)) : ''}</div></td>
      <td data-l="الكمية"><div style="display:flex;align-items:center;gap:6px"><input class="f pl-q" type="number" min="0" step="${it.unit === 'kg' ? '0.001' : '1'}" value="${esc(l.qty || '')}" style="width:100px"><span class="crumb" style="white-space:nowrap">${u}</span></div></td>
      <td data-l="السعر"><div style="display:flex;align-items:center;gap:6px"><input class="f pl-c" type="number" min="0" step="0.01" value="${esc(l.cost || '')}" style="width:100px"><span class="crumb" style="white-space:nowrap">/ ${u}</span></div></td>
      <td data-l="تاريخ الإنتاج"><input class="f pl-p" type="date" value="${l.prod}" max="${E.today()}"></td><td data-l="تاريخ الصلاحية"><input class="f pl-e" type="date" value="${l.exp}"></td>
      <td class="n" data-l="القيمة"><b class="pl-v">${fm(v)}</b></td><td><button class="btn sm dan" data-act="po-del" data-arg="${k}" aria-label="شيل السطر">✕</button></td></tr>`; }).join('') || `<tr><td colspan="7"><div class="empty">دوس على الأصناف اللي فوق عشان تضيفها للفاتورة</div></td></tr>`;
  document.querySelectorAll('#po-lines input').forEach(el => { el.oninput = poTotals; });
  const pq = document.getElementById('po-q');
  if (pq) pq.oninput = e => { PO.q = e.target.value; const q = PO.q.trim(); document.querySelectorAll('#po-items [data-act="po-pick"]').forEach(b => { b.hidden = !!q && !b.dataset.name.includes(q); }); };
  poTotals();
}
function poTotals() {
  readPo(); let net = 0;
  document.querySelectorAll('#po-lines tr').forEach((tr, k) => { const l = PO.lines[k]; if (!l) return; const v = Math.round((parseFloat(l.qty) || 0) * (parseFloat(l.cost) || 0) * 100); tr.querySelector('.pl-v').textContent = fm(v); net += v; });
  document.getElementById('po-tot').textContent = fm(net);
}
ACTS['po-pick'] = id => { readPo(); const k = PO.lines.findIndex(l => l.itemId === id); if (k >= 0) PO.lines.splice(k, 1); else { const it = E.item(id); PO.lines.push({ itemId: id, qty: '', cost: '', prod: E.today(), exp: E.addDays(E.today(), DEF_EXP[it.cat] || 30) }); } drawPo(); const q = document.querySelectorAll('.pl-q'); if (k < 0 && q.length) q[q.length - 1].focus(); };
// a supplier brings something new: create the item, add it to the supplier's items and to this delivery
ACTS['po-newform'] = () => { readPo(); PO.newOpen = !PO.newOpen; drawPo(); if (PO.newOpen) document.getElementById('po-ni-n').focus(); };
ACTS['po-newitem'] = async () => {
  const name = val('po-ni-n').trim(), cat = val('po-ni-c'), sub = val('po-ni-s').trim();
  if (!name) { document.getElementById('po-ni-n').focus(); toast('اكتب اسم الصنف', 'bad'); return; }
  readPo();
  try {
    await E.saveItem({ name, cat, unit: cat === 'pack' ? 'pc' : 'kg', priceRetail: 0, priceWholesale: 0, minQty: 0, vat: 0, ...(sub && ['meat', 'carcass'].includes(cat) ? { sub } : {}) });
    const it = S().items.find(i => i.name === name); if (!it) throw new Error('الصنف متضافش، جرّب تاني');
    const sp = E.partner(PO.sup);
    if (sp.items && sp.items.length && !sp.items.includes(it.id)) await E.savePartner({ id: sp.id, type: 'supplier', name: sp.name, phone: sp.phone || '', kind: sp.kind, terms: sp.terms, taxId: sp.taxId || '', supplies: sp.supplies || '', items: [...sp.items, it.id] });
    PO.lines.push({ itemId: it.id, qty: '', cost: '', prod: E.today(), exp: E.addDays(E.today(), DEF_EXP[it.cat] || 30) });
    PO.newOpen = false; drawPo(); toast('اتضاف الصنف للمورد وللفاتورة', 'ok');
    const q = document.querySelectorAll('.pl-q'); if (q.length) q[q.length - 1].focus();
  } catch (e) { toast(e.message, 'bad'); }
};
ACTS['po-del'] = k => { readPo(); PO.lines.splice(+k, 1); drawPo(); };

/* ========== SUPPLIERS ========== */
PAGES.suppliers = () => {
  const s = S(), ms = E.monthStart(E.today());
  const rows = s.partners.filter(p => p.type === 'supplier' && match('sp', p.name, p.phone, (p.items || []).map(i => E.item(i).name).join(' ')));
  page('الموردين', `<div class="bar">${searchBox('sp', 'ابحث بالاسم أو الصنف')}<span class="grow"></span>${['owner', 'storekeeper', 'accountant'].includes(U.role()) ? `<button class="btn p" data-act="partner-new" data-arg="supplier">${ic('plus')} مورد جديد</button>` : ''}</div>
    <div class="card"><div class="bd">${table('sp', [{ t: 'المورد', f: p => `<b>${esc(p.name)}</b>` }, { t: 'بيورّد', f: p => (p.items || []).length ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${p.items.slice(0, 4).map(i => `<span class="pill mut">${esc(E.item(i).name)}</span>`).join('')}${p.items.length > 4 ? `<span class="pill mut">+${p.items.length - 4}</span>` : ''}</div>` : '<span class="pill warn">مش متحدد</span>' }, { t: 'التليفون', f: p => `<span class="mono">${esc(p.phone)}</span>` },
      { t: 'مشتريات الشهر', n: 1, f: p => fm(sumBy(s.docs.purchases.filter(x => x.supplierId === p.id && x.date >= ms), x => x.total)) }, { t: 'إجمالي المشتريات', n: 1, f: p => fm(E.partnerTotals(p.id).billed) }, { t: 'اتدفع له', n: 1, f: p => fm(E.partnerTotals(p.id).settled) }, { t: 'المستحق له', n: 1, f: p => `<b>${fm(E.partnerBalance(p.id))}</b>` }], rows, { onRow: p => 'supplier/' + p.id, empty: 'لسه مفيش موردين. دوس "مورد جديد" وحدد أصنافه.' })}</div></div>`);
};
PAGES.supplier = id => {
  const p = E.partner(id); const st = E.partnerStatement(id); const s = S();
  const pur = s.docs.purchases.filter(x => x.supplierId === id);
  const itemRows = (p.items || []).map(iid => { const lines = pur.flatMap(x => x.lines.filter(l => l.itemId === iid).map(l => ({ ...l, date: x.date }))); const it = E.item(iid); return { it, qty: sumBy(lines, l => l.qty), val: sumBy(lines, l => l.value), last: lines[lines.length - 1] }; });
  page(esc(p.name), `<div class="kpis"><div class="kpi main"><small>المستحق له</small><b>${fm0(E.partnerBalance(id))} <em>ج</em></b></div><div class="kpi"><small>فواتير الشراء</small><b>${pur.length}</b></div><div class="kpi"><small>إجمالي المشتريات</small><b>${fm0(sumBy(pur, x => x.total))} <em>ج</em></b></div><div class="kpi"><small>عدد الأصناف</small><b>${(p.items || []).length}</b></div></div>
    <div class="bar"><span class="grow"></span>${['owner', 'storekeeper'].includes(U.role()) ? `<button class="btn p" data-act="po-from" data-arg="${id}">${ic('truck')} استلام توريدة منه</button>` : ''}${U.waLink(p.phone)}${['owner', 'accountant'].includes(U.role()) ? `<button class="btn p" data-act="pay-new" data-arg="${id}">سداد للمورد</button>` : ''}<button class="btn" data-act="partner-edit" data-arg="${id}">تعديل البيانات والأصناف</button></div>
    <div class="card"><div class="hd"><h3>الأصناف اللي بيورّدها</h3></div><div class="bd">${table('spi', [{ t: 'الصنف', f: r => `<b>${esc(r.it.name)}</b> <span class="crumb">${esc(r.it.code)}</span>` }, { t: 'النوع', f: r => E.CAT_NAME[r.it.cat] }, { t: 'اشترينا منه', n: 1, f: r => r.qty ? qtyf(r.qty, r.it.unit) : '—' }, { t: 'بقيمة', n: 1, f: r => r.val ? fm(r.val) : '—' }, { t: 'آخر سعر', n: 1, f: r => r.last ? fm(r.last.unitCost) + (r.it.unit === 'kg' ? ' /كجم' : ' /قطعة') : '—' }, { t: 'آخر استلام', f: r => r.last ? df(r.last.date) : '—' }, { t: 'الرصيد عندنا', n: 1, f: r => qtyf(E.available(r.it.id), r.it.unit) }], itemRows, { empty: 'حدد أصناف المورد من "تعديل البيانات والأصناف"' })}</div></div>
    <div class="card"><div class="hd"><h3>كشف الحساب</h3></div><div class="bd">${table('sst', [{ t: 'التاريخ', f: r => df(r.date) }, { t: 'القيد', f: r => `<span class="mono">${esc(r.no)}</span>` }, { t: 'البيان', f: r => tx(r.memo) }, { t: 'مدين (سداد)', n: 1, f: r => r.dr ? fm(r.dr) : '' }, { t: 'دائن (مشتريات)', n: 1, f: r => r.cr ? fm(r.cr) : '' }, { t: 'الرصيد', n: 1, f: r => `<b>${fm(r.run)}</b>` }], st.slice().reverse())}</div></div>`, { crumb: '<a href="#suppliers">الموردين</a>' });
};
ACTS['po-from'] = id => { PO.sup = id; ACTS['po-new'](); PO.sup = id; };

U.sumBy = sumBy;
})();
