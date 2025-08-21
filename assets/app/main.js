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
  updateItemStage,        // ← добавь это
  openBxPath,
  smartItemPath,
  searchSmartItems,
} from './api.js';
import { SMART_ENTITY_TYPE_ID, DEAL_FIELD_CODE, ALL_COLUMNS, COL_TITLES } from './config.js';
import { waitBX24 } from './sdk.js'; // ← ДОБАВЬ ЭТУ СТРОКУ

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
  pgPrev: $('#pgPrev'),
  pgNext: $('#pgNext'),
  pgInfo: $('#pgInfo'),
  pageSize: $('#pageSize'),

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

  // колонки
  colsOrder: [],
  colsVisible: {},

  // пагинация
  page: 1,
  pageSize: Number(localStorage.getItem('pageSize_v1')) || Number(ui.pageSize?.value) || 10,
};
if (ui.pageSize) ui.pageSize.value = String(S.pageSize);

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

//function normalizePortalUrl(raw){
//  let s = String(raw || '').trim();
//  if (!s) return null;
//  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
//  try { return new URL(s).href; } catch { return s; }
//}

function stageSegbar(it) {
  const { typeId, categoryId, statusId } = parseStage(it.stageId);
  const pack = S.stagesByCat[Number(categoryId)] || { order: [], byId: {} };
  const idx  = Math.max(0, pack.order.indexOf(statusId));

  const segs = pack.order.map((sid,i) => {
    const st = pack.byId[sid] || {};
    const cls = i < idx ? 'done' : (i === idx ? 'now' : '');
    return `<i class="${cls}" style="background:${st.COLOR||'#a5b4fc'}" data-tip="${st.NAME||sid}"></i>`;
  }).join('');

  const prefix = `DT${typeId ?? SMART_ENTITY_TYPE_ID}_${categoryId}:`;
  const opts = pack.order.map(sid => {
    const st = pack.byId[sid] || {};
    return `<option value="${prefix}${sid}" ${sid===statusId?'selected':''}>${st.NAME||sid}</option>`;
  }).join('');

  return `
    <div class="stage">
      <div class="segbar">${segs}</div>
      <select class="stageSel" data-id="${Number(it.id||it.ID)}" data-cur="${String(it.stageId)}">
        ${opts}
      </select>
    </div>`;
}

function bindRowHandlers() {
  // открыть элемент
  $$('#rows [data-act="open-item"]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      const id = Number(a.dataset.id);
      openBxPath(`/crm/type/${SMART_ENTITY_TYPE_ID}/details/${id}/`);
    };
  });

  // открыть ответственного
  $$('#rows [data-act="open-user"]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      const uid = Number(a.dataset.uid);
      openBxPath(`/company/personal/user/${uid}/`);
    };
  });

  // удалить связь
  $$('#rows [data-act="unlink"]').forEach(btn => {
    btn.onclick = async () => {
      const id = Number(btn.dataset.id);
      S.ids = S.ids.filter(x => Number(x) !== id);
      await updateDealLinkedIds(S.dealId, DEAL_FIELD_CODE, S.ids, SMART_ENTITY_TYPE_ID);
      S.items = S.items.filter(it => Number(it.id||it.ID) !== id);
      render();
    };
  });

  // смена стадии
  $$('#rows .stageSel').forEach(sel => {
    sel.onchange = async () => {
      const id = Number(sel.dataset.id);
      const newStage = sel.value;
      const ok = await updateItemStage(SMART_ENTITY_TYPE_ID, id, newStage);
      if (ok) {
        const it = S.items.find(x => Number(x.id||x.ID) === id);
        if (it) it.stageId = newStage;
        render();
      } else {
        sel.value = sel.dataset.cur;
        alert('Не удалось обновить стадию');
      }
    };
  });
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

  const front = ['id', 'title', 'ass'];
  const rest  = keys.filter(k => !front.includes(k));
  S.colsOrder = [...front, ...rest];

  const saved = JSON.parse(localStorage.getItem('colsVisible_v2') || 'null');
  S.colsVisible = saved ? new Set(saved) : new Set(S.colsOrder);
  // проверка
//  const isColOn = (code) => S.colsVisible.has(code);

}
//function isColOn(code){ return !!S.colsVisible[code]; }
function applyColsVisibility() {
  const on = S.colsVisible;
  $$('thead tr.head th[data-col], thead tr.filters th[data-col]').forEach(th => {
    th.style.display = on.has(th.dataset.col) ? '' : 'none';
  });
  $$('tbody#rows tr').forEach(tr => {
    $$('td[data-col]', tr).forEach(td => td.style.display = on.has(td.dataset.col) ? '' : 'none');
  });
}
function openColsModal() {
  if (!ui.colModal) return;
  const title = (c) => COL_TITLES[c] || c;
  ui.colList.innerHTML = S.colsOrder.map(k =>
    `<label><input type="checkbox" value="${k}" ${S.colsVisible.has(k)?'checked':''}> ${COL_TITLES[k]||k}</label>`
  ).join('');
  ui.colModal.style.display = 'flex';

  ui.colApply.onclick = () => {
    const next = [...ui.colList.querySelectorAll('input[type="checkbox"]')]
      .filter(b => b.checked)
      .map(b => b.value);
    S.colsVisible = new Set(next);
    localStorage.setItem('colsVisible_v2', JSON.stringify(next));
    ui.colModal.style.display = 'none';
    render();
  };
  ui.colCancel.onclick = () => ui.colModal.style.display = 'none';
}

//function applyColsFromModal() {
//  const boxes = Array.from(ui.colList.querySelectorAll('input[type="checkbox"]'));
//  const next = Object.fromEntries(boxes.map(b => [b.value, b.checked]));
//  S.colsVisible = next;
//  localStorage.setItem('colsVisible', JSON.stringify(S.colsVisible));
//  ui.colModal.style.display = 'none';
//  render();
//}

// ---------- Helpers ----------
function normalizePortalUrl(raw){
  let s = String(raw || '').trim();
  if (!s) return null;
  // если пришёл без схемы — добавим https://
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  // уберём лишние пробелы и двойные слеши
  try {
    const u = new URL(s);
    return u.href;
  } catch {
    return s; // пусть будет как есть
  }
}

// ---------- Row render ----------
function rowCells(it) {
  const id = Number(it.id || it.ID) || 0;
  const uid = Number(it.assignedById || it.ASSIGNED_BY_ID);
  const user = S.users[uid];
  const dealId = UF(it, 'UF_CRM_10_1717328665682');
  const key    = UF(it, 'UF_CRM_10_1717328730625');
  const portal = normalizePortalUrl(UF(it, 'UF_CRM_10_1717328814784'));
  const urlCell = portal
    ? `<a href="${portal}" target="_blank" rel="noopener">${portal.replace(/^https?:\/\//,'')}</a>`
    : '—';
  const tariff = enumText(window.__ENUM_DICT, 'UF_CRM_10_1717329015552', UF(it, 'UF_CRM_10_1717329015552'));
  const tEnd   = fmtDate(UF(it, 'UF_CRM_10_1717329087589'));
  const mEnd   = fmtDate(UF(it, 'UF_CRM_10_1717329109963'));
  const prod   = enumText(window.__ENUM_DICT, 'UF_CRM_10_1717329453779', UF(it, 'UF_CRM_10_1717329453779'));

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
    act: id ? `<button class="btn btn-xs" data-act="unlink" data-id="${id}">Удалить</button>` : '',
  };
}

function render() {
  const filtered = S.items.filter(passFilters);

  // --- пагинация ---
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / S.pageSize));
  if (S.page > pages) S.page = pages;
  const start = (S.page - 1) * S.pageSize;
  const slice = filtered.slice(start, start + S.pageSize);

  // шапка пагинации
  if (ui.pgInfo) ui.pgInfo.textContent = `${S.page}/${pages}`;
  if (ui.pgPrev) ui.pgPrev.disabled = (S.page <= 1);
  if (ui.pgNext) ui.pgNext.disabled = (S.page >= pages);

  if (!slice.length) {
    ui.rows.innerHTML = `<tr><td colspan="${S.colsOrder.length || 12}" class="muted">Ничего не найдено</td></tr>`;
    applyColsVisibility();
    return;
  }

  ui.rows.innerHTML = slice.map(it => {
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
//  await load();            // актуализируем users/stages
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
  const bind = (el, key) => el && el.addEventListener('input', () => {
    S.filters[key] = String(el.value || '').toLowerCase();
    S.page = 1;
    render();
  });
  bind(ui.fTitle,'title'); bind(ui.fAss,'ass'); bind(ui.fStage,'stage'); bind(ui.fDeal,'deal');
  bind(ui.fKey,'key'); bind(ui.fUrl,'url'); bind(ui.fTariff,'tariff');
}
function bindActions() {
  ui.btnRefresh && ui.btnRefresh.addEventListener('click', load);
  ui.btnPick && ui.btnPick.addEventListener('click', openSmartPicker);

  // колонки
  ui.btnCols && ui.btnCols.addEventListener('click', openColsModal);
  ui.colCancel && ui.colCancel.addEventListener('click', () => ui.colModal.style.display = 'none');
 // ui.colApply  && ui.colApply.addEventListener('click', applyColsFromModal);

  // делегированные клики по таблице
  ui.rows.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    e.preventDefault(); // чтобы # и кнопки не вели себя по умолчанию
    const act = a.dataset.act;
    if (act === 'open-item') {
      const id = Number(a.dataset.id); if (!id) return;
      if (!openBxPath(smartItemPath(SMART_ENTITY_TYPE_ID, id))) alert(`Откройте элемент #${id} в CRM`);
    } else if (act === 'open-user') {
      const uid = Number(a.dataset.uid); if (!uid) return;
      if (!openBxPath(`/company/personal/user/${uid}/`)) alert(`Профиль пользователя #${uid}`);
    } else if (act === 'unlink') {
      const id = Number(a.dataset.id); if (!id) return;
      const left = S.ids.filter(x => Number(x) !== id);
      updateDealLinkedIds(S.dealId, DEAL_FIELD_CODE, left).then(load);
    }
  });

  // пагинация
  ui.pgPrev && ui.pgPrev.addEventListener('click', () => { if (S.page > 1) { S.page--; render(); } });
  ui.pgNext && ui.pgNext.addEventListener('click', () => {
    const total = S.items.filter(passFilters).length;
    const pages = Math.max(1, Math.ceil(total / S.pageSize));
    if (S.page < pages) { S.page++; render(); }
  });
  ui.pageSize && ui.pageSize.addEventListener('change', (e) => {
    S.pageSize = Number(e.target.value) || 10;
    localStorage.setItem('pageSize_v1', String(S.pageSize));
    S.page = 1;
    render();
  });
  
 // смена стадии из таблицы
  ui.rows.addEventListener('change', (e) => {
    const sel = e.target.closest('.stageSel');
    if (!sel) return;
    const itemId = Number(sel.dataset.id);
    const newStageId = sel.value;
    const prev = sel.dataset.cur;
    if (!itemId || !newStageId) return;

    updateItemStage(SMART_ENTITY_TYPE_ID, itemId, newStageId).then(ok => {
      if (!ok) {
        alert('Не удалось сменить стадию');
        sel.value = prev;
        return;
      }
      // локально обновим и перерисуем
      const it = S.items.find(x => Number(x.id||x.ID) === itemId);
      if (it) it.stageId = newStageId;
      sel.dataset.cur = newStageId;
      render();
    });
  });
}

// ---------- Load ----------
async function load() {
  ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Загрузка…</td></tr>`;
  try {
    // 1) ID сделки из окружения / URL
    S.dealId = resolveDealId();
    if (!S.dealId) {
      ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Нет ID сделки</td></tr>`;
      return;
    }

    // 2) Метаданные полей (UF/ENUM)
    const meta = await fetchFieldMeta(SMART_ENTITY_TYPE_ID);
    window.__UF_KEYMAP = meta.keymap || {};
    window.__ENUM_DICT = meta.enums  || {};

    // 3) Связанные элементы SPA из сделки
    const ids = await getLinkedItemIds(S.dealId, DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID);
    S.ids = ids;
    if (!ids.length) {
      ui.rows.innerHTML = `<tr><td colspan="12" class="muted">В сделке нет связанных элементов</td></tr>`;
      return;
    }

    // 4) Грузим сами элементы
    const select = buildSelect();
    S.items = await robustGetItemsByIds(SMART_ENTITY_TYPE_ID, ids, select);
    if (!S.items.length) {
      ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Не удалось загрузить элементы</td></tr>`;
      return;
    }

    // 5) Справочники для отображения
    await buildUsers(S.items);
    await buildStages(S.items);

    // 6) Рендер
    if (!S.colsOrder.length) readColsFromHead();
    render();

    // 7) Подогнать высоту виджета
    if (window.BX24?.resizeWindow) {
      setTimeout(() => BX24.resizeWindow(
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight
      ), 150);
    }
  } catch (e) {
    console.error('Load error', e);
    ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Ошибка загрузки</td></tr>`;
  }
}


// ---------- Init ----------
async function init() {
  readColsFromHead();
  bindFilters();
  bindActions();
  await waitBX24(); // ← ключевое: ждём SDK BX24 перед REST-вызовами
  await load();
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(e => {
    console.error('Init error', e);
    ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Ошибка инициализации</td></tr>`;
  });
});
//function init() { readColsFromHead(); bindFilters(); bindActions(); load(); }
//document.addEventListener('DOMContentLoaded', () => {
//  try { init(); } catch (e) { console.error('Init error', e); }
//});
