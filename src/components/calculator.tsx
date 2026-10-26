"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Calculator as CalculatorIcon, ChevronDown, Clock3, Copy, FilePenLine, History, Info, Layers3, Palette, Plus, RotateCcw, Save, ShieldCheck, Sparkles, Spool, TrendingUp } from "lucide-react";
import { useStudio } from "./studio-provider";
import { calculateQuote, validateQuoteInput } from "@/lib/pricing";
import { saveCalculation } from "@/lib/storage";
import { grams, machineTime, money } from "@/lib/format";
import { createQuoteInput, DESIGN_OPTIONS, type QuoteInput, type QuoteResult, type SavedCalculation, type StudioSettings } from "@/lib/types";

const swatches = ["#3B82F6", "#38BDF8", "#A78BFA", "#F8FAFC", "#F59E0B", "#22C55E", "#FB7185", "#94A3B8"];

export function Calculator() {
  const search = useSearchParams();
  const { loading, records, settings } = useStudio();
  const editId = search.get("edit");
  const duplicateId = search.get("duplicate");
  const id = editId ?? duplicateId;
  const record = id ? records.find((item) => item.id === id) : undefined;
  if (loading) return <div className="loading-state" role="status">Loading your workspace…</div>;
  if (id && !record) return <div className="empty-state"><History size={36} /><h1>Calculation not found</h1><p className="muted">This record may have been removed from this browser.</p><Link href="/history" className="btn btn-primary">Go to Calculation History</Link></div>;
  return <CalculatorWorkspace key={`${id ?? "new"}:${duplicateId ? "copy" : "edit"}`} record={record} duplicate={!!duplicateId} currentSettings={settings} />;
}

function CalculatorWorkspace({ record, duplicate, currentSettings }: { record?: SavedCalculation; duplicate: boolean; currentSettings: StudioSettings }) {
  const router = useRouter();
  const { refresh, notify, error: storageError, draft: currentDraft, saveDraft } = useStudio();
  const draft = !record ? currentDraft : null;
  const [name, setName] = useState(record ? `${record.name}${duplicate ? " (copy)" : ""}`.slice(0, 160) : draft?.name ?? "");
  const [notes, setNotes] = useState(record?.notes ?? draft?.notes ?? "");
  const [input, setInput] = useState<QuoteInput>(() => structuredClone(record?.input ?? draft?.input ?? createQuoteInput()));
  const [historicalRates, setHistoricalRates] = useState<StudioSettings | null>(record ? { ...record.settings } : null);
  const activeSettings = historicalRates ?? currentSettings;
  const [hasCalculated, setHasCalculated] = useState(!!record || !!draft?.hasCalculated);
  const [nameError, setNameError] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const errors = validateQuoteInput(input);
  let result: QuoteResult | null = null;
  let calculationError = "";
  try { result = calculateQuote(input, activeSettings); } catch (reason) { calculationError = reason instanceof Error ? reason.message : "Review your inputs."; }
  const visibleResult = hasCalculated ? result : null;

  useEffect(() => {
    if (!record) saveDraft({ name, notes, input, hasCalculated });
  }, [name, notes, input, hasCalculated, record, saveDraft]);

  function patch(next: Partial<QuoteInput>) {
    setInput((previous) => ({ ...previous, ...next }));
    setHasCalculated(true);
    setFailure("");
  }
  function reset() {
    setName(""); setNotes(""); setInput(createQuoteInput()); setHasCalculated(false); setNameError(""); setFailure("");
    setHistoricalRates(null);
    saveDraft(null);
    if (record) router.replace("/", { scroll: false });
  }
  function loadExample() {
    setName("Example — Custom Keychain"); setNotes(""); setHistoricalRates(null);
    setInput({ ...createQuoteInput(), colors: [{ name: "Model", grams: 20 }], flushGrams: 2, supportGrams: 1, brimGrams: 1, printingHours: 2, designType: "simple" });
    setHasCalculated(true); setNameError(""); setFailure("");
  }
  async function save(asNew = false) {
    if (!name.trim()) { setNameError("Give this calculation a name before saving."); document.getElementById("calculation-name")?.focus(); return; }
    if (!hasCalculated || !result || calculationError) { setFailure(calculationError || "Enter your print details before saving."); return; }
    const now = new Date().toISOString();
    const editing = record && !duplicate && !asNew;
    const saved: SavedCalculation = {
      id: editing ? record.id : crypto.randomUUID(), name: name.trim(), notes: notes.trim(),
      createdAt: editing ? record.createdAt : now, updatedAt: now,
      input: structuredClone(input), settings: { ...activeSettings }, result,
    };
    setBusy(true); setFailure("");
    try {
      await saveCalculation(saved);
      await refresh();
      saveDraft(null);
      notify(editing ? "Calculation updated. Original creation date preserved." : "Calculation saved to your history.");
      router.replace(`/?edit=${encodeURIComponent(saved.id)}`, { scroll: false });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not save your calculation. Please try again.";
      setFailure(message); notify(message, "error");
    } finally { setBusy(false); }
  }
  function numberField(key: keyof QuoteInput, label: string, unit: string, max = 1_000_000, integer = false) {
    const value = input[key] as number;
    return <NumericField key={key} id={key} label={label} value={value} unit={unit} max={max} integer={integer} error={errors[key]} onChange={(next) => patch({ [key]: next })} />;
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> PRECISION IN EVERY PRINT</p><h1>Custom Keychain Pricing<span className="heading-period">.</span></h1><p className="muted intro-copy">Calculate accurate production costs and selling prices for your custom 3D printed keychains.</p></div><div className="page-actions"><button className="btn btn-ghost" onClick={loadExample}><Sparkles size={15} /> Load example</button><button className="btn btn-secondary" onClick={reset}><RotateCcw size={15} /> Reset Calculator</button></div></div>
    {record && <div className="info-banner"><FilePenLine size={19} /><div><strong>{duplicate ? "Duplicating a saved calculation" : "Editing a saved calculation"}</strong><p>{historicalRates ? "Using the original pricing snapshot. Your current defaults stay unchanged." : "Current pricing settings applied to this calculation."}</p></div>{historicalRates && <button className="btn btn-secondary" onClick={() => { setHistoricalRates(null); setHasCalculated(true); }}>Apply current rates</button>}</div>}
    <div className="calculator-layout">
      <div className="calculator-inputs">
        <section className="card identity-card"><div className="card-body"><label className="label" htmlFor="calculation-name"><FilePenLine size={16} /> Calculation Name / Keychain Name <span className="muted label-hint">Required to save</span></label><input id="calculation-name" className="input name-input" value={name} maxLength={160} placeholder="e.g. AGHILA Custom Keychain" aria-invalid={!!nameError} aria-describedby={nameError ? "name-error" : undefined} onChange={(event) => { setName(event.target.value); setNameError(""); }} />{nameError && <p className="field-error" id="name-error" role="alert">{nameError}</p>}</div></section>
        <section className="card"><CardHeading number="01" title="Model & material" subtitle="Start with your filament consumption" icon={<Spool size={19} />} /><div className="card-body form-stack">
          <div className="printing-type-row"><div><span className="label">Printing type</span><p className="muted small">One keychain. Every color accounted for.</p></div><div className="segmented" role="group" aria-label="Printing type"><button aria-pressed={input.printingType === "single"} className={input.printingType === "single" ? "selected" : ""} onClick={() => { if (input.printingType !== "single") patch({ printingType: "single", colors: [input.colors[0]] }); }}><Palette size={16} /> Single Color</button><button aria-pressed={input.printingType === "multi"} className={input.printingType === "multi" ? "selected" : ""} onClick={() => patch({ printingType: "multi", colors: input.colors.length > 1 ? input.colors : [...input.colors, { name: "", grams: 0 }] })}><Layers3 size={16} /> Multicolor</button></div></div>
          {input.printingType === "multi" && <div className="color-count-row"><label className="label" htmlFor="color-count">Number of colors</label><select className="input" id="color-count" value={input.colors.length} onChange={(event) => { const count = Number(event.target.value); patch({ colors: Array.from({ length: count }, (_, index) => input.colors[index] ?? { name: "", grams: 0 }) }); }}>{Array.from({ length: 63 }, (_, index) => index + 2).map((number) => <option key={number} value={number}>{number} colors</option>)}</select></div>}
          <div className="color-fields">{input.colors.map((color, index) => <div key={index} className="color-input-row"><span className="color-swatch" style={{ background: swatches[index % swatches.length] }} /><div className="field color-name"><label className="label" htmlFor={`color-name-${index}`}>Color {index + 1} <span className="muted">optional name</span></label><input id={`color-name-${index}`} className="input" maxLength={80} value={color.name} placeholder={index === 0 ? "e.g. Electric Blue" : `Color ${index + 1} name`} onChange={(event) => patch({ colors: input.colors.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry) })} /></div><NumericField id={`color-grams-${index}`} label={input.printingType === "single" ? "Model filament weight" : `Color ${index + 1} weight`} unit="g" value={color.grams} error={errors[`colors.${index}.grams`]} onChange={(value) => patch({ colors: input.colors.map((entry, i) => i === index ? { ...entry, grams: value } : entry) })} /></div>)}</div>
          <div className="material-total"><span>Total model filament</span><strong>{result ? grams(result.modelGrams) : "—"}</strong><span className="rate-note">RM{activeSettings.filamentRate} / g</span></div>
        </div></section>
        <section className="card"><CardHeading number="02" title="Machine time" subtitle="Your Creality Print 7 estimates" icon={<Clock3 size={19} />} /><div className="card-body form-stack">
          <div className="time-columns"><div><div className="time-heading"><span className="label">Printing time</span><span className="muted small">{money(activeSettings.printingHourlyRate)} / h</span></div><div className="input-grid">{numberField("printingHours", "Printing hours", "hrs", 100000, true)}{numberField("printingMinutes", "Printing minutes", "min", 59, true)}</div></div><div><div className="time-heading"><span className="label">Filament-changing time</span><span className="muted small">{money(activeSettings.changingHourlyRate)} / h</span></div><div className="input-grid">{numberField("changingHours", "Changing hours", "hrs", 100000, true)}{numberField("changingMinutes", "Changing minutes", "min", 59, true)}</div></div></div>
          <p className="input-note"><Info size={15} /><span>Creality Print 7 excludes filament-changing time. Add it separately here.</span></p>
        </div></section>
        <section className="card"><CardHeading number="03" title="Additional filament" subtitle="The small details add up" icon={<Plus size={19} />} trailing={<span className="badge badge-subtle">Optional</span>} /><div className="card-body"><div className="additional-grid">{numberField("flushGrams", "Flushed / poop filament", "g")}{numberField("supportGrams", "Support filament", "g")}{numberField("brimGrams", "Brim filament", "g")}{numberField("primeTowerGrams", "Prime tower filament", "g")}</div><p className="muted small section-footnote">All additional filament uses the same RM{activeSettings.filamentRate} / g rate.</p></div></section>
        <section className="card"><CardHeading number="04" title="Designing fee" subtitle="Added after your production markup" icon={<FilePenLine size={19} />} /><div className="card-body"><div className="design-options" role="group" aria-label="Designing fee">{DESIGN_OPTIONS.map((option) => <button key={option.value} className={`design-option ${input.designType === option.value ? "selected" : ""}`} aria-pressed={input.designType === option.value} onClick={() => patch({ designType: option.value })}><span className="design-radio">{input.designType === option.value && <span />}</span><strong>{option.label}</strong><small>{option.description}</small><span className="design-price">{money(option.fee)}</span></button>)}</div><div className="field notes-field"><label className="label" htmlFor="calculation-notes">Notes <span className="muted">optional</span></label><textarea id="calculation-notes" className="input" rows={2} maxLength={2000} placeholder="Customer details, print settings, or a note for next time…" value={notes} onChange={(event) => setNotes(event.target.value)} /></div></div></section>
        <p className="calculation-method"><ShieldCheck size={16} /> Precision pricing for custom 3D printing. <Link href="/settings">Review your rates <ArrowRight size={13} /></Link></p>
      </div>
      <aside className="calculator-summary" aria-label="Live pricing summary">
        <section className="card price-card"><div className="summary-heading"><div className="section-title"><CalculatorIcon size={18} /><h2>Live pricing</h2></div><span className="live-badge"><span /> Live</span></div>
          <div className="price-hero"><span className="eyebrow">FINAL SELLING PRICE</span><div className="final-price" data-testid="final-price" aria-live="polite"><span className="price-currency">RM</span>{visibleResult ? visibleResult.finalPrice.toFixed(2) : <span className="price-placeholder">0.00</span>}</div><span className="per-keychain">per keychain <span>·</span> rounded up to {money(activeSettings.roundingIncrement)}</span>{!hasCalculated && <p className="muted mt-3 text-xs">Enter your print details to calculate.</p>}</div>
          <div className="summary-totals"><SummaryRow label="Production cost" value={visibleResult?.productionCost} /><SummaryRow label={<>Profit markup <span className="small-tag">{activeSettings.markupPercent}%</span></>} value={visibleResult?.profit} profit /><SummaryRow label="Designing fee" value={visibleResult?.designingFee} /><div className="summary-divider" /><SummaryRow label="Before rounding" value={visibleResult?.unroundedPrice} /><SummaryRow label="Rounding adjustment" value={visibleResult?.roundingAdjustment} prefix="+" subtle /></div>
          <div className="summary-save"><button className="btn btn-primary btn-block" disabled={busy || !hasCalculated || !!storageError || !!calculationError} onClick={() => void save()}><Save size={17} />{busy ? "Saving…" : record && !duplicate ? "Update Existing Calculation" : "Save Calculation"}</button>{record && !duplicate && <button className="btn btn-secondary btn-block" disabled={busy || !hasCalculated || !!storageError || !!calculationError} onClick={() => void save(true)}><Copy size={16} />Save as New Calculation</button>}<span className="save-note"><ShieldCheck size={13} /> Saved privately in this browser</span></div>
          {(failure || (hasCalculated && calculationError)) && <p role="alert" className="field-error summary-error">{failure || calculationError}</p>}
        </section>
        <section className="card breakdown-card"><details open><summary><span className="section-title"><Layers3 size={17} /><h2>Cost breakdown</h2></span><ChevronDown size={17} /></summary><div className="breakdown-body"><p className="breakdown-category">MATERIAL</p><SummaryRow label="Model filament" value={visibleResult?.modelFilamentCost} /><SummaryRow label="Additional filament" value={visibleResult?.additionalFilamentCost} /><div className="breakdown-stat"><span>Total filament</span><strong>{visibleResult ? grams(visibleResult.totalGrams) : "—"}</strong></div><SummaryRow label="Total filament cost" value={visibleResult?.filamentCost} />
          <p className="breakdown-category">MACHINE OPERATION</p><SummaryRow label="Printing time cost" value={visibleResult?.printingCost} /><SummaryRow label="Changing time cost" value={visibleResult?.changingCost} /><div className="breakdown-stat"><span>Combined time</span><strong>{visibleResult ? machineTime(visibleResult.totalMachineMinutes) : "—"}</strong></div><SummaryRow label="Total machine cost" value={visibleResult?.machineCost} />
          <p className="breakdown-category">FIXED COSTS · PER KEYCHAIN</p><SummaryRow label="Keyring + jump ring" value={activeSettings.keyringCost} /><SummaryRow label="Packaging plastic" value={activeSettings.packagingCost} /><SummaryRow label="Labor" value={activeSettings.laborCost} /><SummaryRow label="Total fixed costs" value={visibleResult?.fixedCost} /><div className="summary-divider" /><SummaryRow label="Price before designing" value={visibleResult?.priceBeforeDesign} /><p className="muted breakdown-footnote">Production × (1 + {activeSettings.markupPercent}% markup) + design fee. No quantity tiers. Intermediate values retain full precision.</p></div></details></section>
        <div className="workspace-tip"><TrendingUp size={17} /><p>A price you can stand behind.<span>Know your costs. Protect your margin.</span></p></div>
      </aside>
    </div>
  </>;
}

function CardHeading({ number, title, subtitle, icon, trailing }: { number: string; title: string; subtitle: string; icon: ReactNode; trailing?: ReactNode }) {
  return <div className="card-header"><div className="card-heading"><span className="section-number">{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div><span className="card-heading-trailing">{trailing ?? icon}</span></div>;
}
function NumericField({ id, label, value, unit, error, onChange, max = 1000000, integer = false }: { id: string; label: string; value: number; unit: string; error?: string; onChange: (value: number) => void; max?: number; integer?: boolean }) {
  return <div className="field"><label className="label" htmlFor={id}>{label}</label><div className={`input-with-unit ${error ? "invalid" : ""}`}><input id={id} type="number" className="input" inputMode={integer ? "numeric" : "decimal"} min={0} max={max} step={integer ? 1 : "any"} value={Number.isFinite(value) ? value : ""} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value === "" ? NaN : Number(event.target.value))} /><span>{unit}</span></div>{error && <small className="field-error" id={`${id}-error`}>{error}</small>}</div>;
}
function SummaryRow({ label, value, profit, subtle, prefix = "" }: { label: ReactNode; value?: number; profit?: boolean; subtle?: boolean; prefix?: string }) {
  return <div className={`summary-row ${profit ? "profit-row" : ""} ${subtle ? "subtle-row" : ""}`}><span>{label}</span><strong>{value === undefined ? "—" : `${prefix}${money(value)}`}{profit && <TrendingUp size={13} />}</strong></div>;
}
