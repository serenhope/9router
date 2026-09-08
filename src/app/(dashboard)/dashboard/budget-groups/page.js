"use client";

import { useState, useEffect, useCallback } from "react";

export default function BudgetGroupsPage() {
 const [groups, setGroups] = useState([]);
 const [loading, setLoading] = useState(true);
 const [showAdd, setShowAdd] = useState(false);
 const [newName, setNewName] = useState("");
 const [newLimit, setNewLimit] = useState("");
 const [editingId, setEditingId] = useState(null);
 const [editName, setEditName] = useState("");
 const [editLimit, setEditLimit] = useState("");

 const fetchGroups = useCallback(async () => {
 try {
 const res = await fetch("/api/budget-groups");
 const data = await res.json();
 setGroups(data.groups || []);
 } catch {}
 }, []);

 useEffect(() => {
 let cancelled = false;
 fetch("/api/budget-groups")
 .then((r) => r.json())
 .then((d) => { if (!cancelled) setGroups(d.groups || []); })
 .catch(() => {})
 .finally(() => { if (!cancelled) setLoading(false); });
 return () => { cancelled = true; };
 }, []);

 const fmt = (n) => {
 if (!n) return "0";
 if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
 if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
 if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
 return String(n);
 };

 const handleCreate = async () => {
 if (!newName.trim()) return;
 try {
 await fetch("/api/budget-groups", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ name: newName.trim(), tokenLimit: Number(newLimit) || 0 }),
 });
 setNewName(""); setNewLimit(""); setShowAdd(false);
 fetchGroups();
 } catch {}
 };

 const handleUpdate = async (id) => {
 try {
 await fetch(`/api/budget-groups/${id}`, {
 method: "PUT",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ name: editName.trim(), tokenLimit: Number(editLimit) || 0 }),
 });
 setEditingId(null);
 fetchGroups();
 } catch {}
 };

 const handleDelete = async (id) => {
 try {
 await fetch(`/api/budget-groups/${id}`, { method: "DELETE" });
 fetchGroups();
 } catch {}
 };

 if (loading) return <div className="text-zinc-500 text-sm px-1">Loading budget groups...</div>;

 return (
 <div className="flex min-w-0 flex-col gap-4 px-1 sm:px-0">
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-lg font-semibold text-zinc-100">Budget Groups</h1>
 <p className="text-xs text-zinc-500 mt-0.5">Share one token budget across multiple API keys</p>
 </div>
 <button
 onClick={() => setShowAdd(true)}
 className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
 >
 + New Group
 </button>
 </div>

 {showAdd && (
 <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col gap-3">
 <div className="flex flex-col sm:flex-row gap-3">
 <input
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 placeholder="Group name"
 className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-primary focus:outline-none"
 />
 <input
 value={newLimit}
 onChange={(e) => setNewLimit(e.target.value)}
 placeholder="Token limit (0 = unlimited)"
 type="number"
 className="w-full sm:w-56 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-primary focus:outline-none"
 />
 </div>
 <div className="flex gap-2">
 <button onClick={handleCreate} disabled={!newName.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90 disabled:opacity-50">Create</button>
 <button onClick={() => setShowAdd(false)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
 </div>
 </div>
 )}

 {groups.length === 0 ? (
 <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-500 text-sm">
 No budget groups yet. Create one to share a token budget across keys.
 </div>
 ) : (
 <div className="flex flex-col gap-3">
 {groups.map((g) => {
 const pct = g.tokenLimit > 0 ? Math.min(100, ((g.usedTokens || 0) / g.tokenLimit) * 100) : 0;
 return (
 <div key={g.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
 {editingId === g.id ? (
 <div className="flex flex-col gap-3">
 <div className="flex flex-col sm:flex-row gap-3">
 <input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-primary focus:outline-none" />
 <input value={editLimit} onChange={(e) => setEditLimit(e.target.value)} type="number" className="w-full sm:w-56 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-primary focus:outline-none" />
 </div>
 <div className="flex gap-2">
 <button onClick={() => handleUpdate(g.id)} className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90">Save</button>
 <button onClick={() => setEditingId(null)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
 </div>
 </div>
 ) : (
 <>
 <div className="flex items-center justify-between">
 <div>
 <h3 className="text-sm font-medium text-zinc-100">{g.name}</h3>
 <p className="text-xs text-zinc-500 mt-0.5">
 {g.tokenLimit > 0 ? `${fmt(g.usedTokens || 0)} / ${fmt(g.tokenLimit)} tokens` : `${fmt(g.usedTokens || 0)} tokens used (unlimited)`}
 </p>
 </div>
 <div className="flex items-center gap-2">
 <button onClick={() => { setEditingId(g.id); setEditName(g.name); setEditLimit(g.tokenLimit ? String(g.tokenLimit) : ""); }} className="text-xs text-zinc-400 hover:text-zinc-200">Edit</button>
 <button onClick={() => handleDelete(g.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
 </div>
 </div>
 {g.tokenLimit > 0 && (
 <div className="mt-3">
 <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
 <div className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
 </div>
 <div className="mt-1 text-right text-xs text-zinc-500">{pct.toFixed(0)}%</div>
 </div>
 )}
 </>
 )}
 </div>
 );
 })}
 </div>
 )}
 </div>
 );
}
