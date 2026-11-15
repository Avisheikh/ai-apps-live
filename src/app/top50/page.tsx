import React from "react";
import { SnapshotService } from "@/lib/snapshot/service";
import { Top50Client } from "@/components/broadcast/Top50Client";

export const dynamic = "force-dynamic";

export default async function Top50Page() {
  const snapshotService = new SnapshotService();
  const snapshot = snapshotService.getSnapshot("us");

  return <Top50Client snapshot={snapshot} />;
}
