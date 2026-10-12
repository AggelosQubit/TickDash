# TickDash

Compagnon local pour League of Legends, sur Windows. Il lit le client déjà ouvert sur ta machine (aucun compte Riot, aucune clé API) et affiche une fenêtre au champ select : rangs, build, niveaux, et un conseil de fight.

## Ce qu’il faut

- Windows 10 ou 11
- [Node.js LTS](https://nodejs.org/) installé, avec **Add to PATH** coché
- League of Legends installé
- Le runtime WebView2, déjà présent si Microsoft Edge est installé. Sinon, installe le [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (Evergreen)

Vérifie Node dans un terminal :

```bat
node -v
```

Tu dois voir un numéro de version, par exemple `v22.x`.

## Installation

Dans le dossier TickDash :

```bat
node scripts/build-webview.js
```

Ça télécharge le SDK WebView2 et crée `bin\TickDashWebView.exe`. Une seule fois, avec Internet.

Ensuite double-clique **`start-daemon.bat`**.

Aucune console ne s’ouvre. Dans le Gestionnaire des tâches, le processus s’appelle **TickDash**. Le daemon tourne en fond et attend League.

## Utilisation

1. Lance League, puis TickDash (l’ordre n’a pas d’importance).
2. Entre en champ select (normal, classé, ou outil d’entraînement).
3. La fenêtre **TickDash** s’ouvre toute seule. Si elle est déjà ouverte, elle repasse au premier plan. Il n’y a pas de deuxième fenêtre.

Sans champ select, ouvre-la à la main :

```bat
bin\TickDashWebView.exe http://127.0.0.1:3789/
```

La même page marche dans un navigateur : [http://127.0.0.1:3789/](http://127.0.0.1:3789/). Le daemon doit déjà tourner.

### Ce que tu vois

**Rangs.** Dès le champ select, les alliés. Au chargement de la partie, les adversaires. Tableau Rôle / Joueur / Rang / LP, dans l’ordre Top, Jgl, Mid, Adc, Sup. **Recharger les rangs** relance les deux côtés. Les rangs viennent du client League (soloQ).

**Build final.** Sous Rôle & Main Targets, les six objets les plus joués en soloQ pour ton champion et ton rôle, sur le patch en cours. Les icônes s’affichent une fois le champion choisi. Ce chargement passe par Internet, une fois par champion et par rôle.

**Niveaux.** Au-dessus de Strongest Ally, la somme des niveaux de ton équipe. Au-dessus de Strongest Opponent, celle des adversaires. Les cinq joueurs comptent, toi compris.

**Barre du bas.** Elle défile selon le delta de puissance d’équipe (le même chiffre que **Δ Puiss.** dans le header) :

| Delta | Texte |
| --- | --- |
| −35 ou moins | `NE PEUT PAS FIGHT CURRENT PUISS DELTA : -42` |
| entre −35 et +35 | `FIGHT POSSIBLE` |
| +35 ou plus | `FIGHT ADVISED` |

Sans partie en cours, la barre affiche `EN ATTENTE`.

**Header.** KDA, or, ta puissance, la puissance des deux équipes, le temps de partie.

**Fin de partie.** Un écran Victoire / Défaite propose **Continuer**, qui ouvre le post-mortem de la game.

## Au quotidien

| Action | Fichier |
| --- | --- |
| Démarrer | `start-daemon.bat` |
| Redémarrer | `restart-daemon.bat` |
| Lancer avec Windows | `install-startup.bat` |
| Retirer du démarrage Windows | `remove-startup.bat` |
| Lire ce qui se passe | `logs\daemon.log` |

`restart-daemon.bat` coupe l’ancien processus puis en relance un. Utilise-le si la fenêtre dit que le daemon est offline.

## Overwolf (optionnel)

Rangs, build, niveaux, puissance et la barre de fight passent par le client League. Ils n’ont pas besoin d’Overwolf.

Les events de combat et une partie des camps jungle viennent du log GEP Overwolf. Pour les avoir, charge le dossier `ow-gep` comme app unpacked. Le détail est dans [ow-gep/README.md](ow-gep/README.md). Dans le header, la pastille **OW ✓** confirme que ce flux est là. **LC ✓** confirme le Live Client de la partie.

## Si ça bloque

**`node` n’est pas reconnu.** Réinstalle Node.js en cochant Add to PATH, ferme le terminal, réessaie `node -v`.

**La fenêtre ne s’ouvre pas au champ select.** Relance `node scripts/build-webview.js`, puis `restart-daemon.bat`. Dans `logs\daemon.log`, la ligne `WebView2 absent` veut dire que `bin\TickDashWebView.exe` n’existe pas.

**La page dit daemon offline.** Relance `start-daemon.bat`. League doit être ouvert pour les rangs et le build. La puissance, les niveaux et le fight n’apparaissent qu’une fois la partie chargée.

**Rien dans le Gestionnaire des tâches.** Ouvre `logs\daemon.log`. Si le fichier est vide, Node n’est pas dans le PATH et le `.bat` n’a pas pu démarrer.

**Le port 3789 est déjà pris.** `restart-daemon.bat` tue l’ancien TickDash et libère le port.
