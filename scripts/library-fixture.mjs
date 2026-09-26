// Fills a LOCAL database with a representative library (mathematicians, history milestones and
// references, linked to each other), to review the library pages with realistic content.
//
//   node scripts/library-fixture.mjs            # create (or recreate) the fixture
//   node scripts/library-fixture.mjs --clean    # remove every fixture row
//
// Every fixture slug starts with "mwlib-". Existing entries are never modified; the script refuses
// non-local databases.
import { PrismaClient } from "@prisma/client";

const PREFIX = "mwlib-";
const clean = process.argv.includes("--clean");

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

// Minimal Markdown for the fixture texts: paragraphs, lists, **bold** and *italics*.
function html(markdown) {
  const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (text) => escape(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  return markdown.trim().split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    if (lines.every((line) => line.startsWith("- "))) return `<ul>${lines.map((line) => `<li>${inline(line.slice(2))}</li>`).join("")}</ul>`;
    return `<p>${inline(lines.join(" "))}</p>`;
  }).join("\n");
}

function sortName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2 || /\b(?:de|du|des|van|von|ibn|ben|al|le|la)\b|\bd['’]/i.test(name)) return name;
  return `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}`;
}

// ---------------------------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------------------------
const references = [
  { key: "elements", type: "BOOK", title: "Les Éléments", authors: "Euclide", translator: "Bernard Vitrac", publisher: "Presses universitaires de France", yearLabel: "1990–2001", year: 1990, volume: "4", fr: "Traduction française annotée des treize livres des *Éléments*, avec une introduction de Maurice Caveing. Le commentaire situe chaque proposition dans l’histoire du texte.", en: "Annotated French translation of the thirteen books of the *Elements*." },
  { key: "boyer", type: "BOOK", title: "A History of Mathematics", authors: "Carl B. Boyer, Uta C. Merzbach", publisher: "Wiley", edition: "3e édition", year: 2011, isbn: "9780470525487", fr: "Une histoire générale des mathématiques, des premiers systèmes de numération au XXe siècle. Un bon point de départ pour situer une personne ou une idée.", en: "A general history of mathematics, from early numeration to the twentieth century." },
  { key: "katz", type: "BOOK", title: "A History of Mathematics: An Introduction", authors: "Victor J. Katz", publisher: "Addison-Wesley", edition: "3e édition", year: 2009, fr: "Manuel d’histoire des mathématiques très complet, qui accorde une large place aux mathématiques chinoises, indiennes et islamiques." },
  { key: "stillwell", type: "BOOK", title: "Mathematics and Its History", authors: "John Stillwell", publisher: "Springer", edition: "3e édition", year: 2010, fr: "Une histoire des idées mathématiques racontée à travers les problèmes qui les ont fait naître.", en: "The history of mathematical ideas told through the problems that gave rise to them." },
  { key: "kline", type: "BOOK", title: "Mathematical Thought from Ancient to Modern Times", authors: "Morris Kline", publisher: "Oxford University Press", year: 1972, fr: "Une somme classique sur l’évolution de la pensée mathématique, de l’Antiquité aux années 1930." },
  { key: "dieudonne", type: "BOOK", title: "Abrégé d’histoire des mathématiques 1700–1900", authors: "Jean Dieudonné (dir.)", publisher: "Hermann", year: 1978, fr: "Histoire des grandes théories mathématiques des XVIIIe et XIXe siècles, écrite par des mathématiciens." },
  { key: "liber-abaci", type: "BOOK", title: "Liber Abaci", authors: "Leonardo Fibonacci", year: 1202, yearLabel: "1202", fr: "Le livre qui a popularisé en Europe les chiffres indo-arabes et le calcul écrit, à travers de nombreux problèmes commerciaux." },
  { key: "al-jabr", type: "BOOK", title: "Abrégé du calcul par la restauration et la comparaison", authors: "Muhammad ibn Musa al-Khwarizmi", yearLabel: "vers 820", year: 820, fr: "Traité qui donne son nom à l’algèbre : il présente des méthodes générales pour résoudre les équations du premier et du second degré." },
  { key: "geometrie", type: "BOOK", title: "La Géométrie", authors: "René Descartes", publisher: "Jan Maire, Leyde", year: 1637, fr: "Publiée en appendice du *Discours de la méthode*, elle relie les courbes aux équations et fonde la géométrie analytique." },
  { key: "principia", type: "BOOK", title: "Philosophiæ Naturalis Principia Mathematica", authors: "Isaac Newton", publisher: "Joseph Streater, Londres", year: 1687, fr: "Les lois du mouvement et la gravitation universelle, démontrées dans un langage géométrique.", en: "The laws of motion and universal gravitation, established in geometric language." },
  { key: "galois-oeuvres", type: "ARTICLE", title: "Œuvres mathématiques d’Évariste Galois", authors: "Évariste Galois", journal: "Journal de mathématiques pures et appliquées", volume: "11", pages: "381–444", year: 1846, fr: "Publication par Joseph Liouville des manuscrits de Galois, quatorze ans après sa mort." },
  { key: "lovelace-notes", type: "ARTICLE", title: "Sketch of the Analytical Engine invented by Charles Babbage, with notes by the translator", authors: "Luigi Federico Menabrea, Ada Lovelace", journal: "Scientific Memoirs", volume: "3", pages: "666–731", year: 1843, fr: "La traduction du mémoire de Menabrea, suivie des notes d’Ada Lovelace, dont un algorithme de calcul des nombres de Bernoulli." },
  { key: "cantor-beitrage", type: "ARTICLE", title: "Beiträge zur Begründung der transfiniten Mengenlehre", authors: "Georg Cantor", journal: "Mathematische Annalen", volume: "46", pages: "481–512", year: 1895, fr: "La présentation d’ensemble de la théorie des nombres cardinaux et ordinaux transfinis." },
  { key: "grundlagen", type: "BOOK", title: "Grundlagen der Geometrie", authors: "David Hilbert", publisher: "Teubner", year: 1899, fr: "Une axiomatisation complète de la géométrie euclidienne, qui a servi de modèle à la méthode axiomatique moderne." },
  { key: "science-hypothese", type: "BOOK", title: "La Science et l’Hypothèse", authors: "Henri Poincaré", publisher: "Flammarion", year: 1902, fr: "Réflexions sur le rôle des conventions et des hypothèses en mathématiques et en physique.", en: "Reflections on the role of conventions and hypotheses in mathematics and physics." },
  { key: "apology", type: "BOOK", title: "A Mathematician’s Apology", authors: "G. H. Hardy", publisher: "Cambridge University Press", year: 1940, fr: "Un court essai sur la beauté des mathématiques pures et le métier de mathématicien." },
  { key: "hardy-wright", type: "BOOK", title: "An Introduction to the Theory of Numbers", authors: "G. H. Hardy, E. M. Wright", publisher: "Clarendon Press", year: 1938, fr: "Un classique de la théorie des nombres, de l’arithmétique élémentaire aux fonctions arithmétiques." },
  { key: "turing-1936", type: "ARTICLE", title: "On Computable Numbers, with an Application to the Entscheidungsproblem", authors: "Alan Turing", journal: "Proceedings of the London Mathematical Society", volume: "s2-42", pages: "230–265", year: 1937, yearLabel: "1936–1937", doi: "10.1112/plms/s2-42.1.230", fr: "L’article qui définit la machine de Turing et montre qu’il n’existe pas de procédure générale de décision.", en: "The paper that defines Turing machines and shows that there is no general decision procedure." },
  { key: "recoltes", type: "BOOK", title: "Récoltes et semailles", authors: "Alexandre Grothendieck", publisher: "Gallimard", year: 2022, volume: "2", fr: "Longue méditation autobiographique sur la découverte mathématique, publiée en deux volumes près de quarante ans après sa rédaction." },
  { key: "wiles-1995", type: "ARTICLE", title: "Modular elliptic curves and Fermat’s Last Theorem", authors: "Andrew Wiles", journal: "Annals of Mathematics", volume: "141", issue: "3", pages: "443–551", year: 1995, doi: "10.2307/2118559", fr: "La démonstration de la conjecture de Shimura–Taniyama–Weil pour les courbes elliptiques semi-stables, d’où découle le dernier théorème de Fermat." },
  { key: "mirzakhani-these", type: "THESIS", title: "Simple geodesics on hyperbolic surfaces and the volume of the moduli space of curves", authors: "Maryam Mirzakhani", publisher: "Harvard University", year: 2004, fr: "Thèse de doctorat, dirigée par Curtis McMullen, qui relie le comptage des géodésiques simples au volume des espaces de modules." },
  { key: "mactutor", type: "WEBSITE", title: "MacTutor History of Mathematics Archive", authors: "John J. O’Connor, Edmund F. Robertson", publisher: "Université de St Andrews", url: "https://mathshistory.st-andrews.ac.uk/", fr: "Des milliers de biographies de mathématiciens et d’articles d’histoire, régulièrement mis à jour.", en: "Thousands of biographies of mathematicians and history articles." },
  { key: "genealogy", type: "DATABASE", title: "Mathematics Genealogy Project", publisher: "North Dakota State University", url: "https://www.mathgenealogy.org/", fr: "Base de données des thèses de mathématiques et des filiations entre directeurs et doctorants." },
  { key: "oeis", type: "DATABASE", title: "On-Line Encyclopedia of Integer Sequences", authors: "Neil J. A. Sloane", publisher: "OEIS Foundation", url: "https://oeis.org/", fr: "L’encyclopédie des suites d’entiers : plus de 370 000 suites, avec formules, références et programmes." },
  { key: "images-maths", type: "WEBSITE", title: "Images des mathématiques", publisher: "CNRS", url: "https://images.math.cnrs.fr/", fr: "Articles de vulgarisation écrits par des chercheurs, sur la recherche actuelle comme sur l’histoire." },
  { key: "3b1b", type: "CHANNEL", title: "3Blue1Brown", authors: "Grant Sanderson", url: "https://www.youtube.com/@3blue1brown", fr: "Vidéos animées qui construisent l’intuition géométrique derrière des résultats classiques." },
  { key: "numberphile", type: "CHANNEL", title: "Numberphile", authors: "Brady Haran", url: "https://www.youtube.com/@numberphile", fr: "Entretiens filmés avec des mathématiciens autour d’un nombre, d’un problème ou d’une anecdote." },
  { key: "neuf-chapitres", type: "BOOK", title: "Les Neuf Chapitres : le classique mathématique de la Chine ancienne et ses commentaires", authors: "Karine Chemla, Guo Shuchun", publisher: "Dunod", year: 2004, fr: "Édition critique bilingue du grand classique chinois, avec les commentaires de Liu Hui.", en: "Critical bilingual edition of the Chinese classic, with Liu Hui’s commentary." },
  { key: "introductio", type: "BOOK", title: "Introductio in analysin infinitorum", authors: "Leonhard Euler", publisher: "Marc-Michel Bousquet, Lausanne", year: 1748, fr: "Le traité qui fait de la fonction l’objet central de l’analyse." },
  { key: "napier", type: "BOOK", title: "Mirifici logarithmorum canonis descriptio", authors: "John Napier", publisher: "Andrew Hart, Édimbourg", year: 1614, fr: "Les premières tables de logarithmes." },
  { key: "godel-1931", type: "ARTICLE", title: "Über formal unentscheidbare Sätze der Principia Mathematica und verwandter Systeme I", authors: "Kurt Gödel", journal: "Monatshefte für Mathematik und Physik", volume: "38", pages: "173–198", year: 1931, doi: "10.1007/BF01700692", fr: "L’article des théorèmes d’incomplétude." },
  { key: "bourbaki-elements", type: "BOOK", title: "Éléments de mathématique", authors: "Nicolas Bourbaki", publisher: "Hermann, puis Springer", yearLabel: "depuis 1939", fr: "Le traité collectif qui a fixé le langage des structures." },
  { key: "abel-prize", type: "WEBSITE", title: "The Abel Prize", publisher: "Académie norvégienne des sciences et des lettres", url: "https://abelprize.no/", fr: "Le site officiel du prix Abel, avec les biographies des lauréats." },
];

// ---------------------------------------------------------------------------------------------
// Mathematicians. `start`/`end` are the years used by the period filter (negative: BCE).
// ---------------------------------------------------------------------------------------------
const people = [
  { key: "thales", featured: true, name: "Thalès de Milet", lifespan: "vers 624 – vers 548 av. J.-C.", start: -624, end: -548, place: "Milet, Ionie", teaser: "L’un des premiers à chercher des démonstrations en géométrie.",
    bio: "Marchand, ingénieur et philosophe de Milet, Thalès est présenté par la tradition grecque comme le premier des sages. Aucun de ses écrits ne nous est parvenu : ce que nous savons de lui vient d’auteurs bien plus tardifs.\n\nOn lui attribue la mesure de la hauteur des pyramides par leur ombre et la prédiction d’une éclipse de Soleil.",
    contrib: "- Le théorème qui porte son nom en France, sur les droites parallèles coupant deux sécantes.\n- Un triangle inscrit dans un demi-cercle est rectangle.",
    sources: ["boyer", "mactutor"] },
  { key: "pythagore", featured: true, name: "Pythagore", lifespan: "vers 570 – vers 495 av. J.-C.", start: -570, end: -495, place: "Samos", teaser: "Fondateur d’une école où le nombre expliquait l’ordre du monde.",
    bio: "Né à Samos, Pythagore s’installe à Crotone, en Grande-Grèce, où il fonde une communauté à la fois philosophique, religieuse et scientifique. Les pythagoriciens ne distinguaient pas leurs travaux de ceux du maître, si bien qu’il est difficile de savoir ce qui revient à Pythagore lui-même.\n\nL’école étudie les rapports numériques en musique et la classification des nombres.",
    contrib: "- Le théorème de Pythagore, connu bien avant lui mais démontré dans la tradition grecque.\n- La découverte, attribuée aux pythagoriciens, de grandeurs incommensurables.",
    sources: ["boyer", "stillwell"], en: { teaser: "Founder of a school for which number explained the order of the world.", bio: "Born on Samos, Pythagoras settled in Croton where he founded a community that was philosophical, religious and scientific at once." } },
  { key: "euclide", featured: true, name: "Euclide", lifespan: "vers 300 av. J.-C.", start: -325, end: -265, place: "Alexandrie (actif)", teaser: "Auteur des *Éléments*, le manuel de géométrie le plus lu de l’histoire.",
    bio: "On ne sait presque rien de la vie d’Euclide, sinon qu’il enseignait à Alexandrie sous Ptolémée Ier. Son nom reste attaché aux *Éléments*, une synthèse en treize livres des connaissances mathématiques grecques de son temps.\n\nLa force des *Éléments* tient à leur organisation : des définitions, des postulats et des notions communes, puis des propositions démontrées les unes à partir des autres.",
    contrib: "- La démonstration de l’infinité des nombres premiers.\n- L’algorithme d’Euclide pour le plus grand commun diviseur.\n- Le cinquième postulat, dit des parallèles, dont l’indépendance ne sera établie qu’au XIXe siècle.",
    works: ["elements"], sources: ["boyer", "katz", "mactutor"], aliases: ["Euclide d’Alexandrie"],
    en: { teaser: "Author of the *Elements*, the most widely read geometry textbook in history.", bio: "Almost nothing is known of Euclid’s life, except that he taught in Alexandria. His name remains attached to the *Elements*, a synthesis in thirteen books of Greek mathematics.\n\nIts strength lies in its organisation: definitions, postulates and common notions, then propositions proved from one another.", contrib: "- The proof that there are infinitely many primes.\n- Euclid’s algorithm for the greatest common divisor." } },
  { key: "archimede", featured: true, name: "Archimède", lifespan: "vers 287 – 212 av. J.-C.", start: -287, end: -212, place: "Syracuse, Sicile", teaser: "Géomètre et ingénieur, il a calculé aires et volumes par la méthode d’exhaustion.",
    bio: "Archimède passe l’essentiel de sa vie à Syracuse, dont il conçoit les machines de défense lors du siège romain. Il meurt pendant la prise de la ville, en 212 av. J.-C.\n\nSes traités, rédigés comme des lettres à des collègues d’Alexandrie, anticipent certaines idées du calcul intégral.",
    contrib: "- L’encadrement de π entre 3 + 10/71 et 3 + 1/7.\n- L’aire d’un segment de parabole et le volume de la sphère.\n- Le principe d’Archimède en hydrostatique.",
    sources: ["boyer", "stillwell"], en: { teaser: "Geometer and engineer who computed areas and volumes by the method of exhaustion." } },
  { key: "eratosthene", name: "Ératosthène", lifespan: "vers 276 – vers 194 av. J.-C.", start: -276, end: -194, place: "Cyrène", teaser: "Il a mesuré la circonférence de la Terre et criblé les nombres premiers.",
    bio: "Directeur de la bibliothèque d’Alexandrie, Ératosthène était un esprit universel : géographe, astronome, poète et mathématicien.",
    contrib: "- Le crible d’Ératosthène.\n- Une estimation remarquablement juste de la circonférence terrestre.",
    sources: ["boyer"] },
  { key: "hypatie", name: "Hypatie", lifespan: "vers 355 – 415", start: 355, end: 415, place: "Alexandrie", teaser: "Mathématicienne et philosophe, figure intellectuelle d’Alexandrie.",
    bio: "Fille du mathématicien Théon, Hypatie enseigne la philosophie et les mathématiques à Alexandrie. Elle est assassinée en 415 lors de troubles politiques et religieux.\n\nSes commentaires, perdus, portaient sur Diophante, Apollonius et Ptolémée.",
    contrib: "- Commentaires des *Arithmétiques* de Diophante et des *Coniques* d’Apollonius.",
    sources: ["mactutor"], aliases: ["Hypatia"], en: { teaser: "Mathematician and philosopher, an intellectual figure of Alexandria." } },
  { key: "brahmagupta", featured: true, name: "Brahmagupta", lifespan: "598 – vers 668", start: 598, end: 668, place: "Bhinmal, Inde", teaser: "Il a donné les règles de calcul avec zéro et les nombres négatifs.",
    bio: "Astronome indien, Brahmagupta rédige en 628 le *Brāhmasphuṭasiddhānta*, un traité d’astronomie qui contient d’importants chapitres mathématiques.",
    contrib: "- Les règles de l’arithmétique avec zéro et les quantités négatives.\n- La formule de l’aire d’un quadrilatère inscriptible.\n- Des solutions d’équations de Pell–Fermat.",
    sources: ["katz"] },
  { key: "al-khwarizmi", featured: true, name: "Al-Khwarizmi", lifespan: "vers 780 – vers 850", start: 780, end: 850, place: "Khwarezm (actuel Ouzbékistan)", teaser: "Son traité a donné son nom à l’algèbre, et son nom aux algorithmes.",
    bio: "Savant de la Maison de la sagesse à Bagdad, Muhammad ibn Musa al-Khwarizmi écrit sur l’arithmétique, l’algèbre, l’astronomie et la géographie.\n\nLa traduction latine de son traité sur les chiffres indiens diffuse en Europe la numération de position.",
    contrib: "- Des méthodes générales de résolution des équations du second degré, justifiées géométriquement.\n- La diffusion du système décimal de position.",
    works: ["al-jabr"], sources: ["katz", "mactutor"], aliases: ["Muhammad ibn Musa al-Khwarizmi"],
    en: { teaser: "His treatise gave its name to algebra, and his name to algorithms.", bio: "A scholar of the House of Wisdom in Baghdad, al-Khwarizmi wrote on arithmetic, algebra, astronomy and geography." } },
  { key: "khayyam", name: "Omar Khayyam", lifespan: "1048 – 1131", start: 1048, end: 1131, place: "Nichapour, Perse", teaser: "Poète et mathématicien, il a résolu géométriquement les équations cubiques.",
    bio: "Connu en Occident pour ses quatrains, Omar Khayyam est aussi l’auteur d’un traité d’algèbre majeur et d’une réforme du calendrier persan.",
    contrib: "- Une classification des équations cubiques et leur résolution par intersection de coniques.\n- Une étude critique du postulat des parallèles.",
    sources: ["katz"] },
  { key: "fibonacci", featured: true, name: "Leonardo Fibonacci", lifespan: "vers 1170 – vers 1250", start: 1170, end: 1250, place: "Pise", teaser: "Il a fait connaître en Europe les chiffres indo-arabes.",
    bio: "Fils d’un marchand pisan installé à Béjaïa, Leonardo découvre auprès de maîtres arabes les méthodes de calcul indiennes. Il les expose en 1202 dans le *Liber Abaci*.",
    contrib: "- La diffusion de la numération de position en Europe.\n- Le problème des lapins, à l’origine de la suite qui porte son nom.",
    works: ["liber-abaci"], sources: ["boyer"], aliases: ["Léonard de Pise", "Leonardo Pisano"] },
  { key: "cardan", name: "Jérôme Cardan", lifespan: "1501 – 1576", start: 1501, end: 1576, place: "Pavie", teaser: "Médecin et mathématicien, il publia la résolution des équations de degrés 3 et 4.",
    bio: "Médecin réputé, astrologue et joueur, Cardan publie en 1545 l’*Ars Magna*, qui rend publiques les méthodes de Tartaglia et de Ferrari.",
    contrib: "- La formule de Cardan pour l’équation du troisième degré.\n- Un premier usage calculatoire des racines de nombres négatifs.",
    sources: ["katz"], aliases: ["Gerolamo Cardano"] },
  { key: "viete", name: "François Viète", lifespan: "1540 – 1603", start: 1540, end: 1603, place: "Fontenay-le-Comte", teaser: "Il a introduit les lettres pour désigner les quantités connues et inconnues.",
    bio: "Juriste et conseiller des rois Henri III et Henri IV, Viète consacre ses loisirs aux mathématiques. Il déchiffre aussi les messages codés de l’Espagne.",
    contrib: "- L’usage systématique de lettres en algèbre.\n- Les relations entre coefficients et racines d’un polynôme.",
    sources: ["boyer", "stillwell"] },
  { key: "descartes", featured: true, name: "René Descartes", lifespan: "1596 – 1650", start: 1596, end: 1650, place: "La Haye-en-Touraine", teaser: "Philosophe et mathématicien, fondateur de la géométrie analytique.",
    bio: "Formé au collège jésuite de La Flèche, Descartes vit surtout aux Provinces-Unies. Il meurt à Stockholm, invité par la reine Christine.\n\nSa *Géométrie* montre comment traduire un problème de courbes en équations, puis résoudre ces équations.",
    contrib: "- La géométrie analytique et les coordonnées.\n- Les notations modernes des puissances et des inconnues x, y, z.\n- La règle des signes de Descartes.",
    works: ["geometrie"], sources: ["boyer", "mactutor"],
    en: { teaser: "Philosopher and mathematician, founder of analytic geometry.", bio: "Descartes spent most of his life in the Dutch Republic and died in Stockholm.", contrib: "- Analytic geometry and coordinates.\n- Descartes’ rule of signs." } },
  { key: "fermat", sort: "Fermat, Pierre de", name: "Pierre de Fermat", lifespan: "1607 – 1665", start: 1607, end: 1665, place: "Beaumont-de-Lomagne", teaser: "Magistrat à Toulouse et « prince des amateurs » en théorie des nombres.",
    bio: "Conseiller au parlement de Toulouse, Fermat ne publie presque rien : ses résultats circulent dans sa correspondance et dans les marges de son exemplaire de Diophante.",
    contrib: "- Le petit théorème de Fermat.\n- La méthode de descente infinie.\n- Les fondements du calcul des probabilités, avec Pascal.",
    sources: ["boyer", "stillwell"], aliases: ["Fermat"] },
  { key: "pascal", name: "Blaise Pascal", lifespan: "1623 – 1662", start: 1623, end: 1662, place: "Clermont-Ferrand", teaser: "Mathématicien, physicien et philosophe, pionnier des probabilités.",
    bio: "Enfant précoce, Pascal écrit à seize ans un essai sur les coniques et construit ensuite une machine à calculer. Sa correspondance de 1654 avec Fermat pose les bases du calcul des probabilités.",
    contrib: "- Le triangle arithmétique et ses applications combinatoires.\n- Le théorème de Pascal sur l’hexagone inscrit dans une conique.\n- La Pascaline, l’une des premières machines à calculer.",
    sources: ["boyer"] },
  { key: "newton", featured: true, name: "Isaac Newton", lifespan: "1643 – 1727", start: 1643, end: 1727, place: "Woolsthorpe, Angleterre", teaser: "Il a unifié la mécanique céleste et terrestre, et inventé le calcul des fluxions.",
    bio: "Professeur à Cambridge, puis directeur de la Monnaie à Londres, Newton publie en 1687 les *Principia*. Sa querelle de priorité avec Leibniz sur le calcul infinitésimal marque durablement les mathématiques anglaises.",
    contrib: "- Le calcul des fluxions.\n- La formule du binôme généralisée.\n- La méthode de Newton pour approcher les racines.",
    works: ["principia"], sources: ["kline"], en: { teaser: "He unified celestial and terrestrial mechanics and invented the calculus of fluxions." } },
  { key: "leibniz", featured: true, name: "Gottfried Wilhelm Leibniz", lifespan: "1646 – 1716", start: 1646, end: 1716, place: "Leipzig", teaser: "Philosophe et diplomate, co-inventeur du calcul différentiel.",
    bio: "Au service des ducs de Hanovre, Leibniz mène une œuvre immense en philosophie, droit, histoire et mathématiques. Il publie en 1684 son premier article sur le calcul différentiel.",
    contrib: "- Les notations dx et ∫ du calcul infinitésimal.\n- Le système binaire.\n- Une machine à calculer effectuant les quatre opérations.",
    sources: ["kline", "dieudonne"] },
  { key: "du-chatelet", sort: "Du Châtelet, Émilie", name: "Émilie du Châtelet", lifespan: "1706 – 1749", start: 1706, end: 1749, place: "Paris", teaser: "Traductrice et commentatrice des *Principia* de Newton.",
    bio: "Femme de lettres et de sciences, Émilie du Châtelet travaille à Cirey avec Voltaire. Sa traduction commentée des *Principia*, achevée juste avant sa mort, reste la traduction française de référence.",
    contrib: "- La traduction française des *Principia*.\n- Les *Institutions de physique*, qui rapprochent Newton et Leibniz.",
    sources: ["mactutor"], aliases: ["Gabrielle Émilie Le Tonnelier de Breteuil"] },
  { key: "lagrange", name: "Joseph-Louis Lagrange", lifespan: "1736 – 1813", start: 1736, end: 1813, place: "Turin", teaser: "Il a refondé la mécanique sur le calcul des variations.",
    bio: "Successeur d’Euler à Berlin, puis professeur à l’École polytechnique, Lagrange publie en 1788 la *Mécanique analytique*, sans aucune figure.",
    contrib: "- Le calcul des variations.\n- La mécanique lagrangienne.\n- Le théorème de Lagrange en théorie des groupes.",
    sources: ["dieudonne"] },
  { key: "germain", name: "Sophie Germain", lifespan: "1776 – 1831", start: 1776, end: 1831, place: "Paris", teaser: "Autodidacte, elle a fait progresser le dernier théorème de Fermat et la théorie de l’élasticité.",
    bio: "Exclue des études supérieures, Sophie Germain étudie seule et correspond avec Lagrange puis Gauss sous le nom d’un étudiant, Monsieur Le Blanc. Elle remporte en 1816 le prix de l’Académie des sciences.",
    contrib: "- Le théorème de Sophie Germain sur le premier cas du dernier théorème de Fermat.\n- Une théorie des surfaces élastiques.",
    sources: ["mactutor"], en: { teaser: "Self-taught, she advanced Fermat’s Last Theorem and the theory of elasticity." } },
  { key: "cauchy", name: "Augustin-Louis Cauchy", lifespan: "1789 – 1857", start: 1789, end: 1857, place: "Paris", teaser: "Il a donné à l’analyse ses fondements rigoureux.",
    bio: "Ingénieur des Ponts et Chaussées, puis professeur à l’École polytechnique, Cauchy publie plus de 800 articles. Son *Cours d’analyse* de 1821 impose un nouveau standard de rigueur.",
    contrib: "- Les définitions de la limite et de la continuité.\n- L’analyse complexe et la formule intégrale de Cauchy.",
    sources: ["dieudonne", "kline"] },
  { key: "galois", featured: true, name: "Évariste Galois", lifespan: "1811 – 1832", start: 1811, end: 1832, place: "Bourg-la-Reine", teaser: "Mort à vingt ans, il a relié la résolution des équations à la théorie des groupes.",
    bio: "Deux fois refusé à l’École polytechnique, républicain engagé, Galois meurt à vingt ans des suites d’un duel. La veille, il rédige une lettre qui résume ses découvertes.\n\nSes manuscrits, publiés par Liouville en 1846, fondent ce que l’on appelle aujourd’hui la théorie de Galois.",
    contrib: "- Un critère de résolubilité par radicaux.\n- La notion de groupe et de sous-groupe distingué.\n- Les corps finis.",
    works: ["galois-oeuvres"], sources: ["stillwell", "mactutor"],
    en: { teaser: "Dead at twenty, he related the solution of equations to group theory.", bio: "Galois died at twenty after a duel. His manuscripts, published by Liouville in 1846, founded what is now called Galois theory." } },
  { key: "lovelace", featured: true, name: "Ada Lovelace", lifespan: "1815 – 1852", start: 1815, end: 1852, place: "Londres", teaser: "Elle a décrit ce que pourrait faire une machine à calculer programmable.",
    bio: "Fille du poète Byron, Ada Lovelace reçoit une solide formation mathématique. Elle traduit en 1843 un mémoire sur la machine analytique de Babbage et y ajoute des notes trois fois plus longues que le texte.",
    contrib: "- Un algorithme de calcul des nombres de Bernoulli, souvent considéré comme le premier programme.\n- L’idée qu’une machine peut manipuler d’autres objets que des nombres.",
    works: ["lovelace-notes"], sources: ["mactutor"], aliases: ["Augusta Ada King, comtesse de Lovelace"] },
  { key: "cantor", featured: true, name: "Georg Cantor", lifespan: "1845 – 1918", start: 1845, end: 1918, place: "Saint-Pétersbourg", teaser: "Créateur de la théorie des ensembles et des nombres transfinis.",
    bio: "Professeur à Halle, Cantor montre en 1874 que l’ensemble des nombres réels n’est pas dénombrable. Ses idées sur l’infini suscitent de violentes oppositions avant d’être au cœur des mathématiques du XXe siècle.",
    contrib: "- Les cardinaux et ordinaux transfinis.\n- L’argument diagonal.\n- L’hypothèse du continu.",
    works: ["cantor-beitrage"], sources: ["dieudonne"] },
  { key: "poincare", name: "Henri Poincaré", lifespan: "1854 – 1912", start: 1854, end: 1912, place: "Nancy", teaser: "Mathématicien universel, fondateur de la topologie algébrique.",
    bio: "Polytechnicien et ingénieur des Mines, Poincaré contribue à presque toutes les branches des mathématiques de son temps, ainsi qu’à la physique et à la philosophie des sciences.",
    contrib: "- Les fondements de la topologie algébrique.\n- La théorie qualitative des équations différentielles et le chaos du problème des trois corps.\n- La conjecture de Poincaré.",
    works: ["science-hypothese"], sources: ["dieudonne", "mactutor"], en: { teaser: "Universal mathematician, founder of algebraic topology." } },
  { key: "hilbert", featured: true, name: "David Hilbert", lifespan: "1862 – 1943", start: 1862, end: 1943, place: "Königsberg", teaser: "Il a fixé en 1900 le programme des mathématiques du XXe siècle.",
    bio: "Professeur à Göttingen, Hilbert fait de cette ville le centre mondial des mathématiques. Au congrès de Paris de 1900, il présente une liste de problèmes ouverts qui orientera la recherche pendant un siècle.",
    contrib: "- L’axiomatisation de la géométrie.\n- Les espaces de Hilbert.\n- Le programme de fondement des mathématiques.",
    works: ["grundlagen"], sources: ["kline"] },
  { key: "hardy", name: "G. H. Hardy", lifespan: "1877 – 1947", start: 1877, end: 1947, place: "Cranleigh, Angleterre", teaser: "Analyste et arithméticien, il a révélé le génie de Ramanujan.",
    bio: "Professeur à Cambridge et à Oxford, Hardy collabore pendant trente-cinq ans avec Littlewood. En 1913, il reçoit la lettre de Ramanujan et le fait venir en Angleterre.",
    contrib: "- La méthode du cercle, avec Littlewood et Ramanujan.\n- Le principe de Hardy–Weinberg en génétique des populations.",
    works: ["apology", "hardy-wright"], sources: ["mactutor"], aliases: ["Godfrey Harold Hardy"] },
  { key: "turing", featured: true, name: "Alan Turing", lifespan: "1912 – 1954", start: 1912, end: 1954, place: "Londres", teaser: "Il a défini ce qu’est un calcul et fondé l’informatique théorique.",
    bio: "En 1936, Turing définit une machine abstraite capable d’exécuter tout calcul mécanique. Pendant la guerre, il joue un rôle décisif dans le déchiffrement d’Enigma à Bletchley Park.",
    contrib: "- La machine de Turing et l’indécidabilité du problème de l’arrêt.\n- Le test de Turing.\n- Des travaux pionniers sur la morphogenèse.",
    works: ["turing-1936"], sources: ["mactutor"], en: { teaser: "He defined what a computation is and founded theoretical computer science.", bio: "In 1936 Turing defined an abstract machine able to carry out any mechanical computation." } },
  { key: "grothendieck", name: "Alexandre Grothendieck", lifespan: "1928 – 2014", start: 1928, end: 2014, place: "Berlin", teaser: "Il a refondé la géométrie algébrique autour de la notion de schéma.",
    bio: "Apatride pendant une grande partie de sa vie, Grothendieck mène à l’IHÉS, de 1958 à 1970, un programme qui transforme la géométrie algébrique. Il quitte ensuite la recherche institutionnelle.",
    contrib: "- Les schémas et la cohomologie étale.\n- Les topos.\n- Le théorème de Grothendieck–Riemann–Roch.",
    works: ["recoltes"], sources: ["mactutor"], status: "PENDING_REVIEW" },
  { key: "serre", name: "Jean-Pierre Serre", lifespan: "né en 1926", start: 1926, end: null, place: "Bages", teaser: "Premier lauréat du prix Abel, auteur de textes d’une clarté célèbre.",
    bio: "Médaille Fields à vingt-sept ans, Serre a contribué à la topologie algébrique, à la géométrie algébrique et à la théorie des nombres.",
    contrib: "- Le calcul des groupes d’homotopie des sphères.\n- Les faisceaux cohérents en géométrie algébrique (GAGA).",
    sources: ["genealogy"] },
  { key: "mirzakhani", featured: true, name: "Maryam Mirzakhani", lifespan: "1977 – 2017", start: 1977, end: 2017, place: "Téhéran", teaser: "Première femme lauréate de la médaille Fields, en 2014.",
    bio: "Médaillée d’or aux Olympiades internationales, Maryam Mirzakhani fait sa thèse à Harvard puis devient professeure à Stanford. Ses travaux portent sur la géométrie des surfaces de Riemann et de leurs espaces de modules.",
    contrib: "- Le comptage des géodésiques simples sur les surfaces hyperboliques.\n- La dynamique sur les espaces de modules.",
    works: ["mirzakhani-these"], sources: ["mactutor"], en: { teaser: "First woman to receive the Fields Medal, in 2014." } },
  { key: "tao", name: "Terence Tao", lifespan: "né en 1975", start: 1975, end: null, place: "Adélaïde", teaser: "Analyste aux intérêts très larges, médaille Fields 2006.", bio: "", contrib: "", sources: [] },
  { key: "oresme", name: "Nicole Oresme", lifespan: "vers 1320 – 1382", start: 1320, end: 1382, place: "Normandie", teaser: "Il a représenté graphiquement des grandeurs variables.", bio: "", contrib: "", sources: [], status: "NEEDS_WORK" },
  { key: "liu-hui", featured: true, sort: "Liu, Hui", name: "Liu Hui", lifespan: "IIIe siècle", start: 225, end: 295, place: "Royaume de Wei, Chine", teaser: "Commentateur des *Neuf Chapitres*, il a justifié leurs méthodes et approché π.",
    bio: "Liu Hui rédige en 263 un commentaire des *Neuf Chapitres* dans lequel il démontre les procédures du livre.", contrib: "- Une approximation de π par des polygones de 3 072 côtés.\n- Une méthode proche de l’élimination de Gauss.", works: [], sources: ["neuf-chapitres"] },
  { key: "madhava", name: "Madhava de Sangamagrama", lifespan: "vers 1340 – vers 1425", start: 1340, end: 1425, place: "Kerala, Inde", teaser: "Fondateur de l’école du Kerala, il a développé sinus, cosinus et π en séries.", sources: ["katz"] },
  { key: "tartaglia", name: "Niccolò Tartaglia", lifespan: "1499 – 1557", start: 1499, end: 1557, place: "Brescia", teaser: "Il a trouvé la résolution des équations cubiques qu’allait publier Cardan.", sources: ["stillwell"] },
  { key: "bombelli", name: "Rafael Bombelli", lifespan: "1526 – 1572", start: 1526, end: 1572, place: "Bologne", teaser: "Le premier à calculer avec les nombres imaginaires.", sources: ["stillwell"] },
  { key: "napier", name: "John Napier", lifespan: "1550 – 1617", start: 1550, end: 1617, place: "Merchiston, Écosse", teaser: "L’inventeur des logarithmes.", works: ["napier"], sources: ["boyer"] },
  { key: "laplace", name: "Pierre-Simon Laplace", lifespan: "1749 – 1827", start: 1749, end: 1827, place: "Beaumont-en-Auge", teaser: "Il a mis les probabilités et la mécanique céleste au service d’un déterminisme rigoureux.", sources: ["dieudonne"] },
  { key: "abel", name: "Niels Henrik Abel", lifespan: "1802 – 1829", start: 1802, end: 1829, place: "Nedstrand, Norvège", teaser: "Il a montré qu’on ne peut pas résoudre par radicaux l’équation générale de degré cinq.", sources: ["stillwell", "abel-prize"] },
  { key: "weierstrass", name: "Karl Weierstrass", lifespan: "1815 – 1897", start: 1815, end: 1897, place: "Ostenfelde", teaser: "Le père de l’analyse moderne et des epsilons.", sources: ["dieudonne"] },
  { key: "dedekind", name: "Richard Dedekind", lifespan: "1831 – 1916", start: 1831, end: 1916, place: "Brunswick", teaser: "Il a construit les nombres réels et introduit les idéaux.", sources: ["stillwell"] },
  { key: "godel", name: "Kurt Gödel", lifespan: "1906 – 1978", start: 1906, end: 1978, place: "Brno", teaser: "Ses théorèmes d’incomplétude ont fixé les limites des systèmes formels.", works: ["godel-1931"], sources: ["mactutor"] },
  { key: "perelman", name: "Grigori Perelman", lifespan: "né en 1966", start: 1966, end: null, place: "Léningrad", teaser: "Il a démontré la conjecture de Poincaré, puis refusé toutes les récompenses.", sources: ["mactutor"] },
];

// ---------------------------------------------------------------------------------------------
// History milestones. `people` may refer to fixture keys or to existing slugs (prefixed "=").
// ---------------------------------------------------------------------------------------------
const milestones = [
  { key: "plimpton", year: -1800, era: "ANCIENT", type: "DISCOVERY", label: "vers 1800 av. J.-C.", title: "La tablette Plimpton 322", summary: "Cette tablette d’argile babylonienne contient une table de nombres liés aux triplets pythagoriciens, plus de mille ans avant Pythagore.\n\nSon usage exact reste débattu : table trigonométrique, outil d’enseignement ou liste de problèmes.", refs: ["katz"] },
  { key: "rhind", year: -1650, era: "ANCIENT", type: "PUBLICATION", label: "vers 1650 av. J.-C.", title: "Le papyrus Rhind", summary: "Copié par le scribe Ahmès, ce papyrus égyptien rassemble 84 problèmes d’arithmétique et de géométrie, avec des fractions unitaires et une approximation de l’aire du disque.", refs: ["boyer"] },
  { key: "hellenistique", featured: true, year: -323, end: -31, era: "ANCIENT", type: "PERIOD", label: "323 – 31 av. J.-C.", title: "Les mathématiques hellénistiques", summary: "Entre la mort d’Alexandre et la conquête romaine, Alexandrie devient le centre du monde savant. Euclide, Archimède, Apollonius et Ératosthène y fixent les standards de la démonstration.", people: ["euclide", "archimede", "eratosthene"], refs: ["boyer", "stillwell"] },
  { key: "elements", featured: true, year: -300, era: "ANCIENT", type: "PUBLICATION", label: "vers 300 av. J.-C.", title: "Les Éléments d’Euclide", summary: "Euclide organise les connaissances géométriques et arithmétiques en une suite de propositions démontrées à partir de définitions et de postulats. Le texte sera recopié, traduit et enseigné pendant plus de deux mille ans.", people: ["euclide"], refs: ["elements"] },
  { key: "eratosthene-terre", year: -240, era: "ANCIENT", type: "DISCOVERY", label: "vers 240 av. J.-C.", title: "Ératosthène mesure la Terre", summary: "En comparant la longueur des ombres à Syène et à Alexandrie le jour du solstice, Ératosthène estime la circonférence terrestre avec une précision remarquable.", people: ["eratosthene"] },
  { key: "zero", year: 628, era: "MEDIEVAL", type: "NOTATION", label: "628", title: "Brahmagupta et les règles du zéro", summary: "Dans le *Brāhmasphuṭasiddhānta*, Brahmagupta traite zéro comme un nombre et énonce les règles des opérations avec les quantités positives et négatives.", people: ["brahmagupta"], refs: ["katz"] },
  { key: "age-or", year: 750, end: 1400, era: "MEDIEVAL", type: "PERIOD", label: "VIIIe – XIVe siècles", title: "Les mathématiques en pays d’Islam", summary: "De Bagdad à Cordoue, les savants traduisent les textes grecs et indiens, puis développent l’algèbre, la trigonométrie et le calcul décimal.", people: ["al-khwarizmi", "khayyam"], refs: ["katz"] },
  { key: "al-jabr", featured: true, year: 820, era: "MEDIEVAL", type: "PUBLICATION", label: "vers 820", title: "Naissance de l’algèbre", summary: "Al-Khwarizmi présente des méthodes générales pour résoudre les équations du second degré, avec des justifications géométriques. Le mot *al-jabr* deviendra « algèbre ».", people: ["al-khwarizmi"], refs: ["al-jabr"] },
  { key: "liber-abaci", featured: true, year: 1202, era: "MEDIEVAL", type: "PUBLICATION", label: "1202", title: "Le Liber Abaci", summary: "Fibonacci expose aux marchands européens le calcul avec les chiffres indo-arabes. La suite des lapins n’y occupe qu’un seul problème.", people: ["fibonacci"], refs: ["liber-abaci"] },
  { key: "ars-magna", year: 1545, era: "EARLY_MODERN", type: "PUBLICATION", label: "1545", title: "L’Ars Magna de Cardan", summary: "Cardan publie la résolution des équations du troisième et du quatrième degré, obtenue par Tartaglia et Ferrari, et rencontre pour la première fois des racines de nombres négatifs.", people: ["cardan"] },
  { key: "geometrie", featured: true, year: 1637, era: "EARLY_MODERN", type: "PUBLICATION", label: "1637", title: "La Géométrie de Descartes", summary: "Descartes montre comment traduire un problème géométrique en équations. La géométrie analytique naît, en même temps que chez Fermat.", people: ["descartes", "fermat"], refs: ["geometrie"] },
  { key: "probabilites", year: 1654, era: "EARLY_MODERN", type: "DISCOVERY", label: "1654", title: "Pascal, Fermat et le problème des partis", summary: "Comment partager équitablement les mises d’une partie interrompue ? La correspondance entre Pascal et Fermat donne naissance au calcul des probabilités.", people: ["pascal", "fermat"] },
  { key: "calcul", featured: true, year: 1684, end: 1687, era: "EARLY_MODERN", type: "DISCOVERY", label: "1684 – 1687", title: "Le calcul infinitésimal", summary: "Leibniz publie son calcul différentiel en 1684 ; Newton publie les *Principia* en 1687. Les deux découvertes, indépendantes, provoquent une longue querelle de priorité.", people: ["leibniz", "newton"], refs: ["principia", "kline"] },
  { key: "bale", year: 1735, era: "EARLY_MODERN", type: "DISCOVERY", label: "1735", title: "Le problème de Bâle", summary: "Euler montre que la somme des inverses des carrés vaut π²/6, un résultat qui avait résisté aux meilleurs mathématiciens.", people: ["=leonhard-euler"] },
  { key: "disquisitiones", year: 1801, era: "MODERN", type: "PUBLICATION", label: "1801", title: "Les Disquisitiones Arithmeticae", summary: "À vingt-quatre ans, Gauss publie un traité qui fait de la théorie des nombres une discipline systématique : congruences, formes quadratiques, loi de réciprocité quadratique.", people: ["=carl-friedrich-gauss"], refs: ["dieudonne"] },
  { key: "galois", featured: true, year: 1832, era: "MODERN", type: "BIOGRAPHICAL", label: "29 mai 1832", title: "La lettre testamentaire de Galois", summary: "La veille de son duel, Galois écrit à son ami Auguste Chevalier une lettre qui résume ses recherches sur les équations et les groupes.", people: ["galois"], refs: ["galois-oeuvres"] },
  { key: "riemann", year: 1859, era: "MODERN", type: "PUBLICATION", label: "1859", title: "L’hypothèse de Riemann", summary: "Dans un article de dix pages sur la répartition des nombres premiers, Riemann énonce la conjecture qui porte son nom, toujours ouverte.", people: ["=bernhard-riemann"] },
  { key: "cantor", year: 1874, era: "MODERN", type: "DISCOVERY", label: "1874", title: "Tous les infinis ne se valent pas", summary: "Cantor démontre que les nombres réels ne peuvent pas être numérotés : il existe des infinis de tailles différentes.", people: ["cantor"], refs: ["cantor-beitrage"] },
  { key: "hilbert", featured: true, year: 1900, era: "MODERN", type: "EVENT", label: "8 août 1900", title: "Les problèmes de Hilbert", summary: "Au congrès international de Paris, Hilbert présente une liste de problèmes ouverts, publiée ensuite avec vingt-trois énoncés, qui orientera la recherche du XXe siècle.", people: ["hilbert", "poincare"] },
  { key: "noether", year: 1918, era: "MODERN", type: "DISCOVERY", label: "1918", title: "Le théorème de Noether", summary: "Emmy Noether établit le lien entre les symétries d’un système physique et ses lois de conservation.", people: ["=emmy-noether"] },
  { key: "turing", year: 1936, era: "MODERN", type: "DISCOVERY", label: "1936", title: "La machine de Turing", summary: "Turing définit une machine abstraite qui capture la notion de calcul et en déduit qu’aucun algorithme ne peut décider de toutes les propositions mathématiques.", people: ["turing"], refs: ["turing-1936"] },
  { key: "ihes", year: 1958, era: "CONTEMPORARY", type: "INSTITUTION", label: "1958", title: "Fondation de l’IHÉS", summary: "Léon Motchane fonde à Paris l’Institut des hautes études scientifiques, sur le modèle de l’Institute for Advanced Study. Grothendieck y développe la géométrie algébrique moderne.", people: ["grothendieck"] },
  { key: "fermat-wiles", year: 1994, end: 1995, era: "CONTEMPORARY", type: "DISCOVERY", label: "1994 – 1995", title: "La démonstration du dernier théorème de Fermat", summary: "Après sept ans de travail, Andrew Wiles démontre, avec l’aide de Richard Taylor, le dernier théorème de Fermat, énoncé plus de trois siècles plus tôt.", people: ["fermat"], refs: ["wiles-1995"] },
  { key: "mirzakhani", year: 2014, era: "CONTEMPORARY", type: "BIOGRAPHICAL", label: "2014", title: "Première médaille Fields décernée à une femme", summary: "Maryam Mirzakhani reçoit la médaille Fields pour ses travaux sur la dynamique et la géométrie des surfaces de Riemann.", people: ["mirzakhani"], refs: ["mirzakhani-these"] },
  { key: "babylone", featured: true, year: -2000, end: -1600, type: "PERIOD", label: "vers 2000 – 1600 av. J.-C.", title: "Les mathématiques paléo-babyloniennes", summary: "Les scribes de Mésopotamie calculent en base soixante avec une numération de position et résolvent des problèmes du second degré." },
  { key: "neuf-chapitres", year: -100, type: "PUBLICATION", label: "Ier siècle av. J.-C.", title: "Les Neuf Chapitres sur l’art du calcul", summary: "Ce recueil chinois rassemble 246 problèmes pratiques, avec des méthodes proches de l’élimination de Gauss.", people: ["liu-hui"], refs: ["neuf-chapitres"] },
  { key: "musee-alexandrie", year: -290, type: "INSTITUTION", label: "vers 290 av. J.-C.", title: "Le Musée d’Alexandrie", summary: "Ptolémée Ier fonde à Alexandrie un centre de recherche et une bibliothèque où travailleront Euclide, Ératosthène et Apollonius.", people: ["euclide", "eratosthene"] },
  { key: "liu-hui-pi", year: 263, type: "DISCOVERY", label: "263", title: "Liu Hui approche π", summary: "En inscrivant des polygones réguliers dans un cercle, Liu Hui obtient π ≈ 3,1416.", people: ["liu-hui"], refs: ["neuf-chapitres"] },
  { key: "maison-sagesse", year: 830, type: "INSTITUTION", label: "vers 830", title: "La Maison de la sagesse", summary: "À Bagdad, le calife al-Ma’mūn soutient un centre de traduction et de recherche où travaille al-Khwarizmi.", people: ["al-khwarizmi"] },
  { key: "kerala", year: 1350, end: 1600, type: "PERIOD", label: "XIVe – XVIe siècles", title: "L’école du Kerala", summary: "Madhava et ses successeurs développent sinus, cosinus et arctangente en séries, deux siècles avant l’Europe.", people: ["madhava"] },
  { key: "algebristes", featured: true, year: 1494, end: 1572, type: "PERIOD", label: "1494 – 1572", title: "Les algébristes italiens", summary: "De la *Summa* de Pacioli à l’*Algebra* de Bombelli, l’algèbre italienne résout les équations de degré 3 et 4 et rencontre les nombres imaginaires.", people: ["tartaglia", "cardan", "bombelli"] },
  { key: "defi-venise", year: 1535, type: "EVENT", label: "12 février 1535", title: "Le défi de Tartaglia", summary: "Lors d’un défi public à Venise, Niccolò Tartaglia résout en deux heures les trente équations cubiques proposées par Antonio Maria Fiore.", people: ["tartaglia"] },
  { key: "logarithmes", year: 1614, type: "PUBLICATION", label: "1614", title: "Les logarithmes de Napier", summary: "John Napier publie des tables qui transforment les multiplications en additions ; astronomes et navigateurs les adoptent aussitôt.", people: ["napier"], refs: ["napier"] },
  { key: "academie-sciences", year: 1666, type: "INSTITUTION", label: "22 décembre 1666", title: "Fondation de l’Académie des sciences", summary: "Colbert réunit à Paris des savants pensionnés par le roi ; l’Académie publiera les travaux de Lagrange, de Laplace et de Cauchy." },
  { key: "querelle-calcul", year: 1712, type: "EVENT", label: "1712", title: "La querelle du calcul infinitésimal", summary: "Un comité de la Royal Society, inspiré par Newton lui-même, lui attribue la priorité de l’invention du calcul face à Leibniz.", people: ["newton", "leibniz"] },
  { key: "konigsberg", year: 1736, type: "DISCOVERY", label: "1736", title: "Les sept ponts de Königsberg", summary: "Euler montre qu’aucune promenade ne traverse une seule fois chacun des sept ponts de la ville : c’est la naissance de la théorie des graphes.", people: ["=leonhard-euler"] },
  { key: "introductio", year: 1748, type: "PUBLICATION", label: "1748", title: "L’*Introductio* d’Euler", summary: "Euler fait de la fonction l’objet central de l’analyse et fixe les notations e, i et π.", people: ["=leonhard-euler"], refs: ["introductio"] },
  { key: "polytechnique", year: 1794, type: "INSTITUTION", label: "1794", title: "Fondation de l’École polytechnique", summary: "La Convention crée une école où enseignent Lagrange, Monge et bientôt Cauchy.", people: ["lagrange", "cauchy"] },
  { key: "abel-quintique", year: 1824, type: "DISCOVERY", label: "1824", title: "Abel et l’équation du cinquième degré", summary: "À vingt-deux ans, Abel démontre qu’il n’existe pas de formule par radicaux pour résoudre l’équation générale de degré cinq.", people: ["abel"] },
  { key: "smf", year: 1872, type: "INSTITUTION", label: "1872", title: "Fondation de la Société mathématique de France", summary: "La SMF naît au lendemain de la guerre de 1870 pour relancer la recherche mathématique française." },
  { key: "dedekind-coupures", year: 1872, type: "PUBLICATION", label: "1872", title: "Les coupures de Dedekind", summary: "Dans *Stetigkeit und irrationale Zahlen*, Dedekind construit les nombres réels à partir des rationnels.", people: ["dedekind"] },
  { key: "icm-1897", year: 1897, type: "EVENT", label: "août 1897", title: "Premier Congrès international des mathématiciens", summary: "À Zurich, deux cents mathématiciens se réunissent pour la première fois ; le congrès a lieu depuis tous les quatre ans." },
  { key: "crise-fondements", year: 1897, end: 1931, type: "PERIOD", label: "1897 – 1931", title: "La crise des fondements", summary: "Paradoxes de la théorie des ensembles, programme de Hilbert, logicisme et intuitionnisme, jusqu’aux théorèmes d’incomplétude de Gödel.", people: ["cantor", "hilbert", "godel"] },
  { key: "godel", featured: true, year: 1931, type: "DISCOVERY", label: "1931", title: "Les théorèmes d’incomplétude", summary: "Gödel montre qu’un système formel assez riche contient des énoncés vrais qu’il ne peut pas démontrer.", people: ["godel"], refs: ["godel-1931"] },
  { key: "bourbaki", year: 1934, type: "EVENT", label: "10 décembre 1934", title: "Première réunion de Bourbaki", summary: "Au café Capoulade, à Paris, de jeunes normaliens décident d’écrire ensemble un traité d’analyse ; il deviendra les *Éléments de mathématique*.", refs: ["bourbaki-elements"] },
  { key: "fields-1936", featured: true, year: 1936, type: "EVENT", label: "juillet 1936", title: "Les premières médailles Fields", summary: "Au congrès d’Oslo, Lars Ahlfors et Jesse Douglas reçoivent les premières médailles Fields, décernées depuis à des mathématiciens de moins de quarante ans." },
  { key: "imo-1959", year: 1959, type: "EVENT", label: "juillet 1959", title: "Les premières Olympiades internationales", summary: "Sept pays se retrouvent en Roumanie pour la première édition ; plus d’une centaine de pays y participent aujourd’hui." },
  { key: "abel-2003", year: 2003, type: "EVENT", label: "2003", title: "Le premier prix Abel", summary: "L’Académie norvégienne des sciences décerne le premier prix Abel à Jean-Pierre Serre.", people: ["serre"], refs: ["abel-prize"] },
  { key: "perelman", year: 2006, type: "EVENT", label: "22 août 2006", title: "Perelman refuse la médaille Fields", summary: "Grigori Perelman, qui a démontré la conjecture de Poincaré, refuse la médaille Fields au congrès de Madrid.", people: ["perelman", "poincare"] },
];

/** Value of the legacy HistoryMilestone.era column; the eras shown by the library come from LibraryEra. */
function legacyEra(year) {
  return year < 500 ? "ANCIENT" : year < 1500 ? "MEDIEVAL" : year < 1800 ? "EARLY_MODERN" : year < 1950 ? "MODERN" : "CONTEMPORARY";
}

async function removeFixture() {
  const mathematicians = await prisma.mathematician.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } });
  const refs = await prisma.libraryReference.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } });
  const removed = {
    milestones: (await prisma.historyMilestone.deleteMany({ where: { slug: { startsWith: PREFIX } } })).count,
    mathematicians: (await prisma.mathematician.deleteMany({ where: { id: { in: mathematicians.map(({ id }) => id) } } })).count,
    references: (await prisma.libraryReference.deleteMany({ where: { id: { in: refs.map(({ id }) => id) } } })).count
  };
  console.log(`Removed ${removed.mathematicians} mathematicians, ${removed.milestones} milestones and ${removed.references} references.`);
}

async function create() {
  const curator = await prisma.user.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  const referenceIds = new Map();
  for (const [index, ref] of references.entries()) {
    const translations = [["fr", ref.fr], ["en", ref.en]].filter(([, text]) => text).map(([language, text]) => ({
      language, descriptionMarkdown: text, descriptionHtml: html(text)
    }));
    const created = await prisma.libraryReference.create({
      data: {
        slug: `${PREFIX}${ref.key}`, referenceType: ref.type, canonicalTitle: ref.title, authors: ref.authors ?? null,
        publisher: ref.publisher ?? null, edition: ref.edition ?? null, volume: ref.volume ?? null, translator: ref.translator ?? null,
        journal: ref.journal ?? null, issue: ref.issue ?? null, pages: ref.pages ?? null, year: ref.year ?? null, yearLabel: ref.yearLabel ?? null,
        url: ref.url ?? null, doi: ref.doi ?? null, isbn: ref.isbn ?? null, dedupeKey: `${PREFIX}${ref.key}`,
        status: "PUBLISHED", createdById: curator?.id ?? null, reviewedById: index % 3 ? curator?.id ?? null : null,
        reviewedAt: index % 3 ? new Date(now - index * day) : null, publishedAt: new Date(now - (60 - index) * day),
        createdAt: new Date(now - (60 - index) * day), updatedAt: new Date(now - (index % 9) * day),
        translations: { create: translations }
      }
    });
    referenceIds.set(ref.key, created.id);
  }

  const personIds = new Map();
  for (const [index, person] of people.entries()) {
    const status = person.status ?? "PUBLISHED";
    const related = (language) => [
      ...(person.works ?? []).map((key) => ["WORK", key]),
      ...(person.sources ?? []).map((key) => ["SOURCE", key])
    ].map(([category, key], position) => ({
      key: `${category.toLowerCase()}-${key}`, category, position, referenceId: referenceIds.get(key),
      labelMarkdown: references.find((ref) => ref.key === key)?.title ?? key, noteMarkdown: language === "fr" && category === "SOURCE" && position === 0 && person.bio ? "Une bonne première lecture." : ""
    }));
    const translation = (language, text) => ({
      language, displayName: person.name, sortName: person.sort ?? sortName(person.name), teaser: text.teaser ?? "", birthPlace: person.place,
      biographyMarkdown: text.bio ?? "", biographyHtml: text.bio ? html(text.bio) : "",
      contributionsMarkdown: text.contrib ?? "", contributionsHtml: text.contrib ? html(text.contrib) : "",
      relatedItems: { create: related(language) }
    });
    const created = await prisma.mathematician.create({
      data: {
        slug: `${PREFIX}${person.key}`, name: person.name, aliases: person.aliases ?? [], lifespan: person.lifespan, birthPlace: person.place,
        periodStartYear: person.start, periodEndYear: person.end, status, needsReviewAfterEdit: index % 11 === 5, featuredOnTimeline: Boolean(person.featured),
        createdById: curator?.id ?? null, reviewedById: status === "PUBLISHED" ? curator?.id ?? null : null,
        reviewedAt: status === "PUBLISHED" ? new Date(now - index * day) : null, publishedAt: status === "PUBLISHED" ? new Date(now - (40 - index) * day) : null,
        createdAt: new Date(now - (40 - index) * day), updatedAt: new Date(now - ((index * 7) % 23) * day),
        translations: { create: [translation("fr", person), ...(person.en ? [translation("en", person.en)] : [])] }
      }
    });
    personIds.set(person.key, created.id);
  }

  const existing = new Map((await prisma.mathematician.findMany({ select: { id: true, slug: true } })).map(({ id, slug }) => [slug, id]));
  for (const [index, milestone] of milestones.entries()) {
    const personLinks = (milestone.people ?? []).map((key) => key.startsWith("=") ? existing.get(key.slice(1)) : personIds.get(key)).filter(Boolean);
    await prisma.historyMilestone.create({
      data: {
        slug: `${PREFIX}${milestone.key}`, sortYear: milestone.year, endYear: milestone.end ?? null, era: milestone.era ?? legacyEra(milestone.year), milestoneType: milestone.type, featuredOnTimeline: Boolean(milestone.featured),
        status: "PUBLISHED", createdById: curator?.id ?? null, reviewedById: index % 4 ? curator?.id ?? null : null,
        reviewedAt: index % 4 ? new Date(now - index * day) : null, publishedAt: new Date(now - (30 - index) * day),
        createdAt: new Date(now - (30 - index) * day), updatedAt: new Date(now - (index % 5) * day),
        translations: { create: [{ language: "fr", yearLabel: milestone.label, title: milestone.title, summaryMarkdown: milestone.summary, summaryHtml: html(milestone.summary) }] },
        mathematicians: { create: personLinks.map((mathematicianId, position) => ({ mathematicianId, position })) },
        referenceLinks: { create: (milestone.refs ?? []).map((key, position) => ({ referenceId: referenceIds.get(key), position })) }
      }
    });
  }
  console.log(`Created ${people.length} mathematicians, ${milestones.length} history milestones and ${references.length} references (slugs starting with "${PREFIX}").`);
}

try {
  await removeFixture();
  if (!clean) await create();
} finally {
  await prisma.$disconnect();
}
