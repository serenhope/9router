"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

const DECOLUA_URL = "https://raw.githubusercontent.com/decolua/9router/refs/heads/master/CHANGELOG.md";
const SERENHOPE_URL = "https://raw.githubusercontent.com/serenhope/9router/refs/heads/master/CHANGELOG.md";

/** Split markdown into per-version blocks keyed by the header line. */
function splitByVersion(md) {
  if (!md) return [];
  const lines = md.split("\n");
  const versions = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(.+)/);
    if (m) {
      const label = m[1].trim();
      current = { label, body: "" };
      versions.push(current);
    } else if (current) {
      current.body += line + "\n";
    }
  }

  if (versions.length === 0 && md.trim()) {
    return [{ label: "Full Changelog", body: md }];
  }
  return versions;
}

export default function ChangelogModal({ isOpen, onClose }) {
  const [source, setSource] = useState("seren"); // "seren" | "official"
  const [cache, setCache] = useState({});         // { seren: [...], official: [...] }
   const [error, setError] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const modalRef = useRef(null);

 // Fetch on source change only when cache misses — no sync setState in effect
 useEffect(() => {
 if (!isOpen || cache[source]) return;
 let cancelled = false;
 const url = source === "seren" ? SERENHOPE_URL : DECOLUA_URL;
 fetch(url)
 .then((r) => (r.ok ? r.text() : ""))
 .then((md) => {
 if (cancelled) return;
 setCache((prev) => ({ ...prev, [source]: splitByVersion(md) }));
 setActiveIdx(0);
 })
 .catch((err) => {
 if (cancelled) return;
 setError(err.message || "Failed to load changelog");
 });
 return () => { cancelled = true; };
 }, [isOpen, source, cache]);

  // Derived versions list (no setState in effect)
  const versions = useMemo(() => cache[source] || [], [cache, source]);
  const currentVersion = versions[activeIdx] || null;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleSourceSwitch = (s) => {
    setSource(s);
    setActiveIdx(0);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={modalRef}
        className="relative w-full bg-surface border border-black/10 dark:border-white/10 rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-w-3xl flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-black/5 dark:border-white/5">
          <h2 className="text-lg font-semibold text-text-main">Change Log</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Source toggle */}
        <div className="flex items-center gap-2 px-4 pt-3">
          <button
            onClick={() => handleSourceSwitch("seren")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              source === "seren"
                ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                : "text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
            }`}
          >
            <span className="material-symbols-outlined text-[16px] align-text-bottom mr-1">star</span>
            Contributed by Seren
          </button>
          <button
            onClick={() => handleSourceSwitch("official")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              source === "official"
                ? "bg-gray-500/15 text-gray-300 border border-gray-500/30"
                : "text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
            }`}
          >
            <span className="material-symbols-outlined text-[16px] align-text-bottom mr-1">history_edu</span>
            Official (Decolua)
          </button>
        </div>

        {/* Version selector */}
        {!isLoading && versions.length > 1 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-2.5">
            {versions.map((v, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                  i === activeIdx
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 prose dark:prose-invert max-w-none text-sm">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
            </div>
          ) : error ? (
            <p className="text-red-500">{error}</p>
          ) : currentVersion ? (
            <>
              <h3 className="text-base font-semibold text-text-main mb-3">{currentVersion.label}</h3>
              <div dangerouslySetInnerHTML={{ __html: marked.parse(currentVersion.body) }} />
            </>
          ) : (
            <p className="text-text-muted">No changelog available.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

ChangelogModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
