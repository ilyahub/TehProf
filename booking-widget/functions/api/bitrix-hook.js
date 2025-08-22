// Cloudflare Pages Functions — обработчик событий Bitrix24 для «сутки слота»
// НЕ использует входящий вебхук. Берёт OAuth-токен из body: auth[access_token], auth[domain].
//
// URL вызывается Битриксом как POST (form-urlencoded или JSON).
// Ожидает query: ?sections=1,2,3&tz=Asia/Almaty  — список календарей-ресурсов (автомобилей), для которых применять правило.

async function parseIncoming(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const j = await request.json();
    return j;
  }
  // x-www-form-urlencoded
  const text = await request.text();
  const p = new URLSearchParams(text);
  // раскукожим в объект наподобие PHP-формата: data[FIELDS][ID], auth[access_token], …
  const obj = {};
  for (const [k, v] of p.entries()) {
    const path = k.replace(/\]/g,'').split('['); // 'data[FIELDS][ID]' -> ['data','FIELDS','ID']
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

    // 1) Разбор входящих данных (универсально: JSON или form-url-encoded)
    const payload = await parseIncoming(request);

    const eventType = payload?.event || payload?.EVENT;
    const eventId   = payload?.data?.FIELDS?.ID || payload?.data?.fields?.ID;
    const auth      = payload?.auth || {};
    const access    = auth?.access_token;
    const domain    = auth?.domain; // напр. 'tehprof.bitrix24.kz'

    if (!eventId) return new Response('no event id', { status: 400 });
    if (!access || !domain) return new Response('no oauth token or domain', { status: 401 });

    // 2) Разрешённые календари (переданы в URL при bind)
    const allowed = (url.searchParams.get('sections') || '')
      .split(',').map(s=>s.trim()).filter(Boolean);

    const tz = url.searchParams.get('tz') || 'Asia/Almaty'; // на будущее

    const base = `https://${domain}/rest/`;

    // helper: GET /rest/method?params…&auth=token
    const restGet = (method, params={}) => {
      const u = new URL(base + method);
      for (const [k,v] of Object.entries(params)) u.searchParams.set(k, String(v));
      u.searchParams.set('auth', access);
      return fetch(u.toString());
    };
    // helper: POST /rest/method?auth=token (JSON)
    const restPost = (method, body={}) => {
      const u = new URL(base + method);
      u.searchParams.set('auth', access);
      return fetch(u.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
    };

    // 3) Получаем событие целиком
    const evR = await restGet('calendar.event.getbyid.json', { id: eventId });
    const evJ = await evR.json();
    const item = evJ?.result;
    if (!item) return new Response('event not found', { status: 404 });

    // 4) Фильтр по SECTION_ID (разрешённые календари автомобилей)
    const sectionId = String(item.SECTION_ID ?? item.sectionId ?? '');
    if (allowed.length && !allowed.includes(sectionId)) {
      return new Response(`skip: section ${sectionId} not in allow-list`, { status: 200 });
    }

    // 5) Защита от повтора (если уже обработано)
    const descr = String(item.DESCRIPTION || '');
    if (descr.includes('#ALLDAY_SET')) {
      return new Response('already processed', { status: 200 });
    }

    // 6) Вычисляем границы суток (ALL‑DAY) по локальной дате начала
    const startStr = String(item.DATE_FROM || '').replace(' ', 'T');
    const d = startStr ? new Date(startStr) : new Date();
    // Для однодневного all‑day у Битрикс: DATE_FROM / DATE_TO — даты БЕЗ времени + SKIP_TIME:'Y'
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    const DATE_FROM = `${yyyy}-${mm}-${dd}`;
    const DATE_TO   = `${yyyy}-${mm}-${dd}`;
    
    // 7) Обновляем событие как «целые сутки»
    const updR = await restPost('calendar.event.update.json', {
      id: eventId,
      fields: {
        DATE_FROM,
        DATE_TO,
        SKIP_TIME: 'Y', // ключевой флаг для all‑day
        DESCRIPTION: `${descr}\n#ALLDAY_SET`
      }
    });
    const updJ = await updR.json();

    return new Response(JSON.stringify({ ok:true, eventType, eventId, sectionId, DATE_FROM, DATE_TO, result: updJ }), { status: 200 });

  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
}
