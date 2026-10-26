"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { DEFAULT_SETTINGS, type QuoteInput, type SavedCalculation, type StudioSettings } from "@/lib/types";
import { getSettings, listCalculations } from "@/lib/storage";

interface StudioContextValue {
  settings: StudioSettings;
  records: SavedCalculation[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  notify: (message: string, type?: "success" | "error") => void;
  draft: CalculatorDraft | null;
  saveDraft: (draft: CalculatorDraft | null) => void;
}
export interface CalculatorDraft { name: string; notes: string; input: QuoteInput; hasCalculated: boolean }
const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StudioSettings>({ ...DEFAULT_SETTINGS });
  const [records, setRecords] = useState<SavedCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CalculatorDraft | null>(null);
  const saveDraft = useCallback((next: CalculatorDraft | null) => setDraft(next), []);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [savedSettings, savedRecords] = await Promise.all([getSettings(), listCalculations()]);
      setSettings(savedSettings ?? { ...DEFAULT_SETTINGS });
      setRecords(savedRecords);
      setError(null);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Browser storage is unavailable.";
      setError(message);
      throw reason;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh).catch(() => {});
    const onFocus = () => { void refresh().catch(() => {}); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  const notify = useCallback((message: string, type: "success" | "error" = "success") => setToast({ message, type }), []);
  return <StudioContext.Provider value={{ settings, records, loading, error, refresh, notify, draft, saveDraft }}>
    {error && <div className="storage-banner" role="alert"><CircleAlert size={18} /><span>Local storage unavailable. Your calculations cannot be saved. {error}</span><button className="btn btn-secondary" onClick={() => void refresh().catch(() => {})}>Retry</button></div>}
    {children}
    {toast && <div className={`toast ${toast.type === "error" ? "toast-error" : ""}`} role={toast.type === "error" ? "alert" : "status"}>
      {toast.type === "success" ? <CheckCircle2 size={20} /> : <CircleAlert size={20} />}<span>{toast.message}</span><button aria-label="Dismiss notification" className="icon-button" onClick={() => setToast(null)}><X size={17} /></button>
    </div>}
  </StudioContext.Provider>;
}
export function useStudio(): StudioContextValue {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider.");
  return context;
}
