export default {
  async fetch(request) {
    // ====== НАСТРОЙКА ======
    const DEAL_FIELD_CODE = 'UF_CRM_1755533553'; // множественное поле в сделке
    const SMART_ENTITY_TYPE_ID = 1032;           // ваш SPA ENTITY_TYPE_ID
    const PORTAL_ORIGIN = 'https://tehprof.bitrix24.kz';
    // =======================

    // Снимем POST-снапшот для раннего dealId
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

    // Вшиваем SDK
    let sdk = '';
    try { const r = await fetch('https://api.bitrix24.com/api/v1/'); sdk = await r.text(); }
    catch { sdk = "throw new Error('BX24 SDK fetch failed')"; }

    const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<title>Виджет сделки</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --bg:#f5f7fb; --ink:#111827; --mut:#6b7280; --line:#e5e7eb; --blue:#3b82f6; --green:#059669; --red:#dc2626; }
  body{margin:0;padding:24px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;background:var(--bg);color:var(--ink)}
  h1{margin:0 0 12px;font-size:36px;color:#60a5fa;font-weight:800}
  .grid2{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;margin-bottom:8px}
  .muted{color:var(--mut)} .err{color:var(--red)} .ok{color:var(--green)}
  /* toolbar */
  .toolbar{display:flex;gap:12px;align-items:center;margin:10px 0 16px}
  .btn{padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;font-weight:700}
  .btn.upper{text-transform:uppercase;letter-spacing:.3px}
  .btn.primary{background:var(--blue);color:#fff;border-color:var(--blue)}
  .pill{padding:2px 8px;border-radius:9999px;background:#eef2ff;color:#4338ca;font-weight:600;font-size:12px}
  /* таблица */
  .table-wrap{overflow:auto}
  table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid var(--line);
        border-radius:14px;overflow:hidden;table-layout:fixed}
  th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  th{background:#fafbff;color:#374151;text-align:left;font-weight:700}
  tr:last-child td{border-bottom:none}
  td.wrap{white-space:normal}
  .actions{display:flex;gap:8px}
  .link{color:var(--blue);cursor:pointer;text-decoration:none}
  /* ширины колонок */
  th.col-id, td.col-id{width:72px}
  th.col-assignee, td.col-assignee{width:200px}
  th.col-stage, td.col-stage{width:220px}
  th.col-ship, td.col-ship{width:180px}
  th.col-date, td.col-date{width:140px}
  /* стадия: индикатор прогресса + подпись */
  .stage{display:flex;align-items:center;gap:10px}
  .bar{position:relative;flex:0 0 120px;height:10px;border-radius:999px;background:#edeef3;overflow:hidden}
  .bar>i{position:absolute;left:0;top:0;bottom:0;background:#a5b4fc}
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
    <span class="tiny muted" id="hint"></span>
  </div>

  <div class="table-wrap">
    <table id="tbl">
      <thead>
        <tr>
          <th class="col-id">ID</th>
          <th>Название</th>
          <th class="col-assignee">Ответственный</th>
          <th class="col-stage">Стадия</th>
          <th>Адрес доставки</th>
          <th class="col-ship">Способ доставки</th>
          <th class="col-date">Дата поставки</th>
          <th style="width:160px">Действия</th>
        </tr>
      </thead>
      <tbody id="rows"><tr><td colspan="8" class="muted">Загрузка…</td></tr></tbody>
    </table>
  </div>

  <script>window.__BOOT__ = ${JSON.stringify({ placement, placementOptions })};</script>
  <script>${sdk}</script>

  <script>
  // ===== helpers =====
  const $ = s => document.querySelector(s);
  const ui = { id:$('#dealId'), plc:$('#placement'), rows:$('#rows'), hint:$('#hint'),
               create:$('#btnCreate'), pick:$('#btnPick'), ref:$('#btnRefresh') };
  const A = v => !v ? [] : (Array.isArray(v) ? v : [v]);
  const J = s => { try{return JSON.parse(s)}catch{return{} } };
  const bcode=(t,id)=>\`DYNAMIC_\${t}_\${id}\`;
  const toIdFromBinding=(code,t)=>{ const m=String(code||'').match(/DYNAMIC_(\\d+)_(\\d+)/); return m&&Number(m[1])==Number(t)?Number(m[2]):null; };

  // поля SPA (подстрой при необходимости)
  const COLS={title:'title',stageId:'stageId',categoryId:'categoryId',assigned:'assignedById',
              address:'UF_ADDRESS',shipType:'UF_SHIP_METHOD',shipDate:'UF_SHIP_DATE'};

  // ===== state =====
  const S={ dealId:null, field:'${DEAL_FIELD_CODE}', typeId:${SMART_ENTITY_TYPE_ID}, mode:'ids',
           bindings:[], ids:[], items:[], users:{}, stages:{}, cats:{} };

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
        await buildDictionaries(items);  // пользователи + стадии (имена и порядок)
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

  // подгружаем имена пользователей и названия стадий
  async function buildDictionaries(items){
    // ответственные
    const userIds = Array.from(new Set(items.map(i=>Number(i[COLS.assigned])).filter(Boolean)));
    if (userIds.length){
      const calls={}; userIds.forEach((uid,i)=>calls['u'+i]=['user.get',{ID:uid}]);
      await new Promise(res=>BX24.callBatch(calls, r=>{
        for(const k in r){ if(!r[k].error()){ const u=(r[k].data()[0]||{}); if(u && u.ID) S.users[Number(u.ID)] = [u.LAST_NAME,u.NAME,u.SECOND_NAME].filter(Boolean).join(' ') || u.LOGIN || ('ID '+u.ID); } }
        res();
      }, true));
    }
    // стадии (по каждой категории своя последовательность)
    const cats = Array.from(new Set(items.map(i=>Number(i.categoryId)).filter(Boolean)));
    if (cats.length){
      const calls={}; cats.forEach((cid,i)=>calls['s'+i]=['crm.category.stage.list',{entityTypeId:S.typeId,categoryId:cid}]);
      await new Promise(res=>BX24.callBatch(calls, r=>{
        for(const k in r){ if(!r[k].error()){ const list=r[k].data().stages||[];
          list.forEach(st=>{ S.stages[st.statusId] = { name:st.name, sort:Number(st.sort)||0, categoryId:st.categoryId }; });
        }}
        res();
      }, true));
      // сохраним макс sort по каждой категории для процента
      cats.forEach(cid=>{
        const list = Object.values(S.stages).filter(s=>s.categoryId===cid);
        const max = list.length ? Math.max(...list.map(s=>s.sort)) : 100;
        S.cats[cid] = { maxSort: max || 100 };
      });
    }
  }

  function stageView(item){
    const sid=item[COLS.stageId]; const cid=Number(item[COLS.categoryId])||0;
    const st=S.stages[sid]; const name=st?.name || sid || '—';
    const max=S.cats[cid]?.maxSort||100; const pct = Math.max(0, Math.min(100, Math.round(((st?.sort||0)/max)*100)));
    return \`<div class="stage"><div class="bar"><i style="width:\${pct}%"></i></div><span>\${name}</span></div>\`;
  }

  function render(){
    if(!S.items.length){ ui.rows.innerHTML='<tr><td colspan="8" class="muted">Пусто</td></tr>'; return; }
    ui.rows.innerHTML='';
    S.items.forEach(it=>{
      const id=it.id;
      const title = it[COLS.title] || ('#'+id);
      const assName = S.users[Number(it[COLS.assigned])] || (it[COLS.assigned] ? ('ID '+it[COLS.assigned]) : '—');
      const addr = it[COLS.address] ?? '—';
      const ship = it[COLS.shipType] ?? '—';
      const date = it[COLS.shipDate] ?? '—';
      const tr=document.createElement('tr');
      tr.innerHTML=\`
        <td class="col-id">\${id}</td>
        <td><a class="link" data-open="\${id}">\${title}</a></td>
        <td class="col-assignee">\${assName}</td>
        <td class="col-stage">\${stageView(it)}</td>
        <td class="wrap">\${addr}</td>
        <td class="col-ship">\${ship}</td>
        <td class="col-date">\${date}</td>
        <td class="actions">
          <button class="btn" data-open="\${id}">Открыть</button>
          <button class="btn" data-del="\${id}">Удалить</button>
        </td>\`;
      ui.rows.appendChild(tr);
    });
    ui.rows.querySelectorAll('[data-open]').forEach(n=>n.onclick=()=>BX24.openPath(\`/crm/type/\${S.typeId}/details/\${n.getAttribute('data-open')}/\`));
    ui.rows.querySelectorAll('[data-del]').forEach(n=>n.onclick=()=>detach(Number(n.getAttribute('data-del'))));
  }

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

  // Кнопки как в списке SPA
  ui.ref.onclick = load;

  ui.create.onclick = ()=>{
    // открываем слайдер создания элемента SPA
    BX24.openPath(\`/crm/type/\${S.typeId}/details/0/\`);
    // Подскажем обновить после сохранения (Bitrix не шлёт нам событие закрытия из другого фрейма)
    ui.hint.textContent='Сохраните элемент в открывшемся окне и нажмите «Обновить».';
  };

  ui.pick.onclick = ()=>{
    // красивый диалог, если доступен
    if (window.BX && BX.UI && BX.UI.EntitySelector){
      try{
        const dlg = new BX.UI.EntitySelector.Dialog({
          target: ui.pick,
          entities: [{ id:'dynamic', dynamicLoad:true, entityTypeId:S.typeId }],
          multiple: true, dropdownMode: true, enableSearch: true, width: 550
        });
        dlg.show();
        dlg.subscribe('onSave', ()=>{
          const ids = dlg.getSelectedItems().map(i=>Number(i.getId())).filter(Boolean);
          if (ids.length) attach(ids);
        });
        return;
      }catch(_){}
    }
    // фолбэк — ввод ID вручную
    const raw = prompt('Введите ID элементов смарт-процесса (через запятую)');
    if(!raw) return;
    const ids = raw.split(',').map(s=>Number(s.trim())).filter(Boolean);
    if (ids.length) attach(ids);
  };
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
