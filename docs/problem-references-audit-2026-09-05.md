# Audit des références dans les problèmes — 5 septembre 2026

## Conclusion

Le parcours actuel demande de gérer un catalogue bibliographique pour une tâche
souvent aussi simple que « indiquer d'où vient ce problème ». La liste déroulante
est le symptôme le plus visible, mais trois changements sont nécessaires ensemble :
restaurer une saisie libre, proposer une recherche facultative dans un catalogue
nettoyé, et intégrer les citations au cycle normal d'édition du problème.

Cet audit ne modifie ni l'interface ni les données de production. Il s'appuie sur
la capture fournie, le code local et deux lectures ciblées de la base de production.
Les risques d'édition concurrente sont déduits du code ; aucune course n'a été
provoquée en production. Les comportements mobiles et avec lecteur d'écran restent
à tester sur la future interface : aucune session de test utilisateur n'est revendiquée.

## Décisions prises avec le propriétaire

- Texte libre par défaut, sans création obligatoire de fiche de Bibliothèque.
- Une fiche d'ouvrage « Euclide — Éléments », avec livre/proposition sur le problème.
- Texte libre et recherche accessibles à tous les contributeurs autorisés à contribuer.
  Le droit de publier immédiatement une modification du problème reste celui du site.
- Si la référence est absente : terminer en texte libre, puis proposer facultativement
  son ajout au catalogue. La publication du problème n'attend pas cette proposition.
- Références visibles par défaut ; possibilité de masquer une citation jusqu'à résolution.
- L'ouverture de la recherche n'implique pas de rendre toute la Bibliothèque publique.

## État constaté en production

| Observation | Résultat |
| --- | --- |
| Fiches publiées du catalogue | 66 |
| Fiches provenant d'anciennes sources libres de problèmes | 43 |
| Fiches dont le titre mentionne Euclide | 8 |
| Liens des 8 fiches Euclide | 13 vers des problèmes, 1 vers un concept |
| Titres commençant par une entrée BibTeX | 2, utilisés par 7 liens de concepts |
| Problèmes publics avec une ancienne origine renseignée, sans lien de catalogue | 0 dans le contrôle effectué |

Les huit fiches d'Euclide sont de type « OTHER », sans auteur structuré. La fiche
générale existe déjà (id 16), avec sept problèmes associés. Six autres fiches de
problèmes contiennent le livre et une proposition dans le titre ; une fiche issue
d'un concept contient « Livre 1 — Définition 10 ».

Les entrées `@book{perrin2004cours,` et `@book{calais2014elements,` viennent des anciennes
références de concepts. Le champ BibTeX du catalogue n'est pas renseigné et les anciennes
lignes correspondantes n'ont ni URL ni note permettant de récupérer la notice complète.
On ne peut pas déduire une bibliographie fiable de ces seules clés de citation.

## Constats, conséquences et corrections

### 1. Bloquant : le parcours simple a disparu

Le formulaire ne présente plus les anciens champs `origin`, `originChapter`,
`originPage`, `originNote`. Le sélecteur de catalogue n'apparaît qu'aux admins/owners,
et uniquement lors d'une édition publiée immédiatement. Un contributeur ordinaire
n'a donc pas de parcours équivalent à l'ancien champ source, même s'il peut créer
un problème ou proposer une modification.

**Correction :** un bloc « Références (facultatif) » directement visible, avec un
champ texte libre. Une personne doit pouvoir coller une référence et enregistrer
son problème sans ouvrir une autre page ni comprendre la Bibliothèque.

Sources : [édition du problème](../app/problems/[slug]/edit/page.tsx),
[création](../app/problems/new/page.tsx), [actions](../lib/actions/problem-actions.ts).

### 2. Majeur : liste exhaustive, informations insuffisantes

Chaque chargement du formulaire interroge toutes les fiches publiées, triées par
titre. Le navigateur reçoit un `select` avec tous les titres ; aucun champ de
recherche n'est prévu. Auteurs, année et édition ne sont pas chargés. Le type est
transmis au composant mais n'est pas affiché. Les titres localisés ne sont pas utilisés.

**Correction :** un bouton « Rechercher dans le catalogue » ouvre une petite fenêtre.
La requête recherche côté serveur le titre, l'auteur, les alias et les identifiants
utiles, renvoie un nombre borné de résultats, puis permet d'en demander davantage.
Chaque résultat montre le titre et une ligne auteur/édition/année lorsqu'ils existent.
Il ne faut pas remplacer le `select` par une fenêtre qui charge encore tout le catalogue.

Sources : [sélecteur](../components/library/LibraryReferencePicker.tsx),
[requête de la page d'édition](../app/problems/[slug]/edit/page.tsx).

### 3. Majeur : la migration a mélangé ouvrage et citation

La migration crée une fiche publiée par ancienne origine normalisée. Elle conserve
le texte, mais ne sépare pas une identité d'ouvrage d'un livre, d'une proposition
ou d'un commentaire. Le même mécanisme reprend les titres mal formés des références
de concepts. Ces entrées historiques sont ensuite proposées comme des fiches normales.

**Correction :** préparer une liste explicite des regroupements et corrections,
avec un aperçu avant/après. Pour Euclide, réutiliser la fiche générale et déplacer
les informations de passage vers chaque citation. Préserver les notes déjà présentes,
y compris scolies et correspondances entre numéros de théorèmes et propositions.
Ne pas corriger une numérotation en supposant une édition qui n'a pas été identifiée.

Les deux références BibTeX demandent une vérification de la source d'origine. Elles
doivent être exclues des nouvelles suggestions tant qu'elles ne constituent pas
des notices compréhensibles, tout en conservant leurs liens et leur texte historique.
Ne pas inventer des auteurs, années ou titres à partir de la clé BibTeX.

Source : [migration de la Bibliothèque](../prisma/migrations/20260902170000_add_library/migration.sql).

### 4. Majeur : créer une fiche interrompt la rédaction

« Nouvelle référence » ouvre un autre onglet contenant le formulaire complet :
titre canonique, titre traduit, type, auteurs, éditeur, dates, identifiants, présentation,
etc. La fiche est enregistrée en brouillon ou soumise à validation ; elle n'apparaît
donc pas automatiquement parmi les références publiées. Le sélecteur d'origine ne
se rafraîchit pas non plus. Ce lien ne permet pas d'achever simplement la tâche en cours.

**Correction :** « Aucun résultat ? Utiliser une référence libre ». Après sauvegarde
du problème, une proposition facultative au catalogue peut être préremplie avec le
texte saisi. Elle dispose de sa propre validation et ne transforme jamais chaque
référence libre en fiche globale automatiquement.

Sources : [formulaire de fiche](../components/library/ReferenceForm.tsx),
[boutons de sauvegarde](../components/library/LibraryFormActions.tsx),
[actions Bibliothèque](../lib/actions/library-actions.ts).

### 5. Majeur : vocabulaire et densité inadaptés

Chaque sélection affiche immédiatement rôle, passage, note, source principale et
suppression. Les champs rôle/passage/note n'ont pas de libellé associé explicite ;
les deux derniers reposent sur leur placeholder. Le titre est tronqué. La grille
prévoit six colonnes avec plusieurs largeurs minimales, même lorsque la section
occupe une colonne du formulaire : le risque de débordement doit être vérifié en pratique.
La section est en outre cachée derrière « Ajouter des détails ».

**Correction :** titre lisible, passage facultatif clairement nommé et suppression
sur chaque citation. Rôle et note détaillée passent dans « Options ». Le choix
« Principale » n'est pas demandé pour une citation unique ; pour plusieurs citations,
l'ordre peut suffire à l'affichage, avec conservation du marqueur historique en interne.
Les intitulés doivent préciser « Source du problème », « Pour approfondir »,
« Contient une preuve » et « Attribution » si ces distinctions sont exposées.

Sources : [sélecteur](../components/library/LibraryReferencePicker.tsx),
[styles](../app/styles/68-library.css), [détails repliés](../components/ProblemDetailsDisclosure.tsx).

### 6. Prioritaire avant ouverture : sauvegarde et historique incomplets

Les citations sont conservées uniquement dans l'état React du sélecteur : elles
n'ont pas de brouillon local dédié et sont perdues lors d'un rechargement.
Les snapshots du problème contiennent l'ancienne origine, mais aucune référence
de catalogue. Les liens sont remplacés séparément après la fusion des autres champs.

Conséquences déduites du code : une édition ancienne peut réécrire la liste des
références sans que le conflit porte sur celles-ci ; les différences de citations
ne sont pas représentées dans l'historique et une restauration ne les restaure pas.
Retirer seulement le contrôle admin ne suffit pas : les propositions de modifications
des contributeurs ne contiennent pas ces références non plus.

**Correction :** citations incluses dans les snapshots, comparaisons, propositions,
restaurations et brouillons, avec des identifiants stables. Un formulaire ouvert avant
la mise à jour, ou n'envoyant pas le champ, ne doit jamais être interprété comme une
suppression volontaire. Les anciens snapshots doivent rester lisibles sans effacer
les citations qu'ils ne savaient pas représenter.

Sources : [snapshots](../lib/problem-revisions.ts), [actions problème](../lib/actions/problem-actions.ts),
[remplacement des liens](../lib/library-linking.ts), [sélecteur](../components/library/LibraryReferencePicker.tsx).

### 7. Majeur : affichage, aperçu et export ne racontent pas la même chose

La page publiée affiche les liens du catalogue, avec le titre puis une citation
formatée contenant à nouveau ce titre. Les lecteurs ordinaires ne peuvent pas ouvrir
la fiche, et le rendu du problème ne propose pas son URL externe. L'aperçu du formulaire
ne transmet que le titre et l'énoncé. L'export Markdown utilise encore l'ancienne origine,
donc une modification du catalogue peut ne pas se retrouver dans le document exporté.

**Correction :** un rendu commun de citation, utilisé dans le formulaire, l'aperçu,
la page et l'export. Une ligne concise, par exemple « Euclide — Éléments, livre I,
proposition 10 », puis une note facultative. Un lien externe validé doit pouvoir
être utilisé sans donner accès aux outils privés de la Bibliothèque.

Sources : [page du problème](../app/problems/[slug]/page.tsx),
[aperçu](../components/ContentPreviewButton.tsx), [export](../app/problems/[slug]/export/route.ts).

### 8. Cas limites à traiter dans la refonte

- Fiche archivée déjà liée : la conserver lisible et modifiable dans le contexte
  du problème. Aujourd'hui elle peut apparaître sous la forme `#id`, car seules les
  fiches publiées sont chargées, puis empêcher l'enregistrement lors de la validation.
- Même ouvrage cité à plusieurs endroits : conserver tous les passages et notes.
  L'unicité actuelle problème/ouvrage interdit plusieurs liens identiques ; le
  nettoyage d'Euclide doit traiter les collisions explicitement.
- Traductions : la création copie les liens, mais les modifications ultérieures
  ne sont pas synchronisées avec les autres langues comme les métadonnées partagées.
  Recommander le partage de l'ouvrage et du passage, avec texte libre et notes
  localisables ; préserver les divergences existantes au lieu de les écraser.
- Masquage : ajouter une visibilité à la citation, pas à la fiche d'ouvrage globale.
  Pour une citation masquée, ne pas envoyer son contenu dans le HTML, les données
  client ou l'export avant résolution. L'auteur et les personnes autorisées à éditer
  doivent pouvoir la voir. La recherche globale peut naturellement retrouver l'ouvrage,
  mais ne doit pas révéler son association masquée à ce problème.
- La recherche reste utilisable au clavier, avec focus dans le champ à l'ouverture,
  fermeture par Échap, retour du focus au bouton, états de chargement et d'erreur
  annoncés, et présentation adaptée au mobile.

## Interface recommandée

Le bloc apparaît avant les boutons d'enregistrement, sans déplier les options avancées.

```text
Références (facultatif)
Indiquez simplement d'où vient ce problème.

[ Olympiades 2018, exercice 3                         ]
[ Lien (facultatif)                                   ]

[ + Ajouter une référence ]   [ Rechercher dans le catalogue ]
```

Le champ de lien peut se déplier à la demande. Aucune saisie n'est obligatoire.
Plusieurs citations libres et de catalogue peuvent coexister. Ne pas ajouter un
choix préalable « mode simple / mode avancé » à comprendre avant de commencer.

```text
Rechercher une référence                           [Fermer]
[ Euclide                                            ]

Éléments
Euclide · Ouvrage                                 [Choisir]

Aucune référence adaptée ? [ Utiliser un texte libre ]
```

Après le choix, la fenêtre se ferme et le focus passe au passage dans le formulaire :

```text
Euclide — Éléments                                 [Retirer]
Passage (facultatif)
[ Livre I, proposition 10                               ]
[ ] Masquer cette référence jusqu'à résolution
[ Options ]
```

La recherche doit accepter les variantes accentuées et les titres français/anglais
connus, afficher environ dix résultats pertinents et ne pas lister tout au démarrage.
Des références récemment utilisées peuvent être proposées en nombre limité. Le clic
« Choisir » ajoute directement la citation, sans deuxième bouton « Ajouter » obligatoire.
Une panne de recherche laisse la saisie libre utilisable et conserve la requête.

## Modèle et migration recommandés

Adopter une représentation commune de « citation du problème » : texte libre et URL
facultative, ou lien vers une fiche, puis passage, note, ordre et visibilité. L'adaptation
de la table de liens existante avec un `referenceId` nullable est une voie possible ;
la validation doit exiger un texte non vide ou une référence, et éviter deux sources
éditoriales concurrentes entre cette représentation et les anciennes colonnes `origin`.

Conserver une seule citation par ouvrage sur un problème, avec plusieurs passages
dans le champ si nécessaire. Lors d'une fusion, concaténer sans perte les passages
distincts et conserver séparément les notes ; arrêter les cas ambigus pour examen.
Les citations libres multiples restent possibles. La proposition au catalogue ne
remplace une citation libre qu'après publication de la fiche et choix explicite.

Pour le nettoyage, utiliser une nouvelle migration ou un script contrôlé, jamais une
réécriture de la migration déjà appliquée. Préparer un tableau id source → fiche cible
→ passage/note, vérifier tous les liens problèmes/concepts et préserver les anciennes
URL. Écarter les anciennes fiches des nouvelles suggestions via un mécanisme de fusion
ou de retrait du catalogue, sans perdre les références historiques.

La fiche « Éléments » peut être commune lorsque l'édition n'est pas précisée. Ne pas
fusionner automatiquement des éditions explicitement distinctes dont la pagination
diffère. Les sept liens existants de la fiche générale ne doivent pas changer de sens.
La fiche issue du concept doit également conserver son passage « Définition 10 » :
il s'agit de préserver un lien existant, pas de refondre les formulaires de concepts.

## Ordre d'implémentation

1. Définir la citation commune et couvrir sauvegarde, propositions, conflits, brouillons,
   historique, restauration et anciens formulaires. Préparer le nettoyage en simulation.
2. Introduire le champ libre visible et la fenêtre de recherche bornée, avec accès des
   contributeurs aux seules notices publiées utiles, sans ouvrir les outils de gestion.
3. Unifier rendu, aperçu, export et visibilité ; adapter création, édition et traduction.
4. Faire relire le nettoyage Euclide/BibTeX, vérifier les redirections et les liens,
   puis préparer la migration. La saisie libre ne doit pas attendre la reconstitution
   des notices BibTeX incomplètes.
5. Ajouter la proposition facultative au catalogue sans interrompre la rédaction,
   puis vérifier le parcours complet sous différents rôles et sur mobile.

## Critères de validation avant livraison

- Un contributeur saisit une référence libre en une ligne et enregistre sans catalogue.
- Une recherche « euclide » ou « éléments » permet de choisir l'ouvrage général et
  de préciser le passage ; les anciennes fiches par proposition ne polluent plus les résultats.
- Deux sources libres, ou une libre et une fiche, peuvent être enregistrées ensemble.
- Une contribution nécessitant validation conserve bien toutes ses citations dans la proposition.
- Ajout, modification, suppression, annulation et sauvegarde sans changement préservent les données attendues.
- Rechargement, maintenance et erreur conservent le brouillon ; une réussite le nettoie.
- Deux éditeurs concurrents ne peuvent pas écraser silencieusement leurs citations.
- Historique et restauration incluent les références, avec compatibilité des anciennes révisions.
- Une fiche indisponible conserve son libellé et ne bloque pas une correction sans rapport.
- La citation visible est cohérente dans l'aperçu, la page et le Markdown exporté.
- Une citation masquée n'est pas exposée au lecteur non autorisé par un autre rendu ou endpoint.
- Recherche lente, vide, annulée ou en erreur : aucun texte ni choix courant n'est perdu.
- Clavier, lecteur d'écran, écran étroit et zoom : tous les champs ont un nom, les boutons
  restent accessibles et aucun titre indispensable n'est uniquement tronqué.
- Le nettoyage conserve les 13 liens problèmes et le lien concept d'Euclide, tous les
  passages/notes et les 7 liens utilisant les entrées BibTeX à reconstituer.
- TypeScript, tests métier, tests transactionnels et parcours navigateur ciblés, puis
  build et contrôle du diff avant tout déploiement explicitement demandé.

## Limites et prochaine étape

Les cinq choix d'interface nécessaires ont été tranchés avec le propriétaire. Il
n'est pas nécessaire de lui faire choisir une bibliothèque technique, un délai de
recherche ou un schéma Prisma pour poursuivre la conception.

La prochaine étape est l'implémentation suivant ce cahier des charges. Le nettoyage
des notices dont le contenu est incomplet demandera une source bibliographique fiable
ou la référence fournie par le contributeur ; cette information manque actuellement.
Cet audit n'autorise ni une fusion en production, ni une publication, ni un déploiement.
