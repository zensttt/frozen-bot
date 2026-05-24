# Frozen Bot Discord

Bot Discord multifonction pour Frozen ᴾⱽᴾ.

## Fonctions incluses

- Tickets avec panel
- Catégories : Recrutement, Problème, Pack Graphique, Pack Son
- Menu Pack Graphique : FPS, CVC, Opti, Troll, Reshade
- Logs tickets
- Anti-spam
- Anti-invitations Discord
- Anti-mentions massives
- Commandes slash : /setup, /close, /clear

## Installation locale

1. Installe Node.js
2. Crée un fichier `.env`
3. Mets les valeurs :

```env
DISCORD_TOKEN=ton_token
CLIENT_ID=id_application
GUILD_ID=id_serveur
```

4. Installe les dépendances :

```bash
npm install
```

5. Déploie les commandes :

```bash
npm run deploy
```

6. Lance le bot :

```bash
npm start
```

## Ajouter des packs

Modifie `config.js`.

Exemple :

```js
fps: [
  { name: "Mon pack FPS", url: "https://lien.com" }
]
```

## Railway

Variables à ajouter dans Railway :

- DISCORD_TOKEN
- CLIENT_ID
- GUILD_ID

Commande de start :

```bash
npm start
```
