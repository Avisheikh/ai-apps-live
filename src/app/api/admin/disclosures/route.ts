import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/auth/session";
import { DisclosureService } from "@/lib/disclosures/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = validateAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const service = new DisclosureService();
  const disclosures = service.getAll();
  return NextResponse.json({ disclosures });
}

export async function POST(request: NextRequest) {
  const auth = validateAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const service = new DisclosureService();

    const created = service.createDraft(body, "admin");
    return NextResponse.json({ disclosure: created }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
