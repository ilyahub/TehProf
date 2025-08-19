// assets/app/main.js
import { DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID, PORTAL_ORIGIN, F as Fconf } from './config.js';
import { getDeal, getItemsByIds, listUserFields, listUsers, listCategoryStages, updateItemStage } from './api.js';
import { S, setUfKeyMap } from './state.js';
import { $, A, pick, shortUser, putEnum } from './utils.js';
import { fitToIframe, enableResizers, bindToolbar, renderTable, applyVisibleColumns, applyColsModal } from './ui.js';

/* базовые настройки состояния */
S.field  = DEAL_FIELD_CODE;
S.typeId = SMART_ENTITY_TYPE_ID;
S.F      = Fconf;

/* --------- bootstrap: вытащить dealId из query/placement --------- */
(function boot() {
  const q = new URLSearchParams(location.search);
  const qDeal = Number(q.get('dealId'));
  if (qDeal) S.dealId = qDeal;

  try {
    // ранний разбор placement_options если есть
    const po = q.get('placement_options') || q.get('PLACEMENT_OPTIONS') || '';
    if (!S.dealId && po) {
      const j = JSON.parse(po);
      if (j && j.ID) S.dealId = Number(j.ID);
    }
  } catch {}
})();

/* --------- helpers --------- */
function detectMode(raw) {
  const a = A(raw);
  return a.some(v => typeof v === 'string' && String(v).startsWith('DYNAMIC_')) ? 'bindings' : 'ids';
}

/* 1) Сначала строим карту UF_* -> ufCrm* и словари перечислений */
async function buildUFMeta() {
  const list = await listUserFields(S.typeId);
  const map = {}; // UF_* -> ufCrm*
  for (const f of list) {
    const xmlId     = pick(f, 'XML_ID', 'xmlId');           // UF_CRM_...
    const fieldName = pick(f, 'FIELD_NAME', 'fieldName');   // ufCrm...
    if (xmlId && fieldName) map[xmlId] = fieldName;

    // словарь перечислений для enum-полей — ключом делаем UF (xmlId),
    // чтобы utils.enumText(dict, UF_CODE, value) сработал корректно
    const enums = pick(f, 'LIST', 'list') || [];
    if (xmlId && enums.length) {
      enums.forEach(e => putEnum(S.ufEnums, xmlId, pick(e,'ID','VALUE_ID'), pick(e,'VALUE')));
    }
  }
  setUfKeyMap(map);   // utils.UF теперь сможет брать по UF-коду
  return map;
}

/* 2) Пользователи */
async function buildUsers(items) {
  const ids = Array.from(new Set(items.map(i => Number(i.assignedById)).filter(Boolean)));
  if (!ids.length) return;
  const raw = await listUsers(ids);
  for (const id in raw) {
    const u = raw[id];
    S.users[Number(id)] = { name: shortUser(u), path: '/company/personal/user/'+id+'/' };
  }
}

/* 3) Стадии */
async function buildStages(items) {
  const cats = Array.from(new Set(items.map(i => Number(i.categoryId)).filter(Boolean)));
  if (!cats.length) return;
  const rows = await listCategoryStages(S.typeId, cats);

  rows.forEach(data => {
    const list = Array.isArray(data) ? data : (data?.stages || data?.STAGES) || [];
    list.forEach(st => {
      const statusId   = String(pick(st, 'statusId', 'STATUS_ID') || '');
      const name       = String(pick(st, 'name', 'NAME') || statusId);
      const sort       = Number(pick(st, 'sort', 'SORT') || 0);
      const categoryId = Number(pick(st, 'categoryId', 'CATEGORY_ID') || 0);
      const fullId     = String(pick(st,'id','ID') || (`DT${S.typeId}_${categoryId}:${statusId}`));

      S.stagesByFull[fullId] = { id: fullId, name, sort, categoryId, statusId };
      S.stagesByCatStatus[categoryId + ':' + statusId] = S.stagesByFull[fullId];
      (S.catStages[categoryId] ||= []).push({ id: fullId, name, sort, statusId });
    });
  });

  Object.keys(S.catStages).forEach(cid => {
    S.catStages[cid].sort((a,b)=>a.sort-b.sort);
    const max = S.catStages[cid].length ? Math.max(...S.catStages[cid].map(s=>s.sort)) : 100;
    S.cats[cid] = { maxSort: max || 100 };
  });
}

// Надёжная загрузка элементов по списку ID.
// 1) Пробуем crm.item.list с {'@id': ids}
// 2) Если вернуло пусто — батчим crm.item.get по каждому ID
async function robustGetItemsByIds(typeId, ids, select = []) {
  function listOnce() {
    return new Promise(resolve => {
      BX24.callMethod(
        'crm.item.list',
        { entityTypeId: typeId, filter: { '@id': ids }, select },
        r => {
          if (r.error()) return resolve([]);
          const d = r.data() || {};
          resolve(Array.isArray(d.items) ? d.items : []);
        }
      );
    });
  }

  function batchGet() {
    return new Promise(resolve => {
      const calls = {};
      ids.forEach((id, i) => (calls['g' + i] = ['crm.item.get', { entityTypeId: typeId, id }]));
      BX24.callBatch(
        calls,
        res => {
          const arr = [];
          for (const k in res) {
            if (!res[k].error()) {
              const d = res[k].data();
              if (d && d.item) arr.push(d.item);
            }
          }
          resolve(arr);
        },
        true
      );
    });
  }

  const fromList = await listOnce();
  if (fromList && fromList.length) return fromList;

  // fallback
  return await batchGet();
}

/* Главная загрузка */
async function loadAll() {
  if (!S.dealId) {
    $('#rows').innerHTML = `<tr><td colspan="12" class="err">Нет ID сделки (можно передать ?dealId=123 для проверки)</td></tr>`;
    return;
  }

  const deal = await getDeal(S.dealId);
  if (!deal) {
    $('#rows').innerHTML = `<tr><td colspan="12" class="err">Сделка #${S.dealId} не найдена</td></tr>`;
    return;
  }

  // СНАЧАЛА мета UF (карта + перечисления)
  const ufMap = await buildUFMeta();

  // Связи из сделки
  const raw = deal[S.field];
  S.mode = detectMode(raw);
  S.bindings = A(raw);
  S.ids = (S.mode === 'bindings')
    ? S.bindings.map(c => {
        const m = String(c||'').match(/DYNAMIC_(\d+)_(\d+)/);
        return m && Number(m[1]) === Number(S.typeId) ? Number(m[2]) : null;
      }).filter(Boolean)
    : A(raw).map(Number).filter(Boolean);

  if (!S.ids.length) {
    $('#rows').innerHTML = `<tr><td colspan="12" class="muted">В сделке нет связанных элементов</td></tr>`;
    return;
  }

  // Готовим select: базовые поля + корректные api-имена UF-полей
  const needUF = [
    S.F.dealIdSource, S.F.licenseKey, S.F.portalUrl,
    S.F.tariff, S.F.tariffEnd, S.F.marketEnd, S.F.product
  ];
  const ufApiNames = needUF.map(uf => ufMap[uf]).filter(Boolean);
  const select = ['id','title','stageId','categoryId','assignedById', ...ufApiNames];

  // Читаем элементы
  S.items = await robustGetItemsByIds(S.typeId, S.ids, select);

  // если по какой-то причине REST не вернул UF-поля (редко, но бывает) —
  // позже utils.UF попробует достать их и без select; но для нас важно,
  // что список элементов уже есть
  await buildUsers(S.items);
  await buildStages(S.items);

  if (!S.items.length) {
    $('#rows').innerHTML = `<tr><td colspan="12" class="muted">Элементы не найдены (typeId:${S.typeId}, ids:${S.ids.join(', ')})</td></tr>`;
  }
}

/* Смена стадии */
async function onChangeStage(id, newStageId) {
  const ok = await updateItemStage(S.typeId, id, newStageId);
  if (!ok) { alert('Ошибка смены стадии'); return; }
  const it = S.items.find(i => i.id === id);
  if (it) it.stageId = newStageId;
  render();
}

/* Открыть карточку */
function openItem(id) {
  BX24.openPath(`/crm/type/${S.typeId}/details/${id}/`);
}

/* Рендер */
function render() {
  applyVisibleColumns(S);
  renderTable(S, {
    openItem,
    changeStage: onChangeStage,
    reload: init
  });
  fitToIframe();
}

/* Init */
function init() {
  BX24.init(async function() {
    if (!S.dealId) {
      try {
        const p = BX24.getParam('PLACEMENT_OPTIONS');
        const j = p ? JSON.parse(p) : {};
        if (j && j.ID) S.dealId = Number(j.ID);
      } catch {}
    }
    await loadAll();
    bindToolbar(S, { render, reload: init, openItem, changeStage: onChangeStage });
    applyColsModal(S);
    enableResizers(S);
    render();
  });
}

init();
window.addEventListener('load', fitToIframe);
