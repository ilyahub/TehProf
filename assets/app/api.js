// assets/app/api.js
// Низкоуровневые обёртки и helper-ы для работы с BX24 (ES-модуль)

// ----------------------------
// BX24 wrappers
// ----------------------------
export const bx = {
  call(method, params = {}) {
    return new Promise(resolve => BX24.callMethod(method, params, res => resolve(res)));
  },
  batch(calls) {
    return new Promise(resolve => BX24.callBatch(calls, resolve, true));
  }
};

// ----------------------------
// Базовые вызовы
// ----------------------------
export async function getDeal(id) {
  const r = await bx.call('crm.deal.get', { id });
  return r.error() ? null : r.data();
}

export async function getItem(entityTypeId, id) {
  const r = await bx.call('crm.item.get', { entityTypeId, id });
  return r.error() ? null : r.data().item;
}

export async function getItemsByIds(entityTypeId, ids, select) {
  const r = await bx.call('crm.item.list', {
    entityTypeId,
    filter: { '@id': ids },
    ...(select ? { select } : {})
  });
  if (r.error()) return [];
  const d = r.data();
  return (d.items || d || []);
}

export async function listUserFields(entityTypeId) {
  const r = await bx.call('crm.item.userfield.list', { entityTypeId });
  if (r.error()) return [];
  return r.data().userFields || r.data() || [];
}

export async function updateItemStage(entityTypeId, id, stageId) {
  const r = await bx.call('crm.item.update', { entityTypeId, id, fields: { stageId } });
  return !r.error();
}

export async function listUsers(ids) {
  if (!ids?.length) return {};
  const calls = {};
  ids.forEach((uid, i) => (calls['u' + i] = ['user.get', { ID: String(uid) }]));
  const res = await bx.batch(calls);
  const map = {};
  for (const k in res) {
    if (!res[k].error()) {
      const raw = (res[k].data() || [])[0] || {};
      const id = Number(raw.ID || raw.id);
      if (id) map[id] = raw;
    }
  }
  return map;
}

export async function listCategoryStages(entityTypeId, categoryIds) {
  if (!categoryIds?.length) return [];
  const calls = {};
  categoryIds.forEach((cid, i) => (calls['s' + i] = ['crm.category.stage.list', { entityTypeId, categoryId: cid }]));
  const res = await bx.batch(calls);
  const rows = [];
  for (const k in res) if (!res[k].error()) rows.push(res[k].data());
  return rows;
}

// ----------------------------
// Извлечение связанных ID из UF-поля сделки
// ----------------------------
/**
 * Возвращает массив ID элементов умных процессов, связанных со сделкой через UF-поле сделки.
 * Поддерживает:
 *   - строки вида "DYNAMIC_1032_112, DYNAMIC_1032_113" / "112,113"
 *   - массивы/числа
 */
export async function getLinkedItemIds(dealId, ufFieldCode, smartEntityTypeId) {
  const deal = await getDeal(dealId);
  if (!deal) return [];

  const tryKeys = [
    ufFieldCode,
    String(ufFieldCode).toUpperCase(),
    String(ufFieldCode).toLowerCase()
  ];

  let raw;
  for (const k of tryKeys) {
    if (deal[k] !== undefined) {
      raw = deal[k];
      break;
    }
  }
  if (raw == null) return [];

  let ids = [];
  const toNum = (v) => {
    const m = String(v).match(/DYNAMIC_(\d+)_(\d+)/);
    if (m) return Number(m[2]);
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  if (Array.isArray(raw)) {
    ids = raw.map(toNum).filter(Number.isFinite);
  } else if (typeof raw === 'string') {
    ids = raw
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(toNum)
      .filter(Number.isFinite);
  } else if (typeof raw === 'number') {
    ids = [raw];
  } else if (raw && typeof raw === 'object' && raw.ID) {
    const n = Number(raw.ID);
    if (Number.isFinite(n)) ids = [n];
  }

  // уникализируем и сохраняем исходный порядок, если нужно
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// ----------------------------
// Надёжная загрузка элементов
// ----------------------------
/**
 * Пытается сначала list с фильтром @id (быстро),
 * если вернулось пусто/ошибка — делает batch по get (надёжно)
 */
export async function robustGetItemsByIds(entityTypeId, ids, select) {
  if (!ids?.length) return [];

  // 1) Быстрый путь — crm.item.list
  const r = await bx.call('crm.item.list', {
    entityTypeId,
    filter: { '@id': ids },
    ...(select ? { select } : {})
  });

  let rows = [];
  if (!r.error()) {
    const d = r.data();
    rows = (d.items || d || []);
  }

  // Если вернулось — приводим к исходному порядку ids
  if (rows?.length) {
    const byId = new Map(rows.map(it => [Number(it.id || it.ID), it]));
    return ids.map(id => byId.get(Number(id))).filter(Boolean);
  }

  // 2) Фоллбэк — batch crm.item.get
  const calls = {};
  ids.forEach((id, i) => (calls['i' + i] = ['crm.item.get', { entityTypeId, id }]));
  const res = await bx.batch(calls);
  const out = [];
  for (const k in res) if (!res[k].error()) {
    const item = (res[k].data() || {}).item || res[k].data();
    if (item) out.push(item);
  }
  return out;
}

// ----------------------------
// Полезные штуки для UI: buildSelect + fetchFieldMeta
// ----------------------------
export function buildSelect() {
  // Всегда запрашиваем базовые поля, нужные для стадий и таблицы
  const base = [
    'id', 'title', 'assignedById',
    'stageId',     // важно для имени стадии
    'categoryId',  // нужно для подбора стадий по воронке
  ];

  // Здесь перечисляем UF-поля, которые должны прийти в таблицу:
  base.push(
    'ufCrm10_1717328665682', // ID исходной сделки
    'ufCrm10_1717328730625', // Лицензионный ключ
    'ufCrm10_1717328814784', // Адрес портала (url)
    'ufCrm10_1717329015552', // Текущий тариф (enum)
    'ufCrm10_1717329087589', // Дата окончания тарифа
    'ufCrm10_1717329109963', // Дата окончания подписки
    'ufCrm10_1717329453779', // Продукт (enum)
  );

  return base;
}

/**
 * Тянем метаданные полей и строим:
 *  - карту соответствий UF_CRM_* -> ufCrm* (для удобного доступа)
 *  - словари enumerations (ID -> TEXT)
 */
export async function fetchFieldMeta(entityTypeId) {
  const r = await bx.call('crm.item.fields', { entityTypeId });
  if (r.error()) return { keymap: {}, enums: {} };

  const fields = r.data().fields || r.data() || {};
  const keymap = {};
  const enums = {};

  for (const code in fields) {
    const f = fields[code] || {};
    const upper = (f.upperName || code).toUpperCase();

    // Карта соответствий для UF (UF_CRM_* -> ufCrm*)
    if (/^UF_CRM/.test(upper) || /^UFCRM/.test(upper)) {
      keymap[upper] = code; // например UF_CRM_10_... -> ufCrm10_...
    }

    // Словари для перечислений
    if (f.type === 'enumeration' && Array.isArray(f.items)) {
      enums[upper] = {};
      for (const opt of f.items) {
        enums[upper][String(opt.ID)] = opt.VALUE;
      }
    }
  }

  return { keymap, enums };
}
// --- ДОБАВИТЬ КОНЕЦ assets/app/api.js ---

// Обновить UF-поле сделки (массив ID связанных элементов)
export async function updateDealLinkedIds(dealId, fieldCode, ids) {
  const fields = {};
  fields[fieldCode] = ids;
  const r = await bx.call('crm.deal.update', { id: dealId, fields });
  return !r.error();
}

// Универсальная попытка открыть путь Bitrix (внутри фрейма)
export function openBxPath(path) {
  try {
    if (window.BX24 && typeof BX24.openPath === 'function') {
      BX24.openPath(path);
      return true;
    }
  } catch {}
  return false;
}

// Сервисный: получить путь к карточке смарт-процесса
export function smartItemPath(entityTypeId, id) {
  // Для смарт-процессов в Битрикс работает такой путь:
  return `/crm/type/${entityTypeId}/details/${id}/`;
}
