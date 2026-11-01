# Journal du travail autonome (2026-11-02)

Consigne de Njee : « Poursuis le projet tennis de bout en bout selon
idees/circuit-tennis.md, en décidant seul et en notant chaque choix », puis
« on part bien sûr des joueurs fictifs (inspirés de joueurs réels si tu
veux) ». Toutes les décisions ci-dessous sont **les miennes (Claude)**, à
relire et à remettre en cause.

## Choix

| # | Choix | Pourquoi | Facile à changer ? |
|---|-------|----------|--------------------|
| 1 | Données : Match Charting Project au lieu de `tennis_atp` | `JeffSackmann/tennis_atp` renvoie 404 sur GitHub ce jour-là | oui (`tennis/donnees.py`) |
| 2 | Circuit masculin, 16 joueurs | données hommes plus fournies ; 16 = tableau simple, coût LLM tenable | oui (WTA : fichiers `-w-` du même projet) |
| 3 | 8 paires de jumeaux LLM / baseline | seule façon propre de mesurer l'apport du LLM à profil égal | non sans repenser l'expérience |
| 4 | Saison de 12 semaines, 9 tournois, 1 Grand Chelem | ~270 appels LLM ≈ 25 min par saison sur la machine | oui (`CALENDRIER`) |
| 5 | Moteur point par point avec modificateurs simples et bornés | lisible, testable ; les effets restent de l'ordre de ce qu'on observe entre joueurs réels | oui (`force_effective`) |
| 6 | `qwen3:8b`, `/api/chat`, `format: json`, `think: false` | modèle déjà installé ; JSON forcé + pas de raisonnement = rapide et fiable | oui (`--modele`) |
| 7 | Repli déterministe (= baseline) si le LLM échoue, marqué `repli` | une saison ne doit jamais planter ; le taux de repli est publié | — |
| 8 | Les joueurs connaissent les règles (fatigue, blessure, barème) | un pro connaît son corps et le calendrier ; sinon le LLM décide à l'aveugle | oui (`REGLES` dans `agents.py`) |
| 9 | Blessure = information privée ; le joueur choisit de la révéler en conférence | information asymétrique demandée dans l'idée de départ | — |
| 10 | Mode contrôle (deux jumeaux baseline) pour mesurer le bruit | sans ça, impossible de dire si un écart vient du LLM ou du hasard | — |
| 11 | Projet dans `Smallville/tennis-circuit` et non `Projets/tennis-circuit` | rester dans le dossier de travail de la session pour ne pas bloquer sur des demandes d'autorisation la nuit | oui (déplacer le dossier) |
| 12 | Git local, aucune publication, licence du code non choisie | publier et choisir une licence te reviennent | — |
| 13 | Données brutes hors git ; `gabarits.json` versionné sous CC BY-NC-SA | les gabarits sont anonymes et petits ; la licence l'exige pour un dérivé | oui |
| 14 | Tableau de bord en HTML autonome, sans bibliothèque externe | s'ouvre partout, même hors ligne, et se met dans un README | — |

## Constats en cours de route

- **Bruit du hasard** : sur 200 saisons de contrôle, l'écart moyen
  jumeau A − jumeau B par saison a un écart-type de 332 points (IC 95 % de
  la moyenne : −22 à +70, donc pas de biais). Une saison seule ne prouve
  rien ; il faut une dizaine de saisons LLM pour un IC de ±200 points.
- **Semaine 1 de la première vraie saison** : 24 appels, 0 échec, 5,8 s
  par appel. Les 8 entraîneurs ont **tous** choisi `service_agressif`,
  y compris pour des joueurs au profil « complet » : biais du modèle à
  surveiller (voir la suite plus bas).

## Relecture indépendante du code (agent python-reviewer) et corrections

Aucun bug critique ; moteur de match, inversion A/B et échappement HTML
jugés corrects. Corrigé :

- **Plantages possibles la nuit** : `OverflowError` sur un montant ou une
  importance `1e999` / `Infinity` renvoyés par le LLM → `entier_sur()` ;
  `StopIteration` si un tournoi n'a qu'un inscrit → tournoi annulé, consigné
  dans `annulations` ; `TypeError` si le contenu LLM est `null`.
- **Biais de mesure** : une blessure d'une semaine était effacée avant
  d'être vue (tirage 2-4 désormais) ; faux souvenir de désaccord quand
  l'appel entraîneur avait échoué ; IC à 95 % calculé avec 1,96 au lieu du
  quantile de Student ; contrat signé au montant demandé même quand le
  sponsor acceptait moins.
- **Couplage des jumeaux** : un générateur aléatoire par match au lieu d'un
  flux global (le bruit de contrôle reste ~330 points : il vient surtout
  des tableaux, qui changent avec les décisions).
- Tableau de bord : `<!--` échappé, serveur juste pendant les tie-breaks
  du rejeu, nombre de décisions en repli affiché, plus de constante codée
  en dur.
- Gardé tel quel (choix) : les négociations concernent aussi les joueurs
  baseline. Elles touchent les gains, pas les points, donc pas la mesure.

## Constats pendant la première saison LLM (prompts v1)

- **Le LLM lit mal une règle ambiguë** : pour « récupérer », les joueurs
  choisissent l'entraînement « physique » (18 fois sur 33 décisions à mi-
  saison) alors qu'il ajoute de la fatigue ; seul « repos » fait récupérer.
  La phrase v1 « physique réduit durablement la fatigue accumulée en match »
  était ambiguë. → **prompts v2** : effets chiffrés, « repos est le SEUL
  choix qui fait récupérer ». La v1 reste disponible (`--prompts 1`).
- **Biais de tactique** : `service_agressif` choisi 22 fois sur 25. En v2 :
  effets chiffrés de chaque tactique, ordre de présentation tiré au sort
  (biais de position), et nombre d'adversaires au retour / service faible.
- **Mémoire de la machine** : Ollama 0.40 charge qwen3:8b avec un contexte
  de 16 384 tokens (7,8 Go, 20 % sur CPU) ; mémoire vive libre tombée à
  0,5 Go. → `num_ctx` = 4096 par défaut dans le client (variable
  `OLLAMA_NUM_CTX`), à partir de la saison suivante. Chrome non lancé
  pendant les simulations, par prudence.
