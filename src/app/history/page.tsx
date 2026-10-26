import type { Metadata } from "next";
import { CalculationHistory } from "@/components/history";
export const metadata: Metadata = { title: "Calculation History" };
export default function HistoryPage() { return <CalculationHistory />; }
