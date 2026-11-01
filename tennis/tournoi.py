"""Calendrier, tableaux et barème de points."""
from __future__ import annotations

from dataclasses import dataclass

TOURS = ("R16", "QF", "SF", "F")
# Barème inspiré de l'ATP, réduit à un tableau de 16.
BAREMES = {
    "250": {"V": 250, "F": 150, "SF": 90, "QF": 45, "R16": 0, "sets": 2, "prix": 600},
    "500": {"V": 500, "F": 300, "SF": 180, "QF": 90, "R16": 0, "sets": 2, "prix": 1000},
    "1000": {"V": 1000, "F": 600, "SF": 360, "QF": 180, "R16": 10, "sets": 2, "prix": 1800},
    "Majeur": {"V": 2000, "F": 1200, "SF": 720, "QF": 360, "R16": 10, "sets": 3, "prix": 4000},
}
# Ordre classique des têtes de série dans un tableau de 16.
ORDRE_TETES = (1, 16, 8, 9, 5, 12, 4, 13, 3, 14, 6, 11, 7, 10, 15, 2)


@dataclass(frozen=True)
class Tournoi:
    semaine: int
    nom: str
    surface: str      # Hard | Clay | Grass
    categorie: str    # 250 | 500 | 1000 | Majeur

    def points(self, tour: str) -> int:
        return BAREMES[self.categorie][tour]

    def prix(self, tour: str) -> int:
        """Prize money en euros (proportionnel aux points, plancher au 1er tour)."""
        return max(5000, self.points(tour) * BAREMES[self.categorie]["prix"] // 10)

    def sets_gagnants(self) -> int:
        return BAREMES[self.categorie]["sets"]


CALENDRIER = (
    Tournoi(1, "Open de Port-Albe", "Hard", "250"),
    Tournoi(2, "Trophée de Valmont", "Hard", "500"),
    Tournoi(3, "Masters de Kestrel Bay", "Hard", "1000"),
    Tournoi(5, "Open de Sierra Ocre", "Clay", "250"),
    Tournoi(6, "Masters de Castelrosso", "Clay", "1000"),
    Tournoi(7, "Grand Chelem de Lutèce-sur-Mer", "Clay", "Majeur"),
    Tournoi(9, "Open de Hollowmere", "Grass", "250"),
    Tournoi(10, "Trophée de Greenwick", "Grass", "500"),
    Tournoi(12, "Masters final de Nordhavn", "Hard", "1000"),
)
NOMS_SURFACES = {"Hard": "dur", "Clay": "terre battue", "Grass": "gazon"}


def tournoi_de_la_semaine(semaine: int) -> Tournoi | None:
    return next((t for t in CALENDRIER if t.semaine == semaine), None)


def prochains(semaine: int, n: int = 3) -> list:
    return [t for t in CALENDRIER if t.semaine > semaine][:n]


def tableau(entrants_tries: list) -> list:
    """Place les entrants (triés par classement) ; les places vides sont des byes (None)."""
    places = [None] * 16
    for pos, tete in enumerate(ORDRE_TETES):
        if tete <= len(entrants_tries):
            places[pos] = entrants_tries[tete - 1]
    return places
