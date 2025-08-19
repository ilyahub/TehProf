// assets/app/api.js
import { A } from './utils.js';

// Обёртки над BX24
export const bx = {
  call(method, params = {}) {
    return new Promise(resolve => BX24.callMethod(method, params, res => resolve(res)));
  },
  batch(calls) {
    return new Promise(resolve => BX24.callBatch(calls, resolve, true));
  }
};

// =====================
// ВЕРХНЕУРОВНЕВЫЕ ВЫЗОВЫ
// =====================

export async function getDeal(id) {
  const r = await bx.call('crm.deal.get', { id });
  return r.error() ? null : r.data();
}

/**
 * Достаём ID связанных элементов из поля сделки:
 *  - поддерживает и DYNAMIC_1032_123, и просто числа
 *  - если указан typeId — отфильтровывает только нужный SPA тип
 */
export async function getLinkedItemIds(dealId, fieldCode, typeId /* optional */) {
  const r = await bx.call('crm.deal.get', { id: dealId });
  if (r.error()) return [];

  const deal = r.data() || {};
  const raw =
    deal?.[fieldCode] ??
    deal?.FIELDS?.[fieldCode] ??
    deal?.fields?.[fieldCode];

  const vals = A(raw).map(v => String(v).trim()).filter(Boolean);
  const ids = new Set();

  for (const v of vals) {
    const m = v.match(/DYNAMIC_(\d+)_(\d+)/i);
    if (m) {
      const vType = Number(m[1]);
      const vId = Number(m[2]);
      if (!Number.isNaN(vId) && (typeId ? vType === Number(typeId) : true)) {
        ids.add(vId);
      }
    } else {
      const n = Number(v);
      if (!Number.isNaN(n)) ids.add(n);
    }
  }
  return Array.from(ids);
}

/**
 * НАДЁЖНАЯ загрузка элементов по списку ID:
 *  1) пытаемся через crm.item.list с {'@id': [...]} и select
 *  2) если пусто — батчим crm.item.get по каждому id
 */
export async function getItemsByIds(entityTypeId, ids, select = []) {
  if (!Array.isArray(ids) || !ids.length) return [];

  // попытка №1 — списком
  const r = await bx.call('crm.item.list', {
    entityTypeId,
    filter: { '@id': ids },
    select
  });

  let items = [];
  if (!r.error()) {
    const data = r.data() || {};
    if (Array.isArray(data.items)) items = data.items;
  }
  if (items.length) return items;

  // попытка №2 — батчем по одному
  const calls = {};
  ids.forEach((id, i) => (calls['g' + i] = ['crm.item.get', { entityTypeId, id }]));
  const res = await bx.batch(calls);

  const arr = [];
  for (const k in res) {
    if (!res[k].error()) {
      const d = res[k].data();
      if (d && d.item) arr.push(d.item);
    }
  }
  return arr;
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

export async function listCategoryStages(entityTypeId, categoryIds /* number[] */) {
  const calls = {};
  categoryIds.forEach((cid, i) => (calls['s' + i] = ['crm.category.stage.list', { entityTypeId, categoryId: cid }]));
  const res = await bx.batch(calls);
  const rows = [];
  for (const k in res) if (!res[k].error()) rows.push(res[k].data());
  return rows;
}
День быстро
