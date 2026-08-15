import type { Metadata } from "next";
import { MathWoodsTour } from "@/components/MathWoodsTour";
import { getInterfaceLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "What is Math Woods? - Math Woods",
  description: "A guided tour of Math Woods and its main features."
};

export default async function MathWoodsTourPage() {
  const locale = await getInterfaceLocale();
  return <MathWoodsTour initialLocale={locale} />;
}
