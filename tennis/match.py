"""Moteur de match point par point (aucun LLM ici).

p(serveur gagne le point) = service_serveur - (retour_receveur - retour_moyen),
borné à [P_MIN, P_MAX]. Les forces passées en entrée intègrent déjà les
modificateurs (fatigue, confiance, tactique...) calculés dans `forme.py`.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

P_MIN, P_MAX = 0.35, 0.90


@dataclass(frozen=True)
class Force:
    service: float
    retour: float


@dataclass(frozen=True)
class Resultat:
    vainqueur: int                      # 0 = joueur A, 1 = joueur B
    sets: tuple[tuple[int, int], ...]   # jeux par set, du point de vue de A
    points: str = ""                    # suite des points : "a"/"b" = gagné par A/B, "|" fin de jeu
    points_gagnes: tuple[int, int] = (0, 0)
    abandon: bool = False
    sanctions: tuple = ()               # (joueur 0/1, "avertissement" | "point", set n°)

    def score(self) -> str:
        return " ".join(f"{a}-{b}" for a, b in self.sets)


def proba_point(service: float, retour_adverse: float, retour_moyen: float) -> float:
    p = service - (retour_adverse - retour_moyen)
    return min(P_MAX, max(P_MIN, p))


@dataclass
class _Compteur:
    rng: random.Random
    p: tuple[float, float]              # p[i] = proba que i gagne un point sur son service
    trace: list = field(default_factory=list)
    gagnes: list = field(default_factory=lambda: [0, 0])
    offerts: list = field(default_factory=list)     # points de pénalité à attribuer

    def point(self, serveur: int) -> int:
        if self.offerts:                             # point de pénalité : pas de tirage
            gagnant = self.offerts.pop(0)
            self.trace.append("ab"[gagnant])
            self.gagnes[gagnant] += 1
            return gagnant
        gagnant = serveur if self.rng.random() < self.p[serveur] else 1 - serveur
        self.trace.append("ab"[gagnant])
        self.gagnes[gagnant] += 1
        return gagnant

    def jeu(self, serveur: int) -> int:
        pts = [0, 0]
        while True:
            pts[self.point(serveur)] += 1
            if max(pts) >= 4 and abs(pts[0] - pts[1]) >= 2:
                self.trace.append("|")
                return 0 if pts[0] > pts[1] else 1

    def tie_break(self, premier_serveur: int) -> int:
        pts = [0, 0]
        n = 0
        while True:
            # le premier sert 1 point, puis alternance tous les 2 points
            serveur = premier_serveur if ((n + 1) // 2) % 2 == 0 else 1 - premier_serveur
            pts[self.point(serveur)] += 1
            n += 1
            if max(pts) >= 7 and abs(pts[0] - pts[1]) >= 2:
                self.trace.append("|")
                return 0 if pts[0] > pts[1] else 1


def jouer_match(a: Force, b: Force, rng: random.Random, retour_moyen: float,
                sets_gagnants: int = 2, apres_set=None, tilt: float = 0.0) -> Resultat:
    """Joue un match complet. A sert le premier jeu (tiré au sort en amont).

    `apres_set(n, jeux, sets)` (facultatif) renvoie les sanctions de l'arbitre
    sous forme de tuples (joueur, nature) : un point de pénalité est attribué à
    l'adversaire sur le point suivant, et toute sanction fait perdre `tilt` au
    fautif sur ses points de service pour le reste du match."""
    c = _Compteur(rng, (proba_point(a.service, b.retour, retour_moyen),
                        proba_point(b.service, a.retour, retour_moyen)))
    sets, gagnes_sets, serveur = [], [0, 0], 0
    sanctions = []
    while max(gagnes_sets) < sets_gagnants:
        jeux = [0, 0]
        while True:
            if jeux == [6, 6]:
                g = c.tie_break(serveur)
                jeux[g] += 1
                serveur = 1 - serveur
                break
            jeux[c.jeu(serveur)] += 1
            serveur = 1 - serveur
            if max(jeux) >= 6 and abs(jeux[0] - jeux[1]) >= 2:
                break
        sets.append((jeux[0], jeux[1]))
        gagnes_sets[0 if jeux[0] > jeux[1] else 1] += 1
        c.trace.append("/")
        if apres_set and max(gagnes_sets) < sets_gagnants:
            for fautif, nature in apres_set(len(sets), tuple(jeux), tuple(gagnes_sets)):
                sanctions.append((fautif, nature, len(sets)))
                if nature == "point":
                    c.offerts.append(1 - fautif)
                p = list(c.p)
                p[fautif] = max(P_MIN, p[fautif] - tilt)
                c.p = (p[0], p[1])
    return Resultat(vainqueur=0 if gagnes_sets[0] > gagnes_sets[1] else 1,
                    sets=tuple(sets), points="".join(c.trace),
                    points_gagnes=(c.gagnes[0], c.gagnes[1]), sanctions=tuple(sanctions))


def forfait(vainqueur: int) -> Resultat:
    return Resultat(vainqueur=vainqueur, sets=(), abandon=True)
