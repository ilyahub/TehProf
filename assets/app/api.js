// assets/app/api.js

// --- BX24 обёртки ------------------------------------------------------------
export const bx = {
  call(method, params = {}) {
    return new Promise(resolve => {
      BX24.callMethod(method, params, r => resolve(r));
    });
  },
  batch(calls) {
    return new Promise(resolve => {
      BX24.callBatch(calls, resolve, true);
    });
  }
};

// --- Базовые helpers ---------------------------------------------------------
export async function getDeal(id) {
  const r = await bx.call('crm.deal.get', { id });
  return r.error() ? null : r.data();
}

// Возвращает карту пользователей { id: userObject }
export async function listUsers(ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return {};
  const calls = {};
  uniq.forEach((id, i) => (calls['u' + i] = ['user.get', { ID: String(id) }]));
  const res = await bx.batch(calls);
  const map = {};
  for (const k in res) {
    if (!res[k].error()) {
      const row = (res[k].data() || [])[0] || {};
      const id = Number(row.ID || row.id);
      if (id) map[id] = row;
    }
  }
  return map;
}

// Стадии по категориям
export async function listCategoryStages(entityTypeId, categoryIds) {
  const uniq = [...new Set((categoryIds || []).filter(Boolean))];
  if (!uniq.length) return [];
  const calls = {};
  uniq.forEach((cid, i) => (calls['s' + i] = ['crm.category.stage.list', { entityTypeId, categoryId: cid }]));
  const res = await bx.batch(calls);
  const out = [];
  for (const k in res) if (!res[k].error()) out.push(res[k].data());
  return out;
}

// Пользовательские поля smart-сущности
export async function listUserFields(entityTypeId) {
  const r = await bx.call('crm.item.userfield.list', { entityTypeId });
  if (r.error()) return [];
  // у разных порталов структура отличается: userFields | result
  return r.data().userFields || r.data() || [];
}

// --- Надёжное извлечение ID связанных элементов из сделки --------------------

// Вырезает ID из строки вида DYNAMIC_1032_884 -> 884 (для конкретного typeId)
function idFromBinding(str, typeId) {
  const m = String(str || '').match(/DYNAMIC_(\d+)_(\d+)/);
  return m && Number(m[1]) === Number(typeId) ? Number(m[2]) : null;
}

// Универсальный парсер значения поля сделки -> массив ID
function parseLinkedIds(raw, typeId) {
  const acc = [];

  const pushMaybe = v => {
    if (v == null || v === '') return;
    if (typeof v === 'number') { acc.push(v); return; }
    if (typeof v === 'string') {
      const t = v.trim();
      const byBind = idFromBinding(t, typeId);
      if (byBind) { acc.push(byBind); return; }
      // "1,2; 3 4" — разобьём по нецифрам
      if (/[\d]/.test(t)) {
        t.split(/[^0-9]+/).forEach(x => { const n = Number(x); if (n) acc.push(n); });
      }
      return;
    }
    if (Array.isArray(v)) { v.forEach(x => pushMaybe(x)); return; }
    // вдруг JSON
    try { const j = JSON.parse(v); pushMaybe(j); } catch {}
  };

  pushMaybe(raw);
  // уникализируем
  return [...new Set(acc)].filter(Boolean);
}

// Ищем значения DYNAMIC_<typeId>_<id> во всех полях сделки (fallback)
function scanDealForDynamicIds(deal, typeId) {
  const ids = new Set();
  const scan = obj => {
    if (!obj) return;
    for (const k in obj) {
      const v = obj[k];
      if (typeof v === 'string') {
        const m = v.match(new RegExp(`DYNAMIC_${typeId}_(\\d+)`, 'g')) || [];
        m.forEach(tok => {
          const m2 = tok.match(/_(\d+)$/);
          if (m2) ids.add(Number(m2[1]));
        });
      } else if (Array.isArray(v)) {
        v.forEach(x => scan({ x })); // оборачиваем, чтобы пройти строковые элементы
      }
    }
  };
  scan(deal);
  return [...ids];
}

/**
 * Возвращает массив ID связанных smart-элементов.
 * 1) пытается распарсить указанное поле сделки (любой формат)
 * 2) если пусто — ищет в *любом* поле текста DYNAMIC_<typeId>_<id>
 */
export async function getLinkedItemIds(dealId, fieldCode, entityTypeId) {
  const deal = await getDeal(dealId);
  if (!deal) return [];
  const raw = deal[fieldCode];
  let ids = parseLinkedIds(raw, entityTypeId);

  if (!ids.length) {
    ids = scanDealForDynamicIds(deal, entityTypeId);
  }

  // немного диагностики в консоль
  console.info('[licenses] dealId=', dealId, 'field=', fieldCode, 'raw=', raw, 'ids=', ids);
  return ids;
}

// --- Загрузка элементов по списку ID ----------------------------------------

// Сбор select из config.F (ключи UF)
export function buildSelect(F) {
  const uf = Object.values(F || {}).filter(Boolean);
  return ['id', 'title', 'assignedById', 'stageId', 'categoryId', ...uf];
}

// Сначала crm.item.list с @id, если вернуло пусто — батчем crm.item.get
export async function robustGetItemsByIds(entityTypeId, ids, select) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return [];

  // 1) Быстрый путь
  let list = [];
  {
    const resp = await bx.call('crm.item.list', {
      entityTypeId,
      filter: { '@id': uniq },
      select: select && select.length ? select : undefined
    });
    if (!resp.error()) {
      list = (resp.data().items || resp.data() || []).filter(Boolean);
    }
  }

  if (list.length) return list;

  // 2) Fallback: батчем get
  const calls = {};
  uniq.forEach((id, i) => (calls['i' + i] = ['crm.item.get', { entityTypeId, id }]));
  const res = await bx.batch(calls);
  const out = [];
  for (const k in res) if (!res[k].error()) {
    const it = (res[k].data() || {}).item;
    if (it) out.push(it);
  }
  return out;
}
