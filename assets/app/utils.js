// Утилиты

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

// короткое имя без отчества
export function shortUser(u) {
  const last = (pick(u,'LAST_NAME','lastName')||'').trim();
  const name = (pick(u,'NAME','firstName')||'').trim();
  return [last, name].filter(Boolean).join(' ');
}

// UF getter c учетом карты соответствий
export function UF(item, code){
  if (!item || !code) return undefined;
  if (window.__UF_KEYMAP && window.__UF_KEYMAP[code]) {
    const k = window.__UF_KEYMAP[code];
    if (item[k] !== undefined) return item[k];
  }
  if (item[code] !== undefined) return item[code];
  const lc = String(code).toLowerCase();
  for (const k in item) if (k.toLowerCase() === lc) return item[k];
  const f = item.fields || item.FIELDS || {};
  if (f[code] !== undefined) return f[code];
  for (const k in f) if (k.toLowerCase() === lc) return f[k];
  return undefined;
}

export function putEnum(dict, code, id, value) {
  if (!code || id == null) return;
  dict[code] = dict[code] || {};
  const s = String(id);
  dict[code][s] = value;
  dict[code][Number.isNaN(Number(s)) ? s : Number(s)] = value;
}

export function enumText(dict, code, raw) {
  if (raw === null || raw === undefined || raw === '') return '—';
  const d = dict[code] || {};
  const s = String(raw);
  if (d[s] !== undefined) return d[s];
  const n = Number(s);
  if (!Number.isNaN(n) && d[n] !== undefined) return d[n];
  return raw;
}

export function idFromBinding(code, typeId) {
  const m = String(code || '').match(/DYNAMIC_(\d+)_(\d+)/);
  return m && Number(m[1]) === Number(typeId) ? Number(m[2]) : null;
}

export function parseStage(sid) {
  const m = String(sid || '').match(/^DT(\d+)_(\d+):(.+)$/);
  if (!m) return { typeId: null, categoryId: null, statusId: String(sid || '') };
  return { typeId: Number(m[1]), categoryId: Number(m[2]), statusId: m[3] };
}
