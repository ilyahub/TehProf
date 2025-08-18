<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Виджет: связанные заказы</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- ВАЖНО: SDK уже должен быть вшит инлайном в _worker.js, отдельный <script src> не нужен -->
  <style>
    :root { --bg:#f5f7fb; --ink:#111827; --mut:#6b7280; --line:#e5e7eb; --blue:#3b82f6; --green:#059669; --red:#dc2626; }
    body{margin:0;padding:24px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;background:var(--bg);color:var(--ink)}
    h1{margin:0 0 12px;font-size:36px;color:#60a5fa;font-weight:800}
    .toolbar{display:flex;gap:8px;align-items:center;margin:6px 0 16px}
    .btn{padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer}
    .btn.primary{background:var(--blue);color:#fff;border-color:var(--blue)}
    .btn.ghost{background:transparent}
    .pill{padding:2px 8px;border-radius:9999px;background:#eef2ff;color:#4338ca;font-weight:600;font-size:12px}
    .muted{color:var(--mut)}
    table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
    th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
    th{background:#fafbff;color:#374151;text-align:left;font-weight:700}
    tr:last-child td{border-bottom:none}
    .actions{display:flex;gap:8px}
    .link{color:var(--blue);cursor:pointer;text-decoration:none}
    .status{display:inline-block;min-width:64px;height:8px;background:#eee;border-radius:8px;position:relative;overflow:hidden}
    .status > i{position:absolute;left:0;top:0;bottom:0;width:30%;background:#a5b4fc}
    .tiny{font-size:12px}
    .warn{color:#d97706}
    .ok{color:var(--green)} .err{color:var(--red)}
    .grid2{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;margin-bottom:8px}
    .field{display:flex;gap:8px;align-items:center}
    .chip{display:inline-flex;gap:6px;align-items:center;padding:4px 8px;background:#f3f4f6;border:1px solid var(--line);border-radius:999px}
    input[type="number"],input[type="text"]{border:1px solid var(--line);border-radius:10px;padding:8px 10px}
  </style>
</head>
<body>
  <h1>Виджет сделки</h1>

  <div class="grid2 tiny muted">
    <div>Deal ID:</div><div id="dealId">—</div>
    <div>Placement:</div><div id="placement">—</div>
  </div>

  <div class="toolbar">
    <span class="pill">Связанные элементы SPA</span>
    <button class="btn primary" id="btnAdd">Добавить</button>
    <button class="btn" id="btnRefresh">Обновить</button>
    <span class="muted tiny" id="hint"></span>
  </div>

  <table id="tbl">
    <thead>
      <tr>
        <th style="width:72px">ID</th>
        <th>Название</th>
        <th style="width:160px">Ответственный</th>
        <th style="width:160px">Стадия</th>
        <th style="width:180px">Адрес доставки</th>
        <th style="width:160px">Способ доставки</th>
        <th style="width:140px">Дата поставки</th>
        <th style="width:160px">Действия</th>
      </tr>
    </thead>
    <tbody id="rows"><tr><td colspan="8" class="muted">Загрузка…</td></tr></tbody>
  </table>

  <script>
  // =============== CONFIG =====================
  const CONFIG = {
    SMART_ENTITY_TYPE_ID:  /*** УКАЖИ ***/  196,                 // <– ID вашего смарт-процесса
    DEAL_FIELD_CODE:       /*** УКАЖИ ***/ 'UF_CRM_SMART_ORDERS',// <– код поля сделки (мульти «Связь с элементами CRM»)
    // Маппинг колонок -> коды полей SPA (подставь свои UF_* при нужде)
    COLS: {
      title:     'title',           // Заголовок элемента
      stageId:   'stageId',         // Код стадии
      assigned:  'assignedById',    // ID ответственного (покажем ID; при желании можно дорезолвить имя)
      address:   'UF_ADDRESS',      // Пример: код поля «Адрес доставки»
      shipType:  'UF_SHIP_METHOD',  // Пример: код поля «Способ доставки»
      shipDate:  'UF_SHIP_DATE'     // Пример: код поля «Дата поставки»
    }
  };
  // ============================================

  // Утилиты
  const $ = sel => document.querySelector(sel);
  const ui = {
    id:        $('#dealId'),
    plc:       $('#placement'),
    rows:      $('#rows'),
    hint:      $('#hint'),
    btnAdd:    $('#btnAdd'),
    btnRefresh:$('#btnRefresh'),
  };
  const b = {
    bindings: [],        // массив кодов вида DYNAMIC_<type>_<id>
    ids:      [],        // числа ID для текущего typeId
    items:    [],        // загруженные элементы SPA
    dealId:   null
  };

  function bindingCode(typeId, id){ return `DYNAMIC_${typeId}_${id}`; }
  function parseBindingToId(code, typeId){
    if (!code || !String(code).includes(String(typeId))) return null;
    const m = String(code).match(/(?:^|[_:])(\d+)$/);
    return m ? Number(m[1]) : null;
  }
  function normArray(v){ if(!v) return []; return Array.isArray(v) ? v : [v]; }
  function safe(s){ return (s==null||s==='') ? '—' : s; }

  // Загружаем данные виджета
  ready();
  function ready(){
    BX24.init(function(){
      BX24.placement.info(function(info){
        ui.plc.textContent = info?.placement || '—';
        const opts = info?.options || {};
        const id = opts?.ID || opts?.ENTITY_ID || null;
        ui.id.textContent = id || '—';
        b.dealId = Number(id);
        if (!b.dealId) { ui.rows.innerHTML = '<tr><td colspan="8" class="err">Не удалось получить ID сделки</td></tr>'; return; }
        loadAndRender();
      });
    });
  }

  async function loadAndRender(){
    ui.hint.textContent = 'Загрузка…';
    // 1) читаем сделку — поле с привязками
    BX24.callMethod('crm.deal.get', { id: b.dealId }, function(r){
      if (r.error()) { ui.rows.innerHTML = `<tr><td colspan="8" class="err">${r.error_description()}</td></tr>`; return; }
      const deal = r.data();
      const raw = deal[CONFIG.DEAL_FIELD_CODE];
      b.bindings = normArray(raw);
      // Вытаскиваем id для нужного типа
      b.ids = b.bindings.map(code => parseBindingToId(code, CONFIG.SMART_ENTITY_TYPE_ID)).filter(Boolean);
      if (!b.ids.length){
        ui.rows.innerHTML = '<tr><td colspan="8" class="muted">Пока нет связанных элементов</td></tr>';
        ui.hint.textContent = '';
        return;
      }
      // 2) грузим элементы SPA пачкой
      fetchItems(b.ids, function(items){
        b.items = items;
        renderTable();
        ui.hint.textContent = '';
      });
    });
  }

  function fetchItems(ids, done){
    // пробуем list c IN-фильтром, если не поддержан — батчем по get
    BX24.callMethod('crm.item.list', {
      entityTypeId: CONFIG.SMART_ENTITY_TYPE_ID,
      filter: { '@id': ids },
      select: ['id','title','stageId', CONFIG.COLS.assigned, CONFIG.COLS.address, CONFIG.COLS.shipType, CONFIG.COLS.shipDate]
    }, function(r){
      if (!r.error()){
        done(r.data().items || []);
      } else {
        // fallback: батчем crm.item.get
        const calls = {};
        ids.forEach((id,i)=>{ calls['g'+i] = ['crm.item.get', { entityTypeId: CONFIG.SMART_ENTITY_TYPE_ID, id }]; });
        BX24.callBatch(calls, function(res){
          const arr = [];
          Object.keys(res).forEach(k=>{
            if (!res[k].error()) arr.push(res[k].data().item);
          });
          done(arr);
        }, true);
      }
    });
  }

  function renderTable(){
    if (!b.items.length){
      ui.rows.innerHTML = '<tr><td colspan="8" class="muted">Пусто</td></tr>';
      return;
    }
    ui.rows.innerHTML = '';
    b.items.forEach(it=>{
      const tr = document.createElement('tr');
      const id   = it.id;
      const name = it[CONFIG.COLS.title] || `#${id}`;
      const stage= it[CONFIG.COLS.stageId] || '—';
      const assigned = it[CONFIG.COLS.assigned] || '—';
      const addr = it[CONFIG.COLS.address] || '—';
      const type = it[CONFIG.COLS.shipType] || '—';
      const date = it[CONFIG.COLS.shipDate] || '—';
      tr.innerHTML = `
        <td>${id}</td>
        <td><a class="link" data-open="${id}">${safe(name)}</a></td>
        <td>${safe(assigned)}</td>
        <td><span class="chip">${safe(stage)}</span></td>
        <td>${safe(addr)}</td>
        <td>${safe(type)}</td>
        <td>${safe(date)}</td>
        <td class="actions">
          <button class="btn" data-open="${id}">Открыть</button>
          <button class="btn" data-del="${id}">Удалить</button>
        </td>`;
      ui.rows.appendChild(tr);
    });

    ui.rows.querySelectorAll('[data-open]').forEach(a=>{
      a.addEventListener('click', e=>{
        const id = Number(e.currentTarget.getAttribute('data-open'));
        BX24.openPath(`/crm/type/${CONFIG.SMART_ENTITY_TYPE_ID}/details/${id}/`);
      });
    });
    ui.rows.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        const id = Number(e.currentTarget.getAttribute('data-del'));
        detachItem(id);
      });
    });
  }

  // Добавление/удаление
  async function attachItems(ids){
    // добавляем к текущим биндингам
    const codesToAdd = ids.map(id => bindingCode(CONFIG.SMART_ENTITY_TYPE_ID, id));
    const uniq = new Set([...(b.bindings||[]), ...codesToAdd]);
    const next = Array.from(uniq);
    BX24.callMethod('crm.deal.update', { id: b.dealId, fields: { [CONFIG.DEAL_FIELD_CODE]: next } }, function(r){
      if (r.error()) { ui.hint.textContent = r.error_description(); return; }
      loadAndRender();
    });
  }
  function detachItem(id){
    const code = bindingCode(CONFIG.SMART_ENTITY_TYPE_ID, id);
    const next = (b.bindings||[]).filter(c => c !== code);
    BX24.callMethod('crm.deal.update', { id: b.dealId, fields: { [CONFIG.DEAL_FIELD_CODE]: next } }, function(r){
      if (r.error()) { ui.hint.textContent = r.error_description(); return; }
      loadAndRender();
    });
  }

  // Кнопки
  ui.btnRefresh.addEventListener('click', loadAndRender);

  ui.btnAdd.addEventListener('click', async ()=>{
    // 1) пробуем «красиво»: EntitySelector (если поддерживается)
    if (window.BX && BX.UI && BX.UI.EntitySelector){
      try{
        const dialog = new BX.UI.EntitySelector.Dialog({
          target: ui.btnAdd,
          entities: [{ id: 'dynamic', dynamicLoad: true, entityTypeId: CONFIG.SMART_ENTITY_TYPE_ID }],
          multiple: true,
          dropdownMode: true,
        });
        dialog.show();
        dialog.subscribe('onSave', ()=>{
          const ids = dialog.getSelectedItems().map(i=> Number(i.getId())).filter(Boolean);
          if (ids.length) attachItems(ids);
        });
        return;
      }catch(_){}
    }
    // 2) старый диалог выбора (если расширен до SPA)
    if (typeof BX24.selectCRM === 'function'){
      try{
        BX24.selectCRM({ entities: ['dynamic:'+CONFIG.SMART_ENTITY_TYPE_ID], multiple: true }, function(sel){
          const ids = (sel && sel['dynamic:'+CONFIG.SMART_ENTITY_TYPE_ID] || []).map(Number).filter(Boolean);
          if (ids.length) attachItems(ids);
        });
        return;
      }catch(_){}
    }
    // 3) самый простой фолбэк — просим ввести ID(ы)
    const raw = prompt('Введите ID элементов smарт-процесса через запятую');
    if (!raw) return;
    const ids = raw.split(',').map(s=>Number(s.trim())).filter(Boolean);
    if (ids.length) attachItems(ids);
  });
  </script>
</body>
</html>
