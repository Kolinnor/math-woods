# Audit des références — 6 septembre 2026

Audit en lecture seule de la production, après le déploiement de `5d73b8389b791101e36744565e4a7d43813b2a88`. Aucune correction de données n’a été appliquée pendant cet audit.

**Mise à jour : les corrections ont ensuite été autorisées et appliquées le 6 septembre 2026. Le bilan d’application figure en fin de document. Les constats ci-dessous décrivent l’état avant correction.**

## Périmètre et résultat

Les 66 fiches `LibraryReference` ont été examinées, avec leurs métadonnées, leurs rattachements et toutes les notes de citation. Elles sont toutes au statut `PUBLISHED` ; 57 sont proposées dans la recherche, 7 sont déjà fusionnées vers Euclide et 2 débuts de BibTeX sont cachés.

Ces fiches portent 92 citations sur 92 pages de problèmes et 71 citations sur 10 pages de concepts. Les traductions sont des pages distinctes dans ces comptes. Il n’existe actuellement aucune citation libre dans les tables de citations des problèmes et concepts (`referenceId = null`). Les 71 anciennes lignes `ConceptReference` sont encore présentes. Les anciennes révisions, propositions en attente et liens insérés directement dans les énoncés ne sont pas inclus dans ces comptes.

Constats :

- **17 fiches sont des fragments de deux notices BibTeX**, dont 15 encore proposées dans la recherche. Elles occupent 67 des 71 citations des concepts.
- **65 fiches sur 66 sont classées `OTHER`**, y compris des livres et un article identifiables. Seule la fiche générale d’Euclide est déjà classée `BOOK`. Le type `OTHER` reste néanmoins légitime pour certaines ressources, notamment un jeu.
- Aucune fiche ne possède de champ structuré `url`, `isbn` ou `bibtex` renseigné. Des URL, ISBN et DOI existent pourtant dans des titres ou notes.
- *Finite Group Theory* apparaît deux fois, sous les identifiants 11 et 27.
- Des mentions d’origine (`Original`, `Inconnue`, `Folklore`, `Math Woods`) ont été transformées en fiches de catalogue.
- Certaines notices mélangent la ressource, le passage et plusieurs sources : personne + vidéo + livre, revue + concours, jeu + numéro d’énigme.

Il faut corriger le contenu et les rattachements. La capacité du système à produire un fichier BibTeX syntaxiquement valide ne garantit pas la justesse bibliographique de ses données.

## Cause retrouvée dans le code

L’ancien `parseReferences`, dans `lib/concept-metadata.ts:7`, découpe le champ de références à chaque saut de ligne. Un bloc BibTeX de neuf ou dix lignes devient ainsi neuf ou dix références libres.

La migration `prisma/migrations/20260902170000_add_library/migration.sql:312` crée ensuite une fiche de bibliothèque par titre hérité des concepts. Elle importe aussi les origines de problèmes et les sources connues avec le type `OTHER` (lignes 273 et 288). Son filtre d’origines inconnues ne couvre pas la forme féminine « Inconnue ».

La migration `20260905150000_problem_citations` cache les titres commençant par `@type{`, mais pas les autres lignes du même bloc. Les champs `author`, `year`, `publisher` et même `}` restent donc proposés. Cacher les deux débuts de BibTeX ne reconstitue pas les références sur les concepts.

Cette chaîne explique exactement les données constatées. L’audit ne permet pas d’attribuer la saisie initiale à une personne et ne le fait pas.

## Reconstitution des deux notices

Les lignes anciennes, remises dans leur ordre, sont acceptées par le parseur BibTeX installé : exactement une entrée et aucune erreur pour chacun des sept concepts. Cela confirme la reconstitution technique ; les métadonnées doivent être vérifiées séparément.

| Ouvrage | Concepts concernés | Correction attendue |
| --- | --- | --- |
| Daniel Perrin, *Cours d’algèbre* | 417 — indice de groupe ; 420 — Théorèmes de Sylow ; 415 — Signature ; 413 — théorème de classification de Fröbenius | Remplacer les 10 lignes de chaque concept par une seule citation du livre, soit 40 lignes → 4 citations. |
| Josette Calais, *Éléments de théorie des groupes* | 412 — formule des classes ; 406 — p-groupe ; 411 — centralisateur | Remplacer les 9 lignes de chaque concept par une seule citation du livre, soit 27 lignes → 3 citations. |

**Perrin : incohérence à résoudre.** Le bloc hérité indique EDP Sciences, 2004, Les Ulis, ISBN `9782868836977`. La [fiche officielle Ellipses](https://www.editions-ellipses.fr/fr/accueil/7778-cours-d-algebre-agregation-9782729855529.html) identifie Daniel Perrin, *Cours d’algèbre (Agrégation)*, 1996, ISBN `9782729855529`. [Perrin cite lui-même ce livre chez Ellipses en 1996](https://www.math.u-psud.fr/~perrin/CAPES/geometrie/GeometrieEuclidienne.pdf). Le titre et l’auteur sont identifiés ; la combinaison EDP/2004/ISBN n’a pas été corroborée. Les deux ISBN hérités passent leur contrôle arithmétique, ce qui ne prouve pas leur attribution. Conserver le bloc original dans l’historique ; ne pas importer ses champs contestés comme des faits, ni attribuer automatiquement l’édition Ellipses aux contributeurs.

**Calais : notice cohérente.** Le titre, l’autrice et PUF sont confirmés dans le [cours de théorie des groupes de l’université de Bordeaux](https://www.math.u-bordeaux.fr/~pmounoud/tds/poly_20.pdf). La notice héritée précise 2014 et ISBN `9782130633471`, concordants avec la [notice de la librairie universitaire de l’ULB](https://shop.pub-ulb.be/product/show/9782130633471/elements-de-theorie-des-groupes). Cette dernière est une source de catalogue, pas une page de l’éditeur PUF.

Les fragments communs `}` (58) et `language = {french}` (66) appartiennent aux deux livres suivant le concept. **Il serait faux de fusionner globalement ces fiches vers un seul ouvrage.** Il faut reconstituer chaque citation dans son contexte, puis retirer les fragments de la recherche.

## Inventaire exhaustif des 66 fiches

Les titres longs sont abrégés uniquement dans ce tableau. « Libre » signifie préserver le texte et ses notes sur les pages concernées, sans en faire une ressource réutilisable de la Bibliothèque. « À préciser » signifie que l’identité complète ou l’édition n’est pas établie : aucune donnée ne doit être inventée.

| ID | Libellé actuel | Diagnostic et traitement proposé |
| --- | --- | --- |
| 1 | Phil Caldero | Personne, pas un ouvrage. Six citations hétérogènes : plusieurs URL de vidéos sont dans les notes ; le problème 402 cite aussi Rotman. Identifier chaque vidéo séparément, préserver le crédit et extraire le livre de la note lorsque confirmé. La citation du problème 147 reste à préciser. |
| 2 | Math Woods | Origine interne, pas une publication identifiée. Passer en texte libre. Les problèmes 365 et 366 contiennent un crédit d’image Wikimedia : le conserver intégralement. Ne pas déduire le statut « Original » du seul nom du site. |
| 3 | oral X-MP 2025 (1ère question) | Citation de concours libre ; session, filière et question à préserver. Document exact non établi. |
| 4 | Inconnue | Marqueur d’absence de source, pas une ressource. Retirer du catalogue, conserver l’information historique. |
| 5 | Oral ENS 2016 MP — RMS 127-2, 10 | Référence libre assez précise ; numéro d’exercice à conserver. Créer éventuellement une notice du fascicule après vérification, pas un livre par exercice. |
| 6 | Oral Mines-Ponts PSI 2012 — RMS 123-2, 583 | Même principe ; fascicule et correspondance à l’exercice non vérifiés. |
| 7 | Euclide — I, proposition 10 | Déjà fusionnée vers 16, sans rattachement restant. Garder la redirection. |
| 8 | Math Woods test | Marqueur de test, problème 89. Ne pas proposer au catalogue. Préserver la page ; aucune suppression de problème préconisée. |
| 9 | Les dattes à Dattier | Six citations sans URL ni notes. Publication ou attribution non identifiée. Garder libre en attendant un lien ou un titre documenté. |
| 10 | Euclide — I, proposition 9 | Déjà fusionnée vers 16 ; conserver. |
| 11 | Finite Group Theory — Martin Isaacs | Livre identifié [S1]. Normaliser le titre, auteur I. Martin Isaacs, type `BOOK`. Fusion éditoriale avec 27 ; vérifier toute différence d’édition avant de fixer un ISBN. |
| 12 | RMS (Oral X PC 2025) | Citation de revue/concours libre, numéro de fascicule ou exercice manquant. |
| 13 | Euclide — I, théorème 4, proposition 7 | Déjà fusionnée vers 16 ; conserver le passage tel qu’hérité jusqu’à vérification de l’édition. |
| 14 | Équation fonctionnelle de Shapiro / Oral X-ENS Cassini | Mélange du sujet du problème et d’une collection de livres. Garder libre ; tome et exercice à retrouver. Ne pas fusionner automatiquement avec le tome Analyse 3 de la fiche 23. |
| 15 | Hans Rådström, An Embedding Theorem for Spaces of Convex Sets | Article identifié [S2], pas un livre. Type `ARTICLE`, auteur, revue, année 1952 et DOI déjà présent dans les notes à structurer. |
| 16 | Éléments — Euclide | Fiche d’ouvrage correctement séparée des passages, utilisée par 15 problèmes et un concept. Édition/traduction non identifiée. Conserver la structure ; harmoniser les passages sans supprimer les scolies ou numérotations héritées. |
| 17 | Euclide — I, proposition 11 | Déjà fusionnée vers 16 ; conserver. |
| 18 | X-ESPCI PC 2018 | Origine de concours libre. Épreuve exacte à préciser avant création d’une notice de sujet. |
| 19 | RMS (Oral ENS 2021) | Référence libre ; fascicule et exercice manquants. |
| 20 | Oral classique ENS/Magistères — RMS 123-2, 16 et 128-2, 11 | Deux citations de fascicules dans une origine. Préserver les deux ; ne pas transformer le libellé entier en titre d’ouvrage. |
| 21 | Xavier Viennot, lecture notes on orthogonal polynomials | Cours de l’auteur sur ce sujet confirmés [S3]. Type probable `LECTURE_NOTES`, mais plusieurs cours existent : titre/version exacts à préciser. |
| 22 | Histoire des sciences arabes — volume 2, Seuil | Livre collectif identifié [S4], direction Roshdi Rashed. Type `BOOK`, volume 2 sur la notice, chapitre 2 sur les citations. Année/ISBN de l’exemplaire à préciser. |
| 23 | Oraux X-ENS | Les notes des deux problèmes précisent **Analyse 3**, Francinou, Gianella, Nicolas, Cassini. Livre identifié [S5]. Renommer vers ce tome, renseigner les auteurs et l’éditeur ; édition exacte inconnue. |
| 24 | Oral ENS MP 2018 — RMS 129-2, 2 | Citation libre ; garder tous les repères. Correspondance au document non vérifiée. |
| 25 | Professeur Layton : L’étrange village (énigme 037) | Jeu confirmé [S6]. Ressource légitime de type `OTHER` ; titre officiel sans numéro d’énigme, « énigme 037 » sur la citation. Ne pas le classer comme livre. |
| 26 | Nicolas Curien — Random Graphs | Notes de cours confirmées, plusieurs versions [S7]. Type `LECTURE_NOTES` ; conserver « chapitre V ». Document exact à rapprocher de ce passage avant de fixer le lien. |
| 27 | I. Martin Isaacs — Finite Group Theory | Même ouvrage que 11 [S1]. Rapprocher les deux citations, conserver passages et anciennes URL de fiches. |
| 28 | Al Moufid en Mathématiques, 2 SM A&B, tome I | Manuel confirmé au catalogue Dar Attakafa [S8]. Type `BOOK`, tome I ; pages 42 et 95 sur les citations. Auteurs/édition non établis. |
| 29 | Euclide — I, théorème 5, proposition 8 | Déjà fusionnée vers 16 ; conserver. |
| 30 | IMO 1988, Problem 6 | Sujet de concours identifié [S9]. Notice « IMO 1988 — sujets », type `COMPETITION`, problème 6 sur chaque citation. Conserver les notes existantes ; leurs anecdotes ne sont pas validées par cet audit bibliographique. |
| 31 | Folklore | Attribution générale, pas un document. Texte libre. |
| 32 | Réduction des endomorphismes — Rached Mneimné, Calvage & Mounet | Livre confirmé par le catalogue de l’éditeur hébergé chez l’auteur [S10]. Type `BOOK`. Garder « proposition 13.7.A, page 73 » sur la citation ; ce repère n’a pas été confronté à l’exemplaire. |
| 33 | Banque Mines-Télécom | Nom d’un concours, sans sujet précis. Texte libre jusqu’à identification du document. |
| 34 | RMS (Oral ENS 2023) ; vidéo de Caldero | Deux sources dans un libellé. Les conserver en texte libre, séparables quand numéro de revue et vidéo sont identifiés. |
| 35 | YouTube « PRIOR » | Source déclarée comme chaîne ; une note donne un titre de vidéo, sans URL. Chaîne/vidéo exacte non retrouvée avec certitude. Libre provisoirement ; `CHANNEL` ou `VIDEO` après identification. |
| 36 | Original | Marqueur d’origine sur sept pages, pas une ressource. Sortir du catalogue. Ne pas cocher automatiquement « créé par vous et indisponible ailleurs » : l’ancienne mention ne prouve pas cette définition complète. |
| 37 | TD LMFI | Feuille d’exercices non identifiée. Note : master Logique Mathématique et Fondements de l’Informatique. Libre ; auteur, établissement, année et lien à préciser. |
| 38 | Oral Centrale MP 2025 | Citation de concours libre ; conserver session et filière. |
| 39 | Oral Mines-Ponts MP 2007 — RMS 118-2, 345 | Citation libre ; garder les repères, fascicule non vérifié. |
| 40 | Oral ENS 2025 | Trois citations de concours, sans sujet identifié. Libre. |
| 41 | Exercice 1, DS de théorie des groupes, Bordeaux, 12/11/2020 | PDF universitaire retrouvé et titre/date confirmés [S11]. Créer une notice du DS (`OTHER` dans les types actuels), mettre son URL dans le champ dédié et l’exercice 1 sur la citation. |
| 42 | Original Math Woods problem | Marqueur sur huit pages. Même traitement prudent que 36, en préservant les langues et la provenance. |
| 43 | Amusements in Mathematics | Livre de Henry Ernest Dudeney confirmé par le texte [S12]. Type `BOOK`, titre/auteur séparés. Conserver le problème 1 et la note signalant l’adaptation de l’énoncé. |
| 44 | Euclide — I, proposition 12 | Déjà fusionnée vers 16 ; conserver. |
| 45 | livre : Algebra can be fun | Livre de Yakov Perelman identifié [S13]. Type `BOOK`, enlever « livre : ». La note affirme « années 1920 » : date non corroborée, ne pas la transférer dans l’année de publication. Édition exacte à préciser. |
| 46 | address = Les Ulis | Fragment Perrin ; restituer dans l’archive du bloc, sans adopter la ville comme donnée vérifiée. |
| 47 | isbn = 978-2868836977 | Fragment Perrin ; attribution bibliographique non corroborée malgré une clé ISBN valide. |
| 48 | Euclide — I, définition 10 | Déjà fusionnée vers 16 ; conserver. |
| 49 | @book{perrin2004cours, | Début du bloc Perrin, actuellement caché. Reconstituer une seule notice et ses quatre citations. |
| 50 | isbn = 978-2130633471 | Fragment Calais ; reconstituer la notice. |
| 51 | author = Perrin, Daniel | Fragment Perrin ; auteur identifié, à mettre dans son champ. |
| 52 | author = Calais, Josette | Fragment Calais ; autrice identifiée, à mettre dans son champ. |
| 53 | publisher = EDP Sciences | Fragment Perrin ; conflit avec les sources trouvées, ne pas reprendre aveuglément. |
| 54 | Toute l’analyse de la Licence (Cours et exercices corrigés | Livre de Jean-Pierre Escofier, Dunod, identifié [S14]. Fermer/corriger le titre, type `BOOK`. Conserver chapitre 16, page 532 ; édition inconnue, ne pas lui attribuer automatiquement la dernière. |
| 55 | title = Éléments de théorie des groupes | Fragment Calais ; titre à décoder et remettre dans la notice. |
| 56 | series = Collection Enseignement Sup. Mathématiques | Fragment Perrin ; collection non corroborée, conserver dans l’archive plutôt que dans la notice vérifiée. |
| 57 | year = 2004 | Fragment Perrin ; année non corroborée pour l’exemplaire visé. |
| 58 | } | Fin commune aux deux blocs : corriger par concept, jamais fusionner globalement vers un seul livre. |
| 59 | address = Paris | Fragment Calais ; intégrer au bloc reconstitué. |
| 60 | year = 2014 | Fragment Calais ; année concordante avec la notice de catalogue. |
| 61 | title = Cours d’algèbre | Fragment Perrin ; titre identifié. |
| 62 | Série de fonctions Intégrale de Riemann | Correspondance probable avec Françoise Boschet, *Séries de fonctions. Intégrale de Riemann*, Masson [S15]. Type `BOOK` proposé ; attribution à confirmer à partir de l’exemplaire, conserver chapitre 1, page 1. |
| 63 | Corps Commutatifs et Théorie de Galois | Patrice Tauvel est déjà indiqué dans la note ; livre confirmé chez Calvage & Mounet [S16]. Type `BOOK`, auteur sur la fiche. Édition inconnue. |
| 64 | @book{calais2014elements, | Début du bloc Calais, actuellement caché. Reconstituer une notice et trois citations. |
| 65 | publisher = Presses Universitaires de France | Fragment Calais ; éditeur à remettre dans son champ. |
| 66 | language = french | Champ commun aux deux blocs : correction contextuelle comme pour 58. |

## Sources utilisées pour identifier les ressources

Les sources permettent d’établir l’existence et la nature des ressources. Elles ne prouvent pas automatiquement que chaque problème provient du passage déclaré ni que le contributeur utilisait l’édition présentée.

- **S1** — [AMS, Finite Group Theory, I. Martin Isaacs](https://bookstore.ams.org/view?ProductCode=GSM%2F92), avec [pages bibliographiques de l’édition 2008](https://www.ams.org/books/gsm/092/gsm092-endmatter.pdf).
- **S2** — [Article de Hans Rådström dans les archives JSTOR](https://www.jstor.org/stable/2032477) : *Proceedings of the American Mathematical Society*, volume 3, no 1, 1952, pages 165–169, DOI `10.2307/2032477`.
- **S3** — [Site de Xavier Viennot](https://viennot.org/) et [présentation de ses recherches](https://www.xavierviennot.org/xavier/recherches.html). Plusieurs cours sur les polynômes orthogonaux y figurent ; ils ne suffisent pas à choisir la version citée.
- **S4** — [Présentation par l’équipe ayant traduit l’Histoire des sciences arabes](https://www.histoire-des-sciences.com/publi2.php) ; [notice du tome 2 à l’Institut du monde arabe](https://librairie.imarabe.org/9782020620277-histoire-des-sciences-arabes-tome-2). Les éditions trouvées ont des dates différentes ; pas d’ISBN imposé à la citation existante.
- **S5** — [Catalogue officiel Cassini 2022–2023](https://store.cassini.fr/img/catalogues/Catalogue-Cassini-2022-2023.pdf), *Oraux X-ENS. Mathématiques*, Analyse 3, Serge Francinou, Hervé Gianella, Serge Nicolas.
- **S6** — [Fiche officielle Nintendo du jeu](https://www.nintendo.com/fr-fr/Jeux/Nintendo-DS/Professeur-Layton-et-l-etrange-village-272563.html). La fiche ne vérifie pas le contenu particulier de l’énigme 037.
- **S7** — [Page d’enseignement de Nicolas Curien](https://www.imo.universite-paris-saclay.fr/~nicolas.curien/enseignement.html), distinguant plusieurs cours sur les graphes aléatoires.
- **S8** — [Catalogue officiel Dar Attakafa](https://www.darattakafa.com/product/all/left-sidebar), qui distingue les tomes 1 et 2 de *Al Moufid en maths 2sm A&B*.
- **S9** — [Sujets officiels de l’IMO 1988](https://www.imo-official.org/problems/1988/).
- **S10** — [Catalogue Calvage & Mounet hébergé sur la page de Rached Mneimné](https://webusers.imj-prg.fr/~rached.mneimne/CM/IMG/pdf/catalogue.pdf), *Réduction des endomorphismes*, 2006.
- **S11** — [DS original de théorie des groupes, université de Bordeaux](https://www.math.u-bordeaux.fr/~dbenoua/Documents/groupes-DS2020.pdf), daté du 12 novembre 2020 ; l’exercice 1 traite des groupes d’ordre 144.
- **S12** — [Texte d’Amusements in Mathematics, Henry Ernest Dudeney, 1917](https://www.gutenberg.org/cache/epub/16713/pg16713-images.html).
- **S13** — [Notice bibliographique WorldCat d’Algebra Can Be Fun](https://search.worldcat.org/title/7502077), édition anglaise Mir de 1979. Source de catalogue, pas identification de l’exemplaire utilisé sur Math Woods.
- **S14** — [Fiche Hachette/Dunod de Toute l’analyse de la Licence, Jean-Pierre Escofier](https://www.hachette.fr/livre/toute-lanalyse-de-la-licence-3e-ed-9782100847969/), ici troisième édition de 2023 ; l’édition du contributeur reste inconnue.
- **S15** — [Cours de l’UTC citant F. Boschet, Séries de fonctions ; Intégrale de Riemann, Masson, 1995](https://www.utc.fr/~zurekant/Poly_MT12.pdf). Correspondance bibliographique probable, sans contrôle de l’exemplaire cité.
- **S16** — [Fiche officielle Calvage & Mounet du livre de Patrice Tauvel](https://www.calvage-et-mounet.fr/api-website-feature/element-document-viewers/3985/Document), ici troisième édition ; ne pas déduire celle du contributeur.

## Plan de correction proposé

1. **Sauvegarder et établir les changements exacts.** Conserver un état avant correction de chaque fiche et de chaque citation concernée. Construire une liste éditoriale explicite par identifiant, avec valeurs avant/après et justification. Recontrôler cet état avant application pour ne pas écraser une modification récente.
2. **Réparer les sept concepts en priorité.** Reconstituer les notices Perrin et Calais ; remplacer les 67 fragments par 7 citations. Archiver les anciens fragments et leurs blocs originaux. Mettre aussi à jour la représentation héritée des références pour éviter qu’une édition ultérieure réintroduise les lignes cassées.
3. **Normaliser les ressources identifiées.** Renseigner types, titres, auteurs et éditeurs vérifiés. Fusionner les deux fiches Isaacs en conservant les rattachements et redirections. Traiter les métadonnées d’édition à part des informations sur l’œuvre.
4. **Corriger les citations dans leur contexte.** Déplacer les pages, exercices, propositions et énigmes dans le passage ; préserver les notes, langues, crédits d’image, liens de vidéos, rôles et règles de masquage. Une modification du titre de catalogue seule ne suffit pas : les citations possèdent aussi un texte copié lors de la migration.
5. **Sortir les origines génériques du catalogue.** Les convertir en citations libres lorsque l’information est utile. Le retrait de la recherche ne doit pas supprimer les mentions d’origine sur les problèmes. Les anciennes mentions « Original » demandent un traitement spécifique, sans affirmer une exclusivité de publication non vérifiée.
6. **Laisser les incertitudes explicites.** « Les dattes à Dattier », « TD LMFI », certaines vidéos, versions de cours et références de concours resteront en texte libre tant que le document exact n’est pas retrouvé. Aucun blocage des corrections certaines à cause de ces cas.
7. **Empêcher la récidive.** Détecter les blocs BibTeX collés dans un champ libre et proposer leur import comme bloc entier. Refuser ou signaler les titres manifestement constitués d’un champ isolé ou d’une accolade lors d’une création de fiche. Ajouter un contrôle de qualité du catalogue distinct du contrôle syntaxique des exports.

La correction éditoriale peut être faite manuellement, fiche par fiche. Son application sera plus sûre par une opération contrôlée et transactionnelle, issue de cette liste explicite, avec un aperçu avant application et un journal de ce qui change. Il ne faut pas exécuter une fusion générale par ressemblance de titre.

Vérifications ciblées après correction : une référence réelle sur chacun des sept concepts concernés ; aucun fragment dans la recherche ni dans les exports ; notes et crédits conservés ; ancienne URL des doublons toujours résolue ; exports BibTeX et JSON concordants ; absence de réapparition des fragments après une modification de concept. Les tests de syntaxe seuls sont insuffisants.

## État de livraison de cet audit

- Inventaire des 66 fiches et de leurs citations terminé.
- Deux blocs BibTeX reconstitués en mémoire et analysés sans erreur, pour les sept concepts.
- Ressources certaines, correspondances probables et informations non établies distinguées ci-dessus.
- Instantanés de travail locaux dans `runtime/reference-audit-20260906.json` et `runtime/reference-audit-context-20260906.json` ; non publiés.
- Aucune mutation en production, aucun commit, aucun déploiement.

## Application des corrections — 6 septembre 2026

À la suite de la demande explicite de corriger immédiatement les références, le script `scripts/correct-reference-catalogue-20260906.mjs` a appliqué une liste éditoriale déterministe dans une transaction PostgreSQL. Il compare l’état courant à l’instantané examiné, refuse les modifications concurrentes et vérifie tous les champs conservés avant validation. Il refuse également une seconde application.

Résultat effectif :

- 58 fiches existantes corrigées, masquées ou fusionnées ; aucune fiche supprimée physiquement.
- 5 fiches créées : quatre vidéos précisément identifiées de Phil Caldero (67 à 70) et le livre de Joseph J. Rotman (71).
- 22 ressources actives proposées dans le catalogue, contre 57 auparavant.
- 93 citations sur les 92 pages de problèmes : la source Rotman a été séparée de la vidéo qui la mentionnait.
- 11 citations sur les 10 concepts, contre 71 : les 60 lignes excédentaires des deux blocs BibTeX ont été retirées des citations actuelles et de leur représentation héritée, après sauvegarde. Le premier identifiant de citation de chaque bloc a été conservé.
- 54 citations de problèmes et une citation de concept sont désormais libres. Leur texte reste consultable sur les pages.
- Les deux notices de *Finite Group Theory* partagent désormais la fiche 11 ; la fiche 27 redirige vers elle.
- Les fragments partagés 58 et 66 sont archivés sans redirection vers un livre arbitraire. Les fragments propres à chaque livre redirigent vers sa fiche.
- Le BibTeX original de Calais est conservé dans sa fiche. Le bloc Perrin, dont certaines métadonnées étaient contestées, est archivé dans la note de revue ; ses champs non corroborés ne sont pas exportés comme des faits.
- Les pages, textes des énoncés, auteurs de pages, rôles de citations, règles de masquage et cases « Original » n’ont pas été modifiés. Les crédits d’image sont conservés. Les rares notes raccourcies ont été déplacées dans le passage ou les champs bibliographiques ; l’affirmation non étayée « publié dans les années 1920 » a été retirée de la note Perelman, avec l’original dans la sauvegarde.

Précisions complémentaires obtenues pendant la correction : les réponses officielles YouTube oEmbed ont confirmé les vidéos `iB34oGdCiuo`, `k8Iz5b7cz1g`, `RiYMeW4YYYA` et `8ynDBMqyMyE`, ainsi que la chaîne `@philcaldero8964`. La [fiche Springer du livre de Rotman](https://link.springer.com/book/10.1007/978-1-4612-4176-8) confirme titre et auteur. Aucune édition n’a été imposée à sa citation. Le simple crédit « Phil Caldero » restant pointe vers la chaîne identifiée.

Les ressources encore insuffisamment identifiées — notamment les cours de Viennot et Curien dans leur version exacte, « Les dattes à Dattier », « TD LMFI », « PRIOR », plusieurs indications de concours et la correspondance probable avec Boschet — restent en texte libre. Les éditions inconnues restent non renseignées. Aucun travail de recherche supplémentaire n’a été présenté comme une certitude.

Sauvegarde et traçabilité sur le VPS, dans `/opt/math-woods/backups/reference-correction-20260906/` :

- `database-before.dump.gz` : sauvegarde complète de PostgreSQL, compression vérifiée ;
- `before.json` : état des références avant intervention ;
- `correction.mjs` : copie exacte du script testé et exécuté ;
- `plan.json` : liste des modifications avant/après ;
- `receipt.json` : reçu d’application, nouveaux identifiants et état final.

Empreinte SHA-256 du plan appliqué : `7b2dc63e58b3f258a3a656dd85ac74863a4bd1e6b83a19fd360c2694dc249b01`.

Vérifications réalisées :

- Migrations et répétition de la correction dans une base PostgreSQL jetable sur un réseau Docker isolé. Docker local étant indisponible, ce test a été effectué sur le VPS sans accès à sa base de production.
- Refus d’une modification concurrente et annulation complète après une erreur injectée au milieu des écritures.
- Validation des citations, des crédits d’image, des identités de dédoublonnage et des exports des 22 ressources actives.
- Relecture indépendante de la production après application : état identique au reçu.
- **102 pages vérifiées publiquement : 204 exports JSON/BibTeX valides, sans échec.** Chaque citation exportée a été comparée à l’état corrigé. Les sections de références des 10 concepts ont aussi été vérifiées dans leur langue d’origine.
- `/api/health` répond 200 avec `ok: true`.

La correction porte sur les données : aucune modification du code applicatif n’a été déployée, aucun commit ni push effectué. Les scripts et ce rapport restent disponibles localement pour revue. Les garde-fous supplémentaires de saisie évoqués dans le plan restent une amélioration applicative distincte ; cette intervention ne les a pas déployés.
