// assets/app/api.js
// Обёртки над BX24 + утилиты для main.js

export const bx = {
  call(method, params = {}) {
    return new Promise(resolve => BX24.callMethod(method, params, r => resolve(r)));
  },
  batch(calls) {
    return new Promise(resolve => BX24.callBatch(calls, resolve, true));
  }
};

// ---------- БАЗОВЫЕ ВСПОМОГАТЕЛЬНЫЕ ----------

// Надёжно достаём ID из биндингов вида "DYNAMIC_1032_123" или просто числа
function normalizeId(v, smartTypeId) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v || null;
  const s = String(v);
  const m = s.match(/^DYNAMIC_(\d+)_(\d+)$/);
  if (m && Number(m[1]) === Number(smartTypeId)) return Number(m[2]);
  if (!Number.isNaN(Number(s))) return Number(s);
  return null;
}

// ----- заменить эту функцию в assets/app/api.js -----

// Нормализация ID (число или биндинг "DYNAMIC_<typeId>_<id>")
function normalizeId(v, smartTypeId) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v || null;
  const s = String(v);
  const m = s.match(/^DYNAMIC_(\d+)_(\d+)$/);
  if (m && Number(m[1]) === Number(smartTypeId)) return Number(m[2]);
  if (!Number.isNaN(Number(s))) return Number(s);
  return null;
}

import { A } from './utils.js';

// …ваши bx.call / getDeal и прочее остаются как есть …

/**
 * Достаёт ID связанных смарт-элементов из сделки.
 * 1) Пытается прочитать из конкретного UF-поля (fieldCode).
 * 2) Если не нашли — сканирует все поля сделки.
 * Понимает форматы:
 *  - число / массив чисел
 *  - строка с числами ("12, 13;14 15")
 *  - JSON-массив/объекты [{id:123},{ID:124}] или bindings
 *  - строки вида "DYNAMIC_1032_123"
 */
export async function getLinkedItemIds(dealId, fieldCode /* string | null */, smartTypeId) {
  const deal = await getDeal(dealId);
  if (!deal) return [];

  const ids = new Set();

  // 1) попробовать строгое поле (в 3 регистрах на всякий случай)
  if (fieldCode) {
    const candidates = [
      deal[fieldCode],
      deal[String(fieldCode).toUpperCase()],
      deal[String(fieldCode).toLowerCase()],
    ];
    for (const val of candidates) parseAny(val, smartTypeId, ids);
  }

  // 2) если ничего не нашли — обойти все поля сделки (надёжный фолбэк)
  if (ids.size === 0) {
    for (const k in deal) parseAny(deal[k], smartTypeId, ids);
  }

  return Array.from(ids);
}

// ==== helpers ===============================================================

function parseAny(val, smartTypeId, out /* Set */) {
  if (val == null || val === '') return;

  // Число
  if (typeof val === 'number' && val > 0) {
    out.add(val);
    return;
  }

  // Строка
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return;

    // JSON?
    if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
      try {
        const j = JSON.parse(s);
        parseAny(j, smartTypeId, out);
        return;
      } catch { /* ignore */ }
    }

    // "DYNAMIC_1032_123" или просто «123, 124»
    const parts = s.split(/[\s,;]+/).filter(Boolean);
    for (const p of parts) {
      const m = p.match(/^DYNAMIC_(\d+)_(\d+)$/i);
      if (m) {
        if (Number(m[1]) === Number(smartTypeId)) out.add(Number(m[2]));
        continue;
      }
      const n = Number(p.replace(/[^\d]/g, ''));
      if (n > 0) out.add(n);
    }
    return;
  }

  // Массив
  if (Array.isArray(val)) {
    for (const x of val) parseAny(x, smartTypeId, out);
    return;
  }

  // Объект: {id:123} / {ID:123} / {entityTypeId, id} / {bindings:[...]}
  if (typeof val === 'object') {
    // bindings как в некоторых UF
    if (Array.isArray(val.bindings)) {
      for (const b of val.bindings) {
        const et = b.entityTypeId ?? b.ENTITY_TYPE_ID;
        const id = b.id ?? b.ID;
        if (Number(et) === Number(smartTypeId) && Number(id) > 0) out.add(Number(id));
      }
      return;
    }

    // одиночные варианты
    const id1 = val.id ?? val.ID ?? val.value ?? val.VALUE;
    const et1 = val.entityTypeId ?? val.ENTITY_TYPE_ID;
    if (id1 != null) {
      if (et1 == null || Number(et1) === Number(smartTypeId)) {
        const n = Number(String(id1).replace(/[^\d]/g, ''));
        if (n > 0) out.add(n);
      }
    }
  }
}



/**
 * Строим select для crm.item.list (поля, которые реально нужны в таблице)
 * F — карта UF-полей из config.js
 */
export function buildSelect(F) {
  return [
    'id',
    'title',
    'assignedById',
    'stageId',
    // оба регистра на всякий случай
    F.key, F.key?.toUpperCase(),
    F.url, F.url?.toUpperCase(),
    F.tariff, F.tariff?.toUpperCase(),
    F.tEnd, F.tEnd?.toUpperCase(),
    F.mEnd, F.mEnd?.toUpperCase(),
    F.product, F.product?.toUpperCase(),
  ].filter(Boolean);
}

/**
 * Надёжная загрузка элементов по ID:
 * 1) пытаемся одной командой через crm.item.list c фильтром "@id"
 * 2) если пусто/ошибка — делаем batch crm.item.get по каждому id
 */
export async function robustGetItemsByIds(entityTypeId, ids, select) {
  if (!ids.length) return [];

  // Попытка №1 — списком
  const r1 = await bx.call('crm.item.list', {
    entityTypeId,
    filter: { '@id': ids },
    select
  });

  if (!r1.error()) {
    const items = r1.data()?.items || [];
    if (items.length) return items;
  }

  // Попытка №2 — батчем
  const calls = {};
  ids.forEach((id, i) => (calls['it' + i] = ['crm.item.get', { entityTypeId, id }]));
  const res = await bx.batch(calls);
  const arr = [];
  for (const k in res) {
    if (!res[k].error()) {
      const it = res[k].data()?.item;
      if (it) arr.push(it);
    }
  }
  return arr;
}
