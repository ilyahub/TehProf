// assets/app/main.js
// Весь рендер и работа с Bitrix24 для списка "Лицензии"

import {
  $, $$, A, J, pick, fmtDate, UF, enumText, shortUser,
  idFromBinding, parseStage
} from './utils.js';

/* ====== КОНФИГ ====== */
const DEAL_FIELD_CODE     = 'UF_CRM_1755533553'; // связь сделки ↔ SPA
const SMART_ENTITY_TYPE_ID = 1032;               // ваш SPA
const PORTAL_ORIGIN        = 'https://tehprof.bitrix24.kz';

// UF-поля СПА "Лицензии"
const F = {
  dealIdSource : 'UF_CRM_10_1717328665682', // ID исходной сделки (number)
  licenseKey   : 'UF_CRM_10_1717328730625', // Ключ (string)
  portalUrl    : 'UF_CRM_10_1717328814784', // Портал (url)
  tariff       : 'UF_CRM_10_1717329015552', // Тариф (enum)
  tariffEnd    : 'UF_CRM_10_1717329087589', // Окончание тарифа (date)
  marketEnd    : 'UF_CRM_10_1717329109963', // Окончание подписки (date)
  product      : 'UF_CRM_10_1717329453779', // Продукт (enum, required)
};

/* ====== UI ссылки ====== */
const ui = {
  rows:      $('#rows'),
  head:      document.querySelector('tr.head'),
  filtersRow: document.querySelector('tr.filters'),

  // фильтры
  fTitle:  $('#fTitle'),
  fAss:    $('#fAss'),
  fStage:  $('#fStage'),
  fDeal:   $('#fDeal'),
  fKey:    $('#fKey'),
  fUrl:    $('#fUrl'),
  fTariff: $('#fTariff'),
  fProduct:$('#fProduct'),

  // пагинация
  pageSize: $('#pageSize'),
  pgPrev:   $('#pgPrev'),
  pgNext:   $('#pgNext'),
  pgInfo:   $('#pgInfo'),

  // действия
  btnRefresh: $('#btnRefresh'),
  btnCreate:  $('#btnCreate'),
  btnPick:    $('#btnPick'),
  btnCols:    $('#btnCols'),
};

/* ====== СОСТОЯНИЕ ====== */
const S = {
  dealId: null,

  // что хранится в сделке
  field: DEAL_FIELD_CODE,
  typeId: SMART_ENTITY_TYPE_ID,
  mode: 'ids',              // 'ids' или 'bindings'
  bindings: [],
  ids: [],

  // данные
  items: [],
  users: {},             // { userId: {name, path} }
  ufEnums: {},           // { UF_CODE: {id: text} }
  ufKeyMapBuilt: false,  // window.__UF_KEYMAP создан?
  stagesByCat: {},       // { categoryId: [ {id, name, sort, statusId} ] }
  stagesByFull: {},      // { 'DT1032_16:NEW': {id, name, sort, categoryId, statusId} }
  catsMeta: {},          // { categoryId: {maxSort} }

  // представление
  view:  { page: 1, size: Number(ui.pageSize?.value || 10), sortKey:'id', sortDir:'asc' },
  filter:{ title:'', ass:'', stage:'', deal:'', key:'', url:'', tariff:'', product:'' },

  // какие колонки видны (сохраняем в LS)
  cols:   JSON.parse(localStorage.getItem('cols_v1') || 'null')
         || ['id','title','ass','stage','deal','key','url','tariff','tEnd','mEnd','product','act'],
  widths: JSON.parse(localStorage.getItem('widths_v1') || '{}'),
};

/* ====== УТИЛИТЫ ВНУТРИ main.js ====== */

// безопасный resize высоты виджета
const fit = (()=>{ let raf;
  return function(){
    if (!window.BX24) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(()=>{
      const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) + 12;
      try { BX24.resizeWindow(h); } catch {}
    });
  };
})();

// Определяем, что лежит в поле сделки — сами ID или биндинги 'DYNAMIC_*'
function detectMode(raw) {
  const a = A(raw);
  return a.some(v => typeof v === 'string' && v.startsWith('DYNAMIC_')) ? 'bindings' : 'ids';
}

// аккуратно строим select стадий без дублей
function buildStageSelectHtml(item) {
  const cur  = stageObj(item);
  const cid  = Number(item.categoryId) || cur.categoryId || 0;
  const list = S.stagesByCat[cid] || [];

  const opts = list.map(st => {
    const sel = (st.id === cur.id) ? ' selected' : '';
    return `<option value="${st.id}"${sel}>${st.name}</option>`;
  }).join('');

  return `<select class="stageSel" data-item="${item.id}" data-cur="${cur.id}">${opts}</select>`;
}

// найти объект стадии для элемента
function stageObj(item) {
  const sid = item.stageId;
  const parsed = parseStage(sid);
  return S.stagesByFull[sid] || S.stagesByFull[`${parsed.categoryId}:${parsed.statusId}`] /* запасной ключ */ || {
    id: sid, name: sid, sort: 0, categoryId: parsed.categoryId
  };
}

// прогресс-бар по сортировке стадий
function stageBarHtml(item){
  const st  = stageObj(item);
  const cid = Number(item.categoryId) || st.categoryId || 0;
  const max = S.catsMeta[cid]?.maxSort || 100;
  const pct = Math.max(0, Math.min(100, Math.round(((st.sort || 0) / (max || 100)) * 100)));
  return `<div class="bar"><i style="width:${pct}%"></i></div>`;
}

/* ====== ЗАГРУЗКИ: поля, словари, пользователи, стадии ====== */

// 1) Снимок полей SPA — строим карту соответствия и словари enum
async function ensureFieldsInfo() {
  if (S.ufKeyMapBuilt) return;
  await new Promise(res => {
    BX24.callMethod('crm.item.fields', { entityTypeId: S.typeId }, r => {
      if (r.error()) return res();

      const fields = r.data()?.fields || {};
      window.__UF_KEYMAP = window.__UF_KEYMAP || {};

      for (const prop in fields) {
        const f = fields[prop];
        const upper = pick(f, 'upperName', 'UPPER_NAME', 'UPPERNAME');
        if (upper && upper.startsWith('UF_CRM_')) {
          window.__UF_KEYMAP[upper] = prop; // UF_CRM_xxx -> ufCrmXxx...
        }
        // словари enumeration
        if (String(f.type).toLowerCase() === 'enumeration' && Array.isArray(f.items)) {
          const code = upper || prop;
          S.ufEnums[code] = S.ufEnums[code] || {};
          for (const it of f.items) {
            const id  = Number(pick(it,'ID','id'));
            const val = String(pick(it,'VALUE','value') || id);
            if (!Number.isNaN(id)) {
              S.ufEnums[code][id] = val;
              S.ufEnums[code][String(id)] = val;
            }
          }
        }
      }
      S.ufKeyMapBuilt = true;
      res();
    });
  });
}

// 2) Загружаем пользователей по assignedById
async function buildUsers(items){
  const ids = Array.from(new Set(items.map(i => Number(i.assignedById)).filter(Boolean)));
  if (!ids.length) return;
  const calls = {};
  ids.forEach((uid,i)=> calls['u'+i] = ['user.get', { ID: String(uid) }]);
  await new Promise(res => BX24.callBatch(calls, r => {
    for (const k in r) {
      if (!r[k].error()) {
        const raw = (r[k].data() || [])[0] || {};
        const id  = Number(pick(raw,'ID'));
        if (!id) continue;
        S.users[id] = { name: shortUser(raw), path: '/company/personal/user/'+id+'/' };
      }
    }
    res();
  }, true));
}

// 3) Стадии для всех категорий, встречающихся у элементов
async function buildStages(items){
  const cats = Array.from(new Set(items.map(i => Number(i.categoryId)).filter(Boolean)));
  if (!cats.length) return;
  const calls = {};
  cats.forEach((cid,i)=> calls['s'+i] = ['crm.category.stage.list', { entityTypeId:S.typeId, categoryId:cid }]);
  await new Promise(res => BX24.callBatch(calls, r => {
    for (const k in r) {
      if (r[k].error()) continue;
      let list = r[k].data();
      if (!Array.isArray(list)) list = list?.stages || list?.STAGES || [];
      const catList = [];
      for (const st of list) {
        const statusId   = String(pick(st,'statusId','STATUS_ID')||'');
        const name       = String(pick(st,'name','NAME')||statusId);
        const sort       = Number(pick(st,'sort','SORT')||0);
        const categoryId = Number(pick(st,'categoryId','CATEGORY_ID')||0);
        const fullId     = String(pick(st,'id','ID') || (categoryId ? `DT${S.typeId}_${categoryId}:${statusId}` : statusId));
        const obj = { id: fullId, name, sort, categoryId, statusId };
        S.stagesByFull[fullId] = obj;
        catList.push(obj);
      }
      if (catList.length) {
        catList.sort((a,b)=> a.sort - b.sort);
        const cid = catList[0].categoryId;
        S.stagesByCat[cid] = catList;
        const maxSort = Math.max(...catList.map(s=>s.sort), 100);
        S.catsMeta[cid] = { maxSort };
      }
    }
    res();
  }, true));
}

/* ====== ЗАГРУЗКА ДАННЫХ И РЕНДЕР ====== */

function collectFilters(){
  S.filter = {
    title:  (ui.fTitle?.value  || '').toLowerCase(),
    ass:    (ui.fAss?.value    || '').toLowerCase(),
    stage:  (ui.fStage?.value  || '').toLowerCase(),
    deal:   (ui.fDeal?.value   || '').toLowerCase(),
    key:    (ui.fKey?.value    || '').toLowerCase(),
    url:    (ui.fUrl?.value    || '').toLowerCase(),
    tariff: (ui.fTariff?.value || '').toLowerCase(),
    product:(ui.fProduct?.value|| '').toLowerCase(),
  };
}

function filteredSorted(){
  const f = S.filter;
  let arr = S.items.filter(it=>{
    const title = String(it.title||'').toLowerCase();
    const ass   = S.users[Number(it.assignedById)]?.name.toLowerCase() || '';
    const st    = stageObj(it).name.toLowerCase();
    const deal  = String(UF(it,F.dealIdSource)||'').toLowerCase();
    const key   = String(UF(it,F.licenseKey)||'').toLowerCase();
    const url   = String(UF(it,F.portalUrl)||'').toLowerCase();
    const tariff= String(enumText(S.ufEnums, F.tariff,  UF(it,F.tariff))||'').toLowerCase();
    const prod  = String(enumText(S.ufEnums, F.product, UF(it,F.product))||'').toLowerCase();
    return (!f.title || title.includes(f.title))
        && (!f.ass   || ass.includes(f.ass))
        && (!f.stage || st.includes(f.stage))
        && (!f.deal  || deal.includes(f.deal))
        && (!f.key   || key.includes(f.key))
        && (!f.url   || url.includes(f.url))
        && (!f.tariff|| tariff.includes(f.tariff))
        && (!f.product|| prod.includes(f.product));
  });

  // сортировка (минимально — по нескольким ключам)
  const dir = S.view.sortDir === 'asc' ? 1 : -1;
  const key = S.view.sortKey;
  arr.sort((a,b)=>{
    const get = (k) => {
      if (k==='id')    return (Number(a.id)||0) - (Number(b.id)||0);
      if (k==='title') return String(a.title||'').localeCompare(String(b.title||''), 'ru', {sensitivity:'base'});
      if (k==='ass')   {
        const ax = S.users[Number(a.assignedById)]?.name||'';
        const ay = S.users[Number(b.assignedById)]?.name||'';
        return ax.localeCompare(ay,'ru',{sensitivity:'base'});
      }
      if (k==='stage') return (stageObj(a).sort||0) - (stageObj(b).sort||0);
      return 0;
    };
    const v = get(key);
    return (v===0 ? ((Number(a.id)||0)-(Number(b.id)||0)) : v) * dir;
  });

  return arr;
}

function render(){
  // видимость и ширины колонок (th/td с data-col)
  $$('[data-col]', ui.head).forEach(th=>{
    const key = th.getAttribute('data-col');
    th.style.display = S.cols.includes(key) ? '' : 'none';
    const w = S.widths[key]; if (w) th.style.width = w;
  });
  $$('[data-col]', ui.filtersRow).forEach(td=>{
    const key = td.getAttribute('data-col');
    td.style.display = S.cols.includes(key) ? '' : 'none';
  });

  const full  = filteredSorted();
  const total = full.length;
  const pages = Math.max(1, Math.ceil(total / S.view.size));
  if (S.view.page > pages) S.view.page = pages;
  const start = (S.view.page - 1) * S.view.size;
  const slice = full.slice(start, start + S.view.size);

  ui.pgInfo.textContent = `${S.view.page}/${pages}`;
  ui.pgPrev.disabled = S.view.page <= 1;
  ui.pgNext.disabled = S.view.page >= pages;

  if (!slice.length) {
    ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Ничего не найдено</td></tr>`;
    fit(); return;
  }

  // рендер строк
  ui.rows.innerHTML = '';
  slice.forEach(it=>{
    const id = it.id;
    const ass = (() => {
      const uid = Number(it.assignedById) || 0;
      const u = S.users[uid];
      return u ? `<a href="#" onclick="BX24.openPath('${u.path}');return false;">${u.name}</a>` : (uid ? ('ID '+uid) : '—');
    })();

    const stageHtml  = stageBarHtml(it) + `<span class="muted" style="margin-left:8px">${stageObj(it).id}</span>` + buildStageSelectHtml(it);
    const deal       = UF(it, F.dealIdSource) ?? '—';
    const key        = UF(it, F.licenseKey)   ?? '—';
    const urlRaw     = UF(it, F.portalUrl)    ?? '';
    const url        = urlRaw ? `<a href="${urlRaw}" target="_blank" rel="noopener">${urlRaw.replace(/^https?:\/\/(www\.)?/,'')}</a>` : '—';
    const tariff     = enumText(S.ufEnums, F.tariff,  UF(it, F.tariff));
    const tEnd       = fmtDate(UF(it, F.tariffEnd));
    const mEnd       = fmtDate(UF(it, F.marketEnd));
    const product    = enumText(S.ufEnums, F.product, UF(it, F.product));
    const title      = it.title || ('#'+id);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-col="id">${id}</td>
      <td data-col="title" class="wrap-title">
        <a href="#" onclick="BX24.openPath('/crm/type/${S.typeId}/details/${id}/');return false;">${title}</a>
      </td>
      <td data-col="ass">${ass}</td>
      <td data-col="stage">${stageHtml}</td>
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

    // применяем видимость к td
    $$('[data-col]', tr).forEach(td=>{
      const key = td.getAttribute('data-col');
      td.style.display = S.cols.includes(key) ? '' : 'none';
    });

    ui.rows.appendChild(tr);
  });

  // события после рендера
  ui.rows.querySelectorAll('[data-open]').forEach(n =>
    n.onclick = () => BX24.openPath(`/crm/type/${S.typeId}/details/${n.getAttribute('data-open')}/`)
  );

  ui.rows.querySelectorAll('.stageSel').forEach(sel => {
    sel.onchange = () => {
      const newId = sel.value;
      const itemId = Number(sel.getAttribute('data-item'));
      BX24.callMethod('crm.item.update', { entityTypeId:S.typeId, id:itemId, fields:{ stageId:newId } }, r=>{
        if (r.error()) {
          alert('Ошибка смены стадии: '+r.error_description());
          sel.value = sel.getAttribute('data-cur');
          return;
        }
        const it = S.items.find(x=>x.id===itemId);
        if (it) it.stageId = newId;
        sel.setAttribute('data-cur', newId);
        render(); fit();
      });
    };
  });

  ui.rows.querySelectorAll('[data-del]').forEach(b => b.onclick = () => detach(Number(b.getAttribute('data-del'))));
  fit();
}

/* ====== СВЯЗИ (сделка ↔ SPA) ====== */

function save(next){
  const f = {}; f[S.field] = next;
  BX24.callMethod('crm.deal.update', { id:S.dealId, fields:f }, r=>{
    if (r.error()) alert('Ошибка: '+r.error_description());
    load();
  });
}

function attach(ids){
  if (S.mode === 'bindings') {
    const add = ids.map(id => `DYNAMIC_${S.typeId}_${id}`);
    save(Array.from(new Set([...(S.bindings||[]), ...add])));
  } else {
    save(Array.from(new Set([...(A(S.bindings).map(Number)), ...ids])));
  }
}

function detach(id){
  if (S.mode === 'bindings') {
    const code = `DYNAMIC_${S.typeId}_${id}`;
    save((S.bindings||[]).filter(c => c !== code));
  } else {
    save(A(S.bindings).map(Number).filter(v => v !== id));
  }
}

/* ====== ОСНОВНАЯ ЗАГРУЗКА ====== */

function load(){
  if (!S.dealId) {
    ui.rows.innerHTML = `<tr><td colspan="12" class="err">Нет ID сделки</td></tr>`;
    return;
  }

  BX24.callMethod('crm.deal.get', { id:S.dealId }, r=>{
    if (r.error()) {
      ui.rows.innerHTML = `<tr><td colspan="12" class="err">${r.error_description()}</td></tr>`;
      return;
    }
    const raw = r.data()[S.field];
    S.mode     = detectMode(raw);
    S.bindings = A(raw);
    S.ids      = (S.mode==='bindings')
      ? S.bindings.map(c => idFromBinding(c, S.typeId)).filter(Boolean)
      : A(raw).map(Number).filter(Boolean);

    if (!S.ids.length) {
      ui.rows.innerHTML = `<tr><td colspan="12" class="muted">Пока нет связанных элементов</td></tr>`;
      fit(); return;
    }

    // берём нужные поля, включая наши UF
    const select = [
      'id','title','stageId','categoryId','assignedById',
      F.dealIdSource, F.licenseKey, F.portalUrl, F.tariff, F.tariffEnd, F.marketEnd, F.product
    ];

    BX24.callMethod('crm.item.list', { entityTypeId:S.typeId, filter:{ '@id': S.ids }, select }, async rr=>{
      if (rr.error()) {
        // запасной батч get
        const calls={}; S.ids.forEach((id,i)=> calls['g'+i] = ['crm.item.get', { entityTypeId:S.typeId, id }]);
        BX24.callBatch(calls, res=>{
          const items = [];
          for (const k in res) if (!res[k].error()) items.push(res[k].data().item);
          proceed(items);
        }, true);
        return;
      }
      const items = rr.data().items || [];
      proceed(items);
    });

    async function proceed(items){
      S.items = items;
      await ensureFieldsInfo();
      await buildUsers(items);
      await buildStages(items);

      render();
    }
  });
}

/* ====== ИНИЦИАЛИЗАЦИЯ ====== */

function wireUi(){
  // фильтры
  [ui.fTitle, ui.fAss, ui.fStage, ui.fDeal, ui.fKey, ui.fUrl, ui.fTariff, ui.fProduct]
    .filter(Boolean)
    .forEach(inp => inp.addEventListener('input', ()=>{
      collectFilters(); S.view.page = 1; render();
    }));

  // сортировка по заголовку колонки
  ui.head?.addEventListener('click', e=>{
    const th = e.target.closest('th[data-col]'); if (!th || e.target.classList.contains('resizer')) return;
    const key = th.getAttribute('data-col');
    const map = { id:'id', title:'title', ass:'ass', stage:'stage' };
    const sortKey = map[key] || 'id';
    if (S.view.sortKey === sortKey) S.view.sortDir = (S.view.sortDir === 'asc' ? 'desc' : 'asc');
    else { S.view.sortKey = sortKey; S.view.sortDir = 'asc'; }
    render();
  });

  // пагинация
  ui.pageSize?.addEventListener('change', ()=>{
    S.view.size = Number(ui.pageSize.value) || 10;
    S.view.page = 1;
    render();
  });
  ui.pgPrev?.addEventListener('click', ()=>{
    if (S.view.page > 1){ S.view.page--; render(); }
  });
  ui.pgNext?.addEventListener('click', ()=>{
    const pages = Math.max(1, Math.ceil(filteredSorted().length / S.view.size));
    if (S.view.page < pages){ S.view.page++; render(); }
  });

  // простая ручка ресайза (если она есть в верстке)
  document.querySelectorAll('th .resizer').forEach(handle=>{
    const th  = handle.parentElement;
    const key = th.getAttribute('data-col');
    let startX, startW;
    handle.onmousedown = e=>{
      startX = e.clientX; startW = th.offsetWidth; th.classList.add('resizing');
      document.onmousemove = ev=>{
        const w = Math.max(60, startW + (ev.clientX - startX));
        th.style.width = w+'px'; S.widths[key] = th.style.width;
      };
      document.onmouseup = ()=>{
        document.onmousemove = null; document.onmouseup = null;
        th.classList.remove('resizing');
        localStorage.setItem('widths_v1', JSON.stringify(S.widths));
      };
    };
  });

  // кнопки
  ui.btnRefresh && (ui.btnRefresh.onclick = ()=> load());
  ui.btnCreate  && (ui.btnCreate.onclick  = ()=> BX24.openPath(`/crm/type/${S.typeId}/details/0/`));
  // пикер "Выбрать элемент" (минимальная заглушка: просто обновление)
  ui.btnPick    && (ui.btnPick.onclick    = ()=> alert('Пикер можно включить позже (оставил как заглушку)'));
}

function initBx(){
  BX24.init(function(){
    // извлекаем ID сделки из PLACEMENT_OPTIONS
    const p = J(BX24.getParam('PLACEMENT_OPTIONS') || '{}');
    if (p?.ID) S.dealId = Number(p.ID);

    // ранний запасной вариант — из __BOOT__ (если есть)
    const boot = window.__BOOT__ || {};
    if (!S.dealId) {
      const pid = J(boot.placementOptions||'{}').ID || null;
      if (pid) S.dealId = Number(pid);
    }

    wireUi();
    load();
    fit();
  });
}

/* ====== СТАРТ ====== */
document.addEventListener('DOMContentLoaded', ()=>{
  // помним: в виджете BX24 уже есть
  initBx();
});
