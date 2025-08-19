// _worker.js — Cloudflare Pages Functions

export default {
  async fetch(request) {
    return new Response(HTML, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store"
      }
    });
  }
};

/* ------------------------------------------------------------------ */
/* Вся страница как одна строка. НЕТ обратных кавычек внутри <script>. */
/* ------------------------------------------------------------------ */

const HTML =
'<!doctype html>\
<html lang="ru">\
<head>\
<meta charset="utf-8">\
<meta name="viewport" content="width=device-width, initial-scale=1">\
<title>Лицензии</title>\
<link rel="preconnect" href="https://api.bitrix24.com">\
<style>\
  :root{ --gap:16px; --radius:10px; --line:#eef0f4; --bg:#f5f7fb; --white:#fff; }\
  html,body{ height:100%; margin:0; background:var(--bg); font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif; color:#1d222b; }\
  .widget-root{ width:100%; height:100%; display:flex; flex-direction:column; }\
  .toolbar{ display:flex; align-items:center; gap:12px; padding:12px 16px; }\
  .toolbar .title{ font-weight:700; font-size:28px; margin-right:auto; }\
  .btn{ appearance:none; border:1px solid #3bc8f5; background:#3bc8f5; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer; }\
  .btn:hover{ background:#3eddff; border-color:#3eddff; }\
  .btn.secondary{ background:#fff; color:#1d222b; border-color:#dcdfe4; }\
  .toolbar .right{ margin-left:auto; display:flex; align-items:center; gap:8px; }\
  .select{ padding:6px 8px; border:1px solid #dcdfe4; border-radius:8px; background:#fff; }\
  .table-wrap{ width:100%; height:calc(100vh - 80px); padding:0 16px 16px 16px; overflow:auto; }\
  table{ width:100%; border-collapse:separate; border-spacing:0; background:var(--white); border-radius:var(--radius); overflow:hidden; }\
  th, td{ padding:10px 12px; border-bottom:1px solid var(--line); white-space:nowrap; vertical-align:middle; }\
  th{ position:sticky; top:0; z-index:1; background:#fafbfd; font-weight:600; }\
  tr:last-child td{ border-bottom:none; }\
  a{ color:#136bf5; text-decoration:none; } a:hover{ text-decoration:underline; }\
  .muted{ color:#8b8f99; }\
  .stage-bar{ width:200px; height:8px; background:#eef0f4; border-radius:6px; position:relative; }\
  .stage-fill{ position:absolute; left:0; top:0; height:8px; background:#b7cbe7; border-radius:6px; }\
  .stage-cell{ display:flex; align-items:center; gap:8px; }\
  .actions .btn{ padding:6px 10px; }\
  .w-100{ width:100%; }\
</style>\
<script src="https://api.bitrix24.com/api/v1/"></script>\
</head>\
<body>\
  <div class="widget-root">\
    <div class="toolbar">\
      <div class="title">Лицензии</div>\
      <button class="btn" id="btnNew">Новый элемент</button>\
      <button class="btn secondary" id="btnPick">Выбрать элемент</button>\
      <button class="btn secondary" id="btnRefresh">Обновить</button>\
      <div class="right">\
        <label class="muted">Показывать по:&nbsp;</label>\
        <select id="pageSize" class="select">\
          <option value="10">10</option>\
          <option value="30">30</option>\
          <option value="50">50</option>\
        </select>\
      </div>\
    </div>\
    <div class="table-wrap">\
      <table id="grid">\
        <thead>\
          <tr>\
            <th>ID</th>\
            <th class="w-100">Название</th>\
            <th>Ответственный</th>\
            <th>Стадия</th>\
            <th>ID исходной сделки</th>\
            <th>Лицензионный ключ</th>\
            <th>Адрес портала</th>\
            <th>Текущий тариф</th>\
            <th>Окончание тарифа</th>\
            <th>Окончание подписки</th>\
            <th>Продукт</th>\
            <th>Действия</th>\
          </tr>\
        </thead>\
        <tbody id="tbody"></tbody>\
      </table>\
    </div>\
  </div>\
<script>\
(function(){\
  var ENTITY_TYPE_ID = 1032; /* ваш SPA */\
  var UF = {\
    DEAL_ID:    "ufCrm_10_1717328865682",\
    LIC_KEY:    "ufCrm_10_1717328730625",\
    PORTAL_URL: "ufCrm_10_1717328814784",\
    TARIFF:     "ufCrm_10_1717329015552",\
    END_TARIFF: "ufCrm_10_1717329087589",\
    END_MARKET: "ufCrm_10_1717329109963",\
    PRODUCT:    "ufCrm_10_1717329453779"\
  };\
  var SELECT_FIELDS = ["id","title","assignedById","stageId","categoryId"].concat(Object.values(UF));\
  var pageSizeEl = document.getElementById("pageSize");\
  var tbody = document.getElementById("tbody");\
  var FIELD_META = null;\
  var USERS = new Map();\
  var S = { stageMap:new Map(), stageOrderByCat:new Map() };\
\
  function ready(fn){ document.readyState!=="loading" ? fn() : document.addEventListener("DOMContentLoaded",fn); }\
  function bCall(method, params){\
    return new Promise(function(resolve,reject){\
      if (!window.BX24){ return reject("BX24 not ready"); }\
      BX24.callMethod(method, params||{}, function(r){\
        if (r.error()){ reject(r.error()+" — "+r.error_description()); }\
        else {\
          var d = (typeof r.data==="function") ? r.data() : (r.answer ? r.answer.result : r);\
          resolve(d);\
        }\
      });\
    });\
  }\
  function notify(msg){ try{ alert(msg); }catch(e){} }\
\
  async function loadStages(){\
    S.stageMap.clear(); S.stageOrderByCat.clear();\
    var cats = [];\
    try{\
      var res = await bCall("crm.item.category.list", { entityTypeId: ENTITY_TYPE_ID });\
      cats = (res && (res.categories||res) || []).map(function(c){\
        return { ID:Number(c.id||c.ID||0), NAME:(c.name||c.NAME||"") };\
      });\
    }catch(e){ cats=[{ID:0,NAME:"По умолчанию"}]; }\
    for (var i=0;i<cats.length;i++){\
      var cat=cats[i];\
      var entityId = "DT"+ENTITY_TYPE_ID+"_"+cat.ID;\
      var statuses=[];\
      try{ statuses = await bCall("crm.status.list", { filter:{ ENTITY_ID:entityId }, order:{ SORT:"ASC" } }); }catch(e){ continue; }\
      var order=[];\
      for (var j=0;j<(statuses||[]).length;j++){\
        var st=statuses[j];\
        var id = String(st.STATUS_ID||st.ID||"");\
        var name = st.NAME||st.TITLE||id;\
        var sort = Number(st.SORT||0);\
        if(!id) continue;\
        S.stageMap.set(id,{ID:id,NAME:name,CATEGORY_ID:cat.ID,SORT:sort});\
        order.push(id);\
      }\
      order.sort(function(a,b){ return (S.stageMap.get(a).SORT||0)-(S.stageMap.get(b).SORT||0); });\
      S.stageOrderByCat.set(cat.ID,order);\
    }\
  }\
\
  async function ensureFieldMeta(){\
    if (FIELD_META) return FIELD_META;\
    var res = await bCall("crm.item.fields", { entityTypeId: ENTITY_TYPE_ID });\
    FIELD_META = res.fields || res || {};\
    return FIELD_META;\
  }\
  function getListText(fieldCode, value){\
    if (value===null||value===undefined||value==="") return "—";\
    var f = FIELD_META && FIELD_META[fieldCode];\
    if (!f || !Array.isArray(f.items)) return value;\
    var found = f.items.find(function(it){ return String(it.ID)===String(value); });\
    return found ? (found.VALUE || value) : value;\
  }\
\
  async function getUser(id){\
    id = Number(id||0); if(!id) return null;\
    if (USERS.has(id)) return USERS.get(id);\
    var res = await bCall("user.get", { ID:id });\
    var u = Array.isArray(res) ? res[0] : (res && res[0]) || res;\
    if (u){ USERS.set(id,u); }\
    return u;\
  }\
\
  async function loadItems(){\
    var res = await bCall("crm.item.list", {\
      entityTypeId: ENTITY_TYPE_ID,\
      order:{ id:"desc" },\
      select: SELECT_FIELDS,\
      start: -1\
    });\
    var items = (res && (res.items||res.result&&res.result.items)) || [];\
    return items.map(function(it){\
      return {\
        id: it.id, title: it.title, assignedById: it.assignedById, stageId: it.stageId, categoryId: it.categoryId||0,\
        dealId: it[UF.DEAL_ID]||null, licKey: it[UF.LIC_KEY]||"", portalUrl: it[UF.PORTAL_URL]||"",\
        tariff: it[UF.TARIFF]||null, endTariff: it[UF.END_TARIFF]||null, endMarket: it[UF.END_MARKET]||null, product: it[UF.PRODUCT]||null\
      };\
    });\
  }\
\
  function stagePercent(catId, stageId){\
    var arr = S.stageOrderByCat.get(catId) || []; if(!arr.length) return 0;\
    var idx = Math.max(0, arr.indexOf(stageId));\
    return Math.round((idx+1)/arr.length*100);\
  }\
  function stageSelectHtml(catId,currentId){\
    var arr=S.stageOrderByCat.get(catId)||[]; if(!arr.length) return "<span class=\\"muted\\">Нет стадий</span>";\
    var html="<select class=\\"select\\">";\
    for (var i=0;i<arr.length;i++){\
      var sid=arr[i]; var st=S.stageMap.get(sid); var name=st?st.NAME:sid;\
      html += "<option value=\\""+sid+"\\"" + (sid===currentId?" selected":"") + ">"+name+"</option>";\
    }\
    html += "</select>";\
    return html;\
  }\
\
  function escapeHtml(s){\
    return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\\"/g,"&quot;");\
  }\
\
  function rowHtml(row){\
    var st=S.stageMap.get(row.stageId); var stageTitle=st?st.NAME:(row.stageId||"—");\
    var percent=stagePercent(row.categoryId,row.stageId);\
    var licKey = row.licKey ? row.licKey : "—";\
    var portalLink = row.portalUrl ? ("<a href=\\""+row.portalUrl+"\\" target=\\"_blank\\" rel=\\"noopener\\">"+row.portalUrl+"</a>") : "—";\
    var tariffText=getListText(UF.TARIFF,row.tariff);\
    var productText=getListText(UF.PRODUCT,row.product);\
    var endTariff=row.endTariff?row.endTariff:"—";\
    var endMarket=row.endMarket?row.endMarket:"—";\
    return "<tr data-id=\\""+row.id+"\\" data-cat=\\""+row.categoryId+"\\">" +\
      "<td>"+row.id+"</td>" +\
      "<td><a href=\\"#\\" class=\\"js-open\\">"+escapeHtml(row.title||"(без названия)")+"</a></td>" +\
      "<td class=\\"js-user\\">—</td>" +\
      "<td><div class=\\"stage-cell\\"><div class=\\"stage-bar\\"><div class=\\"stage-fill\\" style=\\"width:"+percent+"%\\"></div></div>"+stageSelectHtml(row.categoryId,row.stageId)+"</div></td>" +\
      "<td>"+(row.dealId==null?"—":row.dealId)+"</td>" +\
      "<td>"+licKey+"</td>" +\
      "<td>"+portalLink+"</td>" +\
      "<td>"+tariffText+"</td>" +\
      "<td>"+endTariff+"</td>" +\
      "<td>"+endMarket+"</td>" +\
      "<td>"+productText+"</td>" +\
      "<td class=\\"actions\\"><button class=\\"btn secondary js-open\\">Открыть</button> <button class=\\"btn secondary js-del\\">Удалить</button></td>" +\
    "</tr>";\
  }\
\
  async function render(){\
    tbody.innerHTML="";\
    await ensureFieldMeta();\
    var rows = await loadItems();\
    var size=Number(pageSizeEl.value||10); rows=rows.slice(0,size);\
    tbody.innerHTML = rows.map(rowHtml).join("");\
    var trs = Array.prototype.slice.call(tbody.querySelectorAll("tr"));\
    for (var i=0;i<trs.length;i++){\
      (function(tr){\
        var id=Number(tr.getAttribute("data-id"));\
        var row=rows.find(function(r){return r.id===id;}); if(!row) return;\
        getUser(row.assignedById).then(function(u){\
          var cell=tr.querySelector(".js-user"); if(!cell) return;\
          if(u){\
            var name=[u.NAME,u.LAST_NAME].filter(Boolean).join(" ") || (u.LAST_NAME||u.NAME||("ID "+u.ID));\
            cell.innerHTML = "<a href=\\"/company/personal/user/"+u.ID+"/\\" target=\\"_blank\\">"+escapeHtml(name)+"</a>";\
          }else{ cell.textContent="—"; }\
        }).catch(function(){ var c=tr.querySelector(".js-user"); if(c) c.textContent="—"; });\
      })(trs[i]);\
    }\
  }\
\
  tbody.addEventListener("change", function(e){\
    var sel=e.target; if(sel.tagName!=="SELECT") return;\
    var tr=sel.closest("tr"); if(!tr) return;\
    var id=Number(tr.getAttribute("data-id"));\
    var newStage=sel.value;\
    bCall("crm.item.update",{ entityTypeId:ENTITY_TYPE_ID, id:id, fields:{ stageId:newStage } })\
      .then(function(){ render(); })\
      .catch(function(err){ notify("Ошибка смены стадии: "+err); });\
  });\
  tbody.addEventListener("click", function(e){\
    var btn=e.target.closest(".js-open");\
    if(btn){ e.preventDefault(); var tr=btn.closest("tr"); var id=Number(tr.getAttribute("data-id")); BX24.openPath("/crm/type/"+ENTITY_TYPE_ID+"/details/"+id+"/"); return; }\
    var del=e.target.closest(".js-del");\
    if(del){ var tr2=del.closest("tr"); var id2=Number(tr2.getAttribute("data-id")); if(!confirm("Удалить элемент #"+id2+"?")) return; bCall("crm.item.delete",{ entityTypeId:ENTITY_TYPE_ID, id:id2 }).then(function(){ render(); }).catch(function(err){ notify("Ошибка удаления: "+err); }); }\
  });\
  document.getElementById("btnRefresh").addEventListener("click", function(){ render(); });\
  pageSizeEl.addEventListener("change", function(){ render(); });\
  document.getElementById("btnNew").addEventListener("click", function(){ BX24.openPath("/crm/type/"+ENTITY_TYPE_ID+"/details/0/?open=edit"); });\
  document.getElementById("btnPick").addEventListener("click", function(){ BX24.openPath("/crm/type/"+ENTITY_TYPE_ID+"/list/"); });\
\
  function start(){ loadStages().then(function(){ render(); }).catch(function(e){ notify("Ошибка загрузки стадий: "+e); }); }\
  ready(function(){\
    var tm=setTimeout(function(){},1500);\
    function boot(){ clearTimeout(tm); start(); }\
    if (window.BX24 && typeof BX24.init==="function"){ BX24.init(boot); }\
    else { var wait=setInterval(function(){ if(window.BX24&&typeof BX24.init==="function"){ clearInterval(wait); BX24.init(boot); } },100); }\
  });\
})();\
</script>\
</body></html>';
