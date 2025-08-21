// Cloudflare Pages Functions: POST-хук от Bitrix24
export async function onRequestPost(ctx) {
  try {
    const payload = await ctx.request.json();            // тело от Bitrix24
    const event   = payload?.event;
    const evId    = payload?.data?.FIELDS?.ID;

    if (!evId) return new Response('no event id', { status: 400 });

    // 1) Получаем событие целиком
    const bx = ctx.env.BITRIX_WEBHOOK; // https://<portal>/rest/<user>/<token>/
    const getUrl = `${bx}calendar.event.getbyid.json?id=${encodeURIComponent(evId)}`;
    const evResp = await fetch(getUrl);
    const evData = await evResp.json();
    const item   = evData?.result;

    if (!item) return new Response('event not found', { status: 404 });

    // Определяем дату (берём местную дату начала события)
    // Пример: "2025-08-21 10:00:00"
    const startStr = item.DATE_FROM || item.DATE_FROM_FORMATTED || item.DATE_FROM_TS_UTC;
    const d = new Date(startStr.replace(' ', 'T')); // грубо, достаточно для суток
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');

    const dateFrom = `${yyyy}-${mm}-${dd} 00:00:00`;
    const dateTo   = `${yyyy}-${mm}-${dd} 23:59:00`;

    // Защита от зацикливания: если уже весь день — выходим
    if ((item.DATE_FROM?.endsWith('00:00:00') || item.SKIP_TIME === 'Y') &&
        (item.DATE_TO?.endsWith('23:59:00')   || item.DT_SKIP_TIME === 'Y')) {
      return new Response('already all-day', { status: 200 });
    }

    // 2) Растягиваем на сутки
    const upd = await fetch(`${bx}calendar.event.update.json`, {
      method: 'POST',
      headers: { 'content-type':'application/json' },
      body: JSON.stringify({
        id: evId,
        fields: {
          DATE_FROM: dateFrom,
          DATE_TO:   dateTo,
          SKIP_TIME: 'N',
          DESCRIPTION: (item.DESCRIPTION || '') + '\n#ALLDAY_SET'
        }
      })
    });
    const updRes = await upd.json();
    return new Response(JSON.stringify({ ok:true, event, evId, updRes }), { status: 200 });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
}
