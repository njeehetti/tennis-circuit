"""Exporte une saison terminée en site statique (GitHub Pages, ou tout hébergeur de fichiers).

Exemples :
  python outils/exporter_site.py --nom saison_v3_g1          # écrit site/
  python outils/exporter_site.py --nom demo_blessures_faux --sortie $TEMP/site

Le site contient le village 3D, ses modules et `etat.json` (l'état que le serveur local
renverrait sur /etat). La page lit ce fichier une fois : pas de serveur, pas d'interviews
(elles demandent le LLM local). Rien n'est publié : le dossier est seulement écrit.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tennis.direct import MODULES_3D, etat  # noqa: E402
from tennis.donnees import RACINE  # noqa: E402

TENNIS = RACINE / "tennis"
META = '<meta name="etat" content="etat.json">'


def page_statique(html: str) -> str:
    """La page du serveur, avec la source des données pointant vers etat.json."""
    if META in html:
        return html
    ancre = '<meta charset="utf-8">'
    if ancre not in html:
        raise ValueError("village3d.html : balise <meta charset> introuvable")
    return html.replace(ancre, ancre + "\n" + META, 1)


def exporter(dossier: Path, sortie: Path) -> dict:
    e = etat(dossier)
    if not e.get("saison"):
        raise SystemExit(f"{dossier} : pas de saison.json lisible")
    if not e.get("termine"):
        raise SystemExit(f"{dossier} : la saison n'est pas terminée, attends la fin")
    # le site montre une saison finie : pas de journal d'appels en cours
    e = {**e, "derniers": [], "semaine_courante": [], "dernier_appel_il_y_a_s": None, "statique": True}
    sortie.mkdir(parents=True, exist_ok=True)
    (sortie / "index.html").write_text(
        page_statique((TENNIS / "village3d.html").read_text(encoding="utf-8")), encoding="utf-8")
    for m in MODULES_3D:
        (sortie / m[1:]).write_bytes((TENNIS / m[1:]).read_bytes())
    (sortie / "etat.json").write_text(json.dumps(e, ensure_ascii=False, separators=(",", ":")),
                                      encoding="utf-8")
    (sortie / ".nojekyll").write_text("", encoding="utf-8")   # GitHub Pages : servir tel quel
    return {"fichiers": len(MODULES_3D) + 3, "etat_ko": round((sortie / "etat.json").stat().st_size / 1024)}


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="Exporte une saison en site statique.")
    p.add_argument("--nom", required=True, help="dossier dans runs/")
    p.add_argument("--sortie", default=str(RACINE / "site"))
    a = p.parse_args(argv)
    dossier = RACINE / "runs" / a.nom
    if not dossier.is_dir():
        raise SystemExit(f"Saison introuvable : {dossier}")
    r = exporter(dossier, Path(a.sortie))
    print(f"Site écrit dans {a.sortie} : {r['fichiers']} fichiers, etat.json {r['etat_ko']} Ko")


if __name__ == "__main__":
    main()
