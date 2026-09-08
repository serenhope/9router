import { NextResponse } from "next/server";
import { getBudgetGroups, createBudgetGroup } from "@/lib/localDb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const groups = await getBudgetGroups();
    return NextResponse.json({ groups });
  } catch (error) {
    console.error("Error fetching budget groups:", error);
    return NextResponse.json({ error: "Failed to fetch budget groups" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, tokenLimit } = body;
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const group = await createBudgetGroup(name, { tokenLimit: Number(tokenLimit) || 0 });
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    console.error("Error creating budget group:", error);
    return NextResponse.json({ error: "Failed to create budget group" }, { status: 500 });
  }
}
