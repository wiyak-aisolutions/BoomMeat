// Boom Meat ERP — authoritative operation runner (runs inside the Supabase Edge Function, testable in Node).
// The browser never writes the books: it sends {op, args}; this loads the latest state, runs the same
// engine as the client with the caller's role from the database, and saves with an optimistic version check.

export const OPS = new Set([
  'purchase', 'transfer', 'cutting', 'createBatch', 'issue', 'requestCorrection', 'decideCorrection', 'closeBatch',
  'invoice', 'receipt', 'supplierPayment', 'expense', 'cashTransfer', 'depreciate', 'writeOff',
  'saveItem', 'savePartner', 'resetBooks', 'updateSelf', 'saveWarehouse', 'updateSettings', 'markAlertsRead', 'openingBalances', 'setRecipe', 'dailyCheck', 'decideOrder',
]);

function syncActor(E, profile) {
  const S = E.S;
  let u = S.users.find(x => x.id === profile.user_id);
  if (!u) { u = { id: profile.user_id }; S.users.push(u); }
  Object.assign(u, { username: profile.username, role: profile.role, active: profile.active });
  if (!u.name) u.name = profile.name; // the display name is chosen by the user (My account)
  S.currentUser = profile.user_id;
}

/**
 * db: { load(): {version, state}, save(state, baseVersion): newVersion|null, log(entry), snapshot(day, state) }
 * telegram: async (text) => {ok, error}  (optional)
 */
export async function runOp({ E, db, profile, op, args, telegram, copy, maxRetries = 4 }) {
  if (!OPS.has(op)) return { status: 400, body: { error: 'عملية غير معروفة' } };
  if (!profile || !profile.active) return { status: 403, body: { error: 'الحساب ده موقوف' } };
  if (profile.role === 'pending') return { status: 403, body: { error: 'حسابك لسه مستني المالك يحدد صلاحياتك' } };
  if (!Array.isArray(args)) args = args == null ? [] : [args];
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const row = await db.load();
    E.setState(row.state);
    syncActor(E, profile);
    let result;
    try {
      if (op === 'dailyCheck') {
        if (E.S.lastCheck === E.today()) return { status: 200, body: { ok: true, version: row.version, skipped: true } };
        result = E.markAlertsRead([]); // runs inside tx → watch() raises expiry/low-stock alerts
        E.S.lastCheck = E.today();
      } else {
        result = E[op](...args);
      }
    } catch (e) {
      await db.log({ user_id: profile.user_id, username: profile.username, op, args, ok: false, error: e.message, version: row.version });
      return { status: 400, body: { error: e.message } };
    }
    const pending = (E.S.alerts || []).filter(a => a.tg === 'pending');
    const v = await db.save(E.S, row.version);
    if (v == null) continue; // someone saved first: reload and run again on fresh state
    if (op === 'resetBooks') await db.log({ user_id: profile.user_id, username: profile.username, op: 'backup_before_reset', args: row.state, ok: true, error: null, version: row.version });
    await db.log({ user_id: profile.user_id, username: profile.username, op, args, ok: true, error: null, version: v });
    if (db.snapshot) { try { await db.snapshot(E.today(), E.S, v); } catch (e) { /* snapshot is best-effort */ } }
    if (pending.length) await deliverAlerts({ E, db, ids: pending.map(a => a.id), telegram, copy });
    return { status: 200, body: { ok: true, version: v, result: result === undefined ? null : JSON.parse(JSON.stringify(result)) } };
  }
  return { status: 409, body: { error: 'السيستم مشغول بعمليات تانية، جرّب تاني' } };
}

/* WhatsApp bot endpoint (shared key checked by the caller): read-only catalog/status, and placing pending orders */
export async function runShop({ E, db, action, body, telegram, copy, maxRetries = 4 }) {
  const b = body || {};
  if (action === 'catalog' || action === 'status' || action === 'orderInfo' || action === 'proofTarget') {
    const row = await db.load(); E.setState(row.state);
    let result;
    if (action === 'catalog') result = E.catalog(b.phone);
    else if (action === 'status') result = E.orderStatus(b.phone);
    else if (action === 'orderInfo') { result = E.orderView(String(b.id || '')); if (!result) return { status: 404, body: { error: 'الطلب غير موجود' } }; }
    else { const o = E.proofTarget(b.phone); result = o ? { id: o.id, no: o.no, test: !!o.test } : null; }
    return { status: 200, body: { ok: true, result } };
  }
  // writes the bot may do: place an order, attach a transfer screenshot, record that a message went out
  const WRITES = { order: ['placeOrder', () => b.order || {}], proof: ['orderProof', () => ({ phone: b.phone, path: b.path })], notified: ['orderNotified', () => ({ id: b.id, kind: b.kind, image: b.image === true })],
    payLink: ['orderPayLink', () => b.link || {}], cardPaid: ['orderCardPaid', () => b.card || {}] }; // Paymob: link created / verified callback
  if (!WRITES[action]) return { status: 400, body: { error: 'طلب غير معروف' } };
  const [fn, argsOf] = WRITES[action];
  const who = { user_id: null, username: 'whatsapp-bot' };
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const row = await db.load();
    E.setState(row.state); E.S.currentUser = 'bot';
    let result;
    try { result = E[fn](argsOf()); } catch (e) {
      await db.log({ ...who, op: fn, args: argsOf(), ok: false, error: e.message, version: row.version });
      return { status: 400, body: { error: e.message } };
    }
    const pending = (E.S.alerts || []).filter(a => a.tg === 'pending');
    const v = await db.save(E.S, row.version);
    if (v == null) continue;
    await db.log({ ...who, op: fn, args: argsOf(), ok: true, error: null, version: v });
    if (db.snapshot) { try { await db.snapshot(E.today(), E.S, v); } catch (e) { /* best-effort */ } }
    if (pending.length) await deliverAlerts({ E, db, ids: pending.map(a => a.id), telegram, copy });
    return { status: 200, body: { ok: true, version: v, result } };
  }
  return { status: 409, body: { error: 'السيستم مشغول، جرّب تاني' } };
}

async function deliverAlerts({ E, db, ids, telegram, copy }) {
  const S0 = E.S;
  const chat = S0.settings.tgChat;
  const status = {};
  for (const id of ids) {
    const a = S0.alerts.find(x => x.id === id);
    if (!a) continue;
    if (!S0.settings.telegram) { status[id] = ['off', '']; continue; }
    if (!telegram || !chat) { status[id] = ['noconfig', '']; continue; }
    const icon = a.level === 'bad' ? '🔴' : a.level === 'warn' ? '🟠' : '🔵';
    const r = await telegram(chat, `${icon} بوم ميت\n${a.text}`);
    status[id] = r.ok ? ['sent', ''] : ['failed', r.error || ''];
    if (copy) { try { await copy(`${icon} بوم ميت\n${a.text}`); } catch (_e) { /* viewers are best effort */ } } // people the owner invited to watch
  }
  // write statuses back (best effort, never overwrite a newer version)
  for (let i = 0; i < 3; i++) {
    const row = await db.load();
    let changed = false;
    for (const a of row.state.alerts || []) if (status[a.id] && a.tg === 'pending') { a.tg = status[a.id][0]; a.tgErr = status[a.id][1]; changed = true; }
    if (!changed) return;
    if ((await db.save(row.state, row.version)) != null) return;
  }
}

/* user administration (owner only) — auth calls are injected so this stays testable */
export async function runAdmin({ E, db, profile, op, args, auth }) {
  if (!profile || !profile.active || profile.role !== 'owner') return { status: 403, body: { error: 'الصلاحية دي للمالك بس' } };
  const a = args || {};
  const okUser = s => /^[a-z0-9._-]{3,30}$/.test(s || '');
  if (op === 'createUser') {
    if (!okUser(a.username)) return { status: 400, body: { error: 'اسم المستخدم: حروف إنجليزي صغيرة وأرقام بس (٣ حروف على الأقل)' } };
    if (!a.password || a.password.length < 8) return { status: 400, body: { error: 'الباسورد لازم ٨ حروف على الأقل' } };
    if (!a.name || !a.name.trim()) return { status: 400, body: { error: 'اكتب الاسم' } };
    if (!E.ROLES[a.role]) return { status: 400, body: { error: 'اختار الدور' } };
    const created = await auth.create(a.username, a.password);
    if (created.error) return { status: 400, body: { error: created.error } };
    await auth.upsertProfile({ user_id: created.id, username: a.username, name: a.name.trim(), role: a.role, active: true });
    return syncUser({ E, db, profile, user: { id: created.id, username: a.username, name: a.name.trim(), role: a.role, active: true } });
  }
  if (op === 'updateUser') {
    if (a.id === profile.user_id && (a.role !== 'owner' || a.active === false)) return { status: 400, body: { error: 'مينفعش تشيل صلاحية المالك من حسابك' } };
    const p = await auth.getProfile(a.id); if (!p) return { status: 404, body: { error: 'المستخدم غير موجود' } };
    await auth.upsertProfile({ user_id: a.id, username: p.username, name: (a.name || p.name).trim(), role: a.role || p.role, active: a.active !== false });
    await auth.setBanned(a.id, a.active === false);
    return syncUser({ E, db, profile, user: { id: a.id, username: p.username, name: (a.name || p.name).trim(), role: a.role || p.role, active: a.active !== false } });
  }
  if (op === 'resetPassword') {
    if (!a.password || a.password.length < 8) return { status: 400, body: { error: 'الباسورد لازم ٨ حروف على الأقل' } };
    const r = await auth.setPassword(a.id, a.password); if (r.error) return { status: 400, body: { error: r.error } };
    return { status: 200, body: { ok: true } };
  }
  if (op === 'approveRequest' || op === 'rejectRequest') {
    const p = await auth.getProfile(a.id); if (!p || p.role !== 'pending') return { status: 404, body: { error: 'الطلب غير موجود أو اتعامل معاه قبل كده' } };
    if (op === 'rejectRequest') { await auth.deleteUser(a.id); return removeUser({ E, db, profile, id: a.id }); }
    const role = a.role && a.role !== 'pending' && E.ROLES[a.role] ? a.role : 'pending';
    await auth.upsertProfile({ user_id: a.id, username: p.username, name: p.name, role, active: true, phone: p.phone || null });
    await auth.setBanned(a.id, false);
    return syncUser({ E, db, profile, user: { id: a.id, username: p.username, name: p.name, role, active: true } });
  }
  if (op === 'tgLinkCode') {
    const code = Array.from({ length: 10 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
    await auth.setSecret('tg_link_code', code); await auth.setSecret('tg_link_exp', String(Date.now() + 15 * 60 * 1000));
    return { status: 200, body: { ok: true, result: { code, bot: 'BoomMeat_bot' } } };
  }
  if (op === 'setTelegramToken') {
    await auth.setSecret('telegram_token', (a.token || '').trim());
    return { status: 200, body: { ok: true } };
  }
  return { status: 400, body: { error: 'عملية غير معروفة' } };
}
async function removeUser({ E, db, profile, id }) {
  for (let i = 0; i < 4; i++) {
    const row = await db.load(); E.setState(row.state);
    const S = E.S; const n = S.users.length; S.users = S.users.filter(u => u.id !== id);
    if (S.users.length === n) return { status: 200, body: { ok: true } };
    const v = await db.save(S, row.version);
    if (v != null) { await db.log({ user_id: profile.user_id, username: profile.username, op: 'reject_request', args: [{ id }], ok: true, error: null, version: v }); return { status: 200, body: { ok: true, version: v } }; }
  }
  return { status: 409, body: { error: 'السيستم مشغول، جرّب تاني' } };
}
export { syncUser };
async function syncUser({ E, db, profile, user }) {
  for (let i = 0; i < 4; i++) {
    const row = await db.load();
    E.setState(row.state); syncActor(E, profile);
    try { E.upsertUser(user); } catch (e) { return { status: 400, body: { error: e.message } }; }
    const v = await db.save(E.S, row.version);
    if (v != null) { await db.log({ user_id: profile.user_id, username: profile.username, op: 'user', args: [{ ...user }], ok: true, error: null, version: v }); return { status: 200, body: { ok: true, version: v, result: user } }; }
  }
  return { status: 409, body: { error: 'السيستم مشغول، جرّب تاني' } };
}
