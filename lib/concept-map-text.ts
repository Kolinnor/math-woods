// Client-safe text helpers for the concept map: canvas labels cannot render KaTeX,
// so titles are approximated with Unicode, and search ignores case and accents.

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π",
  varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "φ",
  varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ",
  Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω"
};

const SYMBOLS: Record<string, string> = {
  infty: "∞", to: "→", rightarrow: "→", leftarrow: "←", mapsto: "↦", Rightarrow: "⇒", Leftrightarrow: "⇔",
  iff: "⇔", implies: "⇒", times: "×", cdot: "·", circ: "∘", le: "≤", leq: "≤", ge: "≥", geq: "≥",
  ne: "≠", neq: "≠", approx: "≈", equiv: "≡", sim: "∼", simeq: "≃", cong: "≅", in: "∈", notin: "∉",
  ni: "∋", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇", cup: "∪", cap: "∩",
  bigcup: "⋃", bigcap: "⋂", setminus: "∖", emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃",
  neg: "¬", land: "∧", lor: "∨", wedge: "∧", vee: "∨", oplus: "⊕", otimes: "⊗", partial: "∂",
  nabla: "∇", sum: "Σ", prod: "Π", int: "∫", oint: "∮", ell: "ℓ", hbar: "ℏ", aleph: "ℵ", wp: "℘",
  Re: "ℜ", Im: "ℑ", perp: "⊥", parallel: "∥", mid: "∣", pm: "±", mp: "∓", ldots: "…", cdots: "⋯",
  dots: "…", langle: "⟨", rangle: "⟩", lvert: "|", rvert: "|", vert: "|", lVert: "‖", rVert: "‖",
  Vert: "‖", sqrt: "√", star: "⋆", ast: "∗", dagger: "†", top: "⊤", bot: "⊥", triangle: "△",
  angle: "∠", deg: "deg", det: "det", dim: "dim", ker: "ker", lim: "lim", sup: "sup", inf: "inf",
  max: "max", min: "min", log: "log", ln: "ln", exp: "exp", sin: "sin", cos: "cos", tan: "tan",
  gcd: "gcd", hom: "hom", arg: "arg", quad: " ", qquad: " ", ",": " ", ";": " ", "!": "", " ": " ",
  "{": "{", "}": "}", "|": "‖", "#": "#", "%": "%", "&": "&", "_": "_", "$": "$"
};

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ",
  g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ",
  t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ", "*": "*", "′": "′", "∗": "∗", T: "ᵀ"
};

const SUBSCRIPTS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ",
  l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ"
};

const DOUBLE_STRUCK: Record<string, string> = { C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" };
const SCRIPT: Record<string, string> = { B: "ℬ", E: "ℰ", F: "ℱ", H: "ℋ", I: "ℐ", L: "ℒ", M: "ℳ", R: "ℛ" };
const FRAKTUR: Record<string, string> = { C: "ℭ", H: "ℌ", I: "ℑ", R: "ℜ", Z: "ℨ" };

function styledLetter(letter: string, style: "bb" | "cal" | "frak") {
  const code = letter.codePointAt(0) ?? 0;
  const upper = code >= 65 && code <= 90;
  const lower = code >= 97 && code <= 122;
  if (style === "bb") {
    if (DOUBLE_STRUCK[letter]) return DOUBLE_STRUCK[letter];
    if (upper) return String.fromCodePoint(0x1d538 + code - 65);
    if (lower) return String.fromCodePoint(0x1d552 + code - 97);
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7d8 + code - 48);
  }
  if (style === "cal") {
    if (SCRIPT[letter]) return SCRIPT[letter];
    if (upper) return String.fromCodePoint(0x1d49c + code - 65);
  }
  if (style === "frak") {
    if (FRAKTUR[letter]) return FRAKTUR[letter];
    if (upper) return String.fromCodePoint(0x1d504 + code - 65);
    if (lower) return String.fromCodePoint(0x1d51e + code - 97);
  }
  return letter;
}

function readGroup(source: string, start: number): [content: string, end: number] {
  let index = start;
  while (source[index] === " ") index += 1;
  if (source[index] === "{") {
    let depth = 1;
    let cursor = index + 1;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "\\") cursor += 2;
      else {
        if (source[cursor] === "{") depth += 1;
        if (source[cursor] === "}") depth -= 1;
        cursor += 1;
      }
    }
    return [source.slice(index + 1, cursor - 1), cursor];
  }
  if (source[index] === "\\") {
    const match = /^\\([A-Za-z]+|.)/.exec(source.slice(index));
    return match ? [match[0], index + match[0].length] : ["", index + 1];
  }
  return [source[index] ?? "", index + 1];
}

function scripted(text: string, table: Record<string, string>, marker: "^" | "_") {
  const characters = [...text];
  if (characters.length && characters.every((character) => table[character])) {
    return characters.map((character) => table[character]).join("");
  }
  return characters.length === 1 ? `${marker}${text}` : `${marker}(${text})`;
}

function latexToUnicode(source: string): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (character === "\\") {
      const match = /^\\([A-Za-z]+|.)/.exec(source.slice(index));
      const command = match?.[1] ?? "";
      index += match ? match[0].length : 1;
      if (["mathbb", "mathcal", "mathscr", "mathfrak"].includes(command)) {
        const [content, end] = readGroup(source, index);
        index = end;
        const style = command === "mathbb" ? "bb" : command === "mathfrak" ? "frak" : "cal";
        output += [...latexToUnicode(content)].map((letter) => styledLetter(letter, style)).join("");
      } else if (["mathrm", "mathbf", "mathit", "mathsf", "mathtt", "text", "textrm", "textit", "textbf", "operatorname", "boldsymbol", "bm", "emph"].includes(command)) {
        const [content, end] = readGroup(source, index);
        index = end;
        output += command.startsWith("text") ? content : latexToUnicode(content);
      } else if (["frac", "dfrac", "tfrac"].includes(command)) {
        const [numerator, afterNumerator] = readGroup(source, index);
        const [denominator, end] = readGroup(source, afterNumerator);
        index = end;
        output += `${latexToUnicode(numerator)}/${latexToUnicode(denominator)}`;
      } else if (["overline", "bar", "widehat", "hat", "tilde", "widetilde", "vec", "dot", "ddot", "underline"].includes(command)) {
        const [content, end] = readGroup(source, index);
        index = end;
        const accent = { overline: "\u0305", bar: "\u0304", widehat: "\u0302", hat: "\u0302", tilde: "\u0303", widetilde: "\u0303", vec: "\u20d7", dot: "\u0307", ddot: "\u0308", underline: "\u0332" }[command] ?? "";
        const inner = latexToUnicode(content);
        output += [...inner].length === 1 ? `${inner}${accent}` : inner;
      } else if (["left", "right", "big", "Big", "bigg", "Bigg", "displaystyle", "textstyle", "limits", "nolimits"].includes(command)) {
        // Sizing commands have no plain-text equivalent.
      } else if (GREEK[command]) {
        output += GREEK[command];
      } else if (SYMBOLS[command] !== undefined) {
        output += SYMBOLS[command];
      } else {
        output += command;
      }
      continue;
    }
    if (character === "^" || character === "_") {
      const [content, end] = readGroup(source, index + 1);
      index = end;
      const inner = latexToUnicode(content);
      output += scripted(inner, character === "^" ? SUPERSCRIPTS : SUBSCRIPTS, character);
      continue;
    }
    if (character === "{" || character === "}") {
      index += 1;
      continue;
    }
    if (character === "~") {
      output += " ";
      index += 1;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

/** Converts a Markdown/LaTeX concept title to a single-line Unicode label. */
export function conceptMapLabel(markdown: string): string {
  const withMath = markdown.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\((.+?)\\\)/g, (_, display, inline, paren) =>
    latexToUnicode(String(display ?? inline ?? paren ?? ""))
  );
  return withMath
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__|\*|_|`|~~)(?=\S)([^*_`~]+?)\1/g, "$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!$])/g, "$1")
    // Same typographic apostrophe as displayTypography() on HTML pages.
    .replace(/(\p{L}\p{M}*)'(?=\p{L})/gu, "$1’")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a title needs the rich (KaTeX/Markdown) rendering in HTML panels. */
export function conceptTitleNeedsRichRendering(markdown: string) {
  return /[$\\*_`[]/.test(markdown);
}

/** Lowercase, accent-insensitive form used by the map search. */
export function normalizeConceptMapSearch(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[\^_{}$\\]/g, "")
    .replace(/[^\p{L}\p{N}'+]+/gu, " ")
    .trim();
}
