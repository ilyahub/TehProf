export default {
  async fetch(request) {
    // 1) Считываем POST, чтобы достать PLACEMENT/PLACEMENT_OPTIONS
    let post = {};
    try {
      if (request.method !== "GET") {
        const ct = (request.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
          const fd = await request.formData();
          for (const [k, v] of fd.entries()) post[k] = String(v);
        } else if (ct.includes("application/json")) {
          post = await request.json();
        }
      }
    } catch (e) {
      post.__post_error = String(e);
    }

    // 2) Подтягиваем SDK сервер-сайд и инлайнем его
    let sdk = "";
    try { const r = await fetch("https://api.bitrix24.com/api/v1/"); sdk = await r.text(); }
    catch (e) { sdk = "console.error('BX24 SDK fetch failed:', " + JSON.stringify(String(e)) + ");"; }

    // 3) Отдаём HTML (GET/POST → 200)
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

  <!-- Вшиваем снапшот POST -->
  <script>window.__B24_POST__ = ${JSON.stringify(post)};</script>
  <!-- Вшиваем SDK -->
  <script>${sdk}</script>

  <script>
    const ui={dealId:()=>document.getElementById('dealId'),placement:()=>document.getElementById('placement'),raw:()=>document.getElementById('raw')};
    const log = (x)=>{ ui.raw().textContent += "\\n" + (Array.isArray(x)?x.join("\\n"):String(x||"")); };
    const J = (s)=>{ try{return JSON.parse(s)}catch{return{}} };
    const pickId = (o)=> o.ID||o.ENTITY_ID||o.dealId||o.DEAL_ID||(o.DOCUMENT_ID&&/^\\D+_(\\d+)$/.test(o.DOCUMENT_ID)?RegExp.$1:null)||null;

    // 0) Отладка: покажем что пришло в POST
    log(["POST snapshot:", JSON.stringify(window.__B24_POST__, null, 2)]);

    // 1) Попробуем сразу извлечь ID из POST, не дожидаясь SDK
    (function fromPost(){
      const p = window.__B24_POST__ || {};
      if (p.PLACEMENT) ui.placement().textContent = p.PLACEMENT;
      let id = pickId(J(p.PLACEMENT_OPTIONS||"{}")) || p.ENTITY_ID || p.ID || null;
      if (id) ui.dealId().textContent = id;
    })();

    // 2) Дальше — обычный путь через SDK
    (function waitBx(start=Date.now()){
      if (typeof BX24!=="undefined"){ log("✅ BX24 inline найден, init..."); return doInit(); }
      if (Date.now()-start>8000){ log("❌ BX24 не появился за 8с (inline)."); return; }
      setTimeout(()=>waitBx(start),150);
    })();

    function doInit(){
      let inited=false; const guard=setTimeout(()=>{ if(!inited) log("⏱ BX24.init не ответил >3с — возможно, это не корректный пласмент."); },3000);
      try{
        BX24.init(function(){
          inited=true; clearTimeout(guard);
          log("✅ BX24.init: OK");

          BX24.placement.info(function(info){
            log(["placement.info():", JSON.stringify(info,null,2)]);
            const placement=info?.placement||"—";
            const opts=info?.options||{};
            ui.placement().textContent = placement;
            const id = pickId(opts) || pickId(J(BX24.getParam("PLACEMENT_OPTIONS")||"{}"));
            if (id) ui.dealId().textContent = id;

            BX24.callMethod("app.info",{}, function(r){
              if (r.error()) log(["❌ app.info:", r.error()+" — "+r.error_description()]);
              else log("✅ app.info OK");
            });
          });
        });
      }catch(e){ log(["❌ Исключение при BX24.init:", e && (e.stack||e.message||e)]); }
    }
  </script>
</body></html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // максимально либеральный CSP, чтобы ничто не мешало SDK
        "content-security-policy":
          "default-src 'self' data: blob: https:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; " +
          "connect-src *; img-src * data: blob:; style-src 'self' 'unsafe-inline'; " +
          "frame-ancestors https://tehprof.bitrix24.kz https://*.bitrix24.kz",
        "cache-control": "no-store"
      }
    });
  }
};
