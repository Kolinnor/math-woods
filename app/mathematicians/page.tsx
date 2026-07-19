import { ExternalLink } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getInterfaceLocale } from "@/lib/i18n/server";

type FigureKey = "euler" | "gauss" | "riemann" | "kovalevskaya" | "noether" | "ramanujan";

const figures: Array<{
  key: FigureKey;
  name: string;
  lifespan: string;
  image: string;
  source: string;
  signature: string;
  portraitPosition?: string;
}> = [
  {
    key: "euler",
    name: "Leonhard Euler",
    lifespan: "1707-1783",
    image: "/mathematicians/leonhard-euler.jpg",
    source: "https://commons.wikimedia.org/wiki/File:Leonhard_Euler.jpg",
    signature: "e^(iπ) + 1 = 0"
  },
  {
    key: "gauss",
    name: "Carl Friedrich Gauss",
    lifespan: "1777-1855",
    image: "/mathematicians/carl-friedrich-gauss.jpg",
    source: "https://commons.wikimedia.org/wiki/File:Carl_Friedrich_Gauss.jpg",
    signature: "a ≡ b (mod n)"
  },
  {
    key: "riemann",
    name: "Bernhard Riemann",
    lifespan: "1826-1866",
    image: "/mathematicians/bernhard-riemann.jpg",
    source: "https://commons.wikimedia.org/wiki/File:Portrait_of_Bernhard_Riemann_(1826-1866),_Mathematician_(2551069295).jpg",
    signature: "ζ(s)"
  },
  {
    key: "kovalevskaya",
    name: "Sofia Kovalevskaya",
    lifespan: "1850-1891",
    image: "/mathematicians/sofia-kovalevskaya.jpg",
    source: "https://commons.wikimedia.org/wiki/File:Sofia_Kovalevskaya.jpg",
    signature: "∂u / ∂t",
    portraitPosition: "center 30%"
  },
  {
    key: "noether",
    name: "Emmy Noether",
    lifespan: "1882-1935",
    image: "/mathematicians/emmy-noether.jpg",
    source: "https://commons.wikimedia.org/wiki/File:Noether.jpg",
    signature: "symmetry ↔ conservation"
  },
  {
    key: "ramanujan",
    name: "Srinivasa Ramanujan",
    lifespan: "1887-1920",
    image: "/mathematicians/srinivasa-ramanujan.jpg",
    source: "https://commons.wikimedia.org/wiki/File:Srinivasa_Ramanujan.jpg",
    signature: "p(n)"
  }
];

const copy = {
  en: {
    eyebrow: "History of mathematics",
    title: "Mathematicians",
    description: "The people behind ideas that changed how mathematics is written, imagined, and used.",
    meta: "Six lives, three centuries",
    heading: "Lives behind the ideas",
    introduction: "A first collection of mathematicians whose work still shapes the concepts and problems encountered throughout Math Woods.",
    knownFor: "Known for",
    portraitAlt: (name: string) => `Portrait of ${name}`,
    portraitSource: (name: string) => `Portrait source for ${name}`,
    portraitCredits: "Portraits are public-domain archival images from Wikimedia Commons.",
    figures: {
      euler: {
        origin: "Basel, Switzerland",
        fields: ["Analysis", "Number theory", "Graph theory"],
        summary: "An exceptionally prolific mathematician who helped establish the language and notation of modern mathematics.",
        legacy: "Euler's identity, the foundations of graph theory, major work on infinite series, mechanics, and number theory."
      },
      gauss: {
        origin: "Brunswick, Germany",
        fields: ["Number theory", "Geometry", "Astronomy"],
        summary: "Known as the prince of mathematicians, Gauss connected deep pure mathematics with measurement and observation.",
        legacy: "Congruences, the fundamental theorem of algebra, Gaussian curvature, least squares, and the normal distribution."
      },
      riemann: {
        origin: "Kingdom of Hanover",
        fields: ["Geometry", "Complex analysis", "Number theory"],
        summary: "In a short career, Riemann transformed geometry and opened questions that still organize modern research.",
        legacy: "Riemannian geometry, Riemann surfaces and integration, and the hypothesis concerning the zeros of the zeta function."
      },
      kovalevskaya: {
        origin: "Moscow, Russian Empire",
        fields: ["Analysis", "Differential equations", "Mechanics"],
        summary: "A pioneering analyst whose career broke institutional barriers for women in European mathematics.",
        legacy: "The Cauchy-Kovalevskaya theorem, work on partial differential equations, and the Kovalevskaya top."
      },
      noether: {
        origin: "Erlangen, Germany",
        fields: ["Abstract algebra", "Physics", "Invariant theory"],
        summary: "Noether recast algebra around structures and proved one of the deepest bridges between mathematics and physics.",
        legacy: "Noether's theorem linking symmetries to conservation laws, and foundational ideas in rings, ideals, and modules."
      },
      ramanujan: {
        origin: "Erode, India",
        fields: ["Number theory", "Infinite series", "Combinatorics"],
        summary: "Largely self-taught, Ramanujan discovered striking identities whose depth continues to unfold.",
        legacy: "Partition formulas, continued fractions, rapidly convergent series, modular forms, and mock theta functions."
      }
    }
  },
  fr: {
    eyebrow: "Histoire des mathématiques",
    title: "Mathématiciens",
    description: "Les personnes derrière les idées qui ont transformé la manière d'écrire, d'imaginer et d'utiliser les mathématiques.",
    meta: "Six destins, trois siècles",
    heading: "Derrière les idées",
    introduction: "Une première collection de mathématiciens dont les travaux structurent encore les concepts et les problèmes rencontrés dans Math Woods.",
    knownFor: "Travaux majeurs",
    portraitAlt: (name: string) => `Portrait de ${name}`,
    portraitSource: (name: string) => `Source du portrait de ${name}`,
    portraitCredits: "Les portraits sont des images d'archives du domaine public provenant de Wikimedia Commons.",
    figures: {
      euler: {
        origin: "Bâle, Suisse",
        fields: ["Analyse", "Théorie des nombres", "Théorie des graphes"],
        summary: "Un mathématicien d'une productivité exceptionnelle qui a contribué à fixer le langage et les notations des mathématiques modernes.",
        legacy: "L'identité d'Euler, les fondements de la théorie des graphes, et des travaux majeurs sur les séries, la mécanique et les nombres."
      },
      gauss: {
        origin: "Brunswick, Allemagne",
        fields: ["Théorie des nombres", "Géométrie", "Astronomie"],
        summary: "Surnommé le prince des mathématiciens, Gauss a relié les mathématiques les plus abstraites à la mesure et à l'observation.",
        legacy: "Les congruences, le théorème fondamental de l'algèbre, la courbure de Gauss, les moindres carrés et la loi normale."
      },
      riemann: {
        origin: "Royaume de Hanovre",
        fields: ["Géométrie", "Analyse complexe", "Théorie des nombres"],
        summary: "En une courte carrière, Riemann a transformé la géométrie et ouvert des questions qui structurent encore la recherche moderne.",
        legacy: "La géométrie riemannienne, les surfaces et l'intégration de Riemann, ainsi que l'hypothèse sur les zéros de la fonction zêta."
      },
      kovalevskaya: {
        origin: "Moscou, Empire russe",
        fields: ["Analyse", "Équations différentielles", "Mécanique"],
        summary: "Une pionnière de l'analyse dont la carrière a levé des barrières institutionnelles pour les femmes en mathématiques.",
        legacy: "Le théorème de Cauchy-Kovalevskaya, les équations aux dérivées partielles et la toupie de Kovalevskaya."
      },
      noether: {
        origin: "Erlangen, Allemagne",
        fields: ["Algèbre abstraite", "Physique", "Théorie des invariants"],
        summary: "Noether a réorganisé l'algèbre autour des structures et établi l'un des liens les plus profonds entre mathématiques et physique.",
        legacy: "Le théorème reliant symétries et lois de conservation, ainsi que des idées fondatrices sur les anneaux, idéaux et modules."
      },
      ramanujan: {
        origin: "Erode, Inde",
        fields: ["Théorie des nombres", "Séries infinies", "Combinatoire"],
        summary: "En grande partie autodidacte, Ramanujan a découvert des identités saisissantes dont la profondeur continue de se révéler.",
        legacy: "Les formules de partitions, les fractions continues, les séries rapidement convergentes, les formes modulaires et les fonctions thêta mock."
      }
    }
  }
} as const;

export default async function MathematiciansPage() {
  const locale = await getInterfaceLocale();
  const text = copy[locale];

  return (
    <ForestPageLayout
      className="historical-mathematicians-page"
      title={text.title}
      eyebrow={text.eyebrow}
      heroImage="/art/birch-grove.jpg"
      heroAlt="A sunlit birch grove"
      description={text.description}
      meta={<p>{text.meta}</p>}
    >
      <header className="historical-mathematicians-intro">
        <h2>{text.heading}</h2>
        <p>{text.introduction}</p>
      </header>

      <div className="historical-mathematician-grid">
        {figures.map((figure, index) => {
          const biography = text.figures[figure.key];
          return (
            <article className="historical-mathematician-card" key={figure.key}>
              <div className="historical-mathematician-portrait">
                <img
                  src={figure.image}
                  alt={text.portraitAlt(figure.name)}
                  style={figure.portraitPosition ? { objectPosition: figure.portraitPosition } : undefined}
                />
                <span className="historical-mathematician-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <a
                  href={figure.source}
                  target="_blank"
                  rel="noreferrer"
                  className="historical-mathematician-source"
                  aria-label={text.portraitSource(figure.name)}
                  title={text.portraitSource(figure.name)}
                >
                  <ExternalLink size={15} aria-hidden="true" />
                </a>
              </div>
              <div className="historical-mathematician-body">
                <div className="historical-mathematician-heading">
                  <div>
                    <p>{biography.origin}</p>
                    <h2>{figure.name}</h2>
                  </div>
                  <span>{figure.lifespan}</span>
                </div>
                <p className="historical-mathematician-summary">{biography.summary}</p>
                <div className="historical-mathematician-fields">
                  {biography.fields.map((field) => <span key={field}>{field}</span>)}
                </div>
                <div className="historical-mathematician-legacy">
                  <span>{text.knownFor}</span>
                  <p>{biography.legacy}</p>
                </div>
                <p className="historical-mathematician-signature" aria-hidden="true">{figure.signature}</p>
              </div>
            </article>
          );
        })}
      </div>
      <p className="historical-mathematician-credits">{text.portraitCredits}</p>
    </ForestPageLayout>
  );
}
