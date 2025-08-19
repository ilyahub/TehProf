// _worker.js
// Cloudflare Pages/Workers: отдаём единую HTML-страницу «Лицензии»
// Вся логика виджета (BX24, стейдж-бар, UF-поля, динамическая высота) — внутри HTML ниже.

const HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Лицензии</title>
<style>
:root{
  --bg:#f5f7fb;
  --card:#fff;
  --line:#e7ebf2;
  --text:#1a1f36;
  --muted:#6b7280;
  --primary:#3bc8f5;
  --primary-300:#3eddff;
  --primary-700:#12b1e3;
  --danger:#ff5b6a;
}
html,body{height:100%}
*{box-sizing:border-box}
body{
  margin:0;background:var(--bg);color:var(--text);
  font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;
}
.container{max-width:1400px;margin:24px auto;padding:0 16px}
.header{display:flex;align-items:center;gap:16px;margin-bottom:16px}
.header h1{margin:0;font-weight:800;letter-spacing:.2px}
.btn{
  --ui-btn-background:var(--primary);
  --ui-btn-background-hover:var(--primary-300);
  --ui-btn-background-active:var(--primary-700);
  --ui-btn-border-color:var(--primary);
  --ui-btn-border-color-hover:var(--primary-300);
  --ui-btn-border-color-active:var(--primary-700);
  --ui-btn-color:#fff;
  display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;
  border:1px solid var(--ui-btn-border-color);background:var(--ui-btn-background);color:var(--ui-btn-color);
  cursor:pointer;font-weight:600;text-decoration:none;white-space:nowrap;
}
.btn:hover{background:var(--ui-btn-background-hover);border-color:var(--ui-btn-border-color-hover)}
.btn:active{background:var(--ui-btn-background-active);border-color:var(--ui-btn-border-color-active)}
.btn.ghost{background:#fff;color:var(--text);border-color:var(--line)}
.btn.ghost:hover{border-color:var(--primary);color:var(--primary)}
.btn.danger{background:var(--danger);border-color:var(--danger)}
.controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 12px 0;margin-bottom:12px}

/* Таблица */
.table-wrap{min-height:420px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:14px}
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

.right{display:flex;justify-content:flex-end;gap:8px}

/* фильтры в заголовке */
th .filter{display:block;margin-top:6px}
th .filter input{width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:8px}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Лицензии</h1>
    <div class="controls">
      <button id="btnNew" class="btn">Новый элемент</button>
      <button id="btnPick" class="btn ghost">Выбрать элемент</button>
      <button id="btnRefresh" class="btn ghost">Обновить</button>
    </div>
    <div class="right" style="margin-left:auto">
      <label>Показывать по:
        <select id="pageSize">
          <option>10</option><option>30</option><option>50</option><option>100</option>
        </select>
      </label>
    </div>
  </div>

  <div class="table-wrap">
    <table id="grid">
      <thead>
        <tr>
          <th style="width:64px">ID</th>
          <th style="min-width:340px">Название
            <span class="filter"><input id="fltTitle" placeholder="Фильтр по названию"></span>
          </th>
          <th style="min-width:220px">Ответственный
            <span class="filter"><input id="fltResp" placeholder="Фильтр по ответственному"></span>
          </th>
          <th style="min-width:320px">Стадия
            <span class="filter"><input id="fltStage" placeholder="Фильтр по стадии"></span>
          </th>
          <th style="min-width:140px">ID исходной сделки</th>
          <th style="min-width:220px">Лицензионный ключ</th>
          <th style="min-width:220px">Адрес портала</th>
          <th style="min-width:160px">Текущий тариф</th>
          <th style="min-width:160px">Окончание тарифа</th>
          <th style="min-width:180px">Окончание подписки (Маркет)</th>
          <th style="min-width:140px">Продукт</th>
          <th style="width:160px">Действия</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
</div>

<script src="https://api.bitrix24.com/api/v1/"></script>
<script>
const ENTITY_TYPE_ID = 1032; // ваш смарт-процесс
const F = {
  dealIdSource : 'UF_CRM_10_1717328665682',
  licenseKey   : 'UF_CRM_10_1717328730625',
  portalUrl    : 'UF_CRM_10_1717328814784',
  tariff       : 'UF_CRM_10_1717329015552',
  tariffEnd    : 'UF_CRM_10_1717329087589',
  marketEnd    : 'UF_CRM_10_1717329109963',
  product      : 'UF_CRM_10_1717329453779',
};

const ui = {
  rows:   () => document.getElementById('rows'),
  grid:   () => document.getElementById('grid'),
  size:   () => document.getElementById('pageSize'),
  fTitle: () => document.getElementById('fltTitle'),
  fResp:  () => document.getElementById('fltResp'),
  fStage: () => document.getElementById('fltStage'),
};

const S = {
  items: [],
  users: new Map(),
  stageMap: new Map(),
  stageOrderByCat: new Map(),
  enums: {},
  pageSize: 10,
  filters: { title:'', resp:'', stage:'' },
};

function fit(){ try{ BX24&&BX24.fitWindow(); }catch(e){} }
function setTableHeight(){
  const wrap = document.querySelector('.table-wrap');
  if(!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const marginBottom = 16;
  const h = Math.max(320, window.innerHeight - rect.top - marginBottom);
  wrap.style.height = h + 'px';
}
function dateFmt(v){
  if(!v) return '—';
  const d = new Date(v);
  if(isNaN(d)) return String(v);
  return d.toLocaleDateString();
}
function linkUser(user){
  if(!user) return '—';
  const name = [user.LAST_NAME,user.NAME,user.SECOND_NAME].filter(Boolean).join(' ');
  const title = name || user.LOGIN || ('ID '+user.ID);
  const href = '/company/personal/user/'+user.ID+'/';
  return '<a class="link" target="_top" href="'+href+'">'+escapeHtml(title)+'</a>';
}
function escapeHtml(s){
  return String(s??'').replace(/[&<>"']/g, function(m){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])});
}
function UF(item, code){
  if(!item||!code) return undefined;
  const src = item.item || (item.result&&item.result.item) || item;
  const lc = code.toLowerCase();
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

function bCall(m,p){ return new Promise(function(res,rej){ BX24.callMethod(m,p,function(r){ r.error()?rej(r):res(r.data()) }); }); }

async function loadStages(){
  const res = await bCall('crm.category.stage.list',{ entityTypeId: ENTITY_TYPE_ID });
  res.forEach(function(st){
    S.stageMap.set(st.statusId||st.STATUS_ID, {
      ID: st.statusId||st.STATUS_ID,
      NAME: st.name||st.NAME,
      CATEGORY_ID: st.categoryId||st.CATEGORY_ID,
      SORT: Number(st.sort||st.SORT||0)
    });
  });
  const byCat = new Map();
  res.forEach(function(st){
    const cat = st.categoryId||st.CATEGORY_ID;
    const id  = st.statusId||st.STATUS_ID;
    if(!byCat.has(cat)) byCat.set(cat,[]);
    byCat.get(cat).push(id);
  });
  for(const kv of byCat){
    const cat = kv[0], arr = kv[1];
    arr.sort(function(a,b){return (S.stageMap.get(a)?.SORT||0)-(S.stageMap.get(b)?.SORT||0)});
    S.stageOrderByCat.set(cat, arr);
  }
}

async function loadEnums(){
  const desc = await bCall('crm.item.fields', { entityTypeId: ENTITY_TYPE_ID });
  const fTar = (desc&&desc[F.tariff]&&(desc[F.tariff].items||desc[F.tariff].VALUES||desc[F.tariff].ENUM)) || [];
  const fProd= (desc&&desc[F.product]&&(desc[F.product].items||desc[F.product].VALUES||desc[F.product].ENUM)) || [];
  function map(list){ const m=new Map(); (list||[]).forEach(function(e){ m.set(String(e.ID||e.VALUE), e.VALUE||e.NAME||e.TITLE); }); return m; }
  S.enums[F.tariff]  = map(fTar);
  S.enums[F.product] = map(fProd);
}

async function loadUsers(ids){
  const need = ids.filter(function(id){return !S.users.has(id)});
  if(!need.length) return;
  const CHUNK=50;
  for(let i=0;i<need.length;i+=CHUNK){
    const portion = need.slice(i,i+CHUNK);
    const res = await bCall('user.get',{ ID: portion });
    res.forEach(function(u){ S.users.set(Number(u.ID), u); });
  }
}

async function loadItems(){
  const select = ['*','uf*','id','title','stageId','categoryId','assignedById',
    F.dealIdSource, F.licenseKey, F.portalUrl, F.tariff, F.tariffEnd, F.marketEnd, F.product];
  const res = await bCall('crm.item.list', { entityTypeId: ENTITY_TYPE_ID, select, filter:{}, order:{ id:'desc' }, start:-1 });
  S.items = Array.isArray(res) ? res : (res.items||res.result||[]);
  const uids = Array.from(new Set(S.items.map(function(i){return Number(i.assignedById||i.ASSIGNED_BY_ID)}).filter(Boolean)));
  await loadUsers(uids);
}

function renderStageBar(item){
  const stageId   = String(item.stageId || item.STAGE_ID || '');
  const catId     = Number(item.categoryId || item.CATEGORY_ID || 0);
  const order     = S.stageOrderByCat.get(catId) || [];
  const curIdx    = Math.max(0, order.indexOf(stageId));
  const curTitle  = (S.stageMap.get(stageId)&&S.stageMap.get(stageId).NAME) || stageId || '—';

  var tds = '';
  for(let i=0;i<order.length;i++){
    const sid = order[i];
    const cls = (i<curIdx)?'stage-done':(i===curIdx)?'stage-current':'stage-future';
    tds += '<td class="crm-list-stage-bar-part '+cls+'">'+
             '<div class="crm-list-stage-bar-block"><div class="crm-list-stage-bar-btn"></div></div>'+
           '</td>';
  }
  var menu = '';
  for(const sid of order){
    const name = escapeHtml((S.stageMap.get(sid)&&S.stageMap.get(sid).NAME)||sid);
    menu += '<div class="stage-menu-item '+(sid===stageId?'active':'')+'" data-sid="'+escapeHtml(sid)+'">'+name+'</div>';
  }
  return ''+
    '<div class="stage-select" data-id="'+item.id+'">'+
      '<div class="crm-list-stage-bar">'+
        '<table class="crm-list-stage-bar-table"><tbody><tr>'+ (tds||'<td style="color:#999">Нет стадий</td>') +'</tr></tbody></table>'+
      '</div>'+
      '<div class="crm-list-stage-bar-title">'+escapeHtml(curTitle)+'</div>'+
      '<button class="toggle" title="Сменить стадию">▾</button>'+
      '<div class="stage-menu">'+menu+'</div>'+
    '</div>';
}

function bindStageControls(rowEl, item){
  const holder = rowEl.querySelector('.stage-select');
  if(!holder) return;
  const btn = holder.querySelector('.toggle');
  const menu = holder.querySelector('.stage-menu');
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    document.querySelectorAll('.stage-menu.open').forEach(function(m){m.classList.remove('open')});
    menu.classList.toggle('open');
  });
  menu.addEventListener('click', async function(e){
    const el = e.target.closest('.stage-menu-item'); if(!el) return;
    const sid = el.dataset.sid;
    menu.classList.remove('open');
    await changeStage(item, sid);
  });
  document.addEventListener('click', function(){ menu.classList.remove('open'); });
}

async function changeStage(item, newStageId){
  try{
    await bCall('crm.item.update',{ entityTypeId: ENTITY_TYPE_ID, id: item.id, fields:{ stageId: newStageId }});
    item.stageId = newStageId;
    render();
  }catch(e){ alert('Не удалось сменить стадию: '+(e.error_description||e)); }
}

function applyFilters(list){
  const t = S.filters.title.trim().toLowerCase();
  const r = S.filters.resp.trim().toLowerCase();
  const s = S.filters.stage.trim().toLowerCase();
  return list.filter(function(it){
    const title = String(it.title||'').toLowerCase();
    const user  = S.users.get(Number(it.assignedById))||{};
    const uname = [user.LAST_NAME,user.NAME,user.SECOND_NAME].filter(Boolean).join(' ').toLowerCase();
    const st    = ((S.stageMap.get(String(it.stageId))&&S.stageMap.get(String(it.stageId)).NAME) || String(it.stageId||'')).toLowerCase();
    return (!t || title.includes(t)) && (!r || uname.includes(r)) && (!s || st.includes(s));
  });
}

function render(){
  const root = ui.rows();
  root.innerHTML = '';
  let list = applyFilters(S.items).slice(0, S.pageSize);
  for(const it of list){
    const user = S.users.get(Number(it.assignedById));
    const tariffName  = (S.enums[F.tariff]&&S.enums[F.tariff].get(String(UF(it,F.tariff)))) || UF(it,F.tariff) || '—';
    const productName = (S.enums[F.product]&&S.enums[F.product].get(String(UF(it,F.product))))|| UF(it,F.product)|| '—';

    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>'+it.id+'</td>'+
      '<td><a class="link" target="_top" href="/crm/type/'+ENTITY_TYPE_ID+'/details/'+it.id+'/">'+escapeHtml(it.title||'Без названия')+'</a></td>'+
      '<td>'+linkUser(user)+'</td>'+
      '<td>'+renderStageBar(it)+'</td>'+
      '<td>'+escapeHtml(UF(it,F.dealIdSource) || '—')+'</td>'+
      '<td>'+escapeHtml(UF(it,F.licenseKey)   || '—')+'</td>'+
      '<td>'+escapeHtml(UF(it,F.portalUrl)    || '—')+'</td>'+
      '<td>'+escapeHtml(tariffName)+'</td>'+
      '<td>'+dateFmt(UF(it,F.tariffEnd))+'</td>'+
      '<td>'+dateFmt(UF(it,F.marketEnd))+'</td>'+
      '<td>'+escapeHtml(productName)+'</td>'+
      '<td class="right">'+
        '<a class="btn ghost" target="_top" href="/crm/type/'+ENTITY_TYPE_ID+'/details/'+it.id+'/">Открыть</a> '+
        '<button class="btn danger btn-del" data-id="'+it.id+'">Удалить</button>'+
      '</td>';
    root.appendChild(tr);
    bindStageControls(tr, it);
  }
  root.querySelectorAll('.btn-del').forEach(function(b){
    b.addEventListener('click', async function(e){
      const id = Number(e.currentTarget.dataset.id);
      if(!confirm('Удалить элемент #'+id+'?')) return;
      try{
        await bCall('crm.item.delete',{ entityTypeId: ENTITY_TYPE_ID, id });
        S.items = S.items.filter(function(x){return x.id!==id});
        render();
      }catch(err){
        alert('Удаление не удалось: ' + (err.error_description||err));
      }
    });
  });
  setTableHeight(); fit();
}

function wireUi(){
  ui.size().value = String(S.pageSize);
  ui.size().addEventListener('change', function(){
    S.pageSize = Number(ui.size().value)||10; render();
  });
  ui.fTitle().addEventListener('input', function(e){ S.filters.title = e.target.value; render(); });
  ui.fResp().addEventListener('input',  function(e){ S.filters.resp  = e.target.value; render(); });
  ui.fStage().addEventListener('input', function(e){ S.filters.stage = e.target.value; render(); });

  document.getElementById('btnRefresh').addEventListener('click', bootstrap);
  document.getElementById('btnNew').addEventListener('click', function(){
    BX24.openPath('/crm/type/'+ENTITY_TYPE_ID+'/details/0/');
  });
  document.getElementById('btnPick').addEventListener('click', function(){
    BX24.openPath('/crm/type/'+ENTITY_TYPE_ID+'/list/');
  });

  window.addEventListener('resize', function(){ setTableHeight(); fit(); });
  new ResizeObserver(function(){ setTableHeight(); fit(); }).observe(document.body);
}

async function bootstrap(){
  try{
    await loadStages();
    await loadEnums();
    await loadItems();
    render();
  }catch(e){
    console.error(e);
    alert('Ошибка загрузки: '+(e.error_description||e));
  }
}

(function init(){
  const inFrame = (window.top !== window);
  if(!inFrame || typeof BX24 === 'undefined'){
    document.body.innerHTML = '<div class="container"><div class="card">Эта страница должна открываться внутри портала Битрикс24 (iframe). BX24 SDK недоступен.</div></div>';
    return;
  }
  BX24.init(function(){
    wireUi(); setTableHeight(); bootstrap();
  });
})();
</script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    // Можно добавить свои маршруты, но по умолчанию отдаём одну страницу
    return new Response(HTML, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate'
      }
    });
  }
};
