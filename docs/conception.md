# Circuit de tennis multi-agents LLM — document de conception

> Rédigé le 2026-11-02 par Claude, en autonomie (l'utilisateur a délégué
> toutes les décisions : « en décidant seul et en notant chaque choix »).
> Chaque décision prise sans validation est marquée **[choix Claude]**.
> Source de l'idée : `../../idees/circuit-tennis.md`.

## 1. Intention

Montrer, en un dépôt lisible en 30 secondes par un recruteur, la maîtrise
des **systèmes multi-agents LLM** : des agents qui décident sur le long
terme, avec mémoire et réflexion, dans un monde où leurs décisions ont des
**conséquences mesurables** (un moteur de match statistique), et une
**évaluation chiffrée** contre une baseline.

## 2. Objectifs / non-objectifs / anti-objectifs

- Objectifs : saison simulée semaine par semaine ; joueurs, entraîneurs,
  agents sportifs, sponsors, journalistes pilotés par LLM local ; moteur de
  match point par point calibré sur des données réelles ; expérience
  « LLM contre politique fixe » ; tableau de bord ; tests.
- Non-objectifs : jouer les points avec le LLM ; prédire de vrais matchs ;
  graphismes pixel art.
- Anti-objectifs : faire parler de **vrais joueurs** (tous fictifs,
  consigne de Njee : « on part bien sûr des joueurs fictifs, inspirés de
  joueurs réels si tu veux ») ; un projet qui ne tourne pas sur la machine
  (8 Go VRAM, 15 Go RAM) ; des résultats non reproductibles.

## 3. Données

- Le dépôt `JeffSackmann/tennis_atp` prévu dans l'idée **n'est plus
  accessible sur GitHub** (404 le 2026-11-02). **[choix Claude]** : on
  utilise le **Match Charting Project** du même auteur
  (`JeffSackmann/tennis_MatchChartingProject`, licence **CC BY-NC-SA 4.0**,
  attribution requise, usage non commercial) : `charting-m-stats-Overview.csv`
  (points au service / en retour par joueur et par match) et
  `charting-m-matches.csv` (surface, date).
- Calibration : pour chaque joueur réel avec assez de matchs, taux de points
  gagnés au service et en retour, global et par surface. Ces profils servent
  de **gabarits anonymes** : chaque joueur fictif tire un gabarit, avec un
  bruit léger. Aucun nom réel n'est conservé dans les sorties.

## 4. Le monde

- **[choix Claude]** Circuit masculin fictif, **16 joueurs**, organisés en
  **8 paires de jumeaux** : deux joueurs issus du même gabarit statistique,
  l'un piloté par LLM, l'autre par une politique fixe. C'est l'expérience
  contrôlée (§ 7).
- **[choix Claude]** Saison par défaut : **12 semaines**, 9 tournois
  fictifs (dur, terre, gazon ; un « Majeur » en 5 sets), 3 semaines sans
  tournoi. Configurable (`--weeks`).
- Tableau à 16 places ; un joueur qui saute un tournoi laisse un *bye* à
  son adversaire. Points de classement par tour atteint (barème façon ATP,
  réduit).

## 5. Moteur de match (sans LLM)

- Probabilité qu'un serveur A gagne un point contre B :
  `p = sA(surface) − (rB(surface) − r_moyen) + modificateurs`, bornée à
  [0,35 ; 0,90].
- Modificateurs issus des **décisions des agents** :
  - **fatigue** (matchs joués, semaines sans repos) : jusqu'à −0,04 ;
  - **confiance** (résultats récents) : ±0,015 ;
  - **tactique** de l'entraîneur : `service_agressif` (+service, −retour),
    `pression_retour` (inverse), `equilibre` ; bonus si la tactique vise la
    faiblesse de l'adversaire ; l'agressivité fatigue davantage ;
  - **entraînement** (choix hebdomadaire) : améliore lentement service,
    retour ou condition physique.
- Jeux, tie-break à 6-6, 3 sets (5 en Majeur). Chaque point est tiré avec
  un générateur aléatoire **à graine** : même graine → même saison
  (aux réponses du LLM près).
- **Blessure** : risque croissant avec la fatigue ; information **privée**
  du joueur (il choisit d'en parler ou non aux journalistes).

## 6. Les agents

Architecture commune **[choix Claude]**, inspirée de Smallville mais
allégée : flux de mémoire (souvenirs datés avec importance 1-10),
récupération des souvenirs récents + importants, **réflexion** après chaque
tournoi (le joueur tire une leçon écrite qui entre dans sa mémoire).

| Agent | Appels LLM | Décision (JSON) |
|-------|-----------|-----------------|
| Joueur | 1/semaine + réflexion + conférence de presse | jouer ou non, axe d'entraînement, raisonnement |
| Entraîneur | 1/semaine de tournoi | tactique, conseil au joueur (peut être en désaccord) |
| Agent sportif | négociations (mi-saison, fin) | montant demandé, arguments |
| Sponsor | négociations | accepter / contre-proposer / refuser |
| Journaliste | 1/tournoi | titre, article, question au vainqueur |

- LLM **[choix Claude]** : Ollama `qwen3:8b`, API `/api/chat`, sortie JSON
  forcée (`format: json`), raisonnement désactivé (`think: false`) pour la
  vitesse. Leçons du portage Smallville : validation stricte du JSON,
  valeurs hors liste rapprochées, **repli déterministe** journalisé en cas
  d'échec (jamais de plantage de la saison).
- Les joueurs à politique fixe n'appellent pas le LLM (baseline), mais
  apparaissent dans les articles.

## 7. Expérience « LLM contre baseline »

- Baseline : joue tout tournoi sauf si fatigue > seuil ; entraînement
  équilibré ; tactique `equilibre`.
- Mesure : écart de points de classement entre chaque jumeau LLM et son
  jumeau baseline, moyenne sur les 8 paires, sur plusieurs graines, avec
  intervalle de confiance.
- Le résultat, quel qu'il soit, est un résultat : si le LLM fait moins bien
  que la baseline, on le montre et on l'analyse.

## 8. Livrables

- `tennis/` : paquet Python (moteur, données, agents, saison).
- `python -m tennis.run --weeks 12 --seed 1` → `runs/<nom>/saison.json`.
- `python -m tennis.dashboard runs/<nom>` → `tableau_de_bord.html`
  autonome (aucune dépendance réseau) : classement qui évolue, fil
  d'actualité, décisions des agents et leur raisonnement, négociations,
  rejeu point par point d'une finale.
- `tests/` (pytest), avec un faux LLM pour tester la saison sans Ollama.
- README en français, attribution des données.

## 9. Choix techniques [choix Claude]

- Python 3.12, bibliothèque standard + `requests` + `pytest`. Pas de
  pandas : les CSV sont petits.
- Projet dans `C:\Users\njee2\Projets\Smallville\tennis-circuit` (et non
  `Projets\tennis-circuit` comme annoncé) : dossier de travail de la
  session, pour éviter des demandes d'autorisation bloquantes pendant le
  travail autonome. Déplaçable tel quel.
- Git local uniquement ; aucune publication sans l'utilisateur.

## 10. Ce qui reste ouvert pour Njee

- Circuit féminin ou mixte (les données WTA du même projet existent).
- Nom du projet et du dépôt GitHub.
- Durée de saison pour la démo publique.
