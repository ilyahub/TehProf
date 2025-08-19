// Главный сценарий (ES-модуль)
import { DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID, PORTAL_ORIGIN, F as Fconf } from './config.js';
import { bx, getDeal, getItemsByIds, listUserFields, listUsers, listCategoryStages, updateItemStage } from './api.js';
import { S, setUfKeyMap } from './state.js';
import { $, A, pick, shortUser, putEnum } from './utils.js';
import { fitToIframe, enableResizers, bindToolbar, renderTable, applyVisibleColumns, applyColsModal } from './ui.js';

S.field = DEAL_FIELD_CODE;
S.typeId = SMART_ENTITY_TYPE_ID;
S.F = Fconf;

// ————— Boot (PLACEMENT / POST snapshot) —————
(function bootFromPostEarly() {
  try {
    const f = new URLSearchParams(location.search);
    const p = f.get('placement_options') || f.get('PLACEMENT_OPTIONS') || '';
    const j = p ? JSON.parse(p) : {};
    if (j && j.ID) S.dealId = Number(j.ID);
  } catch {}
})();

function detectMode(raw) {
  const a = A(raw);
  return a.some(v => typeof v === 'string' && String(v).startsWith('DYNAMIC_')) ? 'bindings' : 'ids';
}

// ————— Data loaders —————
async function buildUFEnums() {
  const list = await listUserFields(S.typeId);
  const map = {};
  for (const f of list) {
    const code = pick(f, 'FIELD_NAME','fieldName');
    const uf = pick(f, 'USER_TYPE_ID','userTypeId') || '';
    // карта соответствий UF_* -> ufCrm*
    const properKey = pick(f,'FIELD_NAME','fieldName');
    const apiKey = pick(f,'XML_ID','xmlId') || pick(f,'FIELD_NAME','fieldName');
    if (code && apiKey) map[properKey] = apiKey; // на всякий случай

    const enums = pick(f, 'LIST','list') || [];
    if (code && Array.isArray(enums) && enums.length) {
      enums.forEach(e => putEnum(S.ufEnums, code, pick(e,'ID','VALUE_ID'), pick(e,'VALUE')));
    }
  }
  setUfKeyMap(map); // для utils.UF
}

async function buildUsers(items) {
  const ids = Array.from(new Set(items.map(i => Number(i.assignedById)).filter(Boolean)));
  if (!ids.length) return;
  const rawMap = await listUsers(ids);
  for (const id in rawMap) {
    const u = rawMap[id];
    S.users[Number(id)] = {
      name: shortUser(u),
      path: '/company/personal/user/'+id+'/'
    };
  }
}

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

async function loadAll() {
  if (!S.dealId) {
    $('#rows').innerHTML = `<tr><td colspan="12" class="err">Нет ID сделки</td></tr>`;
    return;
  }

  const deal = await getDeal(S.dealId);
  if (!deal) {
    $('#rows').innerHTML = `<tr><td colspan="12" class="err">Deal not found</td></tr>`;
    return;
  }

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
    $('#rows').innerHTML = `<tr><td colspan="12" class="muted">Пока нет связанных элементов</td></tr>`;
    return;
  }

  const select = [
    'id','title','stageId','categoryId','assignedById',
    S.F.dealIdSource, S.F.licenseKey, S.F.portalUrl, S.F.tariff, S.F.tariffEnd, S.F.marketEnd, S.F.product
  ];
  let items = await getItemsByIds(S.typeId, S.ids, select);

  S.items = items;

  await buildUFEnums();
  await buildUsers(items);
  await buildStages(items);
}

// ————— Handlers —————
async function onChangeStage(id, newStageId) {
  const ok = await updateItemStage(S.typeId, id, newStageId);
  if (!ok) {
    alert('Ошибка смены стадии');
    return;
  }
  const it = S.items.find(i => i.id === id);
  if (it) it.stageId = newStageId;
  render();
}

function openItem(id) {
  BX24.openPath(`/crm/type/${S.typeId}/details/${id}/`);
}

// ————— Render glue —————
function render() {
  applyVisibleColumns(S);
  renderTable(S, {
    openItem,
    changeStage: onChangeStage,
    reload: init
  });
  fitToIframe();
}

// ————— Init —————
function init() {
  BX24.init(async function() {
    // если не пришло из раннего boot, пробуем из placement
    if (!S.dealId) {
      const p = BX24.getParam('PLACEMENT_OPTIONS');
      try { const j = p ? JSON.parse(p) : {}; if (j && j.ID) S.dealId = Number(j.ID); } catch {}
    }

    await loadAll();
    bindToolbar(S, { render, reload: init, openItem, changeStage: onChangeStage });
    applyColsModal(S);
    enableResizers(S);
    render();
  });
}

init();

// CSP адаптирован воркером. Доп. resize
window.addEventListener('load', fitToIframe);
