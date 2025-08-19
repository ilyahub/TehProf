// assets/app/api.js

// ===== Обёртки над BX24 =====
export const bx = {
  call(method, params = {}) {
    return new Promise(resolve => BX24.callMethod(method, params, res => resolve(res)));
  },
  batch(calls) {
    return new Promise(resolve => BX24.callBatch(calls, resolve, true));
  }
};

// ===== Базовые хелперы (оставляем, как у вас) =====
export async function getDeal(id) {
  const r = await bx.call('crm.deal.get', { id });
  return r.error() ? null : r.data();
}

export async function getItemsByIds(entityTypeId, ids, select) {
  const r = await bx.call('crm.item.list', { entityTypeId, filter: { '@id': ids }, select });
  if (r.error()) return [];
  return (r.data().items || []);
}

export async function getItem(entityTypeId, id) {
  const r = await bx.call('crm.item.get', { entityTypeId, id });
  return r.error() ? null : (r.data().item || null);
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

export async function listUsers(ids /* number[] */) {
  const calls = {};
  ids.forEach((uid, i) => calls['u' + i] = ['user.get', { ID: String(uid) }]);
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
  categoryIds.forEach((cid, i) => calls['s' + i] = ['crm.category.stage.list', { entityTypeId, categoryId: cid }]);
  const res = await bx.batch(calls);
  const rows = [];
  for (const k in res) if (!res[k].error()) rows.push(res[k].data());
  return rows;
}

// ===== ДОБАВЛЕНО: сбор ID связанных элементов из сделки =====
// Поддерживает:
//  - поле-связку типа CRM (массив вида "DYNAMIC_1032_123")
//  - массив объектов {ENTITY_TYPE_ID, ENTITY_ID}
//  - массив/строку с голыми числами ID
export async function getLinkedItemIds(dealId, bindingFieldCode, smartTypeId) {
  const deal = await getDeal(dealId);
  if (!deal) return [];

  // Пытаемся достать поле по разным регистрациям
  const v =
    deal[bindingFieldCode] ??
    deal[bindingFieldCode.toUpperCase?.()] ??
    deal[bindingFieldCode.toLowerCase?.()];

  if (!v) return [];

  const raw = Array.isArray(v) ? v : String(v).split(/[,;\s]+/).filter(Boolean);
  const ids = [];

  for (const it of raw) {
    // DYNAMIC_1032_123
    const m = String(it).match(/^DYNAMIC_(\d+)_(\d+)$/);
    if (m && Number(m[1]) === Number(smartTypeId)) {
      ids.push(Number(m[2]));
      continue;
    }
    // объект { ENTITY_TYPE_ID, ENTITY_ID }
    if (it && typeof it === 'object') {
      if (Number(it.ENTITY_TYPE_ID) === Number(smartTypeId) && it.ENTITY_ID) {
        ids.push(Number(it.ENTITY_ID));
        continue;
      }
    }
    // просто число
    if (/^\d+$/.test(String(it))) {
      ids.push(Number(it));
    }
  }

  return Array.from(new Set(ids));
}

// ===== ДОБАВЛЕНО: безопасная выборка элементов по списку ID =====
export async function robustGetItemsByIds(entityTypeId, ids, select) {
  if (!ids?.length) return [];

  // 1) Пробуем обычным list по '@id'
  const viaList = await getItemsByIds(entityTypeId, ids, select);
  if (viaList?.length) return viaList;

  // 2) Фоллбэк: батчем по get
  const calls = {};
  ids.forEach((id, i) => calls['g' + i] = ['crm.item.get', { entityTypeId, id }]);
  const res = await bx.batch(calls);

  const items = [];
  for (const k in res) {
    if (!res[k].error()) {
      const itm = res[k].data()?.item;
      if (itm) items.push(itm);
    }
  }
  return items;
}

// ===== ДОБАВЛЕНО: набор полей, которые реально нужны в таблице =====
// (добавьте сюда ваши UF, если нужно)
export function buildSelect() {
  // Базовые поля динамики + стандартные "шапки"
  return [
    'id', 'title', 'assignedById', 'stageId', 'categoryId',
    'createdTime', 'updatedTime',
    // ваши UF, если используете:
    // 'ufCrm10_1717328665682', // ID исходной сделки
    // 'ufCrm10_1717328730625', // Ключ
    // 'ufCrm10_1717328814784', // Портал
    // 'ufCrm10_1717329015552', // Тариф (enum)
    // 'ufCrm10_1717329087589', // Окончание тарифа
    // 'ufCrm10_1717329109963', // Окончание подписки
    // 'ufCrm10_1717329453779', // Продукт (enum)
  ];
}
