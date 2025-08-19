// _worker.js — Cloudflare Pages Functions (Bitrix24 виджет «Лицензии»)

export default {
  async fetch(request) {
    return new Response(HTML, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
    });
  }
};

/* --------------------- HTML целиком одной строкой --------------------- */
const HTML =
'<!doctype html><html lang="ru"><head><meta charset="utf-8">\
<meta name="viewport" content="width=device-width, initial-scale=1">\
<title>Лицензии</title><link rel="preconnect" href="https://api.bitrix24.com">\
<style>html,body{height:100%;margin:0;background:#f5f7fb;font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;color:#1d222b}\
.widget-root{height:100%;display:flex;flex-direction:column}\
.toolbar{display:flex;align-items:center;gap:12px;padding:12px 16px}\
.title{font-weight:700;font-size:28px;margin-right:auto}\
.btn{appearance:none;border:1px solid #3bc8f5;background:#3bc8f5;color:#fff;padding:8px 12px;border-radius:8px;cursor:pointer}\
.btn:hover{background:#3eddff;border-color:#3eddff}.btn.secondary{background:#fff;color:#1d222b;border-color:#dcdfe4}\
.select{padding:6px 8px;border:1px solid #dcdfe4;border-radius:8px;background:#fff}\
.table-wrap{height:calc(100vh - 80px);padding:0 16px 16px;overflow:auto}\
table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border-radius:10px;overflow:hidden}\
th,td{padding:10px 12px;border-bottom:1px solid #eef0f4;white-space:nowrap;vertical-align:middle}\
th{position:sticky;top:0;z-index:1;background:#fafbfd;font-weight:600}.muted{color:#8b8f99}a{color:#136bf5;text-decoration:none}a:hover{text-decoration:underline}\
.stage-bar{width:200px;height:8px;background:#eef0f4;border-radius:6px;position:relative}.stage-fill{position:absolute;left:0;top:0;height:8px;background:#b7cbe7;border-radius:6px}\
.actions .btn{padding:6px 10px}\
</style><script src="https://api.bitrix24.com/api/v1/"></script></head><body>\
<div class="widget-root">\
  <div class="toolbar">\
    <div class="title">Лицензии</div>\
    <button class="btn" id="btnNew">Новый элемент</button>\
    <button class="btn secondary" id="btnPick">Выбрать элемент</button>\
    <button class="btn secondary" id="btnRefresh">Обновить</button>\
    <div style="margin-left:auto;display:flex;align-items:center;gap:8px">\
      <span class="muted">Показывать по:&nbsp;</span>\
      <select id="pageSize" class="select"><option value="10">10</option><option value="30">30</option><option value="50">50</option></select>\
    </div>\
  </div>\
  <div class="table-wrap">\
    <table id="grid">\
      <thead><tr>\
        <th>Стадия</th><th>ID исходной сделки</th><th>Лицензионный ключ</th><th>Адрес портала</th>\
        <th>Текущий тариф</th><th>Окончание тарифа</th><th>Окончание подписки</th><th>Продукт</th><th>Действия</th>\
      </tr></thead>\
      <tbody id="tbody"></tbody>\
    </table>\
  </div>\
</div>\
<script>(function(){\
  var ENTITY_TYPE_ID = 1032; /* SPA */\
  var REL_DEAL_FIELD = "UF_CRM_1755533553"; /* множественное поле сделки с ID элементов SPA */\
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
  var stage = { map:new Map(), byCat:new Map() };\
  var FIELD_META = null, FIELD_META_LC = {};\
  var tbody = document.getElementById("tbody");\
  var pageSizeEl = document.getElementById("pageSize");\
  var LINKED_IDS = [];\
\
  function alertMsg(m){ try{ alert(m); }catch(e){} }\
  function bCall(method, params){\
    return new Promise(function(res,rej){\
      if(!window.BX24) return rej("BX24 not ready");\
      BX24.callMethod(method, params||{}, function(r){\
        if(r.error()) rej(r.error()+\" — \"+r.error_description());\
        else{ var d=(typeof r.data===\"function\")?r.data():(r.answer?r.answer.result:r); res(d);}\
      });\
    });\
  }\
  function escapeHtml(s){ return String(s||\"\").replace(/&/g,\"&amp;\").replace(/</g,\"&lt;\").replace(/>/g,\"&gt;\").replace(/\\\"/g,\"&quot;\"); }\
  function getFieldMeta(code){ return FIELD_META_LC[ String(code||\"\").toLowerCase() ] || null; }\
  function getListText(code,val){ var f=getFieldMeta(code); if(!f||!Array.isArray(f.items)) return (val==null||val===\"\")?\"—\":val; var it=f.items.find(function(x){ return String(x.ID)===String(val);}); return it?(it.VALUE||it.NAME||val):val; }\
\
  function parseSpaIds(raw){\
    if(!raw) return []; var a=Array.isArray(raw)?raw:[raw]; var out=[]; for(var i=0;i<a.length;i++){ var v=a[i]; if(typeof v===\"number\") out.push(v); else if(typeof v===\"string\"){ var m=v.match(/(\\d+)$/); if(m) out.push(Number(m[1])); } }\
    var uniq={}; var res=[]; for(var j=0;j<out.length;j++){ var k=out[j]; if(!uniq[k]){uniq[k]=1; res.push(k);} } return res;\
  }\
\
  function getDealId(){\
    return new Promise(function(resolve){\
      BX24.placement.info(function(info){\
        var id=null; if(info&&info.options){ id=info.options.ID||info.options.id||null; }\
        if(!id){ try{ var raw=BX24.getParam(\"PLACEMENT_OPTIONS\")||\"\"; var o=JSON.parse(raw||\"null\"); if(o&&o.ID) id=o.ID; }catch(e){} }\
        resolve(Number(id||0));\
      });\
    });\
  }\
\
  async function loadLinkedIds(dealId){\
    if(!dealId) return [];\
    try{ var d=await bCall(\"crm.deal.get\",{id:dealId}); var field=d[REL_DEAL_FIELD]|| (d.deal && d.deal[REL_DEAL_FIELD]) || null; return parseSpaIds(field); }\
    catch(e){ console.log(\"deal.get\",e); return []; }\
  }\
\
  async function loadStages(){\
    stage.map.clear(); stage.byCat.clear();\
    var cats=[]; try{ var r=await bCall(\"crm.item.category.list\",{entityTypeId:ENTITY_TYPE_ID}); cats=(r&&r.categories)||r||[]; }catch(e){ cats=[{id:0,name:\"По умолчанию\"}]; }\
    for(var i=0;i<cats.length;i++){\
      var c=cats[i]; var cid=Number(c.id||c.ID||0); var entityId=\"DT\"+ENTITY_TYPE_ID+\"_\"+cid; var st=[];\
      try{ st=await bCall(\"crm.status.list\",{filter:{ENTITY_ID:entityId},order:{SORT:\"ASC\"}}); }catch(e){ st=[]; }\
      var order=[]; for(var j=0;j<st.length;j++){ var s=st[j]; var sid=String(s.STATUS_ID||s.ID||\"\"); if(!sid) continue; var item={ID:sid,NAME:s.NAME||s.TITLE||sid,CATEGORY_ID:cid,SORT:Number(s.SORT||0)}; stage.map.set(sid,item); order.push(sid);}\
      order.sort(function(a,b){ return (stage.map.get(a).SORT||0)-(stage.map.get(b).SORT||0);}); stage.byCat.set(cid,order);\
    }\
  }\
\
  async function ensureFieldMeta(){\
    if(FIELD_META) return; var r=await bCall(\"crm.item.fields\",{entityTypeId:ENTITY_TYPE_ID}); FIELD_META=r.fields||r||{}; FIELD_META_LC={}; for(var k in FIELD_META){ FIELD_META_LC[k.toLowerCase()]=FIELD_META[k]; }\
  }\
\
  function stagePercent(catId,stageId){ var arr=stage.byCat.get(catId)||[]; if(!arr.length) return 0; var idx=Math.max(0,arr.indexOf(stageId)); return Math.round((idx+1)/arr.length*100); }\
  function stageSelectHtml(catId,current){ var arr=stage.byCat.get(catId)||[]; if(!arr.length) return \"<span class=\\\"muted\\\">Нет стадий</span>\"; var h=\"<select class=\\\"select\\\">\"; for(var i=0;i<arr.length;i++){ var id=arr[i]; var name=(stage.map.get(id)||{}).NAME||id; h+=\"<option value=\\\"\"+id+\"\\\"\"+(id===current?\" selected\":\"\")+\">\"+escapeHtml(name)+\"</option>\";} return h+=\"</select>\"; }\
\
  function rowHtml(row){\
    var p=stagePercent(row.categoryId,row.stageId); var portal=row.portalUrl?\"<a href=\\\"\"+row.portalUrl+\"\\\" target=\\\"_blank\\\" rel=\\\"noopener\\\">\"+escapeHtml(row.portalUrl)+\"</a>\":\"—\";\
    var tariff=getListText(UF.TARIFF,row.tariff); var product=getListText(UF.PRODUCT,row.product); var endTariff=row.endTariff||\"—\"; var endMarket=row.endMarket||\"—\"; var deal=row.dealId==null?\"—\":row.dealId;\
    return \"<tr data-id=\\\"\"+row.id+\"\\\" data-cat=\\\"\"+row.categoryId+\"\\\">\"+\
      \"<td><div class=\\\"stage-bar\\\"><div class=\\\"stage-fill\\\" style=\\\"width:\"+p+\"%\\\"></div></div> \"+stageSelectHtml(row.categoryId,row.stageId)+\"</td>\"+\
      \"<td>\"+deal+\"</td><td>\"+(row.licKey||\"—\")+\"</td><td>\"+portal+\"</td>\"+\
      \"<td>\"+tariff+\"</td><td>\"+endTariff+\"</td><td>\"+endMarket+\"</td><td>\"+product+\"</td>\"+\
      \"<td class=\\\"actions\\\"><button class=\\\"btn secondary js-open\\\">Открыть</button> <button class=\\\"btn secondary js-del\\\">Удалить</button></td>\"+\
    \"</tr>\";\
  }\
\
  async function loadItems(limit){\
    if(!LINKED_IDS.length) return [];\
    var r=await bCall(\"crm.item.list\",{ entityTypeId:ENTITY_TYPE_ID, select:SELECT_FIELDS, filter:{ \"@id\": LINKED_IDS }, limit: limit, start: -1 });\
    var arr=(r && (r.items|| (r.result&&r.result.items))) || [];\
    var rows=[]; for(var i=0;i<arr.length;i++){ var it=arr[i]; rows.push({ id:it.id, title:it.title, assignedById:it.assignedById, stageId:it.stageId, categoryId:it.categoryId||0, dealId:it[UF.DEAL_ID]||null, licKey:it[UF.LIC_KEY]||\"\", portalUrl:it[UF.PORTAL_URL]||\"\", tariff:it[UF.TARIFF]||null, endTariff:it[UF.END_TARIFF]||null, endMarket:it[UF.END_MARKET]||null, product:it[UF.PRODUCT]||null }); }\
    return rows;\
  }\
\
  async function render(){\
    await ensureFieldMeta();\
    var limit=Number(pageSizeEl.value||10); var items=await loadItems(limit); tbody.innerHTML = items.map(rowHtml).join(\"\");\
  }\
\
  /* --- события таблицы --- */\
  tbody.addEventListener(\"change\", function(e){ var sel=e.target; if(sel.tagName!==\"SELECT\") return; var tr=sel.closest(\"tr\"); if(!tr) return; var id=Number(tr.getAttribute(\"data-id\")); var st=sel.value; bCall(\"crm.item.update\",{entityTypeId:ENTITY_TYPE_ID,id:id,fields:{stageId:st}}).then(function(){ render(); }).catch(function(err){ alertMsg(\"Ошибка смены стадии: \"+err); }); });\
  tbody.addEventListener(\"click\", function(e){\
    var open=e.target.closest(\".js-open\"); if(open){ var tr=open.closest(\"tr\"); var id=Number(tr.getAttribute(\"data-id\")); try{ if(top && top.BX && top.BX.SidePanel){ top.BX.SidePanel.Instance.open(\"/crm/type/\"+ENTITY_TYPE_ID+\"/details/\"+id+\"/\",{cacheable:false}); } else { BX24.openPath(\"/crm/type/\"+ENTITY_TYPE_ID+\"/details/\"+id+\"/\"); } }catch(ex){ BX24.openPath(\"/crm/type/\"+ENTITY_TYPE_ID+\"/details/\"+id+\"/\"); } return; }\
    var del=e.target.closest(\".js-del\"); if(del){ var tr2=del.closest(\"tr\"); var id2=Number(tr2.getAttribute(\"data-id\")); if(!confirm(\"Удалить элемент #\"+id2+\"?\")) return; bCall(\"crm.item.delete\",{entityTypeId:ENTITY_TYPE_ID,id:id2}).then(function(){ render(); }).catch(function(err){ alertMsg(\"Ошибка удаления: \"+err); }); }\
  });\
\
  document.getElementById(\"btnRefresh\").addEventListener(\"click\", function(){ render(); });\
  pageSizeEl.addEventListener(\"change\", function(){ render(); });\
  document.getElementById(\"btnPick\").addEventListener(\"click\", function(){ try{ if(top && top.BX && top.BX.SidePanel){ top.BX.SidePanel.Instance.open(\"/crm/type/\"+ENTITY_TYPE_ID+\"/list/\",{cacheable:false}); } else { BX24.openPath(\"/crm/type/\"+ENTITY_TYPE_ID+\"/list/\"); } }catch(e){ BX24.openPath(\"/crm/type/\"+ENTITY_TYPE_ID+\"/list/\"); } });\
  document.getElementById(\"btnNew\").addEventListener(\"click\", async function(){\
    try{ if(top && top.BX && top.BX.SidePanel){ top.BX.SidePanel.Instance.open(\"/crm/type/\"+ENTITY_TYPE_ID+\"/details/0/?open=edit\",{cacheable:false}); return; } }catch(e){}\
    try{ var r=await bCall(\"crm.item.add\",{entityTypeId:ENTITY_TYPE_ID,fields:{title:\"Новый элемент\"}}); var nid=(r && (r.item&&r.item.id)) || r.id || r; BX24.openPath(\"/crm/type/\"+ENTITY_TYPE_ID+\"/details/\"+nid+\"/\"); }\
    catch(err){ alertMsg(\"Не удалось создать элемент: \"+err); }\
  });\
\
  function start(){ Promise.all([loadStages(), getDealId().then(loadLinkedIds)]).then(function(res){ LINKED_IDS = res[1] || []; render(); }).catch(function(e){ alertMsg(\"Ошибка инициализации: \"+e); }); }\
  if(document.readyState!==\"loading\"){ BX24.init(start); } else { document.addEventListener(\"DOMContentLoaded\", function(){ BX24.init(start); }); }\
})();</script></body></html>';
