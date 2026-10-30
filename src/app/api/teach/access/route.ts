export { access as POST } from "@/server/teach/http";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const { authorize } = await import("@/server/teach/security");
  try {
    authorize(request);
    return Response.json(
      { unlocked: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { unlocked: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
