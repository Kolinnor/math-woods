# Illustrations des références

Les images et leurs crédits appartiennent à `LibraryReference`. Les citations des
problèmes et concepts ne dupliquent pas ces données : `withCitationImages` enrichit
uniquement les citations autorisées pour le lecteur, après filtrage des spoilers.
Les exports bibliographiques, les brouillons et les fusions de révisions conservent
leur format existant. Les vignettes de lecture sont limitées à 56 px.

## Contrôles des corrections du catalogue

Avant et après une correction ou fusion de références, comparer les inventaires
avec `assertReferenceImagesPreserved` dans `scripts/reference-image-audit.mjs`.
Ce contrôle vérifie aussi les citations : conserver une ancienne fiche illustrée
ne suffit pas si ses problèmes/concepts sont réaffectés à une fiche sans image.
Une suppression ou un remplacement volontaire exige une revue explicite du
résultat ; ne pas contourner silencieusement ce contrôle.

`npm run references:images:check` effectue un audit en lecture seule de la base
configurée : anciennes sources illustrées devenues sans image et illustrations
de fiches fusionnées non reprises par leur destination. Il ne vérifie pas la
disponibilité HTTP des fichiers ni l'exhaustivité des crédits.

## Réparation du 11 septembre 2026

`node --experimental-strip-types scripts/repair-reference-images-20260911.mjs`
produit un plan sans écriture : reprise de l'image existante de Phil Caldero sur
quatre vidéos, rétablissement de cinq liens vers Math Woods. Le texte, l'ordre,
les détails, la confidentialité et le statut Original sont conservés.

L'application exige `--apply HASH_SNAPSHOT CHEMIN_NOUVELLE_SAUVEGARDE`. Le script
refuse un inventaire modifié, crée une sauvegarde sans écrasement, puis applique
le plan en transaction. Les cinq problèmes reçoivent une révision et une nouvelle
version pour préserver la gestion des éditions concurrentes. Conserver également
la sauvegarde hors du conteneur, dans `/opt/math-woods/backups`, avant l'opération.
Une deuxième exécution ne propose aucun changement. Aucune image nouvelle n'est
téléchargée ; les URL et crédits existants sont réutilisés.

Application en production le 11 septembre 2026 à 16:22 UTC : quatre fiches vidéo
corrigées, cinq citations reliées, aucune alerte restante. Sauvegarde préalable :
`/opt/math-woods/backups/reference-images-before-20260911T162238Z.json`.
Cette réparation des données n'a pas déployé le nouveau rendu des vignettes.

Vérification : `npm run test:citations` et `npm run test:citations:images:browser`.
