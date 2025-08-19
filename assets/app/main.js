// assets/app/main.js
// ВАЖНО: этот файл рассчитан на структуру из твоего репо:
// api.js, config.js, utils.js (и НЕ требует reader.js, reorder.js и прочих «внештатных» модулей)

import { $, $$, UF, enumText, fmtDate, parseStage } from './utils.js';
import {
  buildSelect,
  robustGetItemsByIds,
  getLinkedItemIds,
  fetchFieldMeta,
  listUsers,
  listCategoryStages,
} from './api.js';
import { SMART_ENTITY_TYPE_ID, DEAL_FIELD_CODE } from './config.js';

// ----------------------- UI кэш -----------------------
const ui = {
  rows: $('#rows'),
  btnRefresh: $('#btnRefresh') || $('#refresh') || $('[data-role="refresh"]'),
  fStage: $('#fStage'),
  fDeal: $('#fDeal'),
  fKey: $('#fKey'),
  fUrl: $('#fUrl'),
  fTariff: $('#fTariff'),
  fTitle: $('#fTitle'),
  fAss: $('#fAss'),
};

// ----------------------- Состояние -----------------------
const S = {
  dealId: null,
  ids: [],
  items: [],
  users: {},              // { userId: rawUser }
  stagesByCat: {},        // { categoryId: { order:[statusId...], byId:{statusId:{NAME, SORT, COLOR}} } }
  filters: {
    stage: '',
    deal: '',
    key: '',
    url: '',
    tariff: '',
    title: '',
    ass: '',
  },
};

// Словари enum и карта UF — храним на window, чтобы utils.UF и enumText могли ими пользоваться
window.__UF_KEYMAP = window.__UF_KEYMAP || {};
window.__ENUM_DICT = window.__ENUM_DICT || {};

// ----------------------- dealId из PLACEMENT / URL -----------------------
function resolveDealId() {
  let id = null;
  try {
    const boot = window.__BOOT__ || {};
    if (boot.placementOptions) {
      const po = JSON.parse(boot.placementOptions);
      id =
        po?.options?.ID ??
        po?.options?.ENTITY_ID ??
        po?.dealId ??
        po?.ID ??
        po?.ENTITY_ID ??
        null;
    }
  } catch (e) {}

  const url = new URL(location.href);
  id = id ?? Number(url.searchParams.get('dealId') || url.searchParams.get('id'));
  id = Number(id);
  return Number.isFinite(id) ? id : null;
}

// ----------------------- Загрузка пользователей -----------------------
async function buildUsers(items) {
  const ids = new Set();
  for (const it of items) {
    const uid = Number(it.assignedById || it.ASSIGNED_BY_ID);
    if (uid) ids.add(uid);
  }
  if (!ids.size) { S.users = {}; return; }
  S.users = await listUsers([...ids]);
}

// ----------------------- Загрузка стадий по категориям -----------------------
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
    // pack — массив стадий категории
    if (!Array.isArray(pack)) continue;
    for (const st of pack) {
      const categoryId = Number(st.categoryId ?? st.CATEGORY_ID ?? st.category_id);
      if (!Number.isFinite(categoryId)) continue;

      dict[categoryId] = dict[categoryId] || { order: [], byId: {} };

      const statusId = String(st.statusId ?? st.STATUS_ID ?? st.STATUS_ID_OLD ?? st.id ?? st.ID);
      const name     = String(st.name ?? st.NAME ?? statusId);
      const sort     = Number(st.sort ?? st.SORT ?? 500);
      const color    = String(st.color ?? st.COLOR ?? '#a5b4fc');

      dict[categoryId].byId[statusId] = { NAME: name, SORT: sort, COLOR: color };
    }
  }

  // сформируем порядок
  for (const cid of Object.keys(dict)) {
    const rec = dict[cid];
    rec.order = Object
      .entries(rec.byId)
      .sort((a, b) => (a[1].SORT ?? 500) - (b[1].SORT ?? 500))
      .map(([k]) => k);
  }
  S.stagesByCat = dict;
}

// ----------------------- Формат имени без отчества -----------------------
function shortUser(u) {
  if (!u) return '—';
  const first = (u.NAME || u.name || '').trim();
  const last  = (u.LAST_NAME || u.last_name || '').trim();
  const nick  = (u.EMAIL || u.email || '').trim();
  const name = `${first} ${last}`.trim();
  return name || nick || '—';
}

// ----------------------- Фильтры -----------------------
function passFilters(it) {
  const f = S.filters;

  // поля для фильтра — только по тому, что есть на экране
  const st  = String(it.stageId || '').toLowerCase();
  const dl  = String(UF(it, 'UF_CRM_10_1717328665682') ?? '').toLowerCase();
  const key = String(UF(it, 'UF_CRM_10_1717328730625') ?? '').toLowerCase();
  const url = String(UF(it, 'UF_CRM_10_1717328814784') ?? '').toLowerCase();

  // tariff/product — можем пробовать как raw
  const tariffRaw  = UF(it, 'UF_CRM_10_1717329015552');
  const productRaw = UF(it, 'UF_CRM_10_1717329453779');
  const tariffText  = String(enumText(window.__ENUM_DICT, 'UF_CRM_10_1717329015552', tariffRaw) ?? '').toLowerCase();
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

// ----------------------- Рендер строки -----------------------
function renderRow(it) {
  const dealId = UF(it, 'UF_CRM_10_1717328665682');
  const key    = UF(it, 'UF_CRM_10_1717328730625');
  const url    = UF(it, 'UF_CRM_10_1717328814784');
  const tariff = enumText(window.__ENUM_DICT, 'UF_CRM_10_1717329015552', UF(it, 'UF_CRM_10_1717329015552'));
  const tEnd   = fmtDate(UF(it, 'UF_CRM_10_1717329087589'));
  const mEnd   = fmtDate(UF(it, 'UF_CRM_10_1717329109963'));
  const prod   = enumText(window.__ENUM_DICT, 'UF_CRM_10_1717329453779', UF(it, 'UF_CRM_10_1717329453779'));

  const uid    = Number(it.assignedById || it.ASSIGNED_BY_ID);
  const user   = shortUser(S.users[uid]);

  // стадия
  const { categoryId, statusId } = parseStage(it.stageId);
  const cat = S.stagesByCat[Number(categoryId)] || { order: [], byId: {} };
  const order = cat.order;
  const idx   = Math.max(0, order.indexOf(statusId));
  const part  = order.length ? Math.round((idx + 1) * 100 / order.length) : 0;
  const stName = (cat.byId[statusId]?.NAME) || it.stageId || '—';

  const urlCell = url
    ? `<a href="${String(url)}" target="_blank" rel="noopener">${String(url)}</a>`
    : '—';

  return `
  <tr>
    <td>${Number(it.id || it.ID) || '—'}</td>
    <td>${String(it.title || '—')}</td>
    <td>${user}</td>

    <td>
      <div class="stage">
        <div class="bar"><i style="width:${part}%;"></i></div>
        <span>${stName}</span>
      </div>
    </td>

    <td>${dealId ?? '—'}</td>
    <td>${key ? String(key) : '—'}</td>
    <td>${urlCell}</td>
    <td>${tariff || '—'}</td>
    <td>${tEnd}</td>
    <td>${mEnd}</td>
    <td>${prod || '—'}</td>

    <td>
      <button class="btn btn-xs" data-act="open" data-id="${Number(it.id || it.ID)}">Открыть</button>
    </td>
  </tr>`;
}

// ----------------------- Рендер таблицы -----------------------
function render() {
  const list = S.items.filter(passFilters);
  if (!list.length) {
    ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Ничего не найдено</td></tr>`;
    return;
  }
  ui.rows.innerHTML = list.map(renderRow).join('');
}

// ----------------------- Загрузка всего -----------------------
async function load() {
  ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Загрузка…</td></tr>`;

  S.dealId = resolveDealId();
  if (!S.dealId) {
    ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Нет ID сделки</td></tr>`;
    return;
  }

  // 0) метаданные (карта UF и словари enum)
  const meta = await fetchFieldMeta(SMART_ENTITY_TYPE_ID);
  window.__UF_KEYMAP = meta.keymap || {};
  window.__ENUM_DICT = meta.enums  || {};

  // 1) читаем ID динамических элементов из UF-поля сделки
  const ids = await getLinkedItemIds(S.dealId, DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID);
  S.ids = ids;

  if (!ids.length) {
    ui.rows.innerHTML = `<tr><td colspan="12" class="muted">В сделке нет связанных элементов</td></tr>`;
    return;
  }

  // 2) сами элементы (c фоллбэком)
  const select = buildSelect();
  const items  = await robustGetItemsByIds(SMART_ENTITY_TYPE_ID, ids, select);
  S.items = items || [];

  if (!S.items.length) {
    ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Не удалось загрузить элементы</td></tr>`;
    return;
  }

  // 3) пользователи и стадии
  await buildUsers(S.items);
  await buildStages(S.items);

  // 4) рендер
  render();
}

// ----------------------- Слушатели -----------------------
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
  if (ui.btnRefresh) ui.btnRefresh.addEventListener('click', load);

  // делегирование на «Открыть»
  ui.rows.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="open"]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (!id) return;

    try {
      // если внутри Bitrix24 — откроем карточку элемента
      if (window.BX24 && BX24.openPath) {
        // Стандартного роутинга для DYNAMIC нет, оставим просто alert/или внешнюю ссылку если знаем портал
        alert(`Откройте элемент ID ${id} в CRM (dynamic ${SMART_ENTITY_TYPE_ID})`);
      } else {
        alert(`Элемент ID ${id}`);
      }
    } catch {}
  });
}

// ----------------------- Старт -----------------------
function init() {
  bindFilters();
  bindActions();
  load();

  // аккуратно растянем фрейм (если виджет во фрейме)
  if (window.BX24 && BX24.resizeWindow) {
    setTimeout(() => {
      BX24.resizeWindow(document.documentElement.scrollWidth, document.documentElement.scrollHeight);
    }, 150);
  }
}

document.addEventListener('DOMContentLoaded', init);
