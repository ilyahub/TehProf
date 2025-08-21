// booking-widget/functions/_middleware.js
export async function onRequest(context) {
  const res = await context.next();
  const { pathname } = new URL(context.request.url);

  // применяем только к страницам приложения
  if (pathname.startsWith("/app/")) {
    res.headers.set(
      "Content-Security-Policy",
      "frame-ancestors https://tehprof.bitrix24.kz https://*.bitrix24.kz https://*.bitrix24.com"
    );
    res.headers.delete("X-Frame-Options");
  }
  return res;
}
