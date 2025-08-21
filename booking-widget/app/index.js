// booking-widget/functions/app/index.js
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const assetReq = new Request(url.origin + "/app/index.html", { method: "GET" });
  const assetRes = await context.env.ASSETS.fetch(assetReq);

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
