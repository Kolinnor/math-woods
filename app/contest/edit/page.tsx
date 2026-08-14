import { CalendarDays, Eye, House, Save, Trophy } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContestTabs } from "@/components/ContestTabs";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { TipImageField } from "@/components/TipImageField";
import { UserAvatar } from "@/components/UserAvatar";
import { publishContestResultsAction, saveContestAction } from "@/lib/actions/contest-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import {
  DEFAULT_CONTEST_IMAGE_URL,
  DEFAULT_CONTEST_REWARD,
  nextContestStartDateKey
} from "@/lib/problem-contests";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

const defaultCriteria = {
  en: "- Fit to the weekly theme\n- Originality\n- Mathematical interest\n- Clarity\n- Presentation",
  fr: "- Respect du thème de la semaine\n- Originalité\n- Intérêt mathématique\n- Clarté\n- Présentation"
};

const defaultRules = {
  en: "One entry per person. You may edit your problem until Friday at 23:59, Paris time. Admins select one winner and may also award honorable mentions. Translations of the same problem count as one entry.",
  fr: "Une proposition par personne. Vous pouvez modifier votre problème jusqu'au vendredi à 23 h 59, heure de Paris. Les admins choisissent un seul gagnant et peuvent aussi attribuer des mentions honorables. Les traductions d'un même problème comptent comme une seule proposition."
};

export default async function EditContestPage({
  searchParams
}: {
  searchParams: Promise<{ id?: string; saved?: string; results?: string; new?: string }>;
}) {
  const [user, locale, params, contests] = await Promise.all([
    getCurrentUser(),
    getInterfaceLocale(),
    searchParams,
    prisma.problemContest.findMany({
      orderBy: { startDateKey: "desc" },
      include: {
        submissions: {
          orderBy: { submittedAt: "asc" },
          include: {
            user: { select: { username: true, displayName: true, avatarUrl: true, avatarBackground: true } },
            problem: { select: { slug: true, title: true } }
          }
        }
      }
    })
  ]);
  if (!user || !canUseAdminTools(user)) notFound();
  const requestedId = Number(params.id);
  const selected = params.new === "1"
    ? null
    : contests.find((contest) => contest.id === requestedId) ?? contests[0] ?? null;
  const startDateKey = selected?.startDateKey ?? nextContestStartDateKey();

  return (
    <ForestPageLayout
      title={locale === "fr" ? "Modifier le concours" : "Edit weekly contest"}
      heroImage="/art/pine-forest.jpg"
      heroAlt="Ivan Shishkin, Pine Forest"
      description={locale === "fr" ? "Préparez le thème, l'illustration et les résultats." : "Prepare the theme, artwork, and results."}
      workspaceClassName="forest-page-workspace-narrow"
    >
      <ContestTabs active="edit" canEdit locale={locale} />
      <div className="contest-admin-toolbar">
        <div>
          {contests.map((contest) => (
            <Link key={contest.id} href={`/contest/edit?id=${contest.id}`} aria-current={selected?.id === contest.id ? "page" : undefined}>
              {contest.startDateKey} · {contest.titleEn}
            </Link>
          ))}
        </div>
        <div className="contest-admin-toolbar-actions">
          {selected && (
            <>
              <Link
                href={`/contest?preview=${selected.id}` as Route}
                className="button secondary"
                target="_blank"
                rel="noreferrer"
              >
                <Eye size={16} aria-hidden="true" />
                {locale === "fr" ? "Aperçu de la page" : "Preview contest page"}
              </Link>
              <Link
                href={`/contest/preview?contest=${selected.id}&view=home` as Route}
                className="button secondary"
                target="_blank"
                rel="noreferrer"
              >
                <House size={16} aria-hidden="true" />
                {locale === "fr" ? "Aperçu sur l'accueil" : "Preview homepage card"}
              </Link>
            </>
          )}
          <Link href="/contest/edit?new=1" className="button secondary">+ {locale === "fr" ? "Nouveau concours" : "New contest"}</Link>
        </div>
      </div>

      {params.saved && <p className="quality-banner">{locale === "fr" ? "Concours enregistré." : "Contest saved."}</p>}
      {params.results && <p className="quality-banner quality-reviewed">{locale === "fr" ? "Résultats publiés." : "Results published."}</p>}

      <form action={saveContestAction} className="contest-admin-form">
        {selected && <input type="hidden" name="contestId" value={selected.id} />}
        <section>
          <div className="contest-admin-section-title"><CalendarDays size={19} /><h2>{locale === "fr" ? "Semaine et publication" : "Week and publication"}</h2></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2"><span>{locale === "fr" ? "Samedi de début" : "Starting Saturday"}</span><input type="date" name="startDateKey" defaultValue={startDateKey} required /></label>
            <label className="grid gap-2"><span>{locale === "fr" ? "Récompense" : "Prize"}</span><input type="number" name="rewardPoints" min="0" max="10000" defaultValue={selected?.rewardPoints ?? DEFAULT_CONTEST_REWARD} required /></label>
          </div>
          <label className="checkbox-field"><input type="checkbox" name="published" defaultChecked={Boolean(selected?.publishedAt)} /><span><strong>{locale === "fr" ? "Publier ce concours" : "Publish this contest"}</strong></span></label>
        </section>

        <section className="contest-language-columns">
          <fieldset>
            <legend>English</legend>
            <label><span>Title</span><input name="titleEn" defaultValue={selected?.titleEn ?? ""} required /></label>
            <label><span>Short summary</span><textarea name="summaryEn" defaultValue={selected?.summaryEn ?? ""} required /></label>
            <label><span>Full description</span><textarea name="bodyEn" defaultValue={selected?.bodyEn ?? ""} /></label>
            <label><span>Judging criteria</span><textarea name="criteriaEn" defaultValue={selected?.criteriaEn ?? defaultCriteria.en} /></label>
            <label><span>Rules</span><textarea name="rulesEn" defaultValue={selected?.rulesEn ?? defaultRules.en} /></label>
          </fieldset>
          <fieldset>
            <legend>Français</legend>
            <label><span>Titre</span><input name="titleFr" defaultValue={selected?.titleFr ?? ""} required /></label>
            <label><span>Résumé court</span><textarea name="summaryFr" defaultValue={selected?.summaryFr ?? ""} required /></label>
            <label><span>Description complète</span><textarea name="bodyFr" defaultValue={selected?.bodyFr ?? ""} /></label>
            <label><span>Critères de sélection</span><textarea name="criteriaFr" defaultValue={selected?.criteriaFr ?? defaultCriteria.fr} /></label>
            <label><span>Règles</span><textarea name="rulesFr" defaultValue={selected?.rulesFr ?? defaultRules.fr} /></label>
          </fieldset>
        </section>

        <section>
          <div className="contest-admin-section-title"><Eye size={19} /><h2>{locale === "fr" ? "Grande image" : "Large image"}</h2></div>
          <TipImageField
            initialImageUrl={selected?.imageUrl ?? null}
            initialPositionX={selected?.imagePositionX ?? 50}
            initialPositionY={selected?.imagePositionY ?? 50}
            defaultImageUrl={DEFAULT_CONTEST_IMAGE_URL}
            defaultImageLabel="Morning in a Pine Forest"
            saveLabel={locale === "fr" ? "Enregistrez le concours" : "Save the contest"}
          />
        </section>

        <button type="submit"><Save size={17} /> {locale === "fr" ? "Enregistrer" : "Save contest"}</button>
      </form>

      {selected && selected.submissions.length > 0 && (
        <form action={publishContestResultsAction} className="contest-results-form">
          <input type="hidden" name="contestId" value={selected.id} />
          <div className="contest-admin-section-title"><Trophy size={20} /><h2>{locale === "fr" ? "Résultats" : "Results"}</h2></div>
          <p className="muted">{locale === "fr" ? "Choisissez exactement un gagnant. Les mentions honorables sont facultatives." : "Choose exactly one winner. Honorable mentions are optional."}</p>
          <div className="contest-result-list">
            {selected.submissions.map((submission) => (
              <div key={submission.id}>
                <UserAvatar user={submission.user} size="sm" />
                <span><strong>{submission.problem.title}</strong><small>{displayNameForUser(submission.user)}</small></span>
                <label><input type="radio" name="winnerSubmissionId" value={submission.id} defaultChecked={submission.placement === "WINNER"} required /> {locale === "fr" ? "Gagnant" : "Winner"}</label>
                <label><input type="checkbox" name="honorableSubmissionIds" value={submission.id} defaultChecked={submission.placement === "HONORABLE_MENTION"} /> {locale === "fr" ? "Mention" : "Honorable mention"}</label>
              </div>
            ))}
          </div>
          <button type="submit"><Trophy size={17} /> {locale === "fr" ? "Publier les résultats" : "Publish results"}</button>
        </form>
      )}
    </ForestPageLayout>
  );
}
