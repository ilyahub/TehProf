// booking-widget/functions/_middleware.js
export async function onRequest(context) {
  const res = await context.next();                          // отдать как есть
  const { pathname } = new URL(context.request.url);

  if (pathname.startsWith("/app/")) {                        // только для /app/*
    // Разрешаем встраивание в Bitrix24
    res.headers.set(
      "Content-Security-Policy",
      "frame-ancestors https://tehprof.bitrix24.kz https://*.bitrix24.kz https://*.bitrix24.com"
    );
    // На всякий случай убираем возможный X-Frame-Options
    res.headers.delete("X-Frame-Options");
  }

  return res;
}
