import { NextRequest, NextResponse } from "next/server";
import { validateAdminRequest } from "@/lib/auth/session";
import { DisclosureService } from "@/lib/disclosures/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = validateAdminRequest(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { id } = await params;
    const disclosureId = parseInt(id, 10);
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "Withdrawn by operator";

    const service = new DisclosureService();
    const withdrawn = service.withdrawDisclosure(disclosureId, "admin", reason);

    return NextResponse.json({ disclosure: withdrawn });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
