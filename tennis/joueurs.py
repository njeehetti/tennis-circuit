"""Joueurs fictifs, leur état de forme, et les effets des décisions.

Les états sont immuables : chaque fonction renvoie un nouvel `Etat`.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, replace

from .match import Force

SERVICE_MOYEN, RETOUR_MOYEN = 0.636, 0.352
TACTIQUES = ("service_agressif", "pression_retour", "equilibre")
ENTRAINEMENTS = ("service", "retour", "physique", "repos")
PERSONNALITES = (
    "ambitieux, obsédé par le classement, accepte de prendre des risques physiques",
    "prudent, écoute son corps, préfère une carrière longue à un coup d'éclat",
    "perfectionniste, très exigeant avec lui-même, supporte mal les défaites",
    "impulsif et charismatique, adore les grands matchs et les médias",
    "calme et méthodique, fait confiance à son entraîneur",
    "têtu, n'aime pas qu'on lui dicte son calendrier",
    "anxieux en conférence de presse mais travailleur acharné",
    "joueur d'instinct, aime la terre battue, déteste les longues tournées",
)
# Noms inventés (associations volontairement improbables : aucun vrai joueur).
PRENOMS = ("Lorcan", "Teodor", "Malo", "Ilias", "Joaquin", "Kenji", "Anders", "Rafe",
           "Oskar", "Matthis", "Davor", "Emeric", "Tiago", "Yannis", "Bastien", "Nikolai")
NOMS = ("Varenne", "Strand", "Okonkwo", "Belcastro", "Haraldsen", "Mirecki", "Duvalier",
        "Ostrova", "Kaminaga", "Ferreol", "Lindqvist", "Abarca", "Pellerin", "Zoltanyi",
        "Marchetti", "Quinlan")
PAYS = ("FRA", "NOR", "NGA", "ITA", "DEN", "POL", "BEL", "CRO", "JPN", "ESP", "SWE",
        "ARG", "CAN", "HUN", "GRE", "AUS")


@dataclass(frozen=True)
class Joueur:
    id: str
    nom: str
    pays: str
    age: int
    personnalite: str
    pilote: str            # "llm" ou "baseline"
    paire: int             # index de la paire de jumeaux statistiques
    profil: dict           # gabarit : service/retour global et par surface

    def style(self) -> str:
        ecart = (self.profil["service"] - SERVICE_MOYEN) - (self.profil["retour"] - RETOUR_MOYEN)
        if ecart > 0.02:
            return "serveur"
        if ecart < -0.02:
            return "relanceur"
        return "complet"


@dataclass(frozen=True)
class Etat:
    fatigue: float = 0.0          # 0 (frais) à 10 (épuisé)
    confiance: int = 0            # -3 à +3
    bonus_service: float = 0.0    # gains d'entraînement, plafonnés
    bonus_retour: float = 0.0
    endurance: float = 0.0        # réduit l'accumulation de fatigue (0 à 0,3)
    blessure: int = 0             # semaines de blessure restantes (info privée)
    points: int = 0               # points de classement
    gains: int = 0                # prize money + sponsors (euros)
    sponsor: str = ""
    matchs: int = 0
    victoires: int = 0


def creer_joueurs(gabarits: list[dict], rng: random.Random, n_paires: int = 8) -> list[Joueur]:
    """8 paires de jumeaux statistiques : l'un piloté par LLM, l'autre baseline."""
    pas = max(1, int(len(gabarits) * 0.6) // n_paires)
    choisis = [gabarits[min(len(gabarits) - 1, i * pas)] for i in range(n_paires)]
    prenoms, noms, pays = list(PRENOMS), list(NOMS), list(PAYS)
    rng.shuffle(prenoms)
    rng.shuffle(noms)
    rng.shuffle(pays)
    joueurs = []
    for k, gab in enumerate(choisis):
        pilotes = ["llm", "baseline"]
        rng.shuffle(pilotes)
        for j, pilote in enumerate(pilotes):
            i = 2 * k + j
            joueurs.append(Joueur(
                id=f"J{i:02d}", nom=f"{prenoms[i]} {noms[i]}", pays=pays[i],
                age=rng.randint(19, 33),
                personnalite=PERSONNALITES[rng.randrange(len(PERSONNALITES))],
                pilote=pilote, paire=k, profil=gab))
    return joueurs


def points_initiaux(joueur: Joueur) -> int:
    """Classement de départ fonction de la force (identique pour deux jumeaux)."""
    force = joueur.profil["service"] + joueur.profil["retour"]
    return max(100, int((force - 0.92) * 40000))


def force_effective(j: Joueur, e: Etat, surface: str, tactique: str, adv: Joueur) -> Force:
    """Force du joueur pour un match donné, décisions des agents comprises."""
    base = j.profil["surfaces"][surface]
    penalite = 0.004 * e.fatigue + (0.03 if e.blessure > 0 else 0.0) - 0.005 * e.confiance
    s = base["service"] + e.bonus_service - penalite
    r = base["retour"] + e.bonus_retour - penalite
    if tactique == "service_agressif":
        s, r = s + 0.012, r - 0.008
        if adv.profil["retour"] < RETOUR_MOYEN:      # vise un retourneur faible
            s += 0.008
        if surface == "Grass":
            s += 0.005
    elif tactique == "pression_retour":
        s, r = s - 0.008, r + 0.012
        if adv.profil["service"] < SERVICE_MOYEN:    # vise un serveur faible
            r += 0.008
        if surface == "Clay":
            r += 0.005
    return Force(service=s, retour=r)


def apres_match(e: Etat, gagne: bool, cinq_sets: bool, tactique: str,
                rng: random.Random) -> tuple[Etat, bool]:
    """Fatigue et risque de blessure après un match. Renvoie (état, nouvelle_blessure)."""
    charge = (1.5 if cinq_sets else 1.0) + (0.25 if tactique == "service_agressif" else 0.0)
    fatigue = min(10.0, e.fatigue + charge * (1 - e.endurance))
    nouvelle = False
    blessure = e.blessure
    if blessure == 0 and rng.random() < max(0.0, fatigue - 6) * 0.03:
        # 2 à 4 : la semaine en cours est décomptée en fin de semaine (1 à 3 semaines réelles)
        blessure, nouvelle = rng.randint(2, 4), True
    return replace(e, fatigue=fatigue, blessure=blessure, matchs=e.matchs + 1,
                   victoires=e.victoires + int(gagne)), nouvelle


def fin_de_semaine(e: Etat, a_joue: bool, entrainement: str, resultat_tour: str | None) -> Etat:
    """Récupération, entraînement, confiance, blessure qui guérit."""
    fatigue = e.fatigue - (1.0 if a_joue else 3.0)
    bs, br, endu = e.bonus_service, e.bonus_retour, e.endurance
    if e.blessure > 0:
        entrainement = "repos"
    if entrainement == "service":
        bs = min(0.02, bs + 0.002)
    elif entrainement == "retour":
        br = min(0.02, br + 0.002)
    elif entrainement == "physique":
        endu = min(0.3, endu + 0.05)
        fatigue += 0.5
    elif entrainement == "repos":
        fatigue -= 1.5
    confiance = e.confiance
    if resultat_tour == "V":
        confiance += 2
    elif resultat_tour in ("F", "SF"):
        confiance += 1
    elif resultat_tour == "R16":
        confiance -= 1
    return replace(e, fatigue=max(0.0, min(10.0, fatigue)), bonus_service=bs, bonus_retour=br,
                   endurance=endu, confiance=max(-3, min(3, confiance)),
                   blessure=max(0, e.blessure - 1))
