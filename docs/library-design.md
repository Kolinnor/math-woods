# Bibliothèque : design des pages de lecture

La bibliothèque reprend les matériaux du reste du site : papier crème, vert forêt, titres en
serif, cartes arrondies à 11 px et rail d’actions des pages de concepts et de problèmes.
Chaque rubrique a un accent discret : brique pour l’histoire, vert pour les mathématiciens,
bleu encre pour les références. Les époques ont chacune une couleur, que reprennent les
monogrammes, les frises et les filtres.

## Époques

Les époques sont éditables par les administrateurs sur `/library/eras` (modèle `LibraryEra`).
Chacune commence à l’année indiquée et se termine quand la suivante commence : toute année
appartient donc à une seule époque. Les filtres et leurs compteurs utilisent le chevauchement
des dates : une vie ou une période historique peut apparaître dans plusieurs époques.
Un événement ponctuel n’apparaît que dans l’époque de son année. « Toutes les époques »
compte chaque fiche une fois, y compris les personnes sans dates connues.
Les couleurs et la répartition de la sélection d’accueil restent fondées sur le milieu
de la vie ou de la période ; le catalogue non filtré classe les repères par année de début.

La migration `20260925180000_library_eras` crée la table avec sept époques par défaut
(les mêmes valeurs que `DEFAULT_LIBRARY_ERAS` dans `lib/library-display.ts`). La colonne
`HistoryMilestone.era` est conservée mais n’est plus saisie : elle est déduite de l’année.

## La frise de l’accueil

La frise montre une sélection, pas un recensement : dans chaque époque, au plus 8 vies,
6 repères datés et 3 périodes. Passent d’abord les fiches cochées « Sur la frise » par un
relecteur (bouton dans la page Modifier), puis les plus complètes (portrait, présentation,
repères, œuvres et liens). Sous chaque époque, le nombre total de mathématiciens et de repères
renvoie aux catalogues filtrés. Cliquer une époque ouvre sa frise en grand sur la page
Histoire (jusqu’à 40 vies et 30 repères, avec un axe des années).
Toutes les fiches sélectionnées sont placées : des lignes supplémentaires sont créées
si nécessaire. Les compteurs globaux ne somment pas les époques, qui se recouvrent.
L’accueil précise que les colonnes ont la même largeur mais des échelles temporelles
différentes. Les liens de la frise vers le catalogue des personnes incluent les deux langues.

L’éditeur d’époques utilise `ActionFeedbackForm` pour afficher les erreurs de validation
sur place sans perdre les champs saisis. La suppression dispose d’un formulaire séparé.
Validation : `node --experimental-strip-types --test tests/library-era-regressions.test.mjs`
et `node tests/library-eras.browser.mjs` (Chromium et WebKit, FR/EN).

Le calcul (`lib/library-frise.ts`) lit les fiches publiées en deux requêtes légères par page.
Mesuré en local avec 3 000 mathématiciens : environ 0,15 s pour l’accueil, 190 Ko de HTML.
La sélection de l’accueil se fait par recherche (`/api/library/entries/search`), sans lister
tout le catalogue.

## Repères historiques

Le type « Événement » (`EVENT`) s’ajoute aux découvertes, publications et périodes : congrès,
prix, fondations, défis publics… Sur la frise, les événements et les autres repères datés sont
des points, les périodes des bandes, les vies des mathématiciens des barres.

## Fichiers

- `app/styles/96-library.css` : pages de lecture (accueil, catalogues, fiches, éditeur d’époques).
  Importé en dernier dans `app/layout.tsx`.
- `app/styles/68-library.css` : formulaires d’édition, relecture et widgets partagés.
- `lib/library-display.ts` : époques (calculs sans base de données), initiales, dates.
- `lib/library-eras.ts` : lecture des époques en base (`getLibraryEras`).
- `lib/actions/library-era-actions.ts` : enregistrement, ajout et suppression des époques.
- `components/library/LibraryFrise.tsx` : la frise (accueil et époque en grand).
- `lib/library-frise.ts` : score et sélection des fiches de la frise.
- `lib/actions/library-timeline-actions.ts` : bouton « Sur la frise » des pages de modification.
- `components/library/LibraryEntryPicker.tsx` : choix d’une fiche par recherche.
- `components/library/LibraryEraStrip.tsx` : filtres rapides par époque des catalogues.
- `components/library/LibraryPersonPortrait.tsx` : portrait, ou monogramme teinté selon l’époque.
- `components/library/LibraryEntryNavigation.tsx` : fil d’Ariane, langues et statut, rail des fiches.

## Pages

- **Accueil** : onglets, recherche globale, frise des mathématiques (époques, périodes,
  événements et vies), sélection « À la une » (modifiable par les administrateurs) et fiches
  récemment enrichies, avec un lien vers les fiches à relire.
- **Mathématiciens** : filtres, époques en pastilles, galerie de cartes avec portrait ou monogramme.
- **Histoire** : frise verticale groupée par époque, avec la description de chaque époque.
- **Références** : filtres par type et registre.
- **Fiches** : bandeau réduit, fil d’Ariane, langues et statut à droite du titre, rail
  d’actions (Modifier, Traduire, contemporains ou position sur la frise).
- **Pages de modification** : la gestion de la fiche (relecture, archivage) est à côté du lien
  « Retour », et non plus sur la fiche publique.

## Données de démonstration locales

`scripts/library-fixture.mjs` crée, uniquement sur une base locale, des mathématiciens, des
repères (dont des événements et des périodes) et des références préfixés `mwlib-` :

```
node scripts/library-fixture.mjs          # crée ou recrée les fiches
node scripts/library-fixture.mjs --clean  # les supprime
```

Le script refuse toute base distante : seuls `localhost`, `127.0.0.1` et les noms de
conteneurs locaux `postgres` et `db` sont acceptés. Il suppose la migration des époques
appliquée (`npx prisma migrate dev`).
