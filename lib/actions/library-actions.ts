"use server";
import { submittedPortraitCrop } from "@/lib/portrait";
import { submittedMathematicianRelated } from "@/lib/mathematician-related";
import { syncMathematicianRelated } from "@/lib/mathematician-related-db";

import {
  HistoryEra,
  HistoryMilestoneType,
  LibraryReferenceType,
  LibraryStatus,
  NotificationType,
  Prisma,
  Role
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireAdmin, requireVerifiedUser } from "@/lib/auth";
import { CONTENT_LIMITS, boundedText, optionalBoundedText, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { normalizeReferenceDedupeKey } from "@/lib/library";
import { renderMarkdown } from "@/lib/markdown";
import { createNotification } from "@/lib/notifications";
import {
  canArchiveLibraryEntry,
  canCreateLibraryEntry,
  canEditLibraryDraft,
  canEditLibraryReference,
  canReviewLibraryEntry
} from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { uniqueSlug } from "@/lib/unique-slug";
import { displayNameForUser } from "@/lib/user-display";
import { citationUrl } from "@/lib/problem-citations";
import { readReferenceBibliography, validateReferenceWork } from "@/lib/reference-editions";
import { requireReadableReferenceTitle } from "@/lib/reference-title";
import { parseMathematicianAliases } from "@/lib/mathematician-names";

type LibraryEntity = "mathematician" | "reference" | "milestone";

export async function proposeLibraryReferenceAction(_state: { message: string; success: boolean }, formData: FormData) {
  const user = await requireVerifiedUser();
  const fr = formData.get("language") === "fr";
  try {
    await assertRateLimit(`reference-proposal:${user.id}`, 8, 60_000);
    const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
    requireReadableReferenceTitle(title, fr ? "fr" : "en");
    const authors = optionalBoundedText(formData.get("authors"), CONTENT_LIMITS.mediumText, "Authors");
    const url = citationUrl(formData.get("url"));
    const dedupeKey = normalizeReferenceDedupeKey({ title, authors, url });
    const duplicate = await prisma.libraryReference.findFirst({ where: { dedupeKey }, select: { id: true } });
    if (duplicate) return { success: true, message: fr ? "Cette ressource a déjà été proposée. Votre référence libre reste inchangée." : "This resource has already been proposed. Your free reference is unchanged." };
    const slug = await uniqueSlug("libraryReference", title);
    await prisma.libraryReference.create({ data: {
      canonicalTitle: title, authors, url, dedupeKey, slug, referenceType: LibraryReferenceType.OTHER,
      status: LibraryStatus.PENDING_REVIEW, createdById: user.id, submittedAt: new Date(),
      translations: { create: { language: fr ? "fr" : "en", displayTitle: title, descriptionMarkdown: "", descriptionHtml: "" } }
    } });
    await notifyLibraryReviewers({ actorId: user.id, actorName: displayNameForUser(user), entity: "reference", slug, title });
    revalidatePath("/library/contribute");
    return { success: true, message: fr ? "Proposition envoyée pour validation. Votre problème et sa référence restent inchangés." : "Proposal sent for review. Your problem and its reference are unchanged." };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : (fr ? "Envoi impossible." : "Unable to submit.") }; }
}
type SaveIntent = "draft" | "submit";
type ReviewDecision = "publish" | "changes" | "archive" | "restore";

function formLanguage(formData: FormData) {
  return String(formData.get("language") ?? "en").toLowerCase() === "fr" ? "fr" : "en";
}

function saveIntent(formData: FormData): SaveIntent {
  return formData.get("intent") === "submit" ? "submit" : "draft";
}

function statusForSave(intent: SaveIntent) {
  return intent === "submit" ? LibraryStatus.PENDING_REVIEW : LibraryStatus.DRAFT;
}

function statusForUpdate(current: LibraryStatus, intent: SaveIntent) {
  return current === LibraryStatus.PUBLISHED ? LibraryStatus.PUBLISHED : statusForSave(intent);
}

function enumValue<T extends string>(value: FormDataEntryValue | null, values: readonly T[], label: string) {
  const candidate = String(value ?? "");
  if (!values.includes(candidate as T)) throw new Error(`${label} is invalid.`);
  return candidate as T;
}

function optionalHttpsUrl(value: FormDataEntryValue | null, label: string) {
  const raw = optionalBoundedText(value, CONTENT_LIMITS.mediumText, label);
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:") return url.toString();
  } catch {
    // Use the common validation error below.
  }
  throw new Error(`${label} must be a secure https URL.`);
}

function parseOptionalInt(value: FormDataEntryValue | null, label: string, min: number, max: number) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function parseRequiredInt(value: FormDataEntryValue | null, label: string, min: number, max: number) {
  const parsed = parseOptionalInt(value, label, min, max);
  if (parsed === null) throw new Error(`${label} is required.`);
  return parsed;
}

function submittedBaseUpdatedAt(formData: FormData) {
  const raw = String(formData.get("baseUpdatedAt") ?? "").trim();
  const value = new Date(raw);
  if (!raw || Number.isNaN(value.getTime())) throw new Error("This editing form is missing its version information. Reload the page and try again.");
  return value;
}

function parseIdList(formData: FormData, name: string) {
  return [...new Set(formData.getAll(name).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

async function validateRelatedEntries(tx: Prisma.TransactionClient, input: {
  referenceIds?: number[];
  mathematicianIds?: number[];
  conceptIds?: number[];
  problemIds?: number[];
}) {
  const [references, mathematicians, concepts, problems] = await Promise.all([
    input.referenceIds?.length ? tx.libraryReference.count({ where: { id: { in: input.referenceIds }, status: LibraryStatus.PUBLISHED } }) : 0,
    input.mathematicianIds?.length ? tx.mathematician.count({ where: { id: { in: input.mathematicianIds }, status: LibraryStatus.PUBLISHED } }) : 0,
    input.conceptIds?.length ? tx.concept.count({ where: { id: { in: input.conceptIds }, canAppearInConceptBrowser: true } }) : 0,
    input.problemIds?.length ? tx.problem.count({ where: { id: { in: input.problemIds }, listed: true, status: "PUBLISHED" } }) : 0
  ]);
  if (references !== (input.referenceIds?.length ?? 0)) throw new Error("One of the selected references is not public.");
  if (mathematicians !== (input.mathematicianIds?.length ?? 0)) throw new Error("One of the selected mathematicians is not public.");
  if (concepts !== (input.conceptIds?.length ?? 0)) throw new Error("One of the selected concepts is not public.");
  if (problems !== (input.problemIds?.length ?? 0)) throw new Error("One of the selected problems is not public.");
}

function revalidateLibrary(entity: LibraryEntity, slug?: string) {
  revalidatePath("/library");
  revalidatePath("/library/contribute");
  revalidatePath("/library/history");
  revalidatePath("/library/mathematicians");
  revalidatePath("/library/references");
  if (slug) {
    const segment = entity === "milestone" ? "history" : entity === "reference" ? "references" : "mathematicians";
    revalidatePath(`/library/${segment}/${slug}`);
  }
}

function libraryEntityKind(entity: LibraryEntity) {
  if (entity === "mathematician") return "mathematician";
  if (entity === "reference") return "reference";
  return "historical milestone";
}

function libraryEntityHref(entity: LibraryEntity, slug: string, edit = false) {
  const segment = entity === "milestone" ? "history" : entity === "reference" ? "references" : "mathematicians";
  return `/library/${segment}/${slug}${edit ? "/edit" : ""}`;
}

async function notifyLibraryReviewers({
  actorId,
  actorName,
  entity,
  slug,
  title
}: {
  actorId: number;
  actorName: string;
  entity: LibraryEntity;
  slug: string;
  title: string;
}) {
  const reviewers = await prisma.user.findMany({
    where: {
      id: { not: actorId },
      role: { in: [Role.ADMIN, Role.OWNER] },
      deletedAt: null
    },
    select: { id: true }
  });
  return Promise.all(reviewers.map(({ id: userId }) => createNotification({
    userId,
    actorId,
    type: NotificationType.LIBRARY_ENTRY_SUBMITTED,
    title: "Library entry awaiting review",
    body: `${actorName} submitted a library ${libraryEntityKind(entity)}: "${title}".`,
    href: libraryEntityHref(entity, slug)
  })));
}

async function notifyLibraryCreator({
  creatorId,
  actorId,
  actorName,
  entity,
  slug,
  title,
  decision,
  reviewNote
}: {
  creatorId: number | null;
  actorId: number;
  actorName: string;
  entity: LibraryEntity;
  slug: string;
  title: string;
  decision: "publish" | "changes";
  reviewNote: string | null;
}) {
  if (!creatorId || creatorId === actorId) return null;
  const published = decision === "publish";
  return createNotification({
    userId: creatorId,
    actorId,
    type: published ? NotificationType.LIBRARY_ENTRY_PUBLISHED : NotificationType.LIBRARY_ENTRY_CHANGES_REQUESTED,
    title: published ? "Library entry published" : "Changes requested on your library entry",
    body: published
      ? `${actorName} published your library ${libraryEntityKind(entity)}: "${title}".`
      : `${actorName} requested changes to your library ${libraryEntityKind(entity)}: "${title}". Feedback: ${reviewNote}`,
    href: libraryEntityHref(entity, slug, !published)
  });
}

export async function createMathematicianAction(formData: FormData) {
  const user = await requireAdmin();
  if (!canCreateLibraryEntry(user)) throw new Error("You cannot create a library entry.");
  await assertRateLimit(`library-mathematician:${user.id}`, 12, 60_000);

  const language = formLanguage(formData);
  const canonicalName = requiredBoundedText(formData.get("name") ?? formData.get("canonicalName"), CONTENT_LIMITS.title, language === "fr" ? "Nom" : "Name");
  const relatedItems = submittedMathematicianRelated(formData);
  const displayName = formData.has("name") ? canonicalName : boundedText(formData.get("displayName"), CONTENT_LIMITS.title, "Name") || canonicalName;
  const aliases = parseMathematicianAliases(formData.get("aliases") ?? "", displayName, language);
  const lifespan = boundedText(formData.get("lifespan"), CONTENT_LIMITS.shortText, "Dates");
  const birthPlace = boundedText(formData.get("birthPlace"), CONTENT_LIMITS.shortText, "Birthplace");
  const teaser = boundedText(formData.get("teaser"), CONTENT_LIMITS.mediumText, "Introduction");
  const biographyMarkdown = boundedText(formData.get("biographyMarkdown"), CONTENT_LIMITS.markdown, "Biography");
  const contributionsMarkdown = boundedText(formData.get("contributionsMarkdown"), CONTENT_LIMITS.markdown, "Contributions");
  const fields = boundedText(formData.get("fields"), CONTENT_LIMITS.tagList, "Fields").split(",").map((item) => item.trim()).filter(Boolean);
  const intent = saveIntent(formData);
  const slug = await uniqueSlug("mathematician", canonicalName);
  const [biographyHtml, contributionsHtml] = await Promise.all([
    renderMarkdown(biographyMarkdown),
    renderMarkdown(contributionsMarkdown)
  ]);

  const mathematician = await prisma.$transaction(async (tx) => {
    const created = await tx.mathematician.create({
      data: {
      slug,
      name: canonicalName,
      aliases,
      lifespan,
      birthPlace,
      portraitUrl: optionalHttpsUrl(formData.get("imageUrl"), "Image URL"),
      portraitCrop: submittedPortraitCrop(formData),
      portraitDetails: formData.has("portraitDetails") ? boundedText(formData.get("portraitDetails"), CONTENT_LIMITS.longNote, "Portrait details") : undefined,
      imageAlt: optionalBoundedText(formData.get("imageAlt"), CONTENT_LIMITS.shortText, "Image description"),
      imageCredit: optionalBoundedText(formData.get("imageCredit"), CONTENT_LIMITS.shortText, "Image credit"),
      imageCreditUrl: optionalHttpsUrl(formData.get("imageCreditUrl"), "Image credit URL"),
      imageLicense: optionalBoundedText(formData.get("imageLicense"), CONTENT_LIMITS.shortText, "Image license"),
      fields,
      status: statusForSave(intent),
      submittedAt: intent === "submit" ? new Date() : null,
      createdById: user.id,
      translations: {
        create: { language, displayName, teaser, birthPlace, biographyMarkdown, biographyHtml, contributionsMarkdown, contributionsHtml }
      }
      }
    });
    if (relatedItems !== undefined) {
      const translation = await tx.mathematicianTranslation.findUniqueOrThrow({ where: { mathematicianId_language: { mathematicianId: created.id, language } } });
      await syncMathematicianRelated(tx, translation.id, relatedItems);
    }
    return created;
  });
  revalidateLibrary("mathematician", slug);
  if (intent === "submit") {
    await notifyLibraryReviewers({ actorId: user.id, actorName: displayNameForUser(user), entity: "mathematician", slug, title: displayName });
  }
  redirect(`/library/mathematicians/${mathematician.slug}?lang=${language}`);
}

export async function updateMathematicianAction(id: number, formData: FormData) {
  const user = await requireAdmin();
  const entry = await prisma.mathematician.findUnique({ where: { id }, select: { id: true, slug: true, createdById: true, status: true, submittedAt: true, updatedAt: true } });
  if (!entry || !canEditLibraryDraft(user, entry)) throw new Error("You cannot edit this entry.");
  await assertRateLimit(`library-mathematician-edit:${user.id}`, 20, 60_000);

  const language = formLanguage(formData);
  const submittedName = requiredBoundedText(formData.get("name") ?? formData.get("canonicalName"), CONTENT_LIMITS.title, language === "fr" ? "Nom" : "Name");
  const relatedItems = submittedMathematicianRelated(formData);
  const displayName = formData.has("name") ? submittedName : boundedText(formData.get("displayName"), CONTENT_LIMITS.title, "Name") || submittedName;
  const aliases = formData.has("aliases") ? parseMathematicianAliases(formData.get("aliases"), displayName, language) : undefined;
  const biographyMarkdown = boundedText(formData.get("biographyMarkdown"), CONTENT_LIMITS.markdown, "Biography");
  const contributionsMarkdown = boundedText(formData.get("contributionsMarkdown"), CONTENT_LIMITS.markdown, "Contributions");
  const [biographyHtml, contributionsHtml] = await Promise.all([renderMarkdown(biographyMarkdown), renderMarkdown(contributionsMarkdown)]);
  const intent = saveIntent(formData);
  const baseUpdatedAt = submittedBaseUpdatedAt(formData);
  if (entry.updatedAt.getTime() !== baseUpdatedAt.getTime()) throw new Error("This entry changed after you opened it. Reload the page before saving your work.");

  await prisma.$transaction(async (tx) => {
    await tx.mathematician.update({
      where: { id, updatedAt: baseUpdatedAt },
      data: {
      // The single field edits this language only. Keep the original fallback
      // and slug; old forms can still submit their two explicit name fields.
      name: formData.has("name") ? undefined : submittedName,
      aliases,
      lifespan: boundedText(formData.get("lifespan"), CONTENT_LIMITS.shortText, "Dates"),
      portraitUrl: optionalHttpsUrl(formData.get("imageUrl"), "Image URL"),
      portraitCrop: submittedPortraitCrop(formData),
      portraitDetails: formData.has("portraitDetails") ? boundedText(formData.get("portraitDetails"), CONTENT_LIMITS.longNote, "Portrait details") : undefined,
      imageAlt: optionalBoundedText(formData.get("imageAlt"), CONTENT_LIMITS.shortText, "Image description"),
      imageCredit: optionalBoundedText(formData.get("imageCredit"), CONTENT_LIMITS.shortText, "Image credit"),
      imageCreditUrl: optionalHttpsUrl(formData.get("imageCreditUrl"), "Image credit URL"),
      imageLicense: optionalBoundedText(formData.get("imageLicense"), CONTENT_LIMITS.shortText, "Image license"),
      fields: formData.has("fields") ? boundedText(formData.get("fields"), CONTENT_LIMITS.tagList, "Fields").split(",").map((item) => item.trim()).filter(Boolean) : undefined,
      status: statusForUpdate(entry.status, intent),
      submittedAt: entry.status === LibraryStatus.PUBLISHED ? entry.submittedAt : intent === "submit" ? new Date() : null,
      reviewedById: entry.status === LibraryStatus.PUBLISHED || intent === "draft" ? undefined : null,
      reviewedAt: entry.status === LibraryStatus.PUBLISHED || intent === "draft" ? undefined : null,
      reviewNote: entry.status === LibraryStatus.PUBLISHED || intent === "draft" ? undefined : null,
      translations: {
        upsert: {
          where: { mathematicianId_language: { mathematicianId: id, language } },
          create: {
            language,
            displayName,
            teaser: boundedText(formData.get("teaser"), CONTENT_LIMITS.mediumText, "Introduction"),
            birthPlace: boundedText(formData.get("birthPlace"), CONTENT_LIMITS.shortText, "Birthplace"),
            biographyMarkdown,
            biographyHtml,
            contributionsMarkdown,
            contributionsHtml
          },
          update: {
            displayName,
            teaser: boundedText(formData.get("teaser"), CONTENT_LIMITS.mediumText, "Introduction"),
            birthPlace: boundedText(formData.get("birthPlace"), CONTENT_LIMITS.shortText, "Birthplace"),
            biographyMarkdown,
            biographyHtml,
            contributionsMarkdown,
            contributionsHtml
          }
        }
      }
      }
    });
    if (relatedItems !== undefined) {
      const translation = await tx.mathematicianTranslation.findUniqueOrThrow({ where: { mathematicianId_language: { mathematicianId: id, language } } });
      await syncMathematicianRelated(tx, translation.id, relatedItems);
    }
  });
  revalidateLibrary("mathematician", entry.slug);
  if (intent === "submit" && entry.status !== LibraryStatus.PENDING_REVIEW && entry.status !== LibraryStatus.PUBLISHED) {
    await notifyLibraryReviewers({ actorId: user.id, actorName: displayNameForUser(user), entity: "mathematician", slug: entry.slug, title: displayName });
  }
  redirect(`/library/mathematicians/${entry.slug}?lang=${language}`);
}

export async function saveMathematicianFormAction(id: number | null, _state: { error: string }, formData: FormData) {
  const user = await requireAdmin();
  if (!canCreateLibraryEntry(user)) throw new Error("You cannot edit library entries.");
  try {
    if (id === null) await createMathematicianAction(formData);
    else await updateMathematicianAction(id, formData);
    return { error: "" };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : (formLanguage(formData) === "fr" ? "Enregistrement impossible." : "Unable to save.") };
  }
}

export async function createLibraryReferenceAction(formData: FormData) {
  const user = await requireAdmin();
  if (!canCreateLibraryEntry(user)) throw new Error("You cannot create a library entry.");
  await assertRateLimit(`library-reference:${user.id}`, 16, 60_000);

  const canonicalTitle = requiredBoundedText(formData.get("canonicalTitle"), CONTENT_LIMITS.title, "Title");
  const displayTitle = boundedText(formData.get("displayTitle"), CONTENT_LIMITS.title, "Displayed title") || canonicalTitle;
  requireReadableReferenceTitle(canonicalTitle, formLanguage(formData));
  requireReadableReferenceTitle(displayTitle, formLanguage(formData));
  const authors = optionalBoundedText(formData.get("authors"), CONTENT_LIMITS.mediumText, "Authors");
  const year = parseOptionalInt(formData.get("year"), "Year", -5000, 3000);
  const url = optionalHttpsUrl(formData.get("url"), "Reference URL");
  const doi = optionalBoundedText(formData.get("doi"), CONTENT_LIMITS.shortText, "DOI");
  const isbn = optionalBoundedText(formData.get("isbn"), CONTENT_LIMITS.shortText, "ISBN");
  const bibliography = readReferenceBibliography(formData);
  const { citationKey } = bibliography;
  const referenceType = enumValue(formData.get("referenceType"), Object.values(LibraryReferenceType), "Reference type");
  const dedupeKey = normalizeReferenceDedupeKey({ title: canonicalTitle, authors, year, url, doi, isbn, ...bibliography });
  const duplicate = await prisma.libraryReference.findFirst({
    where: { OR: [{ dedupeKey }, ...(citationKey ? [{ citationKey }] : [])] },
    select: { slug: true }
  });
  if (duplicate) redirect(`/library/references/${duplicate.slug}?duplicate=1`);

  const language = formLanguage(formData);
  const descriptionMarkdown = boundedText(formData.get("descriptionMarkdown"), CONTENT_LIMITS.markdown, "Description");
  const descriptionHtml = await renderMarkdown(descriptionMarkdown);
  const intent = saveIntent(formData);
  const slug = await uniqueSlug("libraryReference", canonicalTitle);

  const reference = await prisma.$transaction(async tx => {
    const workId = await validateReferenceWork(tx, formData, referenceType);
    return tx.libraryReference.create({
    data: {
      slug,
      canonicalTitle,
      referenceType,
      workId,
      authors,
      publisher: optionalBoundedText(formData.get("publisher"), CONTENT_LIMITS.shortText, "Publisher"),
      year,
      yearLabel: optionalBoundedText(formData.get("yearLabel"), CONTENT_LIMITS.shortText, "Date label"),
      url,
      doi,
      isbn,
      ...bibliography,
      formattedOverride: optionalBoundedText(formData.get("formattedOverride"), CONTENT_LIMITS.mediumText, "Display citation"),
      aliases: boundedText(formData.get("aliases"), CONTENT_LIMITS.tagList, "Aliases").split("\n").map((item) => item.trim()).filter(Boolean),
      iconUrl: optionalHttpsUrl(formData.get("iconUrl"), "Pictogram URL"),
      iconSize: parseOptionalInt(formData.get("iconSize"), "Pictogram size", 24, 288) ?? 40,
      imageAlt: optionalBoundedText(formData.get("imageAlt"), CONTENT_LIMITS.shortText, "Image description"),
      imageCredit: optionalBoundedText(formData.get("imageCredit"), CONTENT_LIMITS.shortText, "Image credit"),
      imageCreditUrl: optionalHttpsUrl(formData.get("imageCreditUrl"), "Image credit URL"),
      imageLicense: optionalBoundedText(formData.get("imageLicense"), CONTENT_LIMITS.shortText, "Image license"),
      dedupeKey,
      status: statusForSave(intent),
      submittedAt: intent === "submit" ? new Date() : null,
      createdById: user.id,
      translations: { create: { language, displayTitle, descriptionMarkdown, descriptionHtml } }
    }
  });
  });
  revalidateLibrary("reference", slug);
  if (intent === "submit") {
    await notifyLibraryReviewers({ actorId: user.id, actorName: displayNameForUser(user), entity: "reference", slug, title: displayTitle });
  }
  redirect(`/library/references/${reference.slug}`);
}

export async function updateLibraryReferenceAction(id: number, formData: FormData) {
  const user = await requireAdmin();
  const entry = await prisma.libraryReference.findUnique({ where: { id }, select: { id: true, slug: true, canonicalTitle: true, mergedIntoId: true, createdById: true, status: true, submittedAt: true, updatedAt: true } });
  if (!entry || !canEditLibraryReference(user, entry)) throw new Error("You cannot edit this entry.");
  // Correcting a submitted, published or archived reference is not a review decision.
  const preserveStatus = entry.status === LibraryStatus.PUBLISHED || entry.status === LibraryStatus.PENDING_REVIEW || entry.status === LibraryStatus.ARCHIVED;
  const canonicalTitle = requiredBoundedText(formData.get("canonicalTitle"), CONTENT_LIMITS.title, "Title");
  const displayTitle = boundedText(formData.get("displayTitle"), CONTENT_LIMITS.title, "Displayed title") || canonicalTitle;
  requireReadableReferenceTitle(canonicalTitle, formLanguage(formData));
  requireReadableReferenceTitle(displayTitle, formLanguage(formData));
  const authors = optionalBoundedText(formData.get("authors"), CONTENT_LIMITS.mediumText, "Authors");
  const year = parseOptionalInt(formData.get("year"), "Year", -5000, 3000);
  const url = optionalHttpsUrl(formData.get("url"), "Reference URL");
  const doi = optionalBoundedText(formData.get("doi"), CONTENT_LIMITS.shortText, "DOI");
  const isbn = optionalBoundedText(formData.get("isbn"), CONTENT_LIMITS.shortText, "ISBN");
  const bibliography = readReferenceBibliography(formData);
  const { citationKey } = bibliography;
  const referenceType = enumValue(formData.get("referenceType"), Object.values(LibraryReferenceType), "Reference type");
  const dedupeKey = normalizeReferenceDedupeKey({ title: canonicalTitle, authors, year, url, doi, isbn, ...bibliography });
  const duplicate = await prisma.libraryReference.findFirst({
    where: { id: { not: id }, OR: [{ dedupeKey }, ...(citationKey ? [{ citationKey }] : [])] },
    select: { canonicalTitle: true }
  });
  if (duplicate) throw new Error(`This reference duplicates "${duplicate.canonicalTitle}".`);
  const language = formLanguage(formData);
  const descriptionMarkdown = boundedText(formData.get("descriptionMarkdown"), CONTENT_LIMITS.markdown, "Description");
  const intent = saveIntent(formData);
  const baseUpdatedAt = submittedBaseUpdatedAt(formData);
  if (entry.updatedAt.getTime() !== baseUpdatedAt.getTime()) throw new Error("This entry changed after you opened it. Reload the page before saving your work.");

  const descriptionHtml = await renderMarkdown(descriptionMarkdown);
  await prisma.$transaction(async tx => {
    const workId = await validateReferenceWork(tx, formData, referenceType, id);
    await tx.libraryReference.update({
    where: { id, updatedAt: baseUpdatedAt },
    data: {
      canonicalTitle,
      ...(/^\s*@\w+\s*[{(]/.test(entry.canonicalTitle) && !entry.mergedIntoId ? { searchable: true } : {}),
      referenceType,
      workId,
      authors,
      publisher: optionalBoundedText(formData.get("publisher"), CONTENT_LIMITS.shortText, "Publisher"),
      year,
      yearLabel: optionalBoundedText(formData.get("yearLabel"), CONTENT_LIMITS.shortText, "Date label"),
      url,
      doi,
      isbn,
      ...bibliography,
      formattedOverride: optionalBoundedText(formData.get("formattedOverride"), CONTENT_LIMITS.mediumText, "Display citation"),
      aliases: boundedText(formData.get("aliases"), CONTENT_LIMITS.tagList, "Aliases").split("\n").map((item) => item.trim()).filter(Boolean),
      iconUrl: optionalHttpsUrl(formData.get("iconUrl"), "Pictogram URL"),
      iconSize: parseOptionalInt(formData.get("iconSize"), "Pictogram size", 24, 288) ?? 40,
      imageAlt: optionalBoundedText(formData.get("imageAlt"), CONTENT_LIMITS.shortText, "Image description"),
      imageCredit: optionalBoundedText(formData.get("imageCredit"), CONTENT_LIMITS.shortText, "Image credit"),
      imageCreditUrl: optionalHttpsUrl(formData.get("imageCreditUrl"), "Image credit URL"),
      imageLicense: optionalBoundedText(formData.get("imageLicense"), CONTENT_LIMITS.shortText, "Image license"),
      dedupeKey,
      status: preserveStatus ? entry.status : statusForUpdate(entry.status, intent),
      submittedAt: preserveStatus ? entry.submittedAt : intent === "submit" ? new Date() : null,
      reviewedById: preserveStatus || intent === "draft" ? undefined : null,
      reviewedAt: preserveStatus || intent === "draft" ? undefined : null,
      reviewNote: preserveStatus || intent === "draft" ? undefined : null,
      translations: {
        upsert: {
          where: { referenceId_language: { referenceId: id, language } },
          create: { language, displayTitle, descriptionMarkdown, descriptionHtml },
          update: { displayTitle, descriptionMarkdown, descriptionHtml }
        }
      }
    }
  });
  });
  revalidateLibrary("reference", entry.slug);
  if (intent === "submit" && !preserveStatus) {
    await notifyLibraryReviewers({ actorId: user.id, actorName: displayNameForUser(user), entity: "reference", slug: entry.slug, title: displayTitle });
  }
  redirect(`/library/references/${entry.slug}`);
}

export async function saveLibraryReferenceFormAction(id: number | null, _state: { error: string }, formData: FormData) {
  const user = await requireAdmin();
  if (!canCreateLibraryEntry(user)) throw new Error("You cannot edit library entries.");
  try {
    if (id === null) await createLibraryReferenceAction(formData);
    else await updateLibraryReferenceAction(id, formData);
    return { error: "" };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : (formData.get("language") === "fr" ? "Enregistrement impossible." : "Unable to save.") };
  }
}

export async function createHistoryMilestoneAction(formData: FormData) {
  const user = await requireAdmin();
  if (!canCreateLibraryEntry(user)) throw new Error("You cannot create a library entry.");
  const language = formLanguage(formData);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const summaryMarkdown = requiredBoundedText(formData.get("summaryMarkdown"), CONTENT_LIMITS.markdown, "Description");
  const intent = saveIntent(formData);
  const slug = await uniqueSlug("historyMilestone", title);
  const mathematicianIds = parseIdList(formData, "mathematicianIds");
  const referenceIds = parseIdList(formData, "referenceIds");
  const conceptIds = parseIdList(formData, "conceptIds");

  const milestone = await prisma.$transaction(async (tx) => {
    await validateRelatedEntries(tx, { mathematicianIds, referenceIds, conceptIds });
    return tx.historyMilestone.create({
      data: {
      slug,
      sortYear: parseRequiredInt(formData.get("sortYear"), "Year", -5000, 3000),
      era: enumValue(formData.get("era"), Object.values(HistoryEra), "Era"),
      milestoneType: enumValue(formData.get("milestoneType"), Object.values(HistoryMilestoneType), "Milestone type"),
      status: statusForSave(intent),
      submittedAt: intent === "submit" ? new Date() : null,
      imageUrl: optionalHttpsUrl(formData.get("imageUrl"), "Image URL"),
      imageAlt: optionalBoundedText(formData.get("imageAlt"), CONTENT_LIMITS.shortText, "Image description"),
      imageCredit: optionalBoundedText(formData.get("imageCredit"), CONTENT_LIMITS.shortText, "Image credit"),
      imageCreditUrl: optionalHttpsUrl(formData.get("imageCreditUrl"), "Image credit URL"),
      imageLicense: optionalBoundedText(formData.get("imageLicense"), CONTENT_LIMITS.shortText, "Image license"),
      createdById: user.id,
      translations: { create: { language, yearLabel: requiredBoundedText(formData.get("yearLabel"), CONTENT_LIMITS.shortText, "Date"), title, summaryMarkdown, summaryHtml: await renderMarkdown(summaryMarkdown) } },
      mathematicians: { create: mathematicianIds.map((mathematicianId, position) => ({ mathematicianId, position })) },
      referenceLinks: { create: referenceIds.map((referenceId, position) => ({ referenceId, position })) },
      conceptLinks: { create: conceptIds.map((conceptId, position) => ({ conceptId, position })) }
      }
    });
  });
  revalidateLibrary("milestone", slug);
  if (intent === "submit") {
    await notifyLibraryReviewers({ actorId: user.id, actorName: displayNameForUser(user), entity: "milestone", slug, title });
  }
  redirect(`/library/history/${milestone.slug}`);
}

export async function updateHistoryMilestoneAction(id: number, formData: FormData) {
  const user = await requireAdmin();
  const entry = await prisma.historyMilestone.findUnique({ where: { id }, select: { id: true, slug: true, createdById: true, status: true, submittedAt: true, updatedAt: true } });
  if (!entry || !canEditLibraryDraft(user, entry)) throw new Error("You cannot edit this entry.");
  const language = formLanguage(formData);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const summaryMarkdown = requiredBoundedText(formData.get("summaryMarkdown"), CONTENT_LIMITS.markdown, "Description");
  const intent = saveIntent(formData);
  const mathematicianIds = parseIdList(formData, "mathematicianIds");
  const referenceIds = parseIdList(formData, "referenceIds");
  const conceptIds = parseIdList(formData, "conceptIds");
  const baseUpdatedAt = submittedBaseUpdatedAt(formData);
  if (entry.updatedAt.getTime() !== baseUpdatedAt.getTime()) throw new Error("This entry changed after you opened it. Reload the page before saving your work.");

  await prisma.$transaction(async (tx) => {
    await validateRelatedEntries(tx, { mathematicianIds, referenceIds, conceptIds });
    await tx.historyMilestone.update({
      where: { id, updatedAt: baseUpdatedAt },
      data: {
        sortYear: parseRequiredInt(formData.get("sortYear"), "Year", -5000, 3000),
        era: enumValue(formData.get("era"), Object.values(HistoryEra), "Era"),
        milestoneType: enumValue(formData.get("milestoneType"), Object.values(HistoryMilestoneType), "Milestone type"),
        status: statusForUpdate(entry.status, intent),
        submittedAt: entry.status === LibraryStatus.PUBLISHED ? entry.submittedAt : intent === "submit" ? new Date() : null,
        reviewedById: entry.status === LibraryStatus.PUBLISHED || intent === "draft" ? undefined : null,
        reviewedAt: entry.status === LibraryStatus.PUBLISHED || intent === "draft" ? undefined : null,
        reviewNote: entry.status === LibraryStatus.PUBLISHED || intent === "draft" ? undefined : null,
        imageUrl: optionalHttpsUrl(formData.get("imageUrl"), "Image URL"),
        imageAlt: optionalBoundedText(formData.get("imageAlt"), CONTENT_LIMITS.shortText, "Image description"),
        imageCredit: optionalBoundedText(formData.get("imageCredit"), CONTENT_LIMITS.shortText, "Image credit"),
        imageCreditUrl: optionalHttpsUrl(formData.get("imageCreditUrl"), "Image credit URL"),
        imageLicense: optionalBoundedText(formData.get("imageLicense"), CONTENT_LIMITS.shortText, "Image license"),
        translations: {
          upsert: {
            where: { milestoneId_language: { milestoneId: id, language } },
            create: { language, yearLabel: requiredBoundedText(formData.get("yearLabel"), CONTENT_LIMITS.shortText, "Date"), title, summaryMarkdown, summaryHtml: await renderMarkdown(summaryMarkdown) },
            update: { yearLabel: requiredBoundedText(formData.get("yearLabel"), CONTENT_LIMITS.shortText, "Date"), title, summaryMarkdown, summaryHtml: await renderMarkdown(summaryMarkdown) }
          }
        }
      }
    });
    await tx.historyMilestoneMathematician.deleteMany({ where: { milestoneId: id } });
    await tx.historyMilestoneReference.deleteMany({ where: { milestoneId: id } });
    await tx.historyMilestoneConcept.deleteMany({ where: { milestoneId: id } });
    if (mathematicianIds.length) await tx.historyMilestoneMathematician.createMany({ data: mathematicianIds.map((mathematicianId, position) => ({ milestoneId: id, mathematicianId, position })) });
    if (referenceIds.length) await tx.historyMilestoneReference.createMany({ data: referenceIds.map((referenceId, position) => ({ milestoneId: id, referenceId, position })) });
    if (conceptIds.length) await tx.historyMilestoneConcept.createMany({ data: conceptIds.map((conceptId, position) => ({ milestoneId: id, conceptId, position })) });
  });
  revalidateLibrary("milestone", entry.slug);
  if (intent === "submit" && entry.status !== LibraryStatus.PENDING_REVIEW && entry.status !== LibraryStatus.PUBLISHED) {
    await notifyLibraryReviewers({ actorId: user.id, actorName: displayNameForUser(user), entity: "milestone", slug: entry.slug, title });
  }
  redirect(`/library/history/${entry.slug}`);
}

export async function reviewLibraryEntryAction(entity: LibraryEntity, id: number, decision: ReviewDecision, formData: FormData) {
  const user = await requireAdmin();
  await assertRateLimit(`library-review:${user.id}`, 60, 60_000);
  const entry = entity === "mathematician"
    ? await prisma.mathematician.findUnique({ where: { id }, select: { id: true, slug: true, name: true, createdById: true, status: true, translations: { select: { displayName: true }, take: 1 } } }).then((value) => value && ({ ...value, title: value.translations[0]?.displayName ?? value.name }))
    : entity === "reference"
      ? await prisma.libraryReference.findUnique({ where: { id }, select: { id: true, slug: true, canonicalTitle: true, createdById: true, status: true, updatedAt: true, translations: { select: { displayTitle: true } } } }).then((value) => value && ({ ...value, title: value.translations[0]?.displayTitle ?? value.canonicalTitle }))
      : await prisma.historyMilestone.findUnique({ where: { id }, select: { id: true, slug: true, createdById: true, status: true, translations: { select: { title: true }, take: 1 } } }).then((value) => value && ({ ...value, title: value.translations[0]?.title ?? value.slug }));
  if (!entry) throw new Error("Entry not found.");
  if (decision === "archive" || decision === "restore") {
    if (!canArchiveLibraryEntry(user)) throw new Error("Only admins can archive library entries.");
  } else if (!canReviewLibraryEntry(user, entry)) {
    throw new Error("A second trusted contributor must review this entry.");
  }
  if ((decision === "publish" || decision === "changes") && entry.status !== LibraryStatus.PENDING_REVIEW) {
    throw new Error("This entry is no longer awaiting review.");
  }
  if (decision === "archive" && entry.status === LibraryStatus.ARCHIVED) throw new Error("This entry is already archived.");
  if (decision === "restore" && entry.status !== LibraryStatus.ARCHIVED) throw new Error("Only archived entries can be restored.");

  if (decision === "publish" && "canonicalTitle" in entry) {
    requireReadableReferenceTitle(entry.canonicalTitle, formLanguage(formData));
    for (const translation of entry.translations) {
      if (translation.displayTitle) requireReadableReferenceTitle(translation.displayTitle, formLanguage(formData));
    }
  }

  const reviewNote = decision === "changes"
    ? requiredBoundedText(formData.get("reviewNote"), CONTENT_LIMITS.longNote, "Review note")
    : null;
  const reviewedAt = new Date();
  const data = decision === "publish"
    ? { status: LibraryStatus.PUBLISHED, reviewedById: user.id, reviewedAt, reviewNote: null, publishedAt: reviewedAt }
    : decision === "changes"
      ? { status: LibraryStatus.NEEDS_WORK, reviewedById: user.id, reviewedAt, reviewNote }
      : decision === "archive"
        ? { status: LibraryStatus.ARCHIVED, reviewedById: user.id, reviewedAt, reviewNote: null }
        : { status: LibraryStatus.NEEDS_WORK, reviewedById: user.id, reviewedAt, reviewNote: null };
  const updateResult = entity === "mathematician"
    ? await prisma.mathematician.updateMany({ where: { id, status: entry.status }, data })
    : entity === "reference"
      ? await prisma.libraryReference.updateMany({ where: { id, status: entry.status, ...("updatedAt" in entry ? { updatedAt: entry.updatedAt } : {}) }, data })
      : await prisma.historyMilestone.updateMany({ where: { id, status: entry.status }, data });
  if (updateResult.count !== 1) throw new Error("This entry was reviewed by someone else. Reload the page to see its current status.");
  if (decision === "archive") {
    if (entity === "mathematician") await prisma.libraryHomepageSelection.updateMany({ where: { mathematicianId: id }, data: { mathematicianId: null } });
    else if (entity === "reference") await prisma.libraryHomepageSelection.updateMany({ where: { referenceId: id }, data: { referenceId: null } });
    else await prisma.libraryHomepageSelection.updateMany({ where: { milestoneId: id }, data: { milestoneId: null } });
  }
  await prisma.notification.updateMany({
    where: {
      type: NotificationType.LIBRARY_ENTRY_SUBMITTED,
      href: libraryEntityHref(entity, entry.slug),
      readAt: null
    },
    data: { readAt: reviewedAt }
  });
  revalidateLibrary(entity, entry.slug);
  if (decision === "publish" || decision === "changes") {
    await notifyLibraryCreator({
      creatorId: entry.createdById,
      actorId: user.id,
      actorName: displayNameForUser(user),
      entity,
      slug: entry.slug,
      title: entry.title,
      decision,
      reviewNote
    });
  }
}

export async function updateLibraryHomepageAction(formData: FormData) {
  const user = await requireAdmin();
  const milestoneId = parseOptionalInt(formData.get("milestoneId"), "Milestone", 1, Number.MAX_SAFE_INTEGER);
  const mathematicianId = parseOptionalInt(formData.get("mathematicianId"), "Mathematician", 1, Number.MAX_SAFE_INTEGER);
  const referenceId = parseOptionalInt(formData.get("referenceId"), "Reference", 1, Number.MAX_SAFE_INTEGER);
  const [milestone, mathematician, reference] = await Promise.all([
    milestoneId ? prisma.historyMilestone.findFirst({ where: { id: milestoneId, status: LibraryStatus.PUBLISHED }, select: { id: true } }) : null,
    mathematicianId ? prisma.mathematician.findFirst({ where: { id: mathematicianId, status: LibraryStatus.PUBLISHED }, select: { id: true } }) : null,
    referenceId ? prisma.libraryReference.findFirst({ where: { id: referenceId, status: LibraryStatus.PUBLISHED }, select: { id: true } }) : null
  ]);
  if ((milestoneId && !milestone) || (mathematicianId && !mathematician) || (referenceId && !reference)) {
    throw new Error("Homepage selections must be published library entries.");
  }
  await prisma.libraryHomepageSelection.upsert({
    where: { id: 1 },
    create: { id: 1, milestoneId, mathematicianId, referenceId, updatedById: user.id },
    update: { milestoneId, mathematicianId, referenceId, updatedById: user.id }
  });
  revalidatePath("/library");
}
