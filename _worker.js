export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1) Отдаём SDK по /bx24.js
    if (url.pathname === "/bx24.js") {
      let resp;
      try {
        // Попробуем из статики проекта (если файл лежит в репо)
        if (env.ASSETS) {
          const r = await env.ASSETS.fetch(new Request(new URL("/bx24.js", url), request));
          if (r && r.ok) resp = r;
        }
      } catch (_) {}
      // Фолбэк: тянем свежий SDK с api.bitrix24.com и отдаём как self
      if (!resp) {
        resp = await fetch("https://api.bitrix24.com/api/v1/");
      }
      if (!resp || !resp.ok) {
        return new Response("console.error('Failed to load BX24 SDK')", {
          headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
          status: 200
        });
      }
      return new Response(resp.body, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=86400"
        }
      });
    }

    // 2) Основной HTML
    const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8" />
<title>Виджет сделки (Bitrix24)</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body{margin:0;padding:24px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;background:#f9fafb}
  h1{margin:0 0 16px;font-size:40px;color:#60a5fa;font-weight:800}
  .kv{margin:6px 0;color:#6b7280}.kv b{color:#111827}
  pre{background:#0b1020;color:#d1d5db;padding:12px;border-radius:12px;white-space:pre-wrap;max-height:55vh;overflow:auto}
</style>
</head><body>
  <h1>Виджет сделки</h1>
  <div class="kv"><b>Deal ID:</b> <span id="dealId">—</span></div>
  <div class="kv"><b>Placement:</b> <span id="placement">—</span></div>
  <pre id="raw">// Диагностика будет выведена сюда...</pre>

<script>
const ui={dealId:()=>document.getElementById('dealId'),placement:()=>document.getElementById('placement'),raw:()=>document.getElementById('raw')};
function log(s){ui.raw().textContent += "\\n" + (Array.isArray(s)?s.join("\\n"):String(s||""));}
window.addEventListener('error',e=>log("❌ JS error: "+(e.message||e)));
window.addEventListener('unhandledrejection',e=>log("❌ Promise rejection: "+(e.reason && (e.reason.message||e.reason))));

function J(s){try{return JSON.parse(s)}catch{return{}}}
function getId(o){return o.ID||o.ENTITY_ID||o.dealId||o.DEAL_ID||(o.DOCUMENT_ID&&/^\\D+_(\\d+)$/.test(o.DOCUMENT_ID)?RegExp.$1:null)||null}

const inIframe=(()=>{try{return top!==self}catch{return true}})();
log(["ENV:","  inIframe: "+inIframe,"  location.hostname: "+location.hostname,""]);

// 0) Динамически грузим локальный SDK и явно логируем успех/ошибку
(function loadLocal(){
  const s=document.createElement('script');
  s.src="/bx24.js?v=1";
  s.async=true;
  s.onload=function(){ log("✅ SDK загружен с /bx24.js"); waitBx24(); };
  s.onerror=function(){ log("❌ Не загрузился /bx24.js (проверь маршрут в воркере/деплой)."); };
  document.head.appendChild(s);
})();

function waitBx24(){
  let i=0; const h=setInterval(function(){
    if(typeof BX24!=="undefined"){ clearInterval(h); log("✅ window.BX24 доступен, init..."); initBx(); return; }
    if(++i>50){ clearInterval(h); log("❌ BX24 не появился за ~7.5с."); }
  },150);
}

function initBx(){
  let inited=false; const guard=setTimeout(()=>{ if(!inited) log("⏱ BX24.init не ответил >3с — возможно, это не корректный пласмент."); },3000);
  try{
    BX24.init(function(){
      inited=true; clearTimeout(guard);
      log("✅ BX24.init: OK");

      BX24.placement.info(function(info){
        if(!info||typeof info!=="object"){ log("❌ placement.info пуст/некорректен."); return; }
        log(["placement.info():", JSON.stringify(info,null,2)]);

        const placement=info.placement||"—";
        const opts=info.options||{};
        let dealId=getId(opts);

        if(!dealId){
          const raw=BX24.getParam("PLACEMENT_OPTIONS")||"";
          const alt=J(raw), altId=getId(alt);
          log(["PLACEMENT_OPTIONS (raw):", raw||"(empty)", altId?("-> Fallback dealId: "+altId):"-> Fallback dealId не найден"]);
          if(altId) dealId=altId;
        }

        ui.placement().textContent=placement;
        ui.dealId().textContent=dealId||"не найден";

        BX24.callMethod("app.info",{},function(r){
          if(r.error()){ log(["❌ app.info:", r.error()+" — "+r.error_description()]); return; }
          log("✅ app.info OK — авторизация есть.");
          if(dealId){
            BX24.callMethod("crm.deal.get",{id:dealId},function(r2){
              if(r2.error()) log(["❌ crm.deal.get:", r2.error()+" — "+r2.error_description()]);
              else log("✅ crm.deal.get OK — ID валиден.");
            });
          } else {
            log("⚠ dealId не найден — проверьте placement/options.");
          }
        });
      });
    });
  }catch(e){ log(["❌ Исключение при BX24.init:", e && (e.stack||e.message||e)]); }
}

function fit(){ try{ BX24 && BX24.resizeWindow(document.documentElement.scrollHeight, 200);}catch(e){} }
addEventListener('load',fit); addEventListener('resize',fit); setInterval(fit,900);
</script>
</body></html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // CSP только 'self' + inline; внешние домены не нужны
        "content-security-policy":
          "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
          "connect-src * data: blob:; img-src * data: blob:; style-src 'self' 'unsafe-inline'; " +
          "frame-ancestors https://tehprof.bitrix24.kz https://*.bitrix24.kz",
        "cache-control": "no-store"
      }
    });
  }
};
