"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

const DECOLUA_URL = "https://raw.githubusercontent.com/decolua/9router/refs/heads/master/CHANGELOG.md";
const SERENHOPE_URL = "https://raw.githubusercontent.com/serenhope/9router/refs/heads/master/CHANGELOG.md";

export default function ChangelogModal({ isOpen, onClose }) {
  const [combinedHtml, setCombinedHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen || combinedHtml) return;
    setLoading(true);
    setError("");

    Promise.all([
      fetch(DECOLUA_URL).then((r) => r.ok ? r.text() : "").catch(() => ""),
      fetch(SERENHOPE_URL).then((r) => r.ok ? r.text() : "").catch(() => ""),
    ])
      .then(([decoluaMd, serenhopeMd]) => {
        const decoluaHtml = decoluaMd ? marked.parse(decoluaMd) : "";
        const serenhopeHtml = serenhopeMd ? marked.parse(serenhopeMd) : "";

        const serenSection = serenhopeHtml
          ? `<div style="margin-bottom:32px;padding:16px;border:1px solid rgba(96,165,250,0.3);border-radius:12px;background:rgba(96,165,250,0.05);">
  <h2 style="display:flex;align-items:center;gap:8px;margin:0 0 16px 0;font-size:18px;font-weight:600;color:#60a5fa;">
    <span class="material-symbols-outlined" style="font-size:20px;">star</span>
    Contributed by Seren
  </h2>
  <div class="seren-contrib">${serenhopeHtml}</div>
</div>`
          : "";

        const divider = decoluaHtml && serenhopeHtml
          ? `<div style="margin:32px 0 0 0;padding-top:24px;border-top:1px solid rgba(128,128,128,0.15);">
  <h2 style="display:flex;align-items:center;gap:8px;margin:0 0 16px 0;font-size:18px;font-weight:600;color:rgba(128,128,128,0.8);">
    <span class="material-symbols-outlined" style="font-size:20px;">history_edu</span>
    Official Releases (Decolua)
  </h2>
</div>`
          : "";

        setCombinedHtml(serenSection + divider + decoluaHtml);
      })
      .catch((err) => {
        setError(err.message || "Failed to load changelog");
      })
      .finally(() => setLoading(false));
  }, [isOpen, combinedHtml]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onClose]);

  // Reset content when modal closes
  useEffect(() => {
    if (!isOpen) setCombinedHtml("");
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={modalRef}
        className="relative w-full bg-surface border border-black/10 dark:border-white/10 rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-w-3xl flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between p-3 border-b border-black/5 dark:border-white/5">
          <h2 className="text-lg font-semibold text-text-main">Change Log</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 prose dark:prose-invert max-w-none text-sm">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
            </div>
          ) : error ? (
            <p className="text-red-500">{error}</p>
          ) : combinedHtml ? (
            <div dangerouslySetInnerHTML={{ __html: combinedHtml }} />
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
