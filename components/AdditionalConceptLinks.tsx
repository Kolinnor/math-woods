import Link from "next/link";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { additionalLinksCopy } from "@/lib/additional-concept-links";
import { uncitedAdditionalConceptLinks } from "@/lib/additional-concept-links-db";

export async function AdditionalConceptLinks({ slugs = [], markdown, language, locale }: { slugs?: string[]; markdown: string; language: string; locale: string }) {
  const links = await uncitedAdditionalConceptLinks(slugs, markdown, language);
  if (!links.length) return null;
  return <section className="additional-concept-links">
    <h2>{additionalLinksCopy(locale).title}</h2>
    <ul>{links.map(link => <li key={link.slug}><Link href={`/concepts/${link.slug}`}><AsyncMarkdownInline markdown={link.title} /></Link></li>)}</ul>
  </section>;
}
