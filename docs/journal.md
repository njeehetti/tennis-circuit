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

### Vue « complexe » avec personnages, pause et archive (demande de Njee)

Consignes : « un grand circuit de tennis avec des petits bonhommes
représentant chaque agent sur lequel tu pouvais cliquer pour voir son statut
etc en info bulle », puis « un bouton pause, pour consulter l'état figé de
tous les agents sur un moment précis de la saison ».

- `tennis/scene.js` : plan SVG du complexe (4 courts + court central, couleur
  de la surface du tournoi ; vestiaires, salles d'entraînement, repos,
  infirmerie, presse, sponsors). Un personnage par joueur (même maillot pour
  deux jumeaux, antenne verte pour le LLM, jauge de fatigue, croix si
  blessé, trophée), un entraîneur à casquette à côté de chaque joueur LLM,
  journaliste, agent, sponsor. Clic = fiche complète. Bulle « vient de
  répondre » au-dessus de l'agent concerné pendant une saison en cours.
- [choix Claude] Placement : le court dépend du tour atteint la semaine
  affichée (finale au central, demies court 1, quarts court 2, premier tour
  courts 3-4) ; sans tournoi, la salle dépend de l'entraînement choisi.
- Pause : l'affichage se fige, la simulation continue (compteur des
  décisions arrivées entre-temps). Curseur : état de tous les agents à la fin
  de n'importe quelle semaine (points, bilan, fatigue, leçons, articles,
  contrats recalculés à cette date).
- Le journal LLM note désormais le joueur concerné (`sujet`) : la bulle et
  les décisions de la semaine en cours ne marchent qu'à partir des saisons
  lancées après ce changement (pas pour `saison_v2_g1`).
- Corrigé : la sauvegarde finale n'a pas de champ `partiel`, la page ne
  voyait jamais la saison comme terminée.

## Saison v2, graine 1 : terminée (21 min, 270 appels, 0 échec, 0 repli)

- Écart moyen LLM − règle : +268 points (écart-type 655 entre paires) ;
  le LLM fait mieux dans 5 paires sur 8. Une saison ne suffit pas (bruit).
- « physique » n'est plus jamais choisi (v1 : 40/65) : l'ambiguïté est levée.
- Nouveau biais : **0 repos et 0 forfait** sur 72 semaines de tournoi ;
  Okonkwo est à 9/10 de fatigue dès la semaine 4. Le LLM sur-joue.
- Entraîneurs : `pression_retour` 51, `service_agressif` 21 ; toujours
  aucun désaccord avec le joueur.

### Refonte visuelle : le village du circuit (demande de Njee)

Consigne : « c'est un affichage assez vieillot […] utilise les skills de
design […] on aurait pu imaginer genre un village tennis avec les courts
d'entraînement, les stades de compétition, la salle de sport, espace
détente, salle de presse etc ». Skill utilisé : frontend-design.

- [choix Claude] Direction : plan illustré vu du ciel façon jeu de gestion
  de club ; bâtiments en coupe pour voir qui est dedans. Palette tirée du
  tennis : pelouse tondue, allées en sable, courts à la couleur de la vraie
  surface du tournoi, vert de tableau d'affichage (#0E3B2C) et jaune balle
  (#D9F24A). Typo Barlow Condensed (signalétique de stade) + Barlow.
- Bandeau en tableau d'affichage (grand numéro de semaine, tournoi,
  surface) et frise des 12 semaines cliquable à la place du curseur.
- Personnages : raquette, bandeau, maillot de la paire, badge « IA »
  jaune pour le LLM, entraîneur en survêtement avec porte-bloc ; fiche en
  badge d'accréditation (statistiques en chiffres de tableau d'affichage).
- Une seule animation : la balle qui traverse le court central entre les
  finalistes (coupée si « réduire les animations » est activé).

### Village en 3D (demande de Njee)

Question : « est ce que si je te donne accès à Unreal Engine… interface
semblable à un jeu… navigateur ? ». Unreal ne tourne plus dans un
navigateur (Pixel Streaming seulement) et serait trop lourd avec 8 Go de
VRAM alors qu'Ollama l'occupe déjà. J'ai proposé Three.js ; réponse : « ok
pour ton option 1, mais garde de côté l'interface que tu m'as déjà fait ».

- Nouvelle page `/3d` (`tennis/village3d.html` et `village3d.js`). Le
  plan 2D sur `/` est inchangé, avec juste un lien « Village en 3D » en plus.
- [choix Claude] Three.js 0.160 par importmap depuis jsDelivr, sans étape
  de build. Le plan 3D reprend exactement les rectangles du plan 2D
  (1 px = 0,1 m), donc les deux vues restent cohérentes.
- Décor low-poly : stade central en anneaux de gradins, arènes, courts
  annexes grillagés, courts d'entraînement (lance-balles, panier),
  bâtiments ouverts sur le dessus pour voir l'intérieur, piscine et
  parasols. Textures de court dessinées en canvas et recolorées selon la
  surface du tournoi.
- Personnages en primitives : jumeaux de même maillot, balle jaune
  flottante pour l'IA, anneau de fatigue au sol, coupe pour le vainqueur,
  bandage si blessé. Ils marchent jusqu'à leur lieu en passant par la
  grande allée ; échange de balle entre les finalistes.
- Caméra orbitale ; un clic recentre la caméra et ouvre la fiche. Les noms
  des entraîneurs n'apparaissent qu'au survol (sinon l'image est
  illisible). En direct, le soleil avance au fil des décisions de la
  semaine. « Réduire les animations » est respecté : téléportation, balle
  fixe.
- Vérifié dans Chrome sur `saison_v2_g1` : pas d'erreur dans la console,
  la fiche s'ouvre au clic. Restent à vérifier : la bulle en direct (il
  faut une saison qui tourne) et l'affichage sur téléphone.

## Couche sociale, jour par jour et scène réaliste (demandes de Njee, 2026-11-02)

Demandes : jauge sociale et morale qui influence les performances
(supporters, réputation, confiance selon les confrontations passées),
fans et supporters dans le village, déroulé jour par jour d'un tournoi
jusqu'à la finale, infobulles au survol, scène repensée « cohérente et
réaliste ».

Choix et raisons :

- **Effet borné à ±2 points** de pourcentage sur le service (moral ±0,9,
  face-à-face ±0,8, public ±0,6). Au-delà, le mental écrasait le talent
  et les classements devenaient erratiques ; en dessous, l'effet était
  invisible. L'ancien bonus de confiance de la v2 est retiré quand la
  couche sociale est active, pour ne pas le compter deux fois.
- **Rendements décroissants** sur le moral et retour hebdomadaire vers
  55 (moral) et 50 (popularité) : sans eux, les leaders saturaient à 100
  en quelques semaines. Mesuré : moral entre 38 et 75 sur 20 saisons.
- **Taux d'incidents** calés sur un ordre de grandeur crédible pour le
  circuit : environ 7 % des matchs avec un avertissement, un point de
  pénalité très rare (0,15 %). Le tirage de l'arbitre utilise un flux
  aléatoire séparé : la couche sociale ne décale pas les autres tirages.
- **La presse ne reçoit que des faits** (incidents, froid aux
  vestiaires, soutien du public) : en v2, le journaliste inventait des
  rivalités dans 7 articles sur 9.
- **Mode sobre** (`--sobre`, et défaut de `Saison`) : la v2 et
  l'expérience restent reproductibles à l'identique.
- **Jour par jour** : le moteur joue déjà les tours dans l'ordre ; on
  date chaque match (R16 lundi-mardi, QF mercredi-jeudi, SF samedi,
  finale dimanche), le vendredi est consacré aux médias et le dimanche à
  la presse et, toutes les 4 semaines, à la fédération. L'affichage
  reconstruit chaque journée depuis `saison.json` (`village3d_jour.js`),
  sans rien ajouter côté simulation.
- **Scène à l'échelle réelle** : dimensions officielles d'un court,
  cuvettes de tribunes avec des sièges réels (instanciés pour rester
  fluide), allées que les personnages suivent en sortant par le tunnel.
  Le plan 3D est désormais indépendant du plan 2D (son propre décor,
  `village3d_decor.js`). Le temps est compressé : un trajet prend environ
  3 s quelle que soit la distance.
- Non vérifié : l'affichage sur téléphone de la vue 3D.

### Écran de contrôle, vitesse et grille (demande de Njee)

Demande : infobulle dès le survol du nom, curseur de vitesse, « écran de
contrôle qui indique les faits majeurs qui se passent actuellement » avec
accès en vue zoomée, et « une grille résumant l'état de tous les agents ».

- **Horaire reconstruit** (`village3d_controle.js`) : la simulation ne
  date les matchs qu'au jour près. L'affichage leur donne une heure
  plausible (courts annexes dès le matin, central en fin d'après-midi,
  durée selon le nombre de sets) ; un incident tombe dans le set où il a
  eu lieu. Ces heures sont de la mise en scène, pas des données simulées.
- **Intérêt d'un événement** : tour du match (finale 90, demie 65, quart
  45, premier tour 25), +30 pour une surprise (vainqueur classé 4 places
  ou plus derrière), +10 pour un match en 3 ou 5 sets ; point de pénalité
  75, avertissement 50, fédération 70, vestiaires tendus 45. La caméra
  automatique ne se déplace que pour un intérêt de 45 ou plus, pour ne
  pas sauter d'un lieu à l'autre toutes les secondes.
- **Pas de divulgation** : pendant la lecture, un match apparaît d'abord
  « en cours » (favori nommé en premier), le résultat seulement à sa fin ;
  les échanges de balle ne se jouent que pendant ce créneau.
- **Vitesse** : 30 s par jour par défaut (au lieu de 5 s, jugé trop
  rapide), mémorisée dans le navigateur. Arrêter la lecture garde l'heure ;
  « Lecture » reprend au même moment.
- **Survol** : les étiquettes de nom captent la souris (sauf masquées), et
  chaque figurine a une zone de survol invisible plus large qu'elle.
