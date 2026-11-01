"""Flux de mémoire minimal, inspiré de Generative Agents (Park et al., 2023).

Récupération : score = importance/10 + 0,85^(âge en semaines).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Souvenir:
    semaine: int
    texte: str
    importance: int = 3      # 1 (anodin) à 10 (marquant)
    type: str = "evenement"  # evenement | reflexion | presse | conseil


def ajouter(memoire: tuple, s: Souvenir) -> tuple:
    return memoire + (s,)


def recuperer(memoire: tuple, semaine: int, k: int = 8) -> list:
    def score(s: Souvenir) -> float:
        return s.importance / 10 + 0.85 ** max(0, semaine - s.semaine)
    choisis = sorted(memoire, key=score, reverse=True)[:k]
    return sorted(choisis, key=lambda s: s.semaine)


def en_texte(souvenirs: list) -> str:
    if not souvenirs:
        return "(aucun souvenir pour l'instant)"
    return "\n".join(f"- semaine {s.semaine} : {s.texte}" for s in souvenirs)
