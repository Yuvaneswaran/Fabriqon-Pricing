import { Suspense } from "react";
import { Calculator } from "@/components/calculator";
export default function HomePage() {
  return <Suspense fallback={<div className="loading-state">Loading your workspace…</div>}><Calculator /></Suspense>;
}
