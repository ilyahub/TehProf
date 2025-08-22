// Cloudflare Pages Functions — обработчик событий Bitrix24 для «чистой» Онлайн‑записи
// НЕ использует входящий вебхук. Берёт OAuth-токен из body: auth[access_token], auth[domain].
// Подписываем: onBookingAdd / onBookingUpdate
// URL вызывается Битриксом как POST (form-urlencoded или JSON).
// Ожидает query: ?resources=1,2,3 — список ID ресурсов, для которых обрабатываем брони.

async function parseIncoming(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await request.json();

  // x-www-form-urlencoded -> в объект с разбором data[...], auth[...]
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

export async function onRequestPost(ctx) {
  try {
    const { request } = ctx;
    const url = new URL(request.url);
    const payload = await parseIncoming(request);

    const eventType = payload?.event || payload?.EVENT || '';
    // booking events обычно присылают id записи в data.id
    const bookingId = payload?.data?.id
                   || payload?.data?.ID
                   || payload?.data?.FIELDS?.ID
                   || payload?.data?.booking?.id;
    const auth   = payload?.auth || {};
    const access = auth?.access_token;
    const domain = auth?.domain;

    if (!bookingId) return new Response('no booking id', { status: 400 });
    if (!access || !domain) return new Response('no oauth token or domain', { status: 401 });

    // allowed resources из URL (?resources=1,2,3)
    const allowed = (url.searchParams.get('resources') || '')
      .split(',').map(s=>s.trim()).filter(Boolean);

    const base = `https://${domain}/rest/`;

    const restGet = (method, params={}) => {
      const u = new URL(base + method);
      for (const [k,v] of Object.entries(params)) u.searchParams.set(k, String(v));
      u.searchParams.set('auth', access);
      return fetch(u.toString());
    };
    const restPost = (method, body={}) => {
      const u = new URL(base + method);
      u.searchParams.set('auth', access);
      return fetch(u.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
    };

    // 1) Тянем саму бронь
    const bkR = await restPost('booking.v1.booking.get.json', { id: bookingId });
    const bkJ = await bkR.json();
    const booking = bkJ?.result?.item || bkJ?.result || null;
    if (!booking) return new Response('booking not found', { status: 404 });

    // 2) Фильтр по ресурсам (если список в URL задан)
    const resourceIds = (booking.resourceIds || []).map(String);
    if (allowed.length && !resourceIds.some(id => allowed.includes(id))) {
      return new Response(`skip: resources ${resourceIds.join(',')} not in allow-list`, { status: 200 });
    }

    // 3) Тут можно делать вашу бизнес‑логику по брони (без календаря):
    //    — менять статус, добавлять комментарий, пинговать CRM и т.д.
    // Пример: без изменений, просто подтверждаем приём
    // await restPost('booking.v1.booking.update.json', { id: bookingId, fields: { /* ... */ } });

    return new Response(JSON.stringify({
      ok: true,
      eventType,
      bookingId,
      resourceIds,
      status: booking.status || null
    }), { status: 200 });

  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
}
