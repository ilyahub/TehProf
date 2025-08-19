export default {
  async fetch(request) {
    // ========= НАСТРОЙКА =========
    const DEAL_FIELD_CODE = 'UF_CRM_1755533553'; // множественное поле в сделке (ID или DYNAMIC_1032_x)
    const SMART_ENTITY_TYPE_ID = 1032;          // ID вашего смарт-процесса
    const PORTAL_ORIGIN = 'https://tehprof.bitrix24.kz';

    // UF-поля смарт-процесса «Лицензии»
    const F = {
      dealIdSource: 'UF_CRM_10_1717328665682', // ID исходной сделки (number)
      licenseKey  : 'UF_CRM_10_1717328730625', // Лицензионный ключ (string)
      portalUrl   : 'UF_CRM_10_1717328814784', // Адрес портала (url)
      tariff      : 'UF_CRM_10_1717329015552', // Текущий тариф (list)
      tariffEnd   : 'UF_CRM_10_1717329087589', // Дата окончания тарифа (date)
      marketEnd   : 'UF_CRM_10_1717329109963', // Дата окончания подписки (date)
      product     : 'UF_CRM_10_1717329453779', // Продукт (list)
    };

    // ранний снимок POST для PLACEMENT_OPTIONS (достанем ID сделки до init)
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

    const html = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<title>Лицензии</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{
    --bg:#f5f7fb; --ink:#111827; --mut:#6b7280; --line:#e5e7eb;
    --blue:#3bc8f5; --blue-h:#3eddff; --blue-a:#12b1e3;
  }
  *{box-sizing:border-box}
  body{margin:0;padding:20px 22px;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial;
       background:var(--bg);color:var(--ink)}
  h1{margin:0 0 14px;font-size:38px;color:#60a5fa;font-weight:800}

  .toolbar{display:flex;gap:10px;align-items:center;margin:10px 0 12px;flex-wrap:wrap}
  .btn{padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;font-weight:700;transition:.12s}
  .btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
  .btn.primary:hover{background:var(--blue-h);border-color:var(--blue-h)}
  .btn.primary:active{background:var(--blue-a);border-color:var(--blue-a)}

  .table-wrap{height:calc(100vh - 170px);min-height:420px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:14px}
  table{width:100%;border-collapse:separate;border-spacing:0}
  th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  th{background:#fafbff;color:#374151;text-align:left;font-weight:700;position:sticky;top:0;z-index:2}
  tr.filters th{background:#fff;position:sticky;top:42px;z-index:2}
  tr:last-child td{border-bottom:none}
  th .resizer{position:absolute;right:0;top:0;width:6px;height:100%;cursor:col-resize;user-select:none}
  th.resizing{border-right:2px solid #93c5fd}
  .filter{width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit}

  .stage{display:flex;align-items:center;gap:10px}
  .bar{position:relative;flex:0 0 160px;height:10px;border-radius:999px;background:#edeef3;overflow:hidden}
  .bar>i{position:absolute;left:0;top:0;bottom:0;background:#a5b4fc}
  .stageSel{padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;margin-left:10px}

  .muted{color:var(--mut)} .err{color:#dc2626}

  .modal{position:fixed;inset:0;background:rgba(17,24,39,.5);display:none;align-items:center;justify-content:center;z-index:9999}
  .card{width:min(640px,95vw);max-height:85vh;background:#fff;border-radius:16px;border:1px solid var(--line);display:flex;flex-direction:column}
  .card-h{padding:14px 16px;border-bottom:1px solid var(--line);font-weight:700}
  .card-b{padding:14px 16px;overflow:auto}
  .card-f{padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end}
  .cols{columns:2 280px}
  .cols label{display:flex;align-items:center;gap:8px;padding:6px 4px}
</style>
</head><body>
  <h1>Лицензии</h1>

  <div class="toolbar">
    <button class="btn primary" id="btnCreate">Новый элемент</button>
    <button class="btn" id="btnPick">Выбрать элемент</button>
    <button class="btn" id="btnRefresh">Обновить</button>
    <button class="btn" id="btnCols">Колонки</button>

    <span class="muted" style="margin-left:auto">Показывать по:</span>
    <select id="pageSize" class="btn" style="padding:6px 10px;margin-left:6px;">
      <option value="10" selected>10</option><option value="30">30</option><option value="50">50</option><option value="100">100</option>
    </select>
    <button class="btn" id="pgPrev">‹</button>
    <span id="pgInfo" class="muted">1/1</span>
    <button class="btn" id="pgNext">›</button>
  </div>

  <div class="table-wrap">
    <table id="tbl">
      <thead>
        <tr class="head">
          <th data-col="stage">Стадия<div class="resizer"></div></th>
          <th data-col="deal">ID исходной сделки<div class="resizer"></div></th>
          <th data-col="key">Лицензионный ключ<div class="resizer"></div></th>
          <th data-col="url">Адрес портала<div class="resizer"></div></th>
          <th data-col="tariff">Текущий тариф<div class="resizer"></div></th>
          <th data-col="tEnd">Окончание тарифа<div class="resizer"></div></th>
          <th data-col="mEnd">Окончание подписки<div class="resizer"></div></th>
          <th data-col="product">Продукт<div class="resizer"></div></th>
          <th data-col="act">Действия<div class="resizer"></div></th>

          <!-- скрытые по умолчанию -->
          <th data-col="id" style="display:none">ID<div class="resizer"></div></th>
          <th data-col="title" style="display:none">Название<div class="resizer"></div></th>
          <th data-col="ass" style="display:none">Ответственный<div class="resizer"></div></th>
        </tr
