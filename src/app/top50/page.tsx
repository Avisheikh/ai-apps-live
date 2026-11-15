import React from "react";
import Link from "next/link";
import { SnapshotService } from "@/lib/snapshot/service";
import { Monogram } from "@/components/broadcast/Monogram";

export const dynamic = "force-dynamic";

export default async function Top50Page() {
  const snapshotService = new SnapshotService();
  const snapshot = snapshotService.getSnapshot("us");
  const top50 = snapshot.appStore.topChart || [];

  // Group into 5 columns of 10 items each
  const columns = [
    { title: "Ranks 1–10", items: top50.slice(0, 10) },
    { title: "Ranks 11–20", items: top50.slice(10, 20) },
    { title: "Ranks 21–30", items: top50.slice(20, 30) },
    { title: "Ranks 31–40", items: top50.slice(30, 40) },
    { title: "Ranks 41–50", items: top50.slice(40, 50) },
  ];

  return (
    <div className="w-screen h-screen overflow-hidden bg-canvas text-broadcast-text flex flex-col justify-between p-5 select-none font-sans">
      {/* HEADER (Compact 56px) */}
      <header className="h-14 pb-3 border-b border-hairline flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex flex-col">
            <span className="font-mono text-xl font-black tracking-wider text-broadcast-text">
              APP STORE TOP 50 FREE & DOWNLOADS
            </span>
            <span className="text-[10px] font-mono tracking-widest text-broadcast-secondary uppercase">
              US Storefront · Ingested via Apple RSS Feed · Live Single-Screen View
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded bg-broadcast-blue/20 border border-broadcast-blue/40 text-broadcast-blue font-mono text-xs font-bold">
            50/50 APPS DISPLAYED
          </span>
        </div>

        <div className="flex items-center space-x-6">
          <div className="flex flex-col text-right font-mono text-xs">
            <span className="text-[10px] text-broadcast-secondary uppercase">Source Updated</span>
            <span className="text-broadcast-text font-bold">
              {snapshot.appStore.sourceUpdatedAt || "Recent"}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <Link
              href="/broadcast?view=top50"
              className="px-3 py-1.5 rounded bg-broadcast-blue text-white font-mono text-xs font-bold hover:bg-opacity-90 transition shadow-sm"
            >
              OBS Broadcast View (1080p)
            </Link>
            <Link
              href="/broadcast"
              className="px-3 py-1.5 rounded border border-hairline bg-panel text-broadcast-secondary hover:text-broadcast-text font-mono text-xs transition"
            >
              3-Column View
            </Link>
            <Link
              href="/admin"
              className="px-3 py-1.5 rounded border border-hairline bg-panel text-broadcast-secondary hover:text-broadcast-text font-mono text-xs transition"
            >
              Admin Console
            </Link>
          </div>
        </div>
      </header>

      {/* 5-COLUMN SINGLE-SCREEN GRID */}
      <main className="flex-1 my-3 grid grid-cols-5 gap-3.5 overflow-hidden">
        {columns.map((col, cIdx) => (
          <div
            key={col.title}
            className="bg-panel/50 border border-hairline rounded-lg p-3 flex flex-col justify-between h-full overflow-hidden"
          >
            {/* Column Header */}
            <div className="pb-2 border-b border-hairline/60 flex items-center justify-between text-xs font-mono font-bold text-broadcast-secondary uppercase">
              <span>{col.title}</span>
              <span className="text-[10px] text-hairline">Col {cIdx + 1}</span>
            </div>

            {/* 10 Items distributed evenly in full height */}
            <div className="flex-1 flex flex-col justify-between py-2 space-y-1 overflow-hidden">
              {col.items.map((app) => (
                <div
                  key={`${app.rank}-${app.appleAppId}`}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-xs leading-tight transition ${
                    app.isTracked
                      ? "bg-broadcast-blue/20 border-broadcast-blue/80 shadow-[0_0_10px_rgba(45,123,255,0.25)] ring-1 ring-broadcast-blue/40"
                      : "bg-panel/80 border-hairline/40 hover:border-hairline"
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate min-w-0 flex-1 mr-2">
                    <span className="w-6 font-mono font-black text-sm text-broadcast-text text-right shrink-0 tabular-nums">
                      #{app.rank}
                    </span>
                    <Monogram name={app.name} size={24} />
                    <div className="flex flex-col truncate min-w-0">
                      <span className="font-bold text-xs text-broadcast-text truncate" title={app.name}>
                        {app.name}
                      </span>
                      <span className="text-[10px] text-broadcast-secondary truncate" title={app.artist || ""}>
                        {app.artist || "Unknown Developer"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {app.isTracked && (
                      <span className="px-1.5 py-0.5 rounded bg-broadcast-blue/40 border border-broadcast-blue/70 text-broadcast-cyan font-mono text-[9px] font-black uppercase tracking-wider">
                        AI APP
                      </span>
                    )}
                    <div className="flex flex-col items-end">
                      <a
                        href={app.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Download ${app.name} on Apple App Store`}
                        className="flex items-center space-x-1 px-2 py-0.5 rounded bg-broadcast-blue hover:bg-blue-600 text-white font-mono text-[10px] font-bold shadow-sm transition"
                      >
                        <span>⬇ Get</span>
                        <span className="text-[8px] opacity-75">↗</span>
                      </a>
                      {app.verifiedDownloads ? (
                        <span className="text-[9px] font-mono font-bold text-broadcast-green leading-none mt-0.5">
                          {app.verifiedDownloads}
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono text-broadcast-secondary/70 leading-none mt-0.5">
                          Free DL
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>

      {/* FOOTER (Compact 36px) */}
      <footer className="h-9 px-4 border-t border-hairline flex items-center justify-between shrink-0 text-xs font-mono text-broadcast-secondary">
        <div>
          Source: Apple App Store charts (<a href="https://rss.marketingtools.apple.com" target="_blank" rel="noreferrer" className="underline hover:text-broadcast-text">rss.marketingtools.apple.com</a>)
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-broadcast-blue inline-block shadow-[0_0_6px_#2D7BFF]" />
          <span>Highlighted rows represent Tracked AI Apps · Direct download links provided for all 50 apps</span>
        </div>
        <div>
          Independent project. Not affiliated with any listed company.
        </div>
      </footer>
    </div>
  );
}
