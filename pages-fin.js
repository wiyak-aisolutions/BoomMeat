/* Boom Meat ERP — sales, customers, items, accounting, reports, admin */
(function () {
'use strict';
const U = window.UI, E = U.E, S = U.S;
const { esc, tx, fm, fm0, kgf, qtyf, pct, df, tf, packName, toG, toP, toI, canCost, isOwner, ic, PAGES, ACTS, page, modal, run, toast, val, table, bars, hbars, partnerOptions, methodOptions, chatter, periodBar, period, tabs, searchBox, match, sumBy, accName } = U;

/* ========== WHATSAPP ORDERS (placed by the bot, approved here → invoice on account; collected on delivery) ========== */
const OSTAT = { pending: ['warn', 'مستني موافقة'], approved: ['ok', 'متوافق عليه'], rejected: ['bad', 'مرفوض'] };
const opack = g => g >= 1000 ? `${g / 1000} كجم` : `${g} جم`;
const ofee = o => o.fee != null ? o.fee : (o.delivery && o.delivery.fee) || 0; // new orders carry the fixed delivery fee
const ogrand = o => o.total + ofee(o);
const ostage = o => o.deliveredAt ? '<span class="pill ok">اتسلّم ✓</span>' : o.outAt ? '<span class="pill info">في الطريق 🚚</span>' : '';
PAGES.orders = () => {
  const s = S(), all = (s.docs.orders || []).slice().reverse();
  const tb = tabs('ord', [['all', 'الكل'], ['pending', 'مستنية'], ['approved', 'متوافق عليها'], ['rejected', 'مرفوضة']], 'pending');
  const rows = all.filter(o => (tb.cur === 'all' || o.status === tb.cur) && match('oq', o.no, o.name, o.phone, o.address));
  const pend = all.filter(o => o.status === 'pending'), unpaid = all.filter(o => o.status === 'approved' && !o.receiptNo);
  const card = o => `<a class="oc ${o.status}" href="#order/${esc(o.id)}">
      <div class="oc-a"><b class="mono">${esc(o.no)}</b>${o.test ? '<span class="pill mut">تجربة</span>' : ''}<small>${tf(o.at)}</small></div>
      <div class="oc-b"><b>${esc(o.name)}</b>${o.kind === 'wholesale' ? ' <span class="pill red">جملة</span>' : ''}<small class="mono">${esc(o.phone)}</small></div>
      <div class="oc-c">${o.lines.map(l => `<span>${l.count} × ${esc(l.name)} <em>${opack(l.packSize)}</em></span>`).join('')}</div>
      <div class="oc-d"><b>${fm(ogrand(o))} ج</b><small>${E.ORDER_METHODS[o.method] || ''}${o.proof ? (o.proof.status === 'ok' ? ' · ✅ التحويل وصل' : o.proof.status === 'rejected' ? ' · ❌ التحويل موصلش' : ' · 📎 صورة تحويل مستنية') : ''}</small></div>
      <div class="oc-e"><span class="pill ${OSTAT[o.status][0]}">${OSTAT[o.status][1]}</span>${o.status === 'approved' ? (o.receiptNo ? '<span class="pill ok">اتحصّل</span>' : o.paidAmount ? '<span class="pill warn">باقي التوصيل</span>' : '<span class="pill warn">لسه متحصلش</span>') : ''}${o.status === 'approved' && !o.sentAt ? '<span class="pill info">مستني الإرسال</span>' : ''}${ostage(o)}</div>
      <span class="oc-go" aria-hidden="true">${ic('menu')}</span></a>`;
  page('طلبات واتساب', `<div class="kpis"><div class="kpi main"><small>مستنية موافقة</small><b>${pend.length}</b><span class="t">${fm0(sumBy(pend, ogrand))} ج شامل الضريبة والتوصيل</span></div>
      <div class="kpi"><small>متوافق عليها ولسه متحصلتش</small><b>${unpaid.length}</b><span class="t">${fm0(sumBy(unpaid, o => ogrand(o) - (o.paidAmount || 0)))} ج</span></div></div>
    <div class="bar">${tb.html}${searchBox('oq', 'ابحث برقم الطلب أو الاسم أو التليفون')}</div>
    <div class="ocs">${rows.map(card).join('') || '<div class="card"><div class="bd"><div class="empty">مفيش طلبات هنا</div></div></div>'}</div>
    <p class="crumb" style="margin-top:12px">دوس على أي طلب تشوف تفاصيله وصورة التحويل ومين وافق عليه.${all.some(o => o.test) ? ' الطلبات اللي عليها «تجربة» جاية من رقم تجربة البوت: مبتتحولش لفاتورة، فمفيهاش موافقة.' : ''}</p>`);
};
const OACT = { placed: 'وصل الطلب من الواتساب', delivery: 'اتحدد التوصيل', send: 'اتبعت للعميل', proof: 'العميل بعت صورة التحويل', proof_rejected: 'التحويل موصلش، واتطلب من العميل يبعته تاني', approved: 'اتوافق على الطلب واتعملت الفاتورة', rejected: 'اترفض الطلب', paid: 'اتسجل إن الفلوس اتحصّلت', proof_ok: 'التحويل وصل', out: 'الأوردر خرج للتوصيل', delivered: 'الأوردر وصل للعميل واتقفل', invoice_sent: 'الفاتورة اتبعتت للعميل على الواتساب', confirm_sent: 'تأكيد الأوردر اتبعت للعميل', edited: 'اتعدّل الطلب', deleted: 'اتمسح' };
const PSTAT = { pending: '<span class="pill warn">مستنية مراجعة</span>', ok: '<span class="pill ok">التحويل وصل</span>', rejected: '<span class="pill bad">التحويل موصلش</span>' };
const whoName = by => by === 'bot' ? 'بوت الواتساب' : by === 'telegram' ? 'المالك من تليجرام' : by ? E.userName(by) : '—';
function orderTimeline(o) {
  let ev = (o.log || []).map(x => ({ at: x.at, by: x.by, action: x.action, note: x.note }));
  if (!ev.length) { // older orders: rebuild what we know
    ev.push({ at: o.at, by: 'bot', action: 'placed' });
    if (o.proof) ev.push({ at: o.proof.at, by: 'bot', action: 'proof' });
    if (o.status === 'approved') ev.push({ at: o.decidedAt, by: o.decidedBy, action: 'approved', note: o.invoiceNo });
    if (o.status === 'rejected') ev.push({ at: o.decidedAt, by: o.decidedBy, action: 'rejected', note: o.reason });
    if (o.receiptNo) ev.push({ at: o.paidAt, by: o.paidBy, action: 'paid', note: o.receiptNo });
  }
  return `<ol class="tl">${ev.map(x => `<li class="tl-${esc(x.action)}"><b>${esc(OACT[x.action] || x.action)}</b><small>${x.at ? tf(x.at) : ''} · ${esc(whoName(x.by))}${x.note ? ' · ' + esc(x.note) : ''}</small></li>`).join('')}</ol>`;
}
async function proofSrc(o) {
  if (!o.proof) return '';
  if (o.proof.dataUrl) return o.proof.dataUrl;
  try { const r = await U.api('orderProofUrl', [{ id: o.id }]); const u = r && r.result ? (r.result.url || r.result) : (r && r.url); return typeof u === 'string' ? u : ''; }
  catch (_) { return ''; }
}
/* ---------- order review: delivery fee + time, live receipt preview, send ---------- */
const ODRAFT = {};
const ETA_CHIPS = ['خلال ساعة', 'خلال ساعتين', 'النهارده بالليل', 'بكرة الصبح'];
const dlv = o => o.delivery || {};
const draftOf = o => ODRAFT[o.id] || (ODRAFT[o.id] = { fee: dlv(o).fee != null ? String(dlv(o).fee / 100) : '', eta: (dlv(o).eta && dlv(o).eta.text) || '', at: (dlv(o).eta && dlv(o).eta.at) || '', note: dlv(o).note || '' });
const egp2 = p => (p / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// The receipt the customer gets, rendered from the order (+ the draft while reviewing)
function receiptHTML(o, d) {
  const co = S().settings.company || {}, rate = S().settings.vatRate || 14;
  const fee = o.fee != null ? o.fee : d ? Math.round((parseFloat(d.fee) || 0) * 100) : (dlv(o).fee || 0);
  const total = o.total + fee, net = Math.round(total * 100 / (100 + rate)), vat = total - net;
  const transferOk = o.proof && o.proof.status === 'ok';
  const paid = o.receiptNo ? total : o.paidAmount ? o.paidAmount : transferOk ? ogrand(o) : 0, due = total - paid;
  const eta = d ? (d.eta || '') : (dlv(o).eta && dlv(o).eta.text) || '', note = d ? d.note : dlv(o).note;
  const when = new Date((o.at || '').replace(' ', 'T'));
  const dt = isNaN(when) ? '' : when.toLocaleString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `<div class="rcp" dir="rtl">
    <div class="rcp-h"><div class="lg"><img src="boom-logo.png" alt=""></div><div><b>${esc(co.name || 'بوم ميت للحوم')}</b><small>فاتورة ضريبية مبسطة</small></div>${paid && !due ? '<div class="stamp">✓ مدفوع</div>' : ''}</div>
    <div class="rcp-b">
      <div class="r"><span>رقم الفاتورة</span><span class="mono">${esc(o.invoiceNo || 'بعد الموافقة')}</span></div>
      <div class="r"><span>الطلب</span><span class="mono">${esc(o.no)}</span></div>
      ${dt ? `<div class="r"><span>التاريخ</span><b>${esc(dt)}</b></div>` : ''}
      <div class="r"><span>العميل</span><b>${esc(o.name)}</b></div>
      <hr>
      ${o.lines.map(l => `<div class="it"><span>${esc(l.name)}<small>${l.count} × ${opack(l.packSize)} · ${fm0(l.pricePerKg)} ج للكيلو</small></span><b>${egp2(l.amount)}</b></div>`).join('')}
      ${fee ? `<div class="it"><span>التوصيل</span><b>${egp2(fee)}</b></div>` : ''}
      <hr>
      <div class="r"><span>الصافي</span><b>${egp2(net)}</b></div>
      <div class="r"><span>ضريبة القيمة المضافة ${rate}٪</span><b>${egp2(vat)}</b></div>
      <div class="r"><span>الدفع</span><b>${esc(E.ORDER_METHODS[o.method] || '')}</b></div>
      <div class="grand"><span>الإجمالي</span><b>${egp2(total)} ج</b></div>
      ${paid && due ? `<div class="r due"><span>مدفوع ${egp2(paid)} ج</span><b>باقي ${egp2(due)} ج عند الاستلام</b></div>` : ''}
      ${eta ? `<div class="eta">🚚 ميعاد التوصيل: <b>${esc(eta)}</b></div>` : ''}
      ${note ? `<div class="eta note">${esc(note)}</div>` : ''}
    </div>
    <div class="rcp-f"><b>شكراً إنك اخترت بوم ميت</b><br>${esc(co.address || '')} · ${esc((co.phone || '').replace(/[()+\s]/g, '').replace(/^2/, ''))}<br>رقم التسجيل الضريبي ${esc(co.taxId || '')}</div>
  </div>`;
}
function reviewPanel(o) {
  const d = draftOf(o), approved = o.status === 'approved', sent = !!o.sentAt;
  const cash = o.method !== 'instapay', fullyPaid = !!o.receiptNo;
  const head = !approved ? 'راجع الطلب قبل الموافقة' : sent ? 'اتبعت للعميل' : 'جاهز يتبعت للعميل';
  const sub = !approved ? 'حدد التوصيل وشوف الفاتورة زي ما العميل هيستلمها' : cash && !fullyPaid ? 'الكاش: العميل بيستلم التأكيد وميعاد التوصيل دلوقتي، والفاتورة بتتبعتله بعد التحصيل' : 'العميل هيستلم التأكيد وميعاد التوصيل والفاتورة';
  const form = `<div class="rv-form">
      ${!approved && o.fee == null ? `<label class="fld"><span>التوصيل (ج)</span><input class="f" id="rv-fee" type="number" inputmode="decimal" min="0" step="1" placeholder="0" value="${esc(d.fee)}"></label>` : `<div class="kv"><div><span>التوصيل</span><b>${ofee(o) ? fm(ofee(o)) + ' ج' : 'مجاني'}</b></div></div>`}
      <label class="fld"><span>ميعاد التوصيل</span><input class="f" id="rv-eta" maxlength="80" placeholder="مثلاً: خلال ساعتين" value="${esc(d.eta)}"></label>
      <div class="chips rv-chips">${ETA_CHIPS.map(t => `<button type="button" class="chip ${d.eta === t ? 'on' : ''}" data-act="rv-eta" data-arg="${esc(t)}">${t}</button>`).join('')}</div>
      <label class="fld"><span>ملاحظة للعميل (اختياري)</span><input class="f" id="rv-note" maxlength="160" placeholder="مثلاً: المندوب هيكلمك قبلها بنص ساعة" value="${esc(d.note)}"></label>
      <div class="rv-acts">${!approved
        ? (o.test ? '<div class="note">ده طلب تجربة: مينفعش يتوافق عليه.</div>' : `<button class="btn p lg" data-act="rv-approve" data-arg="${o.id}">${ic('check')} وافق واعمل الفاتورة</button>`)
        : `<button class="btn p lg" data-act="rv-send" data-arg="${o.id}">${ic('send')} ${sent ? 'ابعت للعميل تاني' : 'ابعت للعميل'}</button>${dlv(o).setAt ? `<button class="btn" data-act="rv-eta-save" data-arg="${o.id}">غيّر ميعاد التوصيل بس</button>` : ''}`}</div>
      ${approved && cash && !fullyPaid ? '<div class="note info">الفاتورة لسه متبعتتش. بتتبعت للعميل لوحدها أول ما تدوس «الأوردر وصل» (الكاش بيتسجل ساعتها).</div>' : ''}
    </div>`;
  return `<div class="card rv"><div class="hd"><h3>${head}</h3><span class="sub">${sub}</span></div><div class="bd rv-grid">${form}<div class="rv-prev"><small class="crumb">اللي العميل هيستلمه على الواتساب</small><div id="rv-receipt">${receiptHTML(o, d)}</div></div></div></div>`;
}
PAGES.order = id => {
  const o = ordOf(id); if (!o) { U.go('orders'); return; }
  const c = o.customerId ? S().partners.find(p => p.id === o.customerId) : null;
  const canAct = ['owner', 'sales', 'accountant'].includes(U.role());
  const proofWaiting = o.proof && o.proof.status === 'pending' && !o.receiptNo;
  const canShip = o.status === 'approved' && !o.test && !o.deliveredAt && (o.method !== 'instapay' || !!o.receiptNo); // InstaPay ships once the money is in
  const acts = !canAct ? '' : (proofWaiting ? `<button class="btn p" data-act="ord-proof-ok" data-arg="${o.id}">${ic('check')} التحويل وصل</button><button class="btn" data-act="ord-nopay" data-arg="${o.id}">التحويل موصلش</button>` : '')
    + (o.status === 'approved' && !o.receiptNo && o.method === 'instapay' && !proofWaiting ? `<button class="btn" data-act="ord-paid" data-arg="${o.id}">${ic('cash')} الفلوس اتحصّلت</button>` : '')
    + (canShip && !o.outAt ? `<button class="btn ${proofWaiting ? '' : 'p'}" data-act="ord-out" data-arg="${o.id}">🚚 الأوردر خرج</button>` : '')
    + (canShip ? `<button class="btn ${o.outAt ? 'p' : ''}" data-act="ord-delivered" data-arg="${o.id}">${ic('check')} الأوردر وصل</button>` : '')
    + (o.status === 'pending' ? `<button class="btn" data-act="ord-no" data-arg="${o.id}">ارفض الطلب</button>` : '')
    + (o.test ? `<button class="btn dan" data-act="ord-del" data-arg="${o.id}">امسح طلب التجربة</button>` : '');
  const wa = U.waLink(o.phone);
  page(`طلب ${esc(o.no)}`, `<div class="bar"><span class="pill ${OSTAT[o.status][0]}">${OSTAT[o.status][1]}</span>${o.receiptNo ? '<span class="pill ok">اتحصّل</span>' : ''}${ostage(o)}${o.test ? '<span class="pill mut">تجربة</span>' : ''}<span class="grow"></span>${acts}</div>
    ${canAct && o.status !== 'rejected' && !o.deliveredAt ? reviewPanel(o) : ''}
    <div class="grid g-main">
      <div style="display:grid;gap:16px;align-content:start">
      <div class="card"><div class="hd"><h3>الطلب</h3><span class="sub">${tf(o.at)}</span></div><div class="bd">
        <div class="tw"><table class="t"><thead><tr><th>المنتج</th><th>العبوة</th><th class="n">العدد</th><th class="n">الكمية</th><th class="n">سعر الكيلو</th><th class="n">القيمة</th></tr></thead><tbody>
          ${o.lines.map(l => `<tr><td class="nm"><b>${esc(l.name)}</b></td><td>${opack(l.packSize)}</td><td class="n">${l.count}</td><td class="n">${kgf(l.qty)} كجم</td><td class="n">${fm(l.pricePerKg)}</td><td class="n"><b>${fm(l.amount)}</b></td></tr>`).join('')}
          ${ofee(o) ? `<tr><td class="nm">التوصيل</td><td></td><td></td><td></td><td></td><td class="n">${fm(ofee(o))}</td></tr>` : ''}
          <tr class="tot"><td colspan="5">الإجمالي شامل الضريبة${ofee(o) ? ' والتوصيل' : ''}</td><td class="n">${fm(ogrand(o))}</td></tr></tbody></table></div>
        ${o.note ? `<div class="note" style="margin-top:12px"><b>ملاحظة العميل:</b> ${esc(o.note)}</div>` : ''}
        ${o.reason ? `<div class="note bad" style="margin-top:12px"><b>سبب الرفض:</b> ${esc(o.reason)}</div>` : ''}
      </div></div>
      <div class="card"><div class="hd"><h3>اللي حصل في الطلب</h3><span class="sub">مين عمل إيه وإمتى</span></div><div class="bd">${orderTimeline(o)}</div></div>
      </div>
      <div style="display:grid;gap:16px;align-content:start">
        <div class="card"><div class="hd"><h3>العميل</h3></div><div class="bd">
          <div class="kv"><div><span>الاسم</span><b>${c ? `<a href="#customer/${esc(c.id)}">${esc(o.name)}</a>` : esc(o.name)}</b></div><div><span>التليفون</span><b class="mono">${esc(o.phone)}</b></div><div><span>النوع</span><b>${o.kind === 'wholesale' ? 'جملة' : 'قطاعي'}</b></div><div><span>الدفع</span><b>${E.ORDER_METHODS[o.method] || '—'}</b></div></div>
          <p style="margin:12px 0 10px"><b>العنوان:</b> ${esc(o.address)}</p>
          <div class="bar" style="margin:0">${wa}${o.location && o.location.lat ? `<a class="btn" href="https://maps.google.com/?q=${encodeURIComponent(o.location.lat + ',' + o.location.lng)}" target="_blank" rel="noopener">${ic('send')} افتح اللوكيشن</a>` : ''}${o.invoiceId ? `<a class="btn" href="#invoice/${esc(o.invoiceId)}">${ic('bill')} الفاتورة ${esc(o.invoiceNo)}</a>` : ''}</div>
        </div></div>
        <div class="card"><div class="hd"><h3>صورة التحويل</h3>${o.proof ? `<span class="sub">${tf(o.proof.at)}</span><div class="tools">${PSTAT[o.proof.status || 'pending']}</div>` : ''}</div><div class="bd" id="proof-box">${o.proof ? '<div class="empty">بتحمّل الصورة…</div>' : `<div class="empty">${o.method === 'instapay' ? 'العميل لسه مبعتش صورة التحويل.' : 'الدفع كاش عند الاستلام، مفيش تحويل.'}</div>`}</div></div>
      </div>
    </div>`, { crumb: '<a href="#orders">طلبات واتساب</a> / ' + esc(o.no) });
  // live preview while typing (no full re-render, so focus stays in the field)
  const d = draftOf(o), redraw = () => { const box = document.getElementById('rv-receipt'); if (box) box.innerHTML = receiptHTML(o, d); };
  [['rv-fee', 'fee'], ['rv-eta', 'eta'], ['rv-note', 'note']].forEach(([elId, k]) => { const el = document.getElementById(elId); if (el) el.oninput = () => { d[k] = el.value; redraw(); document.querySelectorAll('.rv-chips .chip').forEach(ch => ch.classList.toggle('on', ch.dataset.arg === d.eta)); }; });
  if (o.proof) proofSrc(o).then(src => { const box = document.getElementById('proof-box'); if (!box) return; box.innerHTML = src ? `<a href="${esc(src)}" target="_blank" rel="noopener" class="proof"><img src="${esc(src)}" alt="صورة التحويل"></a><small class="crumb">دوس على الصورة تفتحها كبيرة.</small>` : '<div class="note bad">الصورة مش متاحة دلوقتي. جرّب تحدّث الصفحة.</div>'; });
};
const etaOf = d => d.eta ? { text: d.eta.trim(), ...(d.at ? { at: d.at } : {}) } : null;
ACTS['rv-eta'] = t => { const o = ordOf(U.route ? U.route().id : location.hash.split('/')[1]); const id = location.hash.split('/')[1]; const d = ODRAFT[id]; if (!d) return; d.eta = t; const el = document.getElementById('rv-eta'); if (el) el.value = t; document.querySelectorAll('.rv-chips .chip').forEach(ch => ch.classList.toggle('on', ch.dataset.arg === t)); const box = document.getElementById('rv-receipt'); if (box) box.innerHTML = receiptHTML(ordOf(id), d); };
ACTS['rv-approve'] = async id => {
  const o = ordOf(id), d = draftOf(o), fee = Math.round((parseFloat(d.fee) || 0) * 100);
  if (fee < 0 || fee > 100000) return toast('رسوم التوصيل مش منطقية', 'bad');
  if (!d.eta.trim()) { const el = document.getElementById('rv-eta'); if (el) { el.focus(); U.pinError && U.pinError(el, 'اكتب ميعاد التوصيل أو اختار واحد'); } return; }
  const r = await run(() => E.decideOrder({ id, action: 'approve', deliveryFee: fee, eta: etaOf(d), note: d.note.trim() }), 'اتوافق على الطلب. راجع وابعت للعميل');
  if (r) delete ODRAFT[id];
};
ACTS['rv-send'] = async id => { const o = ordOf(id), d = draftOf(o);
  if (d.eta.trim() && (!dlv(o).eta || dlv(o).eta.text !== d.eta.trim() || (dlv(o).note || '') !== d.note.trim())) { const ok = await run(() => E.decideOrder({ id, action: 'eta', eta: etaOf(d), note: d.note.trim() })); if (!ok) return; }
  const r = await run(() => E.decideOrder({ id, action: 'send' }), o.method !== 'instapay' && !o.receiptNo ? 'اتبعت التأكيد وميعاد التوصيل. الفاتورة بتتبعت بعد التحصيل' : 'اتبعتت الفاتورة وميعاد التوصيل للعميل');
  if (r) delete ODRAFT[id];
};
ACTS['rv-eta-save'] = async id => { const o = ordOf(id), d = draftOf(o); if (!d.eta.trim()) return toast('اكتب ميعاد التوصيل', 'bad');
  const r = await run(() => E.decideOrder({ id, action: 'eta', eta: etaOf(d), note: d.note.trim() }), 'اتغير الميعاد' + (o.sentAt ? ' والعميل هيجيله رسالة' : ''));
  if (r) delete ODRAFT[id]; };
ACTS['ord-proof-ok'] = id => modal('التحويل وصل؟', `<p>اتأكدت إن التحويل وصل حسابك؟ العميل هيجيله «التحويل وصل ✅، هنراجع طلبك ونبعتلك الفاتورة وميعاد التوصيل».</p>`, { saveText: 'أيوه، وصل', save: async () => { await E.decideOrder({ id, action: 'proofok' }); U.afterChange(); toast('اتسجل إن التحويل وصل', 'ok'); } });


const ordOf = id => (S().docs.orders || []).find(o => o.id === id);
ACTS['ord-ok'] = id => { const o = ordOf(id); modal(`موافقة على ${esc(o.no)}`, `<p>هتتعمل فاتورة <b>آجل</b> بـ <b>${fm(o.total)}</b> (شامل الضريبة) على <b>${esc(o.name)}</b>، وهيتخصم من الفريزر:</p><p>${o.lines.map(l => `${l.count} × ${esc(l.name)} ${opack(l.packSize)}`).join('<br>')}</p><p>الدفع عند التسليم: ${E.ORDER_METHODS[o.method]}.</p>`, { saveText: 'وافق واعمل الفاتورة', save: async () => { await E.decideOrder({ id, action: 'approve' }); U.afterChange(); toast('اتوافق على الطلب واتعملت الفاتورة', 'ok'); } }); };
ACTS['ord-no'] = id => { const o = ordOf(id); modal(`رفض ${esc(o.no)}`, `<p class="crumb">البوت هيبلغ العميل على الواتساب بلطف إن الطلب مش هيكمل.</p><label class="fld"><span>السبب (اختياري)</span><input class="f" id="ord-reason" maxlength="200" placeholder="مثلاً: العنوان برا منطقة التوصيل"></label>`, { saveText: 'ارفض الطلب', save: async () => { await E.decideOrder({ id, action: 'reject', reason: val('ord-reason') }); U.afterChange(); toast('اترفض الطلب', 'ok'); } }); };
ACTS['ord-paid'] = id => { const o = ordOf(id); const insta = o.method === 'instapay';
  modal(insta ? `التحويل وصل · ${esc(o.no)}` : `تحصيل ${esc(o.no)}`, `<p>${insta ? 'اتأكدت إن التحويل وصل حسابك؟' : 'الفلوس اتحصّلت من العميل؟'} هيتسجل تحصيل <b>${fm(ogrand(o) - (o.paidAmount || 0))} ج</b> من <b>${esc(o.name)}</b> (${E.ORDER_METHODS[o.method]})${o.status === 'pending' ? '، والطلب هيتوافق عليه وتتعمل فاتورته' : ''}.</p><p class="crumb">العميل هيجيله على الواتساب «تم دفع الأوردر» وفاتورته.</p>`,
  { saveText: insta ? 'أيوه، التحويل وصل' : 'سجّل التحصيل', save: async () => { await E.decideOrder({ id, action: 'paid' }); U.afterChange(); toast('اتسجل الدفع والعميل هيجيله التأكيد', 'ok'); } }); };
ACTS['ord-nopay'] = id => { const o = ordOf(id); modal(`التحويل موصلش · ${esc(o.no)}`, `<p>البوت هيقول لـ <b>${esc(o.name)}</b> إن التحويل موصلش، ويطلب منه يبعت صورة التحويل تاني.</p><label class="fld"><span>السبب (اختياري)</span><input class="f" id="np-reason" maxlength="200" placeholder="مثلاً: المبلغ مش مطابق"></label>`,
  { saveText: 'ابعت للعميل', save: async () => { await E.decideOrder({ id, action: 'nopay', reason: val('np-reason') }); U.afterChange(); toast('اتبعت للعميل يبعت التحويل تاني', 'ok'); } }); };
ACTS['ord-out'] = id => { const o = ordOf(id), due = ogrand(o) - (o.receiptNo ? ogrand(o) : o.paidAmount || 0);
  modal(`الأوردر خرج · ${esc(o.no)}`, `<p>الأوردر خرج مع المندوب؟ <b>${esc(o.name)}</b> هيجيله على الواتساب «طلبك في الطريق 🚚»${due > 0 ? `، ونفكّره يجهّز <b>${fm(due)} ج</b> عند الاستلام` : ''}.</p>`,
  { saveText: 'أيوه، خرج', save: async () => { await E.decideOrder({ id, action: 'out' }); U.afterChange(); toast('اتسجل إن الأوردر خرج والعميل هيجيله رسالة', 'ok'); } }); };
ACTS['ord-delivered'] = id => { const o = ordOf(id), cashDue = !o.receiptNo ? ogrand(o) - (o.paidAmount || 0) : 0;
  modal(`الأوردر وصل · ${esc(o.no)}`, `<p>الأوردر وصل لـ <b>${esc(o.name)}</b>؟ الطلب هيتقفل.</p>${cashDue > 0 ? `<p>هيتسجل تحصيل <b>${fm(cashDue)} ج</b> كاش، والعميل هيجيله «تم الدفع» وفاتورته على الواتساب.</p>` : ''}`,
  { saveText: cashDue > 0 ? 'أيوه، وصل واتحصّل' : 'أيوه، وصل', save: async () => { await E.decideOrder({ id, action: 'delivered' }); U.afterChange(); toast('الأوردر اتقفل', 'ok'); } }); };
ACTS['ord-resend'] = id => run(() => E.decideOrder({ id, action: 'resend' }), 'الفاتورة هتتبعت للعميل تاني');
ACTS['ord-del'] = id => run(() => E.decideOrder({ id, action: 'delete' }), 'اتمسح طلب التجربة');

/* ========== INVOICES ========== */
PAGES.invoices = () => {
  const s = S(), cost = canCost();
  const p = period('inv', 'month');
  const rows = s.docs.invoices.filter(v => v.date >= p.from && v.date <= p.to && match('iq', v.no, E.partner(v.customerId).name)).slice().reverse();
  const cols = [{ t: 'الرقم', f: v => `<b class="mono">${esc(v.no)}</b>` }, { t: 'التاريخ', f: v => df(v.date) }, { t: 'العميل', f: v => esc(E.partner(v.customerId).name) },
    { t: 'النوع', f: v => v.kind === 'wholesale' ? '<span class="pill red">جملة</span>' : '<span class="pill yel">قطاعي</span>' }, { t: 'الدفع', f: v => v.method === 'credit' ? '<span class="pill warn">آجل</span>' : `<span class="pill ok">${E.METHOD_NAME[v.method]}</span>` },
    { t: 'الكمية', n: 1, f: v => kgf(sumBy(v.lines, l => l.qty)) + ' كجم' }, { t: 'الصافي', n: 1, f: v => fm(v.net) }, { t: 'الضريبة', n: 1, f: v => fm(v.vat) }, { t: 'الإجمالي', n: 1, f: v => `<b>${fm(v.total)}</b>` }];
  if (cost) cols.push({ t: 'الربح', n: 1, f: v => `<span style="color:var(--${v.net - v.cost >= 0 ? 'ok' : 'bad'})">${fm(v.net - v.cost)}</span>` });
  cols.push({ t: 'الضرايب', f: () => '<span class="pill ok">مقبولة</span>' });
  const net = sumBy(rows, v => v.net), cst = sumBy(rows, v => v.cost);
  page('الفواتير', `<div class="kpis"><div class="kpi main"><small>المبيعات (${p.label})</small><b>${fm0(net)} <em>ج</em></b><span class="t">${rows.length} فاتورة · ضريبة ${fm0(sumBy(rows, v => v.vat))} ج</span></div>
      <div class="kpi"><small>جملة</small><b>${fm0(sumBy(rows.filter(v => v.kind === 'wholesale'), v => v.net))} <em>ج</em></b></div><div class="kpi"><small>قطاعي</small><b>${fm0(sumBy(rows.filter(v => v.kind === 'retail'), v => v.net))} <em>ج</em></b></div>
      ${cost ? `<div class="kpi"><small>مجمل الربح</small><b>${fm0(net - cst)} <em>ج</em></b><span class="t up">هامش ${pct(net - cst, net)}</span></div>` : ''}</div>
    <div class="bar">${periodBar('inv', p.k)}${searchBox('iq', 'ابحث برقم الفاتورة أو العميل')}<span class="grow"></span>${['owner', 'sales', 'accountant'].includes(U.role()) ? `<button class="btn p" data-go="newinvoice">${ic('plus')} بيع جديد</button>` : ''}</div>
    <div class="card"><div class="bd">${table('inv', cols, rows, { onRow: v => 'invoice/' + v.id })}</div></div>`);
};

/* ===== Sales screen (point of sale): products in stock → cart → confirm → invoice ===== */
const NI = { cust: null, lines: [], method: null, discount: '', q: '', grp: '' };
const fgAvail = (id, z) => Math.floor(E.available(id, E.whs('fg'), z) / z);
PAGES.newinvoice = () => {
  const s = S();
  const custs = s.partners.filter(p => p.type === 'customer');
  if (!NI.cust || !custs.some(c => c.id === NI.cust)) NI.cust = custs[0].id;
  const c = E.partner(NI.cust);
  const methods = c.terms === 'credit' ? ['credit', 'cash', 'bank', 'instapay'] : ['cash', 'instapay', 'bank'];
  if (!methods.includes(NI.method)) NI.method = methods[0];
  // catalog
  const prods = s.items.filter(i => i.cat === 'product');
  const groups = [...new Set(prods.map(p => p.group).filter(Boolean))];
  const q = NI.q.trim();
  const shown = prods.filter(p => (!NI.grp || p.group === NI.grp) && (!q || p.name.includes(q) || (p.code || '').toLowerCase().includes(q.toLowerCase())));
  const inCart = (id, z) => (NI.lines.find(l => l.productId === id && l.packSize === z) || {}).count || 0;
  const card = p => {
    const sizes = E.packsOf(p).filter(z => fgAvail(p.id, z) > 0);
    const price = E.priceFor(p, c);
    return `<div class="pc ${sizes.length ? '' : 'out'}"><div class="pc-h"><b>${esc(p.name)}</b><span>${fm0(price)} ج للكيلو</span></div>
      ${sizes.length ? `<div class="pc-z">${sizes.map(z => { const n = inCart(p.id, z), left = fgAvail(p.id, z) - n; return `<button class="pz ${n ? 'on' : ''}" data-act="ni-plus" data-arg="${p.id}|${z}" ${left > 0 ? '' : 'disabled'} aria-label="ضيف ${esc(p.name)} ${packName(z)}"><b>${packName(z)}</b><small>${n ? `${n} في السلة` : `متاح ${left}`}</small></button>`; }).join('')}</div>`
        : `<div class="pc-out">مفيش رصيد في الفريزرات. بيتملا لما تتقفل تشغيلة للمنتج ده.</div>`}</div>`;
  };
  const sorted = shown.slice().sort((a, b) => (E.available(b.id, E.whs('fg')) > 0) - (E.available(a.id, E.whs('fg')) > 0));
  // cart
  let gross = 0, cst = 0, err = '';
  NI.lines = NI.lines.filter(l => l.count > 0);
  const rows = NI.lines.map((l, k) => {
    const p = E.item(l.productId), price = E.priceFor(p, c), avail = fgAvail(p.id, l.packSize);
    const amt = E.mulDiv(l.count * l.packSize, price, 1000); gross += amt;
    if (l.count > avail) err = `${p.name} ${packName(l.packSize)}: المتاح ${avail} عبوة بس`;
    if (canCost()) { let need = l.count * l.packSize; for (const lot of s.lots.filter(x => x.itemId === p.id && E.whUse(x.wh) === 'fg' && x.packSize === l.packSize && x.qty > 0).sort((a, b) => (a.expDate || '') < (b.expDate || '') ? -1 : (a.expDate || '') > (b.expDate || '') ? 1 : a.inDate < b.inDate ? -1 : 1)) { const t = Math.min(need, lot.qty); cst += t === lot.qty ? lot.value : E.mulDiv(lot.value, t, lot.qty); need -= t; if (!need) break; } }
    return `<div class="ci"><div class="ci-t"><b>${esc(p.name)}</b><small>${packName(l.packSize)} · ${kgf(l.count * l.packSize)} كجم · ${fm0(price)} ج للكيلو</small></div>
      <div class="ci-q"><button class="qb" data-act="ni-minus" data-arg="${k}" aria-label="قلّل">−</button><input class="f ni-c" data-k="${k}" type="number" inputmode="numeric" min="1" step="1" value="${l.count}" aria-label="العدد"><button class="qb" data-act="ni-plus" data-arg="${p.id}|${l.packSize}" ${l.count < avail ? '' : 'disabled'} aria-label="زوّد">+</button></div>
      <b class="ci-a">${fm(amt)}</b><button class="ci-x" data-act="ni-del" data-arg="${k}" aria-label="شيل من السلة">${ic('x')}</button></div>`;
  }).join('');
  const disc = toP(NI.discount || '0') || 0;
  const net = gross - disc, vat = Math.round(Math.max(net, 0) * s.settings.vatRate / 100), total = net + vat;
  const count = NI.lines.reduce((a, l) => a + l.count, 0);
  page('بيع جديد', `<div class="pos">
    <section class="pos-cat card"><div class="bd">
      <div class="pos-tools"><input class="f" id="ni-q" type="search" placeholder="ابحث باسم المنتج" value="${esc(NI.q)}" aria-label="ابحث باسم المنتج">
        <div class="seg pos-g"><button class="${NI.grp ? '' : 'on'}" data-act="ni-grp" data-arg="">الكل</button>${groups.map(g => `<button class="${NI.grp === g ? 'on' : ''}" data-act="ni-grp" data-arg="${esc(g)}">${esc(g)}</button>`).join('')}</div></div>
      <div class="pcs">${sorted.map(card).join('') || '<div class="empty">مفيش منتج بالاسم ده</div>'}</div>
    </div></section>
    <aside class="pos-cart card" id="cart"><div class="bd">
      <div class="hd" style="padding:0 0 10px"><h3>السلة</h3><span class="sub">${count ? count + ' عبوة' : 'فاضية'}</span>${count ? '<div class="tools"><button class="btn sm" data-act="ni-reset">فضّي السلة</button></div>' : ''}</div>
      <div class="fgrid one"><label class="fld"><span>العميل</span><select class="f" id="ni-c">${partnerOptions('customer', NI.cust)}</select></label>
        <div class="pos-meta"><span class="pill ${c.kind === 'wholesale' ? 'info' : 'warn'}">${c.kind === 'wholesale' ? 'أسعار الجملة' : 'أسعار القطاعي'}</span>${E.partnerBalance && c.terms === 'credit' ? `<span class="pill mut">عليه ${fm0(E.partnerBalance(c.id))} ج</span>` : ''}</div>
        <div class="fgrid two"><label class="fld"><span>الدفع</span><select class="f" id="ni-m">${methodOptions(methods, NI.method)}</select></label>
        <label class="fld"><span>التاريخ</span><input class="f" id="ni-d" type="date" value="${E.today()}" max="${E.today()}"></label></div></div>
      <div class="cis">${rows || '<div class="empty cart-empty">دوس على حجم العبوة في أي منتج عشان يتضاف هنا.</div>'}</div>
      ${count ? `<label class="fld"><span>خصم (ج)</span><input class="f" id="ni-x" type="number" inputmode="decimal" min="0" step="1" value="${esc(NI.discount)}"></label>
      <div class="tl cart-tl"><div><span>الإجمالي</span><b>${fm(gross)}</b></div>${disc ? `<div><span>الخصم</span><b class="neg">− ${fm(disc)}</b></div>` : ''}<div><span>ضريبة ${s.settings.vatRate}%</span><b>${fm(vat)}</b></div>
        ${canCost() ? `<div class="sep"><span>التكلفة · الربح</span><b>${fm0(cst)} · <span style="color:var(--${net - cst >= 0 ? 'ok' : 'bad'})">${fm0(net - cst)} (${pct(net - cst, net)})</span></b></div>` : ''}</div>
      <div class="due"><small>المطلوب من العميل</small><b>${fm(total)} <em>ج</em></b></div>
      ${err ? `<div class="note bad">${esc(err)}</div>` : ''}
      <button class="btn p lg pos-ok" data-act="ni-save" ${err ? 'disabled' : ''}>${ic('check')} تأكيد الأوردر وطباعة الفاتورة</button>` : ''}
    </div></aside>
    ${count ? `<button class="pos-bar" data-act="ni-cart"><span>${ic('bill')} السلة · ${count} عبوة</span><b>${fm(total)} ج</b></button>` : ''}
  </div>`, { crumb: '<a href="#invoices">الفواتير</a> / بيع جديد' });
  const mb = U.content();
  document.getElementById('ni-c').onchange = e => { NI.cust = e.target.value; NI.method = null; U.render(); };
  document.getElementById('ni-m').onchange = e => { NI.method = e.target.value; };
  const x = document.getElementById('ni-x'); if (x) x.onchange = e => { NI.discount = e.target.value; U.render(); };
  const qi = document.getElementById('ni-q'); let tq; qi.oninput = e => { clearTimeout(tq); tq = setTimeout(() => { NI.q = e.target.value; U.render(); const n = document.getElementById('ni-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  mb.querySelectorAll('.ni-c').forEach(el => { el.onchange = () => { NI.lines[el.dataset.k].count = Math.max(0, toI(el.value) || 0); U.render(); }; });
};
ACTS['sale-to'] = id => { NI.cust = id; NI.method = null; U.go('newinvoice'); };
ACTS['ni-plus'] = arg => { const [id, z] = arg.split('|'); const l = NI.lines.find(x => x.productId === id && x.packSize === +z); if (l) l.count++; else NI.lines.push({ productId: id, packSize: +z, count: 1 }); U.render(); };
ACTS['ni-minus'] = k => { const l = NI.lines[+k]; if (l) l.count--; U.render(); };
ACTS['ni-del'] = k => { NI.lines.splice(+k, 1); U.render(); };
ACTS['ni-grp'] = g => { NI.grp = g || ''; U.render(); };
ACTS['ni-reset'] = () => { NI.lines = []; NI.discount = ''; U.render(); };
ACTS['ni-cart'] = () => document.getElementById('cart').scrollIntoView({ behavior: 'smooth', block: 'start' });
ACTS['ni-save'] = async () => {
  const lines = NI.lines.map(l => ({ productId: l.productId, packSize: l.packSize, count: l.count }));
  const v = await run(() => E.invoice({ date: val('ni-d'), customerId: NI.cust, lines, discount: toP(NI.discount || '0') || 0, method: NI.method }), 'اتأكد الأوردر واتعملت الفاتورة');
  if (v) { NI.lines = []; NI.discount = ''; INV_PRINT = v.id; U.go('invoice', v.id); }
};
let INV_PRINT = null; // open the print dialog once, right after a sale is confirmed

PAGES.invoice = id => {
  const s = S(), v = s.docs.invoices.find(x => x.id === id); if (!v) { U.go('invoices'); return; }
  if (INV_PRINT === id) { INV_PRINT = null; setTimeout(() => window.print(), 450); }
  const c = E.partner(v.customerId), co = s.settings.company;
  page(`فاتورة ${esc(v.no)}`, `<div class="bar no-print"><button class="btn p" data-act="print">${ic('print')} طباعة</button><button class="btn" data-go="newinvoice">بيع جديدة</button>${canCost() ? `<span class="pill mut">التكلفة ${fm(v.cost)} · الربح ${fm(v.net - v.cost)}</span>` : ''}<span class="pill mut">القيد ${esc(v.je)}${v.paidJe ? ' · ' + esc(v.paidJe) : ''}</span></div>
    <div class="inv">
      <div class="inv-h"><div><img src="boom-logo.png" alt="Boom Meat"><div><b>${esc(co.name)}</b></div><small>${esc(co.address)}</small><br><small>رقم التسجيل الضريبي: ${esc(co.taxId)}</small><br><small dir="ltr">${esc(co.phone)}</small></div>
        <div class="r"><b style="font-size:20px">فاتورة ضريبية</b><div>رقم: <span class="mono">${esc(v.no)}</span></div><div>التاريخ: ${esc(v.date)}</div><div>${esc(v.at.slice(11, 16))}</div></div></div>
      <div class="inv-m"><div><small>العميل</small><b>${esc(c.name)}</b><br>${c.kind === 'wholesale' ? 'جملة' : 'قطاعي'} · ${E.METHOD_NAME[v.method]}${c.taxId ? `<br>رقم ضريبي: ${esc(c.taxId)}` : ''}${c.phone ? `<br><span dir="ltr">${esc(c.phone)}</span>` : ''}</div>
        <div><small>بيانات الطلب</small>استلام من المصنع<br>بواسطة: ${esc(E.userName(v.by))}<br>تشغيلات: ${[...new Set(v.lines.flatMap(l => l.parts.map(p => (s.lots.find(x => x.id === p.lotId) || {}).src).filter(Boolean).map(x => x.no)))].map(esc).join('، ')}</div></div>
      <table><thead><tr><th>#</th><th>الصنف</th><th>العبوة</th><th class="n">العدد</th><th class="n">الكمية</th><th class="n">سعر الكيلو</th><th class="n">الإجمالي</th></tr></thead>
        <tbody>${v.lines.map((l, k) => `<tr><td>${k + 1}</td><td>${esc(E.item(l.productId).name)}</td><td>${packName(l.packSize)}</td><td class="n">${l.count}</td><td class="n">${kgf(l.qty)} كجم</td><td class="n">${fm(l.pricePerKg)}</td><td class="n">${fm(l.amount)}</td></tr>`).join('')}</tbody></table>
      <div class="inv-f"><div style="display:flex;gap:12px;align-items:flex-end"><div class="qr">QR<br>الفاتورة<br>الإلكترونية</div><div style="font-size:11.5px;color:#666">الرقم الإلكتروني (UUID)<br><span class="mono">${esc(v.eta.uuid.slice(0, 8))}…${esc(v.eta.uuid.slice(-6))}</span><br>حالة المنظومة: مقبولة (محاكاة)</div></div>
        <div class="inv-t"><div><span>الإجمالي</span><span>${fm(v.gross)}</span></div><div><span>خصم</span><span>${fm(v.discount)}</span></div><div><span>الصافي</span><span>${fm(v.net)}</span></div><div><span>ضريبة القيمة المضافة ${s.settings.vatRate}%</span><span>${fm(v.vat)}</span></div><div class="g"><span>الإجمالي المستحق</span><span>${fm(v.total)} ج</span></div></div></div>
      <div style="display:flex;gap:40px;font-size:12.5px;color:#666;padding-top:10px"><span style="border-top:1px solid #999;padding-top:4px;min-width:140px">توقيع المستلم</span><span style="border-top:1px solid #999;padding-top:4px;min-width:140px">توقيع المسؤول</span></div>
    </div>`, { crumb: '<a href="#invoices">الفواتير</a> / ' + esc(v.no) });
};

/* ========== CUSTOMERS ========== */
PAGES.customers = () => {
  const s = S(), ms = E.monthStart(E.today());
  const rows = s.partners.filter(p => p.type === 'customer' && match('cq', p.name, p.phone)).map(p => ({ p, bal: E.partnerBalance(p.id), m: sumBy(s.docs.invoices.filter(v => v.customerId === p.id && v.date >= ms), v => v.total), last: s.docs.invoices.filter(v => v.customerId === p.id).slice(-1)[0] }));
  page('العملاء', `<div class="bar">${searchBox('cq', 'ابحث بالاسم أو التليفون')}<span class="grow"></span><button class="btn" data-act="cust-import">استيراد من شيت</button><button class="btn p" data-act="partner-new" data-arg="customer">${ic('plus')} عميل جديد</button></div>
    <div class="card"><div class="bd">${table('cu', [{ t: 'العميل', f: r => `<b>${esc(r.p.name)}</b>` }, { t: 'النوع', f: r => r.p.kind === 'wholesale' ? '<span class="pill red">جملة</span>' : '<span class="pill yel">قطاعي</span>' }, { t: 'التعامل', f: r => r.p.terms === 'credit' ? 'آجل' : 'كاش' },
      { t: 'التليفون', f: r => `<span class="mono">${esc(r.p.phone)}</span>` }, { t: 'مشتريات الشهر', n: 1, f: r => fm(r.m) }, { t: 'آخر فاتورة', f: r => r.last ? df(r.last.date) : '—' }, { t: 'عليه', n: 1, f: r => r.bal ? `<b style="color:var(--warn)">${fm(r.bal)}</b>` : '0.00' }], rows, { onRow: r => 'customer/' + r.p.id })}</div></div>`);
};
PAGES.customer = id => {
  const s = S(), p = E.partner(id), invs = s.docs.invoices.filter(v => v.customerId === id), ms = E.monthStart(E.today());
  const st = E.partnerStatement(id);
  const prod = {}; invs.forEach(v => v.lines.forEach(l => { prod[l.productId] = (prod[l.productId] || 0) + l.qty; }));
  page(esc(p.name), `<div class="kpis"><div class="kpi main"><small>الرصيد المستحق عليه</small><b>${fm0(E.partnerBalance(id))} <em>ج</em></b><span class="t">${p.terms === 'credit' ? 'عميل آجل' : 'عميل كاش'}</span></div>
      <div class="kpi"><small>مشتريات الشهر</small><b>${fm0(sumBy(invs.filter(v => v.date >= ms), v => v.total))} <em>ج</em></b></div><div class="kpi"><small>إجمالي المشتريات</small><b>${fm0(sumBy(invs, v => v.total))} <em>ج</em></b><span class="t">${invs.length} فاتورة</span></div></div>
    <div class="bar"><span class="grow"></span>${['owner', 'accountant', 'sales'].includes(U.role()) ? `<button class="btn p" data-act="sale-to" data-arg="${id}">${ic('plus')} بيع للعميل ده</button><button class="btn" data-act="rc-new" data-arg="${id}">${ic('cash')} تحصيل</button>` : ''}${U.waLink(p.phone)}<button class="btn" data-act="partner-edit" data-arg="${id}">تعديل البيانات</button></div>
    <div class="grid g-main"><div class="card"><div class="hd"><h3>الفواتير</h3></div><div class="bd">${table('cinv', [{ t: 'الرقم', f: v => `<span class="mono">${esc(v.no)}</span>` }, { t: 'التاريخ', f: v => df(v.date) }, { t: 'الأصناف', f: v => v.lines.map(l => `${esc(E.item(l.productId).name)} ${l.count}×${packName(l.packSize)}`).join('، ') }, { t: 'الدفع', f: v => E.METHOD_NAME[v.method] }, { t: 'الإجمالي', n: 1, f: v => `<b>${fm(v.total)}</b>` }], invs.slice().reverse(), { onRow: v => 'invoice/' + v.id })}</div></div>
      <div class="card"><div class="hd"><h3>بيشتري إيه</h3><span class="sub">كجم</span></div><div class="bd">${hbars(Object.entries(prod).sort((a, b) => b[1] - a[1]).map(([k, q]) => ({ label: E.item(k).name, v: q })), v => kgf(v))}
        <div class="kv" style="margin-top:14px"><div><span>التليفون</span><b class="mono">${esc(p.phone || '—')}</b></div><div><span>رقم ضريبي</span><b>${esc(p.taxId || '—')}</b></div></div></div></div></div>
    <div class="card"><div class="hd"><h3>كشف الحساب</h3></div><div class="bd">${table('cst', [{ t: 'التاريخ', f: r => df(r.date) }, { t: 'القيد', f: r => `<span class="mono">${esc(r.no)}</span>` }, { t: 'البيان', f: r => tx(r.memo) }, { t: 'مدين', n: 1, f: r => r.dr ? fm(r.dr) : '' }, { t: 'دائن', n: 1, f: r => r.cr ? fm(r.cr) : '' }, { t: 'الرصيد', n: 1, f: r => `<b>${fm(r.run)}</b>` }], st.slice().reverse())}</div></div>`, { crumb: '<a href="#customers">العملاء</a>' });
};
function partnerForm(p, type) {
  p = p || { type, kind: 'wholesale', terms: 'credit', items: [] };
  const supItems = () => {
    const groups = [['carcass', 'meat'], ['spice'], ['pack']];
    const names = ['لحوم وقطعيات', 'توابل وإضافات', 'مواد تعبئة'];
    return groups.map((cats, g) => { const its = S().items.filter(i => cats.includes(i.cat)); return `<div><div class="bar" style="margin:6px 0"><b style="font-size:13px">${names[g]}</b><button class="btn sm" type="button" data-act="pf-all" data-arg="${g}">الكل</button></div><div class="pf-grid" data-g="${g}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px">${its.map(i => `<label style="display:flex;gap:8px;align-items:center;padding:6px 10px;border:1px solid var(--line);border-radius:10px;background:var(--glass2);cursor:pointer"><input type="checkbox" class="pf-i" value="${i.id}" ${(p.items || []).includes(i.id) ? 'checked' : ''}> <span>${esc(i.name)}</span></label>`).join('')}</div></div>`; }).join('');
  };
  return `<div class="fgrid"><label class="fld"><span>الاسم</span><input class="f" id="pf-n" value="${esc(p.name || '')}"></label><label class="fld"><span>التليفون</span><input class="f" id="pf-ph" value="${esc(p.phone || '')}" dir="ltr"></label>
    ${p.type === 'customer' ? `<label class="fld"><span>النوع (قايمة الأسعار)</span><select class="f" id="pf-k"><option value="wholesale" ${p.kind === 'wholesale' ? 'selected' : ''}>جملة · مطعم أو محل</option><option value="retail" ${p.kind === 'retail' ? 'selected' : ''}>قطاعي · فرد</option></select></label>
    <label class="fld"><span>التعامل</span><select class="f" id="pf-t"><option value="credit" ${p.terms === 'credit' ? 'selected' : ''}>آجل</option><option value="cash" ${p.terms === 'cash' ? 'selected' : ''}>كاش</option></select></label>` : ''}
    <label class="fld"><span>الرقم الضريبي</span><input class="f" id="pf-tx" value="${esc(p.taxId || '')}" dir="ltr"></label></div>
    ${p.type === 'supplier' ? `<div><b>الأصناف اللي بيورّدها</b><div class="crumb">في الاستلام هتظهر الأصناف دي بس، فمحدش يسجل صنف من مورد غلط.</div>${supItems()}</div>` : ''}`;
}
const readPartner = (type, id) => ({ id, type, name: val('pf-n'), phone: val('pf-ph'), kind: type === 'customer' ? val('pf-k') : null, terms: type === 'customer' ? val('pf-t') : 'credit', taxId: val('pf-tx'), items: type === 'supplier' ? [...document.querySelectorAll('.pf-i:checked')].map(x => x.value) : [] });
ACTS['pf-all'] = g => { const boxes = [...document.querySelectorAll(`.pf-grid[data-g="${g}"] .pf-i`)]; const on = !boxes.every(b => b.checked); boxes.forEach(b => { b.checked = on; }); };
ACTS['partner-new'] = type => modal(type === 'customer' ? 'عميل جديد' : 'مورد جديد', partnerForm(null, type), { wide: type === 'supplier', save: async () => { await E.savePartner(readPartner(type)); toast('اتضاف', 'ok'); } });
ACTS['partner-edit'] = id => { const p = E.partner(id); modal('تعديل ' + esc(p.name), partnerForm(p), { wide: p.type === 'supplier', save: async () => { await E.savePartner(readPartner(p.type, id)); toast('اتحفظ', 'ok'); } }); };
ACTS['cust-import'] = () => modal('استيراد عملاء من شيت', `<div class="note info">انسخ الأعمدة من Excel أو Google Sheets والصقها هنا، كل عميل في سطر: <b>الاسم، التليفون، النوع (جملة/قطاعي)، التعامل (آجل/كاش)</b>.</div>
  <textarea class="f" id="ci-t" style="min-height:160px" placeholder="مطعم الشيف&#9;01012345678&#9;جملة&#9;آجل"></textarea>`, { saveText: 'استيراد', save: async () => {
  const lines = val('ci-t').split(/\r?\n/).map(l => l.split(/\t|,|،/).map(x => x.trim())).filter(c => c[0]);
  if (!lines.length) throw new Error('الصق بيانات الأول');
  let n = 0, skip = 0;
  for (const c of lines) { if (S().partners.some(p => p.type === 'customer' && p.name === c[0])) { skip++; continue; } await E.savePartner({ type: 'customer', name: c[0], phone: c[1] || '', kind: /قطاعي|فرد|retail/i.test(c[2] || '') ? 'retail' : 'wholesale', terms: /كاش|نقد|cash/i.test(c[3] || '') ? 'cash' : 'credit' }); n++; }
  toast(`اتضاف ${n} عميل${skip ? ` · ${skip} موجودين قبل كده` : ''}`, 'ok'); } });
ACTS['rc-new'] = id => !id || !S().partners.some(p => p.id === id) ? ACTS['rc-pick']() : modal('تحصيل من ' + esc(E.partner(id).name), `<div class="note info">الرصيد المستحق: <b>${fm(E.partnerBalance(id))} ج</b></div>
  <div class="fgrid"><label class="fld"><span>المبلغ (ج)</span><input class="f" id="rc-a" type="number" min="0" step="0.01" value="${E.partnerBalance(id) / 100}"></label><label class="fld"><span>الطريقة</span><select class="f" id="rc-m">${methodOptions(['cash', 'bank', 'instapay'], 'bank')}</select></label><label class="fld"><span>التاريخ</span><input class="f" id="rc-d" type="date" value="${E.today()}" max="${E.today()}"></label></div>
  <label class="fld"><span>ملاحظة</span><input class="f" id="rc-n"></label>`, { saveText: 'تسجيل التحصيل', save: async () => { await E.receipt({ date: val('rc-d'), customerId: id, amount: toP(val('rc-a')), method: val('rc-m'), memo: val('rc-n') }); toast('اتسجل التحصيل', 'ok'); } });
ACTS['pay-new'] = id => !id || !S().partners.some(p => p.id === id) ? U.go('suppliers') : modal('سداد لـ ' + esc(E.partner(id).name), `<div class="note info">المستحق له: <b>${fm(E.partnerBalance(id))} ج</b></div>
  <div class="fgrid"><label class="fld"><span>المبلغ (ج)</span><input class="f" id="py-a" type="number" min="0" step="0.01" value="${E.partnerBalance(id) / 100}"></label><label class="fld"><span>الطريقة</span><select class="f" id="py-m">${methodOptions(['bank', 'cash', 'instapay'], 'bank')}</select></label><label class="fld"><span>التاريخ</span><input class="f" id="py-d" type="date" value="${E.today()}" max="${E.today()}"></label></div>
  <label class="fld"><span>ملاحظة</span><input class="f" id="py-n"></label>`, { saveText: 'تسجيل السداد', save: async () => { await E.supplierPayment({ date: val('py-d'), supplierId: id, amount: toP(val('py-a')), method: val('py-m'), memo: val('py-n') }); toast('اتسجل السداد', 'ok'); } });

/* ========== ITEMS & PRICES ========== */
PAGES.items = () => {
  const s = S(), own = isOwner();
  const tb = tabs('it', [['product', 'المنتجات'], ['meat', 'اللحوم'], ['spice', 'التوابل والإضافات'], ['pack', 'مواد التعبئة'], ['hist', 'سجل تعديل الأسعار']], 'product');
  let body;
  if (tb.cur === 'hist') body = table('ph', [{ t: 'الوقت', f: h => tf(h.at) }, { t: 'الصنف', f: h => esc(E.item(h.itemId).name) }, { t: 'السعر', f: h => h.field === 'priceRetail' ? 'قطاعي' : 'جملة' }, { t: 'قبل', n: 1, f: h => fm(h.old) }, { t: 'بعد', n: 1, f: h => `<b>${fm(h.new)}</b>` }, { t: 'التغيير', n: 1, f: h => h.old ? `<span style="color:var(--${h.new >= h.old ? 'bad' : 'ok'})">${h.new >= h.old ? '▲' : '▼'} ${pct(Math.abs(h.new - h.old), h.old)}</span>` : '' }, { t: 'بواسطة', f: h => esc(E.userName(h.user)) }], s.priceHistory.slice().reverse(), { empty: 'مفيش تعديلات أسعار لسه' });
  else {
    const cats = tb.cur === 'meat' ? ['meat', 'carcass', 'byproduct'] : [tb.cur];
    const rows = s.items.filter(i => cats.includes(i.cat) && match('itq', i.name, i.code));
    const cols = [{ t: 'الكود', f: i => `<span class="mono">${esc(i.code)}</span>` }, { t: 'الصنف', f: i => `<b>${esc(i.name)}</b>` }, { t: 'النوع', f: i => E.CAT_NAME[i.cat] }, { t: 'الوحدة', f: i => i.unit === 'kg' ? 'كجم' : 'قطعة' },
      { t: 'الرصيد', n: 1, f: i => qtyf(sumBy(s.lots.filter(l => l.itemId === i.id), l => l.qty), i.unit) }, { t: 'الحد الأدنى', n: 1, f: i => i.minQty ? qtyf(i.minQty, i.unit) : '—' }];
    if (tb.cur === 'product') cols.splice(2, 1, { t: 'القسم', f: i => esc(i.group || '—') }, { t: 'العبوات', f: i => E.packsOf(i).map(packName).join('، ') });
    if (tb.cur === 'product' || tb.cur === 'meat') cols.push({ t: 'قطاعي / كجم', n: 1, f: i => i.priceRetail ? `<b>${fm(i.priceRetail)}</b>` : '—' }, { t: 'جملة / كجم', n: 1, f: i => i.priceWholesale ? `<b>${fm(i.priceWholesale)}</b>` : '—' });
    cols.push({ t: 'ضريبة', n: 1, f: i => i.vat + '%' });
    if (own) cols.push({ t: '', f: i => `<button class="btn sm" data-act="item-edit" data-arg="${i.id}">تعديل</button>` });
    body = table('it-' + tb.cur, cols, rows);
  }
  page('الأصناف والأسعار', `<div class="bar">${tb.html}${searchBox('itq', 'ابحث')}<span class="grow"></span>${own ? `<button class="btn p" data-act="item-edit">${ic('plus')} صنف جديد</button>` : ''}</div>
    ${own ? '<div class="note info">أي تعديل في السعر بيتطبق على الفواتير الجاية بس، والفواتير القديمة بتفضل بسعرها. وكل تعديل بيتسجل في "سجل تعديل الأسعار".</div>' : '<div class="note">تعديل الأسعار والأصناف للمالك بس.</div>'}
    <div class="card"><div class="bd">${body}</div></div>`);
};
ACTS['item-edit'] = id => {
  const it = id ? E.item(id) : { code: '', name: '', cat: 'spice', unit: 'kg', priceRetail: 0, priceWholesale: 0, minQty: 0, vat: 14 };
  const used = id && S().lots.some(l => l.itemId === id);
  modal(id ? 'تعديل ' + esc(it.name) : 'صنف جديد', `<div class="fgrid"><label class="fld"><span>الكود</span><input class="f" value="${id ? esc(it.code) : 'بيتعمل تلقائي'}" disabled dir="${id ? 'ltr' : 'auto'}"></label><label class="fld"><span>الاسم</span><input class="f" id="ie-n" value="${esc(it.name)}"></label>
    <label class="fld"><span>النوع</span><select class="f" id="ie-t" ${used ? 'disabled' : ''}>${Object.entries(E.CAT_NAME).map(([k, n]) => `<option value="${k}" ${it.cat === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="fld"><span>القسم (للمنتجات)</span><select class="f" id="ie-g">${['مصنعات', 'قطعيات', 'قطعيات مميزة', 'مقبلات', 'لحوم باردة'].map(g => `<option ${it.group === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <label class="fld"><span>الوحدة</span><select class="f" id="ie-u" ${used ? 'disabled' : ''}><option value="kg" ${it.unit === 'kg' ? 'selected' : ''}>كجم</option><option value="pc" ${it.unit === 'pc' ? 'selected' : ''}>قطعة</option></select></label>
    <label class="fld"><span>سعر القطاعي للكيلو (ج)</span><input class="f" id="ie-r" type="number" min="0" step="0.01" value="${it.priceRetail / 100}"></label><label class="fld"><span>سعر الجملة للكيلو (ج)</span><input class="f" id="ie-w" type="number" min="0" step="0.01" value="${it.priceWholesale / 100}"></label>
    <label class="fld"><span>الحد الأدنى (${it.unit === 'kg' ? 'كجم' : 'قطعة'})</span><input class="f" id="ie-m" type="number" min="0" step="1" value="${it.unit === 'kg' ? it.minQty / 1000 : it.minQty}"></label><label class="fld"><span>ضريبة الشراء %</span><input class="f" id="ie-v" type="number" min="0" max="100" step="1" value="${it.vat}"></label></div>
    ${used ? '<div class="crumb">النوع والوحدة مقفولين لأن الصنف عليه حركات.</div>' : ''}<div class="crumb">سعر القطاعي للقطعيات بيستخدم كمان في توزيع تكلفة التقطيع.</div>`,
  { save: async () => { const unit = val('ie-u'); await E.saveItem({ id, name: val('ie-n'), group: val('ie-g'), cat: val('ie-t'), unit, priceRetail: toP(val('ie-r')) || 0, priceWholesale: toP(val('ie-w')) || 0, minQty: unit === 'kg' ? toG(val('ie-m')) || 0 : toI(val('ie-m')) || 0, vat: toI(val('ie-v')) || 0 }); toast('اتحفظ', 'ok'); } });
};

/* ========== TREASURY ========== */
PAGES.treasury = () => {
  const s = S(); const accs = ['1101', '1102', '1103'];
  const rows = []; s.journal.forEach(j => j.lines.forEach(l => { if (accs.includes(l.acc)) rows.push({ j, l }); }));
  const f = U.FILTER.tacc || '';
  page('الخزنة والبنوك', `<div class="kpis">${accs.map((a, k) => `<div class="kpi ${k === 0 ? 'main' : ''}"><small>${accName(a)}</small><b>${fm0(E.cashBalance(a))} <em>ج</em></b></div>`).join('')}<div class="kpi"><small>الإجمالي</small><b>${fm0(sumBy(accs, a => E.cashBalance(a)))} <em>ج</em></b></div></div>
    <div class="bar"><select class="f" id="t-acc" style="width:auto"><option value="">كل الحسابات</option>${accs.map(a => `<option value="${a}" ${f === a ? 'selected' : ''}>${accName(a)}</option>`).join('')}</select><span class="grow"></span>
      <button class="btn" data-act="rc-pick">تحصيل من عميل</button><button class="btn" data-act="py-pick">سداد لمورد</button><button class="btn" data-act="ct-new">تحويل بين الحسابات</button><button class="btn p" data-act="ex-new">${ic('plus')} مصروف</button></div>
    <div class="card"><div class="bd">${table('tr', [{ t: 'التاريخ', f: r => df(r.j.date) }, { t: 'القيد', f: r => `<span class="mono">${esc(r.j.no)}</span>` }, { t: 'الحساب', f: r => accName(r.l.acc) }, { t: 'البيان', f: r => tx(r.j.memo) }, { t: 'وارد', n: 1, f: r => r.l.dr ? `<span style="color:var(--ok)">${fm(r.l.dr)}</span>` : '' }, { t: 'منصرف', n: 1, f: r => r.l.cr ? `<span style="color:var(--bad)">${fm(r.l.cr)}</span>` : '' }, { t: 'بواسطة', f: r => esc(E.userName(r.j.by)) }], rows.filter(r => !f || r.l.acc === f).reverse())}</div></div>`);
  document.getElementById('t-acc').onchange = e => { U.FILTER.tacc = e.target.value; U.render(); };
};
ACTS['rc-pick'] = () => modal('تحصيل من عميل', `<label class="fld"><span>العميل</span><select class="f" id="pk-c">${S().partners.filter(p => p.type === 'customer').map(p => `<option value="${p.id}">${esc(p.name)} · عليه ${fm(E.partnerBalance(p.id))}</option>`).join('')}</select></label>`, { saveText: 'التالي', save: async () => { const id = val('pk-c'); setTimeout(() => ACTS['rc-new'](id)); } });
ACTS['py-pick'] = () => modal('سداد لمورد', `<label class="fld"><span>المورد</span><select class="f" id="pk-s">${S().partners.filter(p => p.type === 'supplier').map(p => `<option value="${p.id}">${esc(p.name)} · له ${fm(E.partnerBalance(p.id))}</option>`).join('')}</select></label>`, { saveText: 'التالي', save: async () => { const id = val('pk-s'); setTimeout(() => ACTS['pay-new'](id)); } });
ACTS['ct-new'] = () => modal('تحويل بين الحسابات', `<div class="fgrid"><label class="fld"><span>من</span><select class="f" id="ct-f">${methodOptions(['cash', 'bank', 'instapay'], 'cash')}</select></label><label class="fld"><span>إلى</span><select class="f" id="ct-t">${methodOptions(['cash', 'bank', 'instapay'], 'bank')}</select></label><label class="fld"><span>المبلغ (ج)</span><input class="f" id="ct-a" type="number" min="0" step="0.01"></label><label class="fld"><span>التاريخ</span><input class="f" id="ct-d" type="date" value="${E.today()}" max="${E.today()}"></label></div>`,
  { saveText: 'تحويل', save: async () => { await E.cashTransfer({ date: val('ct-d'), from: val('ct-f'), to: val('ct-t'), amount: toP(val('ct-a')) }); toast('اتحول', 'ok'); } });

/* ========== EXPENSES ========== */
PAGES.expenses = () => {
  const s = S(), p = period('ex', 'month');
  const rows = s.docs.expenses.filter(x => x.date >= p.from && x.date <= p.to).slice().reverse();
  const by = {}; rows.forEach(x => { by[x.acc] = (by[x.acc] || 0) + x.amount; });
  const months = []; const first = s.journal[0] ? s.journal[0].date : E.today();
  for (let m = first.slice(0, 7); E.monthEnd(m + '-01') < E.today(); m = E.addDays(E.monthEnd(m + '-01'), 1).slice(0, 7)) months.push(m);
  const missing = months.filter(m => !s.docs.depreciation.some(d => d.month === m));
  page('المصروفات والإهلاك', `<div class="bar">${periodBar('ex', p.k)}<span class="grow"></span><button class="btn p" data-act="ex-new">${ic('plus')} مصروف جديد</button></div>
    <div class="grid g-main"><div class="card"><div class="bd">${table('ex', [{ t: 'الرقم', f: x => `<span class="mono">${esc(x.no)}</span>` }, { t: 'التاريخ', f: x => df(x.date) }, { t: 'النوع', f: x => accName(x.acc) }, { t: 'البيان', f: x => esc(x.memo) }, { t: 'الدفع', f: x => E.METHOD_NAME[x.method] }, { t: 'المبلغ', n: 1, f: x => `<b>${fm(x.amount)}</b>` }, { t: 'بواسطة', f: x => esc(E.userName(x.by)) }], rows,
      { foot: `<tr class="tot"><td colspan="5">الإجمالي</td><td class="n">${fm(sumBy(rows, x => x.amount))}</td><td></td></tr>` })}</div></div>
      <div class="card"><div class="hd"><h3>حسب النوع</h3></div><div class="bd">${hbars(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([a, v]) => ({ label: accName(a), v })), v => fm0(v))}</div></div></div>
    <div class="card"><div class="hd"><h3>إهلاك الأصول الثابتة</h3><span class="sub">قسط شهري ${fm(E.monthlyDepreciation(s))} ج</span>${missing.length ? `<div class="tools">${missing.map(m => `<button class="btn sm p" data-act="dep" data-arg="${m}">تسجيل إهلاك ${m}</button>`).join('')}</div>` : ''}</div><div class="bd">
      ${table('fa', [{ t: 'الأصل', f: a => esc(a.name) }, { t: 'الحساب', f: a => accName(a.acc) }, { t: 'القيمة', n: 1, f: a => fm(a.value) }, { t: 'نسبة الإهلاك السنوي', n: 1, f: a => a.rate + '%' }, { t: 'القسط الشهري', n: 1, f: a => fm(Math.round(a.value * a.rate / 100 / 12)) }], s.assets)}
      <div class="crumb" style="margin-top:8px">الأصول وقيمتها افتراضية لحد ما توصل القايمة الحقيقية. اتسجل إهلاك: ${s.docs.depreciation.map(d => d.month).join('، ') || 'لسه'}.</div></div></div>`);
};
ACTS.dep = m => run(() => E.depreciate({ month: m }), 'اتسجل الإهلاك');
ACTS['ex-new'] = () => modal('مصروف جديد', `<div class="fgrid"><label class="fld"><span>النوع</span><select class="f" id="ex-a">${E.EXPENSE_ACCS.map(a => `<option value="${a}">${accName(a)}</option>`).join('')}</select></label><label class="fld"><span>المبلغ (ج)</span><input class="f" id="ex-v" type="number" min="0" step="0.01"></label>
  <label class="fld"><span>الدفع من</span><select class="f" id="ex-m">${methodOptions(['cash', 'bank', 'instapay'], 'cash')}</select></label><label class="fld"><span>التاريخ</span><input class="f" id="ex-d" type="date" value="${E.today()}" max="${E.today()}"></label></div>
  <label class="fld"><span>البيان</span><input class="f" id="ex-n"></label>`, { save: async () => { await E.expense({ date: val('ex-d'), acc: val('ex-a'), amount: toP(val('ex-v')), method: val('ex-m'), memo: val('ex-n') }); toast('اتسجل المصروف', 'ok'); } });

/* ========== JOURNAL / COA ========== */
const JT = { opening: 'افتتاحي', purchase: 'شراء', issue: 'صرف إنتاج', issue_reverse: 'عكس صرف', batch_close: 'قفل تشغيلة', sale: 'بيع', receipt: 'تحصيل', payment: 'سداد', expense: 'مصروف', cash: 'تحويل نقدية', depreciation: 'إهلاك', writeoff: 'إعدام' };
PAGES.journal = () => {
  const s = S(), p = period('jr', 'month'), ty = U.FILTER.jt || '';
  const rows = s.journal.filter(j => j.date >= p.from && j.date <= p.to && (!ty || j.type === ty) && match('jq', j.no, j.memo)).slice().reverse();
  const open = U.FILTER.jopen;
  const tr = rows.slice(0, 200).map(j => `<tr class="click" data-act="jopen" data-arg="${j.id}"><td class="mono">${esc(j.no)}</td><td>${df(j.date)}</td><td><span class="pill mut">${JT[j.type] || j.type}</span></td><td>${tx(j.memo)}</td><td class="n">${fm(j.total)}</td><td>${esc(E.userName(j.by))}</td><td><span class="pill ok">متوازن</span></td></tr>
    ${open === j.id ? `<tr><td colspan="7" style="background:var(--glass2)"><table class="t"><thead><tr><th>الحساب</th><th>الطرف</th><th class="n">مدين</th><th class="n">دائن</th></tr></thead><tbody>${j.lines.map(l => `<tr><td><span class="mono">${l.acc}</span> ${esc(accName(l.acc))}</td><td>${l.partner ? esc(E.partner(l.partner).name) : ''}</td><td class="n">${l.dr ? fm(l.dr) : ''}</td><td class="n">${l.cr ? fm(l.cr) : ''}</td></tr>`).join('')}<tr class="tot"><td colspan="2">الإجمالي</td><td class="n">${fm(sumBy(j.lines, l => l.dr))}</td><td class="n">${fm(sumBy(j.lines, l => l.cr))}</td></tr></tbody></table></td></tr>` : ''}`).join('');
  page('القيود اليومية', `<div class="note info">القيود بتتعمل تلقائي من العمليات، ومحدش بيكتبها بإيده. ممنوع المسح، والتصحيح بيتعمل بقيد عكسي.</div>
    <div class="bar">${periodBar('jr', p.k)}<select class="f" id="j-t" style="width:auto"><option value="">كل الأنواع</option>${Object.entries(JT).map(([k, n]) => `<option value="${k}" ${ty === k ? 'selected' : ''}>${n}</option>`).join('')}</select>${searchBox('jq', 'ابحث في البيان أو الرقم')}</div>
    <div class="card"><div class="bd"><div class="tw"><table class="t"><thead><tr><th>القيد</th><th>التاريخ</th><th>النوع</th><th>البيان</th><th class="n">المبلغ</th><th>بواسطة</th><th></th></tr></thead><tbody>${tr || '<tr><td colspan="7"><div class="empty">مفيش قيود</div></td></tr>'}</tbody></table></div>${rows.length > 200 ? `<div class="crumb">ظاهر أحدث ٢٠٠ قيد من ${rows.length}. ضيّق الفترة أو استخدم البحث.</div>` : ''}</div></div>`);
  document.getElementById('j-t').onchange = e => { U.FILTER.jt = e.target.value; U.render(); };
};
U.journalRows = () => {
  const p = period('jr', 'month'), ty = U.FILTER.jt || '';
  const head = ['التاريخ', 'رقم القيد', 'النوع', 'البيان', 'كود الحساب', 'الحساب', 'الطرف', 'مدين', 'دائن', 'بواسطة'];
  const out = [head];
  S().journal.filter(j => j.date >= p.from && j.date <= p.to && (!ty || j.type === ty) && match('jq', j.no, j.memo)).forEach(j => j.lines.forEach(l => out.push([j.date, j.no, JT[j.type] || j.type, j.memo, l.acc, accName(l.acc), l.partner ? E.partner(l.partner).name : '', l.dr / 100, l.cr / 100, E.userName(j.by)])));
  return out;
};
ACTS.jopen = id => { U.FILTER.jopen = U.FILTER.jopen === id ? null : id; U.render(); };
PAGES.coa = () => {
  const L = E.ledger({});
  const node = (code, depth) => {
    const a = E.ACCOUNTS.find(x => x.code === code); const kids = E.ACCOUNTS.filter(x => x.parent === code);
    const leafs = E.LEAF.has(code) ? [code] : E.leafUnder(code);
    const b = sumBy(leafs, c => E.bal(L, c) * (E.debitNature(c) === E.debitNature(code) ? 1 : -1));
    return `<tr class="${kids.length ? 'sec' : ''}"><td style="padding-inline-start:${10 + depth * 22}px"><span class="mono">${code}</span> ${esc(a.name)}</td><td>${{ asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', income: 'إيرادات', expense: 'مصروفات' }[E.accType(code)]}</td><td class="n">${fm(b)}</td></tr>` + kids.map(k => node(k.code, depth + 1)).join('');
  };
  page('دليل الحسابات', `<div class="note">شجرة الحسابات مقترحة، والمحاسب يعتمدها قبل التشغيل الفعلي. الأرصدة لحد النهارده.</div>
    <div class="card"><div class="bd"><div class="tw"><table class="t"><thead><tr><th>الحساب</th><th>النوع</th><th class="n">الرصيد</th></tr></thead><tbody>${E.ACCOUNTS.filter(a => !a.parent).map(a => node(a.code, 0)).join('')}</tbody></table></div></div></div>`);
};

/* ========== REPORTS ========== */
PAGES.reports = () => {
  const tb = tabs('rp', [['is', 'قائمة الدخل'], ['bs', 'الميزانية'], ['ma', 'حساب التشغيل والمتاجرة'], ['tb', 'ميزان المراجعة'], ['chk', 'فحص الدقة']], 'is');
  const p = period('rp', 'month');
  const row = (l, v, cls = '', indent = 0) => `<tr class="${cls}"><td style="padding-inline-start:${10 + indent * 22}px">${l}</td><td class="n">${v == null ? '' : fm(v)}</td></tr>`;
  let body = '';
  if (tb.cur === 'is') {
    const r = E.incomeStatement(p);
    body = `<table class="t"><tbody>${row('الإيرادات', null, 'sec')}${row('مبيعات جملة (مطاعم ومحلات)', r.wholesale, '', 1)}${row('مبيعات قطاعي (أفراد)', r.retail, '', 1)}${row('صافي المبيعات', r.revenue, 'tot')}
      ${row('(−) تكلفة البضاعة المباعة', r.cogs, '', 1)}${row(`مجمل الربح · هامش ${pct(r.gross, r.revenue)}`, r.gross, 'tot')}
      ${row('مصروفات المصنع', null, 'sec')}${r.factory.map(x => row(accName(x.code), x.amount, '', 1)).join('')}
      ${row('مصروفات البيع والتسويق', null, 'sec')}${r.selling.map(x => row(accName(x.code), x.amount, '', 1)).join('')}
      ${row('مصروفات إدارية وعمومية', null, 'sec')}${r.admin.map(x => row(accName(x.code), x.amount, '', 1)).join('')}
      ${row('إجمالي المصروفات', r.opex, 'tot')}<tr class="tot"><td style="font-size:16px">${r.net >= 0 ? 'صافي الربح' : 'صافي الخسارة'}</td><td class="n" style="font-size:16px;color:var(--${r.net >= 0 ? 'ok' : 'bad'})">${fm(r.net)}</td></tr></tbody></table>
      <div class="crumb" style="margin-top:8px">الأجور والكهربا مش داخلة في تكلفة التشغيلة (حسب الاتفاق)، فبتظهر هنا كمصروفات مصنع. والإهلاك بيتسجل آخر كل شهر.</div>`;
  } else if (tb.cur === 'bs') {
    const r = E.balanceSheet({ asOf: p.to });
    body = `<div class="grid g2"><table class="t"><tbody>${row('الأصول الثابتة', null, 'sec')}${r.fixed.map(x => row(accName(x.code), x.amount, '', 1)).join('')}${row('(−) مجمع الإهلاك', -r.dep, '', 1)}${row('صافي الأصول الثابتة', r.fixedNet, 'tot')}
      ${row('الأصول المتداولة', null, 'sec')}${r.current.map(x => row(accName(x.code), x.amount, '', 1)).join('')}${row('إجمالي الأصول المتداولة', r.currentT, 'tot')}<tr class="tot"><td style="font-size:16px">إجمالي الأصول</td><td class="n" style="font-size:16px">${fm(r.assets)}</td></tr></tbody></table>
      <table class="t"><tbody>${row('الخصوم المتداولة', null, 'sec')}${r.liab.map(x => row(accName(x.code), x.amount, '', 1)).join('')}${row('إجمالي الخصوم', r.liabT, 'tot')}
      ${row('حقوق الملكية', null, 'sec')}${r.equity.map(x => row(accName(x.code), x.amount, '', 1)).join('')}${row('ربح (خسارة) الفترة الحالية', r.earnings, '', 1)}${row('إجمالي حقوق الملكية', r.equityT, 'tot')}
      <tr class="tot"><td style="font-size:16px">إجمالي الخصوم وحقوق الملكية</td><td class="n" style="font-size:16px">${fm(r.liabT + r.equityT)}</td></tr></tbody></table></div>
      <div class="note ${r.balanced ? 'ok' : 'bad'}" style="margin-top:12px">${r.balanced ? '✓ الميزانية متوازنة: الأصول = الخصوم + حقوق الملكية' : '✗ فرق ' + fm(r.diff)} · لحد ${df(p.to)}</div>`;
  } else if (tb.cur === 'ma') {
    const r = E.manufacturingAccount(p);
    body = `<table class="t"><tbody>${row('الخامات (لحوم وتوابل)', null, 'sec')}${row('رصيد أول المدة', r.rawOpen, '', 1)}${row('(+) المشتريات', r.rawPurch, '', 1)}${row('(−) الهالك والتالف', r.rawLost, '', 1)}${row('(−) رصيد آخر المدة', r.rawClose, '', 1)}${row('الخامات المستخدمة في الإنتاج', r.rawUsed, 'tot')}
      ${row('مواد التعبئة', null, 'sec')}${row('رصيد أول المدة', r.packOpen, '', 1)}${row('(+) المشتريات', r.packPurch, '', 1)}${row('(−) الهالك والتالف', r.packLost, '', 1)}${row('(−) رصيد آخر المدة', r.packClose, '', 1)}${row('مواد التعبئة المستخدمة', r.packUsed, 'tot')}
      ${row('(+) إنتاج تحت التشغيل أول المدة', r.wipOpen, '', 1)}${row('(−) إنتاج تحت التشغيل آخر المدة', r.wipClose, '', 1)}${row('تكلفة الإنتاج التام', r.production, 'tot')}
      ${row('المتاجرة', null, 'sec')}${row('(+) مخزون منتج تام أول المدة', r.fgOpen, '', 1)}${row('(−) هالك منتج تام', r.fgLost, '', 1)}${row('(−) مخزون منتج تام آخر المدة', r.fgClose, '', 1)}${row('تكلفة المبيعات', r.cogs, 'tot')}
      ${row('صافي المبيعات', r.revenue, '', 1)}<tr class="tot"><td style="font-size:16px">مجمل الربح</td><td class="n" style="font-size:16px">${fm(r.gross)}</td></tr></tbody></table>
      <div class="note ${r.check ? 'ok' : 'bad'}" style="margin-top:12px">${r.check ? '✓ تكلفة الإنتاج وتكلفة المبيعات المحسوبة هنا = المسجلة في القيود بالظبط' : '✗ فيه فرق بين الحساب والقيود'}</div>`;
  } else if (tb.cur === 'tb') {
    const r = E.trialBalance(p);
    body = `<div class="tw"><table class="t"><thead><tr><th>الحساب</th><th class="n">أول المدة مدين</th><th class="n">أول المدة دائن</th><th class="n">حركة مدين</th><th class="n">حركة دائن</th><th class="n">آخر المدة مدين</th><th class="n">آخر المدة دائن</th></tr></thead><tbody>
      ${r.rows.map(x => `<tr><td><span class="mono">${x.code}</span> ${esc(x.name)}</td>${['openDr', 'openCr', 'dr', 'cr', 'endDr', 'endCr'].map(k => `<td class="n">${x[k] ? fm(x[k]) : ''}</td>`).join('')}</tr>`).join('')}
      <tr class="tot"><td>الإجمالي</td>${['openDr', 'openCr', 'dr', 'cr', 'endDr', 'endCr'].map(k => `<td class="n">${fm(r.totals[k])}</td>`).join('')}</tr></tbody></table></div>
      <div class="note ${r.totals.endDr === r.totals.endCr && r.totals.dr === r.totals.cr ? 'ok' : 'bad'}" style="margin-top:12px">${r.totals.endDr === r.totals.endCr ? '✓ الميزان متوازن' : '✗ الميزان مش متوازن'}</div>`;
  } else {
    const c = E.integrity();
    body = `<div class="list">${c.map(x => `<div class="li"><span class="pill ${x.ok ? 'ok' : 'bad'}">${x.ok ? '✓ سليم' : '✗ فرق'}</span><div class="x"><b>${esc(x.name)}</b>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</div></div>`).join('')}</div>
      <div class="crumb" style="margin-top:8px">الفحص ده بيتعمل على كل البيانات في كل مرة: بيطابق دفتر الأستاذ مع المخازن والتشغيلات وكشوف حساب العملاء والموردين.</div>`;
  }
  page('القوائم المالية', `<div class="bar">${tb.html}</div>${tb.cur !== 'chk' ? `<div class="bar">${periodBar('rp', p.k)}<span class="crumb">${tb.cur === 'bs' ? 'لحد ' + df(p.to) : 'من ' + df(p.from) + ' لحد ' + df(p.to)}</span><span class="grow"></span><button class="btn" data-act="print">${ic('print')} طباعة</button></div>` : ''}<div class="card"><div class="bd">${body}</div></div>`);
};

/* ========== ADMIN ========== */
PAGES.audit = () => {
  const s = S(), uf = U.FILTER.au || '';
  const rows = s.audit.filter(a => (!uf || a.user === uf) && match('aq', a.text, a.ref)).slice().reverse();
  page('سجل الحركات', `<div class="note info">كل حركة في السيستم متسجلة باسم اللي عملها ووقتها، ومحدش يقدر يمسحها.</div>
    <div class="bar"><select class="f" id="au-u" style="width:auto"><option value="">كل المستخدمين</option>${s.users.map(u => `<option value="${u.id}" ${uf === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>${searchBox('aq', 'ابحث')}</div>
    <div class="card"><div class="bd">${table('au', [{ t: 'الوقت', f: a => tf(a.at) }, { t: 'المستخدم', f: a => `<b>${esc(E.userName(a.user))}</b>` }, { t: 'المرجع', f: a => `<span class="mono">${esc(a.ref || '')}</span>` }, { t: 'الحركة', f: a => tx(a.text) }], rows)}</div></div>`);
  document.getElementById('au-u').onchange = e => { U.FILTER.au = e.target.value; U.render(); };
};
PAGES.users = () => {
  const s = S(), live = U.LIVE;
  const ACC = { home: U.ALL, batches: ['owner', 'supervisor', 'accountant'], worker: ['owner', 'supervisor', 'worker'], cutting: ['owner', 'supervisor', 'storekeeper', 'accountant'], stock: ['owner', 'storekeeper', 'supervisor', 'accountant', 'sales'], purchases: ['owner', 'storekeeper', 'accountant'], invoices: ['owner', 'sales', 'accountant'], customers: ['owner', 'sales', 'accountant'], items: ['owner', 'storekeeper', 'sales', 'accountant', 'supervisor'], treasury: ['owner', 'accountant'], reports: ['owner', 'accountant'], opening: ['owner', 'accountant'], audit: ['owner', 'accountant'], settings: ['owner'] };
  const pages = [['home', 'نظرة عامة'], ['batches', 'التشغيلات'], ['worker', 'شاشة العامل'], ['cutting', 'التقطيع'], ['stock', 'المخزون'], ['purchases', 'المشتريات'], ['invoices', 'الفواتير'], ['customers', 'العملاء'], ['items', 'الأصناف'], ['treasury', 'الخزنة'], ['reports', 'القوائم المالية'], ['opening', 'أرصدة البداية'], ['audit', 'سجل الحركات'], ['settings', 'الإعدادات']];
  const cols = [{ t: 'الاسم', f: u => `<span style="display:inline-flex;gap:10px;align-items:center">${U.avatar(u, 'av-sm')}<b>${esc(u.name)}</b></span>` }, { t: 'اسم الدخول', f: u => `<span class="mono">${esc(u.username || '—')}</span>` }, { t: 'الدور', f: u => E.ROLES[u.role].name }, { t: 'الحالة', f: u => u.active === false ? '<span class="pill bad">موقوف</span>' : '<span class="pill ok">شغال</span>' }];
  cols.push({ t: '', f: u => live ? (u.id === s.currentUser ? `<span class="pill red">حسابك</span> <button class="btn sm" data-act="usr-pw" data-arg="${u.id}">غيّر الباسورد</button>` : `<button class="btn sm" data-act="usr-edit" data-arg="${u.id}">تعديل</button> <button class="btn sm" data-act="usr-pw" data-arg="${u.id}">باسورد جديد</button>`) : (u.id === s.currentUser ? '<span class="pill red">الحساب الحالي</span>' : `<button class="btn sm" data-act="as-user" data-arg="${u.id}">جرّب كـ ${esc(u.name)}</button>`) });
  if (live) setTimeout(loadRequests);
  page('المستخدمين والصلاحيات', `${live ? '<div id="req-box"></div>' : ''}<div class="card"><div class="hd"><h3>المستخدمين</h3><span class="sub">${live ? 'كل واحد يدخل باسم المستخدم والباسورد بتوعه' : 'في نسخة التدريب جرّب أي حساب من "جرّب كـ" فوق'}</span>${live ? `<div class="tools"><button class="btn p" data-act="usr-new">${ic('plus')} مستخدم جديد</button></div>` : ''}</div><div class="bd">${table('us', cols, s.users)}</div></div>
    <div class="card"><div class="hd"><h3>مين يشوف إيه</h3></div><div class="bd"><div class="tw"><table class="t"><thead><tr><th>الشاشة</th>${Object.values(E.ROLES).map(r => `<th>${r.name}</th>`).join('')}</tr></thead><tbody>${pages.map(([k, n]) => `<tr><td>${n}</td>${Object.keys(E.ROLES).map(r => `<td>${ACC[k].includes(r) ? '<span class="pill ok">✓</span>' : '<span style="color:var(--muted)">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <ul class="crumb" style="margin:10px 0 0;padding-inline-start:18px"><li>العامل بيصرف بس، ومينفعش يعدّل بعد التأكيد. التصحيح بطلب، والمالك بس اللي يوافق.</li><li>تعديل الأسعار والأصناف والإعدادات والمستخدمين للمالك بس.</li><li>المشرف والعامل والمبيعات مش بيشوفوا التكاليف والأرباح في الشاشات.</li></ul></div></div>`);
};
async function loadRequests() {
  const box = document.getElementById('req-box'); if (!box) return;
  const { data } = await U.sb().from('profiles').select('*').eq('role', 'pending').order('created_at');
  if (!document.getElementById('req-box')) return;
  if (!data || !data.length) { box.innerHTML = ''; return; }
  const roleSel = id => `<select class="f" id="rr-${id}" style="width:auto;min-width:170px">${roleChoices('sales')}</select>`;
  box.innerHTML = `<div class="card" style="border-color:var(--red)"><div class="hd"><h3>طلبات الحسابات</h3><span class="sub">${data.length} طلب · اختار الصلاحية ودوس قبول</span></div><div class="bd"><div class="list">${data.map(p => `<div class="li" style="flex-wrap:wrap;gap:10px"><div class="x" style="min-width:180px"><b>${esc(p.name)}</b> <span class="mono">${esc(p.username)}</span><small>${esc(p.phone || '')} · ${p.active ? '<span class="pill warn">اتقبل ومستني صلاحية</span>' : '<span class="pill info">طلب جديد</span>'}</small></div>${roleSel(p.user_id)}<button class="btn sm p" data-act="rq-ok" data-arg="${p.user_id}">${p.active ? 'حدد الصلاحية' : 'قبول بالصلاحية دي'}</button>${p.active ? '' : `<button class="btn sm dan" data-act="rq-no" data-arg="${p.user_id}">رفض</button>`}</div>`).join('')}</div></div></div>`;
}
const approveReq = id => run(async () => { await U.api('approveRequest', { id, role: val('rr-' + id) }); await reloadLive(); await U.countRequests(); }, 'اتقبل واتحددت الصلاحية');
ACTS['rq-ok'] = id => { if (val('rr-' + id) !== 'owner') return approveReq(id); const role = val('rr-' + id);
  modal('صلاحية أدمن', '<div class="note bad">الأدمن بيشوف ويعدّل <b>كل حاجة</b>: الأسعار، والحسابات، والمستخدمين، والإعدادات، وتصفير الحسابات. اديها لحد واثق فيه بس.</div>', { saveText: 'أيوه، اديله أدمن', save: async () => { await U.api('approveRequest', { id, role }); await reloadLive(); await U.countRequests(); toast('اتقبل كأدمن', 'ok'); } }); };
ACTS['rq-no'] = id => modal('رفض الطلب', '<div class="note bad">الحساب هيتمسح، ولو حب يطلب تاني يقدر.</div>', { saveText: 'رفض', save: async () => { await U.api('rejectRequest', { id }); await reloadLive(); await U.countRequests(); toast('اترفض الطلب', 'ok'); } });
ACTS['as-user'] = id => { E.setUser(id); toast('دخلت كـ ' + E.me().name); location.hash = '#' + (E.me().role === 'worker' ? 'worker' : 'home'); U.render(); };
// every assignable role; "pending" is a state, not a choice
function roleChoices(sel) { return Object.entries(E.ROLES).filter(([k]) => k !== 'pending').map(([k, r]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${k === 'owner' ? 'أدمن · كل الصلاحيات' : r.name}</option>`).join(''); }
const roleOpts = sel => roleChoices(sel);
ACTS['usr-new'] = () => modal('مستخدم جديد', `<div class="fgrid"><label class="fld"><span>الاسم</span><input class="f" id="un-n"></label><label class="fld"><span>اسم الدخول (إنجليزي صغير)</span><input class="f" id="un-u" dir="ltr" autocomplete="off" placeholder="mahmoud"></label>
  <label class="fld"><span>الدور</span><select class="f" id="un-r">${roleOpts('worker')}</select></label><label class="fld"><span>الباسورد (٨ حروف على الأقل)</span><input class="f" id="un-p" dir="ltr" autocomplete="new-password" value="${genPw()}"></label></div>
  <div class="note info">ادّي الموظف اسم الدخول والباسورد. وتقدر تغيّر الباسورد بعدين من هنا.</div>`, { saveText: 'إنشاء الحساب', save: async () => { await U.api('createUser', { username: val('un-u').trim().toLowerCase(), name: val('un-n'), role: val('un-r'), password: val('un-p') }); await reloadLive(); toast('اتعمل الحساب', 'ok'); } });
ACTS['usr-edit'] = id => { const u = S().users.find(x => x.id === id); modal('تعديل ' + esc(u.name), `<div class="fgrid"><label class="fld"><span>الاسم</span><input class="f" id="ue-n" value="${esc(u.name)}"></label><label class="fld"><span>الدور</span><select class="f" id="ue-r">${roleOpts(u.role)}</select></label>
  <label class="fld"><span>الحالة</span><select class="f" id="ue-a"><option value="1" ${u.active !== false ? 'selected' : ''}>شغال</option><option value="0" ${u.active === false ? 'selected' : ''}>موقوف (مش هيقدر يدخل)</option></select></label></div>`,
  { save: async () => { await U.api('updateUser', { id, name: val('ue-n'), role: val('ue-r'), active: val('ue-a') === '1' }); await reloadLive(); toast('اتحفظ', 'ok'); } }); };
ACTS['usr-pw'] = id => { const u = S().users.find(x => x.id === id); modal('باسورد جديد لـ ' + esc(u.name), `<label class="fld"><span>الباسورد الجديد</span><input class="f" id="up-p" dir="ltr" value="${genPw()}"></label><div class="note">انسخ الباسورد وادّيه للموظف قبل ما تحفظ.</div>`,
  { save: async () => { await U.api('resetPassword', { id, password: val('up-p') }); toast('اتغير الباسورد', 'ok'); } }); };
function genPw() { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let p = ''; const a = new Uint32Array(10); crypto.getRandomValues(a); a.forEach(x => { p += c[x % c.length]; }); return p.slice(0, 4) + '-' + p.slice(4, 8) + p.slice(8); }
async function reloadLive() { const { data } = await U.sb().from('erp_state').select('version,state').eq('id', 1).single(); E.setState(data.state); E.S.currentUser = U.profile().user_id; }
PAGES.settings = () => {
  const st = S().settings, co = st.company;
  page('الإعدادات', `<div class="card"><div class="hd"><h3>بيانات الشركة (بتظهر على الفاتورة)</h3></div><div class="bd"><div class="fgrid">
      <label class="fld"><span>الاسم</span><input class="f" id="st-n" value="${esc(co.name)}"></label><label class="fld"><span>العنوان</span><input class="f" id="st-a" value="${esc(co.address)}"></label>
      <label class="fld"><span>التليفون</span><input class="f" id="st-p" value="${esc(co.phone)}" dir="ltr"></label><label class="fld"><span>رقم التسجيل الضريبي</span><input class="f" id="st-t" value="${esc(co.taxId)}" dir="ltr"></label></div></div></div>
    <div class="card"><div class="hd"><h3>التشغيل</h3></div><div class="bd"><div class="fgrid">
      <label class="fld"><span>حد التنبيه للصرف (كجم لكل صنف في التشغيلة)</span><input class="f" id="st-l" type="number" min="1" step="1" value="${st.issueLimitKg}"></label>
      <label class="fld"><span>ضريبة القيمة المضافة على المبيعات %</span><input class="f" id="st-v" type="number" min="0" max="100" step="1" value="${st.vatRate}"></label></div>
      <div class="crumb" style="margin-top:6px">نسبة الضريبة ١٤٪ افتراضية، والمحاسب يأكدها لكل صنف.</div></div></div>
    <div class="card"><div class="hd"><h3>تنبيهات تليجرام</h3></div><div class="bd" style="display:flex;flex-direction:column;gap:12px">
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="st-tg" ${st.telegram ? 'checked' : ''}> ابعت التنبيهات على تليجرام</label>
      <div class="fgrid"><label class="fld"><span>توكن البوت (من BotFather)</span><input class="f" id="st-tk" value="${U.LIVE ? '' : esc(st.tgToken)}" placeholder="${U.LIVE ? 'متخزن على السيرفر، اكتب توكن جديد لو عايز تغيّره' : ''}" dir="ltr" autocomplete="off"></label><label class="fld"><span>رقم الشات أو الجروب (chat id)</span><input class="f" id="st-ch" value="${esc(st.tgChat)}" dir="ltr"></label></div>
      ${U.LIVE ? `<div class="note ${st.tgChat ? 'ok' : 'info'}">${st.tgChat ? '✓ تليجرام متوصل بحساب المالك.' : 'تليجرام لسه مش متوصل.'} دوس "اربط تليجرام" وافتح البوت من الموبايل اللي عليه تليجرام بتاعك، وبعدين دوس Start.</div><div class="bar"><button class="btn p" data-act="tg-link">${st.tgChat ? 'اربط حساب تاني' : 'اربط تليجرام'}</button></div>` : ''}
      ${U.LIVE ? `<div class="tgv"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>متابعين تليجرام</b><div class="crumb">بيوصلهم نفس التنبيهات ويسألوا البوت، بس مبيوافقوش على حاجة.</div></div><button class="btn" data-act="tgv-add">${ic('plus')} ضيف متابع</button></div><div id="tgv-box" class="crumb" style="margin-top:8px">جاري التحميل…</div></div>` : ''}
      <div class="bar"><button class="btn" data-act="tg-test">${ic('send')} إرسال رسالة تجربة</button><span class="crumb">بيتبعت: تجاوز حد الصرف، طلبات التصحيح، الأصناف اللي قربت تخلص، والصلاحيات.</span></div>
      <div class="note">${U.LIVE ? 'التوكن بيتحفظ على السيرفر بس، ومحدش يقدر يشوفه من الشاشات.' : 'في نسخة التدريب التوكن بيتحفظ على الجهاز ده بس.'}</div></div></div>
    <div class="bar"><button class="btn p lg" data-act="st-save">حفظ الإعدادات</button></div>
    <div class="card"><div class="hd"><h3>بدء التشغيل الفعلي</h3></div><div class="bd" style="display:flex;flex-direction:column;gap:10px">
      <div class="note bad">بعد ما تخلصوا تجربة: الزرار ده بيمسح <b>كل الحركات</b> (القيود، الفواتير، التشغيلات، المخزون، أرصدة البداية) ويرجّع الحسابات صفر. الأصناف والأسعار والوصفات والعملاء والموردين والمستخدمين بيفضلوا زي ما هم. والسيرفر بيحتفظ بنسخة من اللي قبل التصفير.</div>
      <div><button class="btn dan" data-act="st-golive">تصفير الحسابات وبدء التشغيل</button></div></div></div>
    <div class="card"><div class="hd"><h3>البيانات</h3></div><div class="bd bar"><button class="btn" data-act="st-export">تنزيل نسخة احتياطية (JSON)</button>${U.LIVE ? '<span class="crumb">السيرفر كمان بيحفظ نسخة كاملة كل يوم تلقائي.</span>' : '<button class="btn dan" data-act="st-reset">إعادة البيانات التجريبية من الأول</button>'}</div></div>`);
  if (U.LIVE) setTimeout(loadViewers);
};
ACTS['st-save'] = () => run(async () => {
  const tk = val('st-tk').trim();
  if (U.LIVE && tk) await U.api('setTelegramToken', { token: tk });
  return E.updateSettings({ issueLimitKg: toI(val('st-l')), vatRate: toI(val('st-v')), telegram: document.getElementById('st-tg').checked, tgToken: U.LIVE ? '' : tk, tgChat: val('st-ch'), company: { name: val('st-n'), address: val('st-a'), phone: val('st-p'), taxId: val('st-t') } });
}, 'اتحفظت الإعدادات');
ACTS['tg-test'] = async () => { try { if (U.LIVE) { const tk = val('st-tk').trim(); if (tk) await U.api('setTelegramToken', { token: tk }); await U.api('testTelegram', { chat: val('st-ch').trim() }); } else await U.testTelegram(val('st-tk').trim(), val('st-ch').trim()); toast('وصلت رسالة التجربة ✓', 'ok'); } catch (e) { toast('تليجرام: ' + e.message, 'bad'); } };
ACTS['tg-link'] = async () => {
  try {
    const r = await U.api('tgLinkCode', {}); const link = `https://t.me/${r.result.bot}?start=${r.result.code}`;
    modal('ربط تليجرام', `<div class="note info">افتح اللينك ده من الموبايل اللي عليه تليجرام بتاعك، ودوس <b>Start</b>. الكود صالح ١٥ دقيقة ولمرة واحدة.</div><a class="btn p lg" style="justify-content:center" href="${link}" target="_blank" rel="noopener">فتح البوت @${esc(r.result.bot)}</a><div class="crumb" style="text-align:center">ولو بتفتح من الكمبيوتر: ابعت للبوت <span class="mono">/start ${esc(r.result.code)}</span></div>`, { foot: '<button class="btn" data-act="tg-check">خلصت</button>' });
  } catch (e) { toast(e.message, 'bad'); }
};
async function loadViewers() {
  const box = document.getElementById('tgv-box'); if (!box) return;
  try {
    const r = await U.api('tgViewers', {}); const list = r.result || [];
    if (!document.getElementById('tgv-box')) return;
    box.innerHTML = list.length ? `<div class="list">${list.map(v => `<div class="li"><div class="x"><b>${esc(v.name)}</b><small>متابع من ${esc(String(v.at || '').slice(0, 10))}</small></div><button class="btn sm dan" data-act="tgv-rm" data-arg="${esc(v.chat)}">شيله</button></div>`).join('')}</div>` : 'مفيش متابعين لسه.';
  } catch (e) { box.textContent = e.message; }
}
ACTS['tgv-add'] = async () => {
  try {
    const r = await U.api('tgViewerLink', {}); const link = r.result.link;
    const msg = `ده لينك متابعة تنبيهات بوم ميت على تليجرام. افتحه ودوس Start:\n${link}`;
    modal('ضيف متابع', `<div class="note info">ابعت اللينك ده للشخص، يفتحه من تليجرام ويدوس <b>Start</b>. اللينك لمرة واحدة وصالح ٢٤ ساعة.</div>
      <input class="f mono" id="tgv-link" value="${esc(link)}" readonly dir="ltr" style="text-align:left">
      <div class="bar" style="justify-content:center"><a class="btn p" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${ic('send')} ابعته على واتساب</a><button class="btn" data-act="tgv-copy">انسخ اللينك</button></div>
      <div class="crumb" style="text-align:center">أول ما يدوس Start، هيوصلك على تليجرام إنه بقى متابع ومعاها زرار «شيله».</div>`, { foot: '<button class="btn" data-act="tgv-done">خلصت</button>' });
  } catch (e) { toast(e.message, 'bad'); }
};
ACTS['tgv-copy'] = async () => { const i = document.getElementById('tgv-link'); try { await navigator.clipboard.writeText(i.value); } catch (e) { i.select(); document.execCommand('copy'); } toast('اتنسخ اللينك', 'ok'); };
ACTS['tgv-done'] = () => { U.closeModal(); loadViewers(); };
ACTS['tgv-rm'] = chat => modal('شيل المتابع', '<div class="note bad">مش هيوصله تنبيهات تاني، والبوت هيبطل يرد عليه.</div>', { saveText: 'شيله', save: async () => { await U.api('tgViewerRemove', { chat }); toast('اتشال', 'ok'); setTimeout(loadViewers); } });
ACTS['tg-check'] = async () => { await reloadLive(); U.closeModal(); U.render(); toast(S().settings.tgChat ? 'تليجرام اتوصل ✓' : 'لسه مااتوصلش، دوس Start في البوت', S().settings.tgChat ? 'ok' : 'bad'); };
ACTS['st-golive'] = () => modal('تصفير الحسابات', `<div class="note bad">هيتمسح ${S().journal.length} قيد و${S().docs.invoices.length} فاتورة و${S().docs.batches.length} تشغيلة وكل أرصدة المخزون. اكتب كلمة <b>تصفير</b> عشان تأكد.</div><input class="f" id="gl-c" autocomplete="off">`,
  { saveText: 'صفّر الحسابات', save: async () => { if (val('gl-c').trim() !== 'تصفير') throw new Error('اكتب كلمة تصفير بالظبط'); await E.resetBooks(); toast('الحسابات اتصفرت، ابدأ بأرصدة البداية', 'ok'); setTimeout(() => U.go('opening')); } });
ACTS['st-export'] = () => { const b = new Blob([E.exportJSON()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `boom-erp-${E.today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
ACTS['st-reset'] = () => modal('إعادة البيانات التجريبية', '<div class="note bad">كل العمليات اللي اتسجلت هتتمسح، والسيستم هيرجع للبيانات التجريبية من الأول.</div>', { saveText: 'أيوه، رجّعها', save: async () => { await E.reset(); toast('البيانات رجعت من الأول', 'ok'); } });
})();
