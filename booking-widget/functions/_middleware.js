// booking-widget/functions/_middleware.js
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 1) Если Bitrix прислал POST во фрейм (обычно на "/" или "/app")
  //    — отдаём статический app/index.html (как GET), без 405.
  const isPostToFrame =
    request.method === "POST" &&
    (path === "/" || path === "/app" || path === "/app/");

  if (isPostToFrame) {
    const htmlReq = new Request(url.origin + "/app/index.html", { method: "GET" });
    const assetRes = await env.ASSETS.fetch(htmlReq);

    // Добавим CSP для встраивания в Bitrix и уберём X-Frame-Options
    const res = new Response(assetRes.body, {
      status: assetRes.status,
      headers: assetRes.headers
    });
    res.headers.set(
      "Content-Security-Policy",
      "frame-ancestors https://tehprof.bitrix24.kz https://*.bitrix24.kz https://*.bitrix24.com"
    );
    res.headers.delete("X-Frame-Options");
    return res;
  }

  // 2) Обычные запросы на статику/функции — как есть
  const res = await next();

  // 3) CSP только для страниц под /app/*
  if (path.startsWith("/app/")) {
    res.headers.set(
      "Content-Security-Policy",
      "frame-ancestors https://tehprof.bitrix24.kz https://*.bitrix24.kz https://*.bitrix24.com"
    );
    res.headers.delete("X-Frame-Options");
  }

  return res;
}
