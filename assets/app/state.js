// assets/app/state.js
import { CONFIG } from './config.js';
import { pick, A, parseStage } from './utils.js';
import { call, callBatch } from './api.js';

export const S = {
  dealId:null,
  field: CONFIG.DEAL_FIELD_CODE,
  typeId: CONFIG.SMART_ENTITY_TYPE_ID,
  mode:'ids',
  bindings:[],
  ids:[],
  items:[],
  users:{},
  ufEnums:{},
  stagesByFull:{},
  stagesByCatStatus:{},
  catStages:{},
  cats:{},
  view:{page:1,size:10,sortKey:'id',sortDir:'asc'},
  filter:{title:'',ass:'',stage:'',deal:'',key:'',url:'',tariff:'',product:''},
  cols: JSON.parse(localStorage.getItem('cols_v1')||'null')
      || ['stage','deal','key','url','tariff','tEnd','mEnd','product','act'],
  widths: JSON.parse(localStorage.getItem('widths_v1')||'{}'),
};

export function detectMode(raw){
  const a = A(raw);
  return a.some(v => typeof v==='string' && v.startsWith('DYNAMIC_')) ? 'bindings' : 'ids';
}

function toIdFromBinding(code,t){
  const m=String(code||'').match(/DYNAMIC_(\d+)_(\d+)/);
  return m && Number(m[1])===Number(t) ? Number(m[2]) : null;
}

// словари списков (Тариф, Продукт)
export async function buildUFEnums(){
  // 1) crm.item.userfield.list
  try{
    const data = await call('crm.item.userfield.list',{ entityTypeId:S.typeId });
    const list = data.userFields || data || [];
    list.forEach(f=>{
      const code = pick(f,'FIELD_NAME','fieldName');
      const enums = pick(f,'LIST','list') || [];
      if (code && Array.isArray(enums) && enums.length){
        S.ufEnums[code] = {};
        enums.forEach(e=>{
          const id  = Number(pick(e,'ID','VALUE_ID'));
          const val = String(pick(e,'VALUE') || id);
          if (id) S.ufEnums[code][id] = val;
        });
      }
    });
  }catch{}

  // 2) crm.item.fields — фолбэк
  try{
    const fields = await call('crm.item.fields',{ entityTypeId:S.typeId });
    [CONFIG.F.tariff, CONFIG.F.product].forEach(code=>{
      const items = (fields[code]?.items || fields[code]?.ITEMS || []);
      if (items && items.length){
        S.ufEnums[code] = S.ufEnums[code] || {};
        items.forEach(e=>{
          const id  = Number(e.ID);
          const val = String(e.VALUE||id);
          if (id) S.ufEnums[code][id] = val;
        });
      }
    });
  }catch{}
}

// пользователи (ответственные)
export async function buildUsers(items){
  const ids=Array.from(new Set(items.map(i=>Number(i.assignedById)).filter(Boolean)));
  if(!ids.length) return;
  const calls={}; ids.forEach((uid,i)=>calls['u'+i]=['user.get',{ID:String(uid)}]);
  const r = await callBatch(calls);
  for(const k in r){
    if(!r[k].error()){
      const raw=(r[k].data()||[])[0]||{};
      const id=Number(pick(raw,'ID')); if(!id) continue;
      const name=[pick(raw,'LAST_NAME'),pick(raw,'NAME'),pick(raw,'SECOND_NAME')].filter(Boolean).join(' ') || pick(raw,'LOGIN') || ('ID '+id);
      S.users[id]={name, path:'/company/personal/user/'+id+'/'};
    }
  }
}

// стадии
export async function buildStages(items){
  const cats = Array.from(new Set(items.map(i=>Number(i.categoryId)).filter(Boolean)));
  let anyOk = false;

  if (cats.length){
    const calls={};
    cats.forEach((cid,i)=> calls['s'+i]=['crm.category.stage.list',{entityTypeId:S.typeId,categoryId:cid}]);
    const r = await callBatch(calls);
    for(const k in r){
      if(!r[k].error()){
        anyOk = true;
        let data=r[k].data();
        let list=Array.isArray(data)?data:(data?.stages||data?.STAGES)||[];
        if(!Array.isArray(list) && data?.result) list = data.result.stages || data.result.STAGES || [];
        const cidFromList = Number(list[0]?.categoryId || list[0]?.CATEGORY_ID || cats[0] || 0);
        list.forEach(st=>{
          const statusId   = String(pick(st,'statusId','STATUS_ID')||'');
          const name       = String(pick(st,'name','NAME')||statusId);
          const sort       = Number(pick(st,'sort','SORT')||0);
          const categoryId = Number(pick(st,'categoryId','CATEGORY_ID')||cidFromList);
          const fullId     = String(pick(st,'id','ID') || (categoryId ? `DT${S.typeId}_${categoryId}:${statusId}` : statusId));
          S.stagesByFull[fullId]={id:fullId,name,sort,categoryId,statusId};
          S.stagesByCatStatus[categoryId+':'+statusId]=S.stagesByFull[fullId];
          if(!S.catStages[categoryId]) S.catStages[categoryId]=[];
          S.catStages[categoryId].push({id:fullId,name,sort,statusId});
        });
      }
    }
    Object.keys(S.catStages).forEach(cid=>{
      S.catStages[cid].sort((a,b)=>a.sort-b.sort);
      const max=S.catStages[cid].length?Math.max(...S.catStages[cid].map(s=>s.sort)):100;
      S.cats[cid]={maxSort:max||100};
    });
  }

  // фолбэк: crm.status.list
  if (!anyOk || !Object.keys(S.stagesByFull).length){
    const first = items[0] || {};
    let cid = Number(first.categoryId) || 0;
    if (!cid && first.stageId) cid = parseStage(first.stageId).categoryId || 0;
    if (!cid) return;

    const ENTITY_ID = `DYNAMIC_${S.typeId}_STAGE_${cid}`;
    try{
      const data = await call('crm.status.list',{ filter:{ ENTITY_ID } });
      const list = data || [];
      list.forEach(st=>{
        const statusId = String(pick(st,'STATUS_ID','statusId')||'');
        const name     = String(pick(st,'NAME','name')||statusId);
        const sort     = Number(pick(st,'SORT','sort')||0);
        const fullId   = `DT${S.typeId}_${cid}:${statusId}`;
        S.stagesByFull[fullId]={id:fullId,name,sort,categoryId:cid,statusId};
        S.stagesByCatStatus[cid+':'+statusId]=S.stagesByFull[fullId];
        if(!S.catStages[cid]) S.catStages[cid]=[];
        S.catStages[cid].push({id:fullId,name,sort,statusId});
      });
      S.catStages[cid].sort((a,b)=>a.sort-b.sort);
      const max=S.catStages[cid].length?Math.max(...S.catStages[cid].map(s=>s.sort)):100;
      S.cats[cid]={maxSort:max||100};
    }catch{}
  }
}

// главная загрузка
export async function loadDealAndItems(){
  if(!S.dealId) {
    document.getElementById('rows').innerHTML='<tr><td colspan="12" class="err">Нет ID сделки</td></tr>';
    return;
  }
  try{
    const deal = await call('crm.deal.get',{id:S.dealId});
    const raw = deal[S.field];
    S.mode = detectMode(raw);
    S.bindings = A(raw);
    S.ids = (S.mode==='bindings')
      ? S.bindings.map(c=>toIdFromBinding(c,S.typeId)).filter(Boolean)
      : A(raw).map(Number).filter(Boolean);

    if(!S.ids.length){ S.items=[]; return; }

    const select=['id','title','stageId','categoryId','assignedById',
      CONFIG.F.dealIdSource, CONFIG.F.licenseKey, CONFIG.F.portalUrl,
      CONFIG.F.tariff, CONFIG.F.tariffEnd, CONFIG.F.marketEnd, CONFIG.F.product];

    let items=[];
    try{
      const list = await call('crm.item.list',{entityTypeId:S.typeId,filter:{'@id':S.ids},select});
      items = list.items || [];
    }catch{
      const calls={}; S.ids.forEach((id,i)=>calls['g'+i]=['crm.item.get',{entityTypeId:S.typeId,id}]);
      const res = await callBatch(calls);
      for(const k in res){ if(!res[k].error()) items.push(res[k].data().item); }
    }
    S.items = items;

    await buildUFEnums();
    await buildUsers(items);
    await buildStages(items);
  }catch(e){
    document.getElementById('rows').innerHTML='<tr><td colspan="12" class="err">'+e.message+'</td></tr>';
  }
}
