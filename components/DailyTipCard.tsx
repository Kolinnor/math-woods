import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { Difficulty } from "@/components/Difficulty";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { tipImageObjectPosition, tipImageUrl } from "@/lib/tip-images";
import Link from "next/link";

type DailyTipCardProps = {
  tip: {
    kind: "TIP" | "METHOD";
    title: string;
    bodyHtml: string;
    imageUrl?: string | null;
    imagePositionX?: number | null;
    imagePositionY?: number | null;
  };
  labels: {
    tip: string;
    method: string;
    practice: string;
  };
  practiceProblem?: {
    slug: string;
    title: string;
    domainLabel: string;
    difficulty: number | null;
    language: string;
  } | null;
  expectedLanguage: string;
};

export function DailyTipCard({ tip, labels, practiceProblem, expectedLanguage }: DailyTipCardProps) {
  return (
    <section className="home-tip-card" data-tour-target="tip">
      <div className="home-tip-image">
        <img
          src={tipImageUrl(tip.imageUrl)}
          alt=""
          style={{ objectPosition: tipImageObjectPosition(tip.imagePositionX, tip.imagePositionY) }}
        />
      </div>
      <div className="home-tip-copy">
        <p className="mw-kicker">{tip.kind === "METHOD" ? labels.method : labels.tip}</p>
        <h2><AsyncMarkdownInline markdown={tip.title} /></h2>
        <MarkdownBlock html={tip.bodyHtml} />
        {practiceProblem && (
          <Link href={`/problems/${practiceProblem.slug}`} className="home-tip-practice">
            <strong>{labels.practice}: <AsyncMarkdownInline markdown={practiceProblem.title} /><ContentLanguageFallback language={practiceProblem.language} expectedLanguage={expectedLanguage} /></strong>
            <span className="home-tip-practice-meta">
              {practiceProblem.domainLabel}
              <Difficulty value={practiceProblem.difficulty} compact />
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
