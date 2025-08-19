// assets/app/main.js
import { $, $$, A, J, pick, fmtDate, UF, putEnum, enumText, idFromBinding, parseStage } from './utils.js';
import { DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID, F } from './config.js';

const defaultCols = ['id','title','ass','stage','deal','url','tariff','tEnd','mEnd','product','act'];

const S = {
  dealId: null,
  field: DEAL_FIELD_CODE,
  typeId: SMART_ENTITY_TYPE_ID,

  mode: 'ids',
  bindings: [],
  ids: [],
  items: [],

  users: {},
  ufEnums: {},

  stagesByFull: {},
  stagesByCatStatus: {},
  catStages: {},
  cats: {},

  view: { page: 1, size: 10, sortKey: 'id', sortDir: 'asc' },
  filter: { title:'', ass:'', stage:'', deal:'', url:'', key:'', tariff:'', product:'' },

  cols: (() => {
    let c = JSON.parse(localStorage.getItem('cols_v1') || 'null') || defaultCols;
    // Гарантируем видимость первых трёх колонок
    ['id','title','ass'].forEach(k => { if (!c.includes(k)) c.unshift(k); });
    return Array.from(new Set(c));
  })(),
  widths: JSON.parse(localStorage.getItem('widths_v1') || '{}'),
};

// ---- UI refs
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

  fTitle:  $('#fTitle'),
  fAss:    $('#fAss'),
  fStage:  $('#fStage'),
  fDeal:   $('#fDeal'),
  fKey:    $('#fKey'),
  fUrl:    $('#fUrl'),
  fTariff: $('#fTariff'),
  fProduct:$('#fProduct'),

  head: document.querySelector('tr.head'),
  filters: document.querySelector('tr.filters'),

  colModal: $('#colModal'),
  colList:  $('#colList'),
  colCancel: $('#colCancel'),
  colApply:  $('#colApply'),
};

// ---- автоподгон iframe
const fit = (() => {
  let raf; return function () {
    if (!window.BX24) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) + 12;
      try { BX24.resizeWindow(h); } catch {}
    });
  };
})();
new ResizeObserver(() => fit()).observe(document.body);

// ранний dealId из POST
(function bootstrapDealIdFromPost(){
  const boot = window.__BOOT__ || {};
  const pid = J(boot.placementOptions || '{}').ID || null;
  if (pid) S.dealId = Number(pid);
})();

// ---- BX24 init
BX24.init(() => {
  if (!S.dealId) {
    const p = BX24.getParam('PLACEMENT_OPTIONS');
    const pid = (J(p || '{}').ID) || null;
    if (pid) S.dealId = Number(pid);
  }
  let started=false;
  const start = ()=>{ if (started || !S.dealId) return; started = true; load(); fit(); };
  BX24.placement.info(()=>start());
  setTimeout(start,300);
  setTimeout(start,1500);
});

// ---- helpers
function detectMode(raw) {
  const a = A(raw);
  return a.some(v => typeof v === 'string' && v.startsWith('DYNAMIC_')) ? 'bindings' : 'ids';
}
function bcode(typeId, id){ return `DYNAMIC_${typeId}_${id}`; }
function saveBindings(next){
  const f = {}; f[S.field] = next;
  BX24.callMethod('crm.deal.update', { id:S.dealId, fields:f }, r=>{
    if (r.error()) alert('Ошибка: ' + r.error_description());
    load();
  });
}
function attach(ids){
  if (S.mode==='bindings'){
    const add = ids.map(id=>bcode(S.typeId,id));
    saveBindings(Array.from(new Set([...(S.bindings||[]), ...add])));
  } else {
    saveBindings(Array.from(new Set([...(A(S.bindings).map(Number)), ...ids])));
  }
}
function detach(id){
  if (S.mode==='bindings'){
    const code = bcode(S.typeId,id);
    saveBindings((S.bindings||[]).filter(c=>c!==code));
  } else {
    saveBindings(A(S.bindings).map(Number).filter(v=>v!==id));
  }
}

// ---- LOAD
function load(){
  if (!S.dealId){ ui.rows.innerHTML = '<tr><td colspan="12" class="err">Нет ID сделки</td></tr>'; return; }

  BX24.callMethod('crm.deal.get', { id:S.dealId }, r=>{
    if (r.error()){ ui.rows.innerHTML = `<tr><td colspan="12" class="err">${r.error_description()}</td></tr>`; return; }

    const raw = r.data()[S.field];
    S.mode = detectMode(raw);
    S.bindings = A(raw);
    S.ids = (S.mode==='bindings')
      ? S.bindings.map(c=>idFromBinding(c,S.typeId)).filter(Boolean)
      : A(raw).map(Number).filter(Boolean);

    if (!S.ids.length){ ui.rows.innerHTML = '<tr><td colspan="12" class="muted">Пока нет связанных элементов</td></tr>'; fit(); return; }

    const select = [
      'id','title','stageId','categoryId','assignedById',
      F.dealIdSource, F.licenseKey, F.portalUrl, F.tariff, F.tariffEnd, F.marketEnd, F.product
    ];

    BX24.callMethod('crm.item.list', { entityTypeId:S.typeId, filter:{'@id':S.ids}, select }, async rr=>{
      let items=[];
      if (!rr.error()) items = rr.data().items || [];
      else {
        const calls={}; S.ids.forEach((id,i)=>calls['g'+i]=['crm.item.get',{entityTypeId:S.typeId,id}]);
        BX24.callBatch(calls,res=>{
          for (const k in res) if (!res[k].error()) items.push(res[k].data().item);
          proceed(items);
        }, true);
        return;
      }
      proceed(items);
    });

    async function proceed(items){
      S.items = items;
      await buildUFEnums();
      await buildUsers(items);
      await buildStages(items);
      await hydrateUFsIfMissing();
      render();
      fit();
    }
  });
}

// ---- UF enums
async function buildUFEnums(){
  await new Promise(res=>{
    BX24.callMethod('crm.item.userfield.list',{ entityTypeId:S.typeId }, rr=>{
      if (!rr.error()){
        const list = rr.data().userFields || rr.data() || [];
        list.forEach(f=>{
          const code = pick(f,'FIELD_NAME','fieldName');
          const enums = pick(f,'LIST','list')||[];
          if (code && Array.isArray(enums) && enums.length){
            enums.forEach(e=> putEnum(S.ufEnums, code, pick(e,'ID','VALUE_ID'), pick(e,'VALUE')) );
          }
        });
      }
      res();
    });
  });

  await new Promise(res=>{
    BX24.callMethod('crm.item.fields',{ entityTypeId:S.typeId }, rr=>{
      if (!rr.error()){
        const fields = rr.data() || {};
        [F.tariff, F.product].forEach(code=>{
          const items = fields[code]?.items || fields[code]?.ITEMS || [];
          if (Array.isArray(items) && items.length){
            items.forEach(e=> putEnum(S.ufEnums, code, e.ID, e.VALUE));
          }
        });
      }
      res();
    });
  });
}

// ---- Users
async function buildUsers(items){
  const ids = Array.from(new Set(items.map(i=>Number(i.assignedById)).filter(Boolean)));
  if (!ids.length) return;
  const calls={}; ids.forEach((uid,i)=>calls['u'+i]=['user.get',{ID:String(uid)}]);
  await new Promise(res=>BX24.callBatch(calls,r=>{
    for (const k in r){
      if (r[k].error()) continue;
      const raw=(r[k].data()||[])[0]||{};
      const id=Number(pick(raw,'ID')); if (!id) continue;
      const name=[pick(raw,'LAST_NAME'),pick(raw,'NAME'),pick(raw,'SECOND_NAME')].filter(Boolean).join(' ')
        || pick(raw,'LOGIN') || ('ID '+id);
      S.users[id] = { name, path:'/company/personal/user/'+id+'/' };
    }
    res();
  }, true));
}

// ---- Stages (with fallback)
async function buildStages(items){
  const cats = Array.from(new Set(items.map(i=>Number(i.categoryId)).filter(Boolean)));
  if (!cats.length) return;

  const calls={}; cats.forEach((cid,i)=>calls['s'+i]=['crm.category.stage.list',{entityTypeId:S.typeId,categoryId:cid}]);

  let ok=false;
  S.stagesByFull = {}; S.stagesByCatStatus = {}; S.catStages = {}; S.cats = {};

  await new Promise(res=>BX24.callBatch(calls,r=>{
    for (const k in r){
      if (r[k].error()) continue;
      ok=true;
      let data=r[k].data();
      let list=Array.isArray(data)?data:(data?.stages||data?.STAGES)||[];
      if (!Array.isArray(list) && data?.result) list = data.result.stages || data.result.STAGES || [];
      list.forEach(st=>{
        const statusId=String(pick(st,'statusId','STATUS_ID')||'');
        const name=String(pick(st,'name','NAME')||statusId);
        const sort=Number(pick(st,'sort','SORT')||0);
        const categoryId=Number(pick(st,'categoryId','CATEGORY_ID')||0);
        const fullId=String(pick(st,'id','ID') || (categoryId ? `DT${S.typeId}_${categoryId}:${statusId}` : statusId));
        S.stagesByFull[fullId] = { id:fullId, name, sort, categoryId, statusId };
        S.stagesByCatStatus[categoryId+':'+statusId] = S.stagesByFull[fullId];
        if (!S.catStages[categoryId]) S.catStages[categoryId]=[];
        if (!S.catStages[categoryId].some(x=>x.id===fullId))
          S.catStages[categoryId].push({ id:fullId, name, sort, statusId });
      });
    }
    Object.keys(S.catStages).forEach(cid=>{
      const arr=S.catStages[cid].sort((a,b)=>a.sort-b.sort);
      S.cats[cid]={ list:arr, maxSort: arr.length?Math.max(...arr.map(s=>s.sort)):100 };
    });
    res();
  }, true));

  if (!ok || !Object.keys(S.stagesByFull).length){
    // старый портал: crm.status.list
    await Promise.all(cats.map(async cid=>{
      await new Promise(res=>{
        BX24.callMethod('crm.status.list',{ filter:{ENTITY_ID:`DYNAMIC_${S.typeId}_STAGE_${cid}`} }, rr=>{
          if (!rr.error()){
            const list=rr.data()||[];
            list.forEach(st=>{
              const statusId=String(pick(st,'STATUS_ID','statusId')||'');
              const name=String(pick(st,'NAME','name')||statusId);
              const sort=Number(pick(st,'SORT','sort')||0);
              const fullId=`DT${S.typeId}_${cid}:${statusId}`;
              S.stagesByFull[fullId]={id:fullId,name,sort,categoryId:cid,statusId};
              S.stagesByCatStatus[cid+':'+statusId]=S.stagesByFull[fullId];
              if (!S.catStages[cid]) S.catStages[cid]=[];
              if (!S.catStages[cid].some(x=>x.id===fullId))
                S.catStages[cid].push({id:fullId,name,sort,statusId});
            });
            const arr=S.catStages[cid].sort((a,b)=>a.sort-b.sort);
            S.cats[cid]={ list:arr, maxSort:arr.length?Math.max(...arr.map(s=>s.sort)):100 };
          }
          res();
        });
      });
    }));
  }
}

function getStageObject(item){
  const sid=item.stageId;
  const {categoryId,statusId}=parseStage(sid);
  return S.stagesByFull[sid] || S.stagesByCatStatus[(categoryId+':'+statusId)] || {id:sid,name:sid,sort:0,categoryId};
}

// сегментный бар с кликами
function stageUi(item){
  const st=getStageObject(item);
  const cid=Number(item.categoryId)||st.categoryId||0;
  const list=S.cats[cid]?.list||[];
  const curIdx=Math.max(0,list.findIndex(s=>s.id===st.id));
  const seg = list.length ? (100/list.length) : 100;

  const segsHtml = list.map((s,i)=>(
    `<i class="seg" data-idx="${i}" data-stage="${s.id}"
        style="left:${i*seg}%;width:${seg}%;${i<=curIdx?'background:#a5b4fc':'background:transparent'}"></i>`
  )).join('');

  return `
    <div class="stage" data-cid="${cid}" data-item="${item.id}">
      <div class="bar">${segsHtml}</div>
      <span class="stageName">${st.name}</span>
    </div>
  `;
}

async function hydrateUFsIfMissing(){
  const need=[F.dealIdSource,F.licenseKey,F.portalUrl,F.tariff,F.tariffEnd,F.marketEnd,F.product];
  const miss = S.items.some(it=> need.some(code=> it[code]===undefined ));
  if (!miss) return;
  const calls={}; S.items.forEach((it,i)=>calls['g'+i]=['crm.item.get',{entityTypeId:S.typeId,id:it.id}]);
  await new Promise(res=>BX24.callBatch(calls,rr=>{
    for (const k in rr){
      if (rr[k].error()) continue;
      const full=rr[k].data().item;
      const idx=S.items.findIndex(x=>x.id===full.id);
      if (idx>-1) Object.assign(S.items[idx], full);
    }
    res();
  }, true));
}

// ---- РЕНДЕР
function filteredAndSorted(){
  const f=S.filter;
  let arr = S.items.filter(it=>{
    const title = String(it.title||'').toLowerCase();
    const uid   = Number(it.assignedById)||null;
    const ass   = uid && S.users[uid] ? S.users[uid].name.toLowerCase() : '';
    const st    = getStageObject(it).name.toLowerCase();
    const deal  = String(UF(it,F.dealIdSource)||'').toLowerCase();
    const key   = String(UF(it,F.licenseKey)||'').toLowerCase();
    const url   = String(UF(it,F.portalUrl)||'').toLowerCase();
    const tariff= String(enumText(S.ufEnums,F.tariff,UF(it,F.tariff))||'').toLowerCase();
    const prod  = String(enumText(S.ufEnums,F.product,UF(it,F.product))||'').toLowerCase();

    return (!f.title || title.includes(f.title))
        && (!f.ass   || ass.includes(f.ass))
        && (!f.stage || st.includes(f.stage))
        && (!f.deal  || deal.includes(f.deal))
        && (!f.key   || key.includes(f.key))
        && (!f.url   || url.includes(f.url))
        && (!f.tariff|| tariff.includes(f.tariff))
        && (!f.product|| prod.includes(f.product));
  });

  const dir=S.view.sortDir==='asc'?1:-1, key=S.view.sortKey;
  arr.sort((x,y)=>{
    const get=(k)=>{
      if (k==='id') return (Number(x.id)||0)-(Number(y.id)||0);
      if (k==='title') return String(x.title||'').localeCompare(String(y.title||''),'ru',{sensitivity:'base'});
      if (k==='ass'){
        const ax=S.users[Number(x.assignedById)]?.name||'';
        const ay=S.users[Number(y.assignedById)]?.name||'';
        return ax.localeCompare(ay,'ru',{sensitivity:'base'});
      }
      if (k==='stage') return (getStageObject(x).sort||0)-(getStageObject(y).sort||0);
      if (k==='dealid') return String(UF(x,F.dealIdSource)||'').localeCompare(String(UF(y,F.dealIdSource)||''),'ru',{numeric:true});
      if (k==='url') return String(UF(x,F.portalUrl)||'').localeCompare(String(UF(y,F.portalUrl)||''),'ru',{sensitivity:'base'});
      if (k==='tariff') return String(enumText(S.ufEnums,F.tariff,UF(x,F.tariff))||'').localeCompare(String(enumText(S.ufEnums,F.tariff,UF(y,F.tariff))||''),'ru',{sensitivity:'base'});
      if (k==='tEnd') return String(UF(x,F.tariffEnd)||'').localeCompare(String(UF(y,F.tariffEnd)||''),'ru',{numeric:true});
      if (k==='mEnd') return String(UF(x,F.marketEnd)||'').localeCompare(String(UF(y,F.marketEnd)||''),'ru',{numeric:true});
      if (k==='product') return String(enumText(S.ufEnums,F.product,UF(x,F.product))||'').localeCompare(String(enumText(S.ufEnums,F.product,UF(y,F.product))||''),'ru',{sensitivity:'base'});
      return 0;
    };
    const v=get(key);
    return v===0 ? ((Number(x.id)||0)-(Number(y.id)||0))*dir : v*dir;
  });
  if (dir<0) arr.reverse();
  return arr;
}

function render(){
  // показать/скрыть колонки
  document.querySelectorAll('[data-col]').forEach(th=>{
    const key=th.getAttribute('data-col');
    th.style.display = S.cols.includes(key)?'':'none';
    const w=S.widths[key]; if (w) th.style.width=w;
  });
  ui.filters.querySelectorAll('[data-col]').forEach(td=>{
    const key=td.getAttribute('data-col');
    td.style.display = S.cols.includes(key)?'':'none';
  });

  const full=filteredAndSorted();
  const total=full.length;
  const pages=Math.max(1,Math.ceil(total/S.view.size));
  if (S.view.page>pages) S.view.page=pages;
  const start=(S.view.page-1)*S.view.size;
  const slice=full.slice(start,start+S.view.size);

  ui.pgInfo.textContent=S.view.page+'/'+pages;
  ui.pgPrev.disabled=(S.view.page<=1);
  ui.pgNext.disabled=(S.view.page>=pages);

  if (!slice.length){ ui.rows.innerHTML='<tr><td colspan="12" class="muted">Ничего не найдено</td></tr>'; return; }

  ui.rows.innerHTML='';
  slice.forEach(it=>{
    const id=it.id;
    const uid=Number(it.assignedById)||null, u=uid?S.users[uid]:null;
    const assHtml = u ? `<a href="#" onclick="BX24.openPath('${u.path}');return false;">${u.name}</a>` : (uid?('ID '+uid):'—');

    const stage = stageUi(it);
    const deal  = UF(it,F.dealIdSource) ?? '—';
    const urlR  = UF(it,F.portalUrl) ?? '';
    const url   = urlR ? `<a href="${urlR}" target="_blank" rel="noopener">${urlR}</a>` : '—';
    const tariff= enumText(S.ufEnums, F.tariff,  UF(it,F.tariff));
    const tEnd  = fmtDate(UF(it,F.tariffEnd));
    const mEnd  = fmtDate(UF(it,F.marketEnd));
    const prod  = enumText(S.ufEnums, F.product, UF(it,F.product));

    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td data-col="id">${id}</td>
      <td class="wrap-title" data-col="title">
        <a href="#" onclick="BX24.openPath('/crm/type/${S.typeId}/details/${id}/');return false;">${it.title || ('#'+id)}</a>
      </td>
      <td data-col="ass">${assHtml}</td>
      <td data-col="stage">${stage}</td>
      <td data-col="deal">${deal||'—'}</td>
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
    tr.querySelectorAll('[data-col]').forEach(td=>{
      const key=td.getAttribute('data-col');
      td.style.display = S.cols.includes(key)?'':'none';
    });
    ui.rows.appendChild(tr);
  });

  // действия
  ui.rows.querySelectorAll('[data-open]').forEach(n =>
    n.onclick = () => BX24.openPath(`/crm/type/${S.typeId}/details/${n.getAttribute('data-open')}/`)
  );
  ui.rows.querySelectorAll('[data-del]').forEach(b =>
    b.onclick = () => detach(Number(b.getAttribute('data-del')))
  );

  mountStageBars(); // интерактив стадий
}

// интерактивная логика бара стадии
function mountStageBars(){
  ui.rows.querySelectorAll('.stage').forEach(box=>{
    const cid = Number(box.getAttribute('data-cid'));
    const itemId = Number(box.getAttribute('data-item'));
    const list = S.cats[cid]?.list || [];
    const nameEl = box.querySelector('.stageName');
    const segs = Array.from(box.querySelectorAll('.bar .seg'));

    const currentId = (S.items.find(i=>i.id===itemId)||{}).stageId;
    let curIdx = Math.max(0, list.findIndex(s=>s.id===currentId));
    let overIdx = null;

    const paint = (idx, color) => {
      segs.forEach((seg,i)=> seg.style.background = (i<=idx?color:'transparent'));
    };

    // начальная отрисовка
    paint(curIdx, '#a5b4fc');

    const bar = box.querySelector('.bar');
    bar.addEventListener('mousemove', e=>{
      const rect = bar.getBoundingClientRect();
      const w = rect.width || 1;
      const idx = Math.max(0, Math.min(list.length-1, Math.floor((e.clientX - rect.left) / (w / list.length))));
      if (idx !== overIdx){
        overIdx = idx;
        paint(idx, '#93c5fd');
        nameEl.textContent = list[idx]?.name || nameEl.textContent;
      }
    });
    bar.addEventListener('mouseleave', ()=>{
      overIdx = null;
      paint(curIdx, '#a5b4fc');
      nameEl.textContent = list[curIdx]?.name || nameEl.textContent;
    });
    bar.addEventListener('click', ()=>{
      const idx = overIdx!=null ? overIdx : curIdx;
      const newStageId = list[idx]?.id; if (!newStageId) return;
      BX24.callMethod('crm.item.update',{entityTypeId:S.typeId,id:itemId,fields:{stageId:newStageId}}, r=>{
        if (r.error()){ alert('Ошибка смены стадии: '+r.error_description()); return; }
        const it=S.items.find(i=>i.id===itemId); if (it) it.stageId=newStageId;
        render();
      });
    });
  });
}

// ---- Модалка колонок
function openCols(){
  ui.colList.innerHTML='';
  const labels = {
    id:'ID', title:'Название', ass:'Ответственный', stage:'Стадия', deal:'ID исходной сделки',
    url:'Адрес портала', tariff:'Текущий тариф', tEnd:'Окончание тарифа', mEnd:'Окончание подписки', product:'Продукт', act:'Действия'
  };
  defaultCols.forEach(k=>{
    const id='col_'+k;
    const row=document.createElement('label');
    row.innerHTML=`<input type="checkbox" id="${id}" ${S.cols.includes(k)?'checked':''}> ${labels[k]||k}`;
    ui.colList.appendChild(row);
  });
  ui.colModal.style.display='flex';
}
function closeCols(){ ui.colModal.style.display='none'; }

// ресайзеры
function enableResizers(){
  document.querySelectorAll('th .resizer').forEach(handle=>{
    const th=handle.parentElement; const key=th.getAttribute('data-col');
    let startX,startW;
    handle.onmousedown=e=>{
      startX=e.clientX; startW=th.offsetWidth; th.classList.add('resizing');
      document.onmousemove=ev=>{
        const w=Math.max(60,startW+(ev.clientX-startX));
        th.style.width=w+'px'; S.widths[key]=th.style.width;
      };
      document.onmouseup=()=>{
        document.onmousemove=null; document.onmouseup=null;
        th.classList.remove('resizing');
        localStorage.setItem('widths_v1', JSON.stringify(S.widths));
      };
    };
  });
}

// ---- Picker (без изменений)
const PK={page:0,pageSize:50,query:'',total:0,selected:new Set(),loading:false};
function openPicker(){
  const modal=document.createElement('div'); modal.className='modal'; modal.style.display='flex';
  modal.innerHTML=`
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
          <thead><tr><th style="border-bottom:1px solid var(--line);padding:10px 12px;width:48px"><input type="checkbox" id="pickAll"></th><th style="border-bottom:1px solid var(--line);padding:10px 12px;width:80px">ID</th><th style="border-bottom:1px solid var(--line);padding:10px 12px">Название</th></tr></thead>
          <tbody id="pickRows"><tr><td colspan="3" class="muted" style="padding:10px 12px">Загрузка…</td></tr></tbody>
        </table>
      </div>
      <div class="card-f"><button class="btn" id="btnMore">Загрузить ещё</button><button class="btn" id="btnClose">Отмена</button><button class="btn primary" id="btnAttach">Добавить выбранные</button></div>
    </div>`;
  document.body.appendChild(modal);

  const q=modal.querySelector('#q'), pickRows=modal.querySelector('#pickRows'), pickAll=modal.querySelector('#pickAll');
  const btnSearch=modal.querySelector('#btnSearch'), btnReset=modal.querySelector('#btnReset');
  const btnMore=modal.querySelector('#btnMore'), btnClose=modal.querySelector('#btnClose'), btnAttach=modal.querySelector('#btnAttach');
  const info=modal.querySelector('#pgInfoPick');

  function loadPage(reset=false){
    if (PK.loading) return; PK.loading=true;
    if (reset){ PK.page=0; PK.total=0; pickRows.innerHTML='<tr><td colspan="3" class="muted" style="padding:10px 12px">Загрузка…</td></tr>'; }
    const start=PK.page*PK.pageSize; const filter=PK.query?{'%title':PK.query}:{};
    BX24.callMethod('crm.item.list',{entityTypeId:S.typeId,filter,order:{'id':'DESC'},select:['id','title'],start}, r=>{
      PK.loading=false;
      if (r.error()){ pickRows.innerHTML = `<tr><td colspan="3" class="err" style="padding:10px 12px">${r.error_description()}</td></tr>`; return; }
      const items=r.data().items||[];
      if (reset) pickRows.innerHTML='';
      if (!items.length && reset){ pickRows.innerHTML='<tr><td colspan="3" class="muted" style="padding:10px 12px">Ничего не найдено</td></tr>'; info.textContent=''; return; }
      items.forEach(it=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td style="border-bottom:1px solid var(--line);padding:10px 12px"><input type="checkbox" data-id="${it.id}"></td><td style="border-bottom:1px solid var(--line);padding:10px 12px">${it.id}</td><td style="border-bottom:1px solid var(--line);padding:10px 12px">${it.title||('#'+it.id)}</td>`;
        pickRows.appendChild(tr);
      });
      PK.total+=items.length; info.textContent='Показано: '+PK.total; PK.page++;
    });
  }

  pickAll.onchange=()=>{ pickRows.querySelectorAll('input[type="checkbox"][data-id]').forEach(ch=>{ ch.checked=pickAll.checked; const id=Number(ch.getAttribute('data-id')); if (ch.checked) PK.selected.add(id); else PK.selected.delete(id); }); };
  pickRows.addEventListener('change',e=>{ const t=e.target; if (t && t.matches('input[type="checkbox"][data-id]')){ const id=Number(t.getAttribute('data-id')); if (t.checked) PK.selected.add(id); else PK.selected.delete(id); } });
  btnMore.onclick=()=>loadPage(false);
  btnSearch.onclick=()=>{ PK.query=q.value.trim(); loadPage(true); };
  btnReset.onclick =()=>{ q.value=''; PK.query=''; loadPage(true); };
  btnClose.onclick =()=>{ modal.remove(); };
  btnAttach.onclick=()=>{ const ids=Array.from(PK.selected); if (ids.length) attach(ids); modal.remove(); };

  loadPage(true);
}

// ---- listeners
ui.ref.onclick = load;
ui.create.onclick = () => BX24.openPath(`/crm/type/${S.typeId}/details/0/`);
ui.pick.onclick = openPicker;
ui.colsBtn.onclick = openCols;
ui.colCancel.onclick = () => (ui.colModal.style.display='none');
ui.colApply.onclick = ()=>{
  const boxes=[...ui.colList.querySelectorAll('input[type="checkbox"]')];
  const list=boxes.filter(b=>b.checked).map(b=>b.id.replace('col_',''));
  if (!list.length) return;
  // никогда не убираем id/title/ass
  ['id','title','ass'].forEach(k=>{ if (!list.includes(k)) list.unshift(k); });
  S.cols = Array.from(new Set(list));
  localStorage.setItem('cols_v1', JSON.stringify(S.cols));
  ui.colModal.style.display='none'; render(); fit();
};
ui.pageSize.onchange = ()=>{ S.view.size=Number(ui.pageSize.value)||10; S.view.page=1; render(); fit(); };
ui.pgPrev.onclick = ()=>{ if (S.view.page>1){ S.view.page--; render(); fit(); } };
ui.pgNext.onclick = ()=>{ const pages=Math.max(1,Math.ceil(filteredAndSorted().length/S.view.size)); if (S.view.page<pages){ S.view.page++; render(); fit(); } };

// фильтры
[ui.fTitle, ui.fAss, ui.fStage, ui.fDeal, ui.fKey, ui.fUrl, ui.fTariff, ui.fProduct].forEach(inp => inp && inp.addEventListener('input', ()=>{
  S.filter = {
    title:(ui.fTitle?.value||'').toLowerCase(),
    ass:(ui.fAss?.value||'').toLowerCase(),
    stage:(ui.fStage?.value||'').toLowerCase(),
    deal:(ui.fDeal?.value||'').toLowerCase(),
    key:(ui.fKey?.value||'').toLowerCase(),
    url:(ui.fUrl?.value||'').toLowerCase(),
    tariff:(ui.fTariff?.value||'').toLowerCase(),
    product:(ui.fProduct?.value||'').toLowerCase(),
  };
  S.view.page=1; render(); fit();
}));

// сортировка
ui.head.addEventListener('click', e=>{
  const th=e.target.closest('th[data-col]'); if (!th || e.target.classList.contains('resizer')) return;
  const map={deal:'dealid',url:'url',tariff:'tariff',tEnd:'tEnd',mEnd:'mEnd',product:'product', id:'id', title:'title', ass:'ass', stage:'stage', act:'id'};
  const key=th.getAttribute('data-col'); const sortKey=map[key]||'id';
  S.view.sortKey===sortKey ? (S.view.sortDir=S.view.sortDir==='asc'?'desc':'asc') : (S.view.sortKey=sortKey,S.view.sortDir='asc');
  render(); fit();
});

// ресайзеры
enableResizers();
