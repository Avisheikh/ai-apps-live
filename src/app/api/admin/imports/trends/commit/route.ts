import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/auth/session";
import { commitTrendsImport, TrendsImportMetadata } from "@/importers/google-trends/index";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = validateAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
    }

    const metadata: TrendsImportMetadata = {
      geo: (formData.get("geo") as string) || "US",
      geo_label: (formData.get("geo_label") as string) || "United States",
      search_type: ((formData.get("search_type") as string) || "web") as TrendsImportMetadata["search_type"],
      entity_mode: ((formData.get("entity_mode") as string) || "search_term") as TrendsImportMetadata["entity_mode"],
      category: (formData.get("category") as string) || "All categories",
      time_range_label: (formData.get("time_range_label") as string) || "Past 30 days",
      granularity: ((formData.get("granularity") as string) || "weekly") as TrendsImportMetadata["granularity"],
      exported_at: (formData.get("exported_at") as string) || new Date().toISOString().split("T")[0],
      original_filename: file.name,
    };

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = commitTrendsImport(buffer, metadata, "admin");

    if (!result.success) {
      return NextResponse.json({ error: result.error, importId: result.importId }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
