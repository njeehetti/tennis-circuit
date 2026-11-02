"""Couche sociale : moral, popularité, réputation, public, code de conduite.

Tout est déterministe et sans LLM (le LLM ne fait que réagir : protestation,
vestiaires, fédération). Les états sont immuables.

Ordres de grandeur choisis pour rester crédibles :
- l'effet total du mental et du public sur un point est borné à ±2 points
  de pourcentage (l'avantage du terrain mesuré en tennis est de cet ordre) ;
- avertissement dans environ 1 match sur 10, point de pénalité dans moins
  d'1 match sur 100, comme sur le circuit réel.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, replace

EFFET_MAX = 0.02            # borne de l'effet mental + public sur la proba de gagner un point
TILT = 0.01                 # perte de lucidité après une sanction, pour le reste du match

# Tempérament (propension aux incidents) par personnalité.
TEMPERAMENTS = {
    "ambitieux": 1.2, "prudent": 0.5, "perfectionniste": 2.0, "impulsif": 2.5,
    "calme": 0.3, "têtu": 1.6, "anxieux": 0.8, "joueur d'instinct": 1.3,
}
# Sensibilité du moral aux résultats.
SENSIBILITE = {"perfectionniste": 1.5, "anxieux": 1.3, "calme": 0.7, "impulsif": 1.2}
ARBITRES = ("Ana Ferraz", "Pieter Wouters", "Leïla Haddad", "Callum Reid", "Mireille Santoni")
MOTIFS = {
    "perfectionniste": "abus de raquette", "impulsif": "contestation et propos déplacés",
    "têtu": "dépassement du temps entre les points", "ambitieux": "contestation d'une décision",
    "joueur d'instinct": "abus de balle", "anxieux": "dépassement du temps entre les points",
    "prudent": "dépassement du temps entre les points", "calme": "dépassement du temps entre les points",
}


def trait(personnalite: str) -> str:
    """Premier mot-clé reconnu de la personnalité (« impulsif et charismatique… » → impulsif)."""
    for cle in TEMPERAMENTS:
        if personnalite.startswith(cle):
            return cle
    return "calme"


@dataclass(frozen=True)
class Social:
    moral: float = 55.0         # 0 à 100 : confiance en soi
    popularite: float = 50.0    # 0 à 100 : affection des supporters
    reputation: float = 50.0    # 0 à 100 : image auprès des pairs, de la presse, de la fédération
    avertissements: int = 0     # sur la saison
    penalites: int = 0
    amendes: int = 0            # euros


def borne(x: float, bas: float = 0.0, haut: float = 100.0) -> float:
    return max(bas, min(haut, x))


def initial(personnalite: str, rang: int, n: int = 16) -> Social:
    """Popularité de départ : le classement et le charisme comptent."""
    pop = 40 + 25 * (n - rang) / (n - 1) + (8 if trait(personnalite) == "impulsif" else 0)
    return Social(moral=55.0, popularite=round(pop, 1), reputation=50.0)


# ------------------------------------------------------------------ avant le match
def bilan_face_a_face(h2h: dict | None, moi: str, lui: str) -> tuple[int, int]:
    if not h2h:
        return 0, 0
    return h2h.get(moi, 0), h2h.get(lui, 0)


def soutien_public(pop_a: float, pop_b: float, rang_a: int, rang_b: int) -> float:
    """Soutien du public pour A, de -1 (tout pour B) à +1 (tout pour A).
    Le public aime ses favoris, et un peu les outsiders."""
    outsider = 0.25 * (1 if rang_a - rang_b >= 5 else -1 if rang_b - rang_a >= 5 else 0)
    return math.tanh((pop_a - pop_b) / 30 + outsider)


def ajustement(s: Social, gagnes: int, perdus: int, soutien: float) -> float:
    """Effet sur la proba de gagner un point : moral, face-à-face, public. Borné."""
    moral = (s.moral - 50) / 50 * 0.009
    h2h = (gagnes - perdus) / (gagnes + perdus + 2) * 0.008
    public = soutien * 0.006
    return borne(moral + h2h + public, -EFFET_MAX, EFFET_MAX)


# ------------------------------------------------------------------ pendant le match
def proba_incident(personnalite: str, s: Social, fatigue: float, set_serre: bool,
                   tension: bool) -> float:
    """Probabilité d'une infraction au code de conduite pour le perdant d'un set."""
    temp = TEMPERAMENTS[trait(personnalite)]
    frustration = borne(1 + (50 - s.moral) / 50, 0.5, 2.0)
    p = 0.012 + 0.022 * temp * frustration
    if set_serre:
        p *= 1.4
    if fatigue > 6:
        p *= 1.3
    if tension:
        p *= 1.3
    return min(p, 0.25)


RECIDIVE = 4.0     # déjà averti dans le match : la frustration monte, la récidive est plus probable


def sanction(deja: int) -> str:
    """Barème progressif du code de conduite (un match) : avertissement puis point."""
    return "avertissement" if deja == 0 else "point"


# ------------------------------------------------------------------ après le match
def apres_match(s: Social, personnalite: str, gagne: bool, rang: int, rang_adv: int,
                sanctions: list, excuses: bool = False) -> Social:
    sens = SENSIBILITE.get(trait(personnalite), 1.0)
    if gagne:
        d_moral = 2 + 0.4 * max(0, rang - rang_adv)            # battre mieux classé que soi
        d_pop = 0.5 + (2 if rang - rang_adv >= 5 else 0) + (0.5 if trait(personnalite) == "impulsif" else 0)
    else:
        d_moral = -(2.5 + 0.4 * max(0, rang_adv - rang))       # perdre contre moins bien classé
        d_pop = 0
    # rendements décroissants : plus on est haut, moins une victoire fait monter (et inversement)
    d_moral *= (100 - s.moral) / 50 if d_moral > 0 else s.moral / 50
    d_pop *= (100 - s.popularite) / 50
    d_rep = 0.0
    for nature in sanctions:
        d_moral -= 2
        d_pop -= 2 if excuses else 5
        d_rep -= 2 if nature == "avertissement" else 6
    return replace(s, moral=borne(s.moral + d_moral * sens), popularite=borne(s.popularite + d_pop),
                   reputation=borne(s.reputation + d_rep),
                   avertissements=s.avertissements + sanctions.count("avertissement"),
                   penalites=s.penalites + sanctions.count("point"))


def apres_tournoi(s: Social, tour: str | None) -> Social:
    if tour == "V":
        return replace(s, moral=borne(s.moral + 4 * (100 - s.moral) / 50),
                       popularite=borne(s.popularite + 3 * (100 - s.popularite) / 50),
                       reputation=borne(s.reputation + 4 * (100 - s.reputation) / 50))
    if tour == "F":
        return replace(s, moral=borne(s.moral + 1.5 * (100 - s.moral) / 50),
                       popularite=borne(s.popularite + 1))
    return s


def fin_de_semaine(s: Social, a_joue: bool, entrainement: str, fatigue: float) -> Social:
    """Retour lent vers l'équilibre ; une vraie coupure quand on est fatigué remonte le moral."""
    moral = s.moral + (55 - s.moral) * 0.15
    if not a_joue and entrainement == "repos" and fatigue >= 4:
        moral += 3
    return replace(s, moral=borne(moral), popularite=borne(s.popularite + (50 - s.popularite) * 0.06),
                   reputation=borne(s.reputation + (50 - s.reputation) * 0.02))


def amende(s: Social, montant: int) -> Social:
    return replace(s, amendes=s.amendes + montant, reputation=borne(s.reputation - 4))


def en_texte(s: Social) -> str:
    return (f"moral : {s.moral:.0f}/100 ; popularité auprès du public : {s.popularite:.0f}/100 ; "
            f"réputation : {s.reputation:.0f}/100")


REGLES_SOCIALES = (
    "Mental et public : ton moral (0 à 100) monte avec les victoires, surtout contre mieux classé "
    "que toi, et baisse avec les défaites et les sanctions ; une semaine de repos quand tu es "
    "fatigué le fait remonter. Au-dessus de 50 il t'aide, en dessous il te dessert (jusqu'à 0,9 "
    "point de pourcentage). Ton bilan face à un adversaire compte aussi (jusqu'à 0,8), et le "
    "public soutient les joueurs populaires (jusqu'à 0,6). Un arbitre applique le code de "
    "conduite : avertissement, puis point de pénalité ; chaque sanction coûte en popularité et en "
    "réputation, et la fédération peut infliger des amendes."
)
