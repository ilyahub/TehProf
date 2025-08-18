export default {
  async fetch(request) {
    // --- 1) аккуратно читаем POST, берем только нужное ---
    let placement = null, placementOptions = "";
    if (request.method !== "GET") {
      try {
        const ct = (request.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
          const fd = await request.formData();
          placement        = fd.get("PLACEMENT") || null;
          placementOptions = fd.get("PLACEMENT_OPTIONS") || "";
        } else if (ct.includes("application/json")) {
          const j = await request.json();
          placement        = j.PLACEMENT || null;
          placementOptions = j.PLACEMENT_OPTIONS || "";
        }
      } catch (_) { /* ignore */ }
    }

    // --- 2) подтягиваем SDK сервер-сайд и вшиваем ---
    let sdk = "";
    try { const r = await fetch("https://api.bitrix24.com/api/v1/"); sdk = await r.text(); }
    catch { sdk = "throw new Error('BX24 SDK fetch failed');"; }

    // --- 3) HTML (GET/POST -> 200) ---
    const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<title>Виджет сделки</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{margin:0;padding:24px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;background:#f7f8fb}
  h1{margin:0 0 14px;font-size:36px;color:#60a5fa;font-weight:800}
  .kv{margin:6px 0;color:#6b7280}.kv b{color:#111827}
  .muted{color:#9ca3af}
  .ok{color:#059669}.err{color:#dc2626}
</style>
</head><body>
  <h1>Виджет сделки</h1>
  <div class="kv"><b>Deal ID:</b> <span id="dealId">—</span></div>
  <div class="kv"><b>Placement:</b> <span id="placement">—</span></div>
  <div class="kv muted" id="status"></div>

  <script>
    // bootstrap из POST (без токенов)
    window.__BOOTSTRAP__ = ${JSON.stringify({ placement, placementOptions })};
  </script>
  <script>${sdk}</script>
  <script>
    const $ = (id)=>document.getElementById(id);
    const J = (s)=>{ try{return JSON.parse(s)}catch{return{} } };
    const pickId = (o)=> o.ID||o.ENTITY_ID||o.dealId||o.DEAL_ID||(o.DOCUMENT_ID&&/^\\D+_(\\d+)$/.test(o.DOCUMENT_ID)?RegExp.$1:null)||null;

    // 0) быстрый фолбэк из POST
    (function fillFromPost(){
      const b = window.__BOOTSTRAP__ || {};
      if (b.placement) $('placement').textContent = b.placement;
      const id = pickId(J(b.placementOptions||"{}"));
      if (id) $('dealId').textContent = id;
    })();

    // 1) init SDK + основной путь
    function fit(){ try{ BX24 && BX24.resizeWindow(document.documentElement.scrollHeight, 200);}catch(e){} }
    (function wait(start=Date.now()){
      if (typeof BX24!=='undefined'){ return startInit(); }
      if (Date.now()-start>8000){ $('status').textContent = 'BX24 SDK не появился (inline)'; return; }
      setTimeout(()=>wait(start),150);
    })();

    function startInit(){
      let done=false; const guard=setTimeout(()=>{ if(!done) $('status').textContent='BX24.init не ответил'; },3000);
      BX24.init(function(){
        done=true; clearTimeout(guard);
        BX24.placement.info(function(info){
          // отобразим placement
          $('placement').textContent = info?.placement || $('placement').textContent || '—';

          // вытащим ID из options или из PLACEMENT_OPTIONS
          let id = pickId(info?.options||{});
          if (!id) id = pickId(J(BX24.getParam('PLACEMENT_OPTIONS')||'{}'));
          if (id) $('dealId').textContent = id;

          // опционально проверим, что ID валиден
          if (id) {
            BX24.callMethod('crm.deal.get', { id }, function(r){
              if (!r.error()) $('status').innerHTML = '<span class="ok">crm.deal.get OK</span>';
            });
          }
          fit();
        });
      });
    }
    addEventListener('load',fit); addEventListener('resize',fit); setInterval(fit,900);
  </script>
</body></html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // CSP: ничего внешнего не требуем, SDK вшит; встраивание — только вашим порталом
        "content-security-policy":
          "default-src 'self' data: blob:; " +
          "script-src 'self' 'unsafe-inline'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data:; connect-src *; " +
          "frame-ancestors https://tehprof.bitrix24.kz https://*.bitrix24.kz",
        "cache-control": "no-store"
      }
    });
  }
};
