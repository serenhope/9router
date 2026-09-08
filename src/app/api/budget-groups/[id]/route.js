import { NextResponse } from "next/server";
import { getBudgetGroupById, updateBudgetGroup, deleteBudgetGroup } from "@/lib/localDb";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const group = await getBudgetGroupById(id);
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ group });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await getBudgetGroupById(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updateData = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.tokenLimit !== undefined) updateData.tokenLimit = Number(body.tokenLimit);
    if (body.usedTokens !== undefined) updateData.usedTokens = Number(body.usedTokens);
    const updated = await updateBudgetGroup(id, updateData);
    return NextResponse.json({ group: updated });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const deleted = await deleteBudgetGroup(id);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
