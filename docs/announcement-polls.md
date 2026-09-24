# Sondages dans les annonces

Un administrateur peut joindre un sondage à une nouvelle annonce : une question
(240 caractères) et 2 à 8 réponses distinctes (160 caractères chacune). Le titre
et le message de l'annonce restent obligatoires. La création de l'annonce et de
ses réponses est atomique. Les annonces existantes restent sans sondage.

Les membres vérifiés disposent d'un choix par compte et par sondage. Un nouveau
vote remplace le précédent. Les résultats ne sont affichés qu'après le vote ou
la clôture, sans liste des votants. Il ne s'agit pas d'un vote anonyme en base :
l'identifiant du membre sert à empêcher les votes multiples et à modifier son choix.

Les administrateurs peuvent clore ou rouvrir un sondage. Le vote, la clôture et
la suppression partagent un verrou transactionnel. Une contrainte SQL impose
l'unicité par membre et une clé étrangère composite garantit que la réponse
appartient au bon sondage. Supprimer l'annonce supprime ses options et votes ;
supprimer un compte retire ses votes. Les résultats sont recalculés à partir des
votes actuels.

## Installation et vérifications

La migration additive `20260924100000_announcement_polls` doit être appliquée
avant de démarrer cette version de l'application (`prisma migrate deploy`,
déjà inclus dans la procédure habituelle de déploiement). Régénérer le client
Prisma pour le développement local.

- `npm run test:polls` : validation, droits, changement de choix, clôture,
  filtrage des résultats et contraintes de la migration PostgreSQL.
- Pour exécuter le test SQL isolé, définir `MW_PGLITE_MODULE` vers une installation
  de `@electric-sql/pglite` ; le test SQL est explicitement ignoré sinon.
- `npm run test:polls:browser` : formulaires et rendu mobile/bureau en français
  et anglais dans Chromium/WebKit. Le test utilise les styles compilés dans
  `.next/static/css` ainsi que la feuille des annonces.

Les tests utilisent des données isolées et ne publient pas d'annonce sur le site.
