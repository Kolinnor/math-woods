import { ConceptStatus, ProblemStatus, QualityStatus } from "@prisma/client";
import Link from "next/link";
import { BookOpen, Languages, ListChecks } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ContributionTasksTabs } from "@/components/ContributionTasksTabs";
import { getCurrentUser } from "@/lib/auth";
import {
  hasExamplesSection,
  translationGroupCount,
  translationSourcesMissingLanguage,
  type ContributionTaskKey
} from "@/lib/contribution-tasks";
import { prisma } from "@/lib/db";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { canUseModerationTools } from "@/lib/permissions";
import { siteImprovementCopy } from "@/lib/site-improvements";

export const dynamic = "force-dynamic";

type Task = {
  key: ContributionTaskKey;
  title: string;
  description: string;
  remaining: number;
  total: number;
};

function TaskCard({ task, buttonLabel, completeLabel }: { task: Task; buttonLabel: string; completeLabel: string }) {
  const completed = Math.max(0, task.total - task.remaining);
  const progress = task.total > 0 ? Math.round((completed / task.total) * 100) : 100;

  return (
    <article className={`contribution-task-card${task.remaining === 0 ? " contribution-task-complete" : ""}`}>
      <header>
        <div>
          <h3>{task.title}</h3>
          <p>{task.description}</p>
        </div>
        <strong className="contribution-task-count">
          {task.remaining} <span>/ {task.total}</span>
        </strong>
      </header>
      <div className="contribution-task-progress" aria-label={`${progress}% complete`}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <footer>
        <span>{task.remaining === 0 ? completeLabel : `${progress}%`}</span>
        {task.remaining > 0 && (
          <a href={`/contributing/tasks/random?task=${task.key}`} className="button secondary">
            {buttonLabel}
          </a>
        )}
      </footer>
    </article>
  );
}

export default async function ContributionTasksPage() {
  const [t, interfaceLocale, user] = await Promise.all([
    getTranslations(),
    getInterfaceLocale(),
    getCurrentUser()
  ]);
  const copy = t.contributionTasks;
  const improvementCopy = siteImprovementCopy(interfaceLocale);
  const [concepts, problems] = await Promise.all([
    prisma.concept.findMany({
      where: { status: { not: ConceptStatus.MISSING } },
      select: {
        bodyMarkdown: true,
        language: true,
        needsReviewAfterEdit: true,
        slug: true,
        status: true,
        translationGroupId: true,
        _count: { select: { practiceExercises: true, references: true } }
      }
    }),
    prisma.problem.findMany({
      where: { listed: true, status: ProblemStatus.PUBLISHED },
      select: {
        isExercise: true,
        language: true,
        qualityStatus: true,
        slug: true,
        translationGroupId: true,
        _count: { select: { conceptExerciseLinks: true } }
      }
    })
  ]);

  const conceptTotal = concepts.length;
  const problemTotal = problems.length;
  const exerciseTotal = problems.filter((problem) => problem.isExercise).length;
  const conceptGroupTotal = translationGroupCount(concepts);
  const problemGroupTotal = translationGroupCount(problems);
  const problemsMissingFr = translationSourcesMissingLanguage(problems, "fr");
  const problemsMissingEn = translationSourcesMissingLanguage(problems, "en");
  const conceptsMissingFr = translationSourcesMissingLanguage(concepts, "fr");
  const conceptsMissingEn = translationSourcesMissingLanguage(concepts, "en");

  const conceptTasks: Task[] = [
    { key: "stub-concepts", title: copy.tasks.stubConcepts.title, description: copy.tasks.stubConcepts.description, remaining: concepts.filter((concept) => concept.status === ConceptStatus.STUB).length, total: conceptTotal },
    { key: "usable-concepts", title: copy.tasks.usableConcepts.title, description: copy.tasks.usableConcepts.description, remaining: concepts.filter((concept) => concept.status === ConceptStatus.USABLE).length, total: conceptTotal },
    { key: "edited-concepts", title: copy.tasks.editedConcepts.title, description: copy.tasks.editedConcepts.description, remaining: concepts.filter((concept) => concept.needsReviewAfterEdit).length, total: conceptTotal },
    { key: "concepts-without-examples", title: copy.tasks.conceptsWithoutExamples.title, description: copy.tasks.conceptsWithoutExamples.description, remaining: concepts.filter((concept) => !hasExamplesSection(concept.bodyMarkdown)).length, total: conceptTotal },
    { key: "concepts-without-exercises", title: copy.tasks.conceptsWithoutExercises.title, description: copy.tasks.conceptsWithoutExercises.description, remaining: concepts.filter((concept) => concept._count.practiceExercises === 0).length, total: conceptTotal },
    { key: "concepts-without-references", title: copy.tasks.conceptsWithoutReferences.title, description: copy.tasks.conceptsWithoutReferences.description, remaining: concepts.filter((concept) => concept._count.references === 0).length, total: conceptTotal }
  ];
  const problemTasks: Task[] = [
    { key: "unreviewed-problems", title: copy.tasks.unreviewedProblems.title, description: copy.tasks.unreviewedProblems.description, remaining: problems.filter((problem) => problem.qualityStatus === QualityStatus.UNREVIEWED).length, total: problemTotal },
    { key: "needs-work-problems", title: copy.tasks.needsWorkProblems.title, description: copy.tasks.needsWorkProblems.description, remaining: problems.filter((problem) => problem.qualityStatus === QualityStatus.NEEDS_WORK).length, total: problemTotal },
    { key: "exercises-without-concepts", title: copy.tasks.exercisesWithoutConcepts.title, description: copy.tasks.exercisesWithoutConcepts.description, remaining: problems.filter((problem) => problem.isExercise && problem._count.conceptExerciseLinks === 0).length, total: exerciseTotal }
  ];
  const translationTasks: Task[] = [
    { key: "problems-missing-fr", title: copy.tasks.problemsMissingFr.title, description: copy.tasks.problemsMissingFr.description, remaining: problemsMissingFr.length, total: problemGroupTotal },
    { key: "problems-missing-en", title: copy.tasks.problemsMissingEn.title, description: copy.tasks.problemsMissingEn.description, remaining: problemsMissingEn.length, total: problemGroupTotal },
    { key: "concepts-missing-fr", title: copy.tasks.conceptsMissingFr.title, description: copy.tasks.conceptsMissingFr.description, remaining: conceptsMissingFr.length, total: conceptGroupTotal },
    { key: "concepts-missing-en", title: copy.tasks.conceptsMissingEn.title, description: copy.tasks.conceptsMissingEn.description, remaining: conceptsMissingEn.length, total: conceptGroupTotal }
  ];
  const sections = [
    { title: copy.concepts, icon: BookOpen, tasks: conceptTasks },
    { title: copy.problems, icon: ListChecks, tasks: problemTasks },
    { title: copy.translations, icon: Languages, tasks: translationTasks }
  ];
  const remaining = sections.flatMap((section) => section.tasks).reduce((sum, task) => sum + task.remaining, 0);

  return (
    <ForestPageLayout
      className="contribution-tasks-page"
      title={copy.title}
      description={copy.description}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      meta={<p>{copy.remaining(remaining)}</p>}
      actions={<Link href="/contributing" className="button secondary">{copy.back}</Link>}
    >
      <ContributionTasksTabs
        current="content"
        labels={{ content: improvementCopy.tabTasks, site: improvementCopy.tabImprovements }}
        showSiteImprovements={Boolean(user && canUseModerationTools(user))}
      />
      <div className="contribution-task-sections">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <section key={section.title} className="contribution-task-section">
              <header className="contribution-task-section-heading">
                <Icon size={20} aria-hidden="true" />
                <h2>{section.title}</h2>
              </header>
              <div className="contribution-task-grid">
                {section.tasks.map((task) => <TaskCard key={task.key} task={task} buttonLabel={copy.openRandom} completeLabel={copy.complete} />)}
              </div>
            </section>
          );
        })}
      </div>
      <p className="contribution-task-note">{copy.examplesNote}</p>
    </ForestPageLayout>
  );
}
