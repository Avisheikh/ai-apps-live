import { NextRequest, NextResponse } from "next/server";
import { SnapshotService } from "@/lib/snapshot/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country") || "us";

    const service = new SnapshotService();
    const snapshot = service.getSnapshot(country);

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
