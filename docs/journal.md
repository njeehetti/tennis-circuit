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

## Première saison LLM (v1) : arrêtée en semaine 9 sur 12

Claude Code a **arrêté la simulation faute de mémoire vive** (0,3 Go libre :
Ollama occupait ~8,7 Go avec son contexte de 16 384 tokens). Comme le
résultat n'était écrit qu'en fin de saison, il n'y a ni `saison.json` ni
tableau de bord pour cette saison ; seul `runs/saison_llm_g1/llm.jsonl`
(182 appels) reste. → La saison est désormais **sauvegardée à chaque
semaine** (`saison.json` avec `"partiel": true`).

Ce que disent les 182 appels (semaines 1 à 8, prompts v1) :

- **Fiabilité** : 0 échec sur 182 appels (JSON forcé), 6,0 s par appel.
- **Calendrier** : sur 59 décisions en semaine de tournoi, 10 forfaits
  volontaires : les joueurs LLM sautent bien des tournois pour souffler.
- **Entraînement** : « physique » 40 fois sur 65 (ambiguïté v1, voir plus
  haut), « service » 14, « retour » 11, « repos » jamais.
- **Entraîneurs** : `service_agressif` 33, `pression_retour` 16,
  `equilibre` 0 ; ils recommandent de jouer 49 fois sur 49, donc **aucun
  désaccord ne naît** entre entraîneur et joueur. Piste : donner à
  l'entraîneur la fatigue chiffrée et le risque de blessure comme au joueur
  (fait en v2 pour les règles du joueur, pas encore pour l'entraîneur).
- **Réflexions** : peu variées (« je dois mieux gérer ma fatigue / mon
  énergie en fin de set » revient sans cesse). Piste : montrer au joueur
  ses leçons précédentes et exiger une leçon nouvelle et actionnable.
- **Journaliste** : titres stéréotypés (« X domine…, mais les surprises… »).
  Piste : varier le gabarit demandé (portrait, rivalité, coup de gueule).
- **Récit émergent** : Malo Okonkwo gagne deux 250 et atteint la finale
  du Grand Chelem, perdue en 5 sets contre Davor Belcastro (1-6 6-3 6-4
  6-7 6-3), qu'il avait battu en finale à Port-Albe.

## État au réveil et suite proposée

1. **Relancer la saison**, de préférence **dans ton propre terminal**
   (pas en tâche de fond de Claude Code, qui l'arrête quand la mémoire
   manque), autres applications fermées :
   `.venv\Scripts\python -m tennis.run --graine 1 --nom saison_v2_g1`
   (prompts v2, contexte 4096, sauvegarde par semaine ; ~20-25 min).
2. Ouvrir `runs/saison_v2_g1/tableau_de_bord.html` : il n'a encore été
   vérifié que par un script (aucune erreur JS, rejeu cohérent), pas à l'œil.
3. Pour la question de fond (le LLM fait-il mieux que la baseline ?) :
   `python outils/experience.py --graines 1-10` (≈ 4 h, une nuit) et
   comparer au bruit du contrôle (écart-type 328 points par saison).
4. Comparer v1 et v2 (`--prompts 1` / `--prompts 2`, même graine) : c'est
   un bon morceau de README (« itérer sur un prompt et mesurer l'effet »).
5. Décisions qui te reviennent : nom du dépôt, licence du code, publication
   GitHub, circuit WTA ou mixte.

## Suivi en direct (demandé par Njee le 2026-11-02)

Consigne : « construis oui stp, le but est quand même de visualiser ce
qu'on fait ». `python -m tennis.direct` sert une page locale qui lit les
fichiers déjà écrits par la simulation (aucun changement de la boucle de
saison, donc utilisable sur la saison qui tournait à ce moment-là).

- [choix Claude] Serveur `http.server` de la bibliothèque standard,
  `127.0.0.1` seulement, page qui interroge `/etat` toutes les 3 s : rien à
  installer, et un arrêt du serveur n'a aucun effet sur la saison.
- [choix Claude] Le flux « le LLM pense » montre le rôle et la réponse,
  pas encore **quel joueur** : `llm.jsonl` ne garde que la fin du prompt.
  Piste : ajouter le joueur concerné dans le journal LLM pour les saisons
  suivantes.
- Temps restant estimé avec ≈ 23 appels par semaine (mesuré en v1).
