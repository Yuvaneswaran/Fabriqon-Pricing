"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Calculator, ChevronRight, Copy, Eye, FileJson, History, Pencil, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useStudio } from "@/components/studio-provider";
import { parseBackup, serializeBackup, serializeCSV } from "@/lib/backup";
import { dateTime, downloadFile, grams, machineTime, money } from "@/lib/format";
import { deleteCalculation, importCalculations } from "@/lib/storage";
import type { SavedCalculation } from "@/lib/types";

type SortOrder = "newest" | "oldest" | "highest" | "lowest" | "alphabetical";

function localDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function RecordActions({ record, onDelete }: { record: SavedCalculation; onDelete: (record: SavedCalculation) => void }) {
  return <div className="flex items-center gap-1">
    <Link className="icon-button" href={`/history/${encodeURIComponent(record.id)}`} aria-label={`View ${record.name}`} title="View calculation"><Eye size={16} /></Link>
    <Link className="icon-button" href={`/?edit=${encodeURIComponent(record.id)}`} aria-label={`Edit ${record.name}`} title="Edit calculation"><Pencil size={16} /></Link>
    <Link className="icon-button" href={`/?duplicate=${encodeURIComponent(record.id)}`} aria-label={`Duplicate ${record.name}`} title="Duplicate calculation"><Copy size={16} /></Link>
    <button className="icon-button text-red-400!" onClick={() => onDelete(record)} aria-label={`Delete ${record.name}`} title="Delete calculation"><Trash2 size={16} /></button>
  </div>;
}

export function CalculationHistory() {
  const { settings, records, loading, error, refresh, notify } = useStudio();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleting, setDeleting] = useState<SavedCalculation | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  useEffect(() => {
    if (deleting && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!deleting && dialog.current?.open) dialog.current.close();
  }, [deleting]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const result = records.filter(record => {
      const savedDate = localDate(record.createdAt);
      return (!query || record.name.toLocaleLowerCase().includes(query)) &&
        (filter === "all" || record.input.printingType === filter) &&
        (!dateFrom || savedDate >= dateFrom) && (!dateTo || savedDate <= dateTo);
    });
    result.sort((a, b) => {
      if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "highest") return b.result.finalPrice - a.result.finalPrice;
      if (sort === "lowest") return a.result.finalPrice - b.result.finalPrice;
      if (sort === "alphabetical") return a.name.localeCompare(b.name);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return invalidDateRange ? [] : result;
  }, [records, search, filter, sort, dateFrom, dateTo, invalidDateRange]);

  function clearFilters() {
    setSearch(""); setFilter("all"); setDateFrom(""); setDateTo(""); setSort("newest");
  }

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await deleteCalculation(deleting.id);
      await refresh();
      setDeleting(null);
      notify("Calculation deleted.");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to delete this calculation. Please try again.", "error");
    } finally { setBusy(false); }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Please choose a backup smaller than 10 MB.");
      const backup = parseBackup(await file.text());
      const result = await importCalculations(backup.calculations);
      await refresh();
      notify(`${result.imported} calculation${result.imported === 1 ? "" : "s"} imported.${result.remapped ? ` ${result.remapped} duplicate ID${result.remapped === 1 ? " was" : "s were"} safely assigned new IDs.` : ""}`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "This backup could not be imported. Your existing records are unchanged.", "error");
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function exportData(format: "csv" | "json") {
    try {
      const filename = `fabriqon-history-${new Date().toISOString().slice(0, 10)}.${format}`;
      downloadFile(filename, format === "json" ? serializeBackup(settings, records) : serializeCSV(records), format === "json" ? "application/json" : "text/csv;charset=utf-8");
      notify(`${format.toUpperCase()} backup downloaded.`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Export failed. Please try again.", "error");
    }
  }

  return <>
    <div className="page-heading flex flex-wrap items-start justify-between gap-5">
      <div><p className="eyebrow">YOUR PRICING WORKSPACE</p><h1>Calculation History</h1><p className="muted">Every keychain, every detail. Your saved pricing in one place.</p></div>
      <Link href="/" className="btn btn-primary"><Calculator size={17} /> New calculation</Link>
    </div>

    <div className="card mb-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/70 px-5 py-4">
        <div className="flex items-center gap-3"><span className="section-icon"><History size={19} /></span><div><h2 className="font-semibold">Saved calculations <span className="ml-2 text-sm font-normal text-slate-400">{records.length}</span></h2><p className="mt-0.5 text-xs text-slate-400">Stored privately in this browser. Export a backup to keep a copy.</p></div></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" onClick={() => exportData("csv")} disabled={loading || !records.length}><ArrowDownToLine size={15} /> Export CSV</button>
          <button className="btn btn-secondary" onClick={() => exportData("json")} disabled={loading}><FileJson size={15} /> Export JSON</button>
          <button className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={loading || importing}><ArrowUpFromLine size={15} /> {importing ? "Importing…" : "Import JSON backup"}</button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Choose JSON backup" onChange={event => { void importFile(event.target.files?.[0]); }} />
        </div>
      </div>
      <div className="p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_190px]">
          <div className="relative"><Search size={17} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" /><input aria-label="Search calculations" className="input pl-10!" type="search" placeholder="Search by calculation name…" value={search} onChange={event => setSearch(event.target.value)} /></div>
          <select className="input" aria-label="Filter printing type" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All printing types</option><option value="single">Single Color</option><option value="multi">Multicolor</option></select>
          <select className="input" aria-label="Sort calculations" value={sort} onChange={event => setSort(event.target.value as SortOrder)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="highest">Highest selling price</option><option value="lowest">Lowest selling price</option><option value="alphabetical">Alphabetical</option></select>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <span className="mb-3 hidden items-center gap-1.5 text-xs text-slate-400 sm:flex"><SlidersHorizontal size={14} /> Saved date</span>
          <label className="field min-w-0 flex-1 sm:max-w-44"><span className="label">From</span><input type="date" className="input" aria-label="Saved from date" value={dateFrom} max={dateTo || undefined} onChange={event => setDateFrom(event.target.value)} /></label>
          <label className="field min-w-0 flex-1 sm:max-w-44"><span className="label">To</span><input type="date" className="input" aria-label="Saved to date" value={dateTo} min={dateFrom || undefined} onChange={event => setDateTo(event.target.value)} /></label>
          {(search || filter !== "all" || dateFrom || dateTo || sort !== "newest") && <button className="btn btn-ghost mb-0.5" onClick={clearFilters}><X size={14} /> Clear filters</button>}
          <p className="mb-3 ml-auto text-xs text-slate-400" aria-live="polite">{filtered.length} of {records.length} records</p>
        </div>
        {invalidDateRange && <p role="alert" className="mt-3 text-sm text-red-400">Choose an end date on or after the start date.</p>}
      </div>
    </div>

    {error && <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">{error} <button className="underline" onClick={() => { void refresh().catch(() => {}); }}>Try again</button></div>}
    {loading ? <div className="card p-12 text-center text-slate-400" role="status">Loading your saved calculations…</div> : !filtered.length ? <div className="card empty-state py-16 text-center">
      <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-400">{records.length ? <Search size={25} /> : <History size={25} />}</span>
      <h2 className="mb-2 text-xl font-semibold">{records.length ? "No matching calculations" : "Your next idea starts here"}</h2>
      <p className="muted mx-auto mb-6 max-w-md px-4">{records.length ? "Try a different name, printing type, or date range." : "Save a named calculation from the calculator. Its inputs, pricing rates, and full breakdown will appear here."}</p>
      {records.length ? <button className="btn btn-secondary" onClick={clearFilters}>Clear filters</button> : <Link className="btn btn-primary" href="/">Create a calculation <ChevronRight size={16} /></Link>}
    </div> : <>
      <div className="card hidden overflow-x-auto lg:block">
        <table className="history-table w-full text-left text-sm">
          <thead><tr className="border-b border-slate-700 text-xs text-slate-400"><th className="px-5 py-4 font-medium">Calculation / Saved date</th><th className="px-3 py-4 font-medium">Printing</th><th className="px-3 py-4 font-medium">Filament / Time</th><th className="px-3 py-4 text-right font-medium">Production</th><th className="px-3 py-4 text-right font-medium">Design fee</th><th className="px-3 py-4 text-right font-medium">Selling price</th><th className="px-4 py-4 font-medium">Actions</th></tr></thead>
          <tbody>{filtered.map(record => <tr key={record.id} className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/20">
            <td className="max-w-64 px-5 py-5"><Link className="block truncate font-medium text-slate-100 hover:text-blue-400" href={`/history/${encodeURIComponent(record.id)}`} title={record.name}>{record.name}</Link><span className="mt-1 block text-xs text-slate-400">{dateTime(record.createdAt)}</span></td>
            <td className="px-3 py-5"><span className={`badge ${record.input.printingType === "multi" ? "badge-cyan" : ""}`}>{record.input.printingType === "multi" ? `${record.input.colors.length} colors` : "Single Color"}</span></td>
            <td className="whitespace-nowrap px-3 py-5 tabular-nums"><span>{grams(record.result.totalGrams)}</span><span className="mt-1 block text-xs text-slate-400">{machineTime(record.result.totalMachineMinutes)}</span></td>
            <td className="whitespace-nowrap px-3 py-5 text-right tabular-nums">{money(record.result.productionCost)}</td><td className="whitespace-nowrap px-3 py-5 text-right tabular-nums">{money(record.result.designingFee)}</td><td className="whitespace-nowrap px-3 py-5 text-right font-semibold text-blue-400 tabular-nums">{money(record.result.finalPrice)}</td>
            <td className="px-4 py-5"><RecordActions record={record} onDelete={setDeleting} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-3 lg:hidden">{filtered.map(record => <article className="card p-5" key={record.id}>
        <div className="mb-4 flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/history/${encodeURIComponent(record.id)}`} className="block break-words font-semibold text-slate-100">{record.name}</Link><p className="mt-1 text-xs text-slate-400">{dateTime(record.createdAt)}</p></div><span className="shrink-0 text-lg font-semibold text-blue-400 tabular-nums">{money(record.result.finalPrice)}</span></div>
        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><div><p className="mb-1 text-xs text-slate-400">Printing</p><span>{record.input.printingType === "multi" ? `Multicolor · ${record.input.colors.length} colors` : "Single Color"}</span></div><div><p className="mb-1 text-xs text-slate-400">Filament / Machine time</p><span>{grams(record.result.totalGrams)} · {machineTime(record.result.totalMachineMinutes)}</span></div><div><p className="mb-1 text-xs text-slate-400">Production cost</p>{money(record.result.productionCost)}</div><div><p className="mb-1 text-xs text-slate-400">Design fee</p>{money(record.result.designingFee)}</div></div>
        <div className="flex items-center justify-between border-t border-slate-700 pt-3"><Link className="text-sm text-blue-400" href={`/history/${encodeURIComponent(record.id)}`}>View details</Link><RecordActions record={record} onDelete={setDeleting} /></div>
      </article>)}</div>
    </>}
    <p className="mt-5 text-center text-xs leading-6 text-slate-500">JSON imports add records safely without overwriting existing calculations. Current pricing settings stay unchanged.<br />Browser storage does not sync between devices. Keep regular JSON backups.</p>

    <dialog ref={dialog} className="confirmation-dialog w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-600 bg-slate-800 p-6 text-slate-100 backdrop:bg-slate-950/80" onCancel={event => { if (busy) event.preventDefault(); else setDeleting(null); }} onClose={() => setDeleting(null)} aria-labelledby="delete-heading" aria-describedby="delete-description">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 text-red-400"><Trash2 size={21} /></span>
      <h2 id="delete-heading" className="mb-2 text-xl font-semibold">Delete calculation?</h2>
      <p id="delete-description" className="mb-6 break-words text-sm leading-6 text-slate-400">“{deleting?.name}” will be permanently removed from this browser. Other calculations will stay unchanged.</p>
      <div className="flex justify-end gap-2"><button className="btn btn-secondary" onClick={() => setDeleting(null)} disabled={busy} autoFocus>Cancel</button><button className="btn btn-danger" onClick={() => { void confirmDelete(); }} disabled={busy}>{busy ? "Deleting…" : "Delete calculation"}</button></div>
    </dialog>
  </>;
}
