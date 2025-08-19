// functions/[[path]].js
export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  // 1) Проксируем статику (JS/CSS/карты/шрифты/картинки)
  const isAsset =
    request.method === 'GET' && (
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/favicon') ||
      url.pathname.endsWith('.js')  ||
      url.pathname.endsWith('.mjs') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.map') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.jpeg')||
      url.pathname.endsWith('.webp')||
      url.pathname.endsWith('.ico') ||
      url.pathname.endsWith('.woff')||
      url.pathname.endsWith('.woff2')||
      url.pathname.endsWith('.ttf')
    );

  if (isAsset) {
    return env.ASSETS.fetch(request);
  }

  // 2) Снимок PLACEMENT/PLACEMENT_OPTIONS (для раннего dealId)
  let placement = null, placementOptions = '';
  try {
    if (request.method !== 'GET') {
      const ct = (request.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('form')) {
        const fd = await request.formData();
        placement        = fd.get('PLACEMENT') || null;
        placementOptions = fd.get('PLACEMENT_OPTIONS') || '';
      } else if (ct.includes('json')) {
        const j = await request.json();
        placement        = j.PLACEMENT || null;
        placementOptions = j.PLACEMENT_OPTIONS || '';
      }
    }
  } catch {}

  const boot = { placement, placementOptions };

  // 3) HTML
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Лицензии</title>
<style>
  :root{--bg:#f5f7fb;--ink:#111827;--mut:#6b7280;--line:#e5e7eb;--blue:#3bc8f5;--blue-h:#3eddff;--blue-a:#12b1e3}
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;padding:20px 22px;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial;background:var(--bg);color:var(--ink)}
  h1{margin:0 0 14px;font-size:38px;color:#60a5fa;font-weight:800}

  .toolbar{display:flex;gap:10px;align-items:center;margin:10px 0 12px;flex-wrap:wrap}
  .btn{padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;font-weight:700}
  .btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}

  /* высота теперь резиновая; реальный рост — через BX24.resizeWindow() из main.js */
  .table-wrap{min-height:420px;overflow:visible;background:#fff;border:1px solid var(--line);border-radius:14px}
  table{width:100%;border-collapse:separate;border-spacing:0}
  th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  th{background:#fafbff;color:#374151;text-align:left;font-weight:700;position:sticky;top:0;z-index:2}
  tr.filters th{background:#fff;position:sticky;top:42px;z-index:2}
  th .resizer{position:absolute;right:0;top:0;width:6px;height:100%;cursor:col-resize;user-select:none}

  .filter{width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit}
  .stage{display:flex;align-items:center;gap:10px}
  .bar{position:relative;flex:0 0 160px;height:10px;border-radius:999px;background:#edeef3;overflow:hidden}
  .bar>i{position:absolute;left:0;top:0;bottom:0;background:#a5b4fc}
  .stageSel{padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;margin-left:10px}

  .modal{position:fixed;inset:0;background:rgba(17,24,39,.5);display:none;align-items:center;justify-content:center;z-index:9999}
  .card{width:min(640px,95vw);max-height:85vh;background:#fff;border-radius:16px;border:1px solid var(--line);display:flex;flex-direction:column}
  .card-h{padding:14px 16px;border-bottom:1px solid var(--line);font-weight:700}
  .card-b{padding:14px 16px;overflow:auto}
  .card-f{padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end}
  .cols{columns:2 280px}
  .cols label{display:flex;align-items:center;gap:8px;padding:6px 4px}
</style>
</head>
<body>
  <h1>Лицензии</h1>

  <div class="toolbar">
    <button class="btn primary" id="btnCreate">Новый элемент</button>
    <button class="btn" id="btnPick">Выбрать элемент</button>
    <button class="btn" id="btnRefresh">Обновить</button>
    <button class="btn" id="btnCols">Колонки</button>

    <span class="muted" style="margin-left:auto">Показывать по:</span>
    <select id="pageSize" class="btn" style="padding:6px 10px;margin-left:6px;">
      <option value="10" selected>10</option>
      <option value="30">30</option>
      <option value="50">50</option>
      <option value="100">100</option>
    </select>
    <button class="btn" id="pgPrev">‹</button>
    <span id="pgInfo" class="muted">1/1</span>
    <button class="btn" id="pgNext">›</button>
  </div>

  <div class="table-wrap">
    <table id="tbl">
      <thead>
        <tr class="head">
          <!-- Базовый порядок — reorder.js подвинет ID/Название/Ответственного в начало -->
          <th data-col="stage">Стадия<div class="resizer"></div></th>
          <th data-col="deal">ID исходной сделки<div class="resizer"></div></th>
          <th data-col="key">Лицензионный ключ<div class="resizer"></div></th>
          <th data-col="url">Адрес портала<div class="resizer"></div></th>
          <th data-col="tariff">Текущий тариф<div class="resizer"></div></th>
          <th data-col="tEnd">Окончание тарифа<div class="resizer"></div></th>
          <th data-col="mEnd">Окончание подписки<div class="resizer"></div></th>
          <th data-col="product">Продукт<div class="resizer"></div></th>
          <th data-col="act">Действия<div class="resizer"></div></th>

          <th data-col="id">ID<div class="resizer"></div></th>
          <th data-col="title">Название<div class="resizer"></div></th>
          <th data-col="ass">Ответственный<div class="resizer"></div></th>
        </tr>

        <tr class="filters">
          <th data-col="stage"><input class="filter" id="fStage" placeholder="Фильтр по стадии"></th>
          <th data-col="deal"><input class="filter" id="fDeal" placeholder="ID сделки"></th>
          <th data-col="key"><input class="filter" id="fKey" placeholder="Ключ"></th>
          <th data-col="url"><input class="filter" id="fUrl" placeholder="Портал"></th>
          <th data-col="tariff"><input class="filter" id="fTariff" placeholder="Тариф"></th>
          <th data-col="tEnd"></th>
          <th data-col="mEnd"></th>
          <th data-col="product"><input class="filter" id="fProduct" placeholder="Продукт"></th>
          <th data-col="act"></th>

          <th data-col="id"></th>
          <th data-col="title"><input class="filter" id="fTitle" placeholder="Фильтр по названию"></th>
          <th data-col="ass"><input class="filter" id="fAss" placeholder="Фильтр по ответственному"></th>
        </tr>
      </thead>
      <tbody id="rows"><tr><td colspan="12" class="muted">Загрузка…</td></tr></tbody>
    </table>
  </div>

  <!-- модал «Колонки» -->
  <div class="modal" id="colModal">
    <div class="card">
      <div class="card-h">Какие столбцы показывать</div>
      <div class="card-b"><div class="cols" id="colList"></div></div>
      <div class="card-f">
        <button class="btn" id="colCancel">Отмена</button>
        <button class="btn primary" id="colApply">Применить</button>
      </div>
    </div>
  </div>

  <script>window.__BOOT__ = ${JSON.stringify(boot)};</script>
  <!-- BX24 SDK (добавлен в CSP ниже) -->
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <!-- ВАЖНО: ES-модуль -->
  <script type="module" src="/assets/app/main.js"></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'self' data: blob:; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.bitrix24.com; " +
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src *; " +
        "frame-ancestors https://tehprof.bitrix24.kz https://*.bitrix24.kz"
    }
  });
}
