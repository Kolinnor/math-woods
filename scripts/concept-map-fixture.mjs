// Creates (or removes) a synthetic but representative concept graph in a LOCAL database, to
// check the /concepts map rendering and measure its performance.
//
//   node scripts/concept-map-fixture.mjs --concepts 400        # create about 400 concepts
//   node scripts/concept-map-fixture.mjs --clean               # remove every fixture row
//
// Every fixture slug starts with "mwmap-". The script refuses non-local databases.
import { PrismaClient } from "@prisma/client";

const PREFIX = "mwmap-";
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const databaseUrl = process.env.DATABASE_URL ?? "";
let databaseHost = "";
try {
  databaseHost = new URL(databaseUrl).hostname;
} catch {
  databaseHost = "";
}
if (!["localhost", "127.0.0.1", "::1", "postgres", "db"].includes(databaseHost)) {
  console.error(`Refusing to touch a non-local database (${databaseHost || "unknown host"}).`);
  process.exit(1);
}

const prisma = new PrismaClient();

// Deterministic pseudo-random generator, so that two runs produce the same graph.
let seed = Number(option("seed", "20260924")) >>> 0;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function weightedPick(entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let threshold = random() * total;
  for (const [value, weight] of entries) {
    threshold -= weight;
    if (threshold <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function slugify(input) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

// [domainCode, weight, [[fr, en], ...]]
const VOCABULARY = [
  ["logic-set-theory", 5, [["Ensemble", "Set"], ["Relation d'équivalence", "Equivalence relation"], ["Application", "Map"], ["Cardinal", "Cardinal number"], ["Axiome du choix", "Axiom of choice"], ["Lemme de Zorn", "Zorn's lemma"], ["Ensemble dénombrable", "Countable set"], ["Produit cartésien", "Cartesian product"], ["Relation d'ordre", "Order relation"], ["Bijection", "Bijection"]]],
  ["logic", 2, [["Proposition", "Proposition"], ["Quantificateur", "Quantifier"], ["Raisonnement par récurrence", "Proof by induction"], ["Contraposée", "Contrapositive"], ["Théorème d'incomplétude de Gödel", "Gödel's incompleteness theorem"]]],
  ["category-theory", 2, [["Catégorie", "Category"], ["Foncteur", "Functor"], ["Transformation naturelle", "Natural transformation"], ["Lemme de Yoneda", "Yoneda lemma"], ["Adjonction", "Adjunction"], ["Limite (catégories)", "Limit (categories)"]]],
  ["algebra-groups", 8, [["Groupe", "Group"], ["Sous-groupe", "Subgroup"], ["Sous-groupe distingué", "Normal subgroup"], ["Groupe quotient", "Quotient group"], ["Théorème de Lagrange", "Lagrange's theorem"], ["Groupe symétrique", "Symmetric group"], ["Groupe $\\mathbb{Z}/n\\mathbb{Z}$", "Group $\\mathbb{Z}/n\\mathbb{Z}$"], ["Théorèmes de Sylow", "Sylow theorems"], ["Morphisme de groupes", "Group homomorphism"], ["Groupe abélien", "Abelian group"], ["Ordre d'un élément", "Order of an element"], ["Groupe cyclique", "Cyclic group"], ["Action de groupe", "Group action"], ["Formule des classes", "Class equation"]]],
  ["algebra-rings", 6, [["Anneau", "Ring"], ["Idéal", "Ideal"], ["Anneau principal", "Principal ideal domain"], ["Anneau euclidien", "Euclidean domain"], ["Anneau factoriel", "Unique factorization domain"], ["Anneau quotient", "Quotient ring"], ["Idéal maximal", "Maximal ideal"], ["Idéal premier", "Prime ideal"], ["Anneau intègre", "Integral domain"]]],
  ["algebra-fields", 5, [["Corps", "Field"], ["Extension de corps", "Field extension"], ["Corps fini", "Finite field"], ["Polynôme minimal", "Minimal polynomial"], ["Clôture algébrique", "Algebraic closure"], ["Théorie de Galois", "Galois theory"], ["Corps de rupture", "Splitting field"]]],
  ["linear-algebra", 12, [["Espace vectoriel", "Vector space"], ["Application linéaire", "Linear map"], ["Matrice", "Matrix"], ["Déterminant", "Determinant"], ["Rang", "Rank"], ["Théorème du rang", "Rank–nullity theorem"], ["Base", "Basis"], ["Dimension", "Dimension"], ["Valeur propre", "Eigenvalue"], ["Diagonalisation", "Diagonalization"], ["Polynôme caractéristique", "Characteristic polynomial"], ["Théorème de Cayley-Hamilton", "Cayley–Hamilton theorem"], ["Sous-espace vectoriel", "Linear subspace"], ["Supplémentaire d'un sous-espace vectoriel", "Complementary subspace"], ["Projection linéaire", "Linear projection"], ["Trace", "Trace"], ["Dual d'un espace vectoriel", "Dual space"], ["Réduction de Jordan", "Jordan normal form"], ["Endomorphisme nilpotent", "Nilpotent endomorphism"], ["Produit scalaire", "Inner product"], ["Espace euclidien", "Euclidean space"], ["Théorème spectral", "Spectral theorem"], ["Groupe orthogonal $O(n)$", "Orthogonal group $O(n)$"]]],
  ["arithmetic", 8, [["Nombre premier", "Prime number"], ["Divisibilité", "Divisibility"], ["PGCD", "Greatest common divisor"], ["Théorème de Bézout", "Bézout's identity"], ["Lemme de Gauss", "Euclid's lemma"], ["Congruence", "Congruence"], ["Petit théorème de Fermat", "Fermat's little theorem"], ["Indicatrice d'Euler $\\varphi$", "Euler's totient $\\varphi$"], ["Théorème des restes chinois", "Chinese remainder theorem"], ["Décomposition en facteurs premiers", "Prime factorization"], ["Algorithme d'Euclide", "Euclidean algorithm"], ["Nombre rationnel", "Rational number"], ["Irrationalité de $\\sqrt{2}$", "Irrationality of $\\sqrt{2}$"]]],
  ["number-theory", 3, [["Réciprocité quadratique", "Quadratic reciprocity"], ["Symbole de Legendre", "Legendre symbol"], ["Fonction zêta de Riemann $\\zeta$", "Riemann zeta function $\\zeta$"], ["Théorème des nombres premiers", "Prime number theorem"]]],
  ["geometry", 5, [["Triangle", "Triangle"], ["Théorème de Pythagore", "Pythagorean theorem"], ["Théorème de Thalès", "Intercept theorem"], ["Cercle", "Circle"], ["Isométrie", "Isometry"], ["Barycentre", "Barycenter"], ["Convexité", "Convexity"], ["Géométrie projective", "Projective geometry"]]],
  ["differential-geometry", 3, [["Variété différentielle", "Differentiable manifold"], ["Espace tangent", "Tangent space"], ["Forme différentielle", "Differential form"], ["Courbure", "Curvature"], ["Sous-variété", "Submanifold"]]],
  ["general-topology", 11, [["Espace topologique", "Topological space"], ["Ensemble ouvert", "Open set"], ["Ensemble fermé", "Closed set"], ["Compacité", "Compactness"], ["Connexité", "Connectedness"], ["Espace métrique", "Metric space"], ["Continuité", "Continuity"], ["Homéomorphisme", "Homeomorphism"], ["Adhérence", "Closure"], ["Intérieur", "Interior"], ["Espace séparé", "Hausdorff space"], ["Théorème de Heine", "Heine–Cantor theorem"], ["Théorème de Borel-Lebesgue", "Heine–Borel theorem"], ["Espace complet", "Complete metric space"], ["Suite de Cauchy", "Cauchy sequence"], ["Théorème du point fixe de Banach", "Banach fixed-point theorem"], ["Espace vectoriel normé", "Normed vector space"], ["Normes équivalentes", "Equivalent norms"], ["Densité", "Dense set"], ["Topologie produit", "Product topology"], ["Fonction lipschitzienne", "Lipschitz function"]]],
  ["algebraic-topology", 4, [["Homotopie", "Homotopy"], ["Groupe fondamental $\\pi_1$", "Fundamental group $\\pi_1$"], ["Revêtement", "Covering space"], ["Homologie", "Homology"], ["Isotopie", "Isotopy"], ["Théorème de Van Kampen", "Seifert–Van Kampen theorem"], ["Caractéristique d'Euler $\\chi$", "Euler characteristic $\\chi$"]]],
  ["real-analysis", 12, [["Suite réelle", "Real sequence"], ["Limite d'une suite", "Limit of a sequence"], ["Série numérique", "Series"], ["Continuité uniforme", "Uniform continuity"], ["Dérivabilité", "Differentiability"], ["Théorème des accroissements finis", "Mean value theorem"], ["Théorème de Rolle", "Rolle's theorem"], ["Formule de Taylor", "Taylor's theorem"], ["Intégrale de Riemann", "Riemann integral"], ["Théorème des valeurs intermédiaires", "Intermediate value theorem"], ["Borne supérieure", "Supremum"], ["Série entière", "Power series"], ["Rayon de convergence", "Radius of convergence"], ["Convergence uniforme", "Uniform convergence"], ["Fonction exponentielle", "Exponential function"], ["Développement limité", "Taylor expansion"], ["Intégrale généralisée", "Improper integral"], ["Critère de d'Alembert", "Ratio test"], ["Fonction convexe", "Convex function"], ["Théorème de Bolzano-Weierstrass", "Bolzano–Weierstrass theorem"]]],
  ["functional-analysis", 5, [["Espace de Banach", "Banach space"], ["Espace de Hilbert", "Hilbert space"], ["Espace $L^p$", "$L^p$ space"], ["Théorème de Hahn-Banach", "Hahn–Banach theorem"], ["Opérateur borné", "Bounded operator"], ["Mesure de Lebesgue", "Lebesgue measure"], ["Théorème de convergence dominée", "Dominated convergence theorem"], ["Tribu", "σ-algebra"], ["Distribution", "Distribution"]]],
  ["complex-analysis", 4, [["Fonction holomorphe", "Holomorphic function"], ["Théorème de Cauchy", "Cauchy's integral theorem"], ["Théorème des résidus", "Residue theorem"], ["Série de Laurent", "Laurent series"], ["Série de Fourier", "Fourier series"], ["Théorème de Liouville", "Liouville's theorem"]]],
  ["several-variable-functions", 3, [["Différentielle", "Differential"], ["Dérivée partielle", "Partial derivative"], ["Matrice jacobienne", "Jacobian matrix"], ["Théorème des fonctions implicites", "Implicit function theorem"], ["Transformée de Fourier", "Fourier transform"]]],
  ["differential-equations", 4, [["Équation différentielle linéaire", "Linear differential equation"], ["Théorème de Cauchy-Lipschitz", "Picard–Lindelöf theorem"], ["Wronskien", "Wronskian"], ["Équation de la chaleur", "Heat equation"], ["Lemme de Grönwall", "Grönwall's inequality"]]],
  ["probability-statistics", 6, [["Probabilité", "Probability"], ["Variable aléatoire", "Random variable"], ["Espérance", "Expected value"], ["Variance", "Variance"], ["Loi des grands nombres", "Law of large numbers"], ["Théorème central limite", "Central limit theorem"], ["Indépendance", "Independence"], ["Loi binomiale", "Binomial distribution"], ["Chaîne de Markov", "Markov chain"], ["Inégalité de Bienaymé-Tchebychev", "Chebyshev's inequality"]]],
  ["graphs-discrete-math", 5, [["Graphe", "Graph"], ["Arbre", "Tree"], ["Coefficient binomial", "Binomial coefficient"], ["Principe des tiroirs", "Pigeonhole principle"], ["Dénombrement", "Counting"], ["Graphe biparti", "Bipartite graph"], ["Coloration de graphes", "Graph coloring"], ["Formule du crible", "Inclusion–exclusion principle"]]],
  ["computation", 3, [["Inégalité de Cauchy-Schwarz", "Cauchy–Schwarz inequality"], ["Inégalité arithmético-géométrique", "AM–GM inequality"], ["Équivalent", "Asymptotic equivalence"], ["Notation de Landau $O$", "Big $O$ notation"]]],
  ["applied-mathematics", 2, [["Méthode de Newton", "Newton's method"], ["Optimisation convexe", "Convex optimization"], ["Méthode des moindres carrés", "Least squares"]]],
  ["other", 4, [["Nombre d'or", "Golden ratio"], ["Fraction continue", "Continued fraction"], ["Paradoxe de Banach-Tarski", "Banach–Tarski paradox"]]]
];
const PROPER = /^(PGCD|[A-Z][\p{L}]+(?:[–-][A-Z]|'s|’s| [A-Z])|Gödel|Cauchy|Euler|Fermat|Taylor|Newton|Fourier|Galois|Riemann|Lagrange|Bézout|Rolle|Zorn|Yoneda|Jordan|Hilbert|Banach|Markov|Laurent|Liouville|Heine|Borel|Bolzano|Grönwall|Chebyshev|Legendre|Sylow)/u;
const lower = (text) => (PROPER.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));
const ofFr = (text) => (/^[aeiouyéèêàâîïôh]/i.test(text) ? `d’${lower(text)}` : `de ${lower(text)}`);
// Variants used once a domain has used all its base notions: plausible titles, never numbered.
const QUALIFIERS = [
  [(b) => `Exemple : ${lower(b)}`, (b) => `Example: ${lower(b)}`],
  [(b) => `Caractérisation ${ofFr(b)}`, (b) => `Characterization of ${lower(b)}`],
  [(b) => `Propriétés ${ofFr(b)}`, (b) => `Properties of ${lower(b)}`],
  [(b) => `Généralisation ${ofFr(b)}`, (b) => `Generalization of ${lower(b)}`],
  [(b) => `Contre-exemple : ${lower(b)}`, (b) => `Counterexample: ${lower(b)}`],
  [(b) => `Applications ${ofFr(b)}`, (b) => `Applications of ${lower(b)}`],
  [(b) => `Cas particulier : ${lower(b)}`, (b) => `Special case: ${lower(b)}`],
  [(b) => `Version forte : ${lower(b)}`, (b) => `Strong version: ${lower(b)}`],
  [(b) => `Réciproque : ${lower(b)}`, (b) => `Converse: ${lower(b)}`],
  [(b) => `Variante ${ofFr(b)}`, (b) => `Variant of ${lower(b)}`],
  [(b) => `Histoire ${ofFr(b)}`, (b) => `History of ${lower(b)}`],
  [(b) => `Critère pour ${lower(b)}`, (b) => `Criterion for ${lower(b)}`]
];
const NAMES = [
  "Cauchy", "Riemann", "Hilbert", "Noether", "Galois", "Euler", "Gauss", "Lagrange", "Fourier", "Laplace",
  "Poincaré", "Cantor", "Dedekind", "Weierstrass", "Banach", "Lebesgue", "Borel", "Hausdorff", "Kolmogorov", "Markov",
  "Abel", "Jacobi", "Sylow", "Frobenius", "Hadamard", "Picard", "Liouville", "Dirichlet", "Chebyshev", "Minkowski",
  "Zariski", "Grothendieck", "Cartan", "Serre", "Weyl", "Artin", "Hermite", "Legendre", "Möbius", "Stokes"
];

function variantTitle(words, rank) {
  const bases = words.length;
  let k = rank;
  if (k < QUALIFIERS.length * bases) {
    const [fr, en] = QUALIFIERS[k % QUALIFIERS.length];
    const [baseFr, baseEn] = words[Math.floor(k / QUALIFIERS.length)];
    return [fr(baseFr), en(baseEn)];
  }
  k -= QUALIFIERS.length * bases;
  if (k < NAMES.length * bases) {
    const name = NAMES[k % NAMES.length];
    const [baseFr, baseEn] = words[Math.floor(k / NAMES.length)];
    return [`Lemme de ${name} : ${lower(baseFr)}`, `${name}'s lemma: ${lower(baseEn)}`];
  }
  k -= NAMES.length * bases;
  const first = NAMES[k % NAMES.length];
  const second = NAMES[(Math.floor(k / NAMES.length) % (NAMES.length - 1) + 1 + (k % NAMES.length)) % NAMES.length];
  const [baseFr, baseEn] = words[Math.floor(k / (NAMES.length * (NAMES.length - 1))) % bases];
  return [`Théorème de ${first}–${second} : ${lower(baseFr)}`, `${first}–${second} theorem: ${lower(baseEn)}`];
}

async function clean() {
  const concepts = await prisma.concept.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } });
  const ids = concepts.map(({ id }) => id);
  // Databases limit the number of query parameters: remove in chunks.
  const chunks = [];
  for (let start = 0; start < ids.length; start += 10000) chunks.push(ids.slice(start, start + 10000));
  const total = { links: 0, redirects: 0, concepts: 0 };
  for (const chunk of chunks) total.links += (await prisma.internalLink.deleteMany({ where: { sourceType: "CONCEPT", sourceId: { in: chunk } } })).count;
  total.redirects += (await prisma.conceptRedirect.deleteMany({ where: { sourceSlug: { startsWith: PREFIX } } })).count;
  for (const chunk of chunks) total.redirects += (await prisma.conceptRedirect.deleteMany({ where: { targetConceptId: { in: chunk } } })).count;
  for (const chunk of chunks) await prisma.concept.updateMany({ where: { id: { in: chunk } }, data: { translatedFromConceptId: null } });
  for (const chunk of chunks) total.concepts += (await prisma.concept.deleteMany({ where: { id: { in: chunk } } })).count;
  console.log(`Removed ${total.concepts} fixture concepts, ${total.links} links and ${total.redirects} redirects.`);
}

async function create(target) {
  const groups = [];
  const usedSlugs = new Set();
  const uniqueSlug = (title) => {
    const base = `${PREFIX}${slugify(title) || "concept"}`;
    let slug = base;
    for (let suffix = 2; usedSlugs.has(slug); suffix += 1) slug = `${base}-${suffix}`;
    usedSlugs.add(slug);
    return slug;
  };
  const pools = VOCABULARY.map(([domainCode, weight, words]) => ({ domainCode, weight, words: [...words], next: 0, variant: 0 }));

  for (let index = 0; index < target; index += 1) {
    const pool = weightedPick(pools.map((item) => [item, item.weight]));
    let fr;
    let en;
    if (pool.next < pool.words.length) {
      [fr, en] = pool.words[pool.next];
      pool.next += 1;
    } else {
      [fr, en] = variantTitle(pool.words, pool.variant);
      pool.variant += 1;
    }
    const languageRoll = random();
    const languages = languageRoll < 0.45 ? (random() < 0.7 ? ["fr", "en"] : ["en", "fr"]) : languageRoll < 0.8 ? ["fr"] : ["en"];
    const statusRoll = random();
    const status = statusRoll < 0.03 && languages.length === 1 ? "MISSING"
      : statusRoll < 0.33 ? "STUB" : statusRoll < 0.83 ? "USABLE" : statusRoll < 0.95 ? "REVIEWED" : statusRoll < 0.98 ? "EXCELLENT" : "CONTROVERSIAL";
    const kind = /^(Théorème|Lemme|Petit théorème|Loi|Formule|Inégalité|Principe|Critère)/.test(fr) ? "THEOREM" : weightedPick([["DEFINITION", 80], ["INTUITIVE_NOTION", 12], ["NOTATION", 8]]);
    groups.push({
      index,
      domainCode: pool.domainCode,
      groupId: `mwmap-group-${String(index).padStart(5, "0")}`,
      status,
      kind,
      translations: languages.map((language) => {
        const title = language === "fr" ? fr : en;
        return { language, title, slug: uniqueSlug(title) };
      }),
      alias: random() < 0.25 ? `${languages[0] === "fr" ? "Notion de" : "Notion of"} ${(languages[0] === "fr" ? fr : en).toLowerCase()}` : null,
      renamedFrom: random() < 0.04 ? uniqueSlug(`ancien ${fr}`) : null,
      mergedFrom: random() < 0.015 ? uniqueSlug(`doublon ${fr}`) : null,
      out: []
    });
  }

  // Citations: mostly inside a domain, towards popular concepts (copying the target of an
  // existing citation is a preferential attachment in constant time, even for 50 000 concepts).
  const byDomain = new Map();
  for (const group of groups) {
    if (!byDomain.has(group.domainCode)) byDomain.set(group.domainCode, []);
    byDomain.get(group.domainCode).push(group);
  }
  const citedByDomain = new Map();
  const cited = [];
  const randomItem = (items) => items[Math.floor(random() * items.length)];
  for (const group of groups) {
    const outCount = random() < 0.18 ? 0 : Math.min(14, Math.floor(-Math.log(1 - random()) * 3));
    for (let citation = 0; citation < outCount; citation += 1) {
      const sameDomain = random() < 0.72;
      const pool = sameDomain ? byDomain.get(group.domainCode) : groups;
      const popular = sameDomain ? citedByDomain.get(group.domainCode) ?? [] : cited;
      let target = null;
      for (let attempt = 0; attempt < 6 && !target; attempt += 1) {
        const candidate = popular.length && random() < 0.55 ? randomItem(popular) : randomItem(pool);
        if (candidate !== group && !group.out.includes(candidate.index)) target = candidate;
      }
      if (!target) continue;
      group.out.push(target.index);
      cited.push(target);
      if (!citedByDomain.has(target.domainCode)) citedByDomain.set(target.domainCode, []);
      citedByDomain.get(target.domainCode).push(target);
    }
  }

  const bodyFor = (group, language) => {
    const references = group.out.map((targetIndex) => {
      const targetGroup = groups[targetIndex];
      const translation = targetGroup.translations.find((item) => item.language === language) ?? targetGroup.translations[0];
      return `[[${translation.title}]]`;
    });
    return `${language === "fr" ? "Concept de démonstration pour la carte." : "Demonstration concept for the map."} ${references.join(", ")}`;
  };

  const createConcepts = async (data) => {
    const rows = [];
    for (let offset = 0; offset < data.length; offset += 2000) {
      rows.push(...(await prisma.concept.createManyAndReturn({ data: data.slice(offset, offset + 2000), select: { id: true, slug: true } })));
    }
    return rows;
  };
  const sourceRows = await createConcepts(
    groups.map((group) => {
      const translation = group.translations[0];
      const bodyMarkdown = bodyFor(group, translation.language);
      return {
        slug: translation.slug, title: translation.title, language: translation.language,
        translationGroupId: group.groupId, domainCode: group.domainCode, kind: group.kind, status: group.status,
        bodyMarkdown, bodyHtml: `<p>${bodyMarkdown}</p>`
      };
    })
  );
  const idBySlug = new Map(sourceRows.map((row) => [row.slug, row.id]));
  const translationRows = await createConcepts(
    groups.filter((group) => group.translations.length > 1).map((group) => {
      const translation = group.translations[1];
      const bodyMarkdown = bodyFor(group, translation.language);
      return {
        slug: translation.slug, title: translation.title, language: translation.language,
        translationGroupId: group.groupId, translatedFromConceptId: idBySlug.get(group.translations[0].slug),
        domainCode: group.domainCode, kind: group.kind, status: group.status === "MISSING" ? "STUB" : group.status,
        bodyMarkdown, bodyHtml: `<p>${bodyMarkdown}</p>`
      };
    })
  );
  for (const row of translationRows) idBySlug.set(row.slug, row.id);

  await prisma.conceptAlias.createMany({
    data: groups.filter((group) => group.alias).map((group) => ({
      conceptId: idBySlug.get(group.translations[0].slug), alias: group.alias, aliasSlug: uniqueSlug(group.alias)
    }))
  });
  const aliases = await prisma.conceptAlias.findMany({ where: { aliasSlug: { startsWith: PREFIX } }, select: { conceptId: true, aliasSlug: true } });
  const aliasSlugByConcept = new Map(aliases.map((alias) => [alias.conceptId, alias.aliasSlug]));
  await prisma.conceptRedirect.createMany({
    data: groups.flatMap((group) => {
      const target = group.translations[0];
      const common = { sourceConceptId: idBySlug.get(target.slug), sourceTitle: target.title, sourceLanguage: target.language, sourceTranslationGroupId: group.groupId, targetConceptId: idBySlug.get(target.slug) };
      return [
        ...(group.renamedFrom ? [{ ...common, sourceSlug: group.renamedFrom, isRename: true }] : []),
        ...(group.mergedFrom ? [{ ...common, sourceSlug: group.mergedFrom, isRename: false }] : [])
      ];
    })
  });

  // InternalLink rows as syncInternalLinks would leave them, with the historical variants
  // (alias slugs, renamed slugs, merged duplicates, sibling translations, missing targets).
  const links = [];
  for (const group of groups) {
    for (const translation of group.translations) {
      const sourceId = idBySlug.get(translation.slug);
      const seen = new Set();
      for (const targetIndex of group.out) {
        const targetGroup = groups[targetIndex];
        const sameLanguage = targetGroup.translations.find((item) => item.language === translation.language);
        const roll = random();
        const targetSlug = roll < 0.08 && aliasSlugByConcept.has(idBySlug.get(targetGroup.translations[0].slug))
          ? aliasSlugByConcept.get(idBySlug.get(targetGroup.translations[0].slug))
          : roll < 0.14 && targetGroup.renamedFrom ? targetGroup.renamedFrom
            : roll < 0.16 && targetGroup.mergedFrom ? targetGroup.mergedFrom
              : (sameLanguage ?? targetGroup.translations[0]).slug;
        if (seen.has(targetSlug)) continue;
        seen.add(targetSlug);
        links.push({ sourceType: "CONCEPT", sourceId, targetSlug, targetType: "CONCEPT", exists: true, label: targetGroup.translations[0].title });
      }
      if (random() < 0.08) {
        links.push({ sourceType: "CONCEPT", sourceId, targetSlug: `${PREFIX}absent-${group.index}`, targetType: "UNKNOWN", exists: false, label: "Concept absent" });
      }
    }
  }
  for (let offset = 0; offset < links.length; offset += 5000) {
    await prisma.internalLink.createMany({ data: links.slice(offset, offset + 5000), skipDuplicates: true });
  }
  const citations = groups.reduce((sum, group) => sum + group.out.length, 0);
  console.log(`Created ${groups.length} concept groups (${sourceRows.length + translationRows.length} translations), ${citations} citations and ${links.length} InternalLink rows.`);
}

try {
  await clean();
  if (!flag("clean")) await create(Math.max(1, Number(option("concepts", "400")) || 400));
} finally {
  await prisma.$disconnect();
}
