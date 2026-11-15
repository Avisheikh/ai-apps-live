import { NextRequest } from "next/server";
import { createSseStream } from "@/lib/sse/hub";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") || "us";
  return createSseStream(request, country);
}
