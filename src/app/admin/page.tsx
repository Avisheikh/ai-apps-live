"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface AppItem {
  id: number;
  slug: string;
  display_name: string;
  vendor: string;
  apple_app_id: string | null;
  apple_identity_status: "UNCONFIRMED" | "CONFIRMED";
  trends_label: string | null;
  sort_order: number;
  is_active: number;
}

interface DataSourceItem {
  id: number;
  key: string;
  name: string;
  kind: string;
  enabled: number;
  disabled_reason: string | null;
  poll_interval_seconds: number | null;
  stale_after_seconds: number;
}

interface MetricControlItem {
  metric_key: string;
  enabled: number;
  reason: string | null;
}

interface ChecklistItem {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  details: string;
  severity: "BLOCKER" | "WARNING";
}

interface CompanyDisclosureView {
  id: number;
  app_id: number;
  metric_type: string;
  metric_label: string;
  value_numeric: number;
  value_qualifier: string;
  source_kind: string;
  source_url: string;
  source_locator: string;
  verification_status: string;
  verifier_note: string | null;
}

interface CollectorRunView {
  id: number;
  source_key: string;
  scope: string;
  started_at: string;
  status: string;
  http_status: number | null;
  records_inserted: number | null;
  clock_skew_ms: number | null;
}

interface AuditLogView {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  after_json: string | null;
}

interface TrendsPreviewResult {
  valid: boolean;
  terms?: string[];
  periodStart?: string;
  periodEnd?: string;
  errors?: string[];
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<
    "checklist" | "apps" | "sources" | "controls" | "trends" | "disclosures" | "runs" | "audit" | "preview"
  >("checklist");

  // Live state
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [sources, setSources] = useState<DataSourceItem[]>([]);
  const [controls, setControls] = useState<MetricControlItem[]>([]);
  const [disclosures, setDisclosures] = useState<CompanyDisclosureView[]>([]);
  const [runs, setRuns] = useState<CollectorRunView[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogView[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error?: boolean } | null>(null);

  // Forms state
  const [reasonModal, setReasonModal] = useState<{
    type: "source" | "control";
    key: string;
    targetEnabled: boolean;
  } | null>(null);
  const [reasonText, setReasonText] = useState("");

  const [verifyModal, setVerifyModal] = useState<{ id: number; appName: string; metricLabel: string } | null>(null);
  const [sourceMatchedCheck, setSourceMatchedCheck] = useState(false);
  const [verifierNote, setVerifierNote] = useState("");

  const [trendsFile, setTrendsFile] = useState<File | null>(null);
  const [trendsGeo, setTrendsGeo] = useState("US");
  const [trendsGeoLabel, setTrendsGeoLabel] = useState("United States");
  const [trendsPreview, setTrendsPreview] = useState<TrendsPreviewResult | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/auth/session");
      const data = await res.json();
      if (data.authenticated) {
        setAuthenticated(true);
        setCsrfToken(data.csrfToken);
      } else {
        setAuthenticated(false);
      }
    } catch {
      setAuthenticated(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [checkRes, appsRes, sourcesRes, discRes, runsRes, auditRes] = await Promise.all([
        fetch("/api/admin/checklist"),
        fetch("/api/admin/apps"),
        fetch("/api/public/snapshot"),
        fetch("/api/admin/disclosures"),
        fetch("/api/admin/runs"),
        fetch("/api/admin/audit"),
      ]);

      if (checkRes.ok) {
        const d = await checkRes.json();
        setChecklist(d.checklist || []);
      }
      if (appsRes.ok) {
        const d = await appsRes.json();
        setApps(d.apps || []);
      }
      if (sourcesRes.ok) {
        const d = await sourcesRes.json();
        setControls(d.controls || []);
        // Sources from health
        setSources(
          (d.sourceHealth || []).map((s: { sourceKey: string; sourceName: string; state: string }, idx: number) => ({
            id: idx + 1,
            key: s.sourceKey,
            name: s.sourceName,
            kind: "AUTOMATIC",
            enabled: s.state !== "DISABLED" ? 1 : 0,
            disabled_reason: null,
            poll_interval_seconds: null,
            stale_after_seconds: 86400,
          }))
        );
      }
      if (discRes.ok) {
        const d = await discRes.json();
        setDisclosures(d.disclosures || []);
      }
      if (runsRes.ok) {
        const d = await runsRes.json();
        setRuns(d.runs || []);
      }
      if (auditRes.ok) {
        const d = await auditRes.json();
        setAuditLogs(d.logs || []);
      }
    } catch (err) {
      console.error("Error loading admin data:", err);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (authenticated) {
      loadData();
    }
  }, [authenticated, loadData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Login failed");
      } else {
        setAuthenticated(true);
        setCsrfToken(data.csrfToken);
        setPassword("");
        loadData();
      }
    } catch {
      setLoginError("Network connection error");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setCsrfToken("");
  };

  const handleRunCollector = async (key: string) => {
    setStatusMsg({ text: `Triggering ${key} collector...` });
    try {
      const res = await fetch(`/api/admin/collectors/${key}/run`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg({ text: `Collector run completed with status: ${data.result?.status}` });
        loadData();
      } else {
        setStatusMsg({ text: `Collector run failed: ${data.error}`, error: true });
      }
    } catch {
      setStatusMsg({ text: "Failed to run collector", error: true });
    }
  };

  const toggleAppleIdentityStatus = async (app: AppItem) => {
    const nextStatus = app.apple_identity_status === "CONFIRMED" ? "UNCONFIRMED" : "CONFIRMED";
    try {
      const res = await fetch(`/api/admin/apps/${app.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ apple_identity_status: nextStatus }),
      });
      if (res.ok) {
        setStatusMsg({ text: `Updated ${app.display_name} Apple ID status to ${nextStatus}` });
        loadData();
      }
    } catch {
      setStatusMsg({ text: "Failed to update identity status", error: true });
    }
  };

  const confirmToggleControl = async () => {
    if (!reasonModal) return;
    try {
      if (reasonModal.type === "control") {
        const res = await fetch(`/api/admin/metric-controls/${reasonModal.key}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({
            enabled: reasonModal.targetEnabled,
            reason: reasonText,
          }),
        });
        const d = await res.json();
        if (!res.ok) {
          setStatusMsg({ text: d.error, error: true });
        } else {
          setStatusMsg({ text: `Metric ${reasonModal.key} updated.` });
          loadData();
        }
      }
    } finally {
      setReasonModal(null);
      setReasonText("");
    }
  };

  const confirmVerifyDisclosure = async () => {
    if (!verifyModal || !sourceMatchedCheck) return;
    try {
      const res = await fetch(`/api/admin/disclosures/${verifyModal.id}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ note: verifierNote }),
      });
      const d = await res.json();
      if (!res.ok) {
        setStatusMsg({ text: d.error, error: true });
      } else {
        setStatusMsg({ text: `Disclosure #${verifyModal.id} successfully verified and published.` });
        loadData();
      }
    } finally {
      setVerifyModal(null);
      setSourceMatchedCheck(false);
      setVerifierNote("");
    }
  };

  const handleTrendsPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trendsFile) return;

    const fd = new FormData();
    fd.append("file", trendsFile);
    fd.append("geo", trendsGeo);
    fd.append("geo_label", trendsGeoLabel);

    try {
      const res = await fetch("/api/admin/imports/trends/preview", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: fd,
      });
      const data = await res.json();
      setTrendsPreview(data);
    } catch {
      setStatusMsg({ text: "Preview failed", error: true });
    }
  };

  const handleTrendsCommit = async () => {
    if (!trendsFile) return;

    const fd = new FormData();
    fd.append("file", trendsFile);
    fd.append("geo", trendsGeo);
    fd.append("geo_label", trendsGeoLabel);

    try {
      const res = await fetch("/api/admin/imports/trends/commit", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg({ text: `Import rejected: ${data.error}`, error: true });
      } else {
        setStatusMsg({ text: `Trends import accepted successfully (ID: ${data.importId})` });
        setTrendsPreview(null);
        setTrendsFile(null);
        loadData();
      }
    } catch {
      setStatusMsg({ text: "Commit request failed", error: true });
    }
  };

  if (authenticated === null) {
    return <div className="p-8 text-center text-broadcast-secondary">Loading console...</div>;
  }

  // ───────────── Login View ─────────────
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-canvas text-broadcast-text">
        <form onSubmit={handleLogin} className="w-full max-w-sm p-6 rounded border border-hairline bg-panel space-y-4">
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">AI Apps Live — Operator Login</h1>
            <p className="text-xs text-broadcast-secondary mt-1">Authenticate with operator admin credentials</p>
          </div>
          {loginError && <div className="p-2 text-xs bg-broadcast-red/20 text-broadcast-red rounded">{loginError}</div>}
          <div>
            <label className="block text-xs uppercase tracking-wider text-broadcast-secondary mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-hairline rounded text-broadcast-text text-sm focus:outline-none focus:border-broadcast-blue"
              placeholder="Operator password"
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-broadcast-blue text-white rounded text-sm font-semibold hover:opacity-90"
          >
            Authenticate
          </button>
        </form>
      </div>
    );
  }

  // ───────────── Authenticated Admin Console ─────────────
  return (
    <div className="min-h-screen bg-canvas text-broadcast-text">
      {/* Top Bar */}
      <header className="h-14 border-b border-hairline bg-panel px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-bold tracking-wider text-broadcast-blue">AI APPS LIVE</span>
          <span className="text-xs uppercase px-2 py-0.5 rounded bg-hairline text-broadcast-secondary">Admin Console</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <Link
            href="/broadcast"
            target="_blank"
            className="px-3 py-1.5 rounded border border-broadcast-blue text-broadcast-blue hover:bg-broadcast-blue hover:text-white transition"
          >
            Open /broadcast ↗
          </Link>
          <button onClick={handleLogout} className="text-broadcast-secondary hover:text-broadcast-red">
            Logout
          </button>
        </div>
      </header>

      {/* Status banner */}
      {statusMsg && (
        <div
          className={`px-6 py-2 text-xs flex justify-between items-center ${
            statusMsg.error ? "bg-broadcast-red/20 text-broadcast-red" : "bg-broadcast-blue/20 text-broadcast-cyan"
          }`}
        >
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="font-bold">
            ×
          </button>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="border-b border-hairline px-6 flex gap-6 text-sm overflow-x-auto bg-panel/50">
        {[
          { id: "checklist", label: "Go-Live Checklist" },
          { id: "apps", label: "Apps Registry" },
          { id: "sources", label: "Sources & Health" },
          { id: "controls", label: "Metric Controls" },
          { id: "trends", label: "Trends Importer" },
          { id: "disclosures", label: "Disclosures" },
          { id: "runs", label: "Runs & Logs" },
          { id: "audit", label: "Audit Timeline" },
          { id: "preview", label: "Broadcast Preview" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`py-3 font-medium border-b-2 transition ${
              activeTab === tab.id
                ? "border-broadcast-blue text-broadcast-blue"
                : "border-transparent text-broadcast-secondary hover:text-broadcast-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        {/* ───────────── Checklist Tab ───────────── */}
        {activeTab === "checklist" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Go-Live Broadcast Checklist</h2>
                <p className="text-xs text-broadcast-secondary">Live computed verification status before going on air</p>
              </div>
              <button
                onClick={loadData}
                className="px-3 py-1.5 rounded border border-hairline text-xs hover:border-broadcast-blue"
              >
                Re-evaluate Status
              </button>
            </div>
            <div className="border border-hairline rounded bg-panel divide-y divide-hairline">
              {checklist.map((item) => (
                <div key={item.id} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${item.passed ? "bg-broadcast-green" : "bg-broadcast-red"}`}
                      />
                      <span className="font-semibold text-sm">{item.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          item.severity === "BLOCKER" ? "bg-broadcast-red/20 text-broadcast-red" : "bg-hairline text-broadcast-secondary"
                        }`}
                      >
                        {item.severity}
                      </span>
                    </div>
                    <p className="text-xs text-broadcast-secondary mt-1">{item.description}</p>
                    <p className="text-xs font-mono text-broadcast-cyan mt-1">{item.details}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded font-mono font-bold ${
                      item.passed ? "bg-broadcast-green/20 text-broadcast-green" : "bg-broadcast-red/20 text-broadcast-red"
                    }`}
                  >
                    {item.passed ? "PASSED" : "FAILED"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ───────────── Apps Registry Tab ───────────── */}
        {activeTab === "apps" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Tracked Apps Registry</h2>
            <div className="border border-hairline rounded bg-panel overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-canvas border-b border-hairline text-broadcast-secondary">
                  <tr>
                    <th className="p-3">Order</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Slug</th>
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Apple App ID</th>
                    <th className="p-3">Identity Status</th>
                    <th className="p-3">Trends Label</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline font-mono">
                  {apps.map((app) => (
                    <tr key={app.id} className="hover:bg-canvas/50">
                      <td className="p-3">{app.sort_order}</td>
                      <td className="p-3 font-sans font-semibold text-broadcast-text">{app.display_name}</td>
                      <td className="p-3 text-broadcast-secondary">{app.slug}</td>
                      <td className="p-3 font-sans text-broadcast-secondary">{app.vendor}</td>
                      <td className="p-3">{app.apple_app_id || "—"}</td>
                      <td className="p-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            app.apple_identity_status === "CONFIRMED"
                              ? "bg-broadcast-green/20 text-broadcast-green"
                              : "bg-broadcast-amber/20 text-broadcast-amber"
                          }`}
                        >
                          {app.apple_identity_status}
                        </span>
                      </td>
                      <td className="p-3">{app.trends_label || "—"}</td>
                      <td className="p-3">
                        {app.apple_app_id && (
                          <button
                            onClick={() => toggleAppleIdentityStatus(app)}
                            className="px-2 py-1 rounded border border-hairline hover:border-broadcast-blue text-[10px]"
                          >
                            {app.apple_identity_status === "CONFIRMED" ? "Mark Unconfirmed" : "Confirm Identity"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ───────────── Metric Controls Tab ───────────── */}
        {activeTab === "controls" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Metric Controls</h2>
            <div className="border border-hairline rounded bg-panel divide-y divide-hairline text-sm">
              {controls.map((c) => {
                const isConcurrent = c.metric_key === "CONCURRENT_USERS";
                return (
                  <div key={c.metric_key} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono">{c.metric_key}</span>
                        {isConcurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-broadcast-amber/20 text-broadcast-amber font-mono font-bold">
                            LOCKED OFF (V1 POLICY)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-broadcast-secondary mt-1">
                        {isConcurrent
                          ? "Permanently disabled in v1. No legitimate free real-time source exists. Database triggers prohibit activation."
                          : c.reason || "Operating normally"}
                      </p>
                    </div>
                    <div>
                      {isConcurrent ? (
                        <span className="px-3 py-1 rounded bg-hairline text-broadcast-gray text-xs font-mono font-bold">
                          LOCKED OFF
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setReasonModal({
                              type: "control",
                              key: c.metric_key,
                              targetEnabled: !c.enabled,
                            });
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition ${
                            c.enabled
                              ? "bg-broadcast-green/20 text-broadcast-green border border-broadcast-green hover:bg-broadcast-red/20 hover:text-broadcast-red hover:border-broadcast-red"
                              : "bg-broadcast-gray/20 text-broadcast-gray border border-hairline hover:bg-broadcast-green/20 hover:text-broadcast-green"
                          }`}
                        >
                          {c.enabled ? "ENABLED (Click to Disable)" : "DISABLED (Click to Enable)"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ───────────── Sources & Health Tab ───────────── */}
        {activeTab === "sources" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Data Sources & Collectors</h2>
              <button
                onClick={() => handleRunCollector("apple_rss")}
                className="px-3 py-1.5 rounded bg-broadcast-blue text-white text-xs font-semibold hover:opacity-90"
              >
                Trigger Apple RSS Run
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sources.map((s) => (
                <div key={s.key} className="p-4 border border-hairline rounded bg-panel space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{s.name}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-hairline text-broadcast-cyan">{s.key}</span>
                  </div>
                  <div className="text-xs text-broadcast-secondary flex justify-between">
                    <span>Kind: {s.kind}</span>
                    <span>Status: {s.enabled ? "ENABLED" : "DISABLED"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ───────────── Trends Importer Tab ───────────── */}
        {activeTab === "trends" && (
          <div className="space-y-4">
            {/* Unverified gate banner */}
            <div className="p-3 border border-broadcast-amber bg-broadcast-amber/10 rounded flex items-center justify-between text-xs text-broadcast-amber font-mono font-bold">
              <span>⚠ IMPORTER NOT YET VERIFIED AGAINST A REAL GOOGLE EXPORT</span>
              <span>GATE ACTIVE</span>
            </div>

            <form onSubmit={handleTrendsPreview} className="p-4 border border-hairline rounded bg-panel space-y-4">
              <h3 className="font-bold text-sm">Upload Google Trends "Interest over time" CSV</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-broadcast-secondary mb-1">CSV File</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setTrendsFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-broadcast-secondary"
                  />
                </div>
                <div>
                  <label className="block text-broadcast-secondary mb-1">Geography Code</label>
                  <input
                    type="text"
                    value={trendsGeo}
                    onChange={(e) => setTrendsGeo(e.target.value)}
                    className="w-full px-2 py-1.5 bg-canvas border border-hairline rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block text-broadcast-secondary mb-1">Geography Label (Header match)</label>
                  <input
                    type="text"
                    value={trendsGeoLabel}
                    onChange={(e) => setTrendsGeoLabel(e.target.value)}
                    className="w-full px-2 py-1.5 bg-canvas border border-hairline rounded font-mono"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!trendsFile}
                className="px-4 py-2 bg-broadcast-blue text-white rounded text-xs font-semibold disabled:opacity-50"
              >
                Validate & Preview
              </button>
            </form>

            {trendsPreview && (
              <div className="p-4 border border-hairline rounded bg-panel space-y-4">
                <h3 className="font-bold text-sm">Preview & Validation Result</h3>
                {trendsPreview.valid ? (
                  <div className="space-y-3">
                    <div className="text-xs text-broadcast-green font-mono">
                      ✓ Validation passed: {trendsPreview.terms?.join(", ")} ({trendsPreview.periodStart} to{" "}
                      {trendsPreview.periodEnd})
                    </div>
                    <button
                      onClick={handleTrendsCommit}
                      className="px-4 py-2 bg-broadcast-green text-black font-bold rounded text-xs hover:opacity-90"
                    >
                      Commit & Publish to Dashboard
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-broadcast-red/20 text-broadcast-red rounded text-xs font-mono">
                    <p className="font-bold">Validation Failed:</p>
                    <ul className="list-disc pl-4 mt-1 space-y-1">
                      {trendsPreview.errors?.map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ───────────── Disclosures Tab ───────────── */}
        {activeTab === "disclosures" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Official Company Disclosures</h2>
            <div className="border border-hairline rounded bg-panel divide-y divide-hairline">
              {disclosures.length === 0 ? (
                <div className="p-6 text-center text-xs text-broadcast-secondary">No disclosures entered yet.</div>
              ) : (
                disclosures.map((d) => (
                  <div key={d.id} className="p-4 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{d.metric_label}</span>
                        <span className="font-mono font-bold text-broadcast-cyan">
                          {d.value_numeric.toLocaleString()} ({d.metric_type})
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                            d.verification_status === "VERIFIED"
                              ? "bg-broadcast-green/20 text-broadcast-green"
                              : d.verification_status === "DRAFT"
                              ? "bg-broadcast-amber/20 text-broadcast-amber"
                              : "bg-broadcast-red/20 text-broadcast-red"
                          }`}
                        >
                          {d.verification_status}
                        </span>
                      </div>
                      <p className="text-broadcast-secondary mt-1">
                        Source: {d.source_kind} · <a href={d.source_url} target="_blank" className="underline">{d.source_url}</a> ({d.source_locator})
                      </p>
                      {d.verifier_note && <p className="text-broadcast-green font-mono text-[10px] mt-1">Verifier note: {d.verifier_note}</p>}
                    </div>
                    <div>
                      {d.verification_status === "DRAFT" && (
                        <button
                          onClick={() => setVerifyModal({ id: d.id, appName: String(d.app_id), metricLabel: d.metric_label })}
                          className="px-3 py-1.5 rounded bg-broadcast-green text-black font-bold text-xs"
                        >
                          Verify & Publish
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ───────────── Runs & Logs Tab ───────────── */}
        {activeTab === "runs" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Collector Runs History</h2>
            <div className="border border-hairline rounded bg-panel overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-canvas border-b border-hairline text-broadcast-secondary">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Scope</th>
                    <th className="p-3">Started At</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">HTTP</th>
                    <th className="p-3">Records</th>
                    <th className="p-3">Clock Skew</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {runs.map((r) => (
                    <tr key={r.id} className="hover:bg-canvas/50">
                      <td className="p-3">{r.id}</td>
                      <td className="p-3 text-broadcast-cyan">{r.source_key}</td>
                      <td className="p-3">{r.scope}</td>
                      <td className="p-3 text-broadcast-secondary">{r.started_at}</td>
                      <td className="p-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            r.status === "SUCCESS"
                              ? "bg-broadcast-green/20 text-broadcast-green"
                              : r.status === "NO_CHANGE"
                              ? "bg-hairline text-broadcast-secondary"
                              : "bg-broadcast-red/20 text-broadcast-red"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3">{r.http_status || "—"}</td>
                      <td className="p-3">{r.records_inserted ?? "—"}</td>
                      <td className="p-3">{r.clock_skew_ms !== null ? `${r.clock_skew_ms}ms` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ───────────── Audit Tab ───────────── */}
        {activeTab === "audit" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Audit Timeline</h2>
            <div className="border border-hairline rounded bg-panel divide-y divide-hairline font-mono text-xs">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-broadcast-blue">{log.action}</span>
                    <span className="text-broadcast-secondary">{log.at}</span>
                  </div>
                  <div className="text-broadcast-secondary">
                    Actor: {log.actor} | Entity: {log.entity} (#{log.entity_id})
                  </div>
                  {log.after_json && <div className="text-[11px] text-broadcast-text bg-canvas p-2 rounded truncate">{log.after_json}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ───────────── Broadcast Preview Tab ───────────── */}
        {activeTab === "preview" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Live Broadcast Scaling Preview</h2>
            <div className="aspect-video w-full border border-hairline rounded overflow-hidden bg-black">
              <iframe src="/broadcast?preview=1" className="w-full h-full border-0" title="Broadcast Preview" />
            </div>
          </div>
        )}
      </main>

      {/* ───────────── Reason Modal ───────────── */}
      {reasonModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-panel border border-hairline rounded max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-broadcast-text">Reason Required</h3>
            <p className="text-broadcast-secondary">
              A documented reason is required to {reasonModal.targetEnabled ? "enable" : "disable"} {reasonModal.key}.
            </p>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              className="w-full p-2 bg-canvas border border-hairline rounded text-broadcast-text"
              placeholder="Enter explanation for audit log"
              rows={3}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setReasonModal(null)} className="px-3 py-1.5 rounded border border-hairline">
                Cancel
              </button>
              <button
                onClick={confirmToggleControl}
                disabled={!reasonText.trim()}
                className="px-3 py-1.5 rounded bg-broadcast-blue text-white font-bold disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────── Verify Modal ───────────── */}
      {verifyModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-panel border border-hairline rounded max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-broadcast-text">Human Verification Requirement</h3>
            <p className="text-broadcast-secondary">
              Verifying makes this disclosure strictly immutable and publishes it immediately to the live stream.
            </p>
            <label className="flex items-start gap-2 text-broadcast-text cursor-pointer">
              <input
                type="checkbox"
                checked={sourceMatchedCheck}
                onChange={(e) => setSourceMatchedCheck(e.target.checked)}
                className="mt-0.5"
              />
              <span>I opened the primary source and the figure, metric and reporting period match exactly.</span>
            </label>
            <div>
              <label className="block text-broadcast-secondary mb-1">Verifier Note (Mandatory):</label>
              <textarea
                value={verifierNote}
                onChange={(e) => setVerifierNote(e.target.value)}
                className="w-full p-2 bg-canvas border border-hairline rounded text-broadcast-text"
                placeholder="e.g. Verified against Form 10-Q Item 2 page 14."
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setVerifyModal(null)} className="px-3 py-1.5 rounded border border-hairline">
                Cancel
              </button>
              <button
                onClick={confirmVerifyDisclosure}
                disabled={!sourceMatchedCheck || !verifierNote.trim()}
                className="px-3 py-1.5 rounded bg-broadcast-green text-black font-bold disabled:opacity-50"
              >
                Verify & Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
