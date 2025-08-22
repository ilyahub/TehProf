/* ---------- Глобальные ловушки ошибок ---------- */
(function(){
  const push = (msg, cls='err')=>{
    try{
      const el=document.getElementById('log'); if(!el) return;
      const d=document.createElement('div'); d.className=cls; d.textContent=msg; el.appendChild(d);
    }catch{}
  };
  window.addEventListener('error', e=>{ push('JS error: '+(e?.message||String(e))); console.error(e?.error||e); });
  window.addEventListener('unhandledrejection', e=>{ const r=e?.reason; push('Promise rejection: '+(r?.message||String(r))); console.error(r); });
})();

/* ---------- Утилиты UI ---------- */
const logEl = document.getElementById('log');
const listEl = document.getElementById('list');
const qEl = document.getElementById('q');
const handlerEl = document.getElementById('handler');
const portalTag = document.getElementById('portal-tag');
const diagBody = document.querySelector('#diag-table tbody');

function log(msg, cls){ const d=document.createElement('div'); if(cls) d.className=cls; d.textContent=msg; logEl.appendChild(d); }
function rowProbe(name,res,note,cls){ const tr=document.createElement('tr'); const a=document.createElement('td'); a.textContent=name; const b=document.createElement('td'); b.textContent=res; b.className=cls||''; const c=document.createElement('td'); c.textContent=note||''; tr.append(a,b,c); diagBody.appendChild(tr); }
function mkRow(r){ const lbl=document.createElement('label'); lbl.className='item';
  const cb=document.createElement('input'); cb.type='checkbox'; cb.value=String(r.id);
  const name=document.createElement('span'); name.textContent=r.name||'(без названия)';
  const small=document.createElement('small'); small.textContent=`#${r.id} • ${r.status||'active'}`;
  lbl.append(cb,name,small); lbl.dataset.name=(r.name||'').toLowerCase(); return lbl; }
function filter(){ const q=(qEl.value||'').trim().toLowerCase(); Array.from(listEl.querySelectorAll('label.item')).forEach(el=>{ el.style.display=!q||el.dataset.name.includes(q)?'':''; }); }
function selectedIds(){ return Array.from(listEl.querySelectorAll('input[type=checkbox]:checked')).map(x=>x.value); }
function sameBase(h){ try{ const u=new URL(h); const b=new URL(handlerEl.value); return (u.origin+u.pathname)===(b.origin+b.pathname);}catch{return false;} }
function idsFromHandler(h){ try{ const u=new URL(h); return (u.searchParams.get('resources')||'').split(',').filter(Boolean);}catch{return[];} }
function validHandler(u){ try{ const x=new URL((u||'').trim()); return /^https:$/i.test(x.protocol);}catch{ return false; } }

/* ---------- BX24 обёртки ---------- */
const pCall=(m,p={})=>new Promise(res=>{
  try{
    BX24.callMethod(m,p,r=>{
      try{
        if(r && typeof r.error==='function' && r.error()){
          res({ok:false,error:r.error(),desc:(r.error_description&&r.error_description())||'',data:null});
        }else{
          res({ok:true,data:(r&&r.data&&r.data())||null});
        }
      }catch(e){ res({ok:false,error:String(e),data:null}); }
    });
  }catch(e){ res({ok:false,error:String(e),data:null}); }
});

async function getEnv(){
  return new Promise(resolve=>{
    try{
      BX24.callMethod('app.info',{},r=>{
        let domain='',scope=[];
        try{ const d=r.data(); domain=d.domain||d.DOMAIN||''; scope=d.scope||d.SCOPE||[]; }catch{}
        resolve({domain, scope:Array.isArray(scope)?scope:[]});
      });
    }catch(e){ resolve({domain:'',scope:[]}); }
  });
}

/* ---------- Booking loaders ---------- */
async function loadResources(){
  const items = [];
  let page = 1, iter = 0, lastRaw = null, totalPushed = 0;

  while (iter++ < 50) {
    const r = await pCall('booking.v1.resource.list', { select:['id','name','status'], page });
    if (!r.ok) { rowProbe('Resources', 'Ошибка', `${r.error||''} ${r.desc||''}`, 'err'); break; }

    lastRaw = r.data;
    // поддерживаем разные формы ответа: items / resource / resources / result.*
    const chunk = pickArray(r.data, ['items','resource','resources','list']);
    if (chunk.length) {
      chunk.forEach(x => {
        const m = mapResource(x);
        if (m.id) { items.push(m); totalPushed++; }
      });
    }

    const next = (r.data && (r.data.next ?? null));
    if (!next || !chunk.length) break;
    page = typeof next === 'number' ? next : page + 1;
  }

  rowProbe('Resources', String(totalPushed), totalPushed ? 'ОК' : 'Пусто', totalPushed ? 'ok' : 'warn');

  // Отладочный дамп чтобы видеть реальную структуру
  if (!totalPushed && lastRaw) {
    log('DEBUG booking.v1.resource.list raw: ' + JSON.stringify(lastRaw), 'muted');
  }

  // Fallback: если ресурс-лист пуст — собираем ID из бронирований
  if (!totalPushed) {
    const found = await discoverResourcesFromBookings();
    if (found.length) {
      rowProbe('Resources (по бронированиям)', String(found.length), 'Собрано из booking.list', 'warn');
      return found;
    }
  }

  return items;
}


async function diagServices(){
  const r = await pCall('booking.v1.service.list',{select:['id','name','duration','active'],limit:100});
  if (r.ok) {
    const arr = pickArray(r.data, ['items','services','service','list']);
    rowProbe('Services', String(arr.length), arr.length ? 'ОК' : 'Нет услуг', arr.length ? 'ok' : 'warn');
  } else {
    rowProbe('Services','Ошибка',`${r.error||''} ${r.desc||''}`,'err');
  }
}
async function diagSlots(resourceIds){
  const now=new Date(); const to=new Date(now.getTime()+7*86400000);
  const iso=d=>d.toISOString().slice(0,19)+'+00:00';
  const r=await pCall('booking.v1.slot.list',{
    filter:{dateFrom:iso(now),dateTo:iso(to),resourceIds:(resourceIds||[]).slice(0,3)}
  });
  if(r.ok){
    const arr = pickArray(r.data, ['items','slots','slot','list']);
    rowProbe('Slots (7d)', Array.isArray(arr)?String(arr.length):'есть',
             Array.isArray(arr)&&!arr.length?'нет доступных окон':'',
             (Array.isArray(arr)&&arr.length)?'ok':'warn');
  } else {
    const ee=String(r.error||'').toLowerCase();
    if(ee.includes('method_not_found')) rowProbe('Slots (7d)','Нет метода','booking.v1.slot.list отсутствует — не критично','warn');
    else rowProbe('Slots (7d)','Ошибка',`${r.error||''} ${r.desc||''}`,'err');
  }
}

async function diagBookings(resourceIds){
  const now=new Date(); const from=new Date(now.getTime()-7*86400000); const to=new Date(now.getTime()+30*86400000);
  const iso=d=>d.toISOString().slice(0,19)+'+00:00';
  const r=await pCall('booking.v1.booking.list',{
    filter:{dateFrom:iso(from),dateTo:iso(to),resourceIds:resourceIds||[]},
    select:['id','status'],limit:100
  });
  if(r.ok){
    const arr = pickArray(r.data, ['items','bookings','list']);
    rowProbe('Bookings (−7..+30d)', String(arr.length), '', arr.length?'ok':'warn');
  } else {
    rowProbe('Bookings (−7..+30d)','Ошибка',`${r.error||''} ${r.desc||''}`,'err');
  }
}


async function discoverResourcesFromBookings(){
  const now = new Date();
  const from = new Date(now.getTime() - 30*86400000);
  const to   = new Date(now.getTime() + 1*86400000);
  const iso = d => d.toISOString().slice(0,19) + '+00:00';

  const r = await pCall('booking.v1.booking.list', {
    filter: { dateFrom: iso(from), dateTo: iso(to) },
    select: ['id','resourceIds'],
    limit: 200
  });

  if (!r.ok) {
    rowProbe('booking.list (discovery)', 'Ошибка', `${r.error||''} ${r.desc||''}`, 'err');
    return [];
  }

  const arr = (r.data?.items || r.data || []);
  const ids = new Set();
  arr.forEach(b => (b.resourceIds||[]).forEach(x => ids.add(String(x))));

  return Array.from(ids).map(id => ({
    id, name: `Ресурс ${id} (из бронирований)`, status: 'unknown'
  }));
}

/* ---------- Рендер + подписки ---------- */
function renderList(items){
  listEl.innerHTML='';
  if(!items.length){ listEl.textContent='Ресурсы не найдены (Booking)'; return; }
  items.forEach(x=> listEl.appendChild(mkRow(x)));
  preselect(); filter();
}
function preselect(){
  BX24.callMethod('event.get',{},r=>{
    if(r.error && r.error()) return;
    const binds=(r.data&&r.data())||[];
    const mine=binds.filter(b=> sameBase(b.handler));
    if(!mine.length){ log('Наших подписок пока нет.','muted'); return; }
    const ids=new Set(); mine.forEach(b=> idsFromHandler(b.handler).forEach(x=>ids.add(x)));
    listEl.querySelectorAll('input[type=checkbox]').forEach(cb=>{ if(ids.has(cb.value)) cb.checked=true; });
    log(`Активные подписки: ${mine.map(x=>x.event).join(', ')}; resources=[${Array.from(ids).join(',')||'—'}]`);
  });
}
function bind(){
  const ids = selectedIds();
  if (!validHandler(handlerEl.value)) { alert('Некорректный Handler URL'); return; }

  if (!ids.length) {
    log('Подписка БЕЗ фильтра по ресурсам — все onBooking события пойдут в хендлер.', 'warn');
  }

  // снимаем прежние на этот handler
  BX24.callMethod('event.get', {}, r=>{
    if(!r.error || !r.error()) (r.data()||[]).filter(b=> sameBase(b.handler))
      .forEach(b=> BX24.callMethod('event.unbind', { event:b.event, handler:b.handler }, ()=>{}));
  });

  const u = new URL((handlerEl.value||'').trim());
  if (ids.length) u.searchParams.set('resources', ids.join(','));
  const h = u.toString();

  ['onBookingAdd','onBookingUpdate'].forEach(ev=>{
    BX24.callMethod('event.bind', { event:ev, handler:h }, res=>{
      if(res.error && res.error()) log(`bind ${ev}: ${res.error()} / ${(res.error_description&&res.error_description())||''}`, 'err');
      else log(`OK bind ${ev} → ${h}`, 'ok');
    });
  });
}
function unbind(){
  BX24.callMethod('event.get',{},r=>{
    if(r.error && r.error()){ log(`event.get: ${r.error()} / ${(r.error_description&&r.error_description())||''}`,'err'); return; }
    (r.data()||[]).filter(b=> sameBase(b.handler)).forEach(b=>{
      BX24.callMethod('event.unbind',{event:b.event,handler:b.handler},res=>{
        if(res.error && res.error()) log(`unbind ${b.event}: ${res.error()} / ${(res.error_description&&res.error_description())||''}`,'err');
        else log(`Снята подписка ${b.event}`,'ok');
      });
    });
  });
}

/* ---------- Главный поток ---------- */
async function loadAll(){
  diagBody.innerHTML='';
  listEl.classList.add('muted'); listEl.textContent='Загрузка…';
  try{
    const env=await getEnv(); portalTag.textContent=env.domain?('portal: '+env.domain):'портал: ?';
    rowProbe('Scopes', env.scope.join(', ')||'—', 'Нужны: booking (API) и event (подписки)', (env.scope.includes('booking')&&env.scope.includes('event'))?'ok':'warn');

    const ping=await pCall('booking.v1.resource.list',{select:['id'],limit:1});
    if(ping.ok){ rowProbe('Booking API','OK','booking.v1.resource.list доступен','ok'); }
    else{ rowProbe('Booking API','Ошибка',`${ping.error||''} ${ping.desc||''}`,'err'); listEl.textContent='Booking API недоступен'; return; }

    const resources=await loadResources();
    renderList(resources);
    await diagServices();
    await diagSlots(resources.map(x=>x.id));
    await diagBookings(resources.map(x=>x.id));
  }catch(e){
    listEl.textContent='Ошибка загрузки';
    rowProbe('loadAll','Ошибка',String(e),'err');
    log('loadAll error: '+String(e),'err');
  }finally{
    listEl.classList.remove('muted');
  }
}

/* ---------- Boot (устойчивый) ---------- */
function boot(){
  // кнопки
  document.getElementById('bind').onclick=bind;
  document.getElementById('unbind').onclick=unbind;
  document.getElementById('reload').onclick=loadAll;
  document.getElementById('selftest').onclick=loadAll; // тот же набор проверок
  document.getElementById('q').oninput=filter;

  if (typeof BX24 === 'undefined') {
    log('❌ Не найден скрипт Bitrix24 (BX24). Открой виджет внутри портала/проверь CSP.', 'err');
    rowProbe('BX24','Нет','Скрипт API не загрузился (CSP/AdBlock/не в портале)','err');
    return;
  }

  let inited=false;
  BX24.init(async()=>{ inited=true; log('BX24.init: OK. Загружаю…','muted'); await loadAll(); });
  setTimeout(async ()=>{
    if(!inited){
      log('⏳ BX24.init не сработал за 3с. Пытаюсь показать диагностику.', 'warn');
      rowProbe('BX24.init','Таймаут','Откройте как приложение Б24 / проверьте блокировщики','warn');
      try{ await loadAll(); }catch{}
    }
  },3000);
}
document.readyState==='loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
// === универсальный извлекатель массива из разных ответов Bitrix ===
function pickArray(data, keys = []) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of keys) {
    const v = data?.[k];
    if (Array.isArray(v)) return v;
  }
  // иногда полезная часть лежит глубже: { result: { resource: [...] } }
  if (data.result) return pickArray(data.result, keys);
  return [];
}

// безопасная мапа ресурса (на случай разных имён полей)
function mapResource(item) {
  const id = String(
    item.id ?? item.ID ?? item.resourceId ?? item.RESOURCE_ID ?? ''
  );
  const name = item.name ?? item.NAME ?? item.title ?? item.TITLE ?? '(без названия)';
  const status = item.status ?? item.STATUS ?? (item.active ? 'active' : 'unknown');
  return { id, name, status };
}
