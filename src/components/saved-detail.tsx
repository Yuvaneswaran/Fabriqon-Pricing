"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Copy, FileText, Layers3, Pencil, ShieldCheck, Timer } from "lucide-react";
import { useStudio } from "@/components/studio-provider";
import { dateTime, grams, machineTime, money } from "@/lib/format";
import { DESIGN_OPTIONS } from "@/lib/types";

function DetailRow({ label, value, strong = false, positive = false }: { label: string; value: string; strong?: boolean; positive?: boolean }) {
  return <div className={`flex items-start justify-between gap-4 py-2.5 text-sm ${strong ? "border-t border-slate-600/70 font-semibold" : ""}`}><dt className={positive ? "text-green-400" : "text-slate-400"}>{label}</dt><dd className={`shrink-0 text-right tabular-nums ${positive ? "text-green-400" : "text-slate-100"}`}>{value}</dd></div>;
}

export function SavedDetail({ id }: { id: string }) {
  const { records, loading, error, refresh } = useStudio();
  const record = records.find(item => item.id === id);
  if (loading) return <div role="status" className="card p-12 text-center text-slate-400">Loading saved calculation…</div>;
  if (error) return <div role="alert" className="card p-8"><h1 className="mb-3 text-xl font-semibold">Could not load this calculation</h1><p className="mb-4 text-slate-400">{error}</p><button className="btn btn-secondary" onClick={() => { void refresh().catch(() => {}); }}>Try again</button></div>;
  if (!record) return <div className="card empty-state p-12 text-center"><FileText className="mx-auto mb-4 text-slate-500" size={36} /><h1 className="mb-2 text-xl font-semibold">Calculation not found</h1><p className="muted mb-6">It may have been deleted, or saved in a different browser.</p><Link href="/history" className="btn btn-primary"><ArrowLeft size={16} /> Back to history</Link></div>;

  const { input, settings, result } = record;
  const design = DESIGN_OPTIONS.find(option => option.value === input.designType);
  const rateRows: [string, string][] = [
    ["Filament / gram", `RM ${settings.filamentRate.toLocaleString("en-MY", { minimumFractionDigits: 3, maximumFractionDigits: 10 })}`],
    ["Printing / hour", money(settings.printingHourlyRate)],
    ["Filament-changing / hour", money(settings.changingHourlyRate)],
    ["Keyring + jump ring", money(settings.keyringCost)],
    ["Packaging plastic", money(settings.packagingCost)],
    ["Labor", money(settings.laborCost)],
    ["Profit markup", `${settings.markupPercent}%`],
    ["Rounding increment", money(settings.roundingIncrement)],
  ];
  return <>
    <Link href="/history" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-100"><ArrowLeft size={16} /> Back to calculation history</Link>
    <div className="page-heading flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0"><p className="eyebrow">SAVED CALCULATION</p><h1 className="break-words">{record.name}</h1><p className="muted">Created {dateTime(record.createdAt)}<span className="mx-2 text-slate-600">·</span>Updated {dateTime(record.updatedAt)}</p></div>
      <div className="flex flex-wrap gap-2"><Link href={`/?duplicate=${encodeURIComponent(record.id)}`} className="btn btn-secondary"><Copy size={16} /> Duplicate</Link><Link href={`/?edit=${encodeURIComponent(record.id)}`} className="btn btn-primary"><Pencil size={16} /> Edit calculation</Link></div>
    </div>
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-400/20 bg-blue-500/5 px-4 py-3 text-sm text-slate-300"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-blue-400" /><p>This is the original saved result. Its pricing settings are preserved and remain independent of your current defaults.</p></div>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
      <div className="min-w-0 space-y-5">
        <section className="card">
          <div className="card-header"><span className="section-icon"><Layers3 size={18} /></span><div><h2>Printing details</h2><p className="muted text-xs">Original production inputs for one keychain</p></div><span className="badge ml-auto">{input.printingType === "multi" ? "Multicolor" : "Single Color"}</span></div>
          <div className="card-body">
            <div className="mb-5 grid gap-3 sm:grid-cols-2">{input.colors.map((color, index) => <div key={index} className="flex items-center justify-between gap-3 rounded-xl border border-slate-600/60 bg-slate-900/30 px-4 py-3"><div className="min-w-0"><p className="text-xs text-slate-400">Color {index + 1}</p><p className="mt-1 truncate text-sm font-medium" title={color.name}>{color.name || `Unnamed color ${index + 1}`}</p></div><span className="shrink-0 text-sm tabular-nums">{grams(color.grams)}</span></div>)}</div>
            <dl><DetailRow label="Number of colors" value={String(input.colors.length)} /><DetailRow label="Total model filament" value={`${grams(result.modelGrams)}`} strong /></dl>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Additional filament</h3>
            <dl><DetailRow label="Flushed / poop filament" value={`${grams(input.flushGrams)}`} /><DetailRow label="Support filament" value={`${grams(input.supportGrams)}`} /><DetailRow label="Brim filament" value={`${grams(input.brimGrams)}`} /><DetailRow label="Prime tower filament" value={`${grams(input.primeTowerGrams)}`} /><DetailRow label="Total additional filament" value={`${grams(result.additionalGrams)}`} strong /><DetailRow label="Total filament consumption" value={`${grams(result.totalGrams)}`} strong /></dl>
          </div>
        </section>
        <section className="card">
          <div className="card-header"><span className="section-icon"><Timer size={18} /></span><div><h2>Machine time & design</h2><p className="muted text-xs">Printing and filament-changing time are charged separately</p></div></div>
          <div className="card-body"><dl><DetailRow label="Printing time" value={machineTime(input.printingHours * 60 + input.printingMinutes)} /><DetailRow label="Filament-changing time" value={machineTime(input.changingHours * 60 + input.changingMinutes)} /><DetailRow label="Combined machine time" value={machineTime(result.totalMachineMinutes)} strong /><DetailRow label="Designing option" value={design?.label ?? input.designType} /><DetailRow label="Designing fee" value={money(result.designingFee)} /></dl>
          {record.notes && <div className="mt-5 border-t border-slate-600/60 pt-4"><h3 className="mb-2 text-sm font-semibold">Notes</h3><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{record.notes}</p></div>}</div>
        </section>
        <section className="card">
          <div className="card-header"><span className="section-icon"><ShieldCheck size={18} /></span><div><h2>Historical pricing settings</h2><p className="muted text-xs">The exact rates used when this calculation was saved</p></div></div>
          <div className="card-body"><dl>{rateRows.map(([label, value]) => <DetailRow key={label} label={label} value={value} />)}</dl><p className="mt-4 break-all text-xs text-slate-500">Calculation ID: {record.id}<br />Formula: {result.formulaVersion}</p></div>
        </section>
      </div>
      <aside className="card min-w-0 lg:sticky lg:top-24">
        <div className="border-b border-slate-600/70 px-6 py-6"><div className="mb-3 flex items-center justify-between gap-3"><p className="eyebrow">FINAL SELLING PRICE</p><CheckCircle2 size={18} className="text-green-400" /></div><p className="font-display text-5xl font-semibold tracking-tight text-blue-400 tabular-nums">{money(result.finalPrice)}</p><p className="mt-2 text-xs text-slate-400">Per keychain · rounded upward to {money(settings.roundingIncrement)}</p></div>
        <div className="px-6 py-4"><h2 className="mb-2 text-base font-semibold">Original pricing breakdown</h2><dl>
          <DetailRow label="Model filament cost" value={money(result.modelFilamentCost)} />
          <DetailRow label="Additional filament cost" value={money(result.additionalFilamentCost)} />
          <DetailRow label={`Total filament · ${grams(result.totalGrams)}`} value={money(result.filamentCost)} strong />
          <DetailRow label="Printing time cost" value={money(result.printingCost)} />
          <DetailRow label="Filament-changing time cost" value={money(result.changingCost)} />
          <DetailRow label={`Total machine · ${machineTime(result.totalMachineMinutes)}`} value={money(result.machineCost)} strong />
          <DetailRow label="Keyring + jump ring" value={money(settings.keyringCost)} />
          <DetailRow label="Packaging plastic" value={money(settings.packagingCost)} />
          <DetailRow label="Labor" value={money(settings.laborCost)} />
          <DetailRow label="Fixed production cost" value={money(result.fixedCost)} strong />
          <DetailRow label="Total production cost" value={money(result.productionCost)} strong />
          <DetailRow label={`Profit markup · ${settings.markupPercent}%`} value={money(result.profit)} positive />
          <DetailRow label="Price before designing" value={money(result.priceBeforeDesign)} strong />
          <DetailRow label="Designing fee" value={money(result.designingFee)} />
          <DetailRow label="Unrounded selling price" value={money(result.unroundedPrice)} strong />
          <DetailRow label="Upward rounding adjustment" value={`+ ${money(result.roundingAdjustment)}`} />
          <DetailRow label="Final selling price" value={money(result.finalPrice)} strong />
        </dl><p className="mt-4 text-xs leading-5 text-slate-500">Intermediate calculations retain their precision. Amounts above are displayed to two decimal places.</p></div>
      </aside>
    </div>
  </>;
}
