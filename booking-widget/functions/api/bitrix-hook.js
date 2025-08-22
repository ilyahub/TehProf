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
  const t0 = Date.now();
  try {
    const { request } = ctx;
    const url = new URL(request.url);
    const payload = await parseIncoming(request);

    const eventType = String(payload?.event || payload?.EVENT || '').trim();
    const auth = payload?.auth || {};
    const access = auth?.access_token || auth?.access || '';
    const domain = auth?.domain || auth?.DOMAIN || '';
    if (!eventType) return json({ ok:false, why:'no event type', payload }, 400);
    if (!access || !domain) return json({ ok:false, why:'no oauth token or domain', haveAccess:!!access, haveDomain:!!domain }, 401);

    // Разрешённые ресурсы из URL (?resources=…)
    const allowResources = (url.searchParams.get('resources') || '')
      .split(',').map(s => s.trim()).filter(Boolean);

    const base = `https://${domain}/rest/`;
    const restPost = (method, body={})=>{
      const u = new URL(base + method);
      u.searchParams.set('auth', access);
      return fetch(u.toString(), {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body: JSON.stringify(body)
      });
    };
    async function toJson(res){ const t=await res.text(); try{ return JSON.parse(t);}catch{ return {raw:t}; } }
    async function guard(res, m){
      const status = res.status;
      const data = await toJson(res);
      const err = data?.error || data?.error_description || (status>=400 ? ('HTTP '+status) : null);
      return { ok:!err, status, data, method:m, err };
    }

    // Обрабатываем только onBooking*
    if (!/onBooking(Add|Update)/i.test(eventType)) {
      return json({ ok:true, skipped:true, reason:'not a booking event', eventType }, 200);
    }

    // ID брони
    const bookingId =
      payload?.data?.id ||
      payload?.data?.ID ||
      payload?.data?.FIELDS?.ID ||
      payload?.data?.booking?.id;
    if (!bookingId) return json({ ok:false, why:'no booking id', payload }, 400);

    // Тянем бронь
    const r = await guard(
      await restPost('booking.v1.booking.get.json', { id: bookingId }),
      'booking.v1.booking.get'
    );
    if (!r.ok) return json({ ok:false, why:'booking.get failed', details:r }, 502);

    const booking = r.data?.result?.item || r.data?.result || r.data?.item || null;
    if (!booking) return json({ ok:false, why:'booking not found', data:r.data }, 404);

    // Фильтр по ресурсам (если задан в URL)
    const resIds = (booking.resourceIds || []).map(String);
    if (allowResources.length && !resIds.some(id => allowResources.includes(id))) {
      return json({ ok:true, skipped:true, reason:'resource not allowed', resourceIds:resIds, allowResources, tookMs:Date.now()-t0 }, 200);
    }

    // --- Авто-растяжка на сутки: 00:00 -> 00:00 (+1 день) ---
    const df = String(booking.dateFrom || booking.DATE_FROM || '');
    const dt = String(booking.dateTo   || booking.DATE_TO   || '');

    // Берём тот же TZ, что и у исходной брони
    const tz =
      (df.match(/([+-]\d{2}:\d{2}|Z)$/) || [])[1] ||
      (dt.match(/([+-]\d{2}:\d{2}|Z)$/) || [])[1] ||
      '+00:00';

    // Дата брони (YYYY-MM-DD)
    const baseDate = (df || dt).slice(0, 10);

    // 00:00 этой даты и 00:00 следующей
    function nextDay(dstr){
      const [y,m,d] = dstr.split('-').map(Number);
      const u = new Date(Date.UTC(y, m-1, d));
      u.setUTCDate(u.getUTCDate() + 1);
      const y2 = u.getUTCFullYear();
      const m2 = String(u.getUTCMonth()+1).padStart(2,'0');
      const d2 = String(u.getUTCDate()).padStart(2,'0');
      return `${y2}-${m2}-${d2}`;
    }
    const fullFrom = `${baseDate}T00:00:00${tz}`;
    const fullTo   = `${nextDay(baseDate)}T00:00:00${tz}`;

    // Уже сутки? (чтобы не зациклиться на onBookingUpdate)
    const alreadyFull =
      df.startsWith(`${baseDate}T00:00:00`) &&
      dt.startsWith(`${nextDay(baseDate)}T00:00:00`);

    let updated = false, updateResult = null;
    if (!alreadyFull) {
      const upd = await guard(
        await restPost('booking.v1.booking.update.json', {
          id: bookingId,
          dateFrom: fullFrom,
          dateTo:   fullTo
          // notifyClient: false, // если уведомления не нужны
        }),
        'booking.v1.booking.update'
      );
      updated = upd.ok;
      updateResult = upd;
    }

    return json({
      ok: true,
      eventType,
      bookingId,
      resourceIds: resIds,
      from: df, to: dt,
      fullFrom, fullTo,
      updated,
      updateError: updateResult && !updateResult.ok ? updateResult : null,
      tookMs: Date.now() - t0
    }, 200);

  } catch (e) {
    return json({ ok:false, error:String(e) }, 500);
  }
}

