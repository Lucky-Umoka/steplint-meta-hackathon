export function GET() {
  return Response.json({ status: "ok", application: "steplint" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
