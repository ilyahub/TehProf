// Cloudflare Pages Functions — универсальный хендлер Bitrix24
// Поддерживает:
//  • События Календаря: onCalendarEventAdd / onCalendarEventUpdate  → фильтр ?sections=1,2,3&tz=Asia/Almaty
//  • События Онлайн-записи: onBookingAdd / onBookingUpdate          → фильтр ?resources=10,11
// Принимает POST в JSON или x-www-form-urlencoded (data[...], auth[...])

async function parseIncoming(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { return await request.json(); } catch { return {}; }
  }
  const text = await request.text();
  const p = new URLSearchParams(text);
  const obj = {};
  for (const [k, v] of p.entries()) {
    const path = k.replace(/\]/g,'').split('[');
    let cur = obj;
    while (path.length > 1) {
      const key = path.shift();
      if (!(key in cur)) cur[key] = {};
      cur = cur[key];
    }
    cur[path[0]] = v;
  }
  return obj;
}

function json(o,code=200){ return new Response(JSON.stringify(o),{status:code,headers:{'content-type':'application/json'}}); }
async function toJson(res){ const t=await res.text(); try{ return JSON.parse(t);}catch{ return {raw:t}; } }

export async function onRequestPost(ctx) {
  const startTs = Date.now();
  try {
    const { request } = ctx;
    const url = new URL(request.url);
    const payload = await parseIncoming(request);

    const eventType = String(payload?.event || payload?.EVENT || '').trim();
    const auth = payload?.auth || {};
    const access = auth?.access_token || auth?.access || '';
    const domain = auth?.domain || auth?.DOMAIN || '';
    const base = domain ? `https://${domain}/rest/` : '';

    // Поддержка обоих вариантов фильтра
    const allowSections = (url.searchParams.get('sections')||'').split(',').map(s=>s.trim()).filter(Boolean);
    const allowResources = (url.searchParams.get('resources')||'').split(',').map(s=>s.trim()).filter(Boolean);
    const tz = url.searchParams.get('tz') || 'Asia/Almaty';

    // Базовые проверки
    if(!eventType) return json({ok:false, why:'no event type', payload}, 400);
    if(!access || !domain) return json({ok:false, why:'no oauth token or domain', eventType, haveAccess:!!access, haveDomain:!!domain}, 401);

    const restGet = (method, params={})=>{
      const u = new URL(base + method);
      for (const [k,v] of Object.entries(params)) u.searchParams.set(k, String(v));
      u.searchParams.set('auth', access);
      return fetch(u.toString());
    };
    const restPost = (method, body={})=>{
      const u = new URL(base + method);
      u.searchParams.set('auth', access);
      return fetch(u.toString(), { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
    };

    // Унифицированные ответы об ошибках Bitrix
    async function guardBitrix(res, method){
      const status = res.status;
      const data = await toJson(res);
      const err = data?.error || data?.error_description || (status>=400 ? ('HTTP '+status) : null);
      return { ok: !err, status, data, method, err };
    }

    // ==== ВЕТКА BOOKING (onBooking*) =======================================
    if (/onBooking(Add|Update)/i.test(eventType)) {
      const bookingId = payload?.data?.id || payload?.data?.ID || payload?.data?.FIELDS?.ID || payload?.data?.booking?.id;
      if(!bookingId) return json({ok:false, why:'no booking id', eventType, payload}, 400);

      // Получаем бронь
      const r = await guardBitrix(await restPost('booking.v1.booking.get.json', { id: bookingId }), 'booking.v1.booking.get');
      if(!r.ok) return json({ok:false, why:'booking.get failed', details:r}, 502);

      const booking = r.data?.result?.item || r.data?.result || r.data?.item || null;
      if(!booking) return json({ok:false, why:'booking not found', details:r.data}, 404);

      // Фильтр по ресурсам, если задан
      const resIds = (booking.resourceIds || []).map(String);
      if (allowResources.length && !resIds.some(id=>allowResources.includes(id))) {
        return json({ok:true, skipped:true, reason:'resource not allowed', resIds, allowResources});
      }

      // Здесь ваша бизнес-логика по брони (CRM, статусы, комментарии и т.п.)
      // Пример «мягкой отметки» — добавим комментарий (если поддерживается у вас)
      // await guardBitrix(await restPost('booking.v1.booking.update.json', { id: bookingId, fields: { comment: 'Processed by Hook' } }), 'booking.update');

      return json({ ok:true, mode:'Booking', eventType, bookingId, resourceIds:resIds, tookMs: Date.now()-startTs });
    }

    // ==== ВЕТКА CALENDAR (onCalendarEvent*) ================================
    if (/onCalendarEvent(Add|Update)/i.test(eventType)) {
      const eventId = payload?.data?.FIELDS?.ID || payload?.data?.fields?.ID || payload?.data?.event?.id;
      if(!eventId) return json({ok:false, why:'no calendar event id', eventType, payload}, 400);

      // Берём событие
      const ev0 = await guardBitrix(await restGet('calendar.event.getbyid.json', { id: eventId }), 'calendar.event.getbyid');
      if(!ev0.ok) return json({ok:false, why:'event.getbyid failed', details:ev0}, 502);

      const item = ev0.data?.result || ev0.data?.result?.item || ev0.data?.item || null;
      if(!item) return json({ok:false, why:'event not found', details:ev0.data}, 404);

      // Фильтр по секциям (если задан)
      const sectionId = String(item.SECTION_ID ?? item.sectionId ?? '');
      if (allowSections.length && !allowSections.includes(sectionId)) {
        return json({ok:true, skipped:true, reason:'section not allowed', sectionId, allowSections});
      }

      // Защита от повтора
      const descr = String(item.DESCRIPTION || '');
      if (descr.includes('#ALLDAY_SET') || String(item.SKIP_TIME||item.skip_time||'').toUpperCase()==='Y') {
        return json({ok:true, skipped:true, reason:'already processed', sectionId});
      }

      // Переводим в all-day (однодневное)
      const startStr = String(item.DATE_FROM || item.date_from || '').replace(' ', 'T');
      const d = startStr ? new Date(startStr) : new Date();
      const yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
      const DATE_FROM = `${yyyy}-${mm}-${dd}`;
      const DATE_TO   = `${yyyy}-${mm}-${dd}`;

      const upd = await guardBitrix(await restPost('calendar.event.update.json', {
        id: eventId,
        fields: { DATE_FROM, DATE_TO, SKIP_TIME:'Y', DESCRIPTION: `${descr}\n#ALLDAY_SET` }
      }), 'calendar.event.update');

      if(!upd.ok) return json({ok:false, why:'event.update failed', details:upd}, 502);

      return json({ ok:true, mode:'Calendar', eventType, eventId, sectionId, DATE_FROM, DATE_TO, tookMs: Date.now()-startTs });
    }

    // Неизвестный тип (ничего не ломаем, но логируем)
    return json({ ok:true, skipped:true, reason:'unknown event type', eventType, tookMs: Date.now()-startTs });

  } catch (e) {
    return json({ ok:false, error:String(e) }, 500);
  }
}
