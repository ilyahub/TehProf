// assets/app/main.js
// Главный модуль виджета. Работает в связке с:
// utils.js, api.js, config.js

import {
  $, $$, A, J, pick, fmtDate,
  UF, enumText, putEnum, parseStage
} from './utils.js';

import {
  getLinkedItemIds,     // -> [ids] (DYNAMIC_* и числа)
  getItemsByIds,        // надёжный список по ids (list+batch)
  listUserFields,       // словари UF
  listUsers,            // пользователи по id
  listCategoryStages,   // стадии по категориям
  updateItemStage       // изменение стадии SPA-элемента
} from './api.js';

import {
  F, SMART_ENTITY_TYPE_ID, DEAL_FIELD_CODE
} from './config.js';

/* -------------------------- state -------------------------- */

const S = {
  dealId: null,                    // ID текущей сделки (PLACEMENT_OPTIONS)
  ids: [],                         // связанные элементы SPA
  items: [],                       // полученные элементы
  users: {},                       // { userId: { name, path } }
  ufEnums: {},                     // { UF_CODE: { id: text } }
  stagesByFull: {},                // { 'DT1032_16:NEW': {id,name,sort,categoryId,statusId} }
  stagesByCatStatus: {},           // { '16:NEW': stageObj }
  catStages: {},                   // { categoryId: [ {id,name,sort,statusId}, ... ] }
  cats: {},                        // { categoryId: {maxSort} }

  // Вьюха/фильтры/сортировка
  view: { page: 1, size: 10, sortKey: 'id', sortDir: 'asc' },
  filter: { title:'', ass:'', stage:'', deal:'', key:'', url:'', tariff:'', product:'' },

  // локальное сохранение видимости колонок и ширин: совместимо с прежней логикой
  cols: JSON.parse(localStorage.getItem('cols_v1') || 'null') ||
        ['id','title','ass','stage','deal','key','url','tariff','tEnd','mEnd','product','act'],
  widths: JSON.parse(localStorage.getItem('widths_v1') || '{}')
};

// Карта соответствий UF-имен: 'UF_CRM_10_...' -> 'ufCrm10_....'
// utils.UF её использует, если присутствует
window.__UF_KEYMAP = window.__UF_KEYMAP || {};

/* -------------------------- UI refs ------------------------ */

const ui = {
  rows: $('#rows'),
  head: document.querySelector('tr.head'),
  filtersRow: document.querySelector('tr.filters'),

  // buttons
  btnRefresh: $('#btnRefresh'),
  btnCreate : $('#btnCreate'),
  btnPick   : $('#btnPick'),
  btnCols   : $('#btnCols'),

  // paging
  pageSize: $('#pageSize'),
  pgPrev  : $('#pgPrev'),
  pgNext  : $('#pgNext'),
  pgInfo  : $('#pgInfo'),

  // filters
  fTitle : $('#fTitle'),
  fAss   : $('#fAss'),
  fStage : $('#fStage'),
  fDeal  : $('#fDeal'),
  fKey   : $('#fKey'),
  fUrl   : $('#fUrl'),
  fTariff: $('#fTariff'),
  fProduct: $('#fProduct'),

  // modal columns (если используешь)
  colModal: $('#colModal'),
  colList : $('#colList'),
  colCancel: $('#colCancel'),
  colApply : $('#colApply')
};

/* --------------------- helpers / fit ----------------------- */

const fit = (() => {
  let raf;
  return () => {
    if (!window.BX24) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      ) + 12;
      try { BX24.resizeWindow(h); } catch(e){ /* noop */ }
    });
  };
})();

new ResizeObserver(() => fit()).observe(document.body);

// упрощённое сокращение ФИО
function shortUser(raw) {
  const ln = pick(raw, 'LAST_NAME') || '';
  const fn = pick(raw, 'NAME') || '';
  // только Фамилия + Имя
  return [ln, fn].filter(Boolean).join(' ') || (pick(raw,'LOGIN') || '');
}

/* -------------------- словари/пользователи ---------------- */

async function buildUFEnums() {
  const list = await listUserFields(SMART_ENTITY_TYPE_ID);
  list.forEach(f => {
    const code = pick(f, 'FIELD_NAME', 'fieldName');       // например UF_CRM_10_...
    const enums = pick(f, 'LIST', 'list') || [];
    if (!code || !enums.length) return;

    // карта соответствий для utils.UF
    // UF_CRM_10_1717... -> ufCrm10_1717...
    const camel = code.toLowerCase().replace(/^uf_/, '').replace(/^crm_/, '');
    const guess = 'uf' + camel.replace(/^/, str => str);   // уже в lower
    window.__UF_KEYMAP[code] = guess;

    S.ufEnums[code] = S.ufEnums[code] || {};
    enums.forEach(e => {
      const id  = Number(pick(e,'ID','VALUE_ID'));
      const val = String(pick(e,'VALUE') || id);
      if (String(id) !== 'NaN') {
        putEnum(S.ufEnums, code, id, val);
      }
    });
  });
}

async function buildUsers(items) {
  const ids = Array.from(new Set(
    items.map(i => Number(i.assignedById)).filter(Boolean)
  ));
  if (!ids.length) return;

  const users = await listUsers(ids);
  Object.keys(users).forEach(idStr => {
    const id   = Number(idStr);
    const raw  = users[id];
    const name = shortUser(raw);
    S.users[id] = {
      name,
      path: '/company/personal/user/'+id+'/'
    };
  });
}

async function buildStages(items) {
  const cats = Array.from(new Set(
    items.map(i => Number(i.categoryId)).filter(Boolean)
  ));
  if (!cats.length) return;

  const rows = await listCategoryStages(SMART_ENTITY_TYPE_ID, cats);

  rows.forEach(r => {
    // API может возвращать в нескольких формах
    const list = Array.isArray(r) ? r :
      (r?.stages || r?.STAGES || (r?.result?.stages || r?.result?.STAGES) || []);
    list.forEach(st => {
      const statusId   = String(pick(st,'statusId','STATUS_ID') || '');
      const name       = String(pick(st,'name','NAME') || statusId);
      const sort       = Number(pick(st,'sort','SORT') || 0);
      const categoryId = Number(pick(st,'categoryId','CATEGORY_ID') || 0);
      const fullId     = String(pick(st,'id','ID') ||
        (categoryId ? `DT${SMART_ENTITY_TYPE_ID}_${categoryId}:${statusId}` : statusId)
      );

      const obj = { id: fullId, name, sort, categoryId, statusId };
      S.stagesByFull[fullId] = obj;
      S.stagesByCatStatus[categoryId+':'+statusId] = obj;

      if (!S.catStages[categoryId]) S.catStages[categoryId] = [];
      S.catStages[categoryId].push({ id: fullId, name, sort, statusId });
    });
  });

  Object.keys(S.catStages).forEach(cid => {
    S.catStages[cid].sort((a,b) => a.sort - b.sort);
    const max = S.catStages[cid].length
      ? Math.max(...S.catStages[cid].map(s => s.sort))
      : 100;
    S.cats[cid] = { maxSort: max || 100 };
  });
}

function getStageObject(item) {
  const sid = item.stageId;
  const { categoryId, statusId } = parseStage(sid);
  return S.stagesByFull[sid] ||
         S.stagesByCatStatus[(categoryId+':'+statusId)] ||
         { id: sid, name: sid, sort: 0, categoryId };
}

/* ----------------------- загрузка ------------------------- */

async function load() {
  if (!S.dealId) {
    ui.rows.innerHTML = '<tr><td colspan="12" class="muted">Нет ID сделки</td></tr>';
    return;
  }

  // 1) связанные элементы
  const ids = await getLinkedItemIds(S.dealId, DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID);
  S.ids = ids;

  if (!ids.length) {
    ui.rows.innerHTML = '<tr><td colspan="12" class="muted">Пока нет связанных элементов</td></tr>';
    fit(); return;
  }

  // 2) сами элементы
  const select = [
    'id', 'title', 'stageId', 'categoryId', 'assignedById',
    F.dealIdSource, F.licenseKey, F.portalUrl,
    F.tariff, F.tariffEnd, F.marketEnd, F.product
  ];
  const items = await getItemsByIds(SMART_ENTITY_TYPE_ID, ids, select);
  S.items = items || [];

  if (!S.items.length) {
    ui.rows.innerHTML = '<tr><td colspan="12" class="muted">Пока нет связанных элементов</td></tr>';
    fit(); return;
  }

  await buildUFEnums();
  await buildUsers(S.items);
  await buildStages(S.items);
  render();
  fit();
}

/* ---------------- фильтры/сортировка/страницы ------------- */

function filteredAndSorted() {
  const f = S.filter;

  const arr = S.items.filter(it => {
    const title = String(it.title || '').toLowerCase();
    const uid   = Number(it.assignedById) || null;
    const ass   = uid && S.users[uid] ? S.users[uid].name.toLowerCase() : '';

    const stage = getStageObject(it).name.toLowerCase();

    const deal  = String(UF(it, F.dealIdSource) || '').toLowerCase();
    const key   = String(UF(it, F.licenseKey)  || '').toLowerCase();
    const url   = String(UF(it, F.portalUrl)   || '').toLowerCase();

    const tariff  = String(enumText(S.ufEnums, F.tariff, UF(it, F.tariff))   || '').toLowerCase();
    const product = String(enumText(S.ufEnums, F.product, UF(it, F.product)) || '').toLowerCase();

    return (!f.title  || title.includes(f.title)) &&
           (!f.ass    || ass.includes(f.ass)) &&
           (!f.stage  || stage.includes(f.stage)) &&
           (!f.deal   || deal.includes(f.deal)) &&
           (!f.key    || key.includes(f.key)) &&
           (!f.url    || url.includes(f.url)) &&
           (!f.tariff || tariff.includes(f.tariff)) &&
           (!f.product|| product.includes(f.product));
  });

  const dir = S.view.sortDir === 'asc' ? 1 : -1;
  const key = S.view.sortKey;

  arr.sort((x,y) => {
    const get = (k) => {
      if (k === 'id')    return (Number(x.id)||0) - (Number(y.id)||0);
      if (k === 'title') return String(x.title||'').localeCompare(String(y.title||''), 'ru', {sensitivity:'base'});
      if (k === 'ass')   {
        const ax = S.users[Number(x.assignedById)]?.name || '';
        const ay = S.users[Number(y.assignedById)]?.name || '';
        return ax.localeCompare(ay, 'ru', {sensitivity:'base'});
      }
      if (k === 'stage') return (getStageObject(x).sort||0) - (getStageObject(y).sort||0);

      if (k === 'dealid')   return String(UF(x,F.dealIdSource)||'').localeCompare(String(UF(y,F.dealIdSource)||''),'ru',{numeric:true});
      if (k === 'key')      return String(UF(x,F.licenseKey)||'').localeCompare(String(UF(y,F.licenseKey)||''),'ru',{sensitivity:'base'});
      if (k === 'url')      return String(UF(x,F.portalUrl)||'').localeCompare(String(UF(y,F.portalUrl)||''),'ru',{sensitivity:'base'});
      if (k === 'tariff')   return String(enumText(S.ufEnums,F.tariff, UF(x,F.tariff))||'').localeCompare(String(enumText(S.ufEnums,F.tariff, UF(y,F.tariff))||''),'ru',{sensitivity:'base'});
      if (k === 'product')  return String(enumText(S.ufEnums,F.product,UF(x,F.product))||'').localeCompare(String(enumText(S.ufEnums,F.product,UF(y,F.product))||''),'ru',{sensitivity:'base'});
      if (k === 'tEnd')     return String(UF(x,F.tariffEnd)||'').localeCompare(String(UF(y,F.tariffEnd)||''),'ru',{numeric:true});
      if (k === 'mEnd')     return String(UF(x,F.marketEnd)||'').localeCompare(String(UF(y,F.marketEnd)||''),'ru',{numeric:true});
      return 0;
    };
    const v = get(key);
    return v === 0 ? (((Number(x.id)||0) - (Number(y.id)||0)) * dir) : v * dir;
  });

  if (dir < 0) arr.reverse();
  return arr;
}

/* -------------------------- render ------------------------ */

function render() {
  // видимость колонок и ширина — на th/td с data-col
  document.querySelectorAll('[data-col]').forEach(th => {
    const key = th.getAttribute('data-col');
    th.style.display = S.cols.includes(key) ? '' : 'none';
    const w = S.widths[key];
    if (w) th.style.width = w;
  });
  ui.filtersRow?.querySelectorAll('[data-col]').forEach(td => {
    const key = td.getAttribute('data-col');
    td.style.display = S.cols.includes(key) ? '' : 'none';
  });

  const full = filteredAndSorted();
  const total = full.length;

  const pages = Math.max(1, Math.ceil(total / S.view.size));
  if (S.view.page > pages) S.view.page = pages;

  const start = (S.view.page - 1) * S.view.size;
  const slice = full.slice(start, start + S.view.size);

  ui.pgInfo && (ui.pgInfo.textContent = `${S.view.page}/${pages}`);
  ui.pgPrev && (ui.pgPrev.disabled = (S.view.page <= 1));
  ui.pgNext && (ui.pgNext.disabled = (S.view.page >= pages));

  if (!slice.length) {
    ui.rows.innerHTML = '<tr><td colspan="12" class="muted">Ничего не найдено</td></tr>';
    fit(); return;
  }

  ui.rows.innerHTML = '';
  slice.forEach(it => {
    const id = it.id;
    const title = it.title || ('#'+id);

    const uid = Number(it.assignedById) || null;
    const u = uid ? S.users[uid] : null;
    const assHtml = u
      ? `<a href="#" onclick="BX24.openPath('${u.path}');return false;">${u.name}</a>`
      : (uid ? ('ID '+uid) : '—');

    const st = getStageObject(it);
    const cid = Number(it.categoryId) || st.categoryId || 0;
    const max = S.cats[cid]?.maxSort || 100;
    const pct = Math.max(0, Math.min(100, Math.round(((st.sort||0)/max)*100)));
    const list = S.catStages[cid] || [];
    const opts = list.map(s => `<option value="${s.id}" ${s.id===st.id?'selected':''}>${s.name}</option>`).join('');

    const deal = UF(it, F.dealIdSource)   ?? '—';
    const key  = UF(it, F.licenseKey)     ?? '—';
    const urlR = UF(it, F.portalUrl)      ?? '';
    const url  = urlR ? `<a href="${urlR}" target="_blank" rel="noopener">${urlR}</a>` : '—';

    const tariff = enumText(S.ufEnums, F.tariff,  UF(it, F.tariff));
    const tEnd   = fmtDate(UF(it, F.tariffEnd));
    const mEnd   = fmtDate(UF(it, F.marketEnd));
    const product= enumText(S.ufEnums, F.product, UF(it, F.product));

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-col="id">${id}</td>
      <td class="wrap-title" data-col="title">
        <a href="#" onclick="BX24.openPath('/crm/type/${SMART_ENTITY_TYPE_ID}/details/${id}/');return false;">${title}</a>
      </td>
      <td data-col="ass">${assHtml}</td>
      <td data-col="stage">
        <div class="stage">
          <div class="bar"><i style="width:${pct}%"></i></div>
          <span>${st.name}</span>
          <select class="stageSel" data-item="${id}" data-cur="${st.id}">${opts}</select>
        </div>
      </td>
      <td data-col="deal">${deal}</td>
      <td data-col="key">${key}</td>
      <td data-col="url" class="wrap-title">${url}</td>
      <td data-col="tariff">${tariff}</td>
      <td data-col="tEnd">${tEnd}</td>
      <td data-col="mEnd">${mEnd}</td>
      <td data-col="product">${product}</td>
      <td data-col="act">
        <button class="btn" data-open="${id}">Открыть</button>
      </td>
    `;

    // применяем видимость к строке
    tr.querySelectorAll('[data-col]').forEach(td => {
      const key = td.getAttribute('data-col');
      td.style.display = S.cols.includes(key) ? '' : 'none';
    });

    ui.rows.appendChild(tr);
  });

  // события в строках
  ui.rows.querySelectorAll('[data-open]').forEach(n => n.onclick = () => {
    const id = n.getAttribute('data-open');
    BX24.openPath(`/crm/type/${SMART_ENTITY_TYPE_ID}/details/${id}/`);
  });

  ui.rows.querySelectorAll('.stageSel').forEach(sel => {
    sel.onchange = async () => {
      const newStageId = sel.value;
      const itemId = Number(sel.getAttribute('data-item'));
      const ok = await updateItemStage(SMART_ENTITY_TYPE_ID, itemId, newStageId);
      if (!ok) {
        alert('Ошибка смены стадии');
        sel.value = sel.getAttribute('data-cur');
        return;
      }
      const it = S.items.find(i => i.id === itemId);
      if (it) it.stageId = newStageId;
      render();
      fit();
    };
  });

  fit();
}

/* ------------------- сортировка по заголовку --------------- */

ui.head?.addEventListener('click', e => {
  const th = e.target.closest('th[data-col]');
  if (!th || e.target.classList.contains('resizer')) return;

  const map = { deal:'dealid', key:'key', url:'url', tariff:'tariff', tEnd:'tEnd', mEnd:'mEnd', product:'product' };
  const key = th.getAttribute('data-col');
  const sortKey = ({ id:'id', title:'title', ass:'ass', stage:'stage', act:'id' })[key] || map[key] || 'id';

  if (S.view.sortKey === sortKey) {
    S.view.sortDir = (S.view.sortDir === 'asc' ? 'desc' : 'asc');
  } else {
    S.view.sortKey = sortKey;
    S.view.sortDir = 'asc';
  }
  render(); fit();
});

/* -------------------- обработчики верхней панели ----------- */

// Пагинация («Показывать по»)
ui.pageSize && (ui.pageSize.onchange = () => {
  S.view.size = Number(ui.pageSize.value) || 10;
  S.view.page = 1;
  render(); fit();
});

ui.pgPrev && (ui.pgPrev.onclick = () => {
  if (S.view.page > 1) { S.view.page--; render(); fit(); }
});

ui.pgNext && (ui.pgNext.onclick = () => {
  const pages = Math.max(1, Math.ceil(filteredAndSorted().length / S.view.size));
  if (S.view.page < pages) { S.view.page++; render(); fit(); }
});

ui.btnRefresh && (ui.btnRefresh.onclick = () => load());
ui.btnCreate  && (ui.btnCreate.onclick  = () => BX24.openPath(`/crm/type/${SMART_ENTITY_TYPE_ID}/details/0/`));
// ui.btnPick / ui.btnCols — если используешь — подключи свою реализацию модалок

// фильтры
[ui.fTitle, ui.fAss, ui.fStage, ui.fDeal, ui.fKey, ui.fUrl, ui.fTariff, ui.fProduct]
  .filter(Boolean)
  .forEach(inp => inp.addEventListener('input', () => {
    S.filter = {
      title : (ui.fTitle?.value  || '').toLowerCase(),
      ass   : (ui.fAss?.value    || '').toLowerCase(),
      stage : (ui.fStage?.value  || '').toLowerCase(),
      deal  : (ui.fDeal?.value   || '').toLowerCase(),
      key   : (ui.fKey?.value    || '').toLowerCase(),
      url   : (ui.fUrl?.value    || '').toLowerCase(),
      tariff: (ui.fTariff?.value || '').toLowerCase(),
      product:(ui.fProduct?.value|| '').toLowerCase()
    };
    S.view.page = 1;
    render(); fit();
  }));

/* --------------------- bootstrap (BX24.init) --------------- */

function detectDealId() {
  // 1) из PLACEMENT_OPTIONS
  try {
    const p = BX24.getParam('PLACEMENT_OPTIONS');
    const j = J(p || '{}');
    if (j && j.ID) return Number(j.ID);
  } catch(_) {}

  // 2) из query (?id=...)
  try {
    const url = new URL(location.href);
    const id  = url.searchParams.get('id');
    if (id) return Number(id);
  } catch(_) {}

  return null;
}

function onReady() {
  if (!window.BX24 || !BX24.getAuth) {
    // Если SDK ещё не готов — повторить
    setTimeout(onReady, 200);
    return;
  }

  BX24.init(() => {
    S.dealId = detectDealId();
    // дефолт «Показывать по»
    if (ui.pageSize) {
      S.view.size = Number(ui.pageSize.value) || 10;
    }
    load();
  });
}

// старт
onReady();
