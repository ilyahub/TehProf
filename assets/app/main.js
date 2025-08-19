// assets/app/main.js
import { DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID, F } from './config.js';
import { $, A, J, pick, fmtDate, UF, bcode, toIdFromBinding, parseStage, toCamelUF } from './utils.js';

// ===== UI refs
const ui = {
  rows: $('#rows'),
  ref: $('#btnRefresh'),
  create: $('#btnCreate'),
  pick: $('#btnPick'),
  colsBtn: $('#btnCols'),

  pageSize: $('#pageSize'),
  pgPrev: $('#pgPrev'),
  pgNext: $('#pgNext'),
  pgInfo: $('#pgInfo'),

  fTitle: $('#fTitle'),
  fAss:   $('#fAss'),
  fStage: $('#fStage'),
  fDeal:  $('#fDeal'),
  fKey:   $('#fKey'),
  fUrl:   $('#fUrl'),
  fTariff:$('#fTariff'),
  fProduct:$('#fProduct'),

  head: document.querySelector('tr.head'),
  filters: document.querySelector('tr.filters'),

  colModal: $('#colModal'),
  colList:  $('#colList'),
  colCancel:$('#colCancel'),
  colApply: $('#colApply'),
};

const COL_LABEL = {
  id:'ID', title:'Название', ass:'Ответственный', stage:'Стадия',
  deal:'ID исходной сделки', key:'Лицензионный ключ', url:'Адрес портала',
  tariff:'Текущий тариф', tEnd:'Окончание тарифа', mEnd:'Окончание подписки',
  product:'Продукт', act:'Действия'
};

const COLS_ALL = ['id','title','ass','stage','deal','key','url','tariff','tEnd','mEnd','product','act'];

// ===== state
const S = {
  dealId: null,
  field: DEAL_FIELD_CODE,
  typeId: SMART_ENTITY_TYPE_ID,

  mode: 'ids',          // 'ids' | 'bindings'
  bindings: [],
  ids: [],

  items: [],
  users: {},            // { [userId]: { name, path } }

  ufEnums: {},          // { [UF_CODE]: { [ID]: 'VALUE' } }
  stagesByFull: {},     // { [fullId]: {id,name,sort,categoryId,statusId} }
  stagesByCatStatus:{}, // { 'catId:statusId': StageObj }
  catStages: {},        // { [catId]: Array<StageObj> }
  cats: {},             // { [catId]: {maxSort} }

  view: { page:1, size:10, sortKey:'id', sortDir:'asc' },
  filter: { title:'', ass:'', stage:'', deal:'', key:'', url:'', tariff:'', product:'' },

  cols: JSON.parse(localStorage.getItem('cols_v2')||'null') ||
        ['id','title','ass','stage','deal','key','url','tariff','tEnd','mEnd','product','act'],
  widths: JSON.parse(localStorage.getItem('widths_v2')||'{}'),
};

// ===== misc helpers
const enumText = (code, val) => {
  if (val === null || val === undefined || val === '') return '—';
  const dict = S.ufEnums[code] || {};
  return dict[val] || val;
};

// автоподгон высоты фрейма (резиновая высота контейнера)
const fit = (() => {
  let raf;
  return function() {
    if (!window.BX24) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) + 12;
      try { BX24.resizeWindow(h); } catch (e) {}
    });
  };
})();
new ResizeObserver(() => fit()).observe(document.body);

// ранний ID сделки из POST-BOOT (PLACEMENT_OPTIONS)
(function fromPost() {
  const boot = window.__BOOT__ || {};
  const pid = J(boot.placementOptions || '{}').ID || null;
  if (pid) S.dealId = Number(pid);
})();

// ====== BX24 init & start
BX24.init(function () {
  if (!S.dealId) {
    const p = BX24.getParam('PLACEMENT_OPTIONS');
    const pid = (J(p || '{}').ID) || null;
    if (pid) S.dealId = Number(pid);
  }
  let started = false;
  const start = () => {
    if (started || !S.dealId) return;
    started = true;
    load();
    fit();
  };
  BX24.placement.info(() => start());
  setTimeout(start, 300);
  setTimeout(start, 1500);
});

// режим хранения связей: список ID или строки DYNAMIC_...
function detectMode(raw) {
  const a = A(raw);
  return a.some(v => typeof v === 'string' && v.startsWith('DYNAMIC_')) ? 'bindings' : 'ids';
}

// ===== ЗАГРУЗКА
function load() {
  if (!S.dealId) {
    ui.rows.innerHTML = '<tr><td colspan="12" class="err">Нет ID сделки</td></tr>';
    return;
  }
  BX24.callMethod('crm.deal.get', { id: S.dealId }, r => {
    if (r.error()) {
      ui.rows.innerHTML = `<tr><td colspan="12" class="err">${r.error_description()}</td></tr>`;
      return;
    }
    const raw = r.data()[S.field];
    S.mode = detectMode(raw);
    S.bindings = A(raw);

    S.ids = (S.mode === 'bindings')
      ? S.bindings.map(c => toIdFromBinding(c, S.typeId)).filter(Boolean)
      : A(raw).map(Number).filter(Boolean);

    if (!S.ids.length) {
      ui.rows.innerHTML = '<tr><td colspan="12" class="muted">Пока нет связанных элементов</td></tr>';
      fit();
      return;
    }

    // ВАЖНО: для UF-полей добавляем camelCase имена
    const UF_CODES = [F.dealIdSource, F.licenseKey, F.portalUrl, F.tariff, F.tariffEnd, F.marketEnd, F.product];
    const select = [
      'id','title','stageId','categoryId','assignedById',
      ...UF_CODES.map(toCamelUF),
      ...UF_CODES, // можно и верхние оставить — не мешают
    ];

    BX24.callMethod('crm.item.list', {
      entityTypeId: S.typeId,
      filter: { '@id': S.ids },
      select
    }, async rr => {
      let items = [];
      if (!rr.error()) {
        items = rr.data().items || [];
      } else {
        // фолбэк на старых порталах
        const calls = {};
        S.ids.forEach((id,i) => calls['g'+i] = ['crm.item.get', { entityTypeId: S.typeId, id }]);
        BX24.callBatch(calls, res => {
          for (const k in res) if (!res[k].error()) items.push(res[k].data().item);
          proceed(items);
        }, true);
        return;
      }
      proceed(items);

      async function proceed(items) {
        S.items = items;
        await buildUFEnums();    // словари списков
        await buildUsers(items); // ответственные
        await buildStages(items);// стадии + фолбэк
        render();
        fit();
      }
    });
  });
}

// ==== словари UF списков (Тариф, Продукт) — надёжно
async function buildUFEnums() {
  // 1) Пытаемся через userfield.list
  await new Promise(res => {
    BX24.callMethod('crm.item.userfield.list', { entityTypeId: S.typeId }, rr => {
      if (!rr.error()) {
        const list = rr.data().userFields || rr.data() || [];
        list.forEach(f => {
          const code  = pick(f, 'FIELD_NAME', 'fieldName'); // верхний UF_CRM_...
          const enums = pick(f, 'LIST', 'list') || [];
          if (code && Array.isArray(enums) && enums.length) {
            S.ufEnums[code] = S.ufEnums[code] || {};
            enums.forEach(e => {
              const id  = Number(pick(e, 'ID', 'VALUE_ID'));
              const val = String(pick(e, 'VALUE') || id);
              if (id) S.ufEnums[code][id] = val;
            });
          }
        });
      }
      res();
    });
  });

  // 2) Добираем из crm.item.fields (fallback + доп.страховка)
  await new Promise(res => {
    BX24.callMethod('crm.item.fields', { entityTypeId: S.typeId }, rr => {
      if (!rr.error()) {
        const fields = rr.data() || {};
        [F.tariff, F.product].forEach(code => {
          const f = fields[ toCamelUF(code) ] || fields[ code ] || {};
          const items = f.items || f.ITEMS || [];
          if (Array.isArray(items) && items.length) {
            S.ufEnums[code] = S.ufEnums[code] || {};
            items.forEach(e => {
              const id  = Number(pick(e,'ID'));
              const val = String(pick(e,'VALUE') || id);
              if (id) S.ufEnums[code][id] = val;
            });
          }
        });
      }
      res();
    });
  });
}

// ==== Имена ответственных
async function buildUsers(items) {
  const ids = Array.from(new Set(items.map(i => Number(i.assignedById)).filter(Boolean)));
  if (!ids.length) return;
  const calls = {};
  ids.forEach((uid,i) => calls['u'+i] = ['user.get', { ID: String(uid) }]);
  await new Promise(res => BX24.callBatch(calls, r => {
    for (const k in r) {
      if (!r[k].error()) {
        const raw = (r[k].data() || [])[0] || {};
        const id  = Number(pick(raw,'ID'));
        if (!id) continue;
        const name = [pick(raw,'LAST_NAME'), pick(raw,'NAME'), pick(raw,'SECOND_NAME')].filter(Boolean).join(' ')
                  || pick(raw,'LOGIN') || ('ID '+id);
        S.users[id] = { name, path: `/company/personal/user/${id}/` };
      }
    }
    res();
  }, true));
}

// ==== Стадии СПА (основной способ + фолбэк)
async function buildStages(items) {
  const cats = Array.from(new Set(items.map(i => Number(i.categoryId)).filter(Boolean)));
  let anyOk = false;

  if (cats.length) {
    const calls = {};
    cats.forEach((cid,i) => calls['s'+i] = ['crm.category.stage.list', { entityTypeId: S.typeId, categoryId: cid }]);
    await new Promise(res => BX24.callBatch(calls, r => {
      for (const k in r) {
        if (!r[k].error()) {
          anyOk = true;
          let data = r[k].data();
          let list = Array.isArray(data) ? data : (data?.stages || data?.STAGES) || [];
          if (!Array.isArray(list) && data?.result) list = data.result.stages || data.result.STAGES || [];
          const cidFromList = Number(list[0]?.categoryId || list[0]?.CATEGORY_ID || cats[0] || 0);
          list.forEach(st => {
            const statusId   = String(pick(st,'statusId','STATUS_ID') || '');
            const name       = String(pick(st,'name','NAME') || statusId);
            const sort       = Number(pick(st,'sort','SORT') || 0);
            const categoryId = Number(pick(st,'categoryId','CATEGORY_ID') || cidFromList);
            const fullId     = String(pick(st,'id','ID') || (categoryId ? `DT${S.typeId}_${categoryId}:${statusId}` : statusId));
            const obj = { id: fullId, name, sort, categoryId, statusId };
            S.stagesByFull[fullId] = obj;
            S.stagesByCatStatus[categoryId+':'+statusId] = obj;
            if (!S.catStages[categoryId]) S.catStages[categoryId] = [];
            S.catStages[categoryId].push({ id: fullId, name, sort, statusId });
          });
        }
      }
      Object.keys(S.catStages).forEach(cid => {
        S.catStages[cid].sort((a,b) => a.sort - b.sort);
        const max = S.catStages[cid].length ? Math.max(...S.catStages[cid].map(s => s.sort)) : 100;
        S.cats[cid] = { maxSort: max || 100 };
      });
      res();
    }, true));
  }

  // Фолбэк: старые порталы — через crm.status.list
  if (!anyOk || !Object.keys(S.stagesByFull).length) {
    const first = items[0] || {};
    let cid = Number(first.categoryId) || 0;
    if (!cid && first.stageId) cid = parseStage(first.stageId).categoryId || 0;
    if (!cid) return;
    const ENTITY_ID = `DYNAMIC_${S.typeId}_STAGE_${cid}`;
    await new Promise(res => {
      BX24.callMethod('crm.status.list', { filter: { ENTITY_ID } }, rr => {
        if (!rr.error()) {
          const list = rr.data() || [];
          list.forEach(st => {
            const statusId = String(pick(st,'STATUS_ID','statusId') || '');
            const name     = String(pick(st,'NAME','name') || statusId);
            const sort     = Number(pick(st,'SORT','sort') || 0);
            const fullId   = `DT${S.typeId}_${cid}:${statusId}`;
            const obj = { id: fullId, name, sort, categoryId: cid, statusId };
            S.stagesByFull[fullId] = obj;
            S.stagesByCatStatus[cid+':'+statusId] = obj;
            if (!S.catStages[cid]) S.catStages[cid] = [];
            S.catStages[cid].push({ id: fullId, name, sort, statusId });
          });
          S.catStages[cid].sort((a,b) => a.sort - b.sort);
          const max = S.catStages[cid].length ? Math.max(...S.catStages[cid].map(s => s.sort)) : 100;
          S.cats[cid] = { maxSort: max || 100 };
        }
        res();
      });
    });
  }
}

function getStageObject(item) {
  const sid = item.stageId;
  const { categoryId, statusId } = parseStage(sid);
  return S.stagesByFull[sid] || S.stagesByCatStatus[(categoryId+':'+statusId)] || { id: sid, name: sid, sort: 0, categoryId };
}

function stageUi(item) {
  const st = getStageObject(item);
  const cid = Number(item.categoryId) || st.categoryId || 0;
  const max = S.cats[cid]?.maxSort || 100;
  const pct = Math.max(0, Math.min(100, Math.round(((st.sort || 0) / max) * 100)));
  const list = S.catStages[cid] || [];
  const opts = list.map(s => `<option value="${s.id}" ${s.id === st.id ? 'selected' : ''}>${s.name}</option>`).join('');
  return `<div class="stage"><div class="bar"><i style="width:${pct}%"></i></div><span>${st.name}</span><select class="stageSel" data-item="${item.id}" data-cur="${st.id}">${opts}</select></div>`;
}

// ===== фильтрация/сортировка/пагинация
function filteredAndSorted() {
  const f = S.filter;
  let arr = S.items.filter(it => {
    const title = String(it.title || '').toLowerCase();
    const uid   = Number(it.assignedById) || null;
    const ass   = uid && S.users[uid] ? S.users[uid].name.toLowerCase() : '';
    const st    = getStageObject(it).name.toLowerCase();

    const deal   = String(UF(it, F.dealIdSource) || '').toLowerCase();
    const key    = String(UF(it, F.licenseKey)   || '').toLowerCase();
    const url    = String(UF(it, F.portalUrl)    || '').toLowerCase();
    const tariff = String(enumText(F.tariff, UF(it, F.tariff)) || '').toLowerCase();
    const prod   = String(enumText(F.product, UF(it, F.product)) || '').toLowerCase();

    return (!f.title || title.includes(f.title))
        && (!f.ass   || ass.includes(f.ass))
        && (!f.stage || st.includes(f.stage))
        && (!f.deal  || deal.includes(f.deal))
        && (!f.key   || key.includes(f.key))
        && (!f.url   || url.includes(f.url))
        && (!f.tariff|| tariff.includes(f.tariff))
        && (!f.product|| prod.includes(f.product));
  });

  const dir = S.view.sortDir === 'asc' ? 1 : -1;
  const key = S.view.sortKey;

  arr.sort((x,y) => {
    const get = (k) => {
      if (k === 'id')     return (Number(x.id)||0) - (Number(y.id)||0);
      if (k === 'title')  return String(x.title||'').localeCompare(String(y.title||''), 'ru', { sensitivity:'base' });
      if (k === 'ass') {
        const ax = S.users[Number(x.assignedById)]?.name || '';
        const ay = S.users[Number(y.assignedById)]?.name || '';
        return ax.localeCompare(ay, 'ru', { sensitivity: 'base' });
      }
      if (k === 'stage')  return (getStageObject(x).sort || 0) - (getStageObject(y).sort || 0);
      if (k === 'dealid') return String(UF(x, F.dealIdSource) || '').localeCompare(String(UF(y, F.dealIdSource) || ''), 'ru', { numeric:true });
      if (k === 'key')    return String(UF(x, F.licenseKey)   || '').localeCompare(String(UF(y, F.licenseKey)   || ''), 'ru', { sensitivity:'base' });
      if (k === 'url')    return String(UF(x, F.portalUrl)    || '').localeCompare(String(UF(y, F.portalUrl)    || ''), 'ru', { sensitivity:'base' });
      if (k === 'tariff') return String(enumText(F.tariff, UF(x, F.tariff)) || '').localeCompare(String(enumText(F.tariff, UF(y, F.tariff)) || ''), 'ru', { sensitivity:'base' });
      if (k === 'tEnd')   return String(UF(x, F.tariffEnd) || '').localeCompare(String(UF(y, F.tariffEnd) || ''), 'ru', { numeric:true });
      if (k === 'mEnd')   return String(UF(x, F.marketEnd) || '').localeCompare(String(UF(y, F.marketEnd) || ''), 'ru', { numeric:true });
      if (k === 'product')return String(enumText(F.product, UF(x, F.product)) || '').localeCompare(String(enumText(F.product, UF(y, F.product)) || ''), 'ru', { sensitivity:'base' });
      return 0;
    };
    const v = get(key);
    return v === 0 ? ((Number(x.id)||0) - (Number(y.id)||0)) * dir : v * dir;
  });

  if (dir < 0) arr.reverse();
  return arr;
}

// ====== РЕНДЕР
function render() {
  // применяем видимость столбцов (шапка + фильтры)
  document.querySelectorAll('[data-col]').forEach(th => {
    const key = th.getAttribute('data-col');
    th.style.display = S.cols.includes(key) ? '' : 'none';
    const w = S.widths[key]; if (w) th.style.width = w;
  });
  ui.filters.querySelectorAll('[data-col]').forEach(td => {
    const key = td.getAttribute('data-col');
    td.style.display = S.cols.includes(key) ? '' : 'none';
  });

  const full  = filteredAndSorted();
  const total = full.length;
  const pages = Math.max(1, Math.ceil(total / S.view.size));
  if (S.view.page > pages) S.view.page = pages;
  const start = (S.view.page - 1) * S.view.size;
  const slice = full.slice(start, start + S.view.size);

  ui.pgInfo.textContent = `${S.view.page}/${pages}`;
  ui.pgPrev.disabled = (S.view.page <= 1);
  ui.pgNext.disabled = (S.view.page >= pages);

  if (!slice.length) {
    ui.rows.innerHTML = '<tr><td colspan="12" class="muted">Ничего не найдено</td></tr>';
    return;
  }

  ui.rows.innerHTML = '';
  slice.forEach(it => {
    const id = it.id;
    const title = it.title || ('#' + id);
    const uid = Number(it.assignedById) || null;
    const u = uid ? S.users[uid] : null;
    const assHtml = u ? `<a href="#" onclick="BX24.openPath('/company/personal/user/${uid}/');return false;">${u.name}</a>` : (uid ? ('ID '+uid) : '—');

    const stage = stageUi(it);
    const deal  = UF(it, F.dealIdSource) ?? '—';
    const key   = UF(it, F.licenseKey)   ?? '—';
    const urlR  = UF(it, F.portalUrl)    ?? '';
    const url   = urlR ? `<a href="${urlR}" target="_blank" rel="noopener">${urlR}</a>` : '—';
    const tariff= enumText(F.tariff,  UF(it, F.tariff));
    const tEnd  = fmtDate(UF(it, F.tariffEnd));
    const mEnd  = fmtDate(UF(it, F.marketEnd));
    const prod  = enumText(F.product, UF(it, F.product));

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
      <td data-col="product">${prod}</td>
      <td data-col="act">
        <button class="btn" data-open="${id}">Открыть</button>
        <button class="btn" data-del="${id}">Удалить</button>
      </td>
    `;
    // видимость столбцов на строке
    tr.querySelectorAll('[data-col]').forEach(td => {
      const key = td.getAttribute('data-col');
      td.style.display = S.cols.includes(key) ? '' : 'none';
    });
    ui.rows.appendChild(tr);
  });

  // события на действия
  ui.rows.querySelectorAll('[data-open]').forEach(n => n.onclick = () => BX24.openPath(`/crm/type/${SMART_ENTITY_TYPE_ID}/details/${n.getAttribute('data-open')}/`));
  ui.rows.querySelectorAll('.stageSel').forEach(sel => {
    sel.onchange = () => {
      const newStageId = sel.value, itemId = Number(sel.getAttribute('data-item'));
      BX24.callMethod('crm.item.update', { entityTypeId: S.typeId, id: itemId, fields: { stageId: newStageId } }, r => {
        if (r.error()) { alert('Ошибка смены стадии: ' + r.error_description()); sel.value = sel.getAttribute('data-cur'); return; }
        const it = S.items.find(i => i.id === itemId);
        if (it) it.stageId = newStageId;
        render();
      });
    };
  });
  ui.rows.querySelectorAll('[data-del]').forEach(b => b.onclick = () => detach(Number(b.getAttribute('data-del'))));
}

// ===== сохранение связей в сделке
function save(next) {
  const f = {}; f[S.field] = next;
  BX24.callMethod('crm.deal.update', { id: S.dealId, fields: f }, r => {
    if (r.error()) { alert('Ошибка: ' + r.error_description()); }
    load();
  });
}
function attach(ids) {
  if (S.mode === 'bindings') {
    const add = ids.map(id => bcode(S.typeId, id));
    save(Array.from(new Set([...(S.bindings || []), ...add])));
  } else {
    save(Array.from(new Set([...(A(S.bindings).map(Number)), ...ids])));
  }
}
function detach(id) {
  if (S.mode === 'bindings') {
    const code = bcode(S.typeId, id);
    save((S.bindings || []).filter(c => c !== code));
  } else {
    save(A(S.bindings).map(Number).filter(v => v !== id));
  }
}

// ===== перетаскивание ширины колонок
function enableResizers() {
  document.querySelectorAll('th .resizer').forEach(handle => {
    const th  = handle.parentElement;
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
        localStorage.setItem('widths_v2', JSON.stringify(S.widths));
      };
    };
  });
}

// ===== Модал «Колонки»
function openCols() {
  ui.colList.innerHTML = '';
  COLS_ALL.forEach(k => {
    const id = 'col_' + k;
    const row = document.createElement('label');
    row.innerHTML = `<input type="checkbox" id="${id}" ${S.cols.includes(k) ? 'checked' : ''}> ${COL_LABEL[k] || k}`;
    ui.colList.appendChild(row);
  });
  ui.colModal.style.display = 'flex';
}
function closeCols() { ui.colModal.style.display = 'none'; }

// ===== Пикер выбора элементов
const PK = { page:0, pageSize:50, query:'', total:0, selected:new Set(), loading:false };
function openPicker() {
  const modal = document.createElement('div');
  modal.className = 'modal'; modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="card" style="width:min(920px,95vw)">
      <div class="card-h">Выбор элементов</div>
      <div class="card-b" style="display:flex;gap:8px">
        <input id="q" style="flex:1;border:1px solid var(--line);border-radius:10px;padding:10px 12px" placeholder="Поиск по названию…">
        <button class="btn" id="btnSearch">Найти</button>
        <button class="btn" id="btnReset">Сброс</button>
        <span class="muted" style="margin-left:auto" id="pgInfoPick"></span>
      </div>
      <div class="card-b" style="height:60vh;overflow:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="border-bottom:1px solid var(--line);padding:10px 12px;width:48px"><input type="checkbox" id="pickAll"></th>
            <th style="border-bottom:1px solid var(--line);padding:10px 12px;width:80px">ID</th>
            <th style="border-bottom:1px solid var(--line);padding:10px 12px">Название</th>
          </tr></thead>
          <tbody id="pickRows"><tr><td colspan="3" class="muted" style="padding:10px 12px">Загрузка…</td></tr></tbody>
        </table>
      </div>
      <div class="card-f">
        <button class="btn" id="btnMore">Загрузить ещё</button>
        <button class="btn" id="btnClose">Отмена</button>
        <button class="btn primary" id="btnAttach">Добавить выбранные</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const q = modal.querySelector('#q');
  const pickRows = modal.querySelector('#pickRows');
  const pickAll  = modal.querySelector('#pickAll');
  const btnSearch= modal.querySelector('#btnSearch');
  const btnReset = modal.querySelector('#btnReset');
  const btnMore  = modal.querySelector('#btnMore');
  const btnClose = modal.querySelector('#btnClose');
  const btnAttach= modal.querySelector('#btnAttach');
  const info     = modal.querySelector('#pgInfoPick');

  function loadPage(reset=false) {
    if (PK.loading) return; PK.loading = true;
    if (reset) { PK.page=0; PK.total=0; pickRows.innerHTML = '<tr><td colspan="3" class="muted" style="padding:10px 12px">Загрузка…</td></tr>'; }
    const start = PK.page * PK.pageSize;
    const filter = PK.query ? { '%title': PK.query } : {};
    BX24.callMethod('crm.item.list', {
      entityTypeId: S.typeId, filter, order: { 'id': 'DESC' }, select: ['id','title'], start
    }, r => {
      PK.loading = false;
      if (r.error()) { pickRows.innerHTML = `<tr><td colspan="3" class="err" style="padding:10px 12px">${r.error_description()}</td></tr>`; return; }
      const items = r.data().items || [];
      if (reset) pickRows.innerHTML = '';
      if (!items.length && reset) { pickRows.innerHTML = '<tr><td colspan="3" class="muted" style="padding:10px 12px">Ничего не найдено</td></tr>'; info.textContent=''; return; }
      items.forEach(it => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="border-bottom:1px solid var(--line);padding:10px 12px"><input type="checkbox" data-id="${it.id}"></td>
                        <td style="border-bottom:1px solid var(--line);padding:10px 12px">${it.id}</td>
                        <td style="border-bottom:1px solid var(--line);padding:10px 12px">${it.title || ('#'+it.id)}</td>`;
        pickRows.appendChild(tr);
      });
      PK.total += items.length; info.textContent = 'Показано: ' + PK.total; PK.page++;
    });
  }
  pickAll.onchange = () => {
    pickRows.querySelectorAll('input[type="checkbox"][data-id]').forEach(ch => {
      ch.checked = pickAll.checked;
      const id = Number(ch.getAttribute('data-id'));
      if (ch.checked) PK.selected.add(id); else PK.selected.delete(id);
    });
  };
  pickRows.addEventListener('change', e => {
    const t = e.target;
    if (t && t.matches('input[type="checkbox"][data-id]')) {
      const id = Number(t.getAttribute('data-id'));
      if (t.checked) PK.selected.add(id); else PK.selected.delete(id);
    }
  });
  btnMore.onclick  = () => loadPage(false);
  btnSearch.onclick= () => { PK.query = q.value.trim(); loadPage(true); };
  btnReset.onclick = () => { q.value=''; PK.query=''; loadPage(true); };
  btnClose.onclick = () => { modal.remove(); };
  btnAttach.onclick= () => { const ids = Array.from(PK.selected); if (ids.length) attach(ids); modal.remove(); };

  loadPage(true);
}

// ===== события
ui.ref.onclick      = load;
ui.create.onclick   = () => BX24.openPath(`/crm/type/${SMART_ENTITY_TYPE_ID}/details/0/`);
ui.pick.onclick     = openPicker;
ui.colsBtn.onclick  = openCols;

ui.pageSize.onchange = () => { S.view.size = Number(ui.pageSize.value) || 10; S.view.page = 1; render(); fit(); };
ui.pgPrev.onclick    = () => { if (S.view.page > 1) { S.view.page--; render(); fit(); } };
ui.pgNext.onclick    = () => { const pages = Math.max(1, Math.ceil(filteredAndSorted().length / S.view.size)); if (S.view.page < pages) { S.view.page++; render(); fit(); } };

[ui.fTitle, ui.fAss, ui.fStage, ui.fDeal, ui.fKey, ui.fUrl, ui.fTariff, ui.fProduct].forEach(inp => {
  if (!inp) return;
  inp.addEventListener('input', () => {
    S.filter = {
      title: (ui.fTitle?.value || '').toLowerCase(),
      ass:   (ui.fAss?.value   || '').toLowerCase(),
      stage: (ui.fStage?.value || '').toLowerCase(),
      deal:  (ui.fDeal?.value  || '').toLowerCase(),
      key:   (ui.fKey?.value   || '').toLowerCase(),
      url:   (ui.fUrl?.value   || '').toLowerCase(),
      tariff:(ui.fTariff?.value|| '').toLowerCase(),
      product:(ui.fProduct?.value|| '').toLowerCase(),
    };
    S.view.page = 1; render(); fit();
  });
});

// Сортировка по клику на заголовок
ui.head.addEventListener('click', e => {
  const th = e.target.closest('th[data-col]');
  if (!th || e.target.classList.contains('resizer')) return;
  const map = { deal:'dealid', key:'key', url:'url', tariff:'tariff', tEnd:'tEnd', mEnd:'mEnd', product:'product' };
  const key = th.getAttribute('data-col');
  const sortKey = ({ id:'id', title:'title', ass:'ass', stage:'stage', act:'id' })[key] || map[key] || 'id';
  S.view.sortKey === sortKey ? (S.view.sortDir = S.view.sortDir === 'asc' ? 'desc' : 'asc') : (S.view.sortKey = sortKey, S.view.sortDir = 'asc');
  render(); fit();
});

// Колонки — применение/закрытие
ui.colCancel.onclick = closeCols;
ui.colApply.onclick  = () => {
  const boxes = [...ui.colList.querySelectorAll('input[type="checkbox"]')];
  const list = boxes.filter(b => b.checked).map(b => b.id.replace('col_', ''));
  if (!list.length) return;
  S.cols = list;
  localStorage.setItem('cols_v2', JSON.stringify(S.cols));
  closeCols(); render(); fit();
};

// включаем ручки ресайза
enableResizers();
