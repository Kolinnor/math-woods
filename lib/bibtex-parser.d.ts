// Version 10.0.1 does not ship the declaration files advertised by its package.
declare module "@retorquere/bibtex-parser" {
  export function parse(input: string, options?: { raw?: boolean; unsupported?: "ignore"; verbatimFields?: RegExp[]; removeOuterBraces?: string[]; applyCrossRef?: boolean; sentenceCase?: false; caseProtection?: false }): {
    errors: Array<{ message?: string }>;
    entries: Array<{ type: string; key: string; fields: Record<string, unknown>; input: string }>;
    strings: Record<string, string>;
    preamble: string[];
  };
}
