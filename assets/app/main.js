import { waitBX24 } from './sdk.js';
import { CONFIG } from './config.js';
import { J, $ } from './utils.js';
import { S, loadDealAndItems } from './state.js';
import { initUIEvents, render, enableResizers } from './ui.js';

(async function bootstrap(){
  // Мягко ждём SDK
  let bx;
  try { bx = await waitBX24(); }
  catch(e){
    $('#rows').innerHTML = '<tr><td colspan="12" class="err">BX24 SDK не загрузился. Проверьте CSP и сеть.</td></tr>';
    return;
  }

  // dealId из раннего снимка
  const boot = window.__BOOT__ || {};
  const pidEarly = J(boot.placementOptions||'{}').ID || null;
  if (pidEarly) S.dealId = Number(pidEarly);

  // init Bitrix и финальный старт
  bx.init(async function(){
    if(!S.dealId){
      const p = bx.getParam('PLACEMENT_OPTIONS');
      const id = (J(p||'{}').ID) || null;
      if (id) S.dealId = Number(id);
    }

    // Вешаем UI‑обработчики один раз
    initUIEvents();
    enableResizers();

    // Основная загрузка
    await loadDealAndItems();
    render();
  });
})();
