// assets/app/main.js
import { $, A, J, pick, fmtDate, UF, enumText, idFromBinding, parseStage } from './utils.js';
import { DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID, F } from './config.js';

const defaultCols = ['id','title','ass','stage','deal','url','tariff','tEnd','mEnd','product','act'];

const S = {
  dealId:null,
  field:DEAL_FIELD_CODE,
  typeId:SMART_ENTITY_TYPE_ID,

  mode:'ids',
  bindings:[],
  ids:[],
  items:[],

  users:{},
  ufEnums:{},

  stagesByFull:{},
  stagesByCatStatus:{},
  catStages:{}, // { [cid]: [{id,name,sort,statusId,color}] }
  cats:{},      // { [cid]: {list,maxSort} }

  view:{page:1,size:10,sortKey:'id',sortDir:'asc'},
  filter:{title:'',ass:'',stage:'',deal:'',url:'',tariff:'',product:''},

  cols:(()=>{ let c=JSON.parse(localStorage.getItem('cols_v1')||'null')||defaultCols;
    ['id','title','ass'].forEach(k=>{ if(!c.includes(k)) c.unshift(k); });
    return Array.from(new Set(c));
  })(),
  widths:JSON.parse(localStorage.getItem('widths_v1')||'{}'),
};

const ui = {
  rows:$('#rows'),
  ref:$('#btnRefresh'),
  create:$('#btnCreate'),
  pick:$('#btnPick'),
  colsBtn:$('#btnCols'),
  pageSize:$('#pageSize'), pgPrev:$('#pgPrev'), pgNext:$('#pgNext'), pgInfo:$('#pgInfo'),
  fTitle:$('#fTitle'), fAss:$('#fAss'), fStage:$('#fStage'), fDeal:$('#fDeal'), fUrl:$('#fUrl'),
  fTariff:$('#fTariff'), fProduct:$('#fProduct'),
  head:document.querySelector('tr.head'), filters:document.querySelector('tr.filters'),
  colModal:$('#colModal'), colList:$('#colList'), colCancel:$('#colCancel'), colApply:$('#colApply'),
};

// ---- resize iframe
const fit = (()=>{ let raf; return ()=>{ if(!window.BX24) return;
  cancelAnimationFrame(raf); raf=requestAnimationFrame(()=>{
    const h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)+12;
    try{BX24.resizeWindow(h);}catch{}
  });
};})(); new ResizeObserver(()=>fit()).observe(document.body);

// ранний dealId из POST
(function(){ const boot=window.__BOOT__||{}; const pid=J(boot.placementOptions||'{}').ID||null; if(pid) S.dealId=Number(pid); })();

// BX init
BX24.init(()=>{
  if(!S.dealId){ const p=BX24.getParam('PLACEMENT_OPTIONS'); const pid=(J(p||'{}').ID)||null; if(pid) S.dealId=Number(pid); }
  let started=false; const start=()=>{ if(started||!S.dealId) return; started=true; load(); fit(); };
  BX24.placement.info(()=>start()); setTimeout(start,300); setTimeout(start,1500);
});

// helpers
function detectMode(raw){ const a=A(raw); return a.some(v=>typeof v==='string'&&v.startsWith('DYNAMIC_'))?'bindings':'ids'; }
function bcode(t,id){ return `DYNAMIC_${t}_${id}`; }
function saveBindings(next){ const f={}; f[S.field]=next;
  BX24.callMethod('crm.deal.update',{id:S.dealId,fields:f}, r=>{ if(r.error()) alert('Ошибка: '+r.error_description()); load(); });
}
function attach(ids){ if(S.mode==='bindings'){ const add=ids.map(id=>bcode(S.typeId,id)); saveBindings(Array.from(new Set([...(S.bindings||[]),...add]))); }
  else saveBindings(Array.from(new Set([...(A(S.bindings).map(Number)),...ids])));
}
function detach(id){ if(S.mode==='bindings'){ const code=bcode(S.typeId,id); saveBindings((S.bindings||[]).filter(c=>c!==code)); }
  else saveBindings(A(S.bindings).map(Number).filter(v=>v!==id));
}
const lighten=(hex,p=0.15)=>{ // hex -> lighter
  const m=hex?.match(/^#([0-9a-f]{6})$/i); if(!m) return '#a5b4fc';
  const n=parseInt(m[1],16), r=n>>16, g=(n>>8)&255, b=n&255;
  const lr=Math.min(255,Math.round(r+(255-r)*p)), lg=Math.min(255,Math.round(g+(255-g)*p)), lb=Math.min(255,Math.round(b+(255-b)*p));
  return `rgb(${lr}, ${lg}, ${lb})`;
};

// Кэш метаданных UF и карта соответствий UF_* -> ufCrm*
async function ensureUFMeta(){
  if (window.__UF_READY) return;
  await new Promise(res => {
    BX24.callMethod('crm.item.fields', { entityTypeId: S.typeId }, rr => {
      window.__UF_KEYMAP = {};                    // например: { 'UF_CRM_10_...': 'ufCrm10_...' }
      window.__UF_SELECT = [];                    // что подставлять в select
      if (!rr.error()){
        const fields = rr.data().fields || rr.data() || {};
        for (const key in fields){
          const meta = fields[key] || {};
          const upper = meta.upperName || key.toUpperCase();
          const isUf = upper.startsWith('UF_') || /^ufcrm/i.test(key);
          if (!isUf) continue;

          // карта: верхний регистр -> фактический ключ в item
          window.__UF_KEYMAP[upper] = key;

          // чтобы точно получить значения, просим Оба варианта
          window.__UF_SELECT.push(upper);
          if (!window.__UF_SELECT.includes(key)) window.__UF_SELECT.push(key);

          // из мета сразу соберём словари для enum
          if (meta.type === 'enumeration' && Array.isArray(meta.items)){
            S.ufEnums = S.ufEnums || {};
            S.ufEnums[upper] = {};
            meta.items.forEach(it => {
              const id = Number(it.ID);
              const val = String(it.VALUE || id);
              if (id) S.ufEnums[upper][id] = val;
            });
          }
        }
      }
      window.__UF_READY = true;
      res();
    });
  });
}

// LOAD
async function load(){
  if (!S.dealId){
    ui.rows.innerHTML = '<tr><td colspan="12" class="err">Нет ID сделки</td></tr>';
    return;
  }

  // 0) Метаданные UF и карта соответствий
  await ensureUFMeta();

  // 1) Определяем ids
  BX24.callMethod('crm.deal.get', { id: S.dealId }, r => {
    if (r.error()){
      ui.rows.innerHTML = `<tr><td colspan="12" class="err">${r.error_description()}</td></tr>`;
      return;
    }
    const raw = r.data()[S.field];
    S.mode = detectMode(raw);
    S.bindings = A(raw);
    S.ids = (S.mode === 'bindings')
      ? S.bindings.map(c => idFromBinding(c, S.typeId)).filter(Boolean)
      : A(raw).map(Number).filter(Boolean);

    if (!S.ids.length){
      ui.rows.innerHTML = '<tr><td colspan="12" class="muted">Пока нет связанных элементов</td></tr>';
      fit();
      return;
    }

    // 2) Явный select (базовые + оба варианта UF-ключей)
    const base = ['id','title','stageId','categoryId','assignedById'];
    const select = base
      .concat(window.__UF_SELECT || [])
      .filter((v, i, a) => a.indexOf(v) === i); // уникализируем

    BX24.callMethod('crm.item.list', {
      entityTypeId: S.typeId,
      filter: { '@id': S.ids },
      select
    }, async rr => {
      let items = [];
      if (!rr.error()) items = rr.data().items || [];

      S.items = items;

      // users + стадии (как было)
      await buildUsers(items);
      await buildStages(items);

      // 3) Если хотя бы у одного элемента UF пуст, дотягиваем crm.item.get
      const need = [
        F.dealIdSource, F.licenseKey, F.portalUrl,
        F.tariff, F.tariffEnd, F.marketEnd, F.product
      ];
      const empty = it => need.some(code => {
        const v = UF(it, code);
        return v === undefined || v === null || v === '';
      });

      if (S.items.some(empty)) {
        const calls = {};
        S.items.forEach((it, i) => calls['g' + i] = ['crm.item.get', { entityTypeId: S.typeId, id: it.id }]);
        await new Promise(res => BX24.callBatch(calls, rr2 => {
          for (const k in rr2){
            if (rr2[k].error()) continue;
            const full = rr2[k].data().item;
            const idx = S.items.findIndex(x => x.id === full.id);
            if (idx > -1) Object.assign(S.items[idx], full);
          }
          res();
        }, true));
      }

      render();
      fit();
    });
  });
}

// UF enums
async function buildUFEnums(){
  // userfield.list
  await new Promise(res=>{
    BX24.callMethod('crm.item.userfield.list',{entityTypeId:S.typeId}, rr=>{
      if(!rr.error()){
        const list=rr.data().userFields||rr.data()||[];
        list.forEach(f=>{
          const code=pick(f,'FIELD_NAME','fieldName'); const enums=pick(f,'LIST','list')||[];
          if(code && Array.isArray(enums) && enums.length){
            if(!S.ufEnums[code]) S.ufEnums[code]={};
            enums.forEach(e=>{ const id=String(pick(e,'ID','VALUE_ID')); const val=String(pick(e,'VALUE')||id); S.ufEnums[code][id]=val; });
          }
        });
      } res();
    });
  });
  // fields (items)
  await new Promise(res=>{
    BX24.callMethod('crm.item.fields',{entityTypeId:S.typeId}, rr=>{
      if(!rr.error()){
        const fields=rr.data()||{};
        [F.tariff,F.product].forEach(code=>{
          const items=fields[code]?.items || fields[code]?.ITEMS || [];
          if(Array.isArray(items)&&items.length){
            if(!S.ufEnums[code]) S.ufEnums[code]={};
            items.forEach(e=>{ S.ufEnums[code][String(e.ID)]=String(e.VALUE); });
          }
        });
      } res();
    });
  });
}

// Users (Фамилия Имя)
async function buildUsers(items){
  const ids=Array.from(new Set(items.map(i=>Number(i.assignedById)).filter(Boolean)));
  if(!ids.length) return;
  const calls={}; ids.forEach((uid,i)=>calls['u'+i]=['user.get',{ID:String(uid)}]);
  await new Promise(res=>BX24.callBatch(calls,r=>{
    for(const k in r){ if(r[k].error()) continue;
      const u=(r[k].data()||[])[0]||{}; const id=Number(pick(u,'ID')); if(!id) continue;
      const last=pick(u,'LAST_NAME')||''; const first=pick(u,'NAME')||''; // без отчества
      const name=(last+' '+first).trim() || pick(u,'LOGIN') || ('ID '+id);
      S.users[id]={name, path:'/company/personal/user/'+id+'/'};
    }
    res();
  }, true));
}

// Stages (цвет, фоллбек)
async function buildStages(items){
  const cats=Array.from(new Set(items.map(i=>Number(i.categoryId)).filter(Boolean)));
  if(!cats.length) return;

  const calls={}; cats.forEach((cid,i)=>calls['s'+i]=['crm.category.stage.list',{entityTypeId:S.typeId,categoryId:cid}]);
  S.stagesByFull={}; S.stagesByCatStatus={}; S.catStages={}; S.cats={};
  let ok=false;

  await new Promise(res=>BX24.callBatch(calls,r=>{
    for(const k in r){
      if(r[k].error()) continue; ok=true;
      let data=r[k].data(); let list=Array.isArray(data)?data:(data?.stages||data?.STAGES)||[];
      if(!Array.isArray(list) && data?.result) list=data.result.stages||data.result.STAGES||[];
      list.forEach(st=>{
        const statusId=String(pick(st,'statusId','STATUS_ID')||'');
        const name=String(pick(st,'name','NAME')||statusId);
        const sort=Number(pick(st,'sort','SORT')||0);
        const categoryId=Number(pick(st,'categoryId','CATEGORY_ID')||0);
        const color=String(pick(st,'color','COLOR')||'#a5b4fc');
        const fullId=String(pick(st,'id','ID') || (categoryId?`DT${S.typeId}_${categoryId}:${statusId}`:statusId));
        S.stagesByFull[fullId]={id:fullId,name,sort,categoryId,statusId,color};
        S.stagesByCatStatus[categoryId+':'+statusId]=S.stagesByFull[fullId];
        if(!S.catStages[categoryId]) S.catStages[categoryId]=[];
        if(!S.catStages[categoryId].some(x=>x.id===fullId))
          S.catStages[categoryId].push({id:fullId,name,sort,statusId,color});
      });
    }
    Object.keys(S.catStages).forEach(cid=>{
      const arr=S.catStages[cid].sort((a,b)=>a.sort-b.sort);
      S.cats[cid]={list:arr,maxSort:arr.length?Math.max(...arr.map(s=>s.sort)):100};
    });
    res();
  }, true));

  if(ok && Object.keys(S.stagesByFull).length) return;

  // фоллбек для старых порталов
  await Promise.all(cats.map(async cid=>{
    await new Promise(res=>{
      BX24.callMethod('crm.status.list',{filter:{ENTITY_ID:`DYNAMIC_${S.typeId}_STAGE_${cid}`}}, rr=>{
        if(!rr.error()){
          const list=rr.data()||[];
          list.forEach(st=>{
            const statusId=String(pick(st,'STATUS_ID','statusId')||'');
            const name=String(pick(st,'NAME','name')||statusId);
            const sort=Number(pick(st,'SORT','sort')||0);
            const color=String(pick(st,'COLOR','color')||'#a5b4fc');
            const fullId=`DT${S.typeId}_${cid}:${statusId}`;
            S.stagesByFull[fullId]={id:fullId,name,sort,categoryId:cid,statusId,color};
            S.stagesByCatStatus[cid+':'+statusId]=S.stagesByFull[fullId];
            if(!S.catStages[cid]) S.catStages[cid]=[];
            if(!S.catStages[cid].some(x=>x.id===fullId))
              S.catStages[cid].push({id:fullId,name,sort,statusId,color});
          });
          const arr=S.catStages[cid].sort((a,b)=>a.sort-b.sort);
          S.cats[cid]={list:arr,maxSort:arr.length?Math.max(...arr.map(s=>s.sort)):100};
        }
        res();
      });
    });
  }));
}

function getStageObject(item){
  const sid=item.stageId; const {categoryId,statusId}=parseStage(sid);
  return S.stagesByFull[sid] || S.stagesByCatStatus[(categoryId+':'+statusId)] || {id:sid,name:sid,sort:0,categoryId,color:'#a5b4fc'};
}

async function hydrateUFsIfEmpty(){
  const need = [
    F.dealIdSource, F.licenseKey, F.portalUrl,
    F.tariff, F.tariffEnd, F.marketEnd, F.product
  ];

  const isMissing = (it, code) => (it[code] === undefined || it[code] === null || it[code] === '');

  const mustHydrate = S.items.some(it => need.some(code => isMissing(it, code)));
  if (!mustHydrate) return;

  const calls = {};
  S.items.forEach((it, i) => calls['g' + i] = ['crm.item.get', { entityTypeId: S.typeId, id: it.id }]);

  await new Promise(res => BX24.callBatch(calls, rr => {
    for (const k in rr){
      if (rr[k].error()) continue;
      const full = rr[k].data().item;
      const idx = S.items.findIndex(x => x.id === full.id);
      if (idx > -1){
        // аккуратно мержим, чтобы подтянуть именно UF и прочее
        Object.assign(S.items[idx], full);
      }
    }
    res();
  }, true));
}

// stage UI
function stageUi(item){
  const st=getStageObject(item);
  const cid=Number(item.categoryId)||st.categoryId||0;
  const list=S.cats[cid]?.list||[];
  const curIdx=Math.max(0,list.findIndex(s=>s.id===st.id));
  const segW = list.length ? (100/list.length) : 100;

  const segs=list.map((s,i)=>{
    const base=i<=curIdx ? s.color||'#a5b4fc' : 'transparent';
    return `<i class="seg" data-idx="${i}" data-stage="${s.id}" title="${s.name}"
              style="left:${i*segW}%;width:${segW}%;background:${base}"></i>`;
  }).join('');

  return `
    <div class="stage" data-cid="${cid}" data-item="${item.id}">
      <div class="bar">${segs}</div>
      <span class="stageName">${st.name}</span>
    </div>
  `;
}

// filtered/sorted + render
function filteredAndSorted(){
  const f=S.filter;
  let arr=S.items.filter(it=>{
    const title=String(it.title||'').toLowerCase();
    const assId=Number(it.assignedById)||null;
    const ass=assId && S.users[assId] ? S.users[assId].name.toLowerCase() : '';
    const st=getStageObject(it).name.toLowerCase();
    const deal=String(UF(it,F.dealIdSource)||'').toLowerCase();
    const url =String(UF(it,F.portalUrl)||'').toLowerCase();
    const tariff=String(enumText(S.ufEnums,F.tariff,UF(it,F.tariff))||'').toLowerCase();
    const prod  =String(enumText(S.ufEnums,F.product,UF(it,F.product))||'').toLowerCase();

    return (!f.title||title.includes(f.title)) && (!f.ass||ass.includes(f.ass)) && (!f.stage||st.includes(f.stage))
      && (!f.deal||deal.includes(f.deal)) && (!f.url||url.includes(f.url)) && (!f.tariff||tariff.includes(f.tariff)) && (!f.product||prod.includes(f.product));
  });

  const dir=S.view.sortDir==='asc'?1:-1, key=S.view.sortKey;
  arr.sort((x,y)=>{
    const get=(k)=>{
      if(k==='id') return (Number(x.id)||0)-(Number(y.id)||0);
      if(k==='title') return String(x.title||'').localeCompare(String(y.title||''),'ru',{sensitivity:'base'});
      if(k==='ass'){
        const ax=S.users[Number(x.assignedById)]?.name||'', ay=S.users[Number(y.assignedById)]?.name||'';
        return ax.localeCompare(ay,'ru',{sensitivity:'base'});
      }
      if(k==='stage') return (getStageObject(x).sort||0)-(getStageObject(y).sort||0);
      if(k==='dealid') return String(UF(x,F.dealIdSource)||'').localeCompare(String(UF(y,F.dealIdSource)||''),'ru',{numeric:true});
      if(k==='url') return String(UF(x,F.portalUrl)||'').localeCompare(String(UF(y,F.portalUrl)||''),'ru',{sensitivity:'base'});
      if(k==='tariff') return String(enumText(S.ufEnums,F.tariff,UF(x,F.tariff))||'').localeCompare(String(enumText(S.ufEnums,F.tariff,UF(y,F.tariff))||''),'ru',{sensitivity:'base'});
      if(k==='tEnd') return String(UF(x,F.tariffEnd)||'').localeCompare(String(UF(y,F.tariffEnd)||''),'ru',{numeric:true});
      if(k==='mEnd') return String(UF(x,F.marketEnd)||'').localeCompare(String(UF(y,F.marketEnd)||''),'ru',{numeric:true});
      if(k==='product') return String(enumText(S.ufEnums,F.product,UF(x,F.product))||'').localeCompare(String(enumText(S.ufEnums,F.product,UF(y,F.product))||''),'ru',{sensitivity:'base'});
      return 0;
    };
    const v=get(key); return v===0 ? ((Number(x.id)||0)-(Number(y.id)||0))*dir : v*dir;
  });
  if(dir<0) arr.reverse();
  return arr;
}

function render(){
  // видимость колонок
  document.querySelectorAll('[data-col]').forEach(th=>{
    const key=th.getAttribute('data-col'); th.style.display=S.cols.includes(key)?'':'none';
    const w=S.widths[key]; if(w) th.style.width=w;
  });
  ui.filters.querySelectorAll('[data-col]').forEach(td=>{ const key=td.getAttribute('data-col'); td.style.display=S.cols.includes(key)?'':'none'; });

  const full=filteredAndSorted(); const total=full.length;
  const pages=Math.max(1,Math.ceil(total/S.view.size)); if(S.view.page>pages) S.view.page=pages;
  const start=(S.view.page-1)*S.view.size, slice=full.slice(start,start+S.view.size);

  ui.pgInfo.textContent=S.view.page+'/'+pages; ui.pgPrev.disabled=(S.view.page<=1); ui.pgNext.disabled=(S.view.page>=pages);

  if(!slice.length){ ui.rows.innerHTML='<tr><td colspan="12" class="muted">Ничего не найдено</td></tr>'; return; }

  ui.rows.innerHTML='';
  slice.forEach(it=>{
    const id=it.id, uid=Number(it.assignedById)||null, u=uid?S.users[uid]:null;
    const assHtml=u?`<a href="#" onclick="BX24.openPath('${u.path}');return false;">${u.name}</a>`:(uid?('ID '+uid):'—');

    const stage=stageUi(it);
    const deal = UF(it,F.dealIdSource) ?? '—';
    const urlR = UF(it,F.portalUrl) ?? '';
    const url  = urlR ? `<a href="${urlR}" target="_blank" rel="noopener">${urlR}</a>` : '—';
    const tariff = enumText(S.ufEnums,F.tariff, UF(it,F.tariff));
    const tEnd   = fmtDate(UF(it,F.tariffEnd));
    const mEnd   = fmtDate(UF(it,F.marketEnd));
    const prod   = enumText(S.ufEnums,F.product, UF(it,F.product));

    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td data-col="id">${id}</td>
      <td class="wrap-title" data-col="title"><a href="#" onclick="BX24.openPath('/crm/type/${S.typeId}/details/${id}/');return false;">${it.title||('#'+id)}</a></td>
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
      </td>`;
    tr.querySelectorAll('[data-col]').forEach(td=>{ const key=td.getAttribute('data-col'); td.style.display=S.cols.includes(key)?'':'none'; });
    ui.rows.appendChild(tr);
  });

  ui.rows.querySelectorAll('[data-open]').forEach(n=>n.onclick=()=>BX24.openPath(`/crm/type/${S.typeId}/details/${n.getAttribute('data-open')}/`));
  ui.rows.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>detach(Number(b.getAttribute('data-del'))));

  mountStageBars();
}

function mountStageBars(){
  ui.rows.querySelectorAll('.stage').forEach(box=>{
    const cid=Number(box.getAttribute('data-cid'));
    const itemId=Number(box.getAttribute('data-item'));
    const list=S.cats[cid]?.list||[];
    const nameEl=box.querySelector('.stageName');
    const segs=Array.from(box.querySelectorAll('.bar .seg'));
    const item=S.items.find(i=>i.id===itemId)||{};
    const curIdx=Math.max(0,list.findIndex(s=>s.id===item.stageId));

    const paint=(idx,hover=false)=>{
      segs.forEach((seg,i)=>{
        const st=list[i]; const base=i<=idx ? (hover?lighten(st.color):st.color) : 'transparent';
        seg.style.background=base;
      });
    };
    paint(curIdx,false);

    const bar=box.querySelector('.bar'); let overIdx=null;
    bar.addEventListener('mousemove',e=>{
      const rect=bar.getBoundingClientRect(); const w=rect.width||1;
      const idx=Math.max(0,Math.min(list.length-1,Math.floor((e.clientX-rect.left)/(w/list.length))));
      if(idx!==overIdx){ overIdx=idx; paint(idx,true); nameEl.textContent=list[idx]?.name||nameEl.textContent; }
    });
    bar.addEventListener('mouseleave',()=>{ overIdx=null; paint(curIdx,false); nameEl.textContent=list[curIdx]?.name||nameEl.textContent; });
    bar.addEventListener('click',()=>{
      const idx=overIdx!=null?overIdx:curIdx; const newStageId=list[idx]?.id; if(!newStageId) return;
      // критично: передаём и categoryId (на некоторых порталах иначе не примет)
      BX24.callMethod('crm.item.update',{entityTypeId:S.typeId,id:itemId,fields:{categoryId:item.categoryId,stageId:newStageId}}, r=>{
        if(r.error()){ alert('Ошибка смены стадии: '+r.error_description()); return; }
        const it=S.items.find(i=>i.id===itemId); if(it) it.stageId=newStageId;
        render();
      });
    });
  });
}

// модалка, ресайзеры, события
function openCols(){
  ui.colList.innerHTML='';
  const labels={id:'ID',title:'Название',ass:'Ответственный',stage:'Стадия',deal:'ID исходной сделки',url:'Адрес портала',tariff:'Текущий тариф',tEnd:'Окончание тарифа',mEnd:'Окончание подписки',product:'Продукт',act:'Действия'};
  defaultCols.forEach(k=>{
    const id='col_'+k; const row=document.createElement('label');
    row.innerHTML=`<input type="checkbox" id="${id}" ${S.cols.includes(k)?'checked':''}> ${labels[k]||k}`;
    ui.colList.appendChild(row);
  });
  ui.colModal.style.display='flex';
}
ui.colCancel.onclick=()=>ui.colModal.style.display='none';
ui.colApply.onclick=()=>{ const boxes=[...ui.colList.querySelectorAll('input[type="checkbox"]')];
  const list=boxes.filter(b=>b.checked).map(b=>b.id.replace('col_','')); if(!list.length) return;
  ['id','title','ass'].forEach(k=>{ if(!list.includes(k)) list.unshift(k); });
  S.cols=Array.from(new Set(list)); localStorage.setItem('cols_v1',JSON.stringify(S.cols));
  ui.colModal.style.display='none'; render(); fit();
};
function enableResizers(){
  document.querySelectorAll('th .resizer').forEach(handle=>{
    const th=handle.parentElement; const key=th.getAttribute('data-col'); let startX,startW;
    handle.onmousedown=e=>{ startX=e.clientX; startW=th.offsetWidth; th.classList.add('resizing');
      document.onmousemove=ev=>{ const w=Math.max(60,startW+(ev.clientX-startX)); th.style.width=w+'px'; S.widths[key]=th.style.width; };
      document.onmouseup=()=>{ document.onmousemove=null; document.onmouseup=null; th.classList.remove('resizing'); localStorage.setItem('widths_v1',JSON.stringify(S.widths)); };
    };
  });
}
enableResizers();

ui.ref.onclick=load;
ui.create.onclick=()=>BX24.openPath(`/crm/type/${S.typeId}/details/0/`);
ui.pick.onclick=()=>{ /* оставлен прежний пикер */ };

ui.colsBtn.onclick=openCols;

ui.pageSize.onchange=()=>{ S.view.size=Number(ui.pageSize.value)||10; S.view.page=1; render(); fit(); };
ui.pgPrev.onclick=()=>{ if(S.view.page>1){ S.view.page--; render(); fit(); } };
ui.pgNext.onclick=()=>{ const pages=Math.max(1,Math.ceil(filteredAndSorted().length/S.view.size)); if(S.view.page<pages){ S.view.page++; render(); fit(); } };

[ui.fTitle,ui.fAss,ui.fStage,ui.fDeal,ui.fUrl,ui.fTariff,ui.fProduct].forEach(inp=>inp&&inp.addEventListener('input',()=>{
  S.filter={
    title:(ui.fTitle?.value||'').toLowerCase(),
    ass:(ui.fAss?.value||'').toLowerCase(),
    stage:(ui.fStage?.value||'').toLowerCase(),
    deal:(ui.fDeal?.value||'').toLowerCase(),
    url:(ui.fUrl?.value||'').toLowerCase(),
    tariff:(ui.fTariff?.value||'').toLowerCase(),
    product:(ui.fProduct?.value||'').toLowerCase(),
  }; S.view.page=1; render(); fit();
}));

ui.head.addEventListener('click',e=>{
  const th=e.target.closest('th[data-col]'); if(!th || e.target.classList.contains('resizer')) return;
  const map={deal:'dealid',url:'url',tariff:'tariff',tEnd:'tEnd',mEnd:'mEnd',product:'product',id:'id',title:'title',ass:'ass',stage:'stage',act:'id'};
  const sortKey=map[th.getAttribute('data-col')]||'id';
  S.view.sortKey===sortKey ? (S.view.sortDir=S.view.sortDir==='asc'?'desc':'asc') : (S.view.sortKey=sortKey,S.view.sortDir='asc');
  render(); fit();
});
