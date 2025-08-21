export async function onRequest(context) {
  const { request, next } = context;

  // если HTML — пропускаем дальше без изменений
  const url = new URL(request.url);
  if (url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname.startsWith("/app")) {
    const response = await next();
    // добавим заголовки только для app/*
    if (url.pathname.startsWith("/app")) {
      response.headers.set(
        "Content-Security-Policy",
        "frame-ancestors https://tehprof.bitrix24.kz https://*.bitrix24.kz https://*.bitrix24.com"
      );
    }
    return response;
  }

  // иначе просто продолжаем
  return await next();
}
