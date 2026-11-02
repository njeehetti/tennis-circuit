# Architecture du code

Ce document explique comment le code est organisé et comment les données
circulent. Le *pourquoi* du projet est dans [`conception.md`](conception.md),
les choix datés dans [`journal.md`](journal.md), et le mode d'emploi dans le
[README](../README.md).

## 1. Flux d'ensemble

```
tennis/run.py ──► Saison.jouer()  (tennis/saison.py, semaine par semaine)
                     │
                     ├─► agents.py ──► llm.py ──► Ollama (qwen3:8b)   les agents DÉCIDENT
                     ├─► match.py                                      le moteur JOUE les points
                     ├─► joueurs.py · social.py · blessures.py         conséquences sur les joueurs
                     └─► runs/<nom>/saison.json  (réécrit à chaque fin de semaine)
                         runs/<nom>/llm.jsonl    (un appel LLM par ligne)
                                  │
   tennis/direct.py (serveur local) ◄──┘ ──► village3d*.js (navigateur, Three.js)
   outils/exporter_site.py ──► site/ (même village, sans serveur) ──► GitHub Pages
```

Principe central : **le LLM ne joue jamais un point.** Il prend des décisions
de carrière (jouer ou non, entraînement, tactique) ; un moteur statistique
les traduit en probabilités puis en résultats. Les choix du LLM ont donc des
conséquences mesurables, comparables à celles d'une règle fixe.

## 2. Données réelles — `donnees.py`, `data/gabarits.json`

- Source : **Match Charting Project**, 133 joueurs réels ayant au moins 25
  matchs relevés, anonymisés (les 16 joueurs simulés portent des noms
  inventés).
- On ne garde que deux taux, **points gagnés au service** et **en retour**,
  global et par surface (dur, terre, gazon). Une surface peu jouée est tirée
  vers la moyenne pour ne pas croire un petit échantillon.

## 3. Moteur de match — `match.py`

```python
p = service - (retour_adverse - retour_moyen)   # borné à [0,35 ; 0,90]
```

- `_Compteur` joue **point par point** : jeux (avantage), sets, tie-break à
  6-6, 2 ou 3 sets gagnants (Grand Chelem).
- Les blessures en cours de match arrivent sous forme d'**événements
  physiques** prévus à l'avance (tel joueur, au point n° X, perd tant, abandonne
  ou non). Un abandon lève `_Abandon` ; le score partiel est conservé.

## 4. Joueurs — `joueurs.py`

- `Joueur` (immuable) : nom, âge, personnalité, profil statistique, paire,
  pilote (`llm` ou `baseline`).
- `Etat` (change chaque semaine) : fatigue 0-10, blessure, confiance,
  bonus d'entraînement au service et au retour, points.
- `force_effective()` traduit l'état et la tactique en taux du match :
  fatigue −0,4 point de pourcentage par cran, blessure −3, tactique
  `service_agressif` (+1,2 au service, −0,8 au retour, bonus contre un faible
  retourneur ou sur gazon) ou `pression_retour` (l'inverse).
- **Jumeaux** : 8 paires au profil et au classement de départ identiques ;
  l'un est piloté par le LLM, l'autre par la règle fixe.

## 5. Agents — `agents.py`, `llm.py`, `memoire.py`

**`llm.py`** : `ClientOllama.json()` appelle `/api/chat` en `format: json`,
raisonnement désactivé, vérifie les clés attendues, refait un essai, et écrit
chaque appel dans `llm.jsonl`. `FauxLLM` est un remplaçant déterministe :
tests et CI tournent sans Ollama.

**`agents.py`** : un prompt par rôle.

| Fonction | Ce qu'elle décide |
|---|---|
| `decision_joueur` | jouer ou non, entraînement (service, retour, physique, repos, soins), tactique |
| `conseil_entraineur` | conseil donné avant la décision |
| `reflexion` | une leçon tirée des souvenirs, après un tournoi joué |
| `article`, `conference` | presse |
| `negociation` | contrat de sponsor |
| `reaction_sanction`, `vestiaire`, `federation` | couche sociale |
| `avis_medical` | staff médical : jouer, repos ou soins |
| `interview` | questions posées depuis le village 3D |

Chaque champ renvoyé passe par `choisir()`, `booleen()` ou `entier_sur()`
(accents, synonymes, valeurs hors liste). Si rien n'est exploitable, une
**décision de repli** est appliquée et marquée `repli` dans les données : la
saison ne plante jamais.

**La règle fixe** (`decision_baseline`), adversaire du LLM :

```python
jouer = tournoi is not None and e.blessure == 0 and e.fatigue <= 7
entrainement = "repos" if e.fatigue > 5 else ("service", "retour", "physique")[semaine % 3]
```

**`memoire.py`** (idée reprise de *Generative Agents*) : chaque joueur LLM
accumule des `Souvenir` (matchs, conseils, leçons). Avant une décision,
`recuperer()` en redonne 8, choisis par

```python
score = importance / 10 + 0.85 ** (semaines écoulées)
```

puis remis dans l'ordre chronologique.

## 6. Une semaine — `saison.py`

`Saison.jouer()` appelle `_semaine()` douze fois, puis `apres_semaine`
(`run.py` y réécrit `saison.json`, ce que lit le direct). Dans `_semaine()` :

1. **Décisions** de chaque joueur : avis du staff médical s'il y a lieu
   (`_suivi_medical`), conseil de l'entraîneur, puis décision (LLM ou règle
   fixe). Un joueur sérieusement blessé est déclaré inapte quoi qu'il décide.
2. **Tournoi** (`_tournoi`, calendrier de `tournoi.py` : 9 tournois, tableaux
   de 16, barème façon ATP) : `_match()` pour chaque rencontre, incidents
   d'arbitrage, blessures et forfaits ; puis vestiaires (`_vestiaires`) et
   presse (`_presse`).
3. **Fin de semaine** : fatigue et entraînement (`joueurs.fin_de_semaine`),
   réflexion des joueurs LLM qui ont joué.
4. **Couche sociale** : santé (`_sante_fin_de_semaine`), moral, popularité,
   réputation ; fédération toutes les 4 semaines (`_federation`).
5. **Sponsors** (`_negociations`) en semaine 6 et en dernière semaine.
6. **Journal** de la semaine (décisions, raisonnements, état avant tournoi)
   et classement.

**Hasard par match** : `_match()` crée son propre générateur, dérivé de
(graine, semaine, tour, joueurs). Deux jumeaux face au même adversaire au
même tour ont les mêmes tirages, et la décision d'un joueur ne décale pas
le hasard des autres matchs. Sans cela, on ne pourrait pas séparer l'effet
du LLM de la chance.

`--controle` fait suivre la règle fixe aux deux jumeaux : on mesure ainsi le
bruit du hasard seul (environ 330 points d'écart-type par saison,
`outils/experience.py`).

## 7. Couche sociale et blessures — `social.py`, `blessures.py`

- **`social.py`** : moral, popularité, réputation (0-100). Le moral pèse sur
  la force en match. La probabilité d'incident dépend de la personnalité, de
  la fatigue et d'un set serré ; l'arbitre avertit puis pénalise, la
  fédération peut mettre une amende.
- **`blessures.py`** : `risque_match()` (fatigue, âge, surface, format,
  antécédents, style, tactique, hygiène de vie), `tirer()` (zone touchée),
  `aggraver()` (jouer blessé, risque de chronique), `fin_de_semaine()`
  (guérison ou poussée). Calibré pour environ 1 % d'abandons par match.

## 8. Visualisation

**`direct.py`** : serveur local en **lecture seule**, sur `127.0.0.1`
uniquement. `/etat` renvoie la saison et les derniers appels LLM (en tolérant
un fichier en cours d'écriture) ; les fichiers servis viennent d'une liste
fermée. Seule écriture : `POST /interview`, validée, bornée en taille,
traitée une à la fois, journalisée dans `interviews.jsonl`.

**Village 3D** (modules ES importés en relatif) :

| Fichier | Rôle |
|---|---|
| `village3d.js` | scène Three.js, personnages, caméra, lecture, fiches, infobulles |
| `village3d_jour.js` | reconstitue **un jour** : qui est où, état du matin, événements |
| `village3d_controle.js` | horaire de chaque événement, temps forts, grille de tous les joueurs, `auMoment()` |
| `village3d_decor.js`, `village3d_public.js` | complexe à l'échelle réelle, tribunes qui se remplissent |
| `village3d_tableau.js` | tableau du tournoi |
| `village3d_effets.js` | kiné, confettis |
| `village3d_interview.js` | formulaire d'interview |

**Principe : ne jamais dévoiler le futur.** La simulation ne date qu'au jour
près ; `village3d_controle.js` donne une heure à chaque événement, et
pendant la lecture un résultat, un qualifié ou une blessure n'apparaît
qu'une fois l'horloge arrivée à ce moment (`auMoment()`).

**Mode statique** : `outils/exporter_site.py` copie le village dans `site/`
et fige l'état dans `etat.json` ; la page le repère par
`<meta name="etat" content="etat.json">` et le lit au lieu du serveur. Les
interviews, qui demandent le LLM local, y sont masquées.

## 9. Tests et CI

- `tests/` : pytest avec `FauxLLM`, sans réseau (moteur, blessures, social,
  serveur, export, interviews).
- `.github/workflows/tests.yml` : tests et vérification de syntaxe des
  modules JavaScript à chaque push ; `pages.yml` publie `site/`.
