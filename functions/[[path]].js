// functions/[[path]].js
export async function onRequest() {
  return new Response('OK from Pages Functions', {
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  });
}
