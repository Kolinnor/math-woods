export function markdownExcerpt(markdown: string, fallback: string, maxLength = 180) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " formula ")
    .replace(/\$[^$\n]+\$/g, " formula ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const excerpt = text || fallback;
  return excerpt.length > maxLength ? `${excerpt.slice(0, maxLength - 1).trim()}...` : excerpt;
}
