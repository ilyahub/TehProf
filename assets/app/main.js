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
  searchSmartItems,
} from './api.js';
import { SMART_ENTITY_TYPE_ID, DEAL_FIELD_CODE } from './config.js';

// ---------- UI ----------
const ui = {
  rows: $('#rows'),
  btnPick: $('#btnPick'),
  btnRefresh: $('#btnRefresh'),
  btnCols: $('#btnCols'),
  colModal: $('#colModal'),
  colList: $('#colList'),
  colApply: $('#colApply'),
  colCancel: $('#colCancel'),

  fTitle: $('#fTitle'), fAss: $('#fAss'), fStage: $('#fStage'), fDeal: $('#fDeal'),
  fKey: $('#fKey'), fUrl: $('#fUrl'), fTariff: $('#fTariff'),
};

// ---------- STATE ----------
const S = {
  dealId: null,
  ids: [],
  items: [],
  users: {},
  stagesByCat: {},
  filters: { title:'', ass:'', stage:'', deal:'', key:'', url:'', tariff:'' },

  // порядок колонок (берём из DOM thead)
  colsOrder: [],
  // видимость колонок: Set<string>
  colsVisible: new Set(),
};
window.__UF_KEYMAP = window.__UF_KEYMAP || {};
window.__ENUM_DICT = window.__ENUM_DICT || {};

// ---------- dealId ----------
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

// ---------- Users ----------
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

// ---------- Stages ----------
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

function stageSegbar(it) {
  const { categoryId, statusId } = parseStage(it.stageId);
  const pack = S.stagesByCat[Number(categoryId)] || { order: [], byId: {} };
  const idx  = Math.max(0, pack.order.indexOf(statusId));

  const segs = pack.order.map((sid,i) => {
    const st = pack.byId[sid] || {};
    const cls = i < idx ? 'done' : (i === idx ? 'now' : '');
    return `<i class="${cls}" style="background:${st.COLOR||'#a5b4fc'}" data-tip="${st.NAME||sid}"></i>`;
  }).join('');

  return `<div class="segbar">${segs || ''}</div>`;
}

// ---------- Filters ----------
function passFilters(it) {
  const f = S.filters;
  const title = String(it.title || '').toLowerCase();
  const ass   = shortUser(S.users[Number(it.assignedById || it.ASSIGNED_BY_ID)]).toLowerCase();
  const stage = String(it.stageId || '').toLowerCase();
  const deal  = String(UF(it, 'UF_CRM_10_1717328665682') ?? '').toLowerCase();
  const key   = String(UF(it, 'UF_CRM_10_1717328730625') ?? '').toLowerCase();
  const url   = String(UF(it, 'UF_CRM_10_1717328814784') ?? '').toLowerCase();
  const tariffText = String(enumText(window.__ENUM_DICT, 'UF_CRM_10_1717329015552', UF(it, 'UF_CRM_10_1717329015552')) ?? '').toLowerCase();

  if (f.title  && !title.includes(f.title)) return false;
  if (f.ass    && !ass.includes(f.ass)) return false;
  if (f.stage  && !stage.includes(f.stage)) return false;
  if (f.deal   && !deal.includes(f.deal)) return false;
  if (f.key    && !key.includes(f.key)) return false;
  if (f.url    && !url.includes(f.url)) return false;
  if (f.tariff && !tariffText.includes(f.tariff)) return false;
  return true;
}

// ---------- Columns ----------
function readColsFromHead() {
  const keys = Array.from(document.querySelectorAll('tr.head th[data-col]'))
    .map(th => th.getAttribute('data-col'))
    .filter(Boolean);

  // двигаем ID, Title, Responsible в начало
  const front = ['id', 'title', 'ass'];
  const rest  = keys.filter(k => !front.includes(k));
  S.colsOrder = [...front, ...rest];

  // загрузим видимость из localStorage, иначе — все включены
  const saved = JSON.parse(localStorage.getItem('colsVisible_v2') || 'null');
  if (Array.isArray(saved) && saved.length) {
    S.colsVisible = new Set(saved.filter(k => S.colsOrder.includes(k)));
  } else {
    S.colsVisible = new Set(S.colsOrder);
  }
}
function isColOn(key) {
  return S.colsVisible instanceof Set ? S.colsVisible.has(key) : !!S.colsVisible[key];
}
function applyColsVisibility() {
  $$('thead tr.head th[data-col], thead tr.filters th[data-col]').forEach(th => {
    const key = th.dataset.col;
    th.style.display = isColOn(key) ? '' : 'none';
  });
  $$('tbody#rows tr').forEach(tr => {
    $$('td[data-col]', tr).forEach(td => {
      const key = td.dataset.col;
      td.style.display = isColOn(key) ? '' : 'none';
    });
  });
}
function openColsModal() {
  if (!S.colsOrder.length) readColsFromHead();

  const LABELS = {
    id:'ID', title:'Название', ass:'Ответственный', stage:'Стадия',
    deal:'ID исходной сделки', key:'Лицензионный ключ', url:'Адрес портала',
    tariff:'Текущий тариф', tEnd:'Окончание тарифа', mEnd:'Окончание подписки',
    product:'Продукт', act:'Действия'
  };

  ui.colList.innerHTML = S.colsOrder.map(k => {
    const checked = isColOn(k) ? 'checked' : '';
    const label = LABELS[k] || k;
    return `<label style="display:flex;gap:8px;align-items:center;padding:6px 4px">
      <input type="checkbox" value="${k}" ${checked}> ${label}
    </label>`;
  }).join('');

  ui.colModal.style.display = 'flex';

  ui.colCancel.onclick = () => { ui.colModal.style.display = 'none'; };
  ui.colApply.onclick  = () => {
    const boxes = Array.from(ui.colList.querySelectorAll('input[type="checkbox"]'));
    const next = boxes.filter(b => b.checked).map(b => b.value);
    if (next.length) {
      S.colsVisible = new Set(next);
      localStorage.setItem('colsVisible_v2', JSON.stringify([...S.colsVisible]));
      render();
    }
    ui.colModal.style.display = 'none';
  };
}

// ---------- Row render ----------
function rowCells(it) {
  const id = Number(it.id || it.ID) || 0;
  const uid = Number(it.assignedById || it.ASSIGNED_BY_ID);
  const user = S.users[uid];
  const dealId = UF(it, 'UF_CRM_10_1717328665682');
  const key    = UF(it, 'UF_CRM_10_1717328730625');
  const url    = UF(it, 'UF_CRM_10_1717328814784');
  const tariff = enumText(window.__ENUM_DICT, 'UF_CRM_10_1717329015552', UF(it, 'UF_CRM_10_1717329015552'));
  const tEnd   = fmtDate(UF(it, 'UF_CRM_10_1717329087589'));
  const mEnd   = fmtDate(UF(it, 'UF_CRM_10_1717329109963'));
  const prod   = enumText(window.__ENUM_DICT, 'UF_CRM_10_1717329453779', UF(it, 'UF_CRM_10_1717329453779'));

  const urlCell = url ? `<a href="${String(url)}" target="_blank" rel="noopener">${String(url)}</a>` : '—';

  return {
    id: id ? String(id) : '—',
    title: id ? `<a href="#" data-act="open-item" data-id="${id}">${String(it.title || '—')}</a>` : (String(it.title || '—')),
    ass: uid ? `<a href="#" data-act="open-user" data-uid="${uid}">${shortUser(user)}</a>` : shortUser(user),

    stage: stageSegbar(it),
    deal: dealId ?? '—',
    key: key ? String(key) : '—',
    url: urlCell,
    tariff: tariff || '—',
    tEnd, mEnd,
    product: prod || '—',
    act: id ? `<button class="btn btn-xs" data-act="open-item" data-id="${id}">Открыть</button>
               <button class="btn btn-xs" data-act="unlink" data-id="${id}">Удалить</button>` : '',
  };
}
function render() {
  // безопасно, чтобы не было пустого экрана
  if (!S.colsOrder.length) readColsFromHead();

  const list = S.items.filter(passFilters);
  if (!list.length) {
    ui.rows.innerHTML = `<tr><td colspan="${Math.max(1, S.colsOrder.length)}" class="muted">Ничего не найдено</td></tr>`;
    applyColsVisibility();
    return;
  }
  ui.rows.innerHTML = list.map(it => {
    const cells = rowCells(it);
    return `<tr>${S.colsOrder.map(code => `<td data-col="${code}">${cells[code] ?? ''}</td>`).join('')}</tr>`;
  }).join('');
  applyColsVisibility();
}

// ---------- Smart Picker ----------
function ensureSmartPicker() {
  let modal = $('#spModal');
  if (modal) return modal;

  const html = `
  <div class="modal" id="spModal" style="display:none;z-index:10000">
    <div class="card" style="width:min(720px,95vw)">
      <div class="card-h">Добавить элементы смарт-процесса</div>
      <div class="card-b">
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input id="spQuery" class="filter" placeholder="Поиск по ID / тексту">
          <button class="btn" id="spSearch">Искать</button>
        </div>
        <div id="spList" style="max-height:50vh;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px"></div>
      </div>
      <div class="card-f">
        <button class="btn" id="spCancel">Отмена</button>
        <button class="btn primary" id="spApply">Выбрать</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  modal = $('#spModal');
  return modal;
}

async function loadSmartList(query = '') {
  const box = $('#spList');
  box.innerHTML = 'Загрузка…';
  const { items } = await searchSmartItems(SMART_ENTITY_TYPE_ID, query, 30, 0, buildSelect());
  if (!items.length) { box.innerHTML = '<div class="muted">Ничего не найдено</div>'; return; }
  box.innerHTML = items.map(it => {
    const id = Number(it.id || it.ID);
    const title = String(it.title || '').replace(/</g,'&lt;');
    const ass = shortUser(S.users[Number(it.assignedById || it.ASSIGNED_BY_ID)]) || '—';
    return `<label style="display:flex;gap:8px;align-items:center;padding:6px 4px">
      <input type="checkbox" class="spCheck" value="${id}">
      <span style="min-width:72px;color:#6b7280">#${id}</span>
      <b style="flex:1">${title || 'Без названия'}</b>
      <span style="color:#6b7280">${ass}</span>
    </label>`;
  }).join('');
}

async function openSmartPicker() {
  const modal = ensureSmartPicker();
  modal.style.display = 'flex';

  await load();            // актуализируем users/stages
  await loadSmartList('');

  $('#spSearch').onclick = () => loadSmartList(($('#spQuery').value || '').trim());
  $('#spCancel').onclick = () => modal.style.display = 'none';
  $('#spApply').onclick = async () => {
    const ids = $$('.spCheck', modal).filter(x => x.checked).map(x => Number(x.value)).filter(Boolean);
    if (!ids.length) { modal.style.display = 'none'; return; }
    const merged = Array.from(new Set([...S.ids, ...ids]));
    const ok = await updateDealLinkedIds(S.dealId, DEAL_FIELD_CODE, merged);
    if (!ok) { alert('Не удалось обновить сделку'); return; }
    modal.style.display = 'none';
    await load();
  };
}

// ---------- Actions / Filters ----------
function bindFilters() {
  const bind = (el, key) => el && el.addEventListener('input', () => { S.filters[key] = (el.value || '').toLowerCase(); render(); });
  bind(ui.fTitle,'title'); bind(ui.fAss,'ass'); bind(ui.fStage,'stage'); bind(ui.fDeal,'deal');
  bind(ui.fKey,'key'); bind(ui.fUrl,'url'); bind(ui.fTariff,'tariff');
}
function bindActions() {
  ui.btnRefresh && ui.btnRefresh.addEventListener('click', load);
  ui.btnPick && ui.btnPick.addEventListener('click', openSmartPicker);

  // ВАЖНО: открываем МОДАЛ с наполнение чекбоксов
  ui.btnCols && ui.btnCols.addEventListener('click', openColsModal);
}

// ---------- Load ----------
async function load() {
  ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Загрузка…</td></tr>`;
  S.dealId = resolveDealId();
  if (!S.dealId) { ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Нет ID сделки</td></tr>`; return; }

  const meta = await fetchFieldMeta(SMART_ENTITY_TYPE_ID);
  window.__UF_KEYMAP = meta.keymap || {};
  window.__ENUM_DICT = meta.enums  || {};

  const ids = await getLinkedItemIds(S.dealId, DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID);
  S.ids = ids;
  if (!ids.length) { ui.rows.innerHTML = `<tr><td colspan="12" class="muted">В сделке нет связанных элементов</td></tr>`; applyColsVisibility(); return; }

  const select = buildSelect();
  S.items = await robustGetItemsByIds(SMART_ENTITY_TYPE_ID, ids, select);
  if (!S.items.length) { ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Не удалось загрузить элементы</td></tr>`; applyColsVisibility(); return; }

  await buildUsers(S.items);
  await buildStages(S.items);

  if (!S.colsOrder.length) readColsFromHead();
  render();

  if (window.BX24?.resizeWindow) {
    setTimeout(() => BX24.resizeWindow(document.documentElement.scrollWidth, document.documentElement.scrollHeight), 150);
  }
}

// ---------- Init ----------
function init() {
  readColsFromHead();
  bindFilters();
  bindActions();
  load();
}
document.addEventListener('DOMContentLoaded', () => {
  try { init(); } catch (e) { console.error('Init error', e); }
});
