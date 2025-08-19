// assets/app/main.js
// Работает c utils.js, api.js, config.js

// BX24 fallback: если открыто в iframe Bitrix24
if (typeof window.BX24 === 'undefined' && window.parent && window.parent.BX24) {
  window.BX24 = window.parent.BX24;
}

import {
  $, $$, A, J, pick, fmtDate,
  UF, enumText, putEnum, parseStage
} from './utils.js';

import {
  getLinkedItemIds,
  getItemsByIds,
  listUserFields,
  listUsers,
  listCategoryStages,
  updateItemStage
} from './api.js';

import { F, SMART_ENTITY_TYPE_ID } from './config.js';

/* -------------------------- State -------------------------- */

const S = {
  dealId: null,
  ids: [],
  items: [],
  users: {},
  ufEnums: {},
  stagesByFull: {},
  stagesByCatStatus: {},
  catStages: {},
  cats: {},

  view: { page: 1, size: 10, sortKey: 'id', sortDir: 'asc' },
  filter: { title:'', ass:'', stage:'', deal:'', key:'', url:'', tariff:'', product:'' },

  cols: JSON.parse(localStorage.getItem('cols_v1') || 'null')
     || ['id','title','ass','stage','deal','key','url','tariff','tEnd','mEnd','product','act'],
  widths: JSON.parse(localStorage.getItem('widths_v1') || '{}')
};

window.__UF_KEYMAP = window.__UF_KEYMAP || {};

/* -------------------------- UI refs ------------------------ */

const ui = {
  rows: $('#rows'),
  head: document.querySelector('tr.head'),
  filtersRow: document.querySelector('tr.filters'),

  btnRefresh: $('#btnRefresh'),
  btnCreate : $('#btnCreate'),
  btnPick   : $('#btnPick'),
  btnCols   : $('#btnCols'),

  pageSize: $('#pageSize'),
  pgPrev  : $('#pgPrev'),
  pgNext  : $('#pgNext'),
  pgInfo  : $('#pgInfo'),

  fTitle : $('#fTitle'),
  fAss   : $('#fAss'),
  fStage : $('#fStage'),
  fDeal  : $('#fDeal'),
  fKey   : $('#fKey'),
  fUrl   : $('#fUrl'),
  fTariff: $('#fTariff'),
  fProduct: $('#fProduct'),

  colModal: $('#colModal'),
  colList : $('#colList'),
  colCancel: $('#colCancel'),
  colApply : $('#colApply')
};

/* --------------------- Fit / helpers ----------------------- */

const fit = (() => {
  let raf;
  return () => {
    if (!window.BX24) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) + 12;
      try { BX24.resizeWindow(h); } catch {}
    });
  };
})();
new ResizeObserver(() => fit()).observe(document.body);

function shortUser(raw) {
  const ln = pick(raw,'LAST_NAME') || '';
  const fn = pick(raw,'NAME') || '';
  return [ln, fn].filter(Boolean).join(' ') || (pick(raw,'LOGIN') || '');
}

function showDiag(msg, extra) {
  console.error('[Widget]', msg, extra || '');
  if (!ui.rows) return;
  ui.rows.innerHTML = `<tr><td colspan="12" class="muted">${msg}</td></tr>`;
}

/* -------------------- UF / Users / Stages ------------------ */

async function buildUFEnums() {
  const list = await listUserFields(SMART_ENTITY_TYPE_ID);
  list.forEach(f => {
    const xml = pick(f, 'XML_ID', 'xmlId');            // UF_CRM_10_...
    const api = pick(f, 'FIELD_NAME', 'fieldName');    // ufCrm10_...
    if (xml && api) window.__UF_KEYMAP[xml] = api;

    const enums = pick(f, 'LIST', 'list') || [];
    if (!xml || !enums.length) return;
    S.ufEnums[xml] = S.ufEnums[xml] || {};
    enums.forEach(e => {
      const id  = Number(pick(e,'ID','VALUE_ID'));
      const val = String(pick(e,'VALUE') || id);
      if (!Number.isNaN(id)) putEnum(S.ufEnums, xml, id, val);
    });
  });
}

async function buildUsers(items) {
  const ids = Array.from(new Set(items.map(i => Number(i.assignedById)).filter(Boolean)));
  if (!ids.length) return;
  const users = await listUsers(ids);
  Object.keys(users).forEach(idStr => {
    const id = Number(idStr);
    const raw = users[id];
    S.users[id] = { name: shortUser(raw), path: '/company/personal/user/'+id+'/' };
  });
}

async function buildStages(items) {
  const cats = Array.from(new Set(items.map(i => Number(i.categoryId)).filter(Boolean)));
  if (!cats.length) return;

  const rows = await listCategoryStages(SMART_ENTITY_TYPE_ID, cats);

  rows.forEach(r => {
    const list = Array.isArray(r) ? r :
      (r?.stages || r?.STAGES || (r?.result?.stages || r?.result?.STAGES) || []);
    list.forEach(st => {
      const statusId   = String(pick(st,'statusId','STATUS_ID') || '');
      const name       = String(pick(st,'name','NAME') || statusId);
      const sort       = Number(pick(st,'sort','SORT') || 0);
      const categoryId = Number(pick(st,'categoryId','CATEGORY_ID') || 0);
      const fullId     = String(pick(st,'id','ID') ||
        (categoryId ? `DT${SMART_ENTITY_TYPE_ID}_${categoryId}:${statusId}` : statusId));
      const obj = { id: fullId, name, sort, categoryId, statusId };

      S.stagesByFull[fullId] = obj;
      S.stagesByCatStatus[categoryId+':'+statusId] = obj;

      if (!S.catStages[categoryId]) S.catStages[categoryId] = [];
      S.catStages[categoryId].push({ id: fullId, name, sort, statusId });
    });
  });

  // дедуп + сортировка
  Object.keys(S.catStages).forEach(cid => {
    const byId = {};
    S.catStages[cid].forEach(s => { byId[s.id] = byId[s.id] || s; });
    S.catStages[cid] = Object.values(byId).sort((a,b) => a.sort - b.sort);
    const max = S.catStages[cid].length ? Math.max(...S.catStages[cid].map(s => s.sort)) : 100;
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

/* ------------------------- Load ---------------------------- */

async function load() {
  try {
    if (!S.dealId) {
      showDiag('Нет ID сделки (PLACEMENT_OPTIONS или ?dealId=...)');
      return;
    }

    const ids = await getLinkedItemIds(S.dealId, null, SMART_ENTITY_TYPE_ID);
    S.ids = ids;

    if (!ids.length) {
      showDiag('В сделке нет связанных элементов');
      fit(); return;
    }

    const select = [
      'id', 'title', 'stageId', 'categoryId', 'assignedById',
      F.dealIdSource, F.licenseKey, F.portalUrl,
      F.tariff, F.tariffEnd, F.marketEnd, F.product
    ];
    const items = await getItemsByIds(SMART_ENTITY_TYPE_ID, ids, select);
    S.items = items || [];

    if (!S.items.length) {
      showDiag('Элементы не найдены по указанным ID');
      fit(); return;
    }

    await buildUFEnums();
    await buildUsers(S.items);
    await buildStages(S.items);
    render();
    fit();
  } catch (e) {
    showDiag('Ошибка загрузки: ' + (e?.message || e));
  }
}

/* --------------- Filter / Sort / Paging -------------------- */

function filteredAndSorted() {
  const f = S.filter;
  const arr = S.items.filter(it => {
    const title = String(it.title || '').toLowerCase();
    const uid   = Number(it.assignedById) || null;
    const ass   = uid && S.users[uid] ? S.users[uid].name.toLowerCase() : '';
    const stage = getStageObject(it).name.toLowerCase();

    const deal    = String(UF(it, F.dealIdSource) || '').toLowerCase();
    const key     = String(UF(it, F.licenseKey)  || '').toLowerCase();
    const url     = String(UF(it, F.portalUrl)   || '').toLowerCase();
    const tariff  = String(enumText(S.ufEnums, F.tariff,  UF(it, F.tariff))   || '').toLowerCase();
    const product = String(enumText(S.ufEnums, F.product, UF(it, F.product))  || '').toLowerCase();

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

/* -------------------------- Render ------------------------- */

function render() {
  document.querySelectorAll('[data-col]').forEach(th => {
    const key = th.getAttribute('data-col');
    th.style.display = S.cols.includes(key) ? '' : 'none';
    const w = S.widths[key]; if (w) th.style.width = w;
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

    const tariff  = enumText(S.ufEnums, F.tariff,  UF(it, F.tariff));
    const tEnd    = fmtDate(UF(it, F.tariffEnd));
    const mEnd    = fmtDate(UF(it, F.marketEnd));
    const product = enumText(S.ufEnums, F.product, UF(it, F.product));

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

    tr.querySelectorAll('[data-col]').forEach(td => {
      const key = td.getAttribute('data-col');
      td.style.display = S.cols.includes(key) ? '' : 'none';
    });

    ui.rows.appendChild(tr);
  });

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
      render(); fit();
    };
  });

  fit();
}

/* ---------------- Sort / Filters / Paging ------------------ */

ui.head?.addEventListener('click', e => {
  const th = e.target.closest('th[data-col]');
  if (!th || e.target.classList.contains('resizer')) return;
  const map = { deal:'dealid', key:'key', url:'url', tariff:'tariff', tEnd:'tEnd', mEnd:'mEnd', product:'product' };
  const key = th.getAttribute('data-col');
  const sortKey = ({ id:'id', title:'title', ass:'ass', stage:'stage', act:'id' })[key] || map[key] || 'id';
  if (S.view.sortKey === sortKey) S.view.sortDir = (S.view.sortDir === 'asc' ? 'desc' : 'asc');
  else { S.view.sortKey = sortKey; S.view.sortDir = 'asc'; }
  render(); fit();
});

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

;[ui.fTitle, ui.fAss, ui.fStage, ui.fDeal, ui.fKey, ui.fUrl, ui.fTariff, ui.fProduct]
  .filter(Boolean).forEach(inp => inp.addEventListener('input', () => {
    S.filter = {
      title  : (ui.fTitle?.value  || '').toLowerCase(),
      ass    : (ui.fAss?.value    || '').toLowerCase(),
      stage  : (ui.fStage?.value  || '').toLowerCase(),
      deal   : (ui.fDeal?.value   || '').toLowerCase(),
      key    : (ui.fKey?.value    || '').toLowerCase(),
      url    : (ui.fUrl?.value    || '').toLowerCase(),
      tariff : (ui.fTariff?.value || '').toLowerCase(),
      product: (ui.fProduct?.value|| '').toLowerCase()
    };
    S.view.page = 1; render(); fit();
  }));

/* ------------------------ Bootstrap ------------------------ */

function detectDealId() {
  try {
    const p = BX24.getParam('PLACEMENT_OPTIONS');
    const j = J(p || '{}');
    if (j && j.ID) return Number(j.ID);
  } catch {}
  try {
    const url = new URL(location.href);
    const qId = url.searchParams.get('dealId') || url.searchParams.get('id') || url.searchParams.get('ID');
    if (qId) return Number(qId);
  } catch {}
  return null;
}

function onReady() {
  // слушатели навешиваем сразу (чтобы кнопки живые даже до загрузки)
  if (ui.btnRefresh) ui.btnRefresh.onclick = () => load();
  if (ui.btnCreate)  ui.btnCreate.onclick  = () => BX24.openPath(`/crm/type/${SMART_ENTITY_TYPE_ID}/details/0/`);

  if (!window.BX24 || !BX24.getAuth) {
    // попробуем позже — когда SDK появится
    setTimeout(onReady, 200);
    return;
    }
  try {
    BX24.init(() => {
      S.dealId = detectDealId();
      if (ui.pageSize) S.view.size = Number(ui.pageSize.value) || 10;
      load();
    });
  } catch {
    S.dealId = detectDealId();
    if (ui.pageSize) S.view.size = Number(ui.pageSize.value) || 10;
    load();
  }
}

onReady();
