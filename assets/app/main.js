// assets/app/main.js

// --- Импорты: ничего лишнего, только то, что есть в твоём репо
import { $, $$, A, J, fmtDate, UF, enumText, parseStage } from './utils.js';
import {
  SMART_ENTITY_TYPE_ID,
  DEAL_FIELD_CODE,
  COL_TITLES,
  DEFAULT_COLUMNS,
  PAGE_SIZES,
} from './config.js';
import {
  bx,
  getLinkedItemIds,
  robustGetItemsByIds,
  buildSelect,
  listUserFields,
  listUsers,
  listCategoryStages,
  updateItemStage,
} from './api.js';

// ================= Состояние и ссылки на UI =================
const S = {
  dealId: null,
  ids: [],
  items: [],
  users: {},
  ufEnums: {},
  stagesByFull: {},        // 'DT1032_16:NEW' -> {id,name,sort,categoryId,statusId,color}
  stagesByCatStatus: {},   // '16:NEW' -> stageObj
  catStages: {},           // 16 -> [stageObj...]
  cats: {},                // 16 -> { maxSort, palette }
  view: { page: 1, size: 30, sortKey: 'id', sortDir: 'asc' },
  filter: { title:'', ass:'', stage:'', deal:'', key:'', url:'', tariff:'', product:'' },
  cols: JSON.parse(localStorage.getItem('cols_v1') || 'null') || DEFAULT_COLUMNS.slice(),
  widths: JSON.parse(localStorage.getItem('widths_v1') || '{}'),
};

const ui = {
  rows: $('#rows'),
  head: document.querySelector('tr.head'),
  filters: document.querySelector('tr.filters'),
  // toolbar
  btnRefresh: $('#btnRefresh'),
  btnCreate : $('#btnCreate'),
  btnPick   : $('#btnPick'),
  btnCols   : $('#btnCols'),
  pageSize  : $('#pageSize'),
  pgPrev    : $('#pgPrev'),
  pgNext    : $('#pgNext'),
  pgInfo    : $('#pgInfo'),
  // filters
  fTitle: $('#fTitle'), fAss: $('#fAss'), fStage: $('#fStage'),
  fDeal: $('#fDeal'), fKey: $('#fKey'), fUrl: $('#fUrl'),
  fTariff: $('#fTariff'), fProduct: $('#fProduct'),
  // modal cols
  colModal: $('#colModal'), colList: $('#colList'),
  colCancel: $('#colCancel'), colApply: $('#colApply'),
};

// Автовысота фрейма виджета
const fit = (() => {
  let raf;
  return function () {
    if (!window.BX24) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) + 12;
      try { BX24.resizeWindow(h); } catch (e) {}
    });
  };
})();
new ResizeObserver(() => fit()).observe(document.body);

// ================= ВСПОМОГАТЕЛЬНОЕ =================

// карта UF_* -> фактические ufCrm*
async function buildUFKeyMap() {
  const r = await bx.call('crm.item.fields', { entityTypeId: SMART_ENTITY_TYPE_ID });
  if (r.error()) return;
  const fields = r.data()?.fields || {};
  const map = {};
  for (const prop in fields) {
    const up = (fields[prop].upperName || prop.toUpperCase());
    map[up] = prop;
  }
  window.__UF_KEYMAP = map;
}

// перечисления (тариф/продукт)
async function buildUFEnums() {
  S.ufEnums = {};
  // 1) через userfield.list
  const uf = await listUserFields(SMART_ENTITY_TYPE_ID);
  uf.forEach(f => {
    const code = f.FIELD_NAME || f.fieldName;
    const list = f.LIST || f.list || [];
    if (code && Array.isArray(list) && list.length) {
      S.ufEnums[code] = {};
      list.forEach(e => {
        const id  = Number(e.ID ?? e.VALUE_ID);
        const val = String(e.VALUE ?? id);
        if (id) { S.ufEnums[code][id] = val; S.ufEnums[code][String(id)] = val; }
      });
    }
  });
  // 2) добираем из item.fields (если нужно)
  const r = await bx.call('crm.item.fields', { entityTypeId: SMART_ENTITY_TYPE_ID });
  if (!r.error()) {
    const flds = r.data()?.fields || {};
    Object.keys(flds).forEach(code => {
      const items = flds[code]?.items || flds[code]?.ITEMS || [];
      if (items && items.length) {
        S.ufEnums[code] = S.ufEnums[code] || {};
        items.forEach(e => {
          const id  = Number(e.ID);
          const val = String(e.VALUE ?? id);
          if (id) { S.ufEnums[code][id] = val; S.ufEnums[code][String(id)] = val; }
        });
      }
    });
  }
}

// имена ответственных
async function buildUsers(items) {
  const ids = Array.from(new Set(items.map(i => Number(i.assignedById)).filter(Boolean)));
  if (!ids.length) return;
  S.users = await listUsers(ids);
}

// стадии с цветами и прогрессом
async function buildStages(items) {
  const cats = Array.from(new Set(items.map(i => Number(i.categoryId)).filter(Boolean)));
  if (!cats.length) return;

  // тянем список стадий по категориям
  const rows = await listCategoryStages(SMART_ENTITY_TYPE_ID, cats);
  rows.forEach(row => {
    const list = Array.isArray(row) ? row : (row?.stages || row?.STAGES) || [];
    const cid = Number(list[0]?.categoryId || list[0]?.CATEGORY_ID || 0);
    list.forEach(st => {
      const statusId   = String(st.statusId ?? st.STATUS_ID ?? '');
      const name       = String(st.name ?? st.NAME ?? statusId);
      const sort       = Number(st.sort ?? st.SORT ?? 0);
      const categoryId = Number(st.categoryId ?? st.CATEGORY_ID ?? cid);
      const color      = st.color ?? st.COLOR ?? null;
      const fullId     = String(st.id ?? st.ID ?? (categoryId ? `DT${SMART_ENTITY_TYPE_ID}_${categoryId}:${statusId}` : statusId));
      const obj = { id: fullId, name, sort, categoryId, statusId, color };
      S.stagesByFull[fullId] = obj;
      S.stagesByCatStatus[categoryId + ':' + statusId] = obj;
      if (!S.catStages[categoryId]) S.catStages[categoryId] = [];
      S.catStages[categoryId].push(obj);
    });
  });

  Object.keys(S.catStages).forEach(cid => {
    S.catStages[cid].sort((a, b) => a.sort - b.sort);
    const max = S.catStages[cid].length ? Math.max(...S.catStages[cid].map(s => s.sort || 100)) : 100;
    S.cats[cid] = { maxSort: max || 100 };
  });
}

function getStageObject(item) {
  const sid = item.stageId;
  const { categoryId, statusId } = parseStage(sid);
  return S.stagesByFull[sid] || S.stagesByCatStatus[(categoryId + ':' + statusId)] || { id: sid, name: sid, sort: 0, categoryId };
}

function stageUi(item) {
  const st  = getStageObject(item);
  const cid = Number(item.categoryId) || st.categoryId || 0;
  const max = S.cats[cid]?.maxSort || 100;
  const pct = Math.max(0, Math.min(100, Math.round(((st.sort || 0) / max) * 100)));
  const list = S.catStages[cid] || [];
  const opts = list.map(s => `<option value="${s.id}" ${s.id === st.id ? 'selected' : ''}>${s.name}</option>`).join('');
  // цвет прогресса по цвету стадии (если есть)
  const barColor = st.color || '#a5b4fc';
  return `
    <div class="stage">
      <div class="bar"><i style="width:${pct}%; background:${barColor}"></i></div>
      <span>${st.name}</span>
      <select class="stageSel" data-item="${item.id}" data-cur="${st.id}">${opts}</select>
    </div>
  `;
}

function enumTextSafe(code, val) {
  if (val === null || val === undefined || val === '') return '—';
  const d = S.ufEnums[code] || {};
  const s = String(val);
  return d[s] ?? d[Number(s)] ?? val;
}

// Фильтрация/сортировка/пагинация
function filteredAndSorted() {
  const f = S.filter;
  let arr = S.items.filter(it => {
    const title = String(it.title || '').toLowerCase();
    const uid = Number(it.assignedById) || null;
    const ass = uid && S.users[uid] ? [S.users[uid].LAST_NAME, S.users[uid].NAME].filter(Boolean).join(' ').toLowerCase() : '';
    const st  = getStageObject(it).name.toLowerCase();

    const deal  = String(UF(it, 'UF_CRM_10_1717328665682') || '').toLowerCase();
    const key   = String(UF(it, 'UF_CRM_10_1717328730625') || '').toLowerCase();
    const url   = String(UF(it, 'UF_CRM_10_1717328814784') || '').toLowerCase();
    const tariff  = String(enumTextSafe('UF_CRM_10_1717329015552', UF(it, 'UF_CRM_10_1717329015552')) || '').toLowerCase();
    const prod    = String(enumTextSafe('UF_CRM_10_1717329453779', UF(it, 'UF_CRM_10_1717329453779')) || '').toLowerCase();

    return (!f.title || title.includes(f.title))
        && (!f.ass || ass.includes(f.ass))
        && (!f.stage || st.includes(f.stage))
        && (!f.deal || deal.includes(f.deal))
        && (!f.key || key.includes(f.key))
        && (!f.url || url.includes(f.url))
        && (!f.tariff || tariff.includes(f.tariff))
        && (!f.product || prod.includes(f.product));
  });

  const dir = S.view.sortDir === 'asc' ? 1 : -1, key = S.view.sortKey;
  arr.sort((x, y) => {
    const get = (k) => {
      if (k === 'id') return (Number(x.id) || 0) - (Number(y.id) || 0);
      if (k === 'title') return String(x.title || '').localeCompare(String(y.title || ''), 'ru', { sensitivity: 'base' });
      if (k === 'ass') {
        const ax = [S.users[Number(x.assignedById)]?.LAST_NAME, S.users[Number(x.assignedById)]?.NAME].filter(Boolean).join(' ');
        const ay = [S.users[Number(y.assignedById)]?.LAST_NAME, S.users[Number(y.assignedById)]?.NAME].filter(Boolean).join(' ');
        return String(ax).localeCompare(String(ay), 'ru', { sensitivity: 'base' });
      }
      if (k === 'stage') return (getStageObject(x).sort || 0) - (getStageObject(y).sort || 0);
      if (k === 'dealid') return String(UF(x, 'UF_CRM_10_1717328665682') || '').localeCompare(String(UF(y, 'UF_CRM_10_1717328665682') || ''), 'ru', { numeric: true });
      if (k === 'key') return String(UF(x, 'UF_CRM_10_1717328730625') || '').localeCompare(String(UF(y, 'UF_CRM_10_1717328730625') || ''), 'ru', { sensitivity: 'base' });
      if (k === 'url') return String(UF(x, 'UF_CRM_10_1717328814784') || '').localeCompare(String(UF(y, 'UF_CRM_10_1717328814784') || ''), 'ru', { sensitivity: 'base' });
      if (k === 'tariff') {
        const tx = enumTextSafe('UF_CRM_10_1717329015552', UF(x, 'UF_CRM_10_1717329015552')) || '';
        const ty = enumTextSafe('UF_CRM_10_1717329015552', UF(y, 'UF_CRM_10_1717329015552')) || '';
        return String(tx).localeCompare(String(ty), 'ru', { sensitivity: 'base' });
      }
      if (k === 'tEnd') return String(UF(x, 'UF_CRM_10_1717329087589') || '').localeCompare(String(UF(y, 'UF_CRM_10_1717329087589') || ''), 'ru', { numeric: true });
      if (k === 'mEnd') return String(UF(x, 'UF_CRM_10_1717329109963') || '').localeCompare(String(UF(y, 'UF_CRM_10_1717329109963') || ''), 'ru', { numeric: true });
      if (k === 'product') {
        const px = enumTextSafe('UF_CRM_10_1717329453779', UF(x, 'UF_CRM_10_1717329453779')) || '';
        const py = enumTextSafe('UF_CRM_10_1717329453779', UF(y, 'UF_CRM_10_1717329453779')) || '';
        return String(px).localeCompare(String(py), 'ru', { sensitivity: 'base' });
      }
      return 0;
    };
    const v = get(key);
    return v === 0 ? ((Number(x.id) || 0) - (Number(y.id) || 0)) * dir : v * dir;
  });
  if (dir < 0) arr.reverse();
  return arr;
}

// Отрисовка таблицы (минимально самодостаточная)
function render() {
  // применяем видимость столбцов
  document.querySelectorAll('[data-col]').forEach(th => {
    const key = th.getAttribute('data-col');
    th.style.display = S.cols.includes(key) ? '' : 'none';
    const w = S.widths[key]; if (w) th.style.width = w;
  });
  ui.filters.querySelectorAll('[data-col]').forEach(td => {
    const key = td.getAttribute('data-col');
    td.style.display = S.cols.includes(key) ? '' : 'none';
  });

  const full = filteredAndSorted();
  const total = full.length;
  const pages = Math.max(1, Math.ceil(total / S.view.size));
  if (S.view.page > pages) S.view.page = pages;
  const start = (S.view.page - 1) * S.view.size;
  const slice = full.slice(start, start + S.view.size);

  ui.pgInfo.textContent = S.view.page + '/' + pages;
  ui.pgPrev.disabled = (S.view.page <= 1);
  ui.pgNext.disabled = (S.view.page >= pages);

  if (!slice.length) {
    ui.rows.innerHTML = '<tr><td colspan="12" class="muted">Ничего не найдено</td></tr>';
    fit();
    return;
  }

  ui.rows.innerHTML = '';
  slice.forEach(it => {
    const id    = it.id;
    const title = it.title || ('#' + id);
    const uid   = Number(it.assignedById) || null;
    const u     = uid ? S.users[uid] : null;
    const assHtml = u
      ? `<a href="#" onclick="BX24.openPath('/company/personal/user/${uid}/');return false;">${[u.LAST_NAME, u.NAME].filter(Boolean).join(' ')}</a>`
      : (uid ? ('ID ' + uid) : '—');

    const stage = stageUi(it);
    const deal    = UF(it, 'UF_CRM_10_1717328665682') ?? '—';
    const key     = UF(it, 'UF_CRM_10_1717328730625') ?? '—';
    const urlRaw  = UF(it, 'UF_CRM_10_1717328814784') ?? '';
    const url     = urlRaw ? `<a href="${urlRaw}" target="_blank" rel="noopener">${urlRaw}</a>` : '—';
    const tariff  = enumTextSafe('UF_CRM_10_1717329015552', UF(it, 'UF_CRM_10_1717329015552'));
    const tEnd    = fmtDate(UF(it, 'UF_CRM_10_1717329087589'));
    const mEnd    = fmtDate(UF(it, 'UF_CRM_10_1717329109963'));
    const product = enumTextSafe('UF_CRM_10_1717329453779', UF(it, 'UF_CRM_10_1717329453779'));

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-col="id">${id}</td>
      <td class="wrap-title" data-col="title"><a href="#" onclick="BX24.openPath('/crm/type/${SMART_ENTITY_TYPE_ID}/details/${id}/');return false;">${title}</a></td>
      <td data-col="ass">${assHtml}</td>
      <td data-col="stage">${stage}</td>
      <td data-col="deal">${deal}</td>
      <td data-col="key">${key}</td>
      <td data-col="url" class="wrap-title">${url}</td>
      <td data-col="tariff">${tariff}</td>
      <td data-col="tEnd">${tEnd}</td>
      <td data-col="mEnd">${mEnd}</td>
      <td data-col="product">${product}</td>
      <td data-col="act">
        <button class="btn" data-open="${id}">Открыть</button>
        <button class="btn" data-del="${id}">Удалить</button>
      </td>
    `;
    tr.querySelectorAll('[data-col]').forEach(td => {
      const key = td.getAttribute('data-col');
      td.style.display = S.cols.includes(key) ? '' : 'none';
    });
    ui.rows.appendChild(tr);
  });

  // события
  ui.rows.querySelectorAll('[data-open]').forEach(n => n.onclick = () => BX24.openPath(`/crm/type/${SMART_ENTITY_TYPE_ID}/details/${n.getAttribute('data-open')}/`));
  ui.rows.querySelectorAll('.stageSel').forEach(sel => {
    sel.onchange = () => {
      const newStageId = sel.value, itemId = Number(sel.getAttribute('data-item'));
      updateItemStage(SMART_ENTITY_TYPE_ID, itemId, newStageId).then(ok => {
        if (!ok) { alert('Ошибка смены стадии'); sel.value = sel.getAttribute('data-cur'); return; }
        const it = S.items.find(i => i.id === itemId); if (it) it.stageId = newStageId; render();
      });
    };
  });

  ui.rows.querySelectorAll('[data-del]').forEach(b => b.onclick = () => detach(Number(b.getAttribute('data-del'))));
  fit();
}

// Сохранение связей в сделке (detach/attach)
function save(next) {
  const f = {}; f[DEAL_FIELD_CODE] = next;
  bx.call('crm.deal.update', { id: S.dealId, fields: f }).then(() => load());
}
function attach(ids) {
  // поддержка строк биндингов DYNAMIC_…
  const add = ids.map(id => `DYNAMIC_${SMART_ENTITY_TYPE_ID}_${id}`);
  const prev = A(S.bindings || []);
  const next = Array.from(new Set([...prev, ...add]));
  save(next);
}
function detach(id) {
  const code = `DYNAMIC_${SMART_ENTITY_TYPE_ID}_${id}`;
  const next = A(S.bindings || []).filter(c => c !== code);
  save(next);
}

// ================== РАЗДЕЛ: Инициализация/Загрузка ==================

// --- получаем ID сделки из PLACEMENT_OPTIONS или query-параметров
function resolveDealId() {
  let id = null;
  try {
    const boot = window.__BOOT__ || {};
    if (boot.placementOptions) {
      const po = J(boot.placementOptions);
      id =
        po?.options?.ID ??
        po?.options?.ENTITY_ID ??
        po?.dealId ??
        po?.ID ??
        po?.ENTITY_ID ??
        null;
    }
  } catch {}
  const url = new URL(location.href);
  id = id ?? Number(url.searchParams.get('dealId') || url.searchParams.get('id'));
  id = Number(id);
  return Number.isFinite(id) ? id : null;
}

async function load() {
  S.dealId = resolveDealId();
  if (!S.dealId) {
    ui.rows.innerHTML = '<tr><td colspan="12" class="muted">Нет ID сделки</td></tr>';
    fit();
    return;
  }

  // связанные ID из UF-поля
  const ids = await getLinkedItemIds(S.dealId, DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID);
  S.ids = ids;

  if (!ids.length) {
    ui.rows.innerHTML = '<tr><td colspan="12" class="muted">В сделке нет связанных элементов</td></tr>';
    fit();
    return;
  }

  // элементы
  const select = buildSelect();
  const items = await robustGetItemsByIds(SMART_ENTITY_TYPE_ID, ids, select);
  S.items = items || [];
  if (!S.items.length) {
    ui.rows.innerHTML = '<tr><td colspan="12" class="muted">Не удалось загрузить элементы</td></tr>';
    fit();
    return;
  }

  await buildUFKeyMap();
  await buildUFEnums();
  await buildUsers(S.items);
  await buildStages(S.items);
  render();
}

// ================== Обработчики UI ==================
function enableResizers() {
  document.querySelectorAll('th .resizer').forEach(handle => {
    const th = handle.parentElement;
    const key = th.getAttribute('data-col');
    let startX, startW;
    handle.onmousedown = e => {
      startX = e.clientX; startW = th.offsetWidth;
      th.classList.add('resizing');
      document.onmousemove = ev => {
        const w = Math.max(60, startW + (ev.clientX - startX));
        th.style.width = w + 'px';
        S.widths[key] = th.style.width;
      };
      document.onmouseup = () => {
        document.onmousemove = null; document.onmouseup = null;
        th.classList.remove('resizing');
        localStorage.setItem('widths_v1', JSON.stringify(S.widths));
      };
    };
  });
}

function openCols() {
  ui.colList.innerHTML = '';
  const all = ['id','title','ass','stage','deal','key','url','tariff','tEnd','mEnd','product','act'];
  all.forEach(k => {
    const id = 'col_' + k;
    const row = document.createElement('label');
    row.innerHTML = `<input type="checkbox" id="${id}" ${S.cols.includes(k) ? 'checked' : ''}> ${COL_TITLES[k] || k}`;
    ui.colList.appendChild(row);
  });
  ui.colModal.style.display = 'flex';
}
function closeCols(){ ui.colModal.style.display='none'; }
ui.colCancel?.addEventListener('click', closeCols);
ui.colApply?.addEventListener('click', () => {
  const boxes = [...ui.colList.querySelectorAll('input[type="checkbox"]')];
  const list = boxes.filter(b => b.checked).map(b => b.id.replace('col_', ''));
  if (!list.length) return;
  S.cols = list;
  localStorage.setItem('cols_v1', JSON.stringify(S.cols));
  closeCols(); render(); fit();
});

// сортировка по клику
ui.head?.addEventListener('click', e => {
  const th = e.target.closest('th[data-col]');
  if (!th || e.target.classList.contains('resizer')) return;
  const map = { deal: 'dealid', key: 'key', url: 'url', tariff: 'tariff', tEnd: 'tEnd', mEnd: 'mEnd', product: 'product' };
  const key = th.getAttribute('data-col');
  const sortKey = ({ id: 'id', title: 'title', ass: 'ass', stage: 'stage', act: 'id' })[key] || map[key] || 'id';
  S.view.sortKey === sortKey ? (S.view.sortDir = S.view.sortDir === 'asc' ? 'desc' : 'asc') : (S.view.sortKey = sortKey, S.view.sortDir = 'asc');
  render(); fit();
});

// фильтры
[ui.fTitle, ui.fAss, ui.fStage, ui.fDeal, ui.fKey, ui.fUrl, ui.fTariff, ui.fProduct].forEach(inp => inp && inp.addEventListener('input', () => {
  S.filter = {
    title: (ui.fTitle?.value || '').toLowerCase(),
    ass:   (ui.fAss?.value || '').toLowerCase(),
    stage: (ui.fStage?.value || '').toLowerCase(),
    deal:  (ui.fDeal?.value || '').toLowerCase(),
    key:   (ui.fKey?.value || '').toLowerCase(),
    url:   (ui.fUrl?.value || '').toLowerCase(),
    tariff:(ui.fTariff?.value || '').toLowerCase(),
    product:(ui.fProduct?.value || '').toLowerCase()
  };
  S.view.page = 1; render(); fit();
}));

// пагинация + тулбар
ui.pageSize?.addEventListener('change', () => { S.view.size = Number(ui.pageSize.value) || 30; S.view.page = 1; render(); fit(); });
ui.pgPrev?.addEventListener('click', () => { if (S.view.page > 1) { S.view.page--; render(); fit(); } });
ui.pgNext?.addEventListener('click', () => {
  const pages = Math.max(1, Math.ceil(filteredAndSorted().length / S.view.size));
  if (S.view.page < pages) { S.view.page++; render(); fit(); }
});
ui.btnCols?.addEventListener('click', openCols);
ui.btnRefresh?.addEventListener('click', load);
ui.btnCreate?.addEventListener('click', () => BX24.openPath(`/crm/type/${SMART_ENTITY_TYPE_ID}/details/0/`));
// Пикер элементов можно вернуть позже, пока оставим кнопку без действия
ui.btnPick?.addEventListener('click', () => alert('Пикер будет подключён позже'));

// включаем ручки ресайза
enableResizers();

// Старт: ждём init и запускаем загрузку
document.addEventListener('DOMContentLoaded', () => {
  if (window.BX24) {
    BX24.init(() => {
      // подстраховка: попытка получить placement.info может пролететь
      BX24.placement.info(() => load());
      setTimeout(load, 300);
      setTimeout(load, 1200);
    });
  } else {
    // если виджет открыт вне Bitrix — всё равно попробуем
    load();
  }
});
