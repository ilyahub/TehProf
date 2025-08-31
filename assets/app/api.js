// assets/app/api.js

// ---------------------------
// Обёртка над Bitrix REST
// ---------------------------
export const bx = {
  call(method, params = {}) {
    return new Promise(resolve => BX24.callMethod(method, params, res => resolve(res)));
  },
  batch(calls) {
    return new Promise(resolve => BX24.callBatch(calls, resolve, true));
  }
};

// ---------------------------
// Базовые геттеры
// ---------------------------
export async function getDeal(id) {
  const r = await bx.call('crm.deal.get', { id });
  return r.error() ? null : r.data();
}

export async function getItem(entityTypeId, id, select = []) {
  const r = await bx.call('crm.item.get', { entityTypeId, id, select });
  return r.error() ? null : (r.data().item || null);
}

// Пакетная загрузка по списку id (фоллбэк на batch, если фильтр @id не сработал)
export async function robustGetItemsByIds(entityTypeId, ids, select = []) {
  if (!Array.isArray(ids) || !ids.length) return [];
  // 1) пробуем быстрым путём
  {
    const r = await bx.call('crm.item.list', {
      entityTypeId,
      filter: { '@id': ids },
      select
    });
    if (!r.error()) {
      const items = (r.data().items || []);
      // если что-то вернулось — используем
      if (items.length) return items;
    }
  }
  // 2) фоллбэк: crm.item.get батчем
  const calls = {};
  ids.forEach((id, i) => {
    calls['i' + i] = ['crm.item.get', { entityTypeId, id, select }];
  });
  const res = await bx.batch(calls);
  const items = [];
  for (const k in res) {
    if (!res[k].error()) {
      const it = res[k].data().item;
      if (it) items.push(it);
    }
  }
  return items;
}

// ---------------------------
// Связанные ID из UF-поля сделки
// ---------------------------
// Поддерживаются форматы: [123, 456], ["123","456"], ["DYNAMIC_1032_123", ...]
export async function getLinkedItemIds(dealId, fieldCode, targetTypeId /* = SMART_ENTITY_TYPE_ID */) {
  const d = await getDeal(dealId);
  if (!d) return [];
  const raw = d[fieldCode] ?? d.fields?.[fieldCode];
  if (!raw) return [];

  const arr = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const v of arr) {
    if (v == null || v === '') continue;
    if (typeof v === 'number') { out.push(v); continue; }
    if (/^\d+$/.test(String(v))) { out.push(Number(v)); continue; }
    const m = String(v).match(/^DYNAMIC_(\d+)_(\d+)$/i);
    if (m) {
      const typeId = Number(m[1]);
      const id     = Number(m[2]);
      if (!targetTypeId || typeId === Number(targetTypeId)) out.push(id);
    }
  }
  return out;
}

// ---------------------------
// Пользователи, стадии, UF-мета
// ---------------------------
export async function listUsers(ids /* number[] */) {
  const unique = [...new Set((ids || []).filter(Boolean).map(Number))];
  if (!unique.length) return {};
  const calls = {};
  unique.forEach((uid, i) => calls['u' + i] = ['user.get', { ID: String(uid) }]);
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

export async function listCategoryStages(entityTypeId, categoryIds /* number[] */) {
  const calls = {};
  (categoryIds || []).forEach((cid, i) => {
    calls['s' + i] = ['crm.category.stage.list', { entityTypeId, categoryId: cid }];
  });
  const res = await bx.batch(calls);
  const rows = [];
  for (const k in res) if (!res[k].error()) rows.push(res[k].data());
  return rows;
}

// SELECT для crm.item.list — базовые поля и нужные UF
export function buildSelect() {
  const base = [
    'id', 'title', 'assignedById',
    'stageId',    // нужно для имени стадии
    'categoryId', // нужно для подбора стадий
  ];
  // ваши UF-поля (оставил из переписки)
  base.push(
    'ufCrm10_1717328665682', // ID исходной сделки
    'ufCrm10_1717328730625', // Лицензионный ключ
    'ufCrm10_1717328814784', // Адрес портала (URL)
    'ufCrm10_1717329015552', // Текущий тариф (enum)
    'ufCrm10_1717329087589', // Дата окончания тарифа
    'ufCrm10_1717329109963', // Дата окончания подписки
    'ufCrm10_1717329453779', // Продукт (enum)
  );
  return base;
}

// Метаданные полей: карта UF_CRM_* -> ufCrm* и словари enum
export async function fetchFieldMeta(entityTypeId) {
  const r = await bx.call('crm.item.fields', { entityTypeId });
  if (r.error()) return { keymap: {}, enums: {} };

  const fields = r.data().fields || r.data() || {};
  const keymap = {};
  const enums  = {};

  for (const code in fields) {
    const f = fields[code] || {};
    const upper = (f.upperName || code).toUpperCase();

    if (upper.startsWith('UF_CRM')) keymap[upper] = code;

    if (f.type === 'enumeration' && Array.isArray(f.items)) {
      enums[upper] = {};
      for (const opt of f.items) {
        enums[upper][String(opt.ID)] = opt.VALUE;
      }
    }
  }
  return { keymap, enums };
}

// ---------------------------
// Работа со стадиями / полями
// ---------------------------
export async function updateItemStage(entityTypeId, id, stageId) {
  const r = await bx.call('crm.item.update', { entityTypeId, id, fields: { stageId } });
  return !r.error();
}

// Обновить массив id в UF-поле сделки (для «прикреплённых» элементов)
export async function updateDealLinkedIds(dealId, fieldCode, ids /* number[] | ["DYNAMIC_..."] */) {
  const fields = {};
  fields[fieldCode] = ids;
  const r = await bx.call('crm.deal.update', { id: dealId, fields });
  return !r.error();
}

// ---------------------------
// Навигация / ссылки
// ---------------------------
export function openBxPath(path) {
  try { if (window.BX24?.openPath) { BX24.openPath(path); return true; } } catch {}
  return false;
}
export function smartItemPath(entityTypeId, id) {
  return `/crm/type/${entityTypeId}/details/${id}/`;
}

// ---------------------------
// Поиск смарт-элементов (для пикера)
// ---------------------------
// Возвращает { items, next } где next можно передать повторно для пагинации.
export async function searchSmartItems(entityTypeId, query = '', limit = 20, start = 0, select = []) {
  const params = {
    entityTypeId,
    order: { id: 'desc' },
    start,
    limit, // Bitrix учитывает limit в list
    select: select.length ? select : undefined,
  };
  if (query && query.trim()) {
    params.filter = { search: query.trim() };
  }
  const r = await bx.call('crm.item.list', params);
  if (r.error()) return { items: [], next: null };
  const data = r.data();
  return { items: data.items || [], next: data.next || null };
}
