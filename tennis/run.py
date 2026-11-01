"""Lance une saison : python -m tennis.run --semaines 12 --graine 1 [--faux]"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from .donnees import RACINE, charger_gabarits
from .llm import ClientOllama, FauxLLM
from .saison import Saison


def main(argv=None) -> Path:
    p = argparse.ArgumentParser(description="Simule une saison du circuit fictif.")
    p.add_argument("--semaines", type=int, default=12)
    p.add_argument("--graine", type=int, default=1)
    p.add_argument("--nom", default=None)
    p.add_argument("--modele", default="qwen3:8b")
    p.add_argument("--faux", action="store_true", help="faux LLM déterministe (sans Ollama)")
    p.add_argument("--controle", action="store_true", help="tous les joueurs en baseline (mesure du bruit)")
    p.add_argument("--prompts", type=int, default=2, choices=(1, 2), help="version des prompts")
    p.add_argument("--sans-tableau", action="store_true", help="ne pas générer le tableau de bord")
    a = p.parse_args(argv)
    nom = a.nom or f"saison_g{a.graine}_{time.strftime('%Y%m%d_%H%M')}"
    dossier = RACINE / "runs" / nom
    dossier.mkdir(parents=True, exist_ok=True)
    llm = FauxLLM() if a.faux else ClientOllama(a.modele, journal=dossier / "llm.jsonl")
    debut = time.time()
    saison = Saison(charger_gabarits(), llm, graine=a.graine, semaines=a.semaines,
                    controle=a.controle, progres=lambda m: print(m, flush=True),
                    version_prompts=a.prompts)
    res = saison.jouer()
    res["meta"].update({"modele": "faux" if a.faux else a.modele, "nom": nom,
                        "duree_s": round(time.time() - debut, 1)})
    sortie = dossier / "saison.json"
    sortie.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    exp = res["experience"]
    print(f"Saison écrite dans {sortie}")
    print(f"Appels LLM : {res['meta']['llm']['appels']}, échecs : {res['meta']['llm']['echecs']}, "
          f"durée : {res['meta']['duree_s']} s")
    print(f"Écart moyen LLM - baseline : {exp['ecart_moyen']:+.0f} points (écart-type {exp['ecart_type']:.0f})")
    if not a.sans_tableau:
        from .dashboard import generer
        print(f"Tableau de bord : {generer(dossier)}")
    return dossier


if __name__ == "__main__":
    main()
