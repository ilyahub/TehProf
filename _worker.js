export default {
  async fetch(request) {
    const DEAL_FIELD_CODE = 'UF_CRM_1755533553'; // множественное поле связей в сделке
    const SMART_ENTITY_TYPE_ID = 1032;           // ваш SPA
    const PORTAL_ORIGIN = 'https://tehprof.bitrix24.kz';

    // UF-поля смарт-процесса «Лицензии»
    const F = {
      dealIdSource: 'UF_CRM_10_1717328665682',
      licenseKey  : 'UF_CRM_10_1717328730625',
      portalUrl   : 'UF_CRM_10_1717328814784',
      tariff      : 'UF_CRM_10_1717329015552',
      tariffEnd   : 'UF_CRM_10_1717329087589',
      marketEnd   : 'UF_CRM_10_1721634475111'
    };

    const boot = { DEAL_FIELD_CODE, SMART_ENTITY_TYPE_ID, F };

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Лицензии</title>
  <style>
    body { font-family: Arial, sans-serif; font-size:14px; margin:20px; }
    table { border-collapse: collapse; width: 100%; margin-top:10px; }
    th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
    th { background: #f2f2f2; }
    button { padding:6px 12px; margin:4px; cursor:pointer; }
    .err { color: red; }
  </style>
</head>
<body>
  <h2>Привязанные лицензии</h2>
  <div id="controls">
    <button id="btnAdd">Добавить лицензию</button>
  </div>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Ключ</th>
        <th>Портал</th>
        <th>Тариф</th>
        <th>Окончание тарифа</th>
        <th>Окончание маркет</th>
        <th>Действия</th>
      </tr>
    </thead>
    <tbody id="rows">
      <tr><td colspan="7">Загрузка...</td></tr>
    </tbody>
  </table>

  <script>window.__BOOT__ = ${JSON.stringify(boot)};</script>
  <!-- Подключаем официальный SDK -->
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <script>
    (function waitBx24(){
      let tries = 0;
      function go(){
        if (typeof BX24 === 'undefined') {
          if (++tries < 100) return setTimeout(go, 50);
          document.getElementById('rows').innerHTML =
            '<tr><td colspan="7" class="err">BX24 SDK не загрузился. Проверьте CSP.</td></tr>';
          return;
        }
        BX24.init(loadData);
      }
      go();
    })();

    function loadData() {
      const boot = window.__BOOT__;
      const rows = document.getElementById('rows');
      rows.innerHTML = '<tr><td colspan="7">Загрузка данных...</td></tr>';

      BX24.callMethod('crm.deal.get', {id: BX24.placement.info().options.ID}, function(res){
        if(res.error()) {
          rows.innerHTML = '<tr><td colspan="7" class="err">'+res.error()+'</td></tr>';
          return;
        }
        const deal = res.data();
        const licenseIds = deal[boot.DEAL_FIELD_CODE] || [];

        if (!licenseIds.length) {
          rows.innerHTML = '<tr><td colspan="7">Нет связанных лицензий</td></tr>';
          return;
        }

        BX24.callMethod('crm.item.list', {
          entityTypeId: boot.SMART_ENTITY_TYPE_ID,
          filter: { 'id': licenseIds }
        }, function(r){
          if(r.error()) {
            rows.innerHTML = '<tr><td colspan="7" class="err">'+r.error()+'</td></tr>';
            return;
          }
          const items = r.data().items;
          if (!items.length) {
            rows.innerHTML = '<tr><td colspan="7">Лицензии не найдены</td></tr>';
            return;
          }
          rows.innerHTML = items.map(x => {
            return '<tr>'+
              '<td>'+x.id+'</td>'+
              '<td>'+(x[boot.F.licenseKey]||'')+'</td>'+
              '<td>'+(x[boot.F.portalUrl]||'')+'</td>'+
              '<td>'+(x[boot.F.tariff]||'')+'</td>'+
              '<td>'+(x[boot.F.tariffEnd]||'')+'</td>'+
              '<td>'+(x[boot.F.marketEnd]||'')+'</td>'+
              '<td><button onclick="alert(\\'Открыть '+x.id+'\\')">Открыть</button></td>'+
              '</tr>';
          }).join('');
        });
      });
    }

    document.getElementById('btnAdd').addEventListener('click', function(){
      alert('Здесь будет логика добавления лицензии');
    });
  </script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        'content-security-policy': 
          "default-src 'self' data: blob:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.bitrix24.com; " +
          "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src *; " +
          "frame-ancestors " + PORTAL_ORIGIN + " https://*.bitrix24.kz;"
      }
    });
  }
}
