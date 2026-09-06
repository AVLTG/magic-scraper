import { NextResponse } from "next/server";
import { getAllStoreHealth } from "@/lib/scraperHealthCache";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  return NextResponse.json(await getAllStoreHealth());
}
