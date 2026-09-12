import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { verifyDashboardAuthToken } from "@/lib/auth/dashboardSession";
import { getHealthSnapshot, HEALTH_WINDOWS } from "@/lib/db/repos/healthRepo.js";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const WINDOW_HINT = `window must be one of ${Object.keys(HEALTH_WINDOWS).join(", ")}`;

/**
 * `/api/health` sits on the dashboardGuard public allow-list so tunnels can ping it, which
 * means the board payload has to authorise itself here: provider names, account labels and
 * upstream error text are not for anonymous callers.
 */
async function canReadBoard(request) {
  try {
    const settings = await getSettings();
    if (settings?.requireLogin === false) return true;
  } catch {
    // Unreadable settings keep the board locked.
  }
  const token = request.cookies?.get?.("auth_token")?.value;
  return await verifyDashboardAuthToken(token);
}

// GET /api/health - liveness probe; GET /api/health?window=1h|6h|24h|7d - provider board
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const windowParam = String(searchParams.get("window") || "").trim().toLowerCase();

  if (!windowParam) return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  if (!HEALTH_WINDOWS[windowParam]) {
    return NextResponse.json({ error: WINDOW_HINT }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    if (!(await canReadBoard(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const report = await getHealthSnapshot(windowParam);
    return NextResponse.json({ ok: true, ...report }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Error building provider health snapshot:", error);
    return NextResponse.json({ error: "Failed to build provider health snapshot" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
