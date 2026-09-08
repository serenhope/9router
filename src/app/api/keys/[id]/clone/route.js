import { NextResponse } from "next/server";
import { cloneApiKey } from "@/lib/localDb";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const cloned = await cloneApiKey(id);
    if (!cloned) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key: cloned }, { status: 201 });
  } catch (error) {
    console.error("Error cloning key:", error);
    return NextResponse.json({ error: "Failed to clone key" }, { status: 500 });
  }
}
