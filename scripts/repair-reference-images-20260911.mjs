// Targeted repair of the records audited on 2026-09-11. No writes without --apply.
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { buildProblemRevisionSnapshot } from '../lib/problem-revisions.ts';
import { IMAGE_FIELDS, auditReferenceImages, assertReferenceImagesPreserved } from './reference-image-audit.mjs';

const VIDEO_SLUGS = ['phil-caldero-ib34ogdciuo', 'phil-caldero-k8iz5b7cz1g', 'phil-caldero-riymew4yyya', 'phil-caldero-8yndbmqymye'];
const MATH_WOODS_PROBLEMS = [145, 280, 365, 366, 389];
const problemInclude = {
  libraryReferences: { orderBy: { position: 'asc' } }, domains: { orderBy: { position: 'asc' } },
  tags: { include: { tag: true } }, spoilerTags: { include: { tag: true } },
  relatedGroups: { orderBy: { position: 'asc' }, include: { relations: { orderBy: { position: 'asc' }, include: { targetProblem: { select: { slug: true } } } } } }
};
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function inventory(db) {
  return {
    libraryReference: await db.libraryReference.findMany({ orderBy: { id: 'asc' } }),
    knownSources: await db.knownProblemSource.findMany({ orderBy: { id: 'asc' } }),
    problems: await db.problem.findMany({ where: { knownSourceId: { not: null } }, include: problemInclude, orderBy: { id: 'asc' } }),
    problemLibraryReference: await db.problemLibraryReference.findMany({ orderBy: { id: 'asc' } }),
    conceptLibraryReference: await db.conceptLibraryReference.findMany({ orderBy: { id: 'asc' } })
  };
}

export function repairPlan(before) {
  const channel = before.libraryReference.find(r => r.slug === 'phil-caldero');
  const woods = before.libraryReference.find(r => r.slug === 'math-woods');
  assert.ok(channel?.iconUrl && channel.status === 'PUBLISHED' && !channel.mergedIntoId && channel.referenceType === 'CHANNEL');
  assert.ok(woods?.iconUrl && woods.status === 'PUBLISHED' && !woods.mergedIntoId && woods.canonicalTitle === 'Math Woods');
  const legacyWoods = before.knownSources.find(s => s.slug === 'math-woods');
  assert.ok(legacyWoods);
  const references = [], citations = [];
  for (const slug of VIDEO_SLUGS) {
    const video = before.libraryReference.find(r => r.slug === slug);
    assert.ok(video && video.referenceType === 'VIDEO' && video.authors === 'Phil Caldero' && video.status === 'PUBLISHED' && !video.mergedIntoId, `Review changed video: ${slug}`);
    assert.equal(new URL(video.url).hostname, 'www.youtube.com');
    assert.equal(new URL(video.url).searchParams.get('v')?.toLowerCase(), slug.replace('phil-caldero-', ''));
    if (video.iconUrl) continue; // Never replace a newer, deliberately chosen illustration.
    const data = Object.fromEntries(IMAGE_FIELDS.map(k => [k, channel[k]]));
    // Existing video-specific credits require manual reconciliation.
    for (const k of IMAGE_FIELDS.slice(2)) assert.ok(!video[k] || video[k] === data[k], `Review existing ${k} on ${slug}`);
    references.push({ id: video.id, slug, data });
  }
  for (const id of MATH_WOODS_PROBLEMS) {
    const problem = before.problems.find(p => p.id === id);
    assert.ok(problem && problem.knownSourceId === legacyWoods.id, `Review changed source on problem ${id}`);
    if (problem.libraryReferences.some(c => c.referenceId === woods.id)) continue;
    const matches = problem.libraryReferences.filter(c => c.referenceId === null && c.text.trim() === 'Math Woods');
    assert.equal(matches.length, 1, `Review changed citations on problem ${id}`);
    citations.push({ id: matches[0].id, problemId: id, referenceId: woods.id });
  }
  const after = structuredClone(before);
  for (const change of references) Object.assign(after.libraryReference.find(r => r.id === change.id), change.data);
  for (const change of citations) {
    after.problemLibraryReference.find(c => c.id === change.id).referenceId = change.referenceId;
    after.problems.find(p => p.id === change.problemId).libraryReferences.find(c => c.id === change.id).referenceId = change.referenceId;
  }
  assertReferenceImagesPreserved(before, after);
  return { references, citations, remainingWarnings: auditReferenceImages(after) };
}

export async function repair(db, { apply = false, backupPath, expectedHash } = {}) {
  const before = await db.$transaction(tx => inventory(tx), { isolationLevel: 'RepeatableRead' });
  const plan = repairPlan(before), snapshotHash = digest(before);
  if (!apply) return { snapshotHash, plan, warnings: auditReferenceImages(before) };
  assert.equal(snapshotHash, expectedHash, 'Inventory changed since the dry run; review it again.');
  assert.ok(backupPath, 'A fresh backup path is required.');
  writeFileSync(backupPath, JSON.stringify({ before, plan, snapshotHash }, null, 2), { flag: 'wx', mode: 0o600 });
  if (!plan.references.length && !plan.citations.length) return { applied: false, plan };
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('LOCK TABLE "LibraryReference", "Problem", "ProblemLibraryReference", "ConceptLibraryReference", "KnownProblemSource" IN SHARE ROW EXCLUSIVE MODE');
    assert.equal(digest(await inventory(tx)), snapshotHash, 'Data changed after backup; no repair applied.');
    const actor = await tx.user.findUnique({ where: { username: 'ancient-tree' }, select: { id: true } });
    assert.ok(actor, 'Ancient Tree account is required for repair history.');
    for (const change of plan.references) await tx.libraryReference.update({ where: { id: change.id }, data: change.data });
    for (const change of plan.citations) {
      const problem = before.problems.find(p => p.id === change.problemId);
      // Preserve a merge base for editors whose form was opened before this repair.
      const existing = await tx.pageRevision.findFirst({ where: { pageType: 'PROBLEM', pageId: problem.id, problemVersion: problem.version, problemSnapshot: { not: Prisma.AnyNull } } });
      if (!existing) await tx.pageRevision.create({ data: { pageType: 'PROBLEM', pageId: problem.id, markdown: problem.bodyMarkdown, problemVersion: problem.version, problemSnapshot: buildProblemRevisionSnapshot(problem), editSummary: 'Snapshot before reference image repair' } });
      await tx.problemLibraryReference.update({ where: { id: change.id }, data: { referenceId: change.referenceId } });
      const updated = await tx.problem.update({ where: { id: problem.id, version: problem.version }, data: { version: { increment: 1 } }, include: problemInclude });
      await tx.pageRevision.create({ data: { pageType: 'PROBLEM', pageId: problem.id, markdown: updated.bodyMarkdown, problemVersion: updated.version, problemSnapshot: buildProblemRevisionSnapshot(updated), editedById: actor.id, editSummary: 'Rétablir le lien vers la référence illustrée Math Woods, sans modifier le texte ni le statut Original.' } });
    }
    const after = await inventory(tx);
    assertReferenceImagesPreserved(before, after);
    assert.equal(repairPlan(after).references.length + repairPlan(after).citations.length, 0, 'Repair is incomplete');
    for (const old of before.problems) {
      const updated = after.problems.find(p => p.id === old.id);
      for (const key of Object.keys(old).filter(k => !['updatedAt', 'version', 'libraryReferences'].includes(k))) assert.deepEqual(updated[key], old[key], `Unexpected problem change: ${old.id}/${key}`);
      assert.deepEqual(updated.libraryReferences.map(c => ({ ...c, referenceId: null })), old.libraryReferences.map(c => ({ ...c, referenceId: null })), 'Citation text, order, details or privacy changed');
    }
    return { applied: true, references: plan.references.length, citations: plan.citations.length, warnings: auditReferenceImages(after) };
  }, { isolationLevel: 'Serializable', timeout: 60000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const db = new PrismaClient();
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--check') {
      const warnings = auditReferenceImages(await inventory(db));
      console.log(JSON.stringify({ warnings }));
      if (warnings.length) process.exitCode = 1;
    } else if (args[0] === '--apply' && args.length === 3) console.log(JSON.stringify(await repair(db, { apply: true, expectedHash: args[1], backupPath: args[2] })));
    else if (!args.length) console.log(JSON.stringify(await repair(db)));
    else throw Error('Usage: repair-reference-images-20260911.mjs [--check | --apply SNAPSHOT_HASH NEW_BACKUP_PATH]');
  } finally { await db.$disconnect(); }
}
