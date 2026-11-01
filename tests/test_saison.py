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


def test_tournoi_a_un_seul_inscrit_annule():
    from tennis.tournoi import CALENDRIER
    s = Saison(charger_gabarits(), FauxLLM(), graine=3)
    seul = s.joueurs[0].id
    assert s._tournoi(1, CALENDRIER[0], [seul], {}) == {}
    assert s.titres[seul] == 0 and s.etats[seul].points == s.points_depart[seul]
    assert s.journal["annulations"][0]["inscrits"] == [seul]


def test_meme_match_memes_tirages():
    """Le générateur par match ne dépend pas des décisions des autres joueurs."""
    from tennis.tournoi import CALENDRIER
    s1 = Saison(charger_gabarits(), FauxLLM(), graine=3)
    s2 = Saison(charger_gabarits(), FauxLLM(), graine=3)
    a, b = s1.joueurs[0].id, s1.joueurs[5].id
    s2.rng.random()                                       # flux global décalé
    assert s1._match(1, CALENDRIER[0], "R16", a, b, {}) == s2._match(1, CALENDRIER[0], "R16", a, b, {})


def test_sauvegarde_a_chaque_semaine():
    vues = []
    Saison(charger_gabarits(), FauxLLM(), graine=3, semaines=4).jouer(apres_semaine=vues.append)
    assert [v["semaine_atteinte"] for v in vues] == [1, 2, 3, 4]
    assert vues[0]["partiel"] and not vues[-1]["partiel"]
    assert len(vues[1]["semaines"]) == 2
