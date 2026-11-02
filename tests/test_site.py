import importlib.util
import json

import pytest

from tennis.donnees import RACINE, charger_gabarits
from tennis.llm import FauxLLM
from tennis.saison import Saison

_spec = importlib.util.spec_from_file_location("exporter_site", RACINE / "outils" / "exporter_site.py")
site = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(site)


def test_page_statique_lit_etat_json():
    html = (RACINE / "tennis" / "village3d.html").read_text(encoding="utf-8")
    p = site.page_statique(html)
    assert p.count('<meta name="etat" content="etat.json">') == 1
    assert site.page_statique(p) == p                       # idempotent
    assert 'src="./village3d.js"' in p                      # chemins relatifs (sous-dossier GitHub Pages)


def test_modules_importes_en_relatif():
    for f in (RACINE / "tennis").glob("village3d*.js"):
        assert 'from "/village3d' not in f.read_text(encoding="utf-8"), f.name


def test_export_d_une_saison_terminee(tmp_path):
    d = tmp_path / "runs" / "s"
    d.mkdir(parents=True)
    res = Saison(charger_gabarits(), FauxLLM(), graine=3, semaines=2, social=True).jouer()
    (d / "saison.json").write_text(json.dumps(res), encoding="utf-8")
    sortie = tmp_path / "site"
    site.exporter(d, sortie)
    noms = {f.name for f in sortie.iterdir()}
    assert {"index.html", "etat.json", ".nojekyll", "village3d.js", "village3d_jour.js"} <= noms
    e = json.loads((sortie / "etat.json").read_text(encoding="utf-8"))
    assert e["statique"] and e["termine"] and len(e["saison"]["joueurs"]) == 16


def test_refuse_une_saison_en_cours(tmp_path):
    d = tmp_path / "s"
    d.mkdir()
    (d / "saison.json").write_text(json.dumps({"meta": {"semaines": 12}, "partiel": True, "semaine_atteinte": 1,
                                               "joueurs": [], "semaines": [{}]}), encoding="utf-8")
    with pytest.raises(SystemExit):
        site.exporter(d, tmp_path / "site")


def test_reechantillonnage_video():
    pytest.importorskip("PIL")
    spec = importlib.util.spec_from_file_location("assembler_video", RACINE / "outils" / "assembler_video.py")
    av = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(av)
    # images reçues à 0 ; 0,25 ; 1 s : à 4 images/s on montre 0,1,1,1,2
    assert av.instants([0.0, 0.25, 1.0], 4) == [0, 1, 1, 1, 2]
    assert av.instants([], 10) == []
