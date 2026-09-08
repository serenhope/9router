import { NextResponse } from "next/server";
import { auditApiKeys } from "@/lib/localDb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const issues = await auditApiKeys();
    return NextResponse.json({ issues, total: issues.length });
  } catch (error) {
    console.error("Error auditing keys:", error);
    return NextResponse.json({ error: "Failed to audit keys" }, { status: 500 });
  }
}
