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

/**
 * Возвращает ID связанных смарт-элементов (typeId) для сделки.
 * Ничего не знаем о коде поля — просто сканируем все поля сделки и вытягиваем
 * все встреченные значения вида DYNAMIC_<typeId>_<id> или голые числа.
 *
 * @param {number} dealId
 * @param {null|undefined|string} _fieldCode  // игнорируется (оставлен для совместимости)
 * @param {number} smartTypeId
 * @return {Promise<number[]>}
 */
export async function getLinkedItemIds(dealId, _fieldCode, smartTypeId) {
  const r = await bx.call('crm.deal.get', { id: dealId });
  if (r.error()) return [];

  const deal = r.data() || {};
  const out = new Set();

  const collect = (val) => {
    if (val == null) return;
    if (Array.isArray(val)) {
      val.forEach(collect);
      return;
    }
    if (typeof val === 'number') {
      const id = normalizeId(val, smartTypeId);
      if (id) out.add(id);
      return;
    }
    const s = String(val);
    // если одна строка — разбиваем по разделителям
    s.split(/[,\s;]+/)
      .map(x => x.trim())
      .filter(Boolean)
      .forEach(x => {
        const id = normalizeId(x, smartTypeId);
        if (id) out.add(id);
      });
  };

  // пробегаем ВСЕ поля сделки (особенно UF_*)
  for (const k in deal) {
    const v = deal[k];
    if (v == null) continue;
    // интерес представляют строки/числа/массивы, чаще это UF_* поля
    if (k.startsWith('UF_') || Array.isArray(v) || typeof v === 'string' || typeof v === 'number') {
      collect(v);
    }
  }
  return Array.from(out);
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
