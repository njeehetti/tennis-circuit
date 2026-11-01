"""Calibration des profils de joueurs sur le Match Charting Project.

Source : JeffSackmann/tennis_MatchChartingProject (CC BY-NC-SA 4.0).
On calcule, pour chaque joueur réel ayant assez de matchs, le taux de points
gagnés au service et en retour, global et par surface. Les noms sont jetés :
seuls des « gabarits » anonymes sortent de ce module.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
BRUT = RACINE / "data" / "raw"
GABARITS = RACINE / "data" / "gabarits.json"
SURFACES = ("Hard", "Clay", "Grass")
# Retrait vers la moyenne globale du joueur pour les surfaces peu jouées.
PRIOR_POINTS = 400


def _surface_par_match(chemin: Path) -> dict[str, str]:
    surfaces = {}
    with open(chemin, encoding="utf-8", errors="replace", newline="") as f:
        for ligne in csv.DictReader(f):
            surf = (ligne.get("Surface") or "").strip()
            if surf.startswith("Hard") or surf == "Carpet":
                surf = "Hard"
            surfaces[ligne["match_id"]] = surf if surf in SURFACES else "Hard"
    return surfaces


def _entier(val: str) -> int:
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return 0


def agreger(overview: Path, matches: Path) -> dict[str, dict]:
    """Totaux par joueur et par surface (service et retour)."""
    surfaces = _surface_par_match(matches)
    tot = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0]))
    nb_matchs = defaultdict(set)
    with open(overview, encoding="utf-8", errors="replace", newline="") as f:
        for ligne in csv.DictReader(f):
            if ligne.get("set") != "Total":
                continue
            sv = _entier(ligne["serve_pts"])
            svw = _entier(ligne["first_won"]) + _entier(ligne["second_won"])
            rt = _entier(ligne["return_pts"])
            rtw = _entier(ligne["return_pts_won"])
            if sv <= 0 or rt <= 0 or svw > sv or rtw > rt:
                continue
            joueur = ligne["player"]
            surf = surfaces.get(ligne["match_id"], "Hard")
            for cle in (surf, "Total"):
                t = tot[joueur][cle]
                t[0] += sv
                t[1] += svw
                t[2] += rt
                t[3] += rtw
            nb_matchs[joueur].add(ligne["match_id"])
    return {j: {"matchs": len(nb_matchs[j]), "totaux": dict(v)} for j, v in tot.items()}


def construire_gabarits(agreges: dict[str, dict], min_matchs: int = 25) -> list[dict]:
    """Transforme les totaux en gabarits anonymes, triés par force."""
    gabarits = []
    for info in agreges.values():
        if info["matchs"] < min_matchs:
            continue
        sv, svw, rt, rtw = info["totaux"]["Total"]
        s_glob, r_glob = svw / sv, rtw / rt
        par_surface = {}
        for surf in SURFACES:
            s_sv, s_svw, s_rt, s_rtw = info["totaux"].get(surf, [0, 0, 0, 0])
            par_surface[surf] = {
                "service": round((s_svw + PRIOR_POINTS * s_glob) / (s_sv + PRIOR_POINTS), 4),
                "retour": round((s_rtw + PRIOR_POINTS * r_glob) / (s_rt + PRIOR_POINTS), 4),
            }
        gabarits.append({
            "service": round(s_glob, 4),
            "retour": round(r_glob, 4),
            "surfaces": par_surface,
            "matchs": info["matchs"],
        })
    gabarits.sort(key=lambda g: g["service"] + g["retour"], reverse=True)
    return gabarits


def charger_gabarits() -> list[dict]:
    """Lit le cache, ou le reconstruit depuis les CSV bruts."""
    if GABARITS.exists():
        return json.loads(GABARITS.read_text(encoding="utf-8"))
    agreges = agreger(BRUT / "charting-m-stats-Overview.csv", BRUT / "charting-m-matches.csv")
    gabarits = construire_gabarits(agreges)
    GABARITS.write_text(json.dumps(gabarits, indent=1), encoding="utf-8")
    return gabarits


def moyennes(gabarits: list[dict]) -> tuple[float, float]:
    n = len(gabarits)
    return (sum(g["service"] for g in gabarits) / n, sum(g["retour"] for g in gabarits) / n)


if __name__ == "__main__":
    g = charger_gabarits()
    s, r = moyennes(g)
    print(f"{len(g)} gabarits ; service moyen {s:.3f}, retour moyen {r:.3f}")
    print("meilleur :", g[0])
    print("dernier :", g[-1])
