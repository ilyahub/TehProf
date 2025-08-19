export default {
  async fetch(request) {
    // ========= НАСТРОЙКА =========
    const DEAL_FIELD_CODE = 'UF_CRM_1755533553'; // множественное поле в сделке (ID или DYNAMIC_1032_x)
    const SMART_ENTITY_TYPE_ID = 1032;          // ID вашего смарт-процесса
    const PORTAL_ORIGIN = 'https://tehprof.bitrix24.kz';

    // UF-поля смарт-процесса «Лицензии»
    const F = {
      dealIdSource: 'UF_CRM_10_1717328665682', // ID исходной сделки (number)
      licenseKey  : 'UF_CRM_10_1717328730625', // Лицензионный ключ (string)
      portalUrl   : 'UF_CRM_10_1717328814784', // Адрес портала (url)
      tariff      : 'UF_CRM_10_1717329015552', // Текущий тариф (list)
      tariffEnd   : 'UF_CRM_10_1717329087589', // Дата окончания тарифа (date)
      marketEnd   : 'UF_CRM_10_1717329109963', // Дата окончания подписки (date)
      product     : 'UF_CRM_10_1717329453779', // Продукт (list)
    };

    // пробуем подгрузить bx24.js из корня сайта (если вы его выложили)
    let sdk = '';
    try {
      const base = new URL(request.url).origin;
      const r = await fetch(base + '/bx24.js', { cf: { cacheEverything: true } });
      if (r.ok) sdk = await r.text();
    } catch (e) {}
    if (!sdk) {
      // минимальный «страховочный» шым: если BX24 не подложен порталом
      sdk = `
        if (typeof BX24 === 'undefined') {
          if (parent && parent.BX24) { window.BX24 = parent.BX24; }
          else { throw new Error('BX24 SDK not found: положите bx24.js рядом со страницей или открывайте виджет внутри Bitrix24.'); }
        }
      `;
    }

    // ранний снимок POST для PLACEMENT_OPTIONS (достанем ID сделки до init)
    let placement = null, placementOptions = '';
    try {
      if (request.method !== 'GET') {
        const ct = (request.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('form')) {
          const fd = await request.formData();
          placement        = fd.get('PLACEMENT') || null;
          placementOptions = fd.get('PLACEMENT_OPTIONS') || '';
        } else if (ct.includes('json')) {
          const j = await request.json();
          placement        = j.PLACEMENT || null;
          placementOptions = j.PLACEMENT_OPTIONS || '';
        }
      }
    } catch {}

    const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<title>Лицензии</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{
    --bg:#f5f7fb; --ink:#111827; --mut:#6b7280; --line:#e5e7eb;
    --blue:#3bc8f5; --blue-h:#3eddff; --blue-a:#12b1e3;
  }
  *{box-sizing:border-box}
  body{margin:0;padding:20px 22px;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial;
       background:var(--bg);color:var(--ink)}
  h1{margin:0 0 14px;font-size:38px;color:#60a5fa;font-weight:800}

  .toolbar{display:flex;gap:10px;align-items:center;margin:10px 0 12px;flex-wrap:wrap}
  .btn{padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;font-weight:700;transition:.12s}
  .btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
  .btn.primary:hover{background:var(--blue-h);border-color:var(--blue-h)}
  .btn.primary:active{background:var(--blue-a);border-color:var(--blue-a)}

  /* таблица на ВСЮ страницу с вертикальным скроллом */
  .table-wrap{height:calc(100vh - 170px);min-height:420px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:14px}
  table{width:100%;border-collapse:separate;border-spacing:0}
  th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  th{background:#fafbff;color:#374151;text-align:left;font-weight:700;position:sticky;top:0;z-index:2}
  tr.filters th{background:#fff;position:sticky;top:42px;z-index:2}
  tr:last-child td{border-bottom:none}

  /* Ручка для изменения ширины колонок */
  th{position:sticky}
  th .resizer{position:absolute;right:0;top:0;width:6px;height:100%;cursor:col-resize;user-select:none}
  th.resizing{border-right:2px solid #93c5fd}

  .filter{width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit}

  .stage{display:flex;align-items:center;gap:10px}
  .bar{position:relative;flex:0 0 160px;height:10px;border-radius:999px;background:#edeef3;overflow:hidden}
  .bar>i{position:absolute;left:0;top:0;bottom:0;background:#a5b4fc}
  .stageSel{padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;margin-left:10px}

  .muted{color:var(--mut)} .err{color:#dc2626}

  /* модал выбора колонок */
  .modal{position:fixed;inset:0;background:rgba(17,24,39,.5);display:none;align-items:center;justify-content:center;z-index:9999}
  .card{width:min(640px,95vw);max-height:85vh;background:#fff;border-radius:16px;border:1px solid var(--line);display:flex;flex-direction:column}
  .card-h{padding:14px 16px;border-bottom:1px solid var(--line);font-weight:700}
  .card-b{padding:14px 16px;overflow:auto}
  .card-f{padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end}
  .cols{columns:2 280px}
  .cols label{display:flex;align-items:center;gap:8px;padding:6px 4px}
</style>
</head><body>
  <h1>Лицензии</h1>

  <div class="toolbar">
    <button class="btn primary" id="btnCreate">Новый элемент</button>
    <button class="btn" id="btnPick">Выбрать элемент</button>
    <button class="btn" id="btnRefresh">Обновить</button>
    <button class="btn" id="btnCols">Колонки</button>

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
          <th data-col="stage">Стадия<div class="resizer"></div></th>
          <th data-col="deal">ID исходной сделки<div class="resizer"></div></th>
          <th data-col="key">Лицензионный ключ<div class="resizer"></div></th>
          <th data-col="url">Адрес портала<div class="resizer"></div></th>
          <th data-col="tariff">Текущий тариф<div class="resizer"></div></th>
          <th data-col="tEnd">Окончание тарифа<div class="resizer"></div></th>
          <th data-col="mEnd">Окончание подписки<div class="resizer"></div></th>
          <th data-col="product">Продукт<div class="resizer"></div></th>
          <th data-col="act">Действия<div class="resizer"></div></th>

          <!-- скрытые по умолчанию (можно включить в «Колонках») -->
          <th data-col="id" style="display:none">ID<div class="resizer"></div></th>
          <th data-col="title" style="display:none">Название<div class="resizer"></div></th>
          <th data-col="ass" style="display:none">Ответственный<div class="resizer"></div></th>
        </tr>

        <tr class="filters">
          <th data-col="stage"><input class="filter" id="fStage" placeholder="Фильтр по стадии"></th>
          <th data-col="deal"><input class="filter" id="fDeal" placeholder="ID сделки"></th>
          <th data-col="key"><input class="filter" id="fKey" placeholder="Ключ"></th>
          <th data-col="url"><input class="filter" id="fUrl" placeholder="Портал"></th>
          <th data-col="tariff"><input class="filter" id="fTariff" placeholder="Тариф"></th>
          <th data-col="tEnd"></th>
          <th data-col="mEnd"></th>
          <th data-col="product"><input class="filter" id="fProduct" placeholder="Продукт"></th>
          <th data-col="act"></th>

          <!-- места для скрытых по умолчанию -->
          <th data-col="id" style="display:none"></th>
          <th data-col="title" style="display:none"><input class="filter" id="fTitle" style="display:none"></th>
          <th data-col="ass" style="display:none"><input class="filter" id="fAss" style="display:none"></th>
        </tr>
      </thead>
      <tbody id="rows"><tr><td colspan="12" class="muted">Загрузка…</td></tr></tbody>
    </table>
  </div>

  <!-- Модал «Колонки» -->
  <div class="modal" id="colModal">
    <div class="card">
      <div class="card-h">Какие столбцы показывать</div>
      <div class="card-b">
        <div class="cols" id="colList"></div>
      </div>
      <div class="card-f">
        <button class="btn" id="colCancel">Отмена</button>
        <button class="btn primary" id="colApply">Применить</button>
      </div>
    </div>
  </div>

  <script>window.__BOOT__ = ${JSON.stringify({ placement, placementOptions, F })};</script>
  <script>${sdk}</script>
  <script>
  // ===== helpers
  const $ = s => document.querySelector(s);
  const A = v => !v ? [] : (Array.isArray(v) ? v : [v]);
  const J = s => { try{return JSON.parse(s)}catch{return{} } };
  const fmtDate=v=>{ if(!v) return '—'; const d=new Date(v); if(isNaN(d)) return '—';
    const z=n=>String(n).padStart(2,'0'); return z(d.getDate())+'.'+z(d.getMonth()+1)+'.'+d.getFullYear(); };
  const pick=(o,...ks)=>{ if(!o) return; for(const k of ks){ if(o[k]!==undefined) return o[k];
    const K=String(k).toUpperCase(), L=String(k).toLowerCase();
    if(o[K]!==undefined) return o[K]; if(o[L]!==undefined) return o[L]; } };

  const bcode=(t,id)=>\`DYNAMIC_\${t}_\${id}\`;
  const toIdFromBinding=(code,t)=>{ const m=String(code||'').match(/DYNAMIC_(\\d+)_(\\d+)/); return m&&Number(m[1])==Number(t)?Number(m[2]):null; };
  const parseStage=sid=>{ const m=String(sid||'').match(/^DT(\\d+)_(\\d+):(.+)$/); return m?{typeId:Number(m[1]),categoryId:Number(m[2]),statusId:m[3]}:{typeId:null,categoryId:null,statusId:String(sid||'')}; };

  // Универсальный геттер UF-поля
  function UF(item, code){
    if(!item||!code) return undefined;
    if(item[code]!==undefined) return item[code];
    const lc = code.toLowerCase();
    for(const k in item){ if(k.toLowerCase()===lc) return item[k]; }
    const f=item.fields||item.FIELDS||{};
    if(f[code]!==undefined) return f[code];
    for(const k in f){ if(k.toLowerCase()===lc) return f[k]; }
    return undefined;
  }

  // ===== UI refs
  const ui = {
    rows:$('#rows'), ref:$('#btnRefresh'), create:$('#btnCreate'), pick:$('#btnPick'), colsBtn:$('#btnCols'),
    pageSize:$('#pageSize'), pgPrev:$('#pgPrev'), pgNext:$('#pgNext'), pgInfo:$('#pgInfo'),
    fTitle:$('#fTitle'), fAss:$('#fAss'), fStage:$('#fStage'), fDeal:$('#fDeal'), fKey:$('#fKey'), fUrl:$('#fUrl'), fTariff:$('#fTariff'), fProduct:$('#fProduct'),
    head:document.querySelector('tr.head'), filters:document.querySelector('tr.filters'),
    colModal:$('#colModal'), colList:$('#colList'), colCancel:$('#colCancel'), colApply:$('#colApply'),
  };

  // ===== state
  const S = {
    dealId:null, field:'${DEAL_FIELD_CODE}', typeId:${SMART_ENTITY_TYPE_ID},
    mode:'ids', bindings:[], ids:[], items:[], users:{},
    ufEnums:{}, stagesByFull:{}, stagesByCatStatus:{}, catStages:{}, cats:{},
    view:{page:1,size:10,sortKey:'id',sortDir:'asc'},
    filter:{title:'',ass:'',stage:'',deal:'',key:'',url:'',tariff:'',product:''},
    // по умолчанию выводим ТОЛЬКО нужные колонки
    cols: JSON.parse(localStorage.getItem('cols_v1')||'null')
      || ['stage','deal','key','url','tariff','tEnd','mEnd','product','act'],
    widths: JSON.parse(localStorage.getItem('widths_v1')||'{}'),
  };

  const COL_LABEL = {
    id:'ID', title:'Название', ass:'Ответственный', stage:'Стадия',
    deal:'ID исходной сделки', key:'Лицензионный ключ', url:'Адрес портала',
    tariff:'Текущий тариф', tEnd:'Окончание тарифа', mEnd:'Окончание подписки',
    product:'Продукт', act:'Действия'
  };

  // автоподгон высоты фрейма
  const fit = (()=>{let raf;return function(){ if(!window.BX24) return; cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{const h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)+12;
      try{BX24.resizeWindow(h);}catch(e){} }); };})();
  new ResizeObserver(()=>fit()).observe(document.body);

  // ранний ID сделки из POST
  (function fromPost(){
    const boot=window.__BOOT__||{}; const pid = J(boot.placementOptions||'{}').ID || null; if(pid) S.dealId=Number(pid);
  })();

  // init
  BX24.init(function(){
    if(!S.dealId){ const p=BX24.getParam('PLACEMENT_OPTIONS'); const pid=(J(p||'{}').ID)||null; if(pid) S.dealId=Number(pid); }
    let started=false; const start=()=>{ if(started||!S.dealId) return; started=true; load(); fit(); };
    BX24.placement.info(()=>start()); setTimeout(start,300); setTimeout(start,1500);
  });

  // режим хранения связей
  function detectMode(raw){ const a=A(raw); return a.some(v=>typeof v==='string' && v.startsWith('DYNAMIC_'))?'bindings':'ids'; }

  // ЗАГРУЗКА
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

      const select=['id','title','stageId','categoryId','assignedById',
                    '${F.dealIdSource}','${F.licenseKey}','${F.portalUrl}','${F.tariff}','${F.tariffEnd}','${F.marketEnd}','${F.product}'];
      BX24.callMethod('crm.item.list',{entityTypeId:S.typeId,filter:{'@id':S.ids},select}, async rr=>{
        let items=[];
        if(!rr.error()) items = rr.data().items||[];
        else{
          // на старых порталах добираем батчем
          const calls={}; S.ids.forEach((id,i)=>calls['g'+i]=['crm.item.get',{entityTypeId:S.typeId,id}]);
          BX24.callBatch(calls, res=>{ for(const k in res){ if(!res[k].error()) items.push(res[k].data().item); } proceed(); }, true);
          return;
        }
        proceed();

        async function proceed(){
          S.items=items;
          await buildUFEnums();       // словари списков
          await buildUsers(items);    // фамилии ответственных
          await buildStages(items);   // стадии с фолбэком
          render(); fit();
        }
      });
    });
  }

  // СЛОВАРИ СПИСКОВ (Тариф, Продукт) — надёжно
  async function buildUFEnums(){
    // 1) пробуем userfield.list
    await new Promise(res=>{
      BX24.callMethod('crm.item.userfield.list',{ entityTypeId:S.typeId }, rr=>{
        if(!rr.error()){
          const list = rr.data().userFields || rr.data() || [];
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
        }
        res();
      });
    });

    // 2) если что-то не пришло — добираем через crm.item.fields
    await new Promise(res=>{
      BX24.callMethod('crm.item.fields',{ entityTypeId:S.typeId }, rr=>{
        if(!rr.error()){
          const fields = rr.data() || {};
          ['${F.tariff}','${F.product}'].forEach(code=>{
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
        }
        res();
      });
    });
  }

  // Имена ответственных
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

  // Стадии смарт-процесса: основной способ + фолбэк
  async function buildStages(items){
    const cats = Array.from(new Set(items.map(i=>Number(i.categoryId)).filter(Boolean)));
    let anyOk = false;

    if (cats.length){
      const calls={};
      cats.forEach((cid,i)=> calls['s'+i]=['crm.category.stage.list',{entityTypeId:S.typeId,categoryId:cid}]);

      await new Promise(res=>BX24.callBatch(calls, r=>{
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
      }, true));
    }

    // ФОЛБЭК: старые порталы — берём через crm.status.list
    if (!anyOk || !Object.keys(S.stagesByFull).length){
      const first = items[0] || {};
      let cid = Number(first.categoryId) || 0;
      if (!cid && first.stageId) cid = parseStage(first.stageId).categoryId || 0;
      if (!cid) return; // без категории нечего рисовать

      const ENTITY_ID = \`DYNAMIC_\${S.typeId}_STAGE_\${cid}\`;
      await new Promise(res=>{
        BX24.callMethod('crm.status.list',{ filter:{ ENTITY_ID } }, rr=>{
          if(!rr.error()){
            const list = rr.data() || [];
            list.forEach(st=>{
              const statusId = String(pick(st,'STATUS_ID','statusId')||'');
              const name     = String(pick(st,'NAME','name')||statusId);
              const sort     = Number(pick(st,'SORT','sort')||0);
              const fullId   = \`DT\${S.typeId}_\${cid}:\${statusId}\`;
              S.stagesByFull[fullId]={id:fullId,name,sort,categoryId:cid,statusId};
              S.stagesByCatStatus[cid+':'+statusId]=S.stagesByFull[fullId];
              if(!S.catStages[cid]) S.catStages[cid]=[];
              S.catStages[cid].push({id:fullId,name,sort,statusId});
            });
            S.catStages[cid].sort((a,b)=>a.sort-b.sort);
            const max=S.catStages[cid].length?Math.max(...S.catStages[cid].map(s=>s.sort)):100;
            S.cats[cid]={maxSort:max||100};
          }
          res();
        });
      });
    }
  }

  function getStageObject(item){
    const sid=item.stageId; const {categoryId,statusId}=parseStage(sid);
    return S.stagesByFull[sid] || S.stagesByCatStatus[(categoryId+':'+statusId)] || {id:sid,name:sid,sort:0,categoryId};
  }
  function stageUi(item){
    const st=getStageObject(item); const cid=Number(item.categoryId)||st.categoryId||0;
    const max=S.cats[cid]?.maxSort||100; const pct=Math.max(0,Math.min(100,Math.round(((st.sort||0)/max)*100)));
    const list=S.catStages[cid]||[];
    const opts=list.map(s=>\`<option value="\${s.id}" \${s.id===st.id?'selected':''}>\${s.name}</option>\`).join('');
    return \`<div class="stage"><div class="bar"><i style="width:\${pct}%"></i></div><span>\${st.name}</span><select class="stageSel" data-item="\${item.id}" data-cur="\${st.id}">\${opts}</select></div>\`;
  }
  const enumText=(code,val)=>{ if(val===null||val===undefined||val==='') return '—'; const dict=S.ufEnums[code]||{}; return dict[val] || val; };

  // фильтрация/сортировка/пагинация
  function filteredAndSorted(){
    const f=S.filter;
    let arr=S.items.filter(it=>{
      const title=String(it.title||'').toLowerCase();
      const uid=Number(it.assignedById)||null; const ass=uid&&S.users[uid]?S.users[uid].name.toLowerCase():'';
      const st=getStageObject(it).name.toLowerCase();

      const deal = String(UF(it,'${F.dealIdSource}')||'').toLowerCase();
      const key  = String(UF(it,'${F.licenseKey}')||'').toLowerCase();
      const url  = String(UF(it,'${F.portalUrl}')||'').toLowerCase();
      const tariff = String(enumText('${F.tariff}', UF(it,'${F.tariff}'))||'').toLowerCase();
      const prod   = String(enumText('${F.product}', UF(it,'${F.product}'))||'').toLowerCase();

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
        if(k==='dealid') return String(UF(x,'${F.dealIdSource}')||'').localeCompare(String(UF(y,'${F.dealIdSource}')||''),'ru',{numeric:true});
        if(k==='key') return String(UF(x,'${F.licenseKey}')||'').localeCompare(String(UF(y,'${F.licenseKey}')||''),'ru',{sensitivity:'base'});
        if(k==='url') return String(UF(x,'${F.portalUrl}')||'').localeCompare(String(UF(y,'${F.portalUrl}')||''),'ru',{sensitivity:'base'});
        if(k==='tariff') return String(enumText('${F.tariff}',UF(x,'${F.tariff}'))||'').localeCompare(String(enumText('${F.tariff}',UF(y,'${F.tariff}'))||''),'ru',{sensitivity:'base'});
        if(k==='tEnd') return String(UF(x,'${F.tariffEnd}')||'').localeCompare(String(UF(y,'${F.tariffEnd}')||''),'ru',{numeric:true});
        if(k==='mEnd') return String(UF(x,'${F.marketEnd}')||'').localeCompare(String(UF(y,'${F.marketEnd}')||''),'ru',{numeric:true});
        if(k==='product') return String(enumText('${F.product}',UF(x,'${F.product}'))||'').localeCompare(String(enumText('${F.product}',UF(y,'${F.product}'))||''),'ru',{sensitivity:'base'});
        return 0;
      };
      const v=get(key); return v===0 ? ((Number(x.id)||0)-(Number(y.id)||0))*dir : v*dir;
    });
    if(dir<0) arr.reverse();
    return arr;
  }

  function render(){
    // применяем видимость столбцов
    document.querySelectorAll('[data-col]').forEach(th=>{
      const key=th.getAttribute('data-col');
      th.style.display = S.cols.includes(key)?'':'none';
      const w=S.widths[key]; if(w) th.style.width=w;
    });
    // те же ключи на фильтрах
    ui.filters.querySelectorAll('[data-col]').forEach(td=>{
      const key=td.getAttribute('data-col');
      td.style.display = S.cols.includes(key)?'':'none';
    });

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
      const assHtml=u? \`<a href="#" onclick="BX24.openPath('/company/personal/user/\${uid}/');return false;">\${u.name}</a>\` : (uid?('ID '+uid):'—');
      const stage=stageUi(it);
      const deal = UF(it,'${F.dealIdSource}') ?? '—';
      const key  = UF(it,'${F.licenseKey}') ?? '—';
      const urlR = UF(it,'${F.portalUrl}') ?? '';
      const url  = urlR ? \`<a href="\${urlR}" target="_blank" rel="noopener">\${urlR}</a>\` : '—';
      const tariff = enumText('${F.tariff}', UF(it,'${F.tariff}'));
      const tEnd = fmtDate(UF(it,'${F.tariffEnd}'));
      const mEnd = fmtDate(UF(it,'${F.marketEnd}'));
      const product = enumText('${F.product}', UF(it,'${F.product}'));

      const tr=document.createElement('tr');
      tr.innerHTML=\`
        <td data-col="stage">\${stage}</td>
        <td data-col="deal">\${deal}</td>
        <td data-col="key">\${key}</td>
        <td data-col="url" class="wrap-title">\${url}</td>
        <td data-col="tariff">\${tariff}</td>
        <td data-col="tEnd">\${tEnd}</td>
        <td data-col="mEnd">\${mEnd}</td>
        <td data-col="product">\${product}</td>
        <td data-col="act">
          <button class="btn" data-open="\${id}">Открыть</button>
          <button class="btn" data-del="\${id}">Удалить</button>
        </td>

        <!-- скрытые по умолчанию -->
        <td data-col="id" style="display:none">\${id}</td>
        <td class="wrap-title" data-col="title" style="display:none"><a href="#" onclick="BX24.openPath('/crm/type/${SMART_ENTITY_TYPE_ID}/details/\${id}/');return false;">\${title}</a></td>
        <td data-col="ass" style="display:none">\${assHtml}</td>
      \`;
      // применяем видимость к строке
      tr.querySelectorAll('[data-col]').forEach(td=>{
        const key=td.getAttribute('data-col'); td.style.display = S.cols.includes(key)?'':'none';
      });
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

  // сохранение связей в сделке
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

  // перетаскивание ширины колонок
  function enableResizers(){
    document.querySelectorAll('th .resizer').forEach(handle=>{
      const th = handle.parentElement;
      const key= th.getAttribute('data-col');
      let startX, startW;
      handle.onmousedown = e=>{
        startX = e.clientX; startW = th.offsetWidth;
        th.classList.add('resizing');
        document.onmousemove = ev=>{
          const w = Math.max(60, startW + (ev.clientX-startX));
          th.style.width = w+'px';
          S.widths[key]=th.style.width;
        };
        document.onmouseup = ()=>{
          document.onmousemove=null; document.onmouseup=null;
          th.classList.remove('resizing');
          localStorage.setItem('widths_v1', JSON.stringify(S.widths));
        };
      };
    });
  }

  // модал «Колонки»
  function openCols(){
    ui.colList.innerHTML='';
    const all=['stage','deal','key','url','tariff','tEnd','mEnd','product','act','id','title','ass'];
    all.forEach(k=>{
      const id='col_'+k;
      const row=document.createElement('label');
      row.innerHTML=\`<input type="checkbox" id="\${id}" \${S.cols.includes(k)?'checked':''}> \${COL_LABEL[k]||k}\`;
      ui.colList.appendChild(row);
    });
    ui.colModal.style.display='flex';
  }
  function closeCols(){ ui.colModal.style.display='none'; }
  ui.colCancel.onclick=closeCols;
  ui.colApply.onclick=()=>{ const boxes=[...ui.colList.querySelectorAll('input[type="checkbox"]')];
    const list=boxes.filter(b=>b.checked).map(b=>b.id.replace('col_','')); if(!list.length) return;
    S.cols=list; localStorage.setItem('cols_v1', JSON.stringify(S.cols)); closeCols(); render(); fit(); };

  // ПИКЕР выбора элементов
  const PK={page:0,pageSize:50,query:'',total:0,selected:new Set(),loading:false};
  function openPicker(){
    const modal=document.createElement('div');
    modal.className='modal'; modal.style.display='flex';
    modal.innerHTML=\`
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
        <div class="card-f">
          <button class="btn" id="btnMore">Загрузить ещё</button>
          <button class="btn" id="btnClose">Отмена</button>
          <button class="btn primary" id="btnAttach">Добавить выбранные</button>
        </div>
      </div>\`;
    document.body.appendChild(modal);

    const q=modal.querySelector('#q'), pickRows=modal.querySelector('#pickRows'), pickAll=modal.querySelector('#pickAll');
    const btnSearch=modal.querySelector('#btnSearch'), btnReset=modal.querySelector('#btnReset');
    const btnMore=modal.querySelector('#btnMore'), btnClose=modal.querySelector('#btnClose'), btnAttach=modal.querySelector('#btnAttach');
    const info=modal.querySelector('#pgInfoPick');

    function loadPage(reset=false){
      if(PK.loading) return; PK.loading=true;
      if(reset){ PK.page=0; PK.total=0; pickRows.innerHTML='<tr><td colspan="3" class="muted" style="padding:10px 12px">Загрузка…</td></tr>'; }
      const start=PK.page*PK.pageSize; const filter=PK.query?{'%title':PK.query}:{};
      BX24.callMethod('crm.item.list',{entityTypeId:S.typeId,filter,order:{'id':'DESC'},select:['id','title'],start}, r=>{
        PK.loading=false;
        if(r.error()){ pickRows.innerHTML='<tr><td colspan="3" class="err" style="padding:10px 12px">'+r.error_description()+'</td></tr>'; return; }
        const items=r.data().items||[]; if(reset) pickRows.innerHTML='';
        if(!items.length && reset){ pickRows.innerHTML='<tr><td colspan="3" class="muted" style="padding:10px 12px">Ничего не найдено</td></tr>'; info.textContent=''; return; }
        items.forEach(it=>{
          const tr=document.createElement('tr');
          tr.innerHTML=\`<td style="border-bottom:1px solid var(--line);padding:10px 12px"><input type="checkbox" data-id="\${it.id}"></td><td style="border-bottom:1px solid var(--line);padding:10px 12px">\${it.id}</td><td style="border-bottom:1px solid var(--line);padding:10px 12px">\${it.title||('#'+it.id)}</td>\`;
          pickRows.appendChild(tr);
        });
        PK.total+=items.length; info.textContent='Показано: '+PK.total; PK.page++;
      });
    }
    pickAll.onchange=()=>{ pickRows.querySelectorAll('input[type="checkbox"][data-id]').forEach(ch=>{ ch.checked=pickAll.checked; const id=Number(ch.getAttribute('data-id')); if(ch.checked) PK.selected.add(id); else PK.selected.delete(id); });};
    pickRows.addEventListener('change',e=>{const t=e.target;if(t&&t.matches('input[type="checkbox"][data-id]')){const id=Number(t.getAttribute('data-id')); if(t.checked) PK.selected.add(id); else PK.selected.delete(id);}});
    btnMore.onclick=()=>loadPage(false);
    btnSearch.onclick=()=>{ PK.query=q.value.trim(); loadPage(true); };
    btnReset.onclick =()=>{ q.value=''; PK.query=''; loadPage(true); };
    btnClose.onclick =()=>{ modal.remove(); };
    btnAttach.onclick=()=>{ const ids=Array.from(PK.selected); if(ids.length) attach(ids); modal.remove(); };
    loadPage(true);
  }

  // события
  ui.ref.onclick=load;
  ui.create.onclick=()=>BX24.openPath('/crm/type/${SMART_ENTITY_TYPE_ID}/details/0/');
  ui.pick.onclick = openPicker;
  ui.colsBtn.onclick = openCols;

  ui.pageSize.onchange=()=>{ S.view.size=Number(ui.pageSize.value)||10; S.view.page=1; render(); fit(); };
  ui.pgPrev.onclick=()=>{ if(S.view.page>1){ S.view.page--; render(); fit(); } };
  ui.pgNext.onclick=()=>{ const pages=Math.max(1,Math.ceil(filteredAndSorted().length/S.view.size)); if(S.view.page<pages){ S.view.page++; render(); fit(); } };

  [ui.fTitle,ui.fAss,ui.fStage,ui.fDeal,ui.fKey,ui.fUrl,ui.fTariff,ui.fProduct].forEach(inp=>inp && inp.addEventListener('input',()=>{
    S.filter={ title:ui.fTitle?.value?.toLowerCase()||'', ass:ui.fAss?.value?.toLowerCase()||'', stage:ui.fStage?.value?.toLowerCase()||'', deal:ui.fDeal?.value?.toLowerCase()||'',
               key:ui.fKey?.value?.toLowerCase()||'', url:ui.fUrl?.value?.toLowerCase()||'', tariff:ui.fTariff?.value?.toLowerCase()||'', product:ui.fProduct?.value?.toLowerCase()||'' };
    S.view.page=1; render(); fit();
  }));

  // сортировка по клику на заголовок
  ui.head.addEventListener('click',e=>{
    const th=e.target.closest('th[data-col]'); if(!th||e.target.classList.contains('resizer')) return;
    const map={deal:'dealid',key:'key',url:'url',tariff:'tariff',tEnd:'tEnd',mEnd:'mEnd',product:'product'};
    const key=th.getAttribute('data-col'); const sortKey = ({id:'id',title:'title',ass:'ass',stage:'stage',act:'id'})[key] || map[key] || 'id';
    S.view.sortKey===sortKey ? (S.view.sortDir=S.view.sortDir==='asc'?'desc':'asc') : (S.view.sortKey=sortKey,S.view.sortDir='asc');
    render(); fit();
  });

  // включаем ручки ресайза
  enableResizers();
  </script>
</body></html>`;

    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        // Разрешаем встраивание только в ваш портал
        'content-security-policy':
          "default-src 'self' data: blob:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src *; " +
          "frame-ancestors " + PORTAL_ORIGIN + " https://*.bitrix24.kz"
      }
    });
  }
};
