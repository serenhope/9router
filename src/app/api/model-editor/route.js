import { NextResponse } from "next/server";
import { getModelOverrides, setModelOverride, deleteModelOverride } from "@/lib/db/repos/modelEditorRepo.js";

export const dynamic = "force-dynamic";

// GET — return all model overrides
export async function GET() {
  try {
    const overrides = await getModelOverrides();
    return NextResponse.json({ overrides });
  } catch (error) {
    console.error("Error fetching model overrides:", error);
    return NextResponse.json({ error: "Failed to fetch model overrides" }, { status: 500 });
  }
}

// PUT — save a model override (body: { key, targetModel, contextWindow, systemPrompt, name })
export async function PUT(request) {
  try {
    const body = await request.json();
    const { key, ...data } = body;
    if (!key) return NextResponse.json({ error: "Key is required" }, { status: 400 });
    await setModelOverride(key, {
      targetModel: data.targetModel || "",
      contextWindow: data.contextWindow || 0,
      systemPrompt: data.systemPrompt || "",
      name: data.name || "",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving model override:", error);
    return NextResponse.json({ error: "Failed to save model override" }, { status: 500 });
  }
}

// DELETE — remove a model override (query: ?key=...)
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    if (!key) return NextResponse.json({ error: "Key is required" }, { status: 400 });
    await deleteModelOverride(key);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting model override:", error);
    return NextResponse.json({ error: "Failed to delete model override" }, { status: 500 });
  }
}
