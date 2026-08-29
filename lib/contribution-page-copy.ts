import type { InterfaceLocale } from "./i18n/types.ts";

type ContributionPageContent = {
  id?: number;
  title: string;
  requestEyebrow: string;
  requestTitle: string;
  requestIntro: string;
};

type ContributionPageSectionContent = {
  id?: number;
  position: number;
  title: string;
  bodyMarkdown: string;
};

const LEGACY_CONTRIBUTION_BANNER = {
  title: "Do not wait for perfection.",
  bodyMarkdown:
    "A clean problem, a stub concept, a source note, a partial solution, or a correction request can already help."
};

const FRENCH_CONTRIBUTION_TEXT: Record<string, string> = {
  Contribution: "Requêtes",
  Requests: "Requêtes",
  "Requested problems and concepts": "Demandes de problèmes et de concepts",
  "Ask for the pages you would like to see from the problem and concept browsers. Trusted contributors can claim a request, work on it, release it if they stop, and mark it complete when the page or problem exists.":
    "Demandez les pages que vous aimeriez voir depuis les navigateurs de problèmes et de concepts. Les contributeurs de confiance peuvent prendre en charge une demande, y travailler, la libérer s'ils s'arrêtent et la marquer comme terminée lorsque la page ou le problème existe.",
  "Make rough work visible": "Rendre le travail en cours visible",
  "Link generously": "Liez généreusement",
  "Write `[[Concept]]` to link a concept, or `[[Concept|visible text]]` when the sentence needs different wording: the target before `|` is what keeps every language connected to the same idea. Problems use ordinary Markdown links to `/problems/slug`. Linking to a page that does not exist yet is useful, not a mistake: it becomes a requested page, and every link you write appears as a backlink on the other side.":
    "Écrivez `[[Concept]]` pour lier un concept, ou `[[Concept|texte visible]]` quand la phrase demande une autre formulation : la cible placée avant le `|` est ce qui relie toutes les langues à la même idée. Les problèmes utilisent des liens Markdown ordinaires vers `/problems/slug`. Lier une page qui n\'existe pas encore est utile, pas une erreur : elle devient une page demandée, et chaque lien que vous écrivez apparaît comme lien entrant de l\'autre côté.",
  "Mark unfinished material honestly. Use **Needs work**, stub statuses, talk pages, edit summaries, and reports. A rough page with clear uncertainty is useful.":
    "Signalez honnêtement le contenu inachevé. Utilisez le statut **À retravailler**, les ébauches, les pages de discussion, les résumés de modification et les signalements. Une page imparfaite dont les incertitudes sont clairement indiquées reste utile.",
  "Keep barriers low": "Faciliter les premières contributions",
  "Beginners should be able to add examples, ask for clarification, report copied wording, propose a better hint, or create a missing concept.":
    "Les débutants doivent pouvoir ajouter des exemples, demander une clarification, signaler un texte copié, proposer un meilleur indice ou créer un concept manquant.",
  "Write for verification": "Écrire pour permettre la vérification",
  "Cite reliable textbooks, papers, lecture notes, or established reference works when a claim needs support. If the source is uncertain, say so. Uncertainty is useful when it is visible.":
    "Citez des manuels, articles, notes de cours ou ouvrages de référence fiables lorsqu'une affirmation doit être étayée. Si la source est incertaine, indiquez-le. Une incertitude clairement signalée reste utile.",
  "Prefer clarity over completeness": "Privilégier la clarté à l'exhaustivité",
  "A useful first version can be short. Add definitions, examples, counterexamples, solutions, and links when they are ready.":
    "Une première version utile peut être courte. Ajoutez les définitions, exemples, contre-exemples, solutions et liens lorsqu'ils sont prêts.",
  "Make edits accountable": "Documenter les modifications",
  "Use concise edit summaries. For disputed scope, terminology, or sources, discuss the change on the talk page before repeatedly rewriting it.":
    "Utilisez des résumés de modification concis. En cas de désaccord sur le périmètre, la terminologie ou les sources, discutez du changement sur la page de discussion avant de réécrire plusieurs fois le contenu.",
  "Use reports without making them scary": "Utiliser simplement les signalements",
  "Reports are not only for emergencies. They can flag copied wording, questionable origins, wrong statements, spoilers, or pages that need attention.":
    "Les signalements ne servent pas uniquement aux urgences. Ils peuvent indiquer un texte copié, une origine douteuse, une affirmation fausse, un spoiler ou une page qui demande de l'attention."
};

function isLegacyContributionBanner(section: ContributionPageSectionContent) {
  return section.title === LEGACY_CONTRIBUTION_BANNER.title &&
    section.bodyMarkdown.trim() === LEGACY_CONTRIBUTION_BANNER.bodyMarkdown;
}

function localizedContributionText(value: string, locale: InterfaceLocale) {
  if (locale === "fr") return FRENCH_CONTRIBUTION_TEXT[value] ?? value;
  return value === "Contribution" ? "Requests" : value;
}

export function localizeContributionPage(
  page: { content: ContributionPageContent; sections: ContributionPageSectionContent[] },
  locale: InterfaceLocale
) {
  return {
    content: {
      ...page.content,
      title: localizedContributionText(page.content.title, locale),
      requestEyebrow: localizedContributionText(page.content.requestEyebrow, locale),
      requestTitle: localizedContributionText(page.content.requestTitle, locale),
      requestIntro: localizedContributionText(page.content.requestIntro, locale)
    },
    sections: page.sections
      .filter((section) => !isLegacyContributionBanner(section))
      .map((section) => ({
        ...section,
        title: localizedContributionText(section.title, locale),
        bodyMarkdown: localizedContributionText(section.bodyMarkdown, locale)
      }))
  };
}
