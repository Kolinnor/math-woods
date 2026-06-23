export function yamlString(value: string | null | undefined): string {
  return JSON.stringify(value ?? "");
}

export function yamlArray(values: string[]): string {
  return `[${values.map((value) => yamlString(value)).join(", ")}]`;
}

export function markdownResponse(markdown: string, filename: string): Response {
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

export function frontmatter(fields: Record<string, string | number | boolean | string[] | null | undefined>): string {
  const lines = ["---"];

  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: ${yamlArray(value)}`);
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value ? "true" : "false"}`);
    } else {
      lines.push(`${key}: ${yamlString(value == null ? "" : String(value))}`);
    }
  }

  lines.push("---");
  return `${lines.join("\n")}\n\n`;
}
