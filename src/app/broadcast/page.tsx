import React from "react";
import { SnapshotService } from "@/lib/snapshot/service";
import { BroadcastClient } from "@/components/broadcast/BroadcastClient";

export const dynamic = "force-dynamic";

interface BroadcastPageProps {
  searchParams: Promise<{
    country?: string;
    tz?: string;
    preview?: string;
    view?: string;
  }>;
}

export default async function BroadcastPage({ searchParams }: BroadcastPageProps) {
  const params = await searchParams;
  const country = typeof params.country === "string" ? params.country.toLowerCase() : "us";
  const tz = typeof params.tz === "string" ? params.tz : "UTC";
  const preview = params.preview === "1" || params.preview === "true";
  const defaultView = params.view === "top50" ? "top50" : "tracked";
  const demoMode = process.env.DEMO_MODE === "1";

  // Server-render the first snapshot directly from SQLite
  const snapshotService = new SnapshotService();
  const initialSnapshot = snapshotService.getSnapshot(country);

  return (
    <BroadcastClient
      initialSnapshot={initialSnapshot}
      country={country}
      tz={tz}
      preview={preview}
      demoMode={demoMode}
      defaultView={defaultView}
    />
  );
}
