# Circuit de tennis multi-agents LLM

Une saison de tennis **fictive**, simulée semaine par semaine, où joueurs,
entraîneurs, agents sportifs, sponsors et journalistes sont des **agents LLM**
locaux (Ollama, `qwen3:8b`). Les matchs, eux, ne sont pas joués par le LLM :
un **moteur statistique point par point**, calibré sur de vraies données
de tennis, décide de chaque point. Les décisions des agents changent les
probabilités, donc **leurs choix ont des conséquences mesurables**.

> Question de l'expérience : un joueur piloté par un LLM (avec mémoire,
> réflexion et entraîneur) gère-t-il mieux sa saison qu'un jumeau
> statistique qui suit une politique fixe ?

## Ce que fait chaque agent

| Agent | Décide | Quand |
|-------|--------|-------|
| Joueur (8 sur 16) | jouer le tournoi ou non, axe d'entraînement (service, retour, physique, repos) | chaque semaine |
| Entraîneur | tactique (`service_agressif`, `pression_retour`, `equilibre`) et conseil ; peut être en désaccord | semaines de tournoi |
| Journaliste (« Le Filet ») | titre, article, question piquante au vainqueur | après chaque tournoi |
| Joueur en conférence de presse | réponse ; cache ou révèle une blessure (information privée) | après chaque titre |
| Agent sportif contre sponsor | négociation de contrat en 3 allers-retours au plus | mi-saison et fin de saison |

Chaque joueur LLM a un **flux de mémoire** (souvenirs datés et pondérés par
importance, récupération récence + importance, comme dans *Generative
Agents*, Park et al. 2023) et **réfléchit** après chaque tournoi : la leçon
qu'il en tire entre dans sa mémoire et oriente ses décisions suivantes.

## Le dispositif expérimental

- 16 joueurs fictifs formant **8 paires de jumeaux** : même profil
  statistique, même classement de départ. Dans chaque paire, l'un est
  piloté par le LLM, l'autre par une **politique fixe** (baseline : joue
  tout tournoi sauf blessé ou fatigue > 7/10, entraînement en rotation,
  tactique neutre).
- Mesure : écart de points gagnés entre le jumeau LLM et le jumeau baseline.
- **Mode contrôle** (`--controle`) : les deux jumeaux suivent la baseline.
  On mesure ainsi le bruit du hasard seul. Sur 200 saisons de contrôle,
  l'écart moyen par saison est de −20 points (IC à 95 % de −66 à +26 :
  aucun biais), avec un **écart-type de 328 points par saison**. Conclure
  sur le LLM demande donc plusieurs saisons (graines) : avec 10 saisons,
  l'IC à 95 % fait environ ±235 points.
- Chaque match a son propre générateur aléatoire, dérivé de (graine,
  semaine, tour, joueurs) : les décisions des autres joueurs ne décalent
  pas les tirages.

## Modèle du monde

- Point gagné au service : `p = service(surface) − (retour_adverse(surface) − retour_moyen)`, borné à [0,35 ; 0,90].
- Modificateurs : fatigue (−0,4 point de pourcentage par point de fatigue),
  blessure (−3), confiance (±0,5 par cran), entraînement (jusqu'à +2),
  tactique (±1,2, bonus si elle vise la faiblesse de l'adversaire ou si la
  surface s'y prête).
- Fatigue : chaque match l'augmente (plus en 5 sets ou en jeu agressif) ;
  au-dessus de 6/10, risque de blessure croissant.
- Calendrier : 12 semaines, 9 tournois fictifs (dur, terre, gazon), dont un
  Grand Chelem en 5 sets ; barème de points façon ATP sur des tableaux de 16.

## Données

Calibration sur le **Match Charting Project** de Tennis Abstract (Jeff
Sackmann), licence CC BY-NC-SA 4.0 : 133 profils de joueurs ayant au moins
25 matchs relevés, taux de points gagnés au service et en retour, global et
par surface (avec retrait vers la moyenne pour les surfaces peu jouées).
Les profils sont **anonymisés** : les joueurs simulés sont inventés, aucun
vrai joueur ne parle. Voir `data/LICENCE-DONNEES.md`.

## Lancer

```bash
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install requests pytest
ollama pull qwen3:8b

# une saison avec le LLM (≈ 270 appels, ≈ 25 min sur une RTX 4070 portable)
.venv\Scripts\python -m tennis.run --graine 1
# sans Ollama, avec un faux LLM déterministe (quelques secondes)
.venv\Scripts\python -m tennis.run --faux
# expérience sur plusieurs graines
.venv\Scripts\python outils\experience.py --graines 1-10
.venv\Scripts\python outils\experience.py --graines 1-200 --controle
# tests
.venv\Scripts\python -m pytest -q
```

Chaque saison écrit `runs/<nom>/saison.json`, le journal de tous les appels
LLM (`llm.jsonl` : prompt, réponse, durée, échec) et un
**tableau de bord autonome** `tableau_de_bord.html` (aucune ressource
externe), avec l'évolution du classement, l'expérience par paire, le
classement final, le rejeu point par point des finales, les décisions et
le raisonnement de chaque joueur, les articles et les négociations.

## Robustesse face au LLM

Leçons tirées d'un portage de *Generative Agents* sur petits modèles
locaux : sortie JSON forcée et raisonnement désactivé, validation des clés,
rapprochement des valeurs hors liste, une relance, puis **repli
déterministe** marqué dans les données (jamais de plantage de saison).

## Structure

```
tennis/
  donnees.py    calibration sur le Match Charting Project
  match.py      moteur de match point par point (sans LLM)
  joueurs.py    joueurs fictifs, état de forme, effets des décisions
  memoire.py    flux de mémoire et récupération
  agents.py     prompts et validation des 5 types d'agents
  tournoi.py    calendrier, tableaux, barème
  saison.py     boucle semaine par semaine, expérience
  llm.py        client Ollama et faux LLM de test
  run.py        point d'entrée
  dashboard.py  tableau de bord HTML
outils/         expérience multi-graines, téléchargement des données
docs/           document de conception et journal des choix
tests/          pytest (faux LLM : aucun appel réseau)
```
