export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Отдаём статические ассеты (например, /bx24.js, /favicon.ico, /style.css и т. п.)
    if (
      url.pathname !== "/" &&
      /\.(?:js|css|png|jpg|jpeg|gif|svg|ico|map|txt|json)$/i.test(url.pathname)
    ) {
      // В Pages Functions это вернёт статический файл из проекта
      if (env && env.ASSETS && env.ASSETS.fetch) {
        return env.ASSETS.fetch(request);
      }
    }

    const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<title>Лицензии</title>
<link rel="preconnect" href="https://api.bitrix24.com">
<style>
  :root{
    --gap:12px;--radius:10px;--line:#eceff2;--text:#1d2129;--muted:#6b7280;
    --primary:#3bc8f5;--primary-700:#12b1e3;--primary-600:#3eddff;
    --bg:#f6f8fb;--card:#fff;
  }
  html,body{height:100%}
  body{margin:0;font:14px/1.45 Inter,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue","Noto Sans","Apple Color Emoji","Segoe UI Emoji",sans-serif;color:var(--text);background:var(--bg)}
  .app{display:flex;flex-direction:column;height:100vh;padding:20px;box-sizing:border-box}
  .toolbar{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .title{font-size:26px;font-weight:700;margin-right:auto}
  .btn{appearance:none;border:1px solid var(--primary);background:var(--primary);color:#fff;padding:9px 14px;border-radius:8px;cursor:pointer;transition:filter .15s ease, background .15s ease, border-color .15s ease;font-weight:600}
  .btn.secondary{background:#fff;color:var(--text);border-color:#cfd6df}
  .btn:hover{filter:brightness(1.02)} .btn:active{filter:brightness(.96)}
  .toolbar .right{margin-left:auto;display:flex;align-items:center;gap:8px}
  .perpage{display:flex;align-items:center;gap:8px;color:var(--muted)}
  .perpage select{padding:6px 8px;border:1px solid #cfd6df;border-radius:8px;background:#fff}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;display:flex;flex-direction:column;min-height:0}
  .table-wrap{min-height:0;height:calc(100vh - 130px);overflow:auto;border-top:1px solid var(--line)}
  table{width:100%;border-collapse:separate;border-spacing:0}
  thead th{position:sticky;top:0;z-index:3;background:var(--card);border-bottom:1px solid var(--line);text-align:left;font-weight:700;padding:12px}
  tbody td{border-bottom:1px solid var(--line);padding:10px 12px;vertical-align:middle}
  tbody tr:hover{background:#fafcff}
  .muted{color:var(--muted)} .link{color:#1677ff;cursor:pointer;text-decoration:none}
  .row-actions{display:flex;gap:6px} .btn-sm{padding:6px 10px;border-radius:7px;font-size:13px}
  .pill{display:inline-block;min-width:120px;height:8px;background:#edf2f7;border-radius:999px;position:relative;overflow:hidden}
  .pill .bar{position:absolute;left:0;top:0;bottom:0;width:0;background:#a0aec0;transition:width .25s ease}
  .stage-name{font-weight:600}
  .filters{display:grid;grid-template-columns: 1.2fr .8fr .8fr .9fr .8fr .8fr 1fr .7fr 120px;gap:8px;align-items:center;padding:12px}
  .filters input,.filters select{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cfd6df;border-radius:8px;background:#fff}
  .col-hidden{display:none}
  .modal{position:fixed;inset:0;background:rgba(16,24,40,.45);display:none;align-items:center;justify-content:center;z-index:1000}
  .modal.show{display:flex}
  .modal-card{width:min(860px,95vw);background:#fff;border-radius:14px;border:1px solid var(--line);box-shadow:0 20px 40px rgba(16,24,40,.2);overflow:hidden;display:flex;flex-direction:column;max-height:85vh}
  .modal-head{padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px}
  .modal-head .title{font-size:18px;margin:0}
  .modal-body{padding:14px 16px;overflow:auto}
  .modal-foot{padding:14px 16px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end}
  .list{display:grid;gap:8px} .list .itm{display:flex;align-items:center;gap:12px;padding:8px;border:1px solid #e7ecf3;border-radius:10px}
  .w100{width:100%}
  .danger{background:#fff;border-color:#ff6e6e;color:#b42323}
  .danger:hover{background:#ffecec}
  .ghost{background:#fff;border-color:#cfd6df}
  .ghost:hover{background:#fafbff}
  .switcher{display:flex;gap:10px} .switcher label{display:flex;align-items:center;gap:6px}
</style>
</head>
<body>
<div class="app">
  <div class="toolbar">
    <div class="title">Лицензии</div>
    <button id="btnNew" class="btn">Новый элемент</button>
    <button id="btnPick" class="btn secondary">Выбрать элемент</button>
    <button id="btnRefresh" class="btn secondary">Обновить</button>
    <button id="btnCols" class="btn ghost">Колонки</button>
    <div class="right perpage">
      <span>Показывать по:</span>
      <select id="perPage"><option value="10">10</option><option value="30">30</option><option value="50">50</option></select>
    </div>
  </div>

  <div class="card">
    <div class="filters" id="filters">
      <input id="f_title" placeholder="Фильтр по названию">
      <input id="f_key" placeholder="Ключ">
      <input id="f_portal" placeholder="Адрес портала">
      <select id="f_tariff"><option value="">Тариф</option></select>
      <input id="f_endT" type="date" placeholder="Окончание тарифа">
      <input id="f_endM" type="date" placeholder="Окончание подписки">
      <select id="f_product"><option value="">Продукт</option></select>
      <select id="f_stage"><option value="">Стадия</option></select>
      <div></div>
    </div>

    <div class="table-wrap">
      <table id="grid">
        <thead>
        <tr id="thead">
          <th data-col="stage">Стадия</th>
          <th data-col="dealId">ID исходной сделки</th>
          <th data-col="licKey">Лицензионный ключ</th>
          <th data-col="portal">Адрес портала</th>
          <th data-col="tariff">Текущий тариф</th>
          <th data-col="endT">Окончание тарифа</th>
          <th data-col="endM">Окончание подписки</th>
          <th data-col="product">Продукт</th>
          <th data-col="actions">Действия</th>
        </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- модалка выбора -->
<div class="modal" id="dlgPick">
  <div class="modal-card">
    <div class="modal-head">
      <div class="title">Выбор элементов</div>
      <input id="pickSearch" class="w100" placeholder="Поиск по названию">
    </div>
    <div class="modal-body"><div id="pickList" class="list"></div></div>
    <div class="modal-foot">
      <button class="btn ghost" id="btnPickClose">Отмена</button>
      <button class="btn" id="btnPickApply">Добавить</button>
    </div>
  </div>
</div>

<!-- модалка колонок -->
<div class="modal" id="dlgCols">
  <div class="modal-card">
    <div class="modal-head"><div class="title">Настройка колонок</div></div>
    <div class="modal-body"><div class="switcher" id="colsSwitch"></div></div>
    <div class="modal-foot">
      <button class="btn ghost" id="btnColsClose">Отмена</button>
      <button class="btn" id="btnColsSave">Сохранить</button>
    </div>
  </div>
</div>

<!-- Вариант 1: CDN -->
<script src="https://api.bitrix24.com/api/v1/"></script>
<!-- Вариант 2 (локальный): раскомментируйте и положите файл в проект
<script src="/bx24.js"></script>
-->

<script>
(() => {
  // ===== Конфиг
  const ENTITY_TYPE_ID = 1032;
  const DEAL_LINK_FIELD = 'UF_CRM_1755533553'; // связи в сделке (мульти)
  const UF = {
    DEAL_ID:    'ufCrm_10_1717328665682',
    LIC_KEY:    'ufCrm_10_1717328730625',
    PORTAL_URL: 'ufCrm_10_1717328814784',
    TARIFF:     'ufCrm_10_1717329015552',
    END_TARIFF: 'ufCrm_10_1717329087589',
    END_MARKET: 'ufCrm_10_1717329109963',
    PRODUCT:    'ufCrm_10_1717329453779'
  };

  const state = {
    dealId: null,
    linkedIds: new Set(),
    items: [],
    perPage: Number(localStorage.getItem('perPage') || '10'),
    fields: null,
    enums: { tariff: new Map(), product: new Map() },
    stagesByCat: new Map(),
    stageMap: new Map(),
    stageList: [],
    cols: JSON.parse(localStorage.getItem('cols') || '{"stage":true,"dealId":true,"licKey":true,"portal":true,"tariff":true,"endT":true,"endM":true,"product":true,"actions":true}')
  };

  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const on = (el,ev,fn)=>el.addEventListener(ev,fn);

  document.addEventListener('DOMContentLoaded', () => {
    $('#perPage').value = String(state.perPage);
    on($('#btnNew'), openCreate);
    on($('#btnPick'), openPicker);
    on($('#btnRefresh'), refresh);
    on($('#btnCols'), openCols);
    on($('#perPage'), e => { state.perPage = Number(e.target.value); localStorage.setItem('perPage', state.perPage); render(); });

    ['f_title','f_key','f_portal','f_tariff','f_endT','f_endM','f_product','f_stage'].forEach(id => on($('#'+id),'input', debounce(render,300)));

    on($('#btnPickClose'), ()=>closeModal('#dlgPick'));
    on($('#pickSearch'),'input', debounce(loadPickList,350));
    on($('#btnPickApply'), applyPicked);

    on($('#btnColsClose'), ()=>closeModal('#dlgCols'));
    on($('#btnColsSave'), saveCols);

    safeInit();
  });

  function bxInit(timeout=5000){
    return new Promise((resolve,reject)=>{
      let done=false;
      BX24.init(()=>{done=true;resolve();});
      setTimeout(()=>!done && reject(new Error('BX24.init timeout')), timeout);
    });
  }
  async function safeInit(){
    try{ await bxInit(6000); }catch(e){ console.warn('BX24.init timeout — продолжим оффлайн', e); }
    await bootstrap();
  }

  async function bootstrap(){
    try{
      state.dealId = await getDealId();
      state.fields = await api('crm.item.fields', {entityTypeId: ENTITY_TYPE_ID});
      buildEnums(); fillEnumSelects();
      await loadStages(); fillStageSelect();

      if (state.dealId) state.linkedIds = await loadLinkedSet(state.dealId);
      await loadItems();
      buildColsUi();
      render();
    }catch(e){
      console.error('bootstrap:', e);
      render();
    }
  }

  function api(method, params={}){
    return new Promise((resolve,reject)=>{
      BX24.callMethod(method, params, res=>{
        if (res.error()){
          reject(new Error((res.error()||'API error') + ': ' + (res.answer?.error_description||'')));
        } else resolve(res.data());
      });
    });
  }

  async function getDealId(){
    try{
      const info = await new Promise(r=>BX24.placement.info(r));
      if (info?.options?.ID) return Number(info.options.ID);
    }catch(e){}
    const m = location.search.match(/ID=(\\d+)/i) || location.hash.match(/ID=(\\d+)/i);
    return m ? Number(m[1]) : null;
  }

  async function loadLinkedSet(dealId){
    const d = await api('crm.deal.get', {id: dealId});
    const raw = d[DEAL_LINK_FIELD] || [];
    const set = new Set();
    const push = v=>{
      if (typeof v==='number') set.add(v);
      else if (typeof v==='string'){
        const m = v.match(/DYNAMIC_1032_(\\d+)/i);
        if (m) set.add(Number(m[1]));
        else if (/^\\d+$/.test(v)) set.add(Number(v));
      }
    };
    if (Array.isArray(raw)) raw.forEach(push); else push(raw);
    return set;
  }

  async function saveLinkSet(){
    if (!state.dealId) return;
    const arr = Array.from(state.linkedIds).map(id => 'DYNAMIC_1032_'+id);
    await api('crm.deal.update', {id: state.dealId, fields: {[DEAL_LINK_FIELD]: arr}});
  }

  function buildEnums(){
    const f = state.fields.fields || state.fields;
    const tariff = f['ufCrm10_1717329015552'] || f['UF_CRM_10_1717329015552'];
    const product = f['ufCrm10_1717329453779'] || f['UF_CRM_10_1717329453779'];
    if (tariff?.items) tariff.items.forEach(i => state.enums.tariff.set(i.ID, i.VALUE));
    if (product?.items) product.items.forEach(i => state.enums.product.set(i.ID, i.VALUE));
  }
  function fillEnumSelects(){
    const tSel = $('#f_tariff'); const pSel = $('#f_product');
    for (const [id,name] of state.enums.tariff){ const o=document.createElement('option'); o.value=id; o.textContent=name; tSel.appendChild(o); }
    for (const [id,name] of state.enums.product){ const o=document.createElement('option'); o.value=id; o.textContent=name; pSel.appendChild(o); }
  }

  async function loadStages(){
    let cats = [];
    try{
      const r = await api('crm.item.category.list', {entityTypeId: ENTITY_TYPE_ID});
      cats = (r && r.categories) || r || [];
    }catch(e){ cats = [{id:0,name:'Общая'}]; }

    state.stagesByCat.clear(); state.stageMap.clear(); state.stageList=[];

    for (const c of cats){
      const cid = Number(c.id || c.ID || 0);
      const entityId = 'DYNAMIC_'+ENTITY_TYPE_ID+'_STAGE_'+cid;
      let list = [];
      try{ list = await api('crm.status.list', { filter: {ENTITY_ID: entityId}, order: {SORT:'ASC'} }); }
      catch(e){ list = []; }

      const order = [];
      for (const s of list){
        const sid = String(s.STATUS_ID || s.ID || '');
        if (!sid) continue;
        const obj = { ID: sid, NAME: (s.NAME||s.TITLE||sid), SORT: Number(s.SORT||0), CATEGORY_ID: cid };
        order.push(sid);
        state.stageMap.set(sid, obj);
        state.stageList.push(obj);
      }
      order.sort((a,b)=> (state.stageMap.get(a).SORT||0) - (state.stageMap.get(b).SORT||0));
      state.stagesByCat.set(cid, order);
    }
  }
  function fillStageSelect(){
    const sSel = $('#f_stage');
    state.stageList.forEach(st=>{ const o=document.createElement('option'); o.value=st.ID; o.textContent=st.NAME; sSel.appendChild(o); });
  }

  function getFilters(){
    return {
      title:   $('#f_title').value.trim().toLowerCase(),
      licKey:  $('#f_key').value.trim().toLowerCase(),
      portal:  $('#f_portal').value.trim().toLowerCase(),
      tariff:  $('#f_tariff').value,
      endT:    $('#f_endT').value,
      endM:    $('#f_endM').value,
      product: $('#f_product').value,
      stage:   $('#f_stage').value
    };
  }

  async function loadItems(){
    if (!state.linkedIds.size){ state.items=[]; return; }
    const ids = Array.from(state.linkedIds);
    const select = [
      'id','title','assignedById','stageId','categoryId',
      UF.DEAL_ID,UF.LIC_KEY,UF.PORTAL_URL,UF.TARIFF,UF.END_TARIFF,UF.END_MARKET,UF.PRODUCT
    ];
    const filter = {'@id': ids};
    const order = {id:'asc'};
    const list = await api('crm.item.list', { entityTypeId: ENTITY_TYPE_ID, filter, order, select, start: -1 });
    state.items = list.items || list || [];
  }

  function applyRowFilter(it){
    const f = getFilters();
    const title = (it.title||'').toLowerCase();
    const lic = ((it[UF.LIC_KEY]||'')+'').toLowerCase();
    const portal = ((it[UF.PORTAL_URL]||'')+'').toLowerCase();
    const tariff = it[UF.TARIFF]||'';
    const product = it[UF.PRODUCT]||'';
    const endT = it[UF.END_TARIFF]||'';
    const endM = it[UF.END_MARKET]||'';
    const stageId = it.stageId||'';

    if (f.title && !title.includes(f.title)) return false;
    if (f.licKey && !lic.includes(f.licKey)) return false;
    if (f.portal && !portal.includes(f.portal)) return false;
    if (f.tariff && String(tariff)!==String(f.tariff)) return false;
    if (f.product && String(product)!==String(f.product)) return false;
    if (f.stage && String(stageId)!==String(f.stage)) return false;
    if (f.endT && String(endT).slice(0,10)!==f.endT) return false;
    if (f.endM && String(endM).slice(0,10)!==f.endM) return false;
    return true;
  }

  function render(){
    applyCols();
    const tb = $('#tbody'); tb.innerHTML='';
    const items = state.items.filter(applyRowFilter);
    const pageSize = state.perPage;
    const slice = items.slice(0, pageSize);
    slice.forEach(it => tb.appendChild(renderRow(it)));
  }

  function tdText(val, col){ const td=document.createElement('td'); td.dataset.col=col; td.textContent = (val??'—')||'—'; return td; }

  function renderRow(it){
    const tr = document.createElement('tr');

    const stageId = it.stageId || '';
    const st = state.stageMap.get(String(stageId));
    const stName = st ? st.NAME : '—';

    const stageTd = document.createElement('td'); stageTd.dataset.col='stage';
    const pill = document.createElement('div'); pill.className='pill';
    let pct=0; const order = state.stagesByCat.get(Number(it.categoryId)||0) || []; const idx=Math.max(0,order.indexOf(String(stageId)));
    if (order.length) pct = Math.round(((idx+1)/order.length)*100);
    pill.innerHTML='<div class="bar" style="width:'+pct+'%"></div>';
    const nm=document.createElement('div'); nm.className='stage-name muted'; nm.textContent=stName;
    stageTd.appendChild(pill); stageTd.appendChild(nm);

    const dealId = it[UF.DEAL_ID] ?? '—';
    const lic = it[UF.LIC_KEY] ?? '—';
    const url = it[UF.PORTAL_URL] ?? '';
    const tariff = state.enums.tariff.get(String(it[UF.TARIFF])) || '—';
    const endT = it[UF.END_TARIFF] ? String(it[UF.END_TARIFF]).slice(0,10) : '—';
    const endM = it[UF.END_MARKET] ? String(it[UF.END_MARKET]).slice(0,10) : '—';
    const product = state.enums.product.get(String(it[UF.PRODUCT])) || '—';

    const dealTd = tdText(dealId,'dealId');
    const licTd  = tdText(lic,'licKey');
    const urlTd  = document.createElement('td'); urlTd.dataset.col='portal';
    if (url){ const a=document.createElement('a'); a.href=url; a.target='_blank'; a.textContent=url; a.className='link'; urlTd.appendChild(a); } else urlTd.textContent='—';
    const tariffTd = tdText(tariff,'tariff');
    const endTTd   = tdText(endT,'endT');
    const endMTd   = tdText(endM,'endM');
    const prodTd   = tdText(product,'product');

    const actTd = document.createElement('td'); actTd.dataset.col='actions';
    const btnOpen = document.createElement('button'); btnOpen.className='btn btn-sm ghost'; btnOpen.textContent='Открыть'; btnOpen.onclick=()=>openItem(it.id);
    const btnDel  = document.createElement('button'); btnDel.className='btn btn-sm danger'; btnDel.textContent='Удалить'; btnDel.onclick=()=>removeLink(it.id);
    const wrap = document.createElement('div'); wrap.className='row-actions'; wrap.appendChild(btnOpen); wrap.appendChild(btnDel); actTd.appendChild(wrap);

    tr.appendChild(stageTd); tr.appendChild(dealTd); tr.appendChild(licTd); tr.appendChild(urlTd);
    tr.appendChild(tariffTd); tr.appendChild(endTTd); tr.appendChild(endMTd); tr.appendChild(prodTd); tr.appendChild(actTd);
    return tr;
  }

  function openItem(id){ BX24.openPath('/crm/type/'+ENTITY_TYPE_ID+'/details/'+id+'/'); }
  function openCreate(){ BX24.openPath('/crm/type/'+ENTITY_TYPE_ID+'/details/0/'); }
  async function removeLink(id){ if (!state.dealId) return; state.linkedIds.delete(Number(id)); await saveLinkSet(); await loadItems(); render(); }
  async function refresh(){ await loadItems(); render(); }

  function buildColsUi(){
    const m = [
      ['stage','Стадия'],['dealId','ID исходной сделки'],['licKey','Ключ'],
      ['portal','Адрес портала'],['tariff','Текущий тариф'],['endT','Окончание тарифа'],
      ['endM','Окончание подписки'],['product','Продукт'],['actions','Действия']
    ];
    const host = $('#colsSwitch'); host.innerHTML='';
    m.forEach(([k,caption])=>{
      const id = 'col_'+k;
      const label = document.createElement('label');
      label.innerHTML = '<input type="checkbox" '+(state.cols[k]?'checked':'')+' id="'+id+'"><span>'+caption+'</span>';
      host.appendChild(label);
    });
  }
  function openCols(){ openModal('#dlgCols'); }
  function saveCols(){
    $$('#colsSwitch input[type="checkbox"]').forEach(ch=>{ const key=ch.id.replace(/^col_/,''); state.cols[key]=ch.checked; });
    localStorage.setItem('cols', JSON.stringify(state.cols));
    closeModal('#dlgCols'); applyCols();
  }
  function applyCols(){
    $$('#thead th').forEach(th=>{ const key=th.dataset.col; th.classList.toggle('col-hidden', !state.cols[key]); });
    $$('#tbody td').forEach(td=>{ const key=td.dataset.col; td.classList.toggle('col-hidden', !state.cols[key]); });
  }

  function openModal(sel){ $(sel).classList.add('show'); }
  function closeModal(sel){ $(sel).classList.remove('show'); }

  function debounce(fn,ms){ let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms);} }

})();
</script>
</body>
</html>`;

    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" }});
  }
};
