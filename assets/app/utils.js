// assets/app/utils.js
export const $ = s => document.querySelector(s);
export const A = v => (!v ? [] : (Array.isArray(v) ? v : [v]));
export const J = s => { try { return JSON.parse(s); } catch { return {}; } };
export const fmtDate = v => {
  if (!v) return '—';
  const d = new Date(v); if (isNaN(d)) return '—';
  const z = n => String(n).padStart(2, '0');
  return `${z(d.getDate())}.${z(d.getMonth()+1)}.${d.getFullYear()}`;
};
export const pick = (o, ...ks) => {
  if (!o) return;
  for (const k of ks) {
    if (o[k] !== undefined) return o[k];
    const K = String(k).toUpperCase(), L = String(k).toLowerCase();
    if (o[K] !== undefined) return o[K];
    if (o[L] !== undefined) return o[L];
  }
};
export const parseStage = sid => {
  const m = String(sid || '').match(/^DT(\d+)_(\d+):(.+)$/);
  return m ? { typeId: +m[1], categoryId: +m[2], statusId: m[3] } : { typeId:null, categoryId:null, statusId:String(sid||'') };
};
// универсальный геттер UF
export function UF(item, code){
  if(!item||!code) return undefined;
  if(item[code]!==undefined) return item[code];
  const lc = code.toLowerCase();
  for(const k in item){ if(k.toLowerCase()===lc) return item[k]; }
  const f=item.fields||item.FIELDS||{};
  if(f[code]!==undefined) return f[code];
  for(const k in f){ if(k.toLowerCase()===lc) return f[k]; }
  return undefined;
}
