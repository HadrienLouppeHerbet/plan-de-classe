# Plan de classe

Application pour créer des plans de classe avec les photos des élèves.

## Hébergement et configuration (Supabase)

Depuis la mise en place des comptes individuels, l'application a besoin d'un projet
[Supabase](https://supabase.com) gratuit (base de données + authentification + stockage des photos) :

1. Créez un compte et un projet Supabase (région **Europe (Frankfurt)** recommandée pour le RGPD).
2. Dans **SQL Editor**, exécutez le contenu de `supabase/schema.sql` (crée la table `classes`, le bucket
   privé `photos` et les policies d'accès).
3. Dans **Project Settings → API**, récupérez l'URL du projet et la clé publique `anon`, et reportez-les
   dans `js/supabase-config.js`.
4. Dans **Authentication → Users**, créez un compte (e-mail + mot de passe) pour chaque membre du personnel
   qui doit avoir accès à l'application. Pas d'auto-inscription : seuls les comptes créés ici peuvent se
   connecter.
5. Déployez le dossier (fichiers statiques, aucun serveur à faire tourner) sur un hébergeur gratuit comme
   Netlify, Cloudflare Pages ou GitHub Pages.

Une fois configurée, ouvrez **`index.html`** (localement) ou l'URL d'hébergement dans Chrome, Edge ou
Firefox.

## Utilisation

1. **Accueil** : liste des classes. « + Nouvelle classe » pour en créer une.
2. **Créer une classe** :
   - le nom ;
   - la disposition de la salle : nombre de colonnes, puis pour chaque colonne le nombre de rangées
     et de places par rangée (aperçu en direct) ;
   - les élèves : **Importer un trombinoscope** (image) ou ajout manuel.
3. **Import du trombinoscope** : déposez l'image (ou collez une capture avec Ctrl + V), puis « Analyser ».
   Les photos sont découpées automatiquement et les noms lus par reconnaissance de texte.
   Vérifiez et corrigez les noms avant de les ajouter.
   - Si les photos sont mal détectées (par exemple quand elles se touchent), choisissez le mode **Grille régulière**
     et indiquez le nombre de colonnes × lignes du trombinoscope.
   - La reconnaissance de texte (Tesseract.js) est téléchargée à la première utilisation : **connexion internet nécessaire**
     pour cette étape uniquement.
4. **Plan** : choisissez un élève dans la liste d'une place vide, ou glissez-déposez (entre deux places pour les échanger,
   vers la colonne « Non placés » pour retirer). Placement aléatoire, impression en paysage.

## Sauvegarde

Les classes sont enregistrées dans la base **Supabase partagée** par tout le personnel connecté ; chaque
modification du plan est enregistrée automatiquement, visible par tous dès qu'ils rechargent la page.
Utilisez « Exporter » / « Tout exporter » pour obtenir un fichier `.json` autonome (photos incluses) à
conserver ou à réimporter (« Importer une sauvegarde »).

`sauvegarde_ancien_plan.json` (fichier local, volontairement non publié) contient les 24 élèves et photos de l'ancien fichier `plan_de_classe_avec_photos.html`,
à importer depuis l'accueil.

## Structure

```
index.html              page unique
css/style.css           mise en forme (dont l'impression)
js/supabase-config.js   URL et clé publique du projet Supabase
js/utils.js             outils (images, fenêtres, noms…)
js/auth.js              connexion (comptes Supabase)
js/db.js                stockage des classes (Supabase)
js/photos.js            envoi/lecture sécurisée des photos (Supabase Storage)
js/model.js             structure d'une classe, import/export
js/trombi.js            découpage du trombinoscope + lecture des noms
js/views/*.js           écrans : accueil, édition, import trombinoscope, plan
js/app.js               navigation
supabase/schema.sql     table, bucket privé et policies à exécuter une fois
```

## Sécurité des photos et RGPD

L'accès est protégé par un **compte individuel par membre du personnel** (Supabase Auth), plus robuste que
l'ancien mot de passe unique. Les photos ne sont jamais publiques : elles sont stockées dans un bucket
Supabase Storage **privé**, et ne sont accessibles qu'à une personne connectée, via des URLs signées
valables quelques minutes (impossibles à deviner, à lister, ou à partager durablement). Un clic droit est
désactivé sur les photos pour freiner la copie occasionnelle — cela reste un frein, pas une garantie
absolue : comme pour toute application web, une personne authentifiée qui voit une photo à l'écran peut
toujours en faire une capture d'écran.

Ce que couvre techniquement cette mise en place (mesures de sécurité, art. 32 du RGPD) :
- authentification individuelle et accès chiffré (HTTPS) ;
- photos non publiques, contrôle d'accès côté serveur (policies RLS Supabase) ;
- suppression des photos du stockage quand un élève ou une classe est supprimé.

Ce qui reste de la responsabilité de l'établissement (hors code) :
- disposer d'une base légale / autorisation des familles pour l'usage des photos (généralement déjà
  recueillie pour le trombinoscope) ;
- définir une durée de conservation des photos (ex. suppression en fin d'année scolaire) ;
- désigner une personne à contacter pour les demandes d'accès ou de suppression de données.
