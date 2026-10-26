"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, CircleHelp, Clock3, Package, RotateCcw, Save, Settings2, ShieldCheck, SlidersHorizontal, Spool, TrendingUp } from "lucide-react";
import { useStudio } from "@/components/studio-provider";
import { validateSettings } from "@/lib/pricing";
import { saveSettings } from "@/lib/storage";
import { DEFAULT_SETTINGS, type StudioSettings } from "@/lib/types";

type SettingKey = keyof StudioSettings;
type SettingValues = Record<SettingKey, string>;

function settingValues(settings: StudioSettings): SettingValues {
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)])) as SettingValues;
}

const fields: Array<{ key: SettingKey; label: string; unit: string; step: string; description?: string }> = [
  { key: "filamentRate", label: "Filament rate", unit: "RM / gram", step: "0.001", description: "Applies to model, flushed, support, brim, and prime tower filament." },
  { key: "printingHourlyRate", label: "Printing rate", unit: "RM / hour", step: "0.01" },
  { key: "keyringCost", label: "Keyring + jump ring", unit: "RM / keychain", step: "0.01" },
  { key: "packagingCost", label: "Packaging plastic", unit: "RM / keychain", step: "0.01" },
  { key: "laborCost", label: "Labor", unit: "RM / keychain", step: "0.01" },
  { key: "markupPercent", label: "Profit markup", unit: "% of production cost", step: "0.1", description: "Markup is applied to production cost, before the designing fee." },
  { key: "roundingIncrement", label: "Upward rounding increment", unit: "RM", step: "0.01", description: "The final price always rounds upward to a multiple of this amount." },
];

export function Settings() {
  const studio = useStudio();
  if (studio.loading) return <div className="card card-body" role="status">Loading your pricing settings…</div>;
  return <SettingsForm key={JSON.stringify(studio.settings)} initial={studio.settings} />;
}

function SettingsForm({ initial }: { initial: StudioSettings }) {
  const { refresh, notify } = useStudio();
  const [values, setValues] = useState<SettingValues>(() => settingValues(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const restoreDialog = useRef<HTMLDialogElement>(null);
  const changed = JSON.stringify(values) !== JSON.stringify(settingValues(initial));

  function renderField(key: SettingKey) {
    const field = fields.find((item) => item.key === key)!;
    const error = errors[key];
    return (
      <div className="field" key={key}>
        <label className="label" htmlFor={`setting-${key}`}>{field.label} <span className="muted">{field.unit}</span></label>
        <input
          className="input" id={`setting-${key}`} name={key} type="number" inputMode="decimal"
          min={key === "roundingIncrement" ? "0.000001" : "0"}
          max={key === "markupPercent" ? "10000" : "1000000"}
          step="any" value={values[key]} required disabled={busy}
          aria-invalid={!!error}
          aria-describedby={error ? `error-${key}` : field.description ? `help-${key}` : undefined}
          onChange={(event) => {
            setValues((previous) => ({ ...previous, [key]: event.target.value }));
            setErrors((previous) => ({ ...previous, [key]: "" }));
            setFailure("");
          }}
        />
        {error ? <span className="field-error" id={`error-${key}`} role="alert">{error}</span> : field.description ? <small className="muted" id={`help-${key}`}>{field.description}</small> : null}
      </div>
    );
  }

  async function persist(settings: StudioSettings, restored = false) {
    setBusy(true);
    setFailure("");
    try {
      await saveSettings(settings);
      await refresh();
      setValues(settingValues(settings));
      restoreDialog.current?.close();
      notify(restored ? "Official default pricing restored." : "Pricing settings saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your settings. Please try again.";
      setFailure(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim() === "" ? NaN : Number(value)])) as unknown as StudioSettings;
    const nextErrors = validateSettings(next);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setFailure("Review the highlighted settings before saving.");
      return;
    }
    void persist(next);
  }

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">YOUR WORKSPACE</p><h1>Pricing Settings</h1><p className="muted">Fine-tune your rates. Keep every calculation consistent.</p></div>
        <span className="badge"><Settings2 size={14} aria-hidden="true" /> Malaysian Ringgit · RM</span>
      </div>
      <div className="info-banner"><ShieldCheck size={20} aria-hidden="true" /><p>Saved calculations keep their original pricing rates. Changes apply to new calculations and can be explicitly applied when editing a saved record.</p></div>
      <form onSubmit={submit} className="settings-form">
        <div className="settings-grid">
          <section className="card" aria-labelledby="material-rates-title">
            <div className="card-header"><div className="section-title"><Spool size={20} aria-hidden="true" /><h2 id="material-rates-title">Material & machine</h2></div><span className="eyebrow">VARIABLE COSTS</span></div>
            <div className="card-body form-stack">{renderField("filamentRate")}{renderField("printingHourlyRate")}<p className="muted small"><Clock3 size={15} aria-hidden="true" /> Machine cost is based on the printing time you enter.</p></div>
          </section>
          <section className="card" aria-labelledby="fixed-costs-title">
            <div className="card-header"><div className="section-title"><Package size={20} aria-hidden="true" /><h2 id="fixed-costs-title">Fixed production costs</h2></div><span className="eyebrow">PER KEYCHAIN</span></div>
            <div className="card-body form-stack"><div className="input-grid">{renderField("keyringCost")}{renderField("packagingCost")}</div>{renderField("laborCost")}<p className="muted small">Each cost is applied once to one individual keychain.</p></div>
          </section>
          <section className="card" aria-labelledby="profit-title">
            <div className="card-header"><div className="section-title"><TrendingUp size={20} aria-hidden="true" /><h2 id="profit-title">Profit & rounding</h2></div><span className="eyebrow">SELLING PRICE</span></div>
            <div className="card-body form-stack"><div className="input-grid">{renderField("markupPercent")}{renderField("roundingIncrement")}</div><div className="formula-note"><SlidersHorizontal size={17} aria-hidden="true" /><p>Final price = round up ((production cost × (1 + markup)) + designing fee)</p></div></div>
          </section>
          <section className="card" aria-labelledby="defaults-title">
            <div className="card-header"><div className="section-title"><CircleHelp size={20} aria-hidden="true" /><h2 id="defaults-title">Official pricing defaults</h2></div></div>
            <div className="card-body form-stack"><div className="settings-reference"><p><span>Filament</span><strong>RM0.085 / g</strong></p><p><span>Printing</span><strong>RM3.00 / h</strong></p><p><span>Fixed costs combined</span><strong>RM0.68 / keychain</strong></p><p><span>Markup & rounding</span><strong>50% · upward RM0.50</strong></p><p><span>Design fees</span><strong>RM0 / RM5 / RM10</strong></p></div><p className="muted small">Designing fees are added after profit. There are no quantity tiers or volume discounts.</p></div>
          </section>
        </div>
        {failure && <p className="error-banner" role="alert">{failure}</p>}
        <div className="settings-footer">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => restoreDialog.current?.showModal()}><RotateCcw size={16} aria-hidden="true" /> Restore Defaults</button>
          <div className="settings-save-group"><span className="muted small" role="status">{changed ? "You have unsaved changes" : <><Check size={15} aria-hidden="true" /> Settings are up to date</>}</span><button type="submit" className="btn btn-primary" disabled={busy}><Save size={17} aria-hidden="true" />{busy ? "Saving…" : "Save Settings"}</button></div>
        </div>
      </form>
      <dialog ref={restoreDialog} className="confirm-dialog" aria-labelledby="restore-title">
        <h2 id="restore-title">Restore official defaults?</h2>
        <p className="muted">This replaces your current pricing settings with the official FABRIQON rates. Your saved calculations and their historical prices will stay unchanged.</p>
        <div className="dialog-actions"><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => restoreDialog.current?.close()}>Cancel</button><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void persist({ ...DEFAULT_SETTINGS }, true)}>{busy ? "Restoring…" : "Restore Defaults"}</button></div>
      </dialog>
    </>
  );
}
