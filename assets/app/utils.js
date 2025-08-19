// assets/app/utils.js
// Небольшой набор утилит (ES-модуль)

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export const A = v => (!v ? [] : (Array.isArray(v) ? v : [v]));
export const J = s => { try { return JSON.parse(s); } catch { return {}; } };

export const pick = (o, ...ks) => {
  if (!o) return undefined;
  for (const k of ks) {
    if (o[k] !== undefined) return o[k];
    const K = String(k).toUpperCase();
    const L = String(k).toLowerCase();
    if (o[K] !== undefined) return o[K];
    if (o[L] !== undefined) return o[L];
  }
  return undefined;
};

export const fmtDate = v => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  const z = n => String(n).padStart(2, '0');
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()}`;
};

// Универсальный геттер UF-поля: ищет в нескольких местах/регистрах
export function UF(item, code) {
  if (!item || !code) return undefined;
  if (item[code] !== undefined) return item[code];
  const lc = String(code).toLowerCase();
  for (const k in item) if (String(k).toLowerCase() === lc) return item[k];
  const f = item.fields || item.FIELDS || {};
  if (f[code] !== undefined) return f[code];
  for (const k in f) if (String(k).toLowerCase() === lc) return f[k];
  return undefined;
}

// Нормализатор словарей enumeration (держим ключи и как number, и как string)
export function putEnum(dict, code, id, value) {
  if (!code || id == null) return;
  dict[code] = dict[code] || {};
  const s = String(id);
  dict[code][s] = value;
  dict[code][Number.isNaN(Number(s)) ? s : Number(s)] = value;
}

// Текст из словаря перечисления (возвращает исходное значение, если в словаре нет)
export function enumText(dict, code, raw) {
  if (raw === null || raw === undefined || raw === '') return '—';
  const d = dict[code] || {};
  const s = String(raw);
  if (d[s] !== undefined) return d[s];
  const n = Number(s);
  if (!Number.isNaN(n) && d[n] !== undefined) return d[n];
  return raw;
}

// ID из биндинга вида DYNAMIC_1032_123 -> 123
export function idFromBinding(code, typeId) {
  const m = String(code || '').match(/DYNAMIC_(\d+)_(\d+)/);
  return m && Number(m[1]) === Number(typeId) ? Number(m[2]) : null;
}

// Разбор StageId 'DT1032_16:NEW'
export function parseStage(sid) {
  const m = String(sid || '').match(/^DT(\d+)_(\d+):(.+)$/);
  if (!m) return { typeId: null, categoryId: null, statusId: String(sid || '') };
  return { typeId: Number(m[1]), categoryId: Number(m[2]), statusId: m[3] };
}
