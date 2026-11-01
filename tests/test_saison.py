import json

from tennis.donnees import charger_gabarits
from tennis.llm import FauxLLM
from tennis.saison import Saison


def saison(**k):
    return Saison(charger_gabarits(), FauxLLM(), graine=3, semaines=12, **k).jouer()


def test_saison_complete_avec_faux_llm():
    r = saison()
    assert len(r["semaines"]) == 12 and len(r["articles"]) == 9 and len(r["finales"]) == 9
    assert len(r["joueurs"]) == 16
    json.dumps(r, ensure_ascii=False)                       # sérialisable
    total_titres = sum(j["titres"] for j in r["joueurs"])
    assert total_titres == 9
    for f in r["finales"]:
        assert f["vainqueur"] in (f["a"], f["b"]) and f["points"]


def test_points_coherents_avec_les_matchs():
    r = saison()
    for j in r["joueurs"]:
        assert j["points"] >= j["points_depart"]
        assert j["victoires"] <= j["matchs"]
    assert len(r["experience"]["paires"]) == 8


def test_controle_tous_baseline_sans_llm():
    llm = FauxLLM()
    r = Saison(charger_gabarits(), llm, graine=3, semaines=12, controle=True).jouer()
    roles = llm.stats["appels"]
    # en contrôle, seuls journaliste, conférence et négociations appellent le LLM
    assert roles <= 9 * 2 + 2 * 3 * 6
    assert all(d["pilote"] == "baseline" for s in r["semaines"] for d in s["decisions"])


def test_reproductible_en_controle():
    a = Saison(charger_gabarits(), FauxLLM(), graine=5, controle=True).jouer()
    b = Saison(charger_gabarits(), FauxLLM(), graine=5, controle=True).jouer()
    assert a["experience"] == b["experience"]


def test_aucun_nom_reel_dans_les_joueurs():
    r = saison()
    for j in r["joueurs"]:
        prenom, nom = j["nom"].split(" ")
        assert prenom and nom
