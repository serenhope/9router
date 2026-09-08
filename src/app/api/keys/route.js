import { NextResponse } from "next/server";
import { getApiKeys, createApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";

export const dynamic = "force-dynamic";

// GET /api/keys - List API keys
export async function GET() {
  try {
    const keys = await getApiKeys();
    return NextResponse.json({ keys });
  } catch (error) {
    console.log("Error fetching keys:", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

// POST /api/keys - Create new API key
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, tokenLimit, resetInterval, allowedModels, rpmLimit, tpmLimit, ipWhitelist, expiresAt, systemPrompt, budgetGroupId } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Always get machineId from server
    const machineId = await getConsistentMachineId();
    const apiKey = await createApiKey(name, machineId, {
      tokenLimit: tokenLimit !== undefined ? Number(tokenLimit) : 0,
      resetInterval: resetInterval || "never",
      allowedModels: allowedModels || "*",
      rpmLimit: rpmLimit !== undefined ? Number(rpmLimit) : 0,
      tpmLimit: tpmLimit !== undefined ? Number(tpmLimit) : 0,
      ipWhitelist: ipWhitelist || "",
    });

    return NextResponse.json({
      key: apiKey.key,
      name: apiKey.name,
      id: apiKey.id,
      machineId: apiKey.machineId,
      tokenLimit: apiKey.tokenLimit,
      usedTokens: apiKey.usedTokens,
      resetInterval: apiKey.resetInterval,
      lastResetAt: apiKey.lastResetAt,
      allowedModels: apiKey.allowedModels,
      rpmLimit: apiKey.rpmLimit,
      tpmLimit: apiKey.tpmLimit,
      ipWhitelist: apiKey.ipWhitelist,
    }, { status: 201 });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
