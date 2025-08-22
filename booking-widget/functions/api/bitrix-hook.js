// Универсальный хендлер Bitrix24 для Booking/Calendar с расширенными проверками.
// • onBookingAdd/onBookingUpdate → фильтр по ?resources=1,2
// • onCalendarEventAdd/onCalendarEventUpdate → фильтр по ?sections=10,11&tz=Asia/Almaty
// Принимает JSON или x-www-form-urlencoded (data[...], auth[...]). Возвращает подробный JSON.

async function parseIncoming(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) { try { return await request.json(); } catch { return {}; } }
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
function json(o,code=200){ return new Response(JSON.stringify(o,null,2),{status:code,headers:{'content-type':'application/json'}}); }
async function toJson(res){ const t=await res.text(); try{ return JSON.parse(t);}catch{ return {raw:t}; } }

export async function onRequestPost(ctx){
  const t0=Date.now();
  try{
    const { request } = ctx;
    const url = new URL(request.url);
    const payload = await parseIncoming(request);

    const eventType = String(payload?.event || payload?.EVENT || '').trim();
    const auth = payload?.auth || {};
    const access = auth?.access_token || auth?.access || '';
    const domain = auth?.domain || auth?.DOMAIN || '';
    const base = domain ? `https://${domain}/rest/` : '';

    const allowSections = (url.searchParams.get('sections')||'').split(',').map(s=>s.trim()).filter(Boolean);
    const allowResources = (url.searchParams.get('resources')||'').split(',').map(s=>s.trim()).filter(Boolean);
    const tz = url.searchParams.get('tz') || 'Asia/Almaty';

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
    async function guard(res, m){
      const status=res.status; const data=await toJson(res);
      const err = data?.error || data?.error_description || (status>=400?('HTTP '+status):null);
      return { ok:!err, status, data, method:m, err };
    }

    // ===== BOOKING =====
    if(/onBooking(Add|Update)/i.test(eventType)){
      const bookingId = payload?.data?.id || payload?.data?.ID || payload?.data?.FIELDS?.ID || payload?.data?.booking?.id;
      if(!bookingId) return json({ok:false, why:'no booking id', eventType, payload}, 400);

      const r = await guard(await restPost('booking.v1.booking.get.json',{id:bookingId}),'booking.v1.booking.get');
      if(!r.ok) return json({ok:false, why:'booking.get failed', details:r}, 502);

      const booking = r.data?.result?.item || r.data?.result || r.data?.item || null;
      if(!booking) return json({ok:false, why:'booking not found', data:r.data}, 404);

      const resIds = (booking.resourceIds||[]).map(String);
      const skip = allowResources.length && !resIds.some(id=>allowResources.includes(id));
      return json({ ok:true, mode:'Booking', eventType, skipped:skip, reason: skip?'resource not allowed':null,
        bookingId, resourceIds:resIds, status:booking.status||null, tookMs: Date.now()-t0 });
    }

    // ===== CALENDAR =====
    if(/onCalendarEvent(Add|Update)/i.test(eventType)){
      const eventId = payload?.data?.FIELDS?.ID || payload?.data?.fields?.ID || payload?.data?.event?.id;
      if(!eventId) return json({ok:false, why:'no calendar event id', eventType, payload}, 400);

      const ev0 = await guard(await restGet('calendar.event.getbyid.json',{id:eventId}),'calendar.event.getbyid');
      if(!ev0.ok) return json({ok:false, why:'event.getbyid failed', details:ev0}, 502);

      const item = ev0.data?.result?.item || ev0.data?.result || ev0.data?.item || ev0.data || null;
      if(!item) return json({ok:false, why:'event not found', data:ev0.data}, 404);

      const sectionId = String(item.SECTION_ID ?? item.sectionId ?? '');
      if(allowSections.length && !allowSections.includes(sectionId)){
        return json({ok:true, mode:'Calendar', skipped:true, reason:'section not allowed', sectionId, tookMs:Date.now()-t0});
      }

      const alreadyAllDay = (String(item.SKIP_TIME||item.skip_time||'').toUpperCase()==='Y') || String(item.DESCRIPTION||'').includes('#ALLDAY_SET');
      if(alreadyAllDay){
        return json({ok:true, mode:'Calendar', skipped:true, reason:'already processed', eventId, sectionId, tookMs:Date.now()-t0});
      }

      // all-day 1 день
      const startStr = String(item.DATE_FROM || item.date_from || '').replace(' ', 'T');
      const d = startStr ? new Date(startStr) : new Date();
      const yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
      const DATE_FROM = `${yyyy}-${mm}-${dd}`, DATE_TO = `${yyyy}-${mm}-${dd}`;

      const upd = await guard(await restPost('calendar.event.update.json',{
        id:eventId, fields:{ DATE_FROM, DATE_TO, SKIP_TIME:'Y', DESCRIPTION:(String(item.DESCRIPTION||'')+'\n#ALLDAY_SET').trim() }
      }), 'calendar.event.update');

      if(!upd.ok) return json({ok:false, why:'event.update failed', details:upd}, 502);

      return json({ ok:true, mode:'Calendar', eventId, sectionId, DATE_FROM, DATE_TO, tookMs:Date.now()-t0 });
    }

    // неизвестный тип
    return json({ ok:true, skipped:true, reason:'unknown event type', eventType, tookMs:Date.now()-t0 });

  }catch(e){
    return json({ ok:false, error:String(e) }, 500);
  }
}
