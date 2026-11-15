import React from "react";
import Link from "next/link";
import { SnapshotService } from "@/lib/snapshot/service";
import { Monogram } from "@/components/broadcast/Monogram";

export const dynamic = "force-dynamic";

export default async function Top50Page() {
  const snapshotService = new SnapshotService();
  const snapshot = snapshotService.getSnapshot("us");
  const top50 = snapshot.appStore.topChart || [];

  return (
    <div className="min-h-screen bg-canvas text-broadcast-text p-6 md:p-12 font-sans">
      <div className="max-w-4xl mx-auto">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-hairline gap-4">
          <div>
            <div className="text-xs font-mono font-bold tracking-widest text-broadcast-secondary uppercase">
              Apple App Store Ingestion
            </div>
            <h1 className="text-3xl font-black text-broadcast-text tracking-wide mt-1">
              Top 50 Free Apps (US Storefront)
            </h1>
            <p className="text-xs font-mono text-broadcast-secondary mt-1">
              Source Updated: {snapshot.appStore.sourceUpdatedAt || "Recent"} · Ingested via Apple RSS Feed
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/broadcast"
              className="px-4 py-2 rounded bg-broadcast-blue text-white font-mono text-xs font-bold hover:bg-opacity-90 transition"
            >
              Broadcast View (1080p)
            </Link>
            <Link
              href="/admin"
              className="px-4 py-2 rounded border border-hairline bg-panel text-broadcast-secondary hover:text-broadcast-text font-mono text-xs transition"
            >
              Admin Console
            </Link>
          </div>
        </div>

        {/* Notice line */}
        <div className="my-6 p-4 rounded bg-panel/70 border border-hairline flex items-center justify-between">
          <span className="text-xs font-mono text-broadcast-secondary">
            Highlighting tracked AI apps monitored by AI Apps Live.
          </span>
          <span className="text-xs font-mono text-broadcast-secondary/70">
            Source: Apple App Store charts
          </span>
        </div>

        {/* Top 50 List */}
        <div className="flex flex-col space-y-2">
          {top50.length === 0 ? (
            <div className="p-12 text-center font-mono text-broadcast-secondary border border-hairline rounded bg-panel">
              No top 50 rankings collected yet. Ensure the ingestion worker is active.
            </div>
          ) : (
            top50.map((app) => (
              <div
                key={`${app.rank}-${app.appleAppId}`}
                className={`flex items-center justify-between p-3.5 rounded border transition ${
                  app.isTracked
                    ? "bg-broadcast-blue/15 border-broadcast-blue/60 shadow-[0_0_12px_rgba(45,123,255,0.15)]"
                    : "bg-panel/70 border-hairline/60 hover:border-hairline"
                }`}
              >
                <div className="flex items-center space-x-4 truncate">
                  <div className="w-10 font-mono text-xl font-black text-broadcast-text tabular-nums text-center">
                    #{app.rank}
                  </div>

                  <Monogram name={app.name} size={40} />

                  <div className="flex flex-col truncate max-w-[480px]">
                    <div className="font-bold text-base text-broadcast-text truncate flex items-center gap-2">
                      <span>{app.name}</span>
                      {app.isTracked && (
                        <span className="px-2 py-0.5 rounded bg-broadcast-blue/30 border border-broadcast-blue/70 text-broadcast-blue text-[10px] font-mono font-bold uppercase tracking-wider">
                          Tracked AI App
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-broadcast-secondary truncate mt-0.5">
                      {app.artist || "Unknown Developer"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-4 shrink-0 font-mono text-xs">
                  <span className="text-broadcast-secondary/80">ID: {app.appleAppId}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-hairline flex items-center justify-between text-xs font-mono text-broadcast-secondary">
          <span>Source: Apple App Store charts (https://rss.marketingtools.apple.com)</span>
          <span>Independent project. Not affiliated with any listed company.</span>
        </div>
      </div>
    </div>
  );
}
