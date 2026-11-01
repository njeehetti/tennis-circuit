"""Répète des saisons sur plusieurs graines et agrège l'écart LLM - baseline.

Exemples :
  python outils/experience.py --graines 1-30 --controle   # bruit de mesure (rapide)
  python outils/experience.py --graines 1-5               # vraie expérience (lent : LLM)
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tennis.donnees import RACINE, charger_gabarits  # noqa: E402
from tennis.llm import ClientOllama, FauxLLM  # noqa: E402
from tennis.saison import Saison  # noqa: E402


def plage(txt: str) -> list:
    debut, _, fin = txt.partition("-")
    return list(range(int(debut), int(fin or debut) + 1))


# quantiles 97,5 % de la loi de Student (ddl -> t)
T975 = ((1, 12.706), (2, 4.303), (3, 3.182), (4, 2.776), (5, 2.571), (6, 2.447), (7, 2.365),
        (8, 2.306), (9, 2.262), (10, 2.228), (12, 2.179), (15, 2.131), (20, 2.086), (30, 2.042),
        (60, 2.000), (120, 1.980))


def student_975(ddl: int) -> float:
    """Quantile de Student (valeur tabulée au ddl inférieur le plus proche : prudent)."""
    t = 1.96
    for d, v in reversed(T975):
        if ddl >= d:
            return v
        t = v
    return t


def resume(ecarts: list) -> dict:
    n = len(ecarts)
    moy = statistics.mean(ecarts)
    if n < 2:
        return {"n": n, "moyenne": round(moy, 1), "ecart_type": None, "ic95": None}
    et = statistics.stdev(ecarts)
    demi = student_975(n - 1) * et / math.sqrt(n)
    return {"n": n, "moyenne": round(moy, 1), "ecart_type": round(et, 1),
            "ic95": [round(moy - demi, 1), round(moy + demi, 1)]}


def main(argv=None) -> dict:
    p = argparse.ArgumentParser()
    p.add_argument("--graines", default="1-10")
    p.add_argument("--semaines", type=int, default=12)
    p.add_argument("--controle", action="store_true")
    p.add_argument("--faux", action="store_true")
    p.add_argument("--modele", default="qwen3:8b")
    p.add_argument("--garder", action="store_true", help="garder le JSON complet de chaque saison")
    a = p.parse_args(argv)
    mode = "controle" if a.controle else ("faux" if a.faux else a.modele)
    dossier = RACINE / "runs" / f"experience_{mode.replace(':', '-')}_{time.strftime('%Y%m%d_%H%M')}"
    dossier.mkdir(parents=True, exist_ok=True)
    gabarits = charger_gabarits()
    par_saison, par_paire = [], []
    for g in plage(a.graines):
        llm = FauxLLM() if (a.faux or a.controle) else ClientOllama(a.modele, journal=dossier / f"llm_g{g}.jsonl")
        res = Saison(gabarits, llm, graine=g, semaines=a.semaines, controle=a.controle).jouer()
        exp = res["experience"]
        if a.garder:
            (dossier / f"saison_g{g}.json").write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
        else:
            (dossier / f"experience_g{g}.json").write_text(json.dumps(exp, ensure_ascii=False), encoding="utf-8")
        par_saison.append(exp["ecart_moyen"])
        par_paire += [x["ecart"] for x in exp["paires"]]
        print(f"graine {g} : écart moyen {exp['ecart_moyen']:+.0f}", flush=True)
    bilan = {"mode": mode, "semaines": a.semaines, "graines": a.graines,
             "par_saison": resume(par_saison),
             "par_paire": {**resume(par_paire),
                           "note": "indicatif : les paires d'une même saison ne sont pas indépendantes"}}
    (dossier / "bilan.json").write_text(json.dumps(bilan, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(bilan, ensure_ascii=False, indent=1))
    return bilan


if __name__ == "__main__":
    main()
