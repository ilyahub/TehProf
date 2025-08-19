// assets/app/main.js
import { $, $$, UF, enumText, fmtDate, parseStage } from './utils.js';
import {
  buildSelect,
  robustGetItemsByIds,
  getLinkedItemIds,
  fetchFieldMeta,
  listUsers,
  listCategoryStages,
  updateDealLinkedIds,
  openBxPath,
  smartItemPath,
} from './api.js';
import { SMART_ENTITY_TYPE_ID, DEAL_FIELD_CODE } from './config.js';

// ---------------- UI ----------------
const ui = {
  rows: $('#rows'),
  btnCreate: $('#btnCreate'),
  btnPick: $('#btnPick'),
  btnRefresh: $('#btnRefresh'),
  btnCols: $('#btnCols'),

  // фильтры — если каких-то id нет в разметке, просто будут undefined
  fStage: $('#fStage'),
  fDeal:  $('#fDeal'),
  fKey:   $('#fKey'),
  fUrl:   $('#fUrl'),
  fTariff:$('#fTariff'),
  fTitle: $('#fTitle'),
  fAss:   $('#fAss'),

  // модал «Колонки»
  colModal: $('#colModal'),
  colList:  $('#colList'),
  colApply: $('#colApply'),
  colCancel:$('#colCancel'),
};

// ---------------- Состояние ----------------
const S = {
  dealId: null,
  ids: [],
  items: [],
  users: {},
  stagesByCat: {},
  filters: { stage:'', deal:'', key:'', url:'', tariff:'', title:'', ass:'' },
  colsOrder: [],          // порядок колонок читаем из thead
  colsVisible: {},        // карта видимости { [code]: bool }
};

window.__UF_KEYMAP = window.__UF_KEYMAP || {};
window.__ENUM_DICT = window.__ENUM_DICT || {};

// ----- dealId -----
function resolveDealId() {
  let id = null;
  try {
    const boot = window.__BOOT__ || {};
    if (boot.placementOptions) {
      const po = JSON.parse(boot.placementOptions);
      id = po?.options?.ID ?? po?.options?.ENTITY_ID ?? po?.dealId ?? po?.ID ?? po?.ENTITY_ID ?? null;
    }
  } catch {}
  const url = new URL(location.href);
  id = id ?? Number(url.searchParams.get('dealId') || url.searchParams.get('id'));
  id = Number(id);
  return Number.isFinite(id) ? id : null;
}

// ----- Users -----
async function buildUsers(items) {
  const ids = new Set();
  for (const it of items) {
    const uid = Number(it.assignedById || it.ASSIGNED_BY_ID);
    if (uid) ids.add(uid);
  }
  S.users = ids.size ? await listUsers([...ids]) : {};
}
const shortUser = u => {
  if (!u) return '—';
  const first = (u.NAME || u.name || '').trim();
  const last  = (u.LAST_NAME || u.last_name || '').trim();
  return (first || last) ? `${first} ${last}`.trim() : (u.EMAIL || u.email || '—');
};

// ----- Stages -----
async function buildStages(items) {
  const cids = new Set();
  for (const it of items) {
    const cid = Number(it.categoryId || it.CATEGORY_ID);
    if (Number.isFinite(cid)) cids.add(cid);
  }
  if (!cids.size) { S.stagesByCat = {}; return; }

  const packs = await listCategoryStages(SMART_ENTITY_TYPE_ID, [...cids]);
  const dict = {};
  for (const pack of packs) {
    if (!Array.isArray(pack)) continue;
    for (const st of pack) {
      const categoryId = Number(st.categoryId ?? st.CATEGORY_ID ?? st.category_id);
      if (!Number.isFinite(categoryId)) continue;
      dict[categoryId] = dict[categoryId] || { order: [], byId: {} };

      const statusId = String(st.statusId ?? st.STATUS_ID ?? st.id ?? st.ID);
      const name     = String(st.name ?? st.NAME ?? statusId);
      const sort     = Number(st.sort ?? st.SORT ?? 500);
      const color    = String(st.color ?? st.COLOR ?? '#a5b4fc');

      dict[categoryId].byId[statusId] = { NAME: name, SORT: sort, COLOR: color };
    }
  }
  for (const cid of Object.keys(dict)) {
    const rec = dict[cid];
    rec.order = Object.entries(rec.byId)
      .sort((a,b) => (a[1].SORT ?? 500) - (b[1].SORT ?? 500))
      .map(([k]) => k);
  }
  S.stagesByCat = dict;
}

// ----- Фильтры -----
function passFilters(it) {
  const f = S.filters;
  const st  = String(it.stageId || '').toLowerCase();
  const dl  = String(UF(it, 'UF_CRM_10_1717328665682') ?? '').toLowerCase();
  const key = String(UF(it, 'UF_CRM_10_1717328730625') ?? '').toLowerCase();
  const url = String(UF(it, 'UF_CRM_10_1717328814784') ?? '').toLowerCase();
  const tariffText  = String(enumText(window.__ENUM_DICT, 'UF_CRM_10_1717329015552', UF(it, 'UF_CRM_10_1717329015552')) ?? '').toLowerCase();
  const title = String(it.title || '').toLowerCase();
  const ass   = shortUser(S.users[Number(it.assignedById || it.ASSIGNED_BY_ID)]).toLowerCase();

  if (f.stage  && !st.includes(f.stage.toLowerCase())) return false;
  if (f.deal   && !dl.includes(f.deal.toLowerCase()))   return false;
  if (f.key    && !key.includes(f.key.toLowerCase()))   return false;
  if (f.url    && !url.includes(f.url.toLowerCase()))   return false;
  if (f.tariff && !tariffText.includes(f.tariff.toLowerCase())) return false;
  if (f.title  && !title.includes(f.title.toLowerCase())) return false;
  if (f.ass    && !ass.includes(f.ass.toLowerCase()))   return false;
  return true;
}

// ----- Колонки -----
function readColsFromHead() {
  S.colsOrder = [...document.querySelectorAll('thead tr.head th[data-col]')].map(th => th.dataset.col);
  // видимость по умолчанию: все показываем, но уважаем сохранённые
  const saved = localStorage.getItem('colsVisible');
  if (saved) {
    try { S.colsVisible = JSON.parse(saved) || {}; } catch { S.colsVisible = {}; }
  }
  for (const c of S.colsOrder) if (!(c in S.colsVisible)) S.colsVisible[c] = true;
}
function applyColsVisibility() {
  const on = S.colsVisible;
  // th
  $$('thead tr.head th[data-col]').forEach(th => {
    th.style.display = on[th.dataset.col] ? '' : 'none';
  });
  $$('thead tr.filters th[data-col]').forEach(th => {
    th.style.display = on[th.dataset.col] ? '' : 'none';
  });
  // td (в каждой строке)
  $$('tbody#rows tr').forEach(tr => {
    $$('td[data-col]', tr).forEach(td => {
      td.style.display = on[td.dataset.col] ? '' : 'none';
    });
  });
}
function openColsModal() {
  if (!ui.colModal) return;
  const list = ui.colList;
  list.innerHTML = S.colsOrder.map(code => {
    const checked = S.colsVisible[code] ? 'checked' : '';
    const label = ({
      id:'ID', title:'Название', ass:'Ответственный', stage:'Стадия', deal:'ID сделки',
      key:'Ключ', url:'Портал', tariff:'Тариф', tEnd:'Окончание тарифа', mEnd:'Окончание подписки',
      product:'Продукт', act:'Действия'
    })[code] || code;
    return `<label><input type="checkbox" data-col="${code}" ${checked}> ${label}</label>`;
  }).join('');
  ui.colModal.style.display = 'flex';
}
function closeColsModal() {
  if (!ui.colModal) return;
  ui.colModal.style.display = 'none';
}
function applyColsFromModal() {
  if (!ui.colModal) return;
  $$('input[type="checkbox"][data-col]', ui.colList).forEach(ch => {
    S.colsVisible[ch.dataset.col] = ch.checked;
  });
  localStorage.setItem('colsVisible', JSON.stringify(S.colsVisible));
  closeColsModal();
  applyColsVisibility();
}

// ----- Рендер строки (по порядку колонок из thead) -----
function rowCells(it) {
  const id = Number(it.id || it.ID) || 0;
  const dealId = UF(it, 'UF_CRM_10_1717328665682');
  const key    = UF(it, 'UF_CRM_10_1717328730625');
  const url    = UF(it, 'UF_CRM_10_1717328814784');
  const tariff = enumText(window.__ENUM_DICT, 'UF_CRM_10_1717329015552', UF(it, 'UF_CRM_10_1717329015552'));
  const tEnd   = fmtDate(UF(it, 'UF_CRM_10_1717329087589'));
  const mEnd   = fmtDate(UF(it, 'UF_CRM_10_1717329109963'));
  const prod   = enumText(window.__ENUM_DICT, 'UF_CRM_10_1717329453779', UF(it, 'UF_CRM_10_1717329453779'));

  const uid    = Number(it.assignedById || it.ASSIGNED_BY_ID);
  const user   = S.users[uid];

  const { categoryId, statusId } = parseStage(it.stageId);
  const cat   = S.stagesByCat[Number(categoryId)] || { order: [], byId: {} };
  const order = cat.order;
  const idx   = Math.max(0, order.indexOf(statusId));
  const part  = order.length ? Math.round((idx + 1) * 100 / order.length) : 0;
  const stName = (cat.byId[statusId]?.NAME) || it.stageId || '—';

  const urlCell = url ? `<a href="${String(url)}" target="_blank" rel="noopener">${String(url)}</a>` : '—';

  return {
    id: String(id || '—'),
    title: id ? `<a href="#" data-act="open-item" data-id="${id}">${String(it.title || '—')}</a>` : (String(it.title || '—')),
    ass: uid ? `<a href="#" data-act="open-user" data-uid="${uid}">${shortUser(user)}</a>` : shortUser(user),

    stage: `
      <div class="stage">
        <div class="bar"><i style="width:${part}%;"></i></div>
        <span>${stName}</span>
      </div>`,

    deal:   dealId ?? '—',
    key:    key ? String(key) : '—',
    url:    urlCell,
    tariff: tariff || '—',
    tEnd:   tEnd,
    mEnd:   mEnd,
    product: prod || '—',

    act: id ? `
      <button class="btn btn-xs" data-act="open-item" data-id="${id}">Открыть</button>
      <button class="btn btn-xs" data-act="unlink" data-id="${id}">Удалить</button>
    ` : '',
  };
}

function render() {
  const list = S.items.filter(passFilters);
  if (!list.length) {
    ui.rows.innerHTML = `<tr><td colspan="${S.colsOrder.length}" class="muted">Ничего не найдено</td></tr>`;
    return;
  }
  ui.rows.innerHTML = list.map(it => {
    const cells = rowCells(it);
    return `<tr>${S.colsOrder.map(code => `<td data-col="${code}">${cells[code] ?? ''}</td>`).join('')}</tr>`;
  }).join('');
  applyColsVisibility();
}

// ----- Picker / unlink -----
async function openPicker() {
  // пробуем встроенный пикер; динамические типы не всегда поддерживаются, поэтому fallback
  const tryDynamic = () => new Promise((resolve, reject) => {
    if (!(window.BX24 && typeof BX24.selectCRM === 'function')) return reject(new Error('no-selectCRM'));
    // часто хватает такой строки; если не поддерживается — упадёт в catch
    BX24.selectCRM(
      {
        entityType: ['crm.dynamic.type.' + String(SMART_ENTITY_TYPE_ID)],
        multiple: true,
      },
      (res) => {
        try {
          const ids = (res || []).map(x => Number(x.id || x.ID)).filter(Boolean);
          resolve(ids);
        } catch (e) { reject(e); }
      }
    );
  });

  let pickedIds = [];
  try {
    pickedIds = await tryDynamic();
  } catch {
    // fallback — ручной ввод ID через запятую
    const raw = prompt('Введите ID элементов через запятую:');
    if (raw && raw.trim()) {
      pickedIds = raw.split(/[,\s]+/).map(s => Number(s)).filter(Boolean);
    }
  }
  if (!pickedIds.length) return;

  const merged = Array.from(new Set([...S.ids, ...pickedIds]));
  const ok = await updateDealLinkedIds(S.dealId, DEAL_FIELD_CODE, merged);
  if (!ok) { alert('Не удалось обновить сделку'); return; }

  // перезагрузим
  await load();
}

async function unlinkItem(id) {
  const confirmRemove = confirm('Убрать элемент из списка (не удаляя его в CRM)?');
  if (!confirmRemove) return;
  const left = S.ids.filter(x => Number(x) !== Number(id));
  const ok = await updateDealLinkedIds(S.dealId, DEAL_FIELD_CODE, left);
  if (!ok) { alert('Не удалось обновить сделку'); return; }
  await load();
}

// ----- Навешиваем обработчики -----
function bindFilters() {
  const bind = (el, key) => el && el.addEventListener('input', () => {
    S.filters[key] = el.value || '';
    render();
  });
  bind(ui.fStage,  'stage');
  bind(ui.fDeal,   'deal');
  bind(ui.fKey,    'key');
  bind(ui.fUrl,    'url');
  bind(ui.fTariff, 'tariff');
  bind(ui.fTitle,  'title');
  bind(ui.fAss,    'ass');
}

function bindActions() {
  ui.btnRefresh && ui.btnRefresh.addEventListener('click', load);
  ui.btnPick    && ui.btnPick.addEventListener('click', openPicker);

  // Колонки
  if (ui.btnCols) ui.btnCols.addEventListener('click', openColsModal);
  if (ui.colCancel) ui.colCancel.addEventListener('click', () => ui.colModal.style.display = 'none');
  if (ui.colApply)  ui.colApply.addEventListener('click', applyColsFromModal);

  // делегирование по строкам
  ui.rows.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;

    if (act === 'open-item') {
      const id = Number(a.dataset.id);
      if (!id) return;
      if (!openBxPath(smartItemPath(SMART_ENTITY_TYPE_ID, id))) {
        alert(`Откройте элемент ID ${id} в CRM`);
      }
    }
    if (act === 'open-user') {
      const uid = Number(a.dataset.uid);
      if (!uid) return;
      if (!openBxPath(`/company/personal/user/${uid}/`)) {
        alert(`Профиль пользователя ID ${uid}`);
      }
    }
    if (act === 'unlink') {
      const id = Number(a.dataset.id);
      if (!id) return;
      unlinkItem(id);
    }
  });
}

// ----- Загрузка -----
async function load() {
  ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Загрузка…</td></tr>`;
  S.dealId = resolveDealId();
  if (!S.dealId) {
    ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Нет ID сделки</td></tr>`;
    return;
  }

  // meta (карта UF и словари перечислений)
  const meta = await fetchFieldMeta(SMART_ENTITY_TYPE_ID);
  window.__UF_KEYMAP = meta.keymap || {};
  window.__ENUM_DICT = meta.enums  || {};

  // ID связанных
  const ids = await getLinkedItemIds(S.dealId, DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID);
  S.ids = ids;
  if (!ids.length) {
    ui.rows.innerHTML = `<tr><td colspan="12" class="muted">В сделке нет связанных элементов</td></tr>`;
    return;
  }

  // элементы
  const select = buildSelect();
  S.items = await robustGetItemsByIds(SMART_ENTITY_TYPE_ID, ids, select);

  if (!S.items.length) {
    ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Не удалось загрузить элементы</td></tr>`;
    return;
  }

  await buildUsers(S.items);
  await buildStages(S.items);
  render();

  // растянуть фрейм (если нужно)
  if (window.BX24 && typeof BX24.resizeWindow === 'function') {
    setTimeout(() => {
      BX24.resizeWindow(document.documentElement.scrollWidth, document.documentElement.scrollHeight);
    }, 150);
  }
}

// ----- Старт -----
function init() {
  readColsFromHead();
  bindFilters();
  bindActions();
  load();
}
document.addEventListener('DOMContentLoaded', init);
