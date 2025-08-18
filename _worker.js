export default {
  async fetch(request) {
    // ------------- CONFIG -------------
    const CONFIG = {
      DEAL_FIELD_CODE: 'UF_CRM_1755533553', // ваше поле сделки (множественное)
      SMART_ENTITY_TYPE_ID: 196,            // <-- УКАЖИТЕ ID вашего смарт-процесса!
      PORTAL_ORIGIN: 'https://tehprof.bitrix24.kz', // для frame-ancestors
    };
    // -----------------------------------

    // подтянем SDK сервер-сайд и заинлайнем
    let sdk = '';
    try { const r = await fetch('https://api.bitrix24.com/api/v1/'); sdk = await r.text(); }
    catch { sdk = "throw new Error('BX24 SDK fetch failed');"; }

    // HTML страницы — возвращаем один и тот же на GET/POST 200
    const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8" />
<title>Виджет сделки</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
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
  input[type="text"]{border:1px solid var(--line);border-radius:10px;padding:8px 10px}
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
        <th style="width:72px">ID</th>
        <th>Название</th>
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

  <!-- SDK Bitrix24 (инлайн) -->
  <script>${sdk}</script>

  <script>
  const CFG = ${JSON.stringify({
    FIELD: 'UF_CRM_1755533553',
    TYPE_ID: 196, // ВАЖНО: замените после деплоя!
  })};

  const $ = s => document.querySelector(s);
  const ui = { id:$('#dealId'), plc:$('#placement'), rows:$('#rows'), hint:$('#hint'), add:$('#btnAdd'), ref:$('#btnRefresh') };

  const normArr = v => !v ? [] : (Array.isArray(v) ? v : [v]);
  const bindingCode = (typeId,id) => \`DYNAMIC_\${typeId}_\${id}\`;
  const parseBindingToId = (code,typeId) => {
    if (typeof code!=='string' || !code.startsWith('DYNAMIC_')) return null;
    const m = code.match(/DYNAMIC_(\\d+)_(\\d+)/);
    if (!m) return null;
    if (Number(m[1]) !== Number(typeId)) return null;
    return Number(m[2]);
  };
  const detectMode = (raw) => {
    const a = normArr(raw);
    return a.some(v => typeof v === 'string' && v.startsWith('DYNAMIC_')) ? 'bindings' : 'ids';
  };

  const COLS = { title:'title', stageId:'stageId', assigned:'assignedById', address:'UF_ADDRESS', shipType:'UF_SHIP_METHOD', shipDate:'UF_SHIP_DATE' };

  const state = { dealId:null, mode:'ids', bindings:[], ids:[], items:[] };

  function renderRows(){
    if (!state.items.length){ ui.rows.innerHTML = '<tr><td colspan="8" class="muted">Пока пусто</td></tr>'; return; }
    ui.rows.innerHTML = '';
    state.items.forEach(it=>{
      const tr = document.createElement('tr');
      const id = it.id;
      tr.innerHTML = \`
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
    ui.rows.querySelectorAll('[data-open]').forEach(n=>n.onclick=()=>BX24.openPath(\`/crm/type/\${CFG.TYPE_ID}/details/\${n.getAttribute('data-open')}/\`));
    ui.rows.querySelectorAll('[data-del]').forEach(n=>n.onclick=()=>detachItem(Number(n.getAttribute('data-del'))));
  }

  function fetchItems(ids, cb){
    BX24.callMethod('crm.item.list', {
      entityTypeId: CFG.TYPE_ID, filter: { '@id': ids },
      select: ['id','title','stageId', COLS.assigned, COLS.address, COLS.shipType, COLS.shipDate]
    }, r=>{
      if (!r.error()) return cb(r.data().items||[]);
      // fallback: батч по get
      const calls={}; ids.forEach((id,i)=>calls['g'+i]=['crm.item.get',{entityTypeId:CFG.TYPE_ID,id}]);
      BX24.callBatch(calls, res=>{
        const arr=[]; for(const k in res){ if(!res[k].error()) arr.push(res[k].data().item); }
        cb(arr);
      }, true);
    });
  }

  function load(){
    ui.hint.textContent = 'Загрузка…';
    BX24.callMethod('crm.deal.get', {id: state.dealId}, r=>{
      if (r.error()){ ui.rows.innerHTML = '<tr><td colspan="8" class="err">'+r.error_description()+'</td></tr>'; ui.hint.textContent=''; return; }
      const deal = r.data();
      const raw = deal[CFG.FIELD];
      state.mode = detectMode(raw);
      state.bindings = normArr(raw);
      state.ids = (state.mode==='bindings')
        ? state.bindings.map(c=>parseBindingToId(c, CFG.TYPE_ID)).filter(Boolean)
        : normArr(raw).map(v=>Number(v)).filter(Boolean);
      if (!state.ids.length){ ui.rows.innerHTML = '<tr><td colspan="8" class="muted">Нет привязок</td></tr>'; ui.hint.textContent=''; return; }
      fetchItems(state.ids, items=>{ state.items = items; renderRows(); ui.hint.textContent=''; });
    });
  }

  function saveBindings(nextArray){
    const fields = {}; fields[CFG.FIELD] = nextArray;
    BX24.callMethod('crm.deal.update', { id: state.dealId, fields }, r=>{
      if (r.error()) ui.hint.textContent = r.error_description(); else load();
    });
  }

  function attach(ids){
    if (state.mode === 'bindings'){
      const add = ids.map(id=>bindingCode(CFG.TYPE_ID,id));
      const uniq = Array.from(new Set([...(state.bindings||[]), ...add]));
      saveBindings(uniq);
    } else {
      const uniq = Array.from(new Set([...(normArr(state.bindings).map(Number)), ...ids]));
      saveBindings(uniq);
    }
  }
  function detachItem(id){
    if (state.mode === 'bindings'){
      const code = bindingCode(CFG.TYPE_ID,id);
      const next = (state.bindings||[]).filter(c=>c!==code);
      saveBindings(next);
    } else {
      const next = normArr(state.bindings).map(Number).filter(v=>v!==id);
      saveBindings(next);
    }
  }

  function fit(){ try{ BX24 && BX24.resizeWindow(document.documentElement.scrollHeight, 200); }catch(e){} }

  // старт
  BX24.init(function(){
    BX24.placement.info(function(info){
      ui.plc.textContent = info?.placement || '—';
      const id = info?.options?.ID || info?.options?.ENTITY_ID || null;
      state.dealId = Number(id)||null; ui.id.textContent = state.dealId || '—';
      if (!state.dealId){ ui.rows.innerHTML = '<tr><td colspan="8" class="err">Нет ID сделки</td></tr>'; return; }
      load(); fit();
    });
  });

  ui.ref.onclick = load;
  ui.add.onclick = ()=>{
    const raw = prompt('Введите ID элементов смарт-процесса через запятую');
    if (!raw) return;
    const ids = raw.split(',').map(s=>Number(s.trim())).filter(Boolean);
    if (ids.length) attach(ids);
  };

  addEventListener('load',fit); addEventListener('resize',fit); setInterval(fit,900);
  </script>
</body></html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Ничего внешнего не требуется (SDK инлайн), разрешаем только ваш портал
        'content-security-policy':
          "default-src 'self' data: blob:; " +
          "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
          "connect-src *; frame-ancestors " + CONFIG.PORTAL_ORIGIN + " https://*.bitrix24.kz",
        'cache-control': 'no-store'
      }
    });
  }
};
