// assets/app/utils.js

// Короткие хелперы
export const $  = (s) => document.querySelector(s);
export const A  = (v) => !v ? [] : (Array.isArray(v) ? v : [v]);
export const J  = (s) => { try { return JSON.parse(s); } catch { return {}; } };

// выбор значения по разным вариантам ключа (любимец BX REST)
export function pick(o, ...ks) {
  if (!o) return undefined;
  for (const k of ks) {
    if (o[k] !== undefined) return o[k];
    const K = String(k).toUpperCase();
    const L = String(k).toLowerCase();
    if (o[K] !== undefined) return o[K];
    if (o[L] !== undefined) return o[L];
  }
  return undefined;
}

export const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  const z = (n) => String(n).padStart(2, '0');
  return `${z(d.getDate())}.${z(d.getMonth()+1)}.${d.getFullYear()}`;
};

// нормализация ключей UF (для сопоставления UF_CRM_* и ufCrm*)
const _norm = (s) => String(s || '').toLowerCase().replace(/_/g, '');

// Универсальный геттер UF-поля (ловит и UF_CRM_..., и ufCrm...)
export function UF(item, code) {
  if (!item || !code) return undefined;

  if (item[code] !== undefined) return item[code];

  const want = _norm(code);
  for (const k in item) {
    if (_norm(k) === want) return item[k];
  }

  const f = item.fields || item.FIELDS || {};
  if (f[code] !== undefined) return f[code];
  for (const k in f) {
    if (_norm(k) === want) return f[k];
  }
  return undefined;
}

// Строка привязки SPA: DYNAMIC_{typeId}_{itemId}
export const bcode = (t, id) => `DYNAMIC_${t}_${id}`;

// Из строки привязки берём id, валидируя typeId
export const toIdFromBinding = (code, t) => {
  const m = String(code || '').match(/DYNAMIC_(\d+)_(\d+)/);
  return m && Number(m[1]) === Number(t) ? Number(m[2]) : null;
};

// Парсер StageId вида DT{typeId}_{categoryId}:{statusId}
export function parseStage(sid) {
  const m = String(sid || '').match(/^DT(\d+)_(\d+):(.+)$/);
  return m ? { typeId: Number(m[1]), categoryId: Number(m[2]), statusId: m[3] } :
             { typeId: null, categoryId: null, statusId: String(sid || '') };
}

// Перевод 'UF_CRM_10_1717...' -> 'ufCrm10_1717...' (camelCase имя для select)
export const toCamelUF = (code) =>
  String(code)
    .replace(/^UF_CRM_/i, 'ufCrm')
    .replace(/_(\d)/g, (_, d) => d)
    .replace(/_/g, '');
