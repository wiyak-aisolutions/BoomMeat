/* Boom Meat ERP — UI core: helpers, layout, router, modals, charts, Telegram */
(function () {
'use strict';
const E = window.ERP;
const S = () => E.S;

/* ---------- format ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tx = s => esc(s).replace(/([A-Z]{1,4}-[0-9A-Z]+(?:-[0-9A-Z]+)*)/g, '<bdi class="mono">$1</bdi>');
const fm = p => (p / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fm0 = p => Math.round(p / 100).toLocaleString('en-US');
const kgf = g => (g / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 });
const qtyf = (q, unit) => unit === 'kg' ? `${kgf(q)} كجم` : `${q.toLocaleString('en-US')} قطعة`;
const pct = (a, b) => b ? (a / b * 100).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%' : '—';
/* ---------- language ---------- */
let LANG = 'ar'; try { LANG = localStorage.getItem('boom-lang') === 'en' ? 'en' : 'ar'; } catch (e) { /* ignore */ }
const loc = () => (LANG === 'en' ? 'en-GB' : 'ar-EG-u-nu-latn');
const df = d => d ? new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'short' }).format(new Date(d.slice(0, 10) + 'T12:00:00')) : '—';
const dfl = d => new Intl.DateTimeFormat(loc(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d + 'T12:00:00'));
let TR_RE = null, TR_MAP = null;
function trText(t) {
  if (LANG !== 'en' || !t || !/[\u0600-\u06FF]/.test(t)) return t;
  if (!TR_RE) {
    TR_MAP = window.BOOM_EN || {};
    if (!Object.keys(TR_MAP).length) { TR_RE = /(?!)/; return t; } // dictionary missing: never loop on an empty pattern
    const keys = Object.keys(TR_MAP).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    TR_RE = new RegExp(`(?<![\\u0621-\\u064A])(?:${keys.join('|')})(?![\\u0621-\\u064A])`, 'g');
  }
  const trimmed = t.trim();
  if (TR_MAP[trimmed]) return t.replace(trimmed, TR_MAP[trimmed]);
  return t.replace(TR_RE, m => (m && TR_MAP[m] !== undefined ? TR_MAP[m] : m));
}
function trNode(root) {
  if (LANG !== 'en' || !root) return;
  if (root.nodeType === 3) { const n = trText(root.nodeValue); if (n !== root.nodeValue) root.nodeValue = n; return; }
  if (root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach(n => { const v = trText(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; });
  [root, ...root.querySelectorAll('[placeholder],[title],[aria-label],input[disabled]')].forEach(el => {
    if (!el.getAttribute) return;
    for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); if (v && /[\u0600-\u06FF]/.test(v)) el.setAttribute(a, trText(v)); }
    if (el.matches && el.matches('input[disabled]') && /[\u0600-\u06FF]/.test(el.value)) el.value = trText(el.value);
  });
}
function applyLang() {
  document.documentElement.lang = LANG; document.documentElement.dir = LANG === 'en' ? 'ltr' : 'rtl';
  document.title = LANG === 'en' ? 'Boom Meat · Operations' : 'بوم ميت · لوحة التشغيل';
}
new MutationObserver(muts => { if (LANG !== 'en') return; for (const m of muts) { if (m.type === 'characterData') trNode(m.target); else m.addedNodes.forEach(trNode); } })
  .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
applyLang();
const tf = at => at ? `<span style="white-space:nowrap">${df(at)} · ${at.slice(11, 16)}</span>` : '—';
const packName = s => ({ 250: '¼ كيلو', 500: '½ كيلو', 1000: '1 كيلو', 1500: '1.5 كيلو', 2000: '2 كيلو', 2500: '2.5 كيلو' })[s] || (s / 1000 + ' كجم');
const toG = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 1000) : NaN; };
const toP = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const toI = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : NaN; };
const role = () => E.me().role;
const canCost = () => E.ROLES[role()].cost;
const isOwner = () => role() === 'owner';
const accName = c => (E.ACCOUNTS.find(a => a.code === c) || {}).name || c;
const initials = n => (n || '؟').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');

/* ---------- icons ---------- */
const P = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', flow: 'M4 6h6v4H4zM14 14h6v4h-6zM7 10v4h10M17 10V6h-3',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0', batch: 'M4 7h16M4 7l2 13h12l2-13M9 7V4h6v3',
  hand: 'M7 11V5a2 2 0 0 1 4 0v5m0-1V4a2 2 0 0 1 4 0v6m0-2a2 2 0 0 1 4 0v6a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3l-3-5a2 2 0 0 1 3-2l2 2',
  knife: 'M3 21l9-9M14 4l6 6-8 8-6-6z', box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10', truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-.1M17 19a2 2 0 1 0 0-.1',
  users: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M2 21v-2a4 4 0 0 1 3-3.9', bill: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01', cash: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 9v.01M18 15v.01', receipt: 'M5 3h14v18l-7-3-7 3z',
  book: 'M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM18 20H7', tree: 'M5 4h5v4H5zM14 10h5v4h-5zM14 17h5v4h-5zM7.5 8v11H14M7.5 12H14', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  log: 'M12 8v4l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0 0 19 12',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10', sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4', menu: 'M3 6h18M3 12h18M3 18h18', x: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14', lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z', download: 'M12 3v12M7 10l5 5 5-5M4 19h16', check: 'M5 12l5 5 9-10', send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
};
const ic = n => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || ''}"/></svg>`;

/* ---------- pages registry ---------- */
const ALL = ['owner', 'accountant', 'storekeeper', 'supervisor', 'sales'];
const PAGES = {};
const NAV = [
  ['', [['home', 'نظرة عامة', 'home', ALL], ['alerts', 'التنبيهات', 'bell', ALL]]],
  ['الإنتاج والمخازن', [['batches', 'التشغيلات', 'batch', ['owner', 'supervisor', 'accountant']], ['worker', 'شاشة العامل', 'hand', ['owner', 'supervisor', 'worker']], ['cutting', 'التقطيع', 'knife', ['owner', 'supervisor', 'storekeeper', 'accountant']], ['stock', 'المخزون والدفعات', 'box', ['owner', 'storekeeper', 'supervisor', 'accountant', 'sales']]]],
  ['المشتريات', [['purchases', 'الاستلام والمشتريات', 'truck', ['owner', 'storekeeper', 'accountant']], ['suppliers', 'الموردين', 'users', ['owner', 'storekeeper', 'accountant']]]],
  ['المبيعات', [['invoices', 'الفواتير', 'bill', ['owner', 'sales', 'accountant']], ['customers', 'العملاء', 'users', ['owner', 'sales', 'accountant']], ['items', 'الأصناف والأسعار', 'tag', ['owner', 'storekeeper', 'sales', 'accountant', 'supervisor']]]],
  ['الحسابات', [['treasury', 'الخزنة والبنوك', 'cash', ['owner', 'accountant']], ['expenses', 'المصروفات والإهلاك', 'receipt', ['owner', 'accountant']], ['journal', 'القيود اليومية', 'book', ['owner', 'accountant']], ['coa', 'دليل الحسابات', 'tree', ['owner', 'accountant']], ['reports', 'القوائم المالية', 'chart', ['owner', 'accountant']], ['opening', 'أرصدة البداية', 'book', ['owner', 'accountant']]]],
  ['الإدارة', [['flow', 'مسار البضاعة', 'flow', ALL], ['audit', 'سجل الحركات', 'log', ['owner', 'accountant']], ['users', 'المستخدمين والصلاحيات', 'shield', ['owner']], ['settings', 'الإعدادات', 'gear', ['owner']]]],
];
const ACCESS = {}; NAV.forEach(([, items]) => items.forEach(([id, t, , roles]) => { ACCESS[id] = { t, roles }; }));
const DETAIL_PARENT = { batch: 'batches', invoice: 'invoices', customer: 'customers', supplier: 'suppliers', purchase: 'purchases', newinvoice: 'invoices' };
const QUICK = [
  ['b-new', 'تشغيلة جديدة', 'افتح تشغيلة برقم', 'batch', ['owner', 'supervisor']],
  ['go:worker', 'صرف خامات', 'من التابلت على تشغيلة', 'hand', ['owner', 'supervisor', 'worker']],
  ['po-new', 'استلام بضاعة', 'من مورد بالباركود', 'truck', ['owner', 'storekeeper']],
  ['cut-new', 'عملية تقطيع', 'دفعة بالعضم لقطعيات', 'knife', ['owner', 'supervisor', 'storekeeper']],
  ['go:newinvoice', 'فاتورة جديدة', 'بيع لعميل', 'bill', ['owner', 'sales', 'accountant']],
  ['rc-pick', 'تحصيل', 'فلوس من عميل', 'cash', ['owner', 'accountant', 'sales']],
  ['ex-new', 'مصروف', 'كهربا، مرتبات، إيجار', 'receipt', ['owner', 'accountant']],
];
const BNAV = {
  owner: [['home', 'الرئيسية', 'home'], ['batches', 'التشغيلات', 'batch'], ['stock', 'المخزون', 'box'], ['invoices', 'الفواتير', 'bill']],
  accountant: [['home', 'الرئيسية', 'home'], ['invoices', 'الفواتير', 'bill'], ['treasury', 'الخزنة', 'cash'], ['reports', 'القوائم', 'chart']],
  storekeeper: [['home', 'الرئيسية', 'home'], ['stock', 'المخزون', 'box'], ['purchases', 'الاستلام', 'truck'], ['suppliers', 'الموردين', 'users']],
  supervisor: [['home', 'الرئيسية', 'home'], ['batches', 'التشغيلات', 'batch'], ['worker', 'الصرف', 'hand'], ['stock', 'المخزون', 'box']],
  sales: [['home', 'الرئيسية', 'home'], ['newinvoice', 'فاتورة', 'plus'], ['invoices', 'الفواتير', 'bill'], ['customers', 'العملاء', 'users']],
  worker: [],
};
function renderBnav() {
  const items = BNAV[role()] || [];
  const app = document.getElementById('app');
  let el = document.getElementById('bnav');
  app.classList.toggle('has-bnav', items.length > 0);
  if (!items.length) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('nav'); el.id = 'bnav'; el.className = 'bnav no-print'; el.setAttribute('aria-label', 'التنقل'); document.body.appendChild(el); }
  const cur = DETAIL_PARENT[route.page] || route.page;
  const unread = S().alerts.filter(a => !a.read).length;
  el.innerHTML = items.map(([id, t, icon]) => `<button class="${cur === id || route.page === id ? 'on' : ''}" data-go="${id}" ${cur === id ? 'aria-current="page"' : ''}>${ic(icon)}<span>${t}</span></button>`).join('')
    + `<button data-act="menu" aria-label="كل الشاشات">${ic('menu')}<span>المزيد</span>${unread ? `<span class="b">${unread}</span>` : ''}</button>`;
}
function quickFor() { return QUICK.filter(q => q[4].includes(role())); }
function runQuick(key) { if (key.startsWith('go:')) go(key.slice(3)); else if (ACTS[key]) ACTS[key](); }
function allowed(page) { const base = DETAIL_PARENT[page] || page; const a = ACCESS[base]; return a && a.roles.includes(role()); }
function homeFor() { return role() === 'worker' ? 'worker' : 'home'; }

/* ---------- router ---------- */
let route = { page: 'home', id: null }, lastKey = '';
function parse() { const h = decodeURIComponent(location.hash.replace(/^#/, '')); const [page, id] = h.split('/'); return { page: page || homeFor(), id: id || null }; }
function go(page, id) { const h = '#' + page + (id ? '/' + id : ''); if (location.hash === h) render(); else location.hash = h; }
window.addEventListener('hashchange', () => { route = parse(); render(); });

/* ---------- layout ---------- */
function renderSide() {
  const S_ = S(); const unread = S_.alerts.filter(a => !a.read).length;
  const pend = S_.docs.corrections.filter(c => c.status === 'pending').length;
  const openB = S_.docs.batches.filter(b => b.status === 'open').length;
  const badge = { alerts: unread, batches: openB, users: PENDING_REQ };
  const cur = DETAIL_PARENT[route.page] || route.page;
  let h = `<div class="brand"><img src="boom-logo.png" alt="بوم ميت"></div>`;
  for (const [g, items] of NAV) {
    const vis = items.filter(([id, , , roles]) => roles.includes(role()));
    if (!vis.length) continue;
    if (g) h += `<div class="nav-g">${g}</div>`;
    for (const [id, t, icon] of vis) h += `<button class="nav ${cur === id ? 'on' : ''}" data-go="${id}">${ic(icon)}<span>${t}</span>${badge[id] ? `<span class="b">${badge[id]}</span>` : ''}${id === 'batches' && pend && isOwner() ? `<span class="b" style="background:#fff;color:var(--red);margin-inline-start:4px" title="طلبات تصحيح مستنية موافقة">${pend}</span>` : ''}</button>`;
  }
  if (canCost()) {
    const t = E.today(), inv = S_.docs.invoices, today = inv.filter(v => v.date === t).reduce((a, v) => a + v.net, 0);
    const days = Array.from({ length: 30 }, (_, i) => E.addDays(t, -i - 1)), avg = inv.filter(v => days.includes(v.date)).reduce((a, v) => a + v.net, 0) / 30;
    const p = avg ? today / avg : 0;
    h += `<div class="today-ring" data-go="invoices" role="link" tabindex="0" style="cursor:pointer">${ring(p, { size: 46, sw: 6 })}<div><small>النهارده لحد دلوقتي</small><b>${fm0(today)} ج</b><small>${Math.round(p * 100)}% من متوسط اليوم</small></div></div>`;
  }
  const u = E.me();
  h += `<div class="sp"></div><div class="who"><button class="me-btn" data-act="me" aria-label="حسابي">${avatar(u, 'av')}</button><div><b>${esc(u.name)}</b><small>${E.ROLES[u.role].name}</small></div>${LIVE ? '<button class="out" data-act="logout">خروج</button>' : ''}</div>`;
  document.getElementById('side').innerHTML = h;
}
function renderTop(title, crumb, extra) {
  const unread = S().alerts.filter(a => !a.read).length;
  const users = S().users.map(u => `<option value="${u.id}" ${u.id === S().currentUser ? 'selected' : ''}>${esc(u.name)} · ${E.ROLES[u.role].name}</option>`).join('');
  document.getElementById('top').innerHTML = `
    <button class="icon-btn menu-btn" data-act="menu" aria-label="القائمة">${ic('menu')}</button>
    <div><div class="crumb">${crumb || dfl(E.today())}</div><h1>${title}</h1></div>
    <div class="tools">${extra || ''}
      ${quickFor().length ? `<button class="btn p no-print btn-new" data-act="newmenu" aria-label="جديد">${ic('plus')}<span class="lbl">جديد</span></button>` : ''}
      ${LIVE ? '' : `<label class="no-print" style="display:flex;align-items:center;gap:6px"><span class="crumb" style="white-space:nowrap">جرّب كـ</span>
        <select class="f" id="user-switch" style="height:38px;width:auto;max-width:230px" aria-label="جرّب كمستخدم">${users}</select></label>`}
      ${role() !== 'worker' ? `<button class="icon-btn" data-go="alerts" aria-label="التنبيهات">${ic('bell')}${unread ? `<span class="dot">${unread}</span>` : ''}</button>` : ''}
      <button class="icon-btn lang-btn" data-act="lang" aria-label="${LANG === 'en' ? 'العربية' : 'English'}">${LANG === 'en' ? 'ع' : 'EN'}</button>
      <button class="icon-btn" data-act="theme" aria-label="الوضع الليلي">${ic(isDark() ? 'sun' : 'moon')}</button>
    </div>`;
}
const content = () => document.getElementById('content');
function render() {
  route = parse();
  if (!allowed(route.page) || !PAGES[route.page]) { if (route.page !== homeFor()) { location.replace('#' + homeFor()); return; } }
  document.getElementById('app').classList.remove('nav-open');
  renderSide(); renderBnav();
  try { PAGES[route.page](route.id); addExcelButton(); }
  catch (e) { console.error(e); content().innerHTML = `<div class="note bad">حصل خطأ في عرض الصفحة: ${esc(e.message)}</div>`; }
  const key = route.page + '/' + (route.id || '');
  if (key !== lastKey) window.scrollTo({ top: 0 });
  lastKey = key;
}
function page(title, html, { crumb, tools } = {}) { renderTop(title, crumb, tools); content().innerHTML = html; }

/* ---------- Excel export ---------- */
const NO_XLSX = new Set(['worker', 'invoice', 'newinvoice', 'opening', 'settings', 'flow', 'home']);
function addExcelButton() {
  if (NO_XLSX.has(route.page) || role() === 'worker' || !content().querySelector('table.t')) return;
  const tools = document.querySelector('#top .tools'); if (!tools || tools.querySelector('[data-act="xlsx"]')) return;
  tools.insertAdjacentHTML('afterbegin', `<button class="btn no-print" data-act="xlsx" aria-label="تنزيل Excel">${ic('download')}<span class="lbl">Excel</span></button>`);
}
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = () => ok(window.XLSX); sc.onerror = () => no(new Error('تعذر تحميل أداة Excel، اتأكد من الإنترنت')); document.head.appendChild(sc); });
}
function cellValue(td) {
  const t = (td.innerText || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // numeric cells: drop thousands separators, currency and units, keep the sign
  const n = t.replace(/[,٬]/g, '').replace(/\s*(ج|EGP|كجم|kg|قطعة|pcs|ج\/كجم|\/كجم|\/قطعة)\s*/g, '').replace('%', '').trim();
  if (/^[-−]?\d+(\.\d+)?$/.test(n)) return parseFloat(n.replace('−', '-'));
  return t;
}
function tableRows(table) {
  const rows = [];
  table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr').forEach(tr => {
    const cells = [...tr.children].filter(c => c.tagName === 'TD' || c.tagName === 'TH');
    if (!cells.length || (cells.length === 1 && cells[0].querySelector('table'))) return; // skip nested-detail rows
    const r = []; cells.forEach(c => { r.push(c.tagName === 'TH' ? (c.innerText || '').trim() : cellValue(c)); const span = +c.getAttribute('colspan') || 1; for (let k = 1; k < span; k++) r.push(''); });
    if (r.some(v => v !== '')) rows.push(r);
  });
  return rows;
}
function sheetName(raw, used) {
  let n = String(raw || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Sheet';
  let k = 2, base = n; while (used.has(n)) n = `${base.slice(0, 25)} ${k++}`; used.add(n); return n;
}
async function exportExcel() {
  try {
    const X = await loadXLSX();
    const saved = { ...LIMIT }; Object.keys(LIMIT).forEach(k => { LIMIT[k] = 1e9; }); XLSX_ALL = true;
    PAGES[route.page](route.id); // re-draw with every row
    const wb = X.utils.book_new(); wb.Workbook = { Views: [{ RTL: LANG !== 'en' }] };
    const used = new Set(); const title = (document.querySelector('#top h1') || {}).innerText || route.page;
    if (route.page === 'journal' && window.UI.journalRows) {
      const rows = window.UI.journalRows(); const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = rows[0].map((_, i) => ({ wch: i === 3 ? 48 : 16 })); X.utils.book_append_sheet(wb, ws, sheetName(title, used));
    } else {
      content().querySelectorAll('table.t').forEach(tb => {
        if (tb.parentElement.closest('table')) return; // nested
        const rows = tableRows(tb); if (rows.length < 2) return;
        const card = tb.closest('.card'); const h = card && card.querySelector('.hd h3');
        const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(48, Math.max(10, ...rows.map(r => String(r[i] ?? '').length + 2))) }));
        X.utils.book_append_sheet(wb, ws, sheetName(h ? h.innerText : title, used));
      });
    }
    Object.keys(LIMIT).forEach(k => delete LIMIT[k]); Object.assign(LIMIT, saved); XLSX_ALL = false; render();
    if (!wb.SheetNames.length) { toast('مفيش بيانات تتنزل', 'bad'); return; }
    X.writeFile(wb, `boom-meat-${route.page}${route.id ? '-' + route.id : ''}-${E.today()}.xlsx`);
    toast('نزل ملف Excel ✓', 'ok');
  } catch (err) { XLSX_ALL = false; toast(err.message, 'bad'); }
}
let XLSX_ALL = false;

/* ---------- events ---------- */
const ACTS = {};
ACTS.xlsx = () => exportExcel();
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) { e.preventDefault(); const [p, id] = g.dataset.go.split('/'); go(p, id); return; }
  const a = e.target.closest('[data-act]');
  if (a && ACTS[a.dataset.act]) { e.preventDefault(); ACTS[a.dataset.act](a.dataset.arg, a, e); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'user-switch') { E.setUser(e.target.value); toast('دخلت كـ ' + E.me().name); location.hash = '#' + homeFor(); render(); }
});
ACTS.me = () => {
  const u = E.me(); let pic = u.avatar || '';
  modal('حسابي', `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      <div id="me-pic" class="me-pic">${pic ? `<img src="${esc(pic)}" alt="">` : `<span>${esc(initials(u.name))}</span>`}</div>
      <div style="display:flex;flex-direction:column;gap:8px"><label class="btn" for="me-file">${ic('plus')} صورة</label><input id="me-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
      <button class="btn dan sm" type="button" data-act="me-nopic">شيل الصورة</button></div></div>
    <label class="fld"><span>الاسم اللي بيظهر</span><input class="f" id="me-name" value="${esc(u.name)}" maxlength="40"></label>
    <div class="kv"><div><span>اسم الدخول</span><b class="mono">${esc(u.username || '—')}</b></div><div><span>الصلاحية</span><b>${E.ROLES[u.role] ? E.ROLES[u.role].name : '—'}</b></div></div>`,
  { saveText: 'حفظ', save: async () => { await E.updateSelf({ name: val('me-name'), avatar: pic }); toast('اتحفظ', 'ok'); } });
  const show = () => { document.getElementById('me-pic').innerHTML = pic ? `<img src="${esc(pic)}" alt="">` : `<span>${esc(initials(val('me-name')))}</span>`; };
  ACTS['me-nopic'] = () => { pic = ''; show(); };
  document.getElementById('me-file').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image(); img.onload = () => { // square-crop and shrink to 160px so it stays light
      const c = document.createElement('canvas'); c.width = c.height = 160; const k = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, 160, 160);
      pic = c.toDataURL('image/jpeg', 0.85); show(); URL.revokeObjectURL(img.src);
    }; img.onerror = () => toast('الملف ده مش صورة', 'bad'); img.src = URL.createObjectURL(f);
  };
};
ACTS.menu = () => document.getElementById('app').classList.toggle('nav-open');
ACTS.newmenu = (_, el) => {
  const ex = document.getElementById('newmenu'); if (ex) { ex.remove(); return; }
  el.parentElement.insertAdjacentHTML('beforeend', `<div class="menu" id="newmenu">${quickFor().map(q => `<button data-act="quick" data-arg="${q[0]}">${ic(q[3])}<span>${q[1]}</span></button>`).join('')}</div>`);
};
ACTS.quick = k => { const m = document.getElementById('newmenu'); if (m) m.remove(); runQuick(k); };
document.addEventListener('click', e => { const m = document.getElementById('newmenu'); if (m && !e.target.closest('#newmenu') && !e.target.closest('[data-act="newmenu"]')) m.remove(); }, true);
ACTS.logout = async () => { if (SB) await SB.auth.signOut(); location.hash = ''; location.reload(); };
function isDark() { return (document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'; }
ACTS.theme = () => {
  const nx = isDark() ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', nx);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = nx === 'dark' ? '#0F0C0B' : '#17110F';
  try { localStorage.setItem('boom-theme', nx); } catch (e) { /* ignore */ }
  const top = document.getElementById('top'); if (top && top.innerHTML) render(); else { const b = document.querySelector('.lang-pill [data-act="theme"]'); if (b) b.innerHTML = ic(isDark() ? 'sun' : 'moon'); }
};
ACTS.lang = () => { LANG = LANG === 'en' ? 'ar' : 'en'; try { localStorage.setItem('boom-lang', LANG); } catch (e) { /* ignore */ } location.reload(); };
ACTS.print = () => window.print();

/* ---------- toast / modal ---------- */
function toast(msg, kind) {
  const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg;
  document.getElementById('toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'bad' ? 6000 : 3200);
}
let modalSave = null;
function modal(title, body, { wide, save, saveText = 'حفظ', foot = '' } = {}) {
  modalSave = save || null;
  document.getElementById('modal-root').innerHTML = `<div class="ov" data-act="ovclose"><div class="md ${wide ? 'w' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="mh"><h3>${title}</h3><button class="icon-btn" data-act="mclose" aria-label="إغلاق">${ic('x')}</button></div>
    <div class="mb" id="mb">${body}</div>
    <div class="mf">${save ? `<button class="btn p" data-act="msave">${saveText}</button>` : ''}<button class="btn" data-act="mclose">${save ? 'إلغاء' : 'إغلاق'}</button>${foot}<span class="merr" id="merr"></span></div></div></div>`;
  const first = document.querySelector('#mb input, #mb select'); if (first) first.focus();
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; modalSave = null; }
ACTS.mclose = closeModal;
ACTS.ovclose = (_, el, e) => { if (e.target === el) closeModal(); };
/* put the error under the field it belongs to (and keep the summary next to the save button) */
const ERR_FIELDS = [
  [/الكمية|كمية|العدد|عدد|الناتج|الحد/, ['pl-q', 'qty', 'كمية', 'الكمية', 'عدد', 'العبوات', 'الناتج', 'حد']],
  [/سعر|السعر|تكلفة|التكلفة/, ['pl-c', 'cost', 'سعر', 'السعر', 'التكلفة']],
  [/صلاحية/, ['pl-e', 'exp', 'الصلاحية']], [/تاريخ/, ['date', 'التاريخ', 'تاريخ']],
  [/المبلغ|مبلغ|رصيد/, ['amount', 'المبلغ']], [/الخصم/, ['خصم']], [/السبب|سبب/, ['السبب', 'reason']], [/الاسم|اسم الدخول|اسم/, ['الاسم', 'اسم']],
  [/الباسورد/, ['الباسورد']], [/الدور/, ['الدور']], [/مورد/, ['المورد']], [/عميل/, ['العميل']], [/الأصناف|صنف/, ['الصنف', 'pf-grid']], [/تصفير/, ['gl-c']],
];
function clearFieldErrors(root) { root.querySelectorAll('.f-err').forEach(e => e.remove()); root.querySelectorAll('.invalid').forEach(e => { e.classList.remove('invalid'); e.removeAttribute('aria-invalid'); e.removeAttribute('aria-describedby'); }); }
function pinError(root, msg) {
  clearFieldErrors(root);
  const fields = [...root.querySelectorAll('input.f:not([disabled]),select.f,textarea.f,.pf-grid')].filter(f => f.offsetParent !== null);
  if (!fields.length) return;
  const quoted = (msg.match(/"([^"]+)"/) || [])[1];
  let scope = fields;
  if (quoted) {
    const holder = [...root.querySelectorAll('tr,.rc,.fgrid,.pol')].find(r => r.textContent.includes(quoted) || [...r.querySelectorAll('select')].some(x => x.selectedOptions[0] && x.selectedOptions[0].textContent.includes(quoted)));
    if (holder) scope = fields.filter(f => holder.contains(f));
  }
  const labelOf = f => { const l = f.closest('label.fld'); return ((l && l.querySelector('span') ? l.querySelector('span').textContent : '') + ' ' + f.className + ' ' + (f.id || '')).trim(); };
  let target = null;
  for (const [re, keys] of ERR_FIELDS) if (re.test(msg)) { target = scope.find(f => keys.some(k => labelOf(f).includes(k))); if (target) break; }
  if (!target) target = scope.find(f => !f.value && f.tagName !== 'DIV') || (quoted ? scope[0] : null);
  if (!target) return;
  const id = 'ferr-' + Math.random().toString(36).slice(2, 8);
  target.classList.add('invalid'); target.setAttribute('aria-invalid', 'true'); target.setAttribute('aria-describedby', id);
  const anchor = target.closest('label.fld') || target.closest('td') || (target.tagName === 'DIV' ? null : target.parentElement);
  const html = `<div class="f-err" id="${id}" role="alert">${esc(msg)}</div>`;
  if (anchor) anchor.insertAdjacentHTML('beforeend', html); else target.insertAdjacentHTML('afterend', html);
  target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  if (target.focus) target.focus({ preventScroll: true });
  const clear = () => { clearFieldErrors(root); target.removeEventListener('input', clear); target.removeEventListener('change', clear); };
  target.addEventListener('input', clear); target.addEventListener('change', clear);
}
ACTS.msave = async (_, btn) => {
  if (!modalSave || btn.disabled) return;
  btn.disabled = true; document.getElementById('merr').textContent = '';
  const mb = document.getElementById('mb'); if (mb) clearFieldErrors(mb);
  try { const ok = await modalSave(); if (ok !== false) { closeModal(); afterChange(); } }
  catch (err) { const m = document.getElementById('merr'); if (m) m.textContent = err.message; if (mb && document.body.contains(mb)) pinError(mb, err.message); }
  finally { if (document.body.contains(btn)) btn.disabled = false; }
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.ov')) closeModal(); });
async function run(fn, okMsg) { try { const r = await fn(); afterChange(); if (okMsg) toast(okMsg, 'ok'); return r; } catch (err) { toast(err.message, 'bad'); return null; } }
function afterChange() { if (!LIVE) flushTelegram(); render(); }
const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };

/* ---------- Telegram ---------- */
let tgBusy = false;
async function flushTelegram() {
  const st = S().settings; if (tgBusy) return;
  const pending = S().alerts.filter(a => a.tg === 'pending');
  if (!pending.length) return;
  if (!st.telegram) { pending.forEach(a => { a.tg = 'off'; }); E.save(); return; }
  if (!st.tgToken || !st.tgChat) { pending.forEach(a => { a.tg = 'noconfig'; }); E.save(); return; }
  tgBusy = true;
  for (const a of pending) {
    const icon = a.level === 'bad' ? '🔴' : a.level === 'warn' ? '🟠' : '🔵';
    try {
      const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(st.tgToken)}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: st.tgChat, text: `${icon} بوم ميت\n${a.text}` }) });
      const j = await r.json(); a.tg = j.ok ? 'sent' : 'failed'; a.tgErr = j.ok ? '' : (j.description || '');
    } catch (e) { a.tg = 'failed'; a.tgErr = 'مفيش اتصال'; }
  }
  E.save(); tgBusy = false;
  if (route.page === 'alerts') render();
}
async function testTelegram(token, chat) {
  const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: '✅ بوم ميت: تنبيهات السيستم اتوصلت بتليجرام' }) });
  const j = await r.json(); if (!j.ok) throw new Error(j.description || 'فشل الإرسال'); return true;
}
const TG = { sent: ['ok', 'اتبعت تليجرام'], pending: ['warn', 'في الطريق'], failed: ['bad', 'فشل الإرسال'], noconfig: ['mut', 'تليجرام مش متوصل'], off: ['mut', 'تليجرام متوقف'], demo: ['mut', 'بيانات تجريبية'] };

/* ---------- charts (SVG) ---------- */
function bars(data, { h = 190, color = 'var(--red)', fmt = v => v, stack = null, target = null } = {}) {
  // data: [{label, v, v2?}]
  if (!data.length) return '<div class="empty">مفيش بيانات</div>';
  const W = 600, pad = 22, bot = 26, n = data.length, gap = 8;
  const tot = d => d.v + (stack ? d.v2 || 0 : 0);
  const max = Math.max(...data.map(tot), target || 0, 1);
  const bw = (W - pad * 2 - gap * (n - 1)) / n;
  let s = `<svg viewBox="0 0 ${W} ${h}" role="img">`;
  for (let i = 0; i <= 3; i++) { const y = pad + (h - pad - bot) * i / 3; s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line2)" stroke-width="1"/>`; }
  data.forEach((d, i) => {
    const x = W - pad - (i + 1) * bw - i * gap; // RTL: first item on the right
    const H = h - pad - bot;
    const h1 = d.v / max * H, h2 = stack ? (d.v2 || 0) / max * H : 0;
    const y1 = h - bot - h1;
    s += `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(h1, 0)}" rx="4" fill="${d.c || color}"><title>${esc(d.label)}: ${esc(fmt(d.v))}</title></rect>`;
    if (stack && h2) s += `<rect x="${x}" y="${y1 - h2}" width="${bw}" height="${h2}" rx="4" fill="${stack}"><title>${esc(d.label)}: ${esc(fmt(d.v2))}</title></rect>`;
    if (n <= 16) s += `<text x="${x + bw / 2}" y="${h - bot - h1 - h2 - 5}" text-anchor="middle" class="lbl">${esc(d.top != null ? d.top : '')}</text>`;
    s += `<text x="${x + bw / 2}" y="${h - 8}" text-anchor="middle">${esc(d.label)}</text>`;
  });
  if (target) { const y = h - bot - target / max * (h - pad - bot); s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--yel)" stroke-width="2" stroke-dasharray="6 5"/>`; }
  return `<div class="chart">${s}</svg></div>`;
}
function spark(vals, color = '#fff') {
  if (vals.length < 2) return '';
  const W = 90, H = 28, max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const pts = vals.map((v, i) => `${W - i * W / (vals.length - 1)},${H - (v - min) / (max - min || 1) * H}`).join(' ');
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
// lollipop: data oldest→newest [{label, v}], dashed daily target, glowing heads (today biggest)
function lolli(data, { target = 0, fmt = v => v, h = 230 } = {}) {
  if (!data.length) return '<div class="empty">مفيش بيانات</div>';
  const rtl = document.documentElement.dir !== 'ltr';
  const W = 640, pad = 24, bot = 28, n = data.length, H = h - pad - bot;
  const max = Math.max(...data.map(d => d.v), target, 1) * 1.08;
  const X = i => { const x = 18 + i * (W - 36) / Math.max(n - 1, 1); return rtl ? W - x : x; };
  const Y = v => pad + H - v / max * H;
  const every = Math.ceil(n / 8);
  let s = `<svg class="lolli" viewBox="0 0 ${W} ${h}" role="img" direction="ltr" style="direction:ltr"><defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="stemg" gradientUnits="userSpaceOnUse" x1="0" y1="${pad + H}" x2="0" y2="${pad}"><stop offset="0" stop-color="#FF6A3D" stop-opacity="0"/><stop offset="1" stop-color="#FF6A3D" stop-opacity=".9"/></linearGradient></defs>`;
  for (let i = 0; i <= 3; i++) { const y = pad + H * i / 3; s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line2)"/>`; }
  data.forEach((d, i) => {
    const x = X(i), y = Y(d.v), last = i === n - 1, hit = target && d.v >= target;
    s += `<g class="hit"><title>${esc(d.label)} · ${esc(fmt(d.v))}</title><line class="stem" x1="${x}" x2="${x}" y1="${pad + H}" y2="${y}" stroke="${hit || last ? 'url(#stemg)' : 'var(--line)'}"/>`;
    s += `<circle cx="${x}" cy="${y}" r="${last ? 7 : 4.5}" fill="${hit || last ? '#FF7A45' : 'var(--muted)'}" ${hit || last ? 'filter="url(#glow)"' : ''}/>`;
    if (last) s += `<circle cx="${x}" cy="${y}" r="12" fill="none" stroke="#FF7A45" stroke-opacity=".35"/>`;
    s += `</g>`;
    if (i % every === (n - 1) % every) s += `<text x="${x}" y="${h - 8}" text-anchor="middle">${esc(d.label)}</text>`;
  });
  if (target) { const y = Y(target); s += `<line class="tgt" x1="0" x2="${W}" y1="${y}" y2="${y}"/><text x="${rtl ? W - 6 : 6}" y="${y - 6}" text-anchor="${rtl ? 'end' : 'start'}" style="fill:#FF7A45">الهدف ${esc(fmt(target))}</text>`; }
  return `<div class="chart">${s}</svg></div>`;
}
// progress ring: p in 0..1
function ring(p, { size = 120, sw = 12, color = 'url(#ringg)', label = '', sub = '' } = {}) {
  const r = (size - sw) / 2, C = 2 * Math.PI * r, L = Math.max(0, Math.min(1, p)) * C;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${Math.round(p * 100)}%"><defs><linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB36B"/><stop offset=".5" stop-color="#FF6A3D"/><stop offset="1" stop-color="#D93A22"/></linearGradient></defs><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(128,128,140,.18)" stroke-width="${sw}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${L} ${C}" transform="rotate(-90 ${size / 2} ${size / 2})" style="filter:drop-shadow(0 0 6px rgba(255,106,61,.55))"/>${label ? `<text x="50%" y="${sub ? '47%' : '53%'}" text-anchor="middle" dominant-baseline="middle" style="font:800 ${size / 5}px var(--head);fill:var(--ink)">${label}</text>` : ''}${sub ? `<text x="50%" y="66%" text-anchor="middle" style="font:600 ${size / 11}px var(--body);fill:var(--muted)">${sub}</text>` : ''}</svg>`;
}
// area chart: vals oldest→newest
function area(vals, { h = 110 } = {}) {
  if (vals.length < 2) return '';
  const rtl = document.documentElement.dir !== 'ltr';
  const W = 320, max = Math.max(...vals, 1), min = Math.min(...vals, 0), n = vals.length;
  const pts = vals.map((v, i) => { const x = i * W / (n - 1); return [rtl ? W - x : x, 8 + (h - 16) * (1 - (v - min) / (max - min || 1))]; });
  const line = pts.map(p => p.join(',')).join(' ');
  return `<svg viewBox="0 0 ${W} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="areag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6A3D" stop-opacity=".35"/><stop offset="1" stop-color="#FF6A3D" stop-opacity="0"/></linearGradient></defs><polygon points="${pts[0][0]},${h} ${line} ${pts[n - 1][0]},${h}" fill="url(#areag)"/><polyline points="${line}" fill="none" stroke="#FF6A3D" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function donut(parts) {
  const tot = parts.reduce((s, p) => s + p.v, 0); if (!tot) return '<div class="empty">مفيش بيانات</div>';
  const R = 52, C = 2 * Math.PI * R; let off = 0, s = `<svg viewBox="0 0 140 140" width="140" height="140" role="img"><g transform="rotate(-90 70 70)">`;
  for (const p of parts) { const L = p.v / tot * C; s += `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${p.c}" stroke-width="22" stroke-dasharray="${L} ${C - L}" stroke-dashoffset="${-off}"><title>${esc(p.label)}</title></circle>`; off += L; }
  s += `</g></svg>`;
  return `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">${s}<div class="legend" style="flex-direction:column;gap:6px">${parts.map(p => `<span><i style="background:${p.c}"></i>${esc(p.label)} · <b style="color:var(--ink)">${pct(p.v, tot)}</b></span>`).join('')}</div></div>`;
}
function hbars(rows, fmt) { const max = Math.max(...rows.map(r => r.v), 1); return `<div class="hbars">${rows.map(r => `<div class="hbar"><span>${esc(r.label)}</span><div class="tr"><i style="width:${Math.max(r.v / max * 100, r.v ? 2 : 0)}%;background:${r.c || 'var(--red)'}"></i></div><b>${esc(fmt(r.v))}</b></div>`).join('')}</div>`; }

/* ---------- tables ---------- */
const LIMIT = {};
function table(key, cols, rows, { onRow, empty = 'مفيش بيانات', foot } = {}) {
  const lim = XLSX_ALL ? Infinity : (LIMIT[key] || 60);
  const shown = rows.slice(0, lim);
  const th = cols.map(c => `<th class="${c.n ? 'n' : ''}">${c.t}</th>`).join('');
  const tb = shown.map(r => `<tr class="${onRow ? 'click' : ''} ${r._cls || ''}" ${onRow ? `data-go="${esc(onRow(r))}"` : ''}>${cols.map(c => `<td class="${c.n ? 'n' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('');
  return `<div class="tw"><table class="t"><thead><tr>${th}</tr></thead><tbody>${tb || `<tr><td colspan="${cols.length}"><div class="empty">${empty}</div></td></tr>`}${foot || ''}</tbody></table></div>${rows.length > lim ? `<div class="more"><button class="btn sm" data-act="more" data-arg="${key}">عرض المزيد (${rows.length - lim} سطر)</button></div>` : ''}`;
}
ACTS.more = k => { LIMIT[k] = (LIMIT[k] || 60) + 100; render(); };

/* ---------- shared bits ---------- */
const statusPill = st => ({ open: '<span class="pill warn">جارية</span>', closed: '<span class="pill ok">مقفولة</span>', pending: '<span class="pill warn">مستني موافقة</span>', approved: '<span class="pill ok">اتوافق عليه</span>', rejected: '<span class="pill bad">مرفوض</span>' })[st] || st;
function expPill(exp) { const d = E.daysBetween(E.today(), exp); return d < 0 ? `<span class="pill bad">منتهية</span>` : d <= 3 ? `<span class="pill warn">${d} يوم</span>` : `<span class="pill mut">${d} يوم</span>`; }
function itemOptions(filter, sel) { return S().items.filter(filter).map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)} · ${esc(i.code)}</option>`).join(''); }
function partnerOptions(type, sel, filter = () => true) { return S().partners.filter(p => p.type === type && filter(p)).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join(''); }
const methodOptions = (opts, sel) => opts.map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${E.METHOD_NAME[m]}</option>`).join('');
/* avatars: the user's photo, or their initials on a gold disc */
function avatar(u, cls = 'av') { u = u || {}; return u.avatar ? `<img class="${cls} av-img" src="${esc(u.avatar)}" alt="">` : `<span class="${cls}">${esc(initials(u.name))}</span>`; }
const userObj = id => S().users.find(x => x.id === id) || { name: E.userName(id) };
function chatter(ref) {
  const rows = S().audit.filter(a => a.ref === ref).slice().reverse();
  if (!rows.length) return '<div class="empty">مفيش حركات</div>';
  return `<div class="chatter">${rows.map(a => `<div class="m">${avatar(userObj(a.user))}<div><b>${esc(E.userName(a.user))}</b> <small>· ${tf(a.at)}</small><div>${tx(a.text)}</div></div></div>`).join('')}</div>`;
}
function periodBar(key, cur) {
  const t = E.today();
  const opts = [['month', 'الشهر ده'], ['last', 'الشهر اللي فات'], ['d30', 'آخر ٣٠ يوم'], ['all', 'من أول المدة']];
  return `<div class="seg" role="tablist">${opts.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-act="period" data-arg="${key}:${k}">${l}</button>`).join('')}</div>`;
}
const PERIOD = {};
function period(key, def = 'month') {
  const k = PERIOD[key] || def, t = E.today();
  if (k === 'month') return { k, from: E.monthStart(t), to: t, label: 'الشهر ده' };
  if (k === 'last') { const lm = E.addDays(E.monthStart(t), -1); return { k, from: E.monthStart(lm), to: lm, label: 'الشهر اللي فات' }; }
  if (k === 'd30') return { k, from: E.addDays(t, -29), to: t, label: 'آخر ٣٠ يوم' };
  return { k, from: '2000-01-01', to: t, label: 'من أول المدة' };
}
ACTS.period = arg => { const [k, v] = arg.split(':'); PERIOD[k] = v; render(); };
const TAB = {};
function tabs(key, list, def) { const cur = TAB[key] || def || list[0][0]; return { cur, html: `<div class="seg">${list.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-act="tab" data-arg="${key}:${k}">${l}</button>`).join('')}</div>` }; }
ACTS.tab = arg => { const [k, v] = arg.split(':'); TAB[k] = v; render(); };
const FILTER = {};
document.addEventListener('input', e => {
  const k = e.target.dataset.filter; if (!k) return;
  FILTER[k] = e.target.value; clearTimeout(e.target._t);
  e.target._t = setTimeout(() => { render(); const el = document.querySelector(`[data-filter="${k}"]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250);
});
const searchBox = (k, ph) => `<input class="f search" type="search" placeholder="${ph}" value="${esc(FILTER[k] || '')}" data-filter="${k}" aria-label="${ph}">`;
const match = (k, ...fields) => { const q = (FILTER[k] || '').trim().toLowerCase(); return !q || fields.some(f => String(f || '').toLowerCase().includes(q)); };
function barcode(code) {
  try { if (window.JsBarcode) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); window.JsBarcode(svg, code, { format: 'CODE128', height: 46, displayValue: true, fontSize: 13, margin: 0, background: '#ffffff' }); return svg.outerHTML; } } catch (e) { /* fall through */ }
  return `<div class="mono" style="font-size:16px;letter-spacing:3px">${esc(code)}</div>`;
}

/* ---------- live mode: Supabase auth + server-side operations ---------- */
const CFG = window.BOOM_CONFIG || null;
const LIVE = !!(CFG && CFG.url && CFG.anonKey);
let SB = null, VERSION = -1, PROFILE = null, PENDING_REQ = 0;
async function countRequests() { if (!SB || !PROFILE || PROFILE.role !== 'owner') return; const { count } = await SB.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'pending'); PENDING_REQ = count || 0; }
const LIVE_OPS = ['purchase', 'transfer', 'cutting', 'createBatch', 'issue', 'requestCorrection', 'decideCorrection', 'closeBatch', 'invoice', 'receipt', 'supplierPayment', 'expense', 'cashTransfer', 'depreciate', 'writeOff', 'saveItem', 'savePartner', 'resetBooks', 'updateSelf', 'saveWarehouse', 'updateSettings', 'markAlertsRead', 'openingBalances', 'setRecipe'];
let busyN = 0;
function busy(on) { busyN += on ? 1 : -1; let b = document.getElementById('busy'); if (busyN > 0 && !b) document.body.insertAdjacentHTML('beforeend', '<div class="busy" id="busy"></div>'); if (busyN <= 0 && b) b.remove(); }
async function api(op, args) {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.reload(); throw new Error('سجل دخول تاني'); }
  busy(true);
  try {
    const r = await fetch(`${CFG.url}/functions/v1/erp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: CFG.anonKey }, body: JSON.stringify({ op, args }) });
    let j = {}; try { j = await r.json(); } catch (e) { /* non-json */ }
    if (!r.ok) throw new Error(j.error || 'السيرفر مش بيرد، جرّب تاني');
    return j;
  } catch (e) { if (e instanceof TypeError) throw new Error('مفيش اتصال بالإنترنت'); throw e; }
  finally { busy(false); }
}
async function loadState() {
  const { data, error } = await SB.from('erp_state').select('version,state').eq('id', 1).single();
  if (error) throw new Error('تعذر تحميل البيانات: ' + error.message);
  E.setState(data.state); VERSION = data.version;
  E.S.currentUser = PROFILE.user_id;
  if (!E.S.users.some(u => u.id === PROFILE.user_id)) E.S.users.push({ id: PROFILE.user_id, username: PROFILE.username, name: PROFILE.name, role: PROFILE.role, active: PROFILE.active });
}
function liveWrap() {
  for (const op of LIVE_OPS) E[op] = async (...args) => { const r = await api(op, args); await loadState(); return r.result; };
  E.setUser = () => { throw new Error('غير متاح'); };
  E.reset = () => { throw new Error('غير متاح'); };
}
function authShell(tab, inner) {
  return `<div class="login" style="width:100%">
    <div class="box glass"><div class="lang-pill"><button type="button" class="btn sm" data-act="lang">${LANG === 'en' ? 'العربية' : 'English'}</button><button type="button" class="icon-btn" data-act="theme" aria-label="الوضع الليلي">${ic(isDark() ? 'sun' : 'moon')}</button></div><div class="logo-tile"><img src="boom-logo.png" alt="Boom Meat"></div><h1>بوم ميت</h1><p>سيستم بوم ميت للمخازن والإنتاج والحسابات</p>
    <div class="tabs" role="tablist"><button type="button" role="tab" class="${tab === 'in' ? 'on' : ''}" aria-selected="${tab === 'in'}" data-act="login-form">تسجيل الدخول</button><button type="button" role="tab" class="${tab === 'req' ? 'on' : ''}" aria-selected="${tab === 'req'}" data-act="req-form">إنشاء حساب</button></div>
    ${inner}
    <div class="made"><img class="lt" src="wiyak-light.png" alt="WIYAK"><img class="dk" src="wiyak-dark.png" alt="WIYAK"></div></div></div>`;
}
function loginScreen(msg) {
  document.getElementById('app').innerHTML = authShell('in', `<form id="login-form" autocomplete="on" style="display:flex;flex-direction:column;gap:14px">
    <label class="fld"><span>اسم المستخدم</span><input class="f" id="lg-u" autocomplete="username" dir="ltr" required></label>
    <label class="fld"><span>الباسورد</span><input class="f" id="lg-p" type="password" autocomplete="current-password" dir="ltr" required></label>
    <button class="btn p lg" type="submit" style="justify-content:center">${ic('lock')} دخول</button>
    <div class="merr" id="lg-err" style="text-align:center" role="alert">${esc(msg || '')}</div></form>`);
  document.getElementById('login-form').onsubmit = async e => {
    e.preventDefault();
    const u = val('lg-u').trim().toLowerCase(), pw = val('lg-p');
    const btn = e.target.querySelector('button'); btn.disabled = true; document.getElementById('lg-err').textContent = '';
    const { error } = await SB.auth.signInWithPassword({ email: `${u}@boom-erp.local`, password: pw });
    btn.disabled = false;
    if (error) { document.getElementById('lg-err').textContent = /invalid/i.test(error.message) ? 'اسم المستخدم أو الباسورد غلط' : /banned/i.test(error.message) ? 'طلبك لسه مستني موافقة المالك، أو الحساب موقوف' : error.message; return; }
    location.reload();
  };
  document.getElementById('lg-u').focus();
}
function requestForm() {
  document.getElementById('app').innerHTML = authShell('req', `<form id="req-form" novalidate style="display:flex;flex-direction:column;gap:14px">
    <p style="margin:0">حسابك هيتفعّل بعد موافقة المالك.</p>
    <label class="fld"><span>الاسم</span><input class="f" id="rq-name" autocomplete="name" required></label>
    <label class="fld"><span>اسم الدخول (إنجليزي صغير)</span><input class="f" id="rq-username" dir="ltr" autocomplete="username" required></label>
    <label class="fld"><span>الباسورد (٨ حروف على الأقل)</span><input class="f" id="rq-password" type="password" dir="ltr" autocomplete="new-password" required></label>
    <label class="fld"><span>رقم التليفون</span><input class="f" id="rq-phone" type="tel" dir="ltr" autocomplete="tel" required></label>
    <button class="btn p lg" type="submit" style="justify-content:center">${ic('plus')} إنشاء الحساب</button>
    <div class="merr" id="rq-err" style="text-align:center" role="alert"></div></form>`);
  const f = document.getElementById('req-form');
  f.onsubmit = async e => {
    e.preventDefault(); const btn = f.querySelector('button'); btn.disabled = true; clearFieldErrors(f); document.getElementById('rq-err').textContent = '';
    const body = { action: 'request', name: val('rq-name'), username: val('rq-username').trim().toLowerCase(), password: val('rq-password'), phone: val('rq-phone') };
    try {
      const r = await fetch(`${CFG.url}/functions/v1/tg`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.anonKey }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { const el = j.field && document.getElementById('rq-' + j.field); if (el) { el.classList.add('invalid'); el.setAttribute('aria-invalid', 'true'); el.closest('label').insertAdjacentHTML('beforeend', `<div class="f-err" role="alert">${esc(j.error)}</div>`); el.focus(); el.addEventListener('input', () => clearFieldErrors(f), { once: true }); } else document.getElementById('rq-err').textContent = j.error || 'تعذر إرسال الطلب'; return; }
      f.innerHTML = `<div class="note ok" style="text-align:center"><b>اتعمل حسابك ✓</b><br>مستني موافقة المالك. أول ما يوافق تقدر تدخل باسم الدخول والباسورد اللي كتبتهم.</div><button type="button" class="btn p lg" style="justify-content:center" data-act="login-form">تسجيل الدخول</button>`;
    } catch (err) { document.getElementById('rq-err').textContent = 'مفيش اتصال بالإنترنت'; }
    finally { if (document.body.contains(btn)) btn.disabled = false; }
  };
  document.getElementById('rq-name').focus();
}
ACTS['req-form'] = () => requestForm();
ACTS['login-form'] = () => loginScreen();
async function bootLive() {
  SB = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data: { session } } = await SB.auth.getSession();
  if (!session) return loginScreen();
  const { data: prof } = await SB.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle();
  if (!prof || !prof.active) { await SB.auth.signOut(); return loginScreen('الحساب ده موقوف أو مش متسجل'); }
  PROFILE = prof;
  if (prof.role === 'pending') {
    document.getElementById('app').innerHTML = `<div class="login" style="width:100%"><div class="box glass"><div class="logo-tile"><img src="boom-logo.png" alt="Boom Meat"></div><h1>أهلًا ${esc(prof.name)}</h1>
      <p>حسابك اتقبل. المالك لسه هيحدد الشاشات اللي هتشتغل عليها، وأول ما يحددها هتظهرلك هنا.</p>
      <button class="btn p lg" style="justify-content:center" onclick="location.reload()">تحديث</button><button class="btn" style="justify-content:center" data-act="logout">خروج</button></div></div>`;
    return;
  }
  try { await loadState(); } catch (e) { document.getElementById('content').innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
  liveWrap();
  await countRequests().catch(() => {});
  route = parse(); render();
  api('dailyCheck', []).then(async r => { if (r && !r.skipped && r.version !== VERSION) { await loadState(); if (!document.querySelector('.ov')) render(); } }).catch(() => {});
  SB.channel('erp-ping').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'erp_ping' }, async payload => {
    if (payload.new && payload.new.version > VERSION) { await loadState(); await countRequests().catch(() => {}); if (!document.querySelector('.ov') && !document.activeElement.matches('input,select,textarea')) render(); }
  }).subscribe();
}

window.UI = { avatar, userObj, pinError, clearFieldErrors, lang: () => LANG, E, S, esc, tx, fm, fm0, kgf, qtyf, pct, df, dfl, tf, packName, toG, toP, toI, role, canCost, isOwner, accName, initials, ic, PAGES, ACTS, go, render, page, modal, closeModal, run, toast, val, table, bars, spark, donut, hbars, lolli, ring, area, statusPill, expPill, itemOptions, partnerOptions, methodOptions, chatter, periodBar, period, tabs, searchBox, match, barcode, TG, testTelegram, flushTelegram, content, afterChange, FILTER, TAB, ALL };
window.UI.LIVE = LIVE; window.UI.api = api; window.UI.quickFor = quickFor; window.UI.runQuick = runQuick;
window.UI.profile = () => PROFILE; window.UI.pendingRequests = () => PENDING_REQ; window.UI.countRequests = countRequests; window.UI.sb = () => SB;
// cursor spotlight on glass surfaces
document.addEventListener('pointermove', e => {
  const el = e.target.closest && e.target.closest('.card,.kpi,.qa'); if (!el) return;
  const r = el.getBoundingClientRect(); el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px');
}, { passive: true });
window.UI.boot = () => {
  if (LIVE) { bootLive(); return; }
  E.init(); E.watch(E.today()); E.save(); route = parse(); render(); flushTelegram();
};
})();
