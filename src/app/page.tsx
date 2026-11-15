import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-canvas">
      <h1 className="text-4xl font-bold tracking-tight text-broadcast-text mb-4">
        AI Apps Live
      </h1>
      <p className="text-broadcast-secondary text-lg max-w-md mb-8">
        Local-first, broadcast-ready dashboard tracking public AI metrics.
      </p>
      <div className="flex gap-4">
        <Link
          href="/broadcast"
          className="px-6 py-3 rounded bg-broadcast-blue text-white font-medium hover:bg-opacity-90 transition"
        >
          Open Broadcast View
        </Link>
        <Link
          href="/admin"
          className="px-6 py-3 rounded border border-hairline bg-panel text-broadcast-text hover:border-broadcast-blue transition"
        >
          Admin Console
        </Link>
      </div>
    </main>
  );
}
