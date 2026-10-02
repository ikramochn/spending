// UI layer. Flow for every write: validate -> save to IndexedDB (awaited) -> reload from DB -> render -> confirm.
import { DB } from './db.js';
import * as L from './logic.js';

const S = { tx: [], currency: 'USD', view: 'dashboard', filter: 'all', dbOk: true };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => new Intl.NumberFormat(undefined, { style: 'currency', currency: S.currency }).format(c / 100);
const signed = t => (t.type === 'income' ? '+ ' : '− ') + money(t.amountCents);
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fmtDate = s => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let toastT;
function toast(msg, bad) {
  const el = $('#toast'); el.textContent = msg; el.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), bad ? 5000 : 2600);
}
const ICONS = {
  dashboard: '<path d="M4 11l8-7 8 7v9H4z"/>', transactions: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>' };
const TABS = [['dashboard', 'Home'], ['transactions', 'Activity'], ['stats', 'Insights'], ['settings', 'Settings']];

async function reload() { S.tx = L.sortTx(await DB.all()); }
function go(v) { S.view = v; render(); $('#view').focus({ preventScroll: true }); window.scrollTo(0, 0); }

function render() {
  $('.nav').innerHTML = TABS.map(([k, n]) => `<button data-go="${k}" ${S.view === k ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k === 'dashboard' ? 'dashboard' : k === 'transactions' ? 'transactions' : k === 'stats' ? 'stats' : 'settings']}</svg>${n}</button>`).join('');
  const v = { dashboard, transactions, stats, settings }[S.view];
  $('#view').innerHTML = (S.dbOk ? '' : `<div class="card warn" role="alert"><b>Storage unavailable.</b><p class="muted">Your browser blocked local storage (private mode?). Nothing you enter can be saved. Open Ledger in a normal window.</p></div>`) + v();
}
const txRow = t => `<button class="row" data-edit="${t.id}" aria-label="Edit ${esc(t.description || t.category)}">
  <div class="main"><div class="name">${esc(t.description || t.category)}</div>
  <div class="muted"><span class="tag">${t.type === 'income' ? 'Income' : 'Expense'}</span>${esc(t.category)} · ${fmtDate(t.date)}</div></div>
  <div class="amt">${signed(t)}</div></button>`;

function dashboard() {
  const t = L.totals(S.tx);
  return `<p class="muted">Your private ledger</p><h1>Overview</h1>
  <section class="hero" aria-label="Current balance"><div class="label">Current balance</div>
  <div class="bal">${money(t.balance)}</div>
  <div class="split"><div><span class="muted">Income</span><b>+ ${money(t.income)}</b></div><div><span class="muted">Expenses</span><b>− ${money(t.expense)}</b></div></div></section>
  <div class="actions"><button class="btn primary" data-add="income">+ Add money</button><button class="btn" data-add="expense">+ Add expense</button></div>
  <h2>Recent</h2><div class="card">${S.tx.length ? S.tx.slice(0, 5).map(txRow).join('') : `<div class="empty">No transactions yet.<br>Add your first income to begin.</div>`}</div>
  ${S.tx.length > 5 ? `<p style="text-align:center;margin-top:12px"><button class="btn" data-go="transactions">See all activity</button></p>` : ''}`;
}
function transactions() {
  const list = S.tx.filter(t => S.filter === 'all' || t.type === S.filter);
  return `<h1>Activity</h1><div class="seg" role="group" aria-label="Filter">${[['all', 'All'], ['income', 'Income'], ['expense', 'Expenses']].map(([k, n]) => `<button data-filter="${k}" aria-pressed="${S.filter === k}">${n}</button>`).join('')}</div>
  <div class="card">${list.length ? list.map(txRow).join('') : '<div class="empty">Nothing here yet.</div>'}</div>`;
}
function stats() {
  const t = L.totals(S.tx), cats = L.byCategory(S.tx), months = L.lastMonths(S.tx), max = Math.max(1, ...months.flatMap(m => [m.income, m.expense]));
  return `<h1>Insights</h1>
  <div class="card"><div class="split" style="border:0;padding:0"><div><span class="muted">Income</span><b>${money(t.income)}</b></div><div><span class="muted">Expenses</span><b>${money(t.expense)}</b></div><div><span class="muted">Balance</span><b>${money(t.balance)}</b></div></div></div>
  <h2>Spending by category</h2><div class="card">${cats.length ? cats.map(([c, v]) => `<div class="bar"><span>${esc(c)}</span><span><i style="width:${Math.max(2, v / t.expense * 100)}%"></i></span><span>${money(v)} · ${Math.round(v / t.expense * 100)}%</span></div>`).join('') : '<div class="empty">Add an expense to see where your money goes.</div>'}</div>
  <h2>Income vs expenses, last 6 months</h2><div class="card"><div class="months" role="img" aria-label="Monthly income and expenses">${months.map(m => `<div><div class="pair"><i class="i-in" style="height:${m.income / max * 100}%" title="Income ${money(m.income)}"></i><i class="i-ex" style="height:${m.expense / max * 100}%" title="Expenses ${money(m.expense)}"></i></div>${m.label}</div>`).join('')}</div>
  <div class="legend"><span><b class="i-in"></b>Income</span><span><b class="i-ex"></b>Expenses</span></div></div>`;
}

/* ---------- PWA install ---------- */
let deferredPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; if (S.view === 'settings') render(); });
addEventListener('appinstalled', () => { deferredPrompt = null; toast('Ledger installed'); if (S.view === 'settings') render(); });
function installCard() {
  if (isStandalone()) return '<p class="muted">Ledger is installed and running as an app.</p>';
  if (deferredPrompt) return '<p class="muted">Install Ledger for quick access and full offline use.</p><button class="btn primary" data-install>Install app</button>';
  if (isIOS()) return '<p class="muted"><b>iPhone / iPad (Safari):</b> tap the Share button, then <b>Add to Home Screen</b>.</p>';
  return '<p class="muted"><b>Android / Chrome:</b> menu (⋮) → <b>Install app</b> or <b>Add to Home Screen</b>.<br><b>Desktop Chrome / Edge:</b> install icon in the address bar, or menu → <b>Install Ledger</b>.</p>';
}
async function lastBackup() { const d = await DB.getMeta('lastBackup', null); return d ? new Date(d).toLocaleString() : 'Never'; }
let lastBackupText = 'Never';
function settings() {
  return `<h1>Settings</h1>
  <h2>Data &amp; backup</h2><div class="card" id="backup">
   <p><b>Your financial data is stored locally on your device.</b> Export a backup regularly to avoid losing your data.</p>
   <p class="muted" style="margin:6px 0 14px">Last backup: ${esc(lastBackupText)} · ${S.tx.length} transactions</p>
   <div class="actions" style="margin:0"><button class="btn primary" data-export>Export backup</button><label class="btn" style="margin:0;display:grid;place-items:center;color:var(--cream)" tabindex="0" data-restore-label>Restore backup<input type="file" id="restore" accept=".json,application/json"></label></div></div>
  <h2>Currency</h2><div class="card"><label for="cur" style="margin-top:0">Display currency</label><select id="cur">${L.CURRENCIES.map(c => `<option ${c === S.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
  <h2>Install</h2><div class="card">${installCard()}</div>
  <h2>About</h2><div class="card"><p>Ledger · version 1.0.0</p><p class="muted">Offline-first. No account, no server — everything stays in this browser's IndexedDB.</p></div>
  <h2>Danger zone</h2><div class="card warn"><p class="muted" style="margin-bottom:12px">Permanently removes all transactions and settings from this device.</p><button class="btn danger" data-wipe>Delete all data</button></div>`;
}

/* ---------- modals ---------- */
function openModal(html) {
  const m = $('#modal'); m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false;
  const f = m.querySelector('input,select,button'); f && f.focus(); return m;
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function confirmBox({ title, body, ok, typed }) {
  return new Promise(res => {
    const m = openModal(`<h2 style="margin-top:0">${esc(title)}</h2><p class="muted">${body}</p>
    ${typed ? `<label for="cf">Type <b>${typed}</b> to confirm</label><input id="cf" autocomplete="off">` : ''}
    <div class="btns"><button class="btn" data-no>Cancel</button><button class="btn danger" data-yes ${typed ? 'disabled' : ''}>${esc(ok)}</button></div>`);
    const yes = m.querySelector('[data-yes]');
    if (typed) m.querySelector('#cf').oninput = e => { yes.disabled = e.target.value.trim() !== typed; };
    m.querySelector('[data-no]').onclick = () => { closeModal(); res(false); };
    yes.onclick = () => { closeModal(); res(true); };
  });
}

function openForm(type, tx) {
  const cats = type === 'income' ? L.INCOME_CATEGORIES : L.EXPENSE_CATEGORIES;
  const v = tx || { amountCents: '', description: '', category: cats[0], date: today(), note: '' };
  const m = openModal(`<h2 style="margin-top:0">${tx ? 'Edit' : 'Add'} ${type === 'income' ? 'income' : 'expense'}</h2>
  <div id="fe" class="err" role="alert"></div>
  <label for="f-amount">Amount (${esc(S.currency)})</label><input id="f-amount" inputmode="decimal" autocomplete="off" value="${tx ? (tx.amountCents / 100).toFixed(2) : ''}" placeholder="0.00"><div class="err" id="e-amount"></div>
  <label for="f-desc">Description</label><input id="f-desc" maxlength="80" value="${esc(v.description)}" placeholder="${type === 'income' ? 'e.g. Salary' : 'e.g. Groceries'}"><div class="err" id="e-description"></div>
  <label for="f-cat">Category</label><select id="f-cat">${cats.concat(cats.includes(v.category) ? [] : [v.category]).map(c => `<option ${c === v.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
  <label for="f-date">Date</label><input id="f-date" type="date" value="${v.date}"><div class="err" id="e-date"></div>
  <label for="f-note">Note (optional)</label><textarea id="f-note" rows="2" maxlength="300">${esc(v.note)}</textarea>
  <div class="btns"><button class="btn" data-no>Cancel</button><button class="btn primary" data-save>${type === 'income' ? 'Save income' : 'Save expense'}</button></div>
  ${tx ? '<p style="text-align:center;margin-top:14px"><button class="btn danger" data-del>Delete transaction</button></p>' : ''}`);
  m.querySelector('[data-no]').onclick = closeModal;
  m.querySelector('[data-save]').onclick = async () => {
    const form = { amount: $('#f-amount').value, description: $('#f-desc').value.trim(), category: $('#f-cat').value, date: $('#f-date').value, note: $('#f-note').value.trim() };
    const r = L.validateTx(form);
    ['amount', 'description', 'date'].forEach(k => { $('#e-' + k).textContent = r.errors[k] || ''; });
    if (!r.ok) return;
    const rec = { id: tx ? tx.id : uid(), type, amountCents: r.amountCents, description: form.description || form.category, category: form.category, date: form.date, note: form.note, createdAt: tx ? tx.createdAt : Date.now() };
    try { await DB.put(rec); await reload(); closeModal(); render(); toast(tx ? 'Changes saved' : type === 'income' ? 'Income saved' : 'Expense saved'); }
    catch (e) { $('#fe').textContent = 'Could not save: ' + e.message + ' Your entry was NOT saved.'; }
  };
  const del = m.querySelector('[data-del]');
  if (del) del.onclick = async () => {
    closeModal();
    if (!await confirmBox({ title: 'Delete this transaction?', body: 'This cannot be undone.', ok: 'Delete' })) return;
    try { await DB.remove(tx.id); await reload(); render(); toast('Transaction deleted'); } catch (e) { toast('Delete failed: ' + e.message, true); }
  };
}

/* ---------- backup / restore ---------- */
async function exportBackup() {
  try {
    const data = L.makeBackup(await DB.all(), S.currency);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `ledger-backup-${today()}.json` });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    await DB.setMeta('lastBackup', new Date().toISOString()); lastBackupText = await lastBackup(); render();
    toast(`Backup exported (${data.transactions.length} transactions)`);
  } catch (e) { toast('Export failed: ' + e.message, true); }
}
async function restoreFile(file) {
  if (!file) return;
  const r = L.validateBackup(await file.text().catch(() => ''));
  if (!r.ok) return toast(r.error, true);
  if (!await confirmBox({ title: 'Replace your data?', body: `This backup has <b>${r.transactions.length}</b> transactions. Your current <b>${S.tx.length}</b> transactions will be <b>replaced</b>. Export a backup first if unsure.`, ok: 'Replace with backup' })) return;
  try {
    await DB.replaceAll(r.transactions); // atomic: all-or-nothing
    if (r.currency) { S.currency = r.currency; await DB.setMeta('currency', r.currency); }
    await reload(); render(); toast(`Restored ${r.transactions.length} transactions`);
  } catch (e) { toast('Restore failed — your existing data is untouched. ' + e.message, true); }
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-go],[data-add],[data-edit],[data-filter],[data-export],[data-wipe],[data-install]'); if (!t) return;
  const d = t.dataset;
  if (d.go) go(d.go);
  else if (d.add) openForm(d.add);
  else if (d.edit) { const x = S.tx.find(y => y.id === d.edit); if (x) openForm(x.type, x); }
  else if (d.filter) { S.filter = d.filter; render(); }
  else if ('export' in d) exportBackup();
  else if ('install' in d && deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; render(); }
  else if ('wipe' in d && await confirmBox({ title: 'Delete all financial data?', body: 'This action cannot be undone. Consider exporting a backup first.', ok: 'Delete everything', typed: 'DELETE' })) {
    try { await DB.clearAll(); S.currency = 'USD'; await reload(); render(); toast('All data deleted'); } catch (err) { toast('Delete failed: ' + err.message, true); }
  }
});
document.addEventListener('change', async e => {
  if (e.target.id === 'restore') { await restoreFile(e.target.files[0]); e.target.value = ''; }
  if (e.target.id === 'cur') { try { await DB.setMeta('currency', e.target.value); S.currency = e.target.value; render(); toast('Currency updated'); } catch (err) { toast(err.message, true); } }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-restore-label]')) e.target.querySelector('input').click(); });

/* ---------- service worker + updates ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = w => {
      const b = $('#banner'); b.hidden = false; b.innerHTML = 'A new version is available. <button>Refresh to update</button>';
      b.querySelector('button').onclick = () => w.postMessage('SKIP_WAITING');
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
  }).catch(() => toast('Offline mode could not start. The app still works while online.', true));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
}

/* ---------- boot ---------- */
(async function boot() {
  try {
    await DB.init(); S.currency = await DB.getMeta('currency', 'USD'); await reload(); lastBackupText = await lastBackup();
    navigator.storage && navigator.storage.persist && navigator.storage.persist(); // ask browser not to evict our data
  } catch (e) { S.dbOk = false; }
  render(); registerSW();
})();
