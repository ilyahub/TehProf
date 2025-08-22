// Cloudflare Pages Functions — чистый Booking-хук
// Поддерживает onBookingAdd / onBookingUpdate
// Фильтр: ?resources=1,2,3
// Тело события: JSON или x-www-form-urlencoded (data[...], auth[...])

async function parseIncoming(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct && ct.includes('application/json')) {
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
    if(!eventType) return json({ok:false, why:'no event type', payload}, 400);
    if(!access || !domain) return json({ok:false, why:'no oauth token or domain', haveAccess:!!access, haveDomain:!!domain}, 401);

    // Разрешённые ресурсы из URL (?resources=…)
    const allowResources = (url.searchParams.get('resources')||'').split(',').map(s=>s.trim()).filter(Boolean);

    const base = `https://${domain}/rest/`;
    const restPost = (method, body={})=>{
      const u=new URL(base+method); u.searchParams.set('auth',access);
      return fetch(u.toString(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    };
    async function guard(res,m){ const status=res.status; const data=await toJson(res); const err=data?.error||data?.error_description||(status>=400?('HTTP '+status):null); return {ok:!err,status,data,method:m,err}; }

    // Обрабатываем только onBooking*
    if(!/onBooking(Add|Update)/i.test(eventType)){
      return json({ok:true, skipped:true, reason:'not a booking event', eventType}, 200);
    }

    // ID брони из payload
    const bookingId = payload?.data?.id || payload?.data?.ID || payload?.data?.FIELDS?.ID || payload?.data?.booking?.id;
    if(!bookingId) return json({ok:false, why:'no booking id', payload}, 400);

    // Тянем бронь
    const r = await guard(await restPost('booking.v1.booking.get.json',{ id: bookingId }), 'booking.v1.booking.get');
    if(!r.ok) return json({ok:false, why:'booking.get failed', details:r}, 502);

    const booking = r.data?.result?.item || r.data?.result || r.data?.item || null;
    if(!booking) return json({ok:false, why:'booking not found', data:r.data}, 404);

    // Фильтр по ресурсам (если задан)
    const resIds = (booking.resourceIds||[]).map(String);
    if (allowResources.length && !resIds.some(id=>allowResources.includes(id))) {
      return json({ok:true, skipped:true, reason:'resource not allowed', resourceIds:resIds, allowResources, tookMs:Date.now()-t0}, 200);
    }

    // Здесь место для вашей бизнес-логики (CRM-связка, статусы, уведомления и т.д.)
    // Пример: просто подтверждаем приём
    return json({ ok:true, bookingId, eventType, resourceIds:resIds, status:booking.status||null, tookMs:Date.now()-t0 }, 200);

  }catch(e){
    return json({ ok:false, error:String(e) }, 500);
  }
}
