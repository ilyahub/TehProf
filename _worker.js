// _worker.js
// Cloudflare Pages/Workers — отдает страницу "Лицензии" для виджета в Битрикс24.

const HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Лицензии</title>
<style>
:root{
  --bg:#f5f7fb; --card:#fff; --line:#e7ebf2; --text:#1a1f36; --muted:#6b7280;
  --primary:#3bc8f5; --primary-300:#3eddff; --primary-700:#12b1e3; --danger:#ff5b6a;
}
html,body{height:100%} *{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;}
.container{max-width:1400px;margin:20px auto;padding:0 16px}
.header{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.header h1{margin:0;font-weight:800;letter-spacing:.2px}
.btn{
  --ui-btn-background:var(--primary); --ui-btn-background-hover:var(--primary-300);
  --ui-btn-background-active:var(--primary-700); --ui-btn-border-color:var(--primary);
  --ui-btn-border-color-hover:var(--primary-300); --ui-btn-border-color-active:var(--primary-700);
  --ui-btn-color:#fff;
  display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;
  border:1px solid var(--ui-btn-border-color);background:var(--ui-btn-background);color:var(--ui-btn-color);
  cursor:pointer;font-weight:600;text-decoration:none;white-space:nowrap;
}
.btn:hover{background:var(--ui-btn-background-hover);border-color:var(--ui-btn-border-color-hover)}
.btn:active{background:var(--ui-btn-background-active);border-color:var(--ui-btn-border-color-active)}
.btn.ghost{background:#fff;color:var(--text);border-color:var(--line)}
.btn.ghost:hover{border-color:var(--primary);color:var(--primary)}
.btn.danger{background:var(--danger);border-color:var(--danger)}

.right{margin-left:auto;display:flex;gap:8px;align-items:center}

.table-wrap{
  overflow:auto; background:#fff; border:1px solid var(--line); border-radius:14px;
  /* ключ: ограничиваем высоту в пределах окна, без бесконечного хвоста */
  max-height:calc(100vh - 170px);
  /* без фиксированной высоты — BX24.fitWindow подгоняет iFrame */
}

table{width:100%;border-collapse:separate;border-spacing:0}
thead th{
  position:sticky;top:0;background:#fff;z-index:2;padding:10px 12px;border-bottom:1px solid var(--line);
  text-align:left;font-weight:700
}
tbody td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
th:first-child,td:first-child{border-left:0;border-top-left-radius:14px}
th:last-child,td:last-child{border-right:0;border-top-right-radius:14px}
tr:last-child td{border-bottom:0}
a.link{color:#2471d6;text-decoration:none}
a.link:hover{text-decoration:underline}

/* фильтры в хедерах */
th .filter{display:block;margin-top:6px}
th .filter input{width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:8px}

/* Stage bar */
.crm-list-stage-bar{min-width:260px}
.crm-list-stage-bar-table{width:100%;border-collapse:collapse}
.crm-list-stage-bar-part{height:10px;padding:0}
.crm-list-stage-bar-part + .crm-list-stage-bar-part{padding-left:2px}
.crm-list-stage-bar-block{height:10px;border-radius:6px;background:#e8ecf3}
.crm-list-stage-bar-btn{height:10px;border-radius:6px}
.crm-list-stage-bar-title{margin-top:6px;font-size:12px;color:var(--muted)}
.stage-current .crm-list-stage-bar-block{background:var(--primary)}
.stage-done .crm-list-stage-bar-block{background:var(--primary)}
.stage-future .crm-list-stage-bar-block{background:#e8ecf3}
.stage-select{position:relative}
.stage-select .toggle{
  margin-left:8px;min-width:28px;height:28px;border-radius:8px;border:1px solid var(--line);
  background:#fff;cursor:pointer
}
.stage-menu{
  position:absolute;right:0;top:100%;margin-top:6px;min-width:220px;max-height:320px;overflow:auto;
  background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.08);
  display:none;z-index:5
}
.stage-menu.open{display:block}
.stage-menu-item{padding:10px 12px;cursor:pointer;white-space:nowrap}
.stage-menu-item:hover{background:#f1f4fb}
.stage-menu-item.active{background:#e9f7ff}

/* меню колонок */
.cols{
  position:relative;
}
.cols-menu{
  position:absolute;left:0;top:100%;margin-top:8px;background:#fff;border:1px solid var(--line);
  border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:8px;display:none;z-index:10;min-width:260px
}
.cols-menu.open{display:block}
.cols-menu label{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer}
.cols-menu label:hover{background:#f6f7fb}

.hidden{display:none !important}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Лицензии</h1>

    <button id="btnNew" class="btn">Новый элемент</button>
    <button id="btnPick" class="btn ghost">Выбрать элемент</button>
    <button id="btnRefresh" class="btn ghost">Обновить</button>

    <div class="cols">
      <button id="btnCols" class="btn ghost">Колонки</button>
      <div id="colsMenu" class="cols-menu"></div>
    </div>

    <div class="right">
      <label>Показывать по:
        <select id="pageSize">
          <option>10</option><option>30</option><option>50</option><option>100</option>
        </select>
      </label>
    </div>
  </div>

  <div class="table-wrap">
    <table id="grid">
      <thead id="thead"></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
</div>

<script src="https://api.bitrix24.com/api/v1/"></script>
<script>
/*** Конфиг ***/
const ENTITY_TYPE_ID = 1032;
const F = {
  dealIdSource : 'UF_CRM_10_1717328665682',
  licenseKey   : 'UF_CRM_10_1717328730625',
  portalUrl    : 'UF_CRM_10_1717328814784',
  tariff       : 'UF_CRM_10_1717329015552',
  tariffEnd    : 'UF_CRM_10_1717329087589',
  marketEnd    : 'UF_CRM_10_1717329109963',
  product      : 'UF_CRM_10_1717329453779',
};

/* Список колонок c id для менеджера колонок */
const COLS = [
  {id:'id',        title:'ID',               min:64,  render: (it)=> it.id },
  {id:'title',     title:'Название',         min:340, render: (it)=> '<a class="link" target="_top" href="/crm/type/'+ENTITY_TYPE_ID+'/details/'+it.id+'/">'+escapeHtml(it.title||'Без названия')+'</a>',
                   filter:'fltTitle'},
  {id:'resp',      title:'Ответственный',    min:220, render: (it)=> linkUser(S.users.get(Number(it.assignedById))) ,
                   filter:'fltResp'},
  {id:'stage',     title:'Стадия',           min:320, render: renderStageBar, filter:'fltStage'},
  {id:'src',       title:'ID исходной сделки', min:140, render: (it)=> escapeHtml(UF(it,F.dealIdSource) || '—')},
  {id:'key',       title:'Лицензионный ключ',  min:200, render: (it)=> escapeHtml(UF(it,F.licenseKey) || '—') },
  {id:'portal',    title:'Адрес портала',      min:220, render: (it)=> escapeHtml(UF(it,F.portalUrl)  || '—') },
  {id:'tariff',    title:'Текущий тариф',      min:160, render: (it)=> getEnumName(F.tariff, UF(it,F.tariff)) || '—'},
  {id:'tariffEnd', title:'Окончание тарифа',   min:160, render: (it)=> dateFmt(UF(it,F.tariffEnd)) },
  {id:'marketEnd', title:'Окончание подписки', min:180, render: (it)=> dateFmt(UF(it,F.marketEnd)) },
  {id:'product',   title:'Продукт',            min:140, render: (it)=> getEnumName(F.product, UF(it,F.product)) || '—'},
  {id:'actions',   title:'Действия',           min:160, render: renderActions }
];

const STORAGE_KEY = 'lic-widget-columns-v1';

const ui = {
  thead:  () => document.getElementById('thead'),
  rows:   () => document.getElementById('rows'),
  grid:   () => document.getElementById('grid'),
  size:   () => document.getElementById('pageSize'),
  colsBtn:() => document.getElementById('btnCols'),
  colsMenu:() => document.getElementById('colsMenu'),
};

const S = {
  items: [],
  users: new Map(),
  stageMap: new Map(),
  stageOrderByCat: new Map(),
  enums: {},
  pageSize: 10,
  filters: { title:'', resp:'', stage:'' },
  visibleCols: loadCols()
};

function fit(){ try{ BX24&&BX24.fitWindow(); }catch(e){} }

function loadCols(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){ return JSON.parse(raw); }
  }catch(e){}
  // дефолт: все видимы
  const vis = {};
  COLS.forEach(c=>vis[c.id]=true);
  return vis;
}
function saveCols(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(S.visibleCols)); }catch(e){}
}

function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }
function dateFmt(v){
  if(!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString();
}
function linkUser(u){
  if(!u) return '—';
  const name = [u.LAST_NAME,u.NAME,u.SECOND_NAME].filter(Boolean).join(' ') || u.LOGIN || ('ID '+u.ID);
  return '<a class="link" target="_top" href="/company/personal/user/'+u.ID+'/">'+escapeHtml(name)+'</a>';
}
function UF(item, code){
  if(!item||!code) return undefined;
  const src = item.item || item;
  const lc  = code.toLowerCase();
  if(src[code] !== undefined) return normUF(src[code]);
  for(const k in src){ if(String(k).toLowerCase()===lc) return normUF(src[k]); }
  const f = src.fields || src.FIELDS || {};
  if(f[code] !== undefined) return normUF(f[code]);
  for(const k in f){ if(String(k).toLowerCase()===lc) return normUF(f[k]); }
  return undefined;
}
function normUF(v){
  if(v==null) return v;
  if(Array.isArray(v)) return v.join(', ');
  if(typeof v==='object'){
    const s = v.VALUE||v.value||v.URL||v.url||v.TEXT||v.text;
    return s!=null? String(s) : JSON.stringify(v);
  }
  return v;
}

function getEnumName(code, val){
  const map = S.enums[code];
  if(!map) return undefined;
  return map.get(String(val)) || undefined;
}

/*** Надёжная обёртка над BX24.callMethod — в reject отдаём Error со строкой ***/
function bCall(method, params){
  return new Promise((resolve, reject)=>{
    BX24.callMethod(method, params, function(r){
      if(r && typeof r.error === 'function' && r.error()){
        const msg = (typeof r.error_description === 'function' ? r.error_description() : r.error_description) || r.error();
        reject(new Error(method + ': ' + msg));
      }else{
        try{ resolve(r.data()); }catch(e){ reject(new Error(method + ': пустой ответ')); }
      }
    });
  });
}

async function loadStages() {
  S.stageMap.clear();
  S.stageOrderByCat.clear();

  // 1) Список категорий смарт-процесса
  let cats = [];
  try {
    const res = await bCall('crm.item.category.list', { entityTypeId: ENTITY_TYPE_ID });
    cats = (res && (res.categories || res) || []).map(function (c) {
      return { ID: Number(c.id || c.ID || 0), NAME: c.name || c.NAME || '' };
    });
  } catch (e) {
    cats = [{ ID: 0, NAME: 'По умолчанию' }];
  }

  // 2) Для каждой категории берём статусы через crm.status.list
  for (var i = 0; i < cats.length; i++) {
    var cat = cats[i];
    // !!! без бэктиков:
    var entityId = 'DT' + ENTITY_TYPE_ID + '_' + cat.ID;

    var statuses = [];
    try {
      statuses = await bCall('crm.status.list', {
        filter: { ENTITY_ID: entityId },
        order: { SORT: 'ASC' }
      });
    } catch (e) {
      continue;
    }

    var order = [];
    for (var j = 0; j < (statuses || []).length; j++) {
      var st = statuses[j];
      var id   = String(st.STATUS_ID || st.ID || '');
      var name = st.NAME || st.TITLE || id;
      var sort = Number(st.SORT || 0);
      if (!id) continue;

      S.stageMap.set(id, { ID: id, NAME: name, CATEGORY_ID: cat.ID, SORT: sort });
      order.push(id);
    }
    order.sort(function(a,b){ return (S.stageMap.get(a).SORT||0) - (S.stageMap.get(b).SORT||0); });
    S.stageOrderByCat.set(cat.ID, order);
  }
}

async function loadEnums(){
  const desc = await bCall('crm.item.fields', { entityTypeId: ENTITY_TYPE_ID });
  function mapFrom(field){ const list = (field?.items||field?.VALUES||field?.ENUM)||[]; const m=new Map(); list.forEach(e=>m.set(String(e.ID||e.VALUE), e.VALUE||e.NAME||e.TITLE)); return m; }
  S.enums[F.tariff]  = mapFrom(desc[F.tariff]  || {});
  S.enums[F.product] = mapFrom(desc[F.product] || {});
}

async function loadUsers(ids){
  const need = ids.filter(id=>!S.users.has(id));
  if(!need.length) return;
  const CHUNK=50;
  for(let i=0;i<need.length;i+=CHUNK){
    const part = need.slice(i,i+CHUNK);
    const res = await bCall('user.get',{ ID: part });
    res.forEach(u=>S.users.set(Number(u.ID), u));
  }
}

async function loadItems(){
  const select = ['*','uf*','id','title','stageId','categoryId','assignedById',
    F.dealIdSource, F.licenseKey, F.portalUrl, F.tariff, F.tariffEnd, F.marketEnd, F.product];
  const res = await bCall('crm.item.list', { entityTypeId: ENTITY_TYPE_ID, select, filter:{}, order:{ id:'desc' }, start:-1 });
  S.items = Array.isArray(res) ? res : (res.items||res.result||[]);
  const uids = Array.from(new Set(S.items.map(i=>Number(i.assignedById)).filter(Boolean)));
  await loadUsers(uids);
}

/*** Stage bar ***/
function renderStageBar(item){
  const stageId = String(item.stageId||'');
  const catId   = Number(item.categoryId||0);
  const order   = S.stageOrderByCat.get(catId) || [];
  const idx     = Math.max(0, order.indexOf(stageId));
  const curName = (S.stageMap.get(stageId)?.NAME) || stageId || '—';

  let tds = '';
  for(let i=0;i<order.length;i++){
    const cls = i<idx ? 'stage-done' : (i===idx?'stage-current':'stage-future');
    tds += '<td class="crm-list-stage-bar-part '+cls+'"><div class="crm-list-stage-bar-block"><div class="crm-list-stage-bar-btn"></div></div></td>';
  }
  let menu = '';
  for(const sid of order){
    const nm = escapeHtml(S.stageMap.get(sid)?.NAME || sid);
    menu += '<div class="stage-menu-item '+(sid===stageId?'active':'')+'" data-sid="'+escapeHtml(sid)+'">'+nm+'</div>';
  }
  return '<div class="stage-select" data-id="'+item.id+'">'+
           '<div class="crm-list-stage-bar"><table class="crm-list-stage-bar-table"><tbody><tr>'+ (tds||'<td style="color:#999">Нет стадий</td>') +'</tr></tbody></table></div>'+
           '<div class="crm-list-stage-bar-title">'+escapeHtml(curName)+'</div>'+
           '<button class="toggle" title="Сменить стадию">▾</button>'+
           '<div class="stage-menu">'+menu+'</div>'+
         '</div>';
}
function bindStageControls(rowEl, item){
  const holder = rowEl.querySelector('.stage-select'); if(!holder) return;
  const btn  = holder.querySelector('.toggle');
  const menu = holder.querySelector('.stage-menu');
  btn.addEventListener('click', e=>{
    e.stopPropagation();
    document.querySelectorAll('.stage-menu.open').forEach(m=>m.classList.remove('open'));
    menu.classList.toggle('open');
  });
  menu.addEventListener('click', async e=>{
    const el = e.target.closest('.stage-menu-item'); if(!el) return;
    const sid = el.dataset.sid; menu.classList.remove('open');
    try{
      await bCall('crm.item.update',{ entityTypeId: ENTITY_TYPE_ID, id: item.id, fields:{ stageId: sid }});
      item.stageId = sid; render();
    }catch(err){ alert('Не удалось сменить стадию: ' + err.message); }
  });
  document.addEventListener('click', ()=>menu.classList.remove('open'));
}

/*** Actions ***/
function renderActions(it){
  return '<a class="btn ghost" target="_top" href="/crm/type/'+ENTITY_TYPE_ID+'/details/'+it.id+'/">Открыть</a> '+
         '<button class="btn danger btn-del" data-id="'+it.id+'">Удалить</button>';
}

/*** Фильтрация/рендер ***/
function applyFilters(list){
  const t = S.filters.title.trim().toLowerCase();
  const r = S.filters.resp.trim().toLowerCase();
  const s = S.filters.stage.trim().toLowerCase();
  return list.filter(it=>{
    const title = String(it.title||'').toLowerCase();
    const user  = S.users.get(Number(it.assignedById))||{};
    const uname = [user.LAST_NAME,user.NAME,user.SECOND_NAME].filter(Boolean).join(' ').toLowerCase();
    const st    = (S.stageMap.get(String(it.stageId))?.NAME || String(it.stageId||'')).toLowerCase();
    return (!t || title.includes(t)) && (!r || uname.includes(r)) && (!s || st.includes(s));
  });
}

function buildHeader(){
  const vis = S.visibleCols;
  const th = [];
  const fltInputs = {};
  COLS.forEach(c=>{
    if(!vis[c.id]) return;
    let html = '<th style="min-width:'+ (c.min||140) +'px">'+escapeHtml(c.title);
    if(c.filter){
      const pid = c.filter;
      html += '<span class="filter"><input id="'+pid+'" placeholder="Фильтр по '+escapeHtml(c.title.toLowerCase())+'"></span>';
    }
    html += '</th>';
    th.push(html);
  });
  ui.thead().innerHTML = '<tr>'+th.join('')+'</tr>';

  // вешаем слушатели фильтров
  const t = document.getElementById('fltTitle'); if(t) t.addEventListener('input', e=>{ S.filters.title = e.target.value; render(); });
  const r = document.getElementById('fltResp');  if(r) r.addEventListener('input', e=>{ S.filters.resp = e.target.value; render(); });
  const s = document.getElementById('fltStage'); if(s) s.addEventListener('input', e=>{ S.filters.stage = e.target.value; render(); });
}

function render(){
  buildHeader();

  const body = ui.rows(); body.innerHTML = '';
  const vis = S.visibleCols;
  const list = applyFilters(S.items).slice(0, S.pageSize);

  for(const it of list){
    const tr = document.createElement('tr');
    const tds = [];
    for(const c of COLS){
      if(!vis[c.id]) continue;
      tds.push('<td class="'+c.id+'">'+ c.render(it) +'</td>');
    }
    tr.innerHTML = tds.join('');
    body.appendChild(tr);

    // повесить обработчики на стадию и удалить
    bindStageControls(tr, it);
    tr.querySelectorAll('.btn-del').forEach(b=>{
      b.addEventListener('click', async (e)=>{
        const id = Number(e.currentTarget.dataset.id);
        if(!confirm('Удалить элемент #'+id+'?')) return;
        try{
          await bCall('crm.item.delete',{ entityTypeId: ENTITY_TYPE_ID, id });
          S.items = S.items.filter(x=>x.id!==id);
          render();
        }catch(err){ alert('Удаление не удалось: '+ err.message); }
      });
    });
  }
  fit();
}

/*** Меню колонок ***/
function buildColsMenu(){
  const menu = ui.colsMenu(); menu.innerHTML = '';
  COLS.forEach(c=>{
    const id='col_'+c.id;
    const lab = document.createElement('label'); lab.htmlFor=id;
    lab.innerHTML = '<input type="checkbox" id="'+id+'" '+(S.visibleCols[c.id]?'checked':'')+'> '+escapeHtml(c.title);
    menu.appendChild(lab);
    lab.querySelector('input').addEventListener('change', e=>{
      S.visibleCols[c.id] = e.target.checked;
      saveCols(); render();
    });
  });
}
function wireCols(){
  buildColsMenu();
  const btn = ui.colsBtn(), menu = ui.colsMenu();
  btn.addEventListener('click', (e)=>{
    e.stopPropagation(); menu.classList.toggle('open');
  });
  document.addEventListener('click', ()=>menu.classList.remove('open'));
}

/*** UI, загрузка ***/
function wireUi(){
  ui.size().value = String(S.pageSize);
  ui.size().addEventListener('change', ()=>{ S.pageSize = Number(ui.size().value)||10; render(); });

  document.getElementById('btnRefresh').addEventListener('click', bootstrap);
  document.getElementById('btnNew').addEventListener('click', ()=> BX24.openPath('/crm/type/'+ENTITY_TYPE_ID+'/details/0/'));
  document.getElementById('btnPick').addEventListener('click', ()=> BX24.openPath('/crm/type/'+ENTITY_TYPE_ID+'/list/'));

  wireCols();
}

async function bootstrap(){
  try{
    await loadStages();
    await loadEnums();
    await loadItems();
    render();
  }catch(err){
    console.error(err);
    alert('Ошибка загрузки: ' + (err.message||err));
  }
}

/*** Инициализация ***/
(function init(){
  const inFrame = (window.top !== window);
  if(!inFrame || typeof BX24 === 'undefined'){
    document.body.innerHTML = '<div class="container"><div class="table-wrap" style="padding:16px">Эта страница должна открываться внутри портала Битрикс24 (iframe). BX24 SDK недоступен.</div></div>';
    return;
  }
  BX24.init(()=>{
    wireUi();
    bootstrap();
  });
})();
</script>
</body>
</html>`;

export default {
  async fetch(_req, _env, _ctx) {
    return new Response(HTML, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }
};
