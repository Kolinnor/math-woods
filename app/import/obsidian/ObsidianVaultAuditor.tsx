"use client";

import { useMemo, useRef, useState } from "react";
import {
  auditObsidianNotes,
  obsidianAuditToCsv,
  obsidianEdgesToCsv,
  type ObsidianAuditResult,
  type ObsidianAuditStatus
} from "@/lib/obsidian-audit";

type ReadState = {
  status: "idle" | "reading" | "ready" | "error";
  message: string;
  result: ObsidianAuditResult | null;
};

const statusLabels: Record<ObsidianAuditStatus, string> = {
  publish: "Publish",
  stub: "Stub",
  private: "Private",
  discard: "Discard",
  review: "Review"
};

export function ObsidianVaultAuditor() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<ReadState>({
    status: "idle",
    message: "Choose an Obsidian vault folder to audit it locally.",
    result: null
  });
  const riskyNotes = useMemo(
    () => state.result?.notes.filter((note) => note.warnings.length || note.status === "review").slice(0, 80) ?? [],
    [state.result]
  );

  function configureFolderInput(node: HTMLInputElement | null) {
    inputRef.current = node;
    if (!node) return;
    node.setAttribute("webkitdirectory", "");
    node.setAttribute("directory", "");
  }

  async function readFiles(files: FileList | null) {
    const markdownFiles = Array.from(files ?? []).filter((file) => file.name.toLowerCase().endsWith(".md"));
    if (!markdownFiles.length) {
      setState({ status: "error", message: "No Markdown files found in this selection.", result: null });
      return;
    }

    setState({ status: "reading", message: `Reading ${markdownFiles.length.toLocaleString()} Markdown files locally...`, result: null });

    try {
      const notes = await Promise.all(
        markdownFiles.map(async (file) => ({
          path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
          text: await file.text()
        }))
      );
      const result = auditObsidianNotes(notes);
      setState({
        status: "ready",
        message: `Audited ${result.summary.totalNotes.toLocaleString()} Markdown notes. Nothing was uploaded.`,
        result
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "The vault could not be audited.",
        result: null
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const result = state.result;

  return (
    <div className="grid gap-5">
      <section className="panel grid gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Local vault audit</h2>
          <p className="muted text-sm">
            This tool reads Markdown files in your browser, classifies notes, and keeps note bodies off the server.
          </p>
        </div>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Obsidian vault folder</span>
          <input
            ref={configureFolderInput}
            type="file"
            multiple
            accept=".md,text/markdown,text/plain"
            onChange={(event) => {
              void readFiles(event.currentTarget.files);
            }}
          />
        </label>
        <p className={state.status === "error" ? "text-sm text-red-800" : "muted text-sm"}>{state.message}</p>
      </section>

      {result && (
        <>
          <section className="panel grid gap-4 p-5">
            <div>
              <h2 className="text-lg font-semibold">Audit summary</h2>
              <p className="muted text-sm">Use this as a review queue before importing anything into Math Woods.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {(["publish", "stub", "private", "review", "discard"] as const).map((status) => (
                <div key={status} className="rounded-md border border-line p-3">
                  <p className="text-sm font-medium">{statusLabels[status]}</p>
                  <p className="text-2xl font-semibold">{result.summary[status].toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="tag">{result.summary.links.toLocaleString()} links</span>
              <span className="tag">{result.summary.unresolvedLinks.toLocaleString()} unresolved links</span>
              <span className="tag">{result.summary.warnings.toLocaleString()} warnings</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="secondary" onClick={() => downloadJson("math-woods-obsidian-audit.json", result)}>
                Download audit JSON
              </button>
              <button type="button" className="secondary" onClick={() => downloadText("math-woods-obsidian-notes.csv", obsidianAuditToCsv(result.notes))}>
                Download notes CSV
              </button>
              <button type="button" className="secondary" onClick={() => downloadText("math-woods-obsidian-links.csv", obsidianEdgesToCsv(result.notes))}>
                Download links CSV
              </button>
            </div>
          </section>

          <section className="panel grid gap-4 p-5">
            <div>
              <h2 className="text-lg font-semibold">Review queue</h2>
              <p className="muted text-sm">First notes with warnings or an uncertain status. Private notes stay listed only in your local report.</p>
            </div>
            <div className="grid gap-3">
              {riskyNotes.map((note) => (
                <div key={note.path} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{note.title}</p>
                      <p className="muted">{note.path}</p>
                    </div>
                    <span className="tag">{statusLabels[note.status]}</span>
                  </div>
                  <p className="muted mt-2">
                    {note.resolvedLinks.length} links / {note.backlinks.length} backlinks / {note.wordCount} words
                  </p>
                  {note.warnings.length > 0 && <p className="mt-2 text-red-800">{note.warnings.join(" ")}</p>}
                  {note.reasons.length > 0 && <p className="muted mt-2">{note.reasons.join(" ")}</p>}
                </div>
              ))}
              {riskyNotes.length === 0 && <p className="muted text-sm">No review notes in the first pass.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function downloadJson(filename: string, value: unknown) {
  downloadText(filename, `${JSON.stringify(value, null, 2)}\n`, "application/json");
}

function downloadText(filename: string, value: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
