// Business logic — pure functions, no DOM, no storage (unit-testable).
export const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Education', 'Entertainment', 'Other']; // edit freely
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Gift', 'Other'];
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'DZD', 'MAD', 'TND', 'SAR', 'AED', 'CAD'];
export const BACKUP_FORMAT = 'ledger-backup', BACKUP_VERSION = 1;

// Money is stored as integer cents: no floating-point drift in totals.
export function parseAmount(s) {
  const t = String(s ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(parseFloat(t) * 100);
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00')) &&
  new Date(s + 'T00:00:00').toISOString().slice(0, 10) === s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s + 'T12:00:00').getDate() === +s.slice(8));

export function validateTx(f) {
  const errors = {};
  const amountCents = parseAmount(f.amount);
  if (amountCents === null) errors.amount = 'Enter an amount greater than 0 (e.g. 12.50).';
  if (!isDate(f.date)) errors.date = 'Choose a valid date.';
  if (!f.category) errors.category = 'Choose a category.';
  if (String(f.description || '').length > 80) errors.description = 'Keep the description under 80 characters.';
  return { errors, ok: !Object.keys(errors).length, amountCents };
}
export function totals(list) {
  let income = 0, expense = 0;
  for (const t of list) t.type === 'income' ? income += t.amountCents : expense += t.amountCents;
  return { income, expense, balance: income - expense };
}
export const sortTx = list => [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
export function byCategory(list) {
  const m = {}; for (const t of list) if (t.type === 'expense') m[t.category] = (m[t.category] || 0) + t.amountCents;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
export function lastMonths(list, n = 6, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: d.toLocaleString(undefined, { month: 'short' }), income: 0, expense: 0 });
  }
  for (const t of list) { const m = out.find(x => x.key === t.date.slice(0, 7)); if (m) m[t.type] += t.amountCents; }
  return out;
}
export const makeBackup = (transactions, currency) => ({
  format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), currency, transactions });

// Strict validation: reject the WHOLE file if anything is off, so a bad file can never half-restore.
export function validateBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'This file is not valid JSON — it may be corrupted.' }; }
  if (!data || data.format !== BACKUP_FORMAT) return { ok: false, error: 'This is not a Ledger backup file.' };
  if (!Number.isInteger(data.version) || data.version > BACKUP_VERSION) return { ok: false, error: 'This backup comes from a newer version of Ledger.' };
  if (!Array.isArray(data.transactions)) return { ok: false, error: 'The backup has no transaction list.' };
  const ids = new Set(), clean = [];
  for (const [i, t] of data.transactions.entries()) {
    const bad = !t || typeof t.id !== 'string' || !t.id || ids.has(t.id) || !['income', 'expense'].includes(t.type) ||
      !Number.isSafeInteger(t.amountCents) || t.amountCents <= 0 || !isDate(t.date) || typeof t.category !== 'string';
    if (bad) return { ok: false, error: `Transaction #${i + 1} is damaged. Nothing was restored.` };
    ids.add(t.id);
    clean.push({ id: t.id, type: t.type, amountCents: t.amountCents, date: t.date, category: t.category.slice(0, 40),
      description: String(t.description || '').slice(0, 80), note: String(t.note || '').slice(0, 300), createdAt: Number(t.createdAt) || Date.now() });
  }
  return { ok: true, transactions: clean, currency: CURRENCIES.includes(data.currency) ? data.currency : null };
}
