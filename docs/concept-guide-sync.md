# Synchronisation du guide de contribution

Le guide public « Comment écrire un concept ? » se trouve dans
[`fr.md`](../content/guides/concepts/fr.md) et
[`en.md`](../content/guides/concepts/en.md). Ces fichiers contiennent le titre,
la description et le Markdown du guide. Ils servent aussi de contenu de secours
à l'application lorsque la base ne contient pas de guide pour la langue demandée.
Les administrateurs peuvent toujours modifier le guide sur le site.

Cette synchronisation concerne uniquement ce guide, dans ses deux langues.
Les pages de concepts, problèmes et autres contenus ne sont pas exportées.
Elle intervient lors de la préparation puis du déploiement : une modification
sur le site n'apparaît donc pas immédiatement sur GitHub.

## Proposer une correction

Modifier le fichier Markdown de la langue concernée dans une pull request.
Conserver les champs `title` et `description` en tête du fichier.
Le format généré utilise des chaînes entre guillemets doubles : échapper un
guillemet intérieur avec `\"` et un retour à la ligne dans la description avec
`\n`. Le corps reste du Markdown/LaTeX ordinaire.

Ne pas modifier `site-snapshot.json` à la main. C'est la référence générée par
l'outil pour détecter les modifications concurrentes, pas un deuxième fichier
éditorial. Un contributeur n'a pas besoin d'accéder au VPS pour proposer une PR.

## Préparer un déploiement

Depuis le dépôt, avec Node.js 22 récent, Git et l'accès SSH habituel au VPS :

```powershell
npm.cmd run deploy:prepare
git diff --check
git diff -- content/guides/concepts
```

`deploy:prepare` exécute successivement :

1. `guides:pull` : lecture du guide public en base et des fichiers de l'image
   actuellement déployée via SSH, puis fusion locale des modifications.
2. TypeScript, les tests métier (dont les tests de synchronisation) et le build.

L'export ne lit que la langue, le titre, la description et le corps du guide.
Il ne récupère ni utilisateurs, ni secrets, ni autres données de la base.
Il ne modifie pas le serveur et ne nécessite pas Git sur le VPS.

Relire les changements, y compris le snapshot, puis faire valider le message
exact du commit avant de commiter. Le déploiement et la publication publique
suivent ensuite la procédure habituelle ; ces commandes ne créent aucun commit,
push ou déploiement automatiquement.

## Fusion et conflits

Le snapshot conserve la dernière version du site récupérée et la version de
l'image déployée. Les récupérations successives fusionnent depuis le dernier
état incorporé. Lorsqu'une nouvelle image est déployée, son fichier immuable
devient la référence commune. La première installation peut utiliser le
snapshot initial même si l'ancienne image ne contient aucun fichier Markdown.

Les corrections sur des lignes indépendantes sont fusionnées avec
`git merge-file`. En cas de chevauchement, aucun des trois fichiers suivis
(FR, EN, snapshot) n'est modifié. L'outil conserve les versions du dépôt, du
site, de référence et la fusion avec marqueurs dans
`runtime/guide-sync-conflicts/`, ignoré par Git.

Pour un conflit français :

1. Comparer `fr.repository.md`, `fr.base.md`, `fr.site.md` et `fr.merge.md`
   dans ce dossier.
2. Écrire la version retenue dans `content/guides/concepts/fr.md`, sans marqueurs
   de conflit.
3. Lancer `npm.cmd run guides:pull -- --resolve=fr`.
4. Relire le diff et relancer `npm.cmd run deploy:prepare`.

Utiliser `--resolve=en` pour l'anglais, ou les deux options si nécessaire.
La résolution est refusée si le site a encore changé depuis la création des
fichiers de conflit. Relancer alors sans `--resolve` et examiner le nouveau conflit.

## Application sur le serveur

`deploy/deploy.sh` vérifie les guides après les migrations, puis lance leur
import juste avant le redémarrage de l'application. Les fichiers sont inclus
dans les images de migration et d'application.

L'import accepte uniquement une base identique au snapshot relu, ou déjà
identique au résultat voulu. Toute autre modification bloque le déploiement.
Les deux langues sont importées dans une transaction sérialisable, avec
vérification de la version de chaque ligne au moment de l'écriture. Une course
annule toute la transaction. Il faut alors refaire la préparation et faire
valider un nouveau commit. Aucun écrasement forcé n'est proposé.

Un retour à un ancien commit peut donc être bloqué si son guide est obsolète :
préparer un commit de retour arrière qui conserve le guide actuel.
Une sauvegarde de la base précède toujours la procédure normale de déploiement.

## Vérifications isolées

- `npm.cmd run guides:pull -- --check` : lecture du VPS et comparaison sans
  écrire de fichier. Code de sortie 1 si une mise à jour ou résolution est nécessaire.
- `npm.cmd run guides:pull -- --input=export.json` : même fusion depuis une
  capture JSON produite par `scripts/read-concept-guides.mjs`, sans réseau.
- `npm.cmd run guides:check` : validation seule contre la base désignée par
  `DATABASE_URL`. L'import Prisma attend cette variable dans l'environnement.
- `npm.cmd run guides:apply` : import effectif dans cette base ; normalement
  réservé au script de déploiement.
- `npm.cmd run test:guides` : tests locaux sans accès à la production.

Les tests d'import utilisent une base simulée avec annulation transactionnelle ;
ils ne constituent pas un test d'intégration PostgreSQL.
