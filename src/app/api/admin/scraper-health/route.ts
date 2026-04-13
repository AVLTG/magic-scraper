import { NextResponse } from "next/server";
import { getAllStoreHealth } from "@/lib/scraperHealthCache";

export async function GET() {
  return NextResponse.json(getAllStoreHealth());
}
