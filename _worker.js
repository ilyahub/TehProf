export default {
  async fetch(request) {
    // ====== НАСТРОЙКА ======
    const DEAL_FIELD_CODE = 'UF_CRM_1755533553'; // множественное поле в сделке
    const SMART_ENTITY_TYPE_ID = 1032;          // ваш SPA ENTITY_TYPE_ID
    const PORTAL_ORIGIN = 'https://tehprof.bitrix24.kz';
    // =======================

    // Снимем POST-снапшот (для раннего Deal ID)
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

    // Подтянем SDK и заинлайним
    let sdk = '';
    try { const r = await fetch('https://api.bitrix24.com/api/v1/'); sdk = await r.text(); }
    catch { sdk = "throw new Error('BX24 SDK fetch failed')"; }

    const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<title>Виджет сделки</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{
    --bg:#f5f7fb; --ink:#111827; --mut:#6b7280; --line:#e5e7eb; --red:#dc2626;
    --blue:#3bc8f5; --blue-h:#3eddff; --blue-a:#12b1e3;
  }
  body{margin:0;padding:24px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;background:var(--bg);color:var(--ink)}
  h1{margin:0 0 12px;font-size:36px;color:#60a5fa;font-weight:800}
  .grid2{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;margin-bottom:8px}
  .muted{color:var(--mut)} .err{color:var(--red)} .tiny{font-size:12px}

  /* toolbar */
  .toolbar{display:flex;gap:12px;align-items:center;margin:10px 0 8px;flex-wrap:wrap}
  .btn{padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;font-weight:700;transition:.12s}
  .btn.upper{text-transform:uppercase;letter-spacing:.3px}
  .btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
  .btn.primary:hover{background:var(--blue-h);border-color:var(--blue-h)}
  .btn.primary:active{background:var(--blue-a);border-color:var(--blue-a)}
  .pill{padding:2px 8px;border-radius:9999px;background:#eef2ff;color:#4338ca;font-weight:600;font-size:12px}
  .link{color:#3b82f6;cursor:pointer;text-decoration:none}

  /* таблица */
  .table-wrap{
    max-height:70vh;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:14px
  }
  table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;table-layout:auto}
  th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  th{background:#fafbff;color:#374151;text-align:left;font-weight:700;position:sticky;top:0;z-index:2;cursor:pointer}
  tr.filters th{background:#fff;position:sticky;top:40px;z-index:2;cursor:default}
  tr:last-child td{border-bottom:none}
  td.wrap{white-space:normal} /* перенос строк */

  .actions{display:flex;gap:8px}
  th.col-id, td.col-id{width:72px}
  th.col-assignee, td.col-assignee{width:240px}
  th.col-stage, td.col-stage{width:420px}
  th.col-ship, td.col-ship{width:180px}
  th.col-date, td.col-date{width:140px}

  /* индикатор стадии */
  .stage{display:flex;align-items:center;gap:10px}
  .bar{position:relative;flex:0 0 160px;height:10px;border-radius:999px;background:#edeef3;overflow:hidden}
  .bar>i{position:absolute;left:0;top:0;bottom:0;background:#a5b4fc}
  .stageSel{padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;margin-left:10px}

  /* фильтры */
  .filter{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit}

  /* модалка (пикер) */
  .modal{position:fixed;inset:0;background:rgba(17,24,39,.5);display:none;align-items:center;justify-content:center;z-index:9999}
  .modal.open{display:flex}
  .modal-card{width:min(920px,95vw);max-height:85vh;background:#fff;border-radius:16px;border:1px solid var(--line);display:flex;flex-direction:column}
  .modal-head{padding:14px 16px;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:center}
  .modal-body{padding:0;height:60vh;overflow:auto}
  .modal-foot{padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end}
  .input{flex:1;border:1px solid var(--line);border-radius:10px;padding:10px 12px}
  .list{width:100%;border-collapse:collapse}
  .list th,.list td{border-bottom:1px solid var(--line);padding:10px 12px}
  .list th{text-align:left;background:#fafbff}
  .list tr:hover{background:#fafafa}
  .right{margin-left:auto}
</style>
</head><body>
  <h1>Виджет сделки</h1>

  <div class="grid2 tiny muted">
    <div>Deal ID:</div><div id="dealId">—</div>
    <div>Placement:</div><div id="placement">—</div>
  </div>

  <div class="toolbar">
    <span class="pill">Связанные элементы SPA</span>
    <button class="btn upper primary" id="btnCreate">Новый элемент</button>
    <button class="btn upper" id="btnPick">Выбрать элемент</button>
    <button class="btn" id="btnRefresh">Обновить</button>

    <span class="tiny muted" style="margin-left:auto">Показывать по:</span>
    <select id="pageSize" class="btn" style="padding:6px 10px;">
      <option value="10" selected>10</option><option value="30">30</option><option value="50">50</option><option value="100">100</option>
    </select>
    <button class="btn" id="pgPrev">‹</button>
    <span id="pgInfo" class="tiny muted">1/1</span>
    <button class="btn" id="pgNext">›</button>

    <span class="tiny muted" id="hint"></span>
  </div>

  <div class="table-wrap">
    <table id="tbl">
      <thead>
        <tr class="head">
          <th class="col-id" data-sort="id">ID</th>
          <th data-sort="title">Название</th>
          <th class="col-assignee" data-sort="ass">Ответственный</th>
          <th class="col-stage" data-sort="stage">Стадия</th>
          <th>Адрес доставки</th>
          <th class="col-ship">Способ доставки</th>
          <th class="col-date">Дата поставки</th>
          <th style="width:160px">Действия</th>
        </tr>
        <tr class="filters">
          <th></th>
          <th><input class="filter" id="fTitle" placeholder="Фильтр по названию"></th>
          <th><input class="filter" id="fAss" placeholder="Фильтр по ответственному"></th>
          <th><input class="filter" id="fStage" placeholder="Фильтр по стадии"></th>
          <th></th><th></th><th></th><th></th>
        </tr>
      </thead>
      <tbody id="rows"><tr><td colspan="8" class="muted">Загрузка…</td></tr></tbody>
    </table>
  </div>

  <!-- ПИКЕР -->
  <div class="modal" id="picker">
    <div class="modal-card">
      <div class="modal-head">
        <strong>Выбор элементов смарт-процесса</strong>
        <input class="input" id="q" placeholder="Поиск по названию…" />
        <button class="btn" id="btnSearch">Найти</button>
        <button class="btn" id="btnReset">Сброс</button>
        <span class="right tiny muted" id="pgInfoPick"></span>
      </div>
      <div class="modal-body">
        <table class="list" id="pickList">
          <thead><tr><th style="width:48px"><input type="checkbox" id="pickAll"></th><th style="width:80px">ID</th><th>Название</th></tr></thead>
          <tbody id="pickRows"><tr><td colspan="3" class="muted">Загрузка…</td></tr></tbody>
        </table>
      </div>
      <div class="modal-foot">
        <button class="btn" id="btnMore">Загрузить ещё</button>
        <button class="btn" id="btnClose">Отмена</button>
        <button class="btn primary" id="btnAttach">Добавить выбранные</button>
      </div>
    </div>
  </div>

  <script>window.__BOOT__ = ${JSON.stringify({ placement, placementOptions })};</script>
  <script>${sdk}</script>

  <script>
  // ===== helpers & state =====
  const $ = s => document.querySelector(s);
  const ui = {
    id:$('#dealId'), plc:$('#placement'), rows:$('#rows'),
    create:$('#btnCreate'), pick:$('#btnPick'), ref:$('#btnRefresh'), hint:$('#hint'),
    pageSize:$('#pageSize'), pgPrev:$('#pgPrev'), pgNext:$('#pgNext'), pgInfo:$('#pgInfo'),
    // фильтры / сорт
    fTitle:$('#fTitle'), fAss:$('#fAss'), fStage:$('#fStage'), head:document.querySelector('tr.head'),
    // picker
    picker:$('#picker'), q:$('#q'), btnSearch:$('#btnSearch'), btnReset:$('#btnReset'),
    pickRows:$('#pickRows'), pickAll:$('#pickAll'), btnMore:$('#btnMore'),
    btnClose:$('#btnClose'), btnAttach:$('#btnAttach'), pgInfoPick:$('#pgInfoPick')
  };
  const A = v => !v ? [] : (Array.isArray(v) ? v : [v]);
  const J = s => { try{return JSON.parse(s)}catch{return{} } };
  const bcode=(t,id)=>\`DYNAMIC_\${t}_\${id}\`;
  const toIdFromBinding=(code,t)=>{ const m=String(code||'').match(/DYNAMIC_(\\d+)_(\\d+)/); return m&&Number(m[1])==Number(t)?Number(m[2]):null; };

  // безопасный геттер регистров
  const pick = (obj, ...keys) => {
    if (!obj) return undefined;
    for (const k of keys) if (obj[k] !== undefined) return obj[k];
    for (const k of keys) {
      const u = String(k).toUpperCase(); if (obj[u] !== undefined) return obj[u];
      const l = String(k).toLowerCase(); if (obj[l] !== undefined) return obj[l];
    }
    return undefined;
  };

  // разбор полного stageId
  const parseStage = sid => {
    const m = String(sid||'').match(/^DT(\\d+)_(\\d+):(.+)$/);
    return m ? { typeId:Number(m[1]), categoryId:Number(m[2]), statusId:m[3] } : { typeId:null, categoryId:null, statusId:String(sid||'') };
  };

  const COLS={title:'title',stageId:'stageId',categoryId:'categoryId',assigned:'assignedById',
              address:'UF_ADDRESS',shipType:'UF_SHIP_METHOD',shipDate:'UF_SHIP_DATE'};

  const S={
    dealId:null, field:'${DEAL_FIELD_CODE}', typeId:${SMART_ENTITY_TYPE_ID}, mode:'ids',
    bindings:[], ids:[], items:[], users:{},
    stagesByFull:{},         // ключ: полный id (DT...:NEW)
    stagesByCatStatus:{},    // ключ: "categoryId:STATUS"
    catStages:{},            // по категории: список объектов {id, name, sort, statusId}
    cats:{},                 // meta по категориям (maxSort)
    // пагинация + сорт/фильтр
    view:{ page:1, size:10, sortKey:'id', sortDir:'asc' },
    filter:{ title:'', ass:'', stage:'' },

    // picker
    pk:{ page:0, pageSize:50, query:'', totalShown:0, selected:new Set(), loading:false }
  };

  // авто-подгон высоты
  const fit = (() => { let raf; return function(){ if(!window.BX24) return;
    cancelAnimationFrame(raf); raf=requestAnimationFrame(()=>{ const h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)+12;
      try{BX24.resizeWindow(h);}catch(e){} }); };})();
  new ResizeObserver(()=>fit()).observe(document.body);

  // ранний dealId из POST
  (function fromPost(){
    const boot = window.__BOOT__||{};
    if (boot.placement) ui.plc.textContent = boot.placement;
    const pid = J(boot.placementOptions||'{}').ID || null;
    if (pid) { S.dealId = Number(pid); ui.id.textContent = S.dealId; }
  })();

  BX24.init(function(){
    if(!S.dealId){
      const p=BX24.getParam('PLACEMENT_OPTIONS'); const pid=(J(p||'{}').ID)||null;
      if (pid){ S.dealId=Number(pid); ui.id.textContent=S.dealId; }
    }
    let started=false;
    function start(){ if(started||!S.dealId) return; started=true; load(); fit(); }
    BX24.placement.info(function(info){
      ui.plc.textContent = info?.placement || ui.plc.textContent || '—';
      const id = info?.options?.ID || info?.options?.ENTITY_ID || null;
      if (id && !S.dealId){ S.dealId=Number(id); ui.id.textContent=S.dealId; }
      start();
    });
    setTimeout(start, 300);
    setTimeout(start, 1500);
  });

  function detectMode(raw){ const a=A(raw); return a.some(v=>typeof v==='string' && v.startsWith('DYNAMIC_'))?'bindings':'ids'; }

  function load(){
    if(!S.dealId){ ui.rows.innerHTML='<tr><td colspan="8" class="err">Нет ID сделки</td></tr>'; return; }
    ui.hint.textContent='Загрузка…';
    BX24.callMethod('crm.deal.get',{id:S.dealId}, r=>{
      if(r.error()){ ui.rows.innerHTML='<tr><td colspan="8" class="err">'+r.error_description()+'</td></tr>'; ui.hint.textContent=''; return; }
      const raw=r.data()[S.field];
      S.mode = detectMode(raw);
      S.bindings = A(raw);
      S.ids = (S.mode==='bindings') ? S.bindings.map(c=>toIdFromBinding(c,S.typeId)).filter(Boolean)
                                     : A(raw).map(Number).filter(Boolean);
      if(!S.ids.length){ ui.rows.innerHTML='<tr><td colspan="8" class="muted">Пока нет связанных элементов</td></tr>'; ui.hint.textContent=''; fit(); return; }

      fetchItems(S.ids, async (items)=>{
        S.items = items;
        await buildDictionaries(items);  // пользователи + стадии
        render(); ui.hint.textContent=''; fit();
      });
    });
  }

  function fetchItems(ids, cb){
    BX24.callMethod('crm.item.list',{
      entityTypeId:S.typeId, filter:{'@id':ids},
      select:['id','title','stageId','categoryId',COLS.assigned,COLS.address,COLS.shipType,COLS.shipDate]
    }, r=>{
      if(!r.error()) return cb(r.data().items||[]);
      // fallback: батч по get
      const calls={}; ids.forEach((id,i)=>calls['g'+i]=['crm.item.get',{entityTypeId:S.typeId,id}]);
      BX24.callBatch(calls,res=>{ const arr=[]; for(const k in res){ if(!res[k].error()) arr.push(res[k].data().item); } cb(arr); }, true);
    });
  }

  // словари: пользователи и стадии
  async function buildDictionaries(items){
    // --- пользователи
    const userIds = Array.from(new Set(items.map(i=>Number(i[COLS.assigned])).filter(Boolean)));
    if (userIds.length){
      const calls={}; userIds.forEach((uid,i)=>calls['u'+i]=['user.get',{ID:String(uid)}]);
      await new Promise(res=>BX24.callBatch(calls, r=>{
        for(const k in r){
          if(!r[k].error()){
            const raw = (r[k].data()||[])[0] || {};
            const id = Number(pick(raw,'ID'));
            if (id) {
              const name = [pick(raw,'LAST_NAME'), pick(raw,'NAME'), pick(raw,'SECOND_NAME')].filter(Boolean).join(' ')
                           || pick(raw,'LOGIN') || ('ID '+id);
              S.users[id] = { name, path: '/company/personal/user/'+id+'/' };
            }
          }
        }
        res();
      }, true));
      // fallback точечно
      const missed = userIds.filter(id => !S.users[id]);
      for (const uid of missed) {
        await new Promise(done=>{
          BX24.callMethod('user.get',{ID:String(uid)}, rr=>{
            const one = (rr.data()||[])[0] || {};
            const id = Number(pick(one,'ID'));
            if (id) {
              const nm = [pick(one,'LAST_NAME'), pick(one,'NAME'), pick(one,'SECOND_NAME')].filter(Boolean).join(' ')
                         || pick(one,'LOGIN') || ('ID '+id);
              S.users[id] = { name:nm, path: '/company/personal/user/'+id+'/' };
            }
            done();
          });
        });
      }
    }

    // --- стадии (по категориям)
    const cats = Array.from(new Set(items.map(i=>Number(i.categoryId)).filter(Boolean)));
    if (cats.length){
      const calls={}; cats.forEach((cid,i)=>calls['s'+i]=['crm.category.stage.list',{entityTypeId:S.typeId,categoryId:cid}]);
      await new Promise(res=>BX24.callBatch(calls, r=>{
        for(const k in r){
          if(!r[k].error()){
            let data = r[k].data();
            let list = Array.isArray(data) ? data
                     : (data && (data.stages || data.STAGES)) || [];
            if (!Array.isArray(list) && data && data.result) {
              list = data.result.stages || data.result.STAGES || [];
            }
            list.forEach(st=>{
              const statusId   = String(pick(st,'statusId','STATUS_ID') || '');
              const name       = String(pick(st,'name','NAME') || statusId);
              const sort       = Number(pick(st,'sort','SORT') || 0);
              const categoryId = Number(pick(st,'categoryId','CATEGORY_ID') || 0);
              const fullId     = String(pick(st,'id','ID') || (categoryId ? \`DT\${S.typeId}_\${categoryId}:\${statusId}\` : statusId));

              // словари
              S.stagesByFull[fullId] = { id:fullId, name, sort, categoryId, statusId };
              const catKey = categoryId + ':' + statusId;
              S.stagesByCatStatus[catKey] = S.stagesByFull[fullId];

              if (!S.catStages[categoryId]) S.catStages[categoryId]=[];
              S.catStages[categoryId].push({ id:fullId, name, sort, statusId });
            });
          }
        }
        // сортировка и maxSort
        Object.keys(S.catStages).forEach(cid=>{
          S.catStages[cid].sort((a,b)=>a.sort-b.sort);
          const max = S.catStages[cid].length ? Math.max(...S.catStages[cid].map(s=>s.sort)) : 100;
          S.cats[cid] = { maxSort: max || 100 };
        });
        res();
      }, true));
    }
  }

  function getStageObject(item){
    const sid = item[COLS.stageId];
    const {categoryId, statusId} = parseStage(sid);
    return S.stagesByFull[sid] || S.stagesByCatStatus[(categoryId+':'+statusId)] || { id:sid, name:sid, sort:0, categoryId };
  }

  function stageUi(item){
    const st = getStageObject(item);
    const cid = Number(item[COLS.categoryId])||st.categoryId||0;
    const max=S.cats[cid]?.maxSort||100;
    const pct = Math.max(0, Math.min(100, Math.round(((st.sort||0)/max)*100)));
    const list=S.catStages[cid]||[];
    const opts=list.map(s=>\`<option value="\${s.id}" \${s.id===st.id?'selected':''}>\${s.name}</option>\`).join('');
    return \`
      <div class="stage">
        <div class="bar"><i style="width:\${pct}%"></i></div>
        <span>\${st.name}</span>
        <select class="stageSel" data-item="\${item.id}" data-cur="\${st.id}">\${opts}</select>
      </div>\`;
  }

  // сорт + фильтры
  function filteredAndSorted(){
    const t = S.filter.title.trim().toLowerCase();
    const a = S.filter.ass.trim().toLowerCase();
    const s = S.filter.stage.trim().toLowerCase();

    let arr = S.items.filter(it=>{
      const title = String(it[COLS.title]||'').toLowerCase();
      const uid   = Number(it[COLS.assigned])||null;
      const ass   = uid && S.users[uid] ? S.users[uid].name.toLowerCase() : '';
      const st    = getStageObject(it).name.toLowerCase();
      return (!t || title.includes(t)) && (!a || ass.includes(a)) && (!s || st.includes(s));
    });

    const dir = S.view.sortDir === 'asc' ? 1 : -1;
    const key = S.view.sortKey;
    arr.sort((x,y)=>{
      const by = k=>{
        if (k==='id') return (Number(x.id)||0) - (Number(y.id)||0);
        if (k==='title') return String(x[COLS.title]||'').localeCompare(String(y[COLS.title]||''), 'ru', {sensitivity:'base'});
        if (k==='ass') {
          const ax = S.users[Number(x[COLS.assigned])] ?.name || '';
          const ay = S.users[Number(y[COLS.assigned])] ?.name || '';
          return ax.localeCompare(ay,'ru',{sensitivity:'base'});
        }
        if (k==='stage') return (getStageObject(x).sort||0) - (getStageObject(y).sort||0);
        return 0;
      };
      const v = by(key);
      return v===0 ? ((Number(x.id)||0) - (Number(y.id)||0))*dir : v*dir;
    });

    if (dir<0) arr.reverse();
    return arr;
  }

  function render(){
    const full = filteredAndSorted();
    const total = full.length;
    const pages = Math.max(1, Math.ceil(total / S.view.size));
    if (S.view.page > pages) S.view.page = pages;

    const start = (S.view.page - 1) * S.view.size;
    const slice = full.slice(start, start + S.view.size);

    ui.pgInfo.textContent = S.view.page + '/' + pages;
    ui.pgPrev.disabled = (S.view.page <= 1);
    ui.pgNext.disabled = (S.view.page >= pages);

    if(!slice.length){ ui.rows.innerHTML='<tr><td colspan="8" class="muted">Ничего не найдено</td></tr>'; return; }
    ui.rows.innerHTML='';
    slice.forEach(it=>{
      const id=it.id;
      const title = it[COLS.title] || ('#'+id);
      const uid = Number(it[COLS.assigned]) || null;
      const u = uid ? S.users[uid] : null;
      const assHtml = u ? \`<a class="link user" data-user="\${uid}">\${u.name}</a>\` : (uid ? ('ID '+uid) : '—');
      const addr = it[COLS.address] ?? '—';
      const ship = it[COLS.shipType] ?? '—';
      const date = it[COLS.shipDate] ?? '—';
      const tr=document.createElement('tr');
      tr.innerHTML=\`
        <td class="col-id">\${id}</td>
        <td class="wrap"><a class="link" data-open="\${id}">\${title}</a></td>
        <td class="col-assignee">\${assHtml}</td>
        <td class="col-stage">\${stageUi(it)}</td>
        <td class="wrap">\${addr}</td>
        <td class="col-ship">\${ship}</td>
        <td class="col-date">\${date}</td>
        <td class="actions">
          <button class="btn" data-open="\${id}">Открыть</button>
          <button class="btn" data-del="\${id}">Удалить</button>
        </td>\`;
      ui.rows.appendChild(tr);
    });

    // переход по элементу
    ui.rows.querySelectorAll('[data-open]').forEach(n=>n.onclick=()=>BX24.openPath(\`/crm/type/\${S.typeId}/details/\${n.getAttribute('data-open')}/\`));
    // ссылка на пользователя
    ui.rows.querySelectorAll('a.user').forEach(a=>a.onclick=()=>BX24.openPath('/company/personal/user/'+a.dataset.user+'/'));
    // смена стадии
    ui.rows.querySelectorAll('.stageSel').forEach(sel=>{
      sel.onchange = ()=>{
        const newStageId = sel.value;      // полный ID (DT...:NEW)
        const itemId     = Number(sel.getAttribute('data-item'));
        BX24.callMethod('crm.item.update', { entityTypeId:S.typeId, id:itemId, fields:{ stageId:newStageId } }, r=>{
          if (r.error()){ alert('Ошибка смены стадии: '+r.error_description()); sel.value = sel.getAttribute('data-cur'); return; }
          const it = S.items.find(i=>i.id===itemId); if (it){ it[COLS.stageId] = newStageId; }
          render();
        });
      };
    });
  }

  // сохранить связку
  function save(next){
    const f={}; f[S.field]=next;
    BX24.callMethod('crm.deal.update',{id:S.dealId,fields:f}, r=>{
      if(r.error()) ui.hint.textContent=r.error_description(); else load();
    });
  }
  function attach(ids){
    if(S.mode==='bindings'){
      const add=ids.map(id=>bcode(S.typeId,id));
      save(Array.from(new Set([...(S.bindings||[]),...add])));
    } else {
      save(Array.from(new Set([...(A(S.bindings).map(Number)),...ids])));
    }
  }
  function detach(id){
    if(S.mode==='bindings'){
      const code=bcode(S.typeId,id);
      save((S.bindings||[]).filter(c=>c!==code));
    } else {
      save(A(S.bindings).map(Number).filter(v=>v!==id));
    }
  }

  // ==== ПИКЕР ====
  function openPicker(){ ui.picker.classList.add('open'); S.pk.page=0; S.pk.totalShown=0; S.pk.selected=new Set(); ui.pickAll.checked=false; ui.pgInfoPick.textContent=''; loadPickerPage(true); }
  function closePicker(){ ui.picker.classList.remove('open'); }
  function loadPickerPage(reset=false){
    if (S.pk.loading) return; S.pk.loading=true;
    if (reset){ S.pk.page=0; S.pk.totalShown=0; ui.pickRows.innerHTML='<tr><td colspan="3" class="muted">Загрузка…</td></tr>'; }
    const start = S.pk.page * S.pk.pageSize;
    const filter = S.pk.query ? { '%title': S.pk.query } : {};
    BX24.callMethod('crm.item.list',{ entityTypeId:S.typeId, filter, order:{'id':'DESC'}, select:['id','title'], start }, r=>{
      S.pk.loading=false;
      if (r.error()){ ui.pickRows.innerHTML='<tr><td colspan="3" class="err">'+r.error_description()+'</td></tr>'; return; }
      const items=r.data().items||[];
      if (reset) ui.pickRows.innerHTML='';
      if (!items.length && reset){ ui.pickRows.innerHTML='<tr><td colspan="3" class="muted">Ничего не найдено</td></tr>'; ui.pgInfoPick.textContent=''; return; }
      items.forEach(it=>{
        const tr=document.createElement('tr');
        tr.innerHTML=\`<td><input type="checkbox" data-id="\${it.id}"></td><td>\${it.id}</td><td>\${it.title||('#'+it.id)}</td>\`;
        ui.pickRows.appendChild(tr);
      });
      S.pk.totalShown += items.length;
      ui.pgInfoPick.textContent = 'Показано: '+S.pk.totalShown;
      S.pk.page++;
    });
  }

  ui.pickAll.onchange = () => {
    ui.pickRows.querySelectorAll('input[type="checkbox"][data-id]').forEach(ch=>{
      ch.checked = ui.pickAll.checked;
      const id = Number(ch.getAttribute('data-id'));
      if (ch.checked) S.pk.selected.add(id); else S.pk.selected.delete(id);
    });
  };
  ui.pickRows.addEventListener('change', (e)=>{
    const t=e.target; if (t && t.matches('input[type="checkbox"][data-id]')){
      const id=Number(t.getAttribute('data-id')); if (t.checked) S.pk.selected.add(id); else S.pk.selected.delete(id);
    }
  });
  ui.btnMore.onclick = () => loadPickerPage(false);
  ui.btnSearch.onclick = () => { S.pk.query = ui.q.value.trim(); openPicker(); };
  ui.btnReset.onclick = () => { ui.q.value=''; S.pk.query=''; openPicker(); };
  ui.btnClose.onclick = () => closePicker();
  ui.btnAttach.onclick = () => { const ids = Array.from(S.pk.selected); if (ids.length) attach(ids); closePicker(); };

  // ==== КНОПКИ / ПАГИНАЦИЯ / ФИЛЬТРЫ / СОРТ ====
  ui.ref.onclick = load;

  ui.create.onclick = ()=>{
    BX24.openPath(\`/crm/type/\${S.typeId}/details/0/\`);
    ui.hint.textContent='Сохраните элемент в открывшемся окне и нажмите «Обновить».';
  };

  ui.pick.onclick = ()=> openPicker();

  ui.pageSize.onchange = () => { S.view.size = Number(ui.pageSize.value) || 10; S.view.page = 1; render(); fit(); };
  ui.pgPrev.onclick = () => { if (S.view.page > 1) { S.view.page--; render(); fit(); } };
  ui.pgNext.onclick = () => {
    const pages = Math.max(1, Math.ceil(filteredAndSorted().length / S.view.size));
    if (S.view.page < pages) { S.view.page++; render(); fit(); }
  };

  // фильтры
  [ui.fTitle, ui.fAss, ui.fStage].forEach(inp=>inp.addEventListener('input', ()=>{
    S.filter.title = ui.fTitle.value; S.filter.ass = ui.fAss.value; S.filter.stage = ui.fStage.value;
    S.view.page=1; render(); fit();
  }));

  // сорт
  ui.head.addEventListener('click', (e)=>{
    const th = e.target.closest('[data-sort]'); if (!th) return;
    const key = th.dataset.sort; S.view.sortKey===key ? (S.view.sortDir = S.view.sortDir==='asc'?'desc':'asc') : (S.view.sortKey=key,S.view.sortDir='asc');
    render(); fit();
  });
  </script>
</body></html>`;

    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy':
          "default-src 'self' data: blob:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src *; " +
          "frame-ancestors " + PORTAL_ORIGIN + " https://*.bitrix24.kz",
        'cache-control': 'no-store'
      }
    });
  }
};
