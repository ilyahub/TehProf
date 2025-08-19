export default {
  async fetch(request) {
    // ====== НАСТРОЙКА ======
    const DEAL_FIELD_CODE = 'UF_CRM_1755533553'; // множественное поле связей в сделке
    const SMART_ENTITY_TYPE_ID = 1032;           // ваш ENTITY_TYPE_ID (SPA)
    const PORTAL_ORIGIN = 'https://tehprof.bitrix24.kz';

    // Поля смарт-процесса «Лицензии»
    const F = {
      dealIdSource: 'UF_CRM_10_1717328665682',   // ID исходной сделки (number)
      licenseKey:   'UF_CRM_10_1717328730625',   // Лицензионный ключ (string)
      portalUrl:    'UF_CRM_10_1717328814784',   // Адрес портала (link)
      tariff:       'UF_CRM_10_1717329015552',   // Текущий тариф (list)
      tariffEnd:    'UF_CRM_10_1717329087589',   // Дата окончания тарифа (date)
      marketEnd:    'UF_CRM_10_1717329109963',   // Дата окончания подписки (date)
      product:      'UF_CRM_10_1717329453779',   // Продукт (list)
    };
    // =======================

    // Снимем POST снапшот (ранний ID сделки пригодится если placement.info задержится)
    let placement = null, placementOptions = '';
    try {
      if (request.method !== 'GET') {
        const ct = (request.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
          const fd = await request.formData();
          placement        = fd.get('PLACEMENT') || null;
          placementOptions = fd.get('PLACEMENT_OPTIONS') || '';
        } else if (ct.includes('application/json')) {
          const j = await request.json();
          placement        = j.PLACEMENT || null;
          placementOptions = j.PLACEMENT_OPTIONS || '';
        }
      }
    } catch (_) {}

    // Подтягиваем Bitrix SDK и инлайнем
    let sdk = '';
    try { const r = await fetch('https://api.bitrix24.com/api/v1/'); sdk = await r.text(); }
    catch { sdk = "throw new Error('BX24 SDK fetch failed')"; }

    const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<title>Лицензии</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{
    --bg:#f5f7fb; --ink:#111827; --mut:#6b7280; --line:#e5e7eb; --red:#dc2626;
    --blue:#3bc8f5; --blue-h:#3eddff; --blue-a:#12b1e3;
  }
  *{box-sizing:border-box}
  body{margin:0;padding:24px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;background:var(--bg);color:var(--ink)}
  h1{margin:0 0 14px;font-size:36px;color:#60a5fa;font-weight:800}

  .toolbar{display:flex;gap:12px;align-items:center;margin:12px 0 10px;flex-wrap:wrap}
  .btn{padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;font-weight:700;transition:.12s}
  .btn.upper{text-transform:uppercase;letter-spacing:.3px}
  .btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
  .btn.primary:hover{background:var(--blue-h);border-color:var(--blue-h)}
  .btn.primary:active{background:var(--blue-a);border-color:var(--blue-a)}

  .table-wrap{max-height:70vh;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:14px}
  table{width:100%;border-collapse:separate;border-spacing:0;background:#fff}
  th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  th{background:#fafbff;color:#374151;text-align:left;font-weight:700;position:sticky;top:0;z-index:2;cursor:pointer}
  tr.filters th{background:#fff;position:sticky;top:40px;z-index:2;cursor:default}
  tr:last-child td{border-bottom:none}
  td.wrap{white-space:normal}

  th.col-id,td.col-id{width:70px}
  th.col-assignee,td.col-assignee{width:240px}
  th.col-stage,td.col-stage{width:420px}
  th.col-date,td.col-date{width:130px}
  th.col-actions,td.col-actions{width:180px}

  .stage{display:flex;align-items:center;gap:10px}
  .bar{position:relative;flex:0 0 160px;height:10px;border-radius:999px;background:#edeef3;overflow:hidden}
  .bar>i{position:absolute;left:0;top:0;bottom:0;background:#a5b4fc}
  .stageSel{padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;margin-left:10px}

  .filter{width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit}

  .muted{color:var(--mut)} .err{color:var(--red)}
</style>
</head><body>
  <h1>Лицензии</h1>

  <div class="toolbar">
    <button class="btn upper primary" id="btnCreate">Новый элемент</button>
    <button class="btn upper" id="btnPick">Выбрать элемент</button>
    <button class="btn" id="btnRefresh">Обновить</button>

    <span class="muted" style="margin-left:auto">Показывать по:</span>
    <select id="pageSize" class="btn" style="padding:6px 10px;margin-left:6px;">
      <option value="10" selected>10</option><option value="30">30</option><option value="50">50</option><option value="100">100</option>
    </select>
    <button class="btn" id="pgPrev">‹</button>
    <span id="pgInfo" class="muted">1/1</span>
    <button class="btn" id="pgNext">›</button>
  </div>

  <div class="table-wrap">
    <table id="tbl">
      <thead>
        <tr class="head">
          <th class="col-id" data-sort="id">ID</th>
          <th data-sort="title">Название</th>
          <th class="col-assignee" data-sort="ass">Ответственный</th>
          <th class="col-stage" data-sort="stage">Стадия</th>
          <th data-sort="dealid">ID исходной сделки</th>
          <th data-sort="key">Лицензионный ключ</th>
          <th data-sort="url">Адрес портала</th>
          <th data-sort="tariff">Текущий тариф</th>
          <th class="col-date" data-sort="tEnd">Окончание тарифа</th>
          <th class="col-date" data-sort="mEnd">Окончание подписки</th>
          <th data-sort="product">Продукт</th>
          <th class="col-actions">Действия</th>
        </tr>
        <tr class="filters">
          <th></th>
          <th><input class="filter" id="fTitle" placeholder="Фильтр по названию"></th>
          <th><input class="filter" id="fAss" placeholder="Фильтр по ответственному"></th>
          <th><input class="filter" id="fStage" placeholder="Фильтр по стадии"></th>
          <th><input class="filter" id="fDeal" placeholder="ID сделки"></th>
          <th><input class="filter" id="fKey" placeholder="Ключ"></th>
          <th><input class="filter" id="fUrl" placeholder="Портал"></th>
          <th><input class="filter" id="fTariff" placeholder="Тариф"></th>
          <th></th><th></th>
          <th><input class="filter" id="fProduct" placeholder="Продукт"></th>
          <th></th>
        </tr>
      </thead>
      <tbody id="rows"><tr><td colspan="12" class="muted">Загрузка…</td></tr></tbody>
    </table>
  </div>

  <!-- Пикер -->
  <div class="modal" id="picker" style="position:fixed;inset:0;background:rgba(17,24,39,.5);display:none;align-items:center;justify-content:center;z-index:9999">
    <div style="width:min(920px,95vw);max-height:85vh;background:#fff;border-radius:16px;border:1px solid var(--line);display:flex;flex-direction:column">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:center">
        <strong>Выбор элементов</strong>
        <input style="flex:1;border:1px solid var(--line);border-radius:10px;padding:10px 12px" id="q" placeholder="Поиск по названию…" />
        <button class="btn" id="btnSearch">Найти</button>
        <button class="btn" id="btnReset">Сброс</button>
        <span style="margin-left:auto" class="muted" id="pgInfoPick"></span>
      </div>
      <div style="padding:0;height:60vh;overflow:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th style="border-bottom:1px solid var(--line);padding:10px 12px;width:48px"><input type="checkbox" id="pickAll"></th><th style="border-bottom:1px solid var(--line);padding:10px 12px;width:80px">ID</th><th style="border-bottom:1px solid var(--line);padding:10px 12px">Название</th></tr></thead>
          <tbody id="pickRows"><tr><td colspan="3" class="muted" style="padding:10px 12px">Загрузка…</td></tr></tbody>
        </table>
      </div>
      <div style="padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end">
        <button class="btn" id="btnMore">Загрузить ещё</button>
        <button class="btn" id="btnClose">Отмена</button>
        <button class="btn primary" id="btnAttach">Добавить выбранные</button>
      </div>
    </div>
  </div>

  <script>window.__BOOT__ = ${JSON.stringify({ placement, placementOptions })};</script>
  <script>${sdk}</script>

  <script>
  // ===== helpers =====
  const $ = s => document.querySelector(s);
  const A = v => !v ? [] : (Array.isArray(v) ? v : [v]);
  const J = s => { try{return JSON.parse(s)}catch{return{} } };
  const pick = (obj, ...keys) => { if(!obj) return;
    for(const k of keys){ if(obj[k]!==undefined) return obj[k]; const U=String(k).toUpperCase(), L=String(k).toLowerCase(); if(obj[U]!==undefined) return obj[U]; if(obj[L]!==undefined) return obj[L]; }
  };
  const fmtDate = v => { if(!v) return '—'; const d=new Date(v); if(isNaN(d)) return '—';
    const z=n=>String(n).padStart(2,'0'); return z(d.getDate())+'.'+z(d.getMonth()+1)+'.'+d.getFullYear();
  };
  const bcode=(t,id)=>\`DYNAMIC_\${t}_\${id}\`;
  const toIdFromBinding=(code,t)=>{ const m=String(code||'').match(/DYNAMIC_(\\d+)_(\\d+)/); return m&&Number(m[1])==Number(t)?Number(m[2]):null; };
  const parseStage = sid => { const m=String(sid||'').match(/^DT(\\d+)_(\\d+):(.+)$/); return m?{typeId:Number(m[1]),categoryId:Number(m[2]),statusId:m[3]}:{typeId:null,categoryId:null,statusId:String(sid||'')}; };

  // ===== UI refs =====
  const ui = {
    rows:$('#rows'), ref:$('#btnRefresh'), create:$('#btnCreate'), pick:$('#btnPick'),
    pageSize:$('#pageSize'), pgPrev:$('#pgPrev'), pgNext:$('#pgNext'), pgInfo:$('#pgInfo'),
    fTitle:$('#fTitle'), fAss:$('#fAss'), fStage:$('#fStage'), fDeal:$('#fDeal'), fKey:$('#fKey'), fUrl:$('#fUrl'), fTariff:$('#fTariff'), fProduct:$('#fProduct'),
    head:document.querySelector('tr.head'),
    // picker
    picker:$('#picker'), q:$('#q'), btnSearch:$('#btnSearch'), btnReset:$('#btnReset'),
    pickRows:$('#pickRows'), pickAll:$('#pickAll'), btnMore:$('#btnMore'), btnClose:$('#btnClose'), btnAttach:$('#btnAttach'), pgInfoPick:$('#pgInfoPick')
  };

  // ===== state =====
  const S={
    dealId:null, field:'${DEAL_FIELD_CODE}', typeId:${SMART_ENTITY_TYPE_ID}, mode:'ids',
    bindings:[], ids:[], items:[], users:{},
    // UF dictionaries (lists)
    ufEnums:{},        // by FIELD_NAME: { valueId -> text }
    // stages dictionaries
    stagesByFull:{}, stagesByCatStatus:{}, catStages:{}, cats:{},
    view:{page:1,size:10,sortKey:'id',sortDir:'asc'},
    filter:{title:'',ass:'',stage:'',deal:'',key:'',url:'',tariff:'',product:''},
    // picker
    pk:{ page:0, pageSize:50, query:'', totalShown:0, selected:new Set(), loading:false }
  };

  // авто-подгон высоты
  const fit = (()=>{let raf;return function(){ if(!window.BX24) return; cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{const h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)+12; try{BX24.resizeWindow(h);}catch(e){} }); };})();
  new ResizeObserver(()=>fit()).observe(document.body);

  // ранний dealId из POST
  (function fromPost(){
    const boot=window.__BOOT__||{}; const pid = J(boot.placementOptions||'{}').ID || null; if(pid) S.dealId=Number(pid);
  })();

  BX24.init(function(){
    if(!S.dealId){ const p=BX24.getParam('PLACEMENT_OPTIONS'); const pid=(J(p||'{}').ID)||null; if(pid) S.dealId=Number(pid); }
    let started=false; const start=()=>{ if(started||!S.dealId) return; started=true; load(); fit(); };
    BX24.placement.info(()=>start()); setTimeout(start,300); setTimeout(start,1500);
  });

  function detectMode(raw){ const a=A(raw); return a.some(v=>typeof v==='string' && v.startsWith('DYNAMIC_'))?'bindings':'ids'; }

  function load(){
    if(!S.dealId){ ui.rows.innerHTML='<tr><td colspan="12" class="err">Нет ID сделки</td></tr>'; return; }
    BX24.callMethod('crm.deal.get',{id:S.dealId}, r=>{
      if(r.error()){ ui.rows.innerHTML='<tr><td colspan="12" class="err">'+r.error_description()+'</td></tr>'; return; }
      const raw=r.data()[S.field];
      S.mode = detectMode(raw);
      S.bindings = A(raw);
      S.ids = (S.mode==='bindings') ? S.bindings.map(c=>toIdFromBinding(c,S.typeId)).filter(Boolean)
                                     : A(raw).map(Number).filter(Boolean);
      if(!S.ids.length){ ui.rows.innerHTML='<tr><td colspan="12" class="muted">Пока нет связанных элементов</td></tr>'; fit(); return; }

      fetchItems(S.ids, async items=>{
        S.items=items;
        await buildUFEnums();       // словари списков
        await buildUsers(items);    // ответственные
        await buildStages(items);   // стадии
        render(); fit();
      });
    });
  }

  function fetchItems(ids, cb){
    const select=['id','title','stageId','categoryId','assignedById',
                  '${F.dealIdSource}','${F.licenseKey}','${F.portalUrl}','${F.tariff}','${F.tariffEnd}','${F.marketEnd}','${F.product}'];
    BX24.callMethod('crm.item.list',{ entityTypeId:S.typeId, filter:{'@id':ids}, select }, r=>{
      if(!r.error()) return cb(r.data().items||[]);
      // fallback поштучно
      const calls={}; ids.forEach((id,i)=>calls['g'+i]=['crm.item.get',{entityTypeId:S.typeId,id}]);
      BX24.callBatch(calls, res=>{ const arr=[]; for(const k in res){ if(!res[k].error()) arr.push(res[k].data().item); } cb(arr); }, true);
    });
  }

  async function buildUFEnums(){
    // тянем все UF для типа — там будут перечисления
    await new Promise(res=>{
      BX24.callMethod('crm.item.userfield.list',{ entityTypeId:S.typeId }, rr=>{
        if(!rr.error()){
          const list=rr.data().userFields||rr.data()||[];
          list.forEach(f=>{
            const code = pick(f,'FIELD_NAME','FIELDname','fieldName');
            const enums = pick(f,'LIST','list') || [];
            if (code && Array.isArray(enums) && enums.length){
              S.ufEnums[code] = {};
              enums.forEach(e=>{
                const id = Number(pick(e,'ID','VALUE_ID'));
                const val = String(pick(e,'VALUE','VALUE_ENUM') || id);
                if (id) S.ufEnums[code][id] = val;
              });
            }
          });
        }
        res();
      });
    });
  }

  async function buildUsers(items){
    const ids=Array.from(new Set(items.map(i=>Number(i.assignedById)).filter(Boolean)));
    if(!ids.length) return;
    const calls={}; ids.forEach((uid,i)=>calls['u'+i]=['user.get',{ID:String(uid)}]);
    await new Promise(res=>BX24.callBatch(calls, r=>{
      for(const k in r){
        if(!r[k].error()){
          const raw=(r[k].data()||[])[0]||{};
          const id=Number(pick(raw,'ID')); if(!id) continue;
          const name=[pick(raw,'LAST_NAME'),pick(raw,'NAME'),pick(raw,'SECOND_NAME')].filter(Boolean).join(' ') || pick(raw,'LOGIN') || ('ID '+id);
          S.users[id]={name, path:'/company/personal/user/'+id+'/'};
        }
      }
      res();
    },true));
  }

  async function buildStages(items){
    const cats=Array.from(new Set(items.map(i=>Number(i.categoryId)).filter(Boolean)));
    if(!cats.length) return;
    const calls={}; cats.forEach((cid,i)=>calls['s'+i]=['crm.category.stage.list',{entityTypeId:S.typeId,categoryId:cid}]);
    await new Promise(res=>BX24.callBatch(calls, r=>{
      for(const k in r){
        if(!r[k].error()){
          let data=r[k].data(); let list=Array.isArray(data)?data:(data?.stages||data?.STAGES)||[];
          if(!Array.isArray(list) && data?.result) list = data.result.stages || data.result.STAGES || [];
          list.forEach(st=>{
            const statusId   = String(pick(st,'statusId','STATUS_ID')||'');
            const name       = String(pick(st,'name','NAME')||statusId);
            const sort       = Number(pick(st,'sort','SORT')||0);
            const categoryId = Number(pick(st,'categoryId','CATEGORY_ID')||0);
            const fullId     = String(pick(st,'id','ID') || (categoryId ? \`DT\${S.typeId}_\${categoryId}:\${statusId}\` : statusId));
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
      res();
    },true));
  }

  function getStageObject(item){
    const sid=item.stageId; const {categoryId,statusId}=parseStage(sid);
    return S.stagesByFull[sid] || S.stagesByCatStatus[(categoryId+':'+statusId)] || {id:sid,name:sid,sort:0,categoryId};
  }
  function stageUi(item){
    const st=getStageObject(item); const cid=Number(item.categoryId)||st.categoryId||0;
    const max=S.cats[cid]?.maxSort||100;
    const pct=Math.max(0,Math.min(100,Math.round(((st.sort||0)/max)*100)));
    const list=S.catStages[cid]||[];
    const opts=list.map(s=>\`<option value="\${s.id}" \${s.id===st.id?'selected':''}>\${s.name}</option>\`).join('');
    return \`<div class="stage"><div class="bar"><i style="width:\${pct}%"></i></div><span>\${st.name}</span><select class="stageSel" data-item="\${item.id}" data-cur="\${st.id}">\${opts}</select></div>\`;
  }
  const enumText=(code,val)=>{ if(!val) return '—'; const dict=S.ufEnums[code]||{}; return dict[val] || val; };

  function filteredAndSorted(){
    const f=S.filter;
    let arr=S.items.filter(it=>{
      const title=String(it.title||'').toLowerCase();
      const uid=Number(it.assignedById)||null; const ass=uid&&S.users[uid]?S.users[uid].name.toLowerCase():'';
      const st=getStageObject(it).name.toLowerCase();
      const deal=String(it['${F.dealIdSource}']||'').toLowerCase();
      const key=String(it['${F.licenseKey}']||'').toLowerCase();
      const url=String(it['${F.portalUrl}']||'').toLowerCase();
      const tariff=String(enumText('${F.tariff}', it['${F.tariff}'])||'').toLowerCase();
      const prod=String(enumText('${F.product}', it['${F.product}'])||'').toLowerCase();

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
        if(k==='id') return (Number(x.id)||0)-(Number(y.id)||0);
        if(k==='title') return String(x.title||'').localeCompare(String(y.title||''),'ru',{sensitivity:'base'});
        if(k==='ass'){ const ax=S.users[Number(x.assignedById)]?.name||'', ay=S.users[Number(y.assignedById)]?.name||''; return ax.localeCompare(ay,'ru',{sensitivity:'base'}); }
        if(k==='stage') return (getStageObject(x).sort||0)-(getStageObject(y).sort||0);
        if(k==='dealid') return String(x['${F.dealIdSource}']||'').localeCompare(String(y['${F.dealIdSource}']||''),'ru',{numeric:true});
        if(k==='key') return String(x['${F.licenseKey}']||'').localeCompare(String(y['${F.licenseKey}']||''),'ru',{sensitivity:'base'});
        if(k==='url') return String(x['${F.portalUrl}']||'').localeCompare(String(y['${F.portalUrl}']||''),'ru',{sensitivity:'base'});
        if(k==='tariff') return String(enumText('${F.tariff}',x['${F.tariff}'])||'').localeCompare(String(enumText('${F.tariff}',y['${F.tariff}'])||''),'ru',{sensitivity:'base'});
        if(k==='tEnd') return String(x['${F.tariffEnd}']||'').localeCompare(String(y['${F.tariffEnd}']||''),'ru',{numeric:true});
        if(k==='mEnd') return String(x['${F.marketEnd}']||'').localeCompare(String(y['${F.marketEnd}']||''),'ru',{numeric:true});
        if(k==='product') return String(enumText('${F.product}',x['${F.product}'])||'').localeCompare(String(enumText('${F.product}',y['${F.product}'])||''),'ru',{sensitivity:'base'});
        return 0;
      };
      const v=get(key); return v===0 ? ((Number(x.id)||0)-(Number(y.id)||0))*dir : v*dir;
    });
    if(dir<0) arr.reverse();
    return arr;
  }

  function render(){
    const full=filteredAndSorted(), total=full.length;
    const pages=Math.max(1,Math.ceil(total/S.view.size));
    if(S.view.page>pages) S.view.page=pages;
    const start=(S.view.page-1)*S.view.size, slice=full.slice(start,start+S.view.size);

    ui.pgInfo.textContent=S.view.page+'/'+pages;
    ui.pgPrev.disabled=(S.view.page<=1); ui.pgNext.disabled=(S.view.page>=pages);

    if(!slice.length){ ui.rows.innerHTML='<tr><td colspan="12" class="muted">Ничего не найдено</td></tr>'; return; }
    ui.rows.innerHTML='';
    slice.forEach(it=>{
      const id=it.id, title=it.title||('#'+id);
      const uid=Number(it.assignedById)||null, u=uid?S.users[uid]:null;
      const assHtml=u? \`<a href="#" onclick="BX24.openPath('/company/personal/user/\${uid}/');return false;" class="link">\${u.name}</a>\` : (uid?('ID '+uid):'—');
      const stage=stageUi(it);
      const deal=it['${F.dealIdSource}'] ?? '—';
      const key = it['${F.licenseKey}'] ?? '—';
      const urlRaw = it['${F.portalUrl}'] ?? '';
      const url = urlRaw ? \`<a class="link" href="\${urlRaw}" target="_blank" rel="noopener">\${urlRaw}</a>\` : '—';
      const tariff = enumText('${F.tariff}', it['${F.tariff}']);
      const tEnd = fmtDate(it['${F.tariffEnd}']);
      const mEnd = fmtDate(it['${F.marketEnd}']);
      const product = enumText('${F.product}', it['${F.product}']);

      const tr=document.createElement('tr');
      tr.innerHTML=\`
        <td class="col-id">\${id}</td>
        <td class="wrap"><a href="#" onclick="BX24.openPath('/crm/type/${SMART_ENTITY_TYPE_ID}/details/\${id}/');return false;" class="link">\${title}</a></td>
        <td class="col-assignee">\${assHtml}</td>
        <td class="col-stage">\${stage}</td>
        <td>\${deal}</td>
        <td>\${key}</td>
        <td class="wrap">\${url}</td>
        <td>\${tariff}</td>
        <td class="col-date">\${tEnd}</td>
        <td class="col-date">\${mEnd}</td>
        <td>\${product}</td>
        <td class="col-actions">
          <button class="btn" data-open="\${id}">Открыть</button>
          <button class="btn" data-del="\${id}">Удалить</button>
        </td>\`;
      ui.rows.appendChild(tr);
    });

    // события
    ui.rows.querySelectorAll('[data-open]').forEach(n=>n.onclick=()=>BX24.openPath(\`/crm/type/${SMART_ENTITY_TYPE_ID}/details/\${n.getAttribute('data-open')}/\`));
    ui.rows.querySelectorAll('.stageSel').forEach(sel=>{
      sel.onchange=()=>{
        const newStageId=sel.value, itemId=Number(sel.getAttribute('data-item'));
        BX24.callMethod('crm.item.update',{entityTypeId:S.typeId,id:itemId,fields:{stageId:newStageId}}, r=>{
          if(r.error()){ alert('Ошибка смены стадии: '+r.error_description()); sel.value=sel.getAttribute('data-cur'); return; }
          const it=S.items.find(i=>i.id===itemId); if(it) it.stageId=newStageId; render();
        });
      };
    });
    ui.rows.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>detach(Number(b.getAttribute('data-del'))));
  }

  function save(next){
    const f={}; f[S.field]=next;
    BX24.callMethod('crm.deal.update',{id:S.dealId,fields:f}, r=>{ if(r.error()){ alert('Ошибка: '+r.error_description()); } load(); });
  }
  function attach(ids){
    if(S.mode==='bindings'){ const add=ids.map(id=>bcode(S.typeId,id)); save(Array.from(new Set([...(S.bindings||[]),...add]))); }
    else { save(Array.from(new Set([...(A(S.bindings).map(Number)),...ids]))); }
  }
  function detach(id){
    if(S.mode==='bindings'){ const code=bcode(S.typeId,id); save((S.bindings||[]).filter(c=>c!==code)); }
    else { save(A(S.bindings).map(Number).filter(v=>v!==id)); }
  }

  // ==== ПИКЕР ====
  function openPicker(){ ui.picker.style.display='flex'; S.pk.page=0; S.pk.totalShown=0; S.pk.selected=new Set(); ui.pickAll.checked=false; ui.pgInfoPick.textContent=''; loadPickerPage(true); }
  function closePicker(){ ui.picker.style.display='none'; }
  function loadPickerPage(reset=false){
    if(S.pk.loading) return; S.pk.loading=true;
    if(reset){ S.pk.page=0; S.pk.totalShown=0; ui.pickRows.innerHTML='<tr><td colspan="3" class="muted" style="padding:10px 12px">Загрузка…</td></tr>'; }
    const start=S.pk.page*S.pk.pageSize; const filter=S.pk.query?{'%title':S.pk.query}:{};
    BX24.callMethod('crm.item.list',{entityTypeId:S.typeId,filter,order:{'id':'DESC'},select:['id','title'],start}, r=>{
      S.pk.loading=false;
      if(r.error()){ ui.pickRows.innerHTML='<tr><td colspan="3" class="err" style="padding:10px 12px">'+r.error_description()+'</td></tr>'; return; }
      const items=r.data().items||[]; if(reset) ui.pickRows.innerHTML='';
      if(!items.length && reset){ ui.pickRows.innerHTML='<tr><td colspan="3" class="muted" style="padding:10px 12px">Ничего не найдено</td></tr>'; ui.pgInfoPick.textContent=''; return; }
      items.forEach(it=>{
        const tr=document.createElement('tr');
        tr.innerHTML=\`<td style="border-bottom:1px solid var(--line);padding:10px 12px"><input type="checkbox" data-id="\${it.id}"></td><td style="border-bottom:1px solid var(--line);padding:10px 12px">\${it.id}</td><td style="border-bottom:1px solid var(--line);padding:10px 12px">\${it.title||('#'+it.id)}</td>\`;
        ui.pickRows.appendChild(tr);
      });
      S.pk.totalShown+=items.length; ui.pgInfoPick.textContent='Показано: '+S.pk.totalShown; S.pk.page++;
    });
  }
  ui.pickAll.onchange=()=>{ ui.pickRows.querySelectorAll('input[type="checkbox"][data-id]').forEach(ch=>{ ch.checked=ui.pickAll.checked; const id=Number(ch.getAttribute('data-id')); if(ch.checked) S.pk.selected.add(id); else S.pk.selected.delete(id); });};
  ui.pickRows.addEventListener('change',e=>{const t=e.target;if(t&&t.matches('input[type="checkbox"][data-id]')){const id=Number(t.getAttribute('data-id')); if(t.checked) S.pk.selected.add(id); else S.pk.selected.delete(id);}});
  ui.btnMore.onclick=()=>loadPickerPage(false);
  ui.btnSearch.onclick=()=>{ S.pk.query=ui.q.value.trim(); openPicker(); };
  ui.btnReset.onclick=()=>{ ui.q.value=''; S.pk.query=''; openPicker(); };
  ui.btnClose.onclick=()=>closePicker();
  ui.btnAttach.onclick=()=>{ const ids=Array.from(S.pk.selected); if(ids.length) attach(ids); closePicker(); };

  // ==== КНОПКИ/ПАГИНАЦИЯ/ФИЛЬТР/СОРТ ====
  ui.ref.onclick=load;
  ui.create.onclick=()=>{ BX24.openPath('/crm/type/${SMART_ENTITY_TYPE_ID}/details/0/'); };
  ui.pick.onclick=()=>openPicker();

  ui.pageSize.onchange=()=>{ S.view.size=Number(ui.pageSize.value)||10; S.view.page=1; render(); fit(); };
  ui.pgPrev.onclick=()=>{ if(S.view.page>1){ S.view.page--; render(); fit(); } };
  ui.pgNext.onclick=()=>{ const pages=Math.max(1,Math.ceil(filteredAndSorted().length/S.view.size)); if(S.view.page<pages){ S.view.page++; render(); fit(); } };

  [ui.fTitle,ui.fAss,ui.fStage,ui.fDeal,ui.fKey,ui.fUrl,ui.fTariff,ui.fProduct].forEach(inp=>inp.addEventListener('input',()=>{
    S.filter={ title:ui.fTitle.value.toLowerCase(), ass:ui.fAss.value.toLowerCase(), stage:ui.fStage.value.toLowerCase(), deal:ui.fDeal.value.toLowerCase(), key:ui.fKey.value.toLowerCase(), url:ui.fUrl.value.toLowerCase(), tariff:ui.fTariff.value.toLowerCase(), product:ui.fProduct.value.toLowerCase() };
    S.view.page=1; render(); fit();
  }));
  ui.head.addEventListener('click',e=>{ const th=e.target.closest('[data-sort]'); if(!th) return;
    const key=th.dataset.sort; S.view.sortKey===key ? (S.view.sortDir=S.view.sortDir==='asc'?'desc':'asc') : (S.view.sortKey=key,S.view.sortDir='asc'); render(); fit(); });
  </script>
</body></html>`;

    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'self' data: blob:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src *; " +
          "frame-ancestors " + PORTAL_ORIGIN + " https://*.bitrix24.kz"
      }
    });
  }
};
