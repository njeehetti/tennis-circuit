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
    blessures: tuple = ()               # (joueur 0/1, set n°) des blessures survenues pendant le match

    def score(self) -> str:
        return " ".join(f"{a}-{b}" for a, b in self.sets)


def proba_point(service: float, retour_adverse: float, retour_moyen: float) -> float:
    p = service - (retour_adverse - retour_moyen)
    return min(P_MAX, max(P_MIN, p))


class _Abandon(Exception):
    def __init__(self, qui: int):
        super().__init__(qui)
        self.qui = qui


@dataclass
class _Compteur:
    rng: random.Random
    p: tuple[float, float]              # p[i] = proba que i gagne un point sur son service
    trace: list = field(default_factory=list)
    gagnes: list = field(default_factory=lambda: [0, 0])
    offerts: list = field(default_factory=list)     # points de pénalité à attribuer
    physique: list = field(default_factory=list)    # blessures à venir : [joueur, au point n°, ms, mr, abandon]
    survenues: list = field(default_factory=list)   # joueurs blessés, dans l'ordre

    def _corps(self) -> None:
        """Après chaque point : une blessure prévue à ce point survient (malus, ou abandon)."""
        n = self.gagnes[0] + self.gagnes[1]
        for ev in [e for e in self.physique if e[1] == n]:
            self.physique.remove(ev)
            qui, _, ms, mr, abandon = ev
            self.survenues.append(qui)
            if abandon:
                raise _Abandon(qui)
            p = list(self.p)
            p[qui] = max(P_MIN, p[qui] - ms)
            p[1 - qui] = min(P_MAX, p[1 - qui] + mr)
            self.p = (p[0], p[1])

    def point(self, serveur: int) -> int:
        if self.offerts:                             # point de pénalité : pas de tirage
            gagnant = self.offerts.pop(0)
            self.trace.append("ab"[gagnant])
            self.gagnes[gagnant] += 1
            self._corps()
            return gagnant
        gagnant = serveur if self.rng.random() < self.p[serveur] else 1 - serveur
        self.trace.append("ab"[gagnant])
        self.gagnes[gagnant] += 1
        self._corps()
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
                sets_gagnants: int = 2, apres_set=None, tilt: float = 0.0,
                physique: tuple = ()) -> Resultat:
    """Joue un match complet. A sert le premier jeu (tiré au sort en amont).

    `apres_set(n, jeux, sets)` (facultatif) renvoie les sanctions de l'arbitre
    sous forme de tuples (joueur, nature) : un point de pénalité est attribué à
    l'adversaire sur le point suivant, et toute sanction fait perdre `tilt` au
    fautif sur ses points de service pour le reste du match.

    `physique` : blessures en cours de match, tuples (joueur, au point n°,
    malus au service, malus en retour, abandon). Si le match dure jusque-là,
    le joueur continue diminué, ou abandonne sur-le-champ (score partiel)."""
    c = _Compteur(rng, (proba_point(a.service, b.retour, retour_moyen),
                        proba_point(b.service, a.retour, retour_moyen)),
                  physique=[list(e) for e in physique])
    sets, gagnes_sets, serveur = [], [0, 0], 0
    sanctions = []
    abandon_de = None
    while max(gagnes_sets) < sets_gagnants:
        jeux = [0, 0]
        try:
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
        except _Abandon as ab:
            abandon_de = ab.qui
            sets.append((jeux[0], jeux[1]))          # set interrompu
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
    # set de chaque blessure : on compte les « / » de la trace avant le point concerné
    blessures = tuple((qui, None) for qui in c.survenues)
    if c.survenues:
        blessures = _sets_des_blessures(c.trace, physique, c.survenues)
    if abandon_de is not None:
        return Resultat(vainqueur=1 - abandon_de, sets=tuple(sets), points="".join(c.trace),
                        points_gagnes=(c.gagnes[0], c.gagnes[1]), abandon=True, sanctions=tuple(sanctions),
                        blessures=blessures)
    return Resultat(vainqueur=0 if gagnes_sets[0] > gagnes_sets[1] else 1,
                    sets=tuple(sets), points="".join(c.trace),
                    points_gagnes=(c.gagnes[0], c.gagnes[1]), sanctions=tuple(sanctions),
                    blessures=blessures)


def _sets_des_blessures(trace: list, physique: tuple, survenues: list) -> tuple:
    out, n_pt, n_set, k = [], 0, 1, {}
    for ch in trace:
        if ch == "/":
            n_set += 1
        elif ch in "ab":
            n_pt += 1
            k[n_pt] = n_set
    return tuple((e[0], k.get(e[1], n_set)) for e in physique if e[0] in survenues and e[1] in k)


def forfait(vainqueur: int) -> Resultat:
    return Resultat(vainqueur=vainqueur, sets=(), abandon=True)
