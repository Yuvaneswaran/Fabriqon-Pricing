import type { Metadata } from "next";
import { SavedDetail } from "@/components/saved-detail";
export const metadata: Metadata = { title: "Saved Calculation | FABRIQON Studio" };
export default async function SavedCalculationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SavedDetail id={id} />;
}
