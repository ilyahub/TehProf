export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const target = new URL("/app/index.html" + (url.search || ""), url.origin);

  const assetRes = await env.ASSETS.fetch(new Request(target, { method: "GET" }));

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
