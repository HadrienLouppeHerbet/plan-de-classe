# Plan de classe

Application pour créer des plans de classe avec les photos des élèves.
Aucune installation : ouvrez **`index.html`** dans Chrome, Edge ou Firefox (double-clic).

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

Les classes sont enregistrées **dans le navigateur** de cet ordinateur (IndexedDB), et chaque modification du plan
est enregistrée automatiquement.
Utilisez « Exporter » / « Tout exporter » pour obtenir un fichier `.json` à conserver ou à ouvrir sur un autre poste
(« Importer une sauvegarde »).

`sauvegarde_ancien_plan.json` (fichier local, volontairement non publié) contient les 24 élèves et photos de l'ancien fichier `plan_de_classe_avec_photos.html`,
à importer depuis l'accueil.

## Structure

```
index.html              page unique
css/style.css           mise en forme (dont l'impression)
js/utils.js             outils (images, fenêtres, noms…)
js/db.js                stockage IndexedDB
js/model.js             structure d'une classe, import/export
js/trombi.js            découpage du trombinoscope + lecture des noms
js/views/*.js           écrans : accueil, édition, import trombinoscope, plan
js/app.js               navigation
```

## Mot de passe

L'accès est protégé par un mot de passe (demandé une fois par onglet ; bouton « Se déconnecter » en haut à droite).
Le mot de passe n'est pas écrit dans le code, seule son empreinte PBKDF2 l'est (`js/auth.js`, qui explique comment le changer).
Sans serveur, ce contrôle est un **verrou d'interface** : il peut être contourné par une personne qui modifie le code de la page.
