import { prisma } from "@/lib/db";
import {
  canUseStoredConceptContributorGuide,
  type StoredConceptContributorGuide
} from "@/lib/concept-contributor-guide-locale";
import type { InterfaceLocale } from "@/lib/i18n/types";
import { renderMarkdown } from "@/lib/markdown";

export type ConceptContributorGuideContent = {
  language: InterfaceLocale;
  title: string;
  description: string;
  bodyMarkdown: string;
};

export const DEFAULT_CONCEPT_CONTRIBUTOR_GUIDES: Record<InterfaceLocale, ConceptContributorGuideContent> = {
  en: {
    language: "en",
    title: "Writing a concept",
    description: "A concise guide to writing useful concept pages on Math Woods.",
    bodyMarkdown: `## What a concept page is for

A concept page should help readers quickly understand and use an idea they encounter in a problem. It is a reference page, not a complete lecture or textbook chapter.

## Suggested structure

### Situate the idea when useful

Begin with one or two intuitive sentences when they genuinely help the reader understand what the concept describes or why it matters. This section is optional: do not add a vague intuitive definition merely to fill the template.

### Give the precise definition

State the formal definition, or the precise statement when the page is about a theorem. Name the hypotheses and conventions needed to understand it, and link the prerequisite concepts.

### Add a few examples

One to three carefully chosen examples are usually enough. Add a counterexample when it clarifies an important boundary of the definition.

## Adapt the structure to the page type

- **Definition:** intuition when useful, formal definition, then examples.
- **Theorem:** interpretation, precise statement, then examples or applications. Put a substantial proof in a linked exercise.
- **Notation:** meaning, precise convention, then short examples of use.
- **Intuitive notion:** intuition and examples first. Add or link a formal definition only when it is relevant.

## Keep technical work in exercises

Long proofs, detailed calculations, constructions, and substantial derivations should normally become linked exercises. The concept page can state the result, explain what it means, and point readers toward those exercises.

## Links, sources, and page status

Use the editor's **Link** tool to connect prerequisites and closely related concepts. Cite a textbook, paper, or lecture notes when a definition, convention, or attribution needs support. If the page is still partial, publish it with an honest status rather than padding it with uncertain material.

## Before publishing

- Is the mathematical statement precise?
- Does the intuitive introduction add real understanding?
- Are the examples short and informative?
- Are prerequisites and related concepts linked?
- Has technical material been moved to exercises where appropriate?
- Is the page concise enough to consult while solving a problem?`
  },
  fr: {
    language: "fr",
    title: "Écrire un concept",
    description: "Un guide concis pour rédiger des pages de concept utiles sur Math Woods.",
    bodyMarkdown: `## À quoi sert une page de concept ?

Une page de concept doit permettre de comprendre et d'utiliser rapidement une notion rencontrée dans un problème. C'est une page de référence, pas un cours complet ni un chapitre de manuel.

## Structure conseillée

### Situer l'idée lorsque c'est utile

Commencez par une ou deux phrases intuitives lorsqu'elles aident réellement à comprendre ce que décrit le concept ou pourquoi il est important. Cette partie est facultative : n'ajoutez pas une définition intuitive vague uniquement pour remplir le modèle.

### Donner la définition précise

Énoncez la définition formelle, ou l'énoncé précis lorsque la page porte sur un théorème. Indiquez les hypothèses et conventions nécessaires, et liez les concepts prérequis.

### Ajouter quelques exemples

Un à trois exemples bien choisis suffisent généralement. Ajoutez un contre-exemple lorsqu'il éclaire une limite importante de la définition.

## Adapter la structure au type de page

- **Définition :** intuition lorsque c'est utile, définition formelle, puis exemples.
- **Théorème :** interprétation, énoncé précis, puis exemples ou applications. Placez une démonstration substantielle dans un exercice lié.
- **Notation :** signification, convention précise, puis courts exemples d'utilisation.
- **Notion intuitive :** intuition et exemples d'abord. Ajoutez ou liez une définition formelle seulement lorsqu'elle est pertinente.

## Garder le travail technique dans les exercices

Les longues démonstrations, les calculs détaillés, les constructions et les développements substantiels doivent généralement devenir des exercices liés. La page de concept peut énoncer le résultat, expliquer son sens et orienter le lecteur vers ces exercices.

## Liens, sources et statut de la page

Utilisez l'outil **Lien** de l'éditeur pour relier les prérequis et les concepts proches. Citez un manuel, un article ou des notes de cours lorsqu'une définition, une convention ou une attribution demande une source. Si la page reste partielle, publiez-la avec un statut honnête plutôt que de la compléter avec du contenu incertain.

## Avant de publier

- L'énoncé mathématique est-il précis ?
- L'introduction intuitive apporte-t-elle une compréhension réelle ?
- Les exemples sont-ils courts et instructifs ?
- Les prérequis et concepts proches sont-ils liés ?
- Le contenu technique a-t-il été placé dans des exercices lorsque c'est pertinent ?
- La page reste-t-elle assez concise pour être consultée pendant la résolution d'un problème ?`
  }
};

export function conceptContributorGuideForLocale(
  stored: StoredConceptContributorGuide | null | undefined,
  locale: InterfaceLocale
): ConceptContributorGuideContent {
  if (stored && canUseStoredConceptContributorGuide(stored, locale)) {
    return {
      language: locale,
      title: stored.title,
      description: stored.description,
      bodyMarkdown: stored.bodyMarkdown
    };
  }

  return DEFAULT_CONCEPT_CONTRIBUTOR_GUIDES[locale];
}

export async function loadConceptContributorGuide(locale: InterfaceLocale) {
  const stored = await prisma.conceptContributorGuideContent.findUnique({ where: { language: locale } });
  return conceptContributorGuideForLocale(stored, locale);
}

export async function loadRenderedConceptContributorGuide(locale: InterfaceLocale) {
  const content = await loadConceptContributorGuide(locale);
  return {
    ...content,
    bodyHtml: await renderMarkdown(content.bodyMarkdown)
  };
}
