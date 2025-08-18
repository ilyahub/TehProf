export default {
  async fetch(request) {
    // ------------ НАСТРОЙКА -------------
    const DEAL_FIELD_CODE = 'UF_CRM_1755533553'; // ваше множественное поле со связями
    const SMART_ENTITY_TYPE_ID = 1032;            // <-- ПОДСТАВЬТЕ ваш ENTITY_TYPE_ID SPA
    const PORTAL = 'https://tehprof.bitrix24.kz';
    // ------------------------------------

    // 1) читаем POST (PLACEMENT / PLACEMENT_OPTIONS)
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

    // 2) подтягиваем SDK и заинлайнем
    let sdk = '';
    try { const r = await fetch('https://api.bitrix24.com/api/v1/'); sdk = await r.text(); }
    catch { sdk = "throw new Error('BX24 SDK fetch failed');"; }

    // 3) html
    const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<title>Виджет сделки</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --bg:#f5f7fb; --ink:#111827; --mut:#6b7280; --line:#e5e7eb; --blue:#3b82f6; --green:#059669; --red:#dc2626; }
  body{margin:0;padding:24px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;background:var(--bg);color:var(--ink)}
  h1{margin:0 0 12px;font-size:36px;color:#60a5fa;font-weight:800}
  .toolbar{display:flex;gap:8px;align-items:center;margin:6px 0 16px}
  .btn{padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer}
  .btn.primary{background:var(--blue);color:#fff;border-color:var(--blue)}
  .pill{padding:2px 8px;border-radius:9999px;background:#eef2ff;color:#4338ca;font-weight:600;font-size:12px}
  .muted{color:var(--mut)} .ok{color:var(--green)} .err{color:var(--red)}
  table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
  th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
  th{background:#fafbff;color:#374151;text-align:left;font-weight:700}
  tr:last-child td{border-bottom:none}
  .actions{display:flex;gap:8px}
  .link{color:var(--blue);cursor:pointer;text-decoration:none}
  .chip{display:inline-flex;gap:6px;align-items:center;padding:4px 8px;background:#f3f4f6;border:1px solid var(--line);border-radius:999px}
  .tiny{font-size:12px}
  .grid2{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;margin-bottom:8px}
</style>
</head><body>
  <h1>Виджет сделки</h1>

  <div class="grid2 tiny muted">
    <div>Deal ID:</div><div id="dealId">—</div>
    <div>Placement:</div><div id="placement">—</div>
  </div>

  <div class="toolbar">
    <span class="pill">Связанные элементы SPA</span>
    <button class="btn primary" id="btnAdd">Добавить</button>
    <button class="btn" id="btnRefresh">Обновить</button>
    <span class="tiny muted" id="hint"></span>
  </div>

  <table id="tbl">
    <thead>
      <tr>
        <th style="width:72px">ID</th><th>Название</th>
        <th style="width:160px">Ответственный (ID)</th>
        <th style="width:140px">Стадия</th>
        <th style="width:180px">Адрес</th>
        <th style="width:160px">Доставка</th>
        <th style="width:140px">Дата</th>
        <th style="width:160px">Действия</th>
      </tr>
    </thead>
    <tbody id="rows"><tr><td colspan="8" class="muted">Загрузка…</td></tr></tbody>
  </table>

  <!-- передаём снапшот POST -->
  <script>window.__BOOT__ = ${JSON.stringify({ placement, placementOptions })};</script>
  <!-- SDK -->
  <script>${sdk}</script>

  <script>
  // ===== helpers =====
  const $ = s => document.querySelector(s);
  const ui = { id:$('#dealId'), plc:$('#placement'), rows:$('#rows'), hint:$('#hint'), add:$('#btnAdd'), ref:$('#btnRefresh') };
  const A = v => !v ? [] : (Array.isArray(v) ? v : [v]);
  const J = s => { try{return JSON.parse(s)}catch{return{}} };
  const bcode=(t,id)=>\`DYNAMIC_\${t}_\${id}\`;
  const toIdFromBinding=(code,t)=>{ const m=String(code||'').match(/DYNAMIC_(\\d+)_(\\d+)/); return m&&Number(m[1])==Number(t)?Number(m[2]):null; };
  const COLS={title:'title',stageId:'stageId',assigned:'assignedById',address:'UF_ADDRESS',shipType:'UF_SHIP_METHOD',shipDate:'UF_SHIP_DATE'};

  // ===== state =====
  const S={ dealId:null, field:'${DEAL_FIELD_CODE}', typeId:${SMART_ENTITY_TYPE_ID}, mode:'ids', bindings:[], ids:[], items:[] };

  // 0) фолбэк из POST: покажем placement и dealId сразу
  (function fromPost(){
    const boot = window.__BOOT__||{};
    if (boot.placement) ui.plc.textContent = boot.placement;
    const sid = J(boot.placementOptions||'{}').ID || null;
    if (sid) { ui.id.textContent = sid; S.dealId = Number(sid); }
  })();

  // 1) старт SDK
  BX24.init(function(){
    BX24.placement.info(function(info){
      ui.plc.textContent = info?.placement || ui.plc.textContent || '—';
      const id = info?.options?.ID || info?.options?.ENTITY_ID || null;
      if (id) { S.dealId = Number(id); ui.id.textContent = id; }
      if (!S.dealId){ ui.rows.innerHTML = '<tr><td colspan="8" class="err">ID is not defined or invalid.</td></tr>'; return; }
      load(); fit();
    });
  });

  function fit(){ try{ BX24 && BX24.resizeWindow(document.documentElement.scrollHeight, 200);}catch(e){} }
  addEventListener('load',fit); addEventListener('resize',fit); setInterval(fit,900);

  function detectMode(raw){ const a=A(raw); return a.some(v=>typeof v==='string' && v.startsWith('DYNAMIC_'))?'bindings':'ids'; }

  function load(){
    ui.hint.textContent='Загрузка…';
    BX24.callMethod('crm.deal.get', {id:S.dealId}, r=>{
      if(r.error()){ ui.rows.innerHTML='<tr><td colspan="8" class="err">'+r.error_description()+'</td></tr>'; ui.hint.textContent=''; return; }
      const deal=r.data(); const raw=deal[S.field];
      S.mode = detectMode(raw);
      S.bindings = A(raw);
      S.ids = (S.mode==='bindings')
        ? S.bindings.map(c=>toIdFromBinding(c,S.typeId)).filter(Boolean)
        : A(raw).map(Number).filter(Boolean);

      if(!S.ids.length){ ui.rows.innerHTML='<tr><td colspan="8" class="muted">Нет привязок</td></tr>'; ui.hint.textContent=''; return; }
      fetchItems(S.ids, items=>{ S.items=items; render(); ui.hint.textContent=''; });
    });
  }

  function fetchItems(ids, cb){
    BX24.callMethod('crm.item.list',{
      entityTypeId:S.typeId, filter:{'@id':ids},
      select:['id','title','stageId',COLS.assigned,COLS.address,COLS.shipType,COLS.shipDate]
    }, r=>{
      if(!r.error()) return cb(r.data().items||[]);
      const calls={}; ids.forEach((id,i)=>calls['g'+i]=['crm.item.get',{entityTypeId:S.typeId,id}]);
      BX24.callBatch(calls,res=>{ const arr=[]; for(const k in res){ if(!res[k].error()) arr.push(res[k].data().item); } cb(arr); }, true);
    });
  }

  function render(){
    if(!S.items.length){ ui.rows.innerHTML='<tr><td colspan="8" class="muted">Пусто</td></tr>'; return; }
    ui.rows.innerHTML='';
    S.items.forEach(it=>{
      const id=it.id;
      const tr=document.createElement('tr');
      tr.innerHTML=\`
        <td>\${id}</td>
        <td><a class="link" data-open="\${id}">\${it[COLS.title]||('#'+id)}</a></td>
        <td>\${it[COLS.assigned] ?? '—'}</td>
        <td><span class="chip">\${it[COLS.stageId] ?? '—'}</span></td>
        <td>\${it[COLS.address] ?? '—'}</td>
        <td>\${it[COLS.shipType] ?? '—'}</td>
        <td>\${it[COLS.shipDate] ?? '—'}</td>
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

  ui.ref.onclick = load;
  ui.add.onclick = ()=>{
    const raw = prompt('Введите ID элементов смарт-процесса через запятую');
    if(!raw) return;
    const ids = raw.split(',').map(s=>Number(s.trim())).filter(Boolean);
    if(ids.length) attach(ids);
  };
  </script>
</body></html>`;

    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // ВАЖНО: вернули 'unsafe-eval' и оставили iframe-только от вашего портала
        'content-security-policy':
          "default-src 'self' data: blob:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src *; " +
          "frame-ancestors " + PORTAL + " https://*.bitrix24.kz",
        'cache-control': 'no-store'
      }
    });
  }
};
