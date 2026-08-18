import type { Metadata } from "next";
import { JsxGraphStudio } from "@/components/JsxGraphStudio";

export const metadata: Metadata = {
  title: "JSXGraph Studio | Math Woods",
  description: "A visual authoring surface for Math Woods JSXGraph figures."
};

export default function JsxGraphStudioPage() {
  return <JsxGraphStudio />;
}
