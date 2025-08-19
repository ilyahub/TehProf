// Обёртки над BX24

export const bx = {
  call(method, params = {}) {
    return new Promise(resolve => BX24.callMethod(method, params, res => resolve(res)));
  },
  batch(calls) {
    return new Promise(resolve => BX24.callBatch(calls, resolve, true));
  }
};

// Утилиты верхнего уровня (чуть удобнее читать в main.js)

export async function getDeal(id) {
  const r = await bx.call('crm.deal.get', { id });
  return r.error() ? null : r.data();
}

export async function getItemsByIds(entityTypeId, ids, select) {
  const r = await bx.call('crm.item.list', { entityTypeId, filter: { '@id': ids }, select });
  if (r.error()) return [];
  // унифицируем ответ
  return (r.data().items || []);
}

export async function getItem(entityTypeId, id) {
  const r = await bx.call('crm.item.get', { entityTypeId, id });
  return r.error() ? null : r.data().item;
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
