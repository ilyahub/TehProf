// functions/_middleware.js
export async function onRequest(context) {
  // Отдаём статику дальше
  const res = await context.next();

  // Добавляем заголовки только для путей под /app (ваше приложение)
  const { pathname } = new URL(context.request.url);
  if (pathname.startsWith("/app/")) {
    // Разрешаем встраивание в Bitrix24
    res.headers.set(
      "Content-Security-Policy",
      "frame-ancestors https://tehprof.bitrix24.kz https://*.bitrix24.kz https://*.bitrix24.com"
    );
    // На всякий случай уберём возможный X-Frame-Options
    res.headers.delete("X-Frame-Options");
  }

  return res;
}
