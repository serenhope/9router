"use client";

import { useState, useEffect, useRef } from "react";

export default function LiveFeedPage() {
  const [entries, setEntries] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    const es = new EventSource("/api/usage/stream");
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.activeRequests) setActiveCount(data.activeRequests.length);
        if (data.recentRequests && data.recentRequests.length > 0) {
          setEntries((prev) => {
            const latest = data.recentRequests[0];
            if (prev.length && prev[0].timestamp === latest.timestamp && prev[0].model === latest.model) {
              return prev;
            }
            return [...data.recentRequests, ...prev].slice(0, 200);
          });
        }
      } catch { }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [entries.length]);

  const fmt = (n) => {
    if (!n) return "0";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(n);
  };

  const statusColor = (s) => {
    if (!s || s === "ok" || s === "200" || s === "success") return "text-emerald-400";
    return "text-red-400";
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 px-1 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-zinc-100">Live Feed</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs ${connected ? "text-emerald-400" : "text-red-400"}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
            {connected ? "Connected" : "Disconnected"}
          </span>
          <span className="text-xs text-zinc-500">Active: {activeCount}</span>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]" ref={listRef}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900 z-10">
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-500 font-medium px-4 py-2 whitespace-nowrap">Time</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-2 whitespace-nowrap">Model</th>
                <th className="text-left text-zinc-500 font-medium px-4 py-2 whitespace-nowrap">Provider</th>
                <th className="text-right text-zinc-500 font-medium px-4 py-2 whitespace-nowrap">Status</th>
                <th className="text-right text-zinc-500 font-medium px-4 py-2 whitespace-nowrap">Prompt</th>
                <th className="text-right text-zinc-500 font-medium px-4 py-2 whitespace-nowrap">Completion</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-zinc-500">
                    Waiting for requests...
                  </td>
                </tr>
              )}
              {entries.map((e, i) => (
                <tr key={`${e.timestamp}-${i}`} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                  <td className="px-4 py-1.5 text-zinc-400 font-mono text-xs">
                    {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "—"}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-1.5 text-zinc-200">{e.model || "—"}</td>
                  <td className="px-4 py-1.5 text-zinc-400">{e.provider || "—"}</td>
                  <td className={`px-4 py-1.5 max-w-[120px] truncate text-right ${statusColor(e.status)}`}>{e.status || "—"}</td>
                  <td className="px-4 py-1.5 text-right text-zinc-300">{fmt(e.promptTokens)}</td>
                  <td className="px-4 py-1.5 text-right text-zinc-300">{fmt(e.completionTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
