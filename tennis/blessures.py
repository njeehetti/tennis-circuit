"""Blessures (couche v3, avec la couche sociale) : zone, gravité, aggravation, chronicité, abandon.

Logique pure et déterministe à graine fixée (les tirages passent par un flux
aléatoire dédié, « -blessure », qui ne décale pas les points des matchs).

Ordres de grandeur retenus pour rester crédibles :
- risque d'environ 0,5 à 1,5 % par match pour un joueur frais, 3 à 6 % au-delà de
  7/10 de fatigue (le circuit réel compte quelques abandons pour cent matchs) ;
- le dur, l'âge, les matchs en 5 sets et les antécédents augmentent le risque ;
- jouer blessé coûte selon la zone (une épaule touche le service, une cheville
  le retour) et peut aggraver la blessure ;
- une deuxième blessure au même endroit, ou une aggravation, peut la rendre
  chronique : petite gêne permanente quand on est fatigué, et rechutes.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

# zone : (malus au service, malus en retour) pour une blessure « modérée », propension à la chronicité
ZONES = {
    "épaule": (0.030, 0.010, 0.35), "poignet": (0.012, 0.028, 0.30), "dos": (0.025, 0.020, 0.40),
    "abdominaux": (0.030, 0.006, 0.15), "cuisse": (0.008, 0.024, 0.15), "genou": (0.012, 0.028, 0.35),
    "cheville": (0.008, 0.026, 0.20),
}
# zones les plus touchées selon la surface (glissades sur terre, appuis sur dur, gazon bas et glissant)
POIDS_SURFACE = {
    "Hard": {"genou": 3, "cheville": 3, "épaule": 2, "poignet": 2, "dos": 2, "abdominaux": 2, "cuisse": 2},
    "Clay": {"cuisse": 3, "dos": 3, "genou": 2, "épaule": 2, "poignet": 2, "abdominaux": 2, "cheville": 1},
    "Grass": {"dos": 3, "cheville": 3, "abdominaux": 2, "genou": 2, "épaule": 2, "cuisse": 2, "poignet": 1},
}
# Style de jeu et tactique : un serveur qui frappe fort use l'épaule, le dos, les abdominaux ;
# un relanceur qui court et défend use les jambes. (facteur de risque, zones plus exposées)
STYLES = {"serveur": (1.12, ("épaule", "dos", "abdominaux")), "relanceur": (1.08, ("cuisse", "genou", "cheville")),
          "complet": (1.0, ())}
TACTIQUES = {"service_agressif": (1.15, ("épaule", "abdominaux")), "pression_retour": (1.06, ("cuisse", "cheville")),
             "equilibre": (1.0, ())}
# Hygiène de vie (identique dans une paire de jumeaux, pour garder l'expérience équitable) :
# (risque frais, risque fatigué ≥ 5, fatigue en plus par semaine d'entraînement, part des progrès gardée)
HYGIENES = {
    "dilettante": (1.2, 1.2, -0.3, 0.5),     # se ménage, mais moins préparé physiquement
    "équilibré": (1.0, 1.0, 0.0, 1.0),
    "acharné": (0.9, 1.35, 0.4, 1.5),         # très préparé, mais tire sur la corde quand il est fatigué
}
HYGIENES_TXT = {
    "dilettante": "dilettante (tu te ménages : moins de fatigue à l'entraînement, mais progrès réduits de moitié "
                  "et corps moins préparé, risque de blessure +20 %)",
    "équilibré": "équilibrée (aucun effet particulier)",
    "acharné": "acharnée (tu t'entraînes très dur : progrès +50 %, mais +0,4 de fatigue par semaine d'entraînement "
               "et risque de blessure +35 % dès 5/10 de fatigue)",
}

GRAVITES = ("gêne", "légère", "modérée", "sérieuse")
POIDS_GRAVITE = (35, 35, 22, 8)
# semaines restantes, semaine en cours comprise (une « gêne » passe d'ici la fin de la semaine)
SEMAINES = {"gêne": (1, 1), "légère": (2, 2), "modérée": (3, 4), "sérieuse": (5, 7)}
FACTEUR = {"gêne": 0.4, "légère": 0.7, "modérée": 1.0, "sérieuse": 1.5}
PROBA_ABANDON = {"gêne": 0.05, "légère": 0.3, "modérée": 0.65, "sérieuse": 0.9}
MORAL_BLESSURE = {"gêne": -3.0, "légère": -5.0, "modérée": -8.0, "sérieuse": -12.0}
MORAL_CHRONIQUE, MORAL_RETOUR, MORAL_ABANDON = -5.0, 4.0, -4.0
AGGRAVATION = 0.18          # par match joué blessé, multiplié par le facteur de gravité
CHRONIQUE_RESTE = 0.35      # part du malus qui reste en permanence (fatigue ≥ 5) sur une zone chronique
POUSSEE = 0.2               # risque de poussée d'une zone chronique, par semaine, fatigue ≥ 6


@dataclass(frozen=True)
class Sante:
    zone: str = ""              # blessure en cours ("" : aucune)
    gravite: str = ""
    semaines: int = 0           # semaines restantes (miroir de Etat.blessure)
    chroniques: tuple = ()      # zones devenues chroniques
    antecedents: tuple = ()     # zones déjà blessées cette saison (une entrée par blessure)


@dataclass(frozen=True)
class Evenement:
    zone: str
    gravite: str
    semaines: int
    aggravation: bool = False
    chronique: bool = False     # la zone vient de devenir chronique
    rechute: bool = False       # sur une zone déjà blessée


def blesse(s: Sante) -> bool:
    return s.semaines > 0


def risque_match(s: Sante, fatigue: float, age: int, surface: str, cinq_sets: bool, endurance: float,
                 style: str = "complet", tactique: str = "equilibre", hygiene: str = "équilibré") -> float:
    """Probabilité de se blesser pendant un match quand on n'est pas déjà blessé."""
    h = HYGIENES.get(hygiene, HYGIENES["équilibré"])
    facteur = (STYLES.get(style, (1.0,))[0] * TACTIQUES.get(tactique, (1.0,))[0]
               * (h[1] if fatigue >= 5 else h[0]))
    p = facteur * (0.004 + 0.011 * max(0.0, fatigue - 4) + 0.0015 * max(0, age - 28)
         + 0.008 * len(s.chroniques) + 0.003 * len(s.antecedents)
         + {"Hard": 0.003, "Grass": 0.001}.get(surface, 0.0) + (0.004 if cinq_sets else 0.0)
         - 0.01 * endurance)
    return max(0.002, min(0.25, p))


def poids_zones(surface: str, style: str = "complet", tactique: str = "equilibre") -> dict:
    poids = dict(POIDS_SURFACE.get(surface, POIDS_SURFACE["Hard"]))
    for z in STYLES.get(style, (1.0, ()))[1] + TACTIQUES.get(tactique, (1.0, ()))[1]:
        poids[z] += 2
    return poids


def risque_aggravation(s: Sante) -> float:
    return AGGRAVATION * FACTEUR.get(s.gravite, 1.0) if blesse(s) else 0.0


def _choix_pondere(rng, options: dict):
    total = sum(options.values())
    x = rng.random() * total
    for k, w in options.items():
        x -= w
        if x < 0:
            return k
    return k


def tirer(rng, s: Sante, surface: str, style: str = "complet", tactique: str = "equilibre") -> Evenement:
    """Nouvelle blessure : une zone chronique rechute une fois sur deux ; sinon la surface,
    le style et la tactique du match orientent la zone touchée."""
    if s.chroniques and rng.random() < 0.5:
        zone = s.chroniques[rng.randrange(len(s.chroniques))]
    else:
        zone = _choix_pondere(rng, poids_zones(surface, style, tactique))
    gravite = _choix_pondere(rng, dict(zip(GRAVITES, POIDS_GRAVITE)))
    rechute = zone in s.antecedents
    if rechute and gravite != "sérieuse" and rng.random() < 0.3:
        gravite = GRAVITES[GRAVITES.index(gravite) + 1]
    chronique = (rechute and zone not in s.chroniques and rng.random() < ZONES[zone][2] * 1.5)
    return Evenement(zone, gravite, rng.randint(*SEMAINES[gravite]), chronique=chronique, rechute=rechute)


def aggraver(rng, s: Sante) -> Evenement:
    """Jouer blessé a mal tourné : un cran de gravité en plus, plus long, parfois chronique."""
    g = GRAVITES[min(len(GRAVITES) - 1, GRAVITES.index(s.gravite) + 1)] if s.gravite in GRAVITES else "modérée"
    chronique = s.zone not in s.chroniques and rng.random() < ZONES.get(s.zone, (0, 0, 0.3))[2] * 2
    return Evenement(s.zone or "dos", g, s.semaines + rng.randint(1, 3), aggravation=True, chronique=chronique)


def appliquer(s: Sante, ev: Evenement) -> Sante:
    chroniques = s.chroniques + ((ev.zone,) if ev.chronique and ev.zone not in s.chroniques else ())
    antecedents = s.antecedents + (() if ev.aggravation else (ev.zone,))
    return replace(s, zone=ev.zone, gravite=ev.gravite, semaines=ev.semaines,
                   chroniques=chroniques, antecedents=antecedents)


def malus(s: Sante, fatigue: float) -> tuple[float, float]:
    """(malus au service, malus en retour) : blessure en cours et zones chroniques."""
    ms = mr = 0.0
    if blesse(s) and s.zone in ZONES:
        f = FACTEUR.get(s.gravite, 1.0)
        ms, mr = ZONES[s.zone][0] * f, ZONES[s.zone][1] * f
    if fatigue >= 5:
        for z in s.chroniques:
            if z != s.zone:
                ms += ZONES[z][0] * CHRONIQUE_RESTE
                mr += ZONES[z][1] * CHRONIQUE_RESTE
    return ms, mr


def proba_abandon(ev: Evenement) -> float:
    return min(0.95, PROBA_ABANDON[ev.gravite] + (0.15 if ev.aggravation else 0.0))


def delta_moral(ev: Evenement, abandon: bool) -> float:
    return (MORAL_BLESSURE[ev.gravite] + (MORAL_CHRONIQUE if ev.chronique else 0.0)
            + (MORAL_ABANDON if abandon else 0.0))


def fin_de_semaine(rng, s: Sante, soins: bool, fatigue: float) -> tuple[Sante, str | None]:
    """Guérison (plus rapide avec des soins) et poussées chroniques.
    Renvoie (santé, "gueri" | "poussee" | None)."""
    if blesse(s):
        restant = max(0, s.semaines - (2 if soins else 1))
        if restant == 0:
            return replace(s, zone="", gravite="", semaines=0), "gueri"
        return replace(s, semaines=restant), None
    if s.chroniques and fatigue >= 6 and rng.random() < POUSSEE * (0.5 if soins else 1.0):
        z = s.chroniques[rng.randrange(len(s.chroniques))]
        return replace(s, zone=z, gravite="gêne", semaines=1), "poussee"
    return s, None


def en_texte(s: Sante) -> str:
    morceaux = []
    if blesse(s):
        ms, mr = malus(s, 0)
        morceaux.append(f"blessure : {s.zone} ({s.gravite}), encore {s.semaines} semaine(s) ; jouer blessé "
                        f"te coûte {ms*100:.1f} point(s) de % au service et {mr*100:.1f} en retour, avec "
                        f"{risque_aggravation(s)*100:.0f} % de risque d'aggravation par match")
    else:
        morceaux.append("aucune blessure en cours")
    if s.chroniques:
        morceaux.append("zone(s) chronique(s) : " + ", ".join(s.chroniques)
                        + " (gêne permanente quand ta fatigue atteint 5, rechutes possibles)")
    elif s.antecedents:
        morceaux.append("déjà blessé cette saison : " + ", ".join(dict.fromkeys(s.antecedents)))
    return " ; ".join(morceaux)


REGLES_BLESSURES = (
    "Blessures : chaque match comporte un risque de blessure (environ 1 % frais, 4 % à 7/10 de "
    "fatigue, davantage sur dur, en 5 sets, avec l'âge et les antécédents). Le style compte : "
    "un serveur use épaule et dos (+12 %), un relanceur ses jambes (+8 %) ; la tactique "
    "« service_agressif » ajoute 15 % de risque, « pression_retour » 6 %. Une blessure touche "
    "une zone (épaule : surtout le service ; cheville, genou : surtout le retour) et peut forcer "
    "à abandonner en plein match. Jouer blessé fait perdre des points de % et peut aggraver la "
    "blessure. Une deuxième blessure au même endroit ou une aggravation peut devenir chronique. "
    "L'entraînement « soins » (kiné, médecin) guérit deux fois plus vite et limite les poussées "
    "chroniques ; « physique » rend plus endurant donc moins fragile. Une blessure fait baisser "
    "le moral ; revenir guéri le fait remonter."
)
