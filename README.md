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
| Joueur sanctionné | réaction à un avertissement ou un point de pénalité de l'arbitre | pendant un match (couche sociale) |
| Joueurs aux vestiaires | échange après un match : respect, neutre ou tension | 2 matchs par tournoi (couche sociale) |
| Commission de la fédération | classement, rappel à l'ordre ou amende (20 000 € au plus) | toutes les 4 semaines, si incident (couche sociale) |

Chaque joueur LLM a un **flux de mémoire** (souvenirs datés et pondérés par
importance, récupération récence + importance, comme dans *Generative
Agents*, Park et al. 2023) et **réfléchit** après chaque tournoi : la leçon
qu'il en tire entre dans sa mémoire et oriente ses décisions suivantes.

### Couche sociale : moral, popularité, réputation

Chaque joueur a trois jauges de 0 à 100. Le **moral** monte avec les
victoires et baisse avec les défaites ou les sanctions ; la **popularité**
suit les titres et le comportement ; la **réputation** retient les
incidents. Avant un match, le moral, le bilan du face-à-face et le soutien
du public (plus fort pour le joueur populaire, avec un petit bonus pour
l'outsider) décalent la probabilité de gagner un point au service d'au
plus ±2 points de pourcentage : un effet réel mais borné, pour que le
talent reste décisif. Un arbitre (5 noms fictifs) peut donner un
avertissement puis un point de pénalité ; un joueur qui « craque » perd
un peu au service pendant le set suivant. Taux mesurés sur 20 saisons :
6,8 % des matchs avec avertissement, 0,15 % avec point de pénalité.

La couche est **active par défaut** avec `tennis.run` et coupée avec
`--sobre`. L'expérience scientifique (`outils/experience.py`) reste en
mode sobre : la comparaison LLM / règle fixe ne doit pas dépendre de ces
effets.

### Blessures, hygiène de vie et staff médical (couche sociale)

Chaque match comporte un risque de blessure (`tennis/blessures.py`) qui
dépend de la fatigue, de l'âge, de la surface, du format (3 ou 5 sets), de
l'endurance et des antécédents, mais aussi du **style** (un serveur use
épaule et dos, un relanceur ses jambes), de la **tactique** choisie
(« service agressif » +15 %) et de l'**hygiène de vie** : dilettante (moins
de fatigue, progrès réduits de moitié, risque +20 %), équilibrée, ou
acharnée (progrès +50 %, mais plus de fatigue et risque +35 % dès 5/10 de
fatigue). L'hygiène est tirée par paire de jumeaux, pour que la
comparaison LLM / règle fixe reste équitable.

Une blessure touche une zone (épaule, poignet, dos, abdominaux, cuisse,
genou, cheville) avec une gravité, de la gêne (1 semaine) à la blessure
sérieuse (5 à 7 semaines, joueur inapte). Elle survient à un point précis
du match ; le joueur peut abandonner (score « ab. ») ou déclarer forfait
au tour suivant. Jouer blessé l'aggrave ; une blessure aggravée peut
devenir **chronique** (rechutes, poussées quand la fatigue monte). Le moral
encaisse la blessure et remonte au retour. Avant chaque décision d'un
joueur blessé ou très fatigué, le **staff médical** (un agent LLM) donne
son avis : jouer, repos ou soins ; « soins » devient une option
d'entraînement (guérison plus rapide, à l'infirmerie). Calibration sur 20
saisons : 3,2 % de blessures et 1,1 % d'abandons par match.

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

# une saison avec le LLM et la couche sociale (≈ 290 appels, ≈ 25 min sur une RTX 4070 portable)
.venv\Scripts\python -m tennis.run --graine 1
# la même sans couche sociale (comme la saison v2)
.venv\Scripts\python -m tennis.run --graine 1 --sobre
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

### Suivre une saison en direct

Pendant qu'une saison tourne, dans un second terminal :

```bash
.venv\Scripts\python -m tennis.direct            # la saison la plus récente
.venv\Scripts\python -m tennis.direct --nom saison_v2_g1
```

puis ouvrir <http://127.0.0.1:8765>. La page se met à jour toutes les
3 secondes : semaine en cours et temps restant estimé, chaque décision du
LLM à l'instant où il répond (joueur, entraîneur, réflexion, presse,
négociation), classement provisoire, duels de jumeaux LLM / règle fixe,
décisions et raisonnements de la dernière semaine, articles. Le serveur ne
fait que **lire** `llm.jsonl` et `saison.json` : on peut l'arrêter et le
relancer sans gêner la simulation. Il n'écoute que sur `127.0.0.1`.

Le même serveur sert aussi le **village en 3D** sur <http://127.0.0.1:8765/3d>
(Three.js chargé depuis jsDelivr, il faut donc Internet et WebGL). C'est un
complexe de tournoi à l'échelle réelle (1 unité = 1 m, courts de
23,77 × 10,97 m) : court central dans une cuvette de 18 rangées, Courts 1
et 2, deux courts annexes, deux courts d'entraînement, centre des joueurs
(vestiaires, salle de sport, infirmerie), salle de presse, salon des
partenaires, espace détente, fédération et fan zone. Les surfaces changent
avec le tournoi (dur, terre, gazon), les tribunes se remplissent selon le
tour et prennent les couleurs du joueur soutenu, des arbitres sont sur
leur chaise et des ramasseurs autour des courts où l'on joue.

Un tournoi se suit **jour par jour** : premier tour lundi et mardi, quarts
mercredi et jeudi, journée médias vendredi, demies samedi, finale
dimanche (bouton « Lecture » ou barre Espace ; le curseur « Vitesse » règle
la durée d'une journée, de 2 min à 6 s). L'écran **Temps forts** raconte
la journée heure par heure : début des matchs, incidents d'arbitrage,
résultats, vestiaires, presse ; l'événement le plus marquant est mis à la
une, chaque ligne a un bouton « Voir » qui zoome sur le lieu, et la caméra
peut suivre seule les temps forts. « Tous les joueurs » ouvre une grille
triable de l'état de chaque agent ce jour-là (activité, lieu, jauges,
sanctions, santé, points), à l'heure de la lecture : avant la fin de son
match, un joueur garde son état du matin. « Tableau » montre le tableau du
tournoi, des huitièmes au vainqueur ; les résultats et les qualifiés
n'apparaissent qu'à l'heure où ils sont connus (un clic sur un match y
emmène la caméra). Les blessés boitent, un kiné court sur le court quand
un joueur se blesse, et des confettis tombent sur le central à la fin de
la finale. Survoler un personnage ou son nom affiche une
infobulle (rang, activité du jour, jauges) ; un clic ouvre sa fiche (courbe du moral et de la popularité, sanctions,
relations aux vestiaires, décisions de la fédération, santé et avis
médical). Le plan 2D reste disponible sur `/`.

**Interviews.** La fiche d'un joueur permet de lui poser une question :
le LLM local répond dans sa peau, avec ce qu'il sait au jour affiché
(résultats, moral, blessures, rien de ce qui suit). Il faut qu'Ollama
tourne ; une seule interview à la fois. Les échanges sont ajoutés à
`runs/<nom>/interviews.jsonl`, seule écriture du serveur. Pour essayer
l'interface sans Ollama : `python -m tennis.direct --faux-interviews`.

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
  social.py     moral, popularité, réputation, arbitres, sanctions
  blessures.py  blessures, chroniques, hygiène de vie, soins
  interview.py  interviews d'un joueur depuis la vue 3D
  direct.py     suivi en direct (serveur local + direct.html)
  village3d*.js village 3D : décor, public, jour par jour, écran de contrôle, tableau,
                interview, effets (kiné, confettis), personnages
outils/         expérience multi-graines, téléchargement des données
docs/           document de conception et journal des choix
tests/          pytest (faux LLM : aucun appel réseau)
```
