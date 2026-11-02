import random

from tennis import social
from tennis.donnees import charger_gabarits
from tennis.llm import FauxLLM
from tennis.match import Force, jouer_match
from tennis.saison import JOURS_TOUR, Saison


def test_effet_mental_et_public_borne():
    haut = social.Social(moral=100)
    bas = social.Social(moral=0)
    assert social.ajustement(haut, 10, 0, 1.0) == social.EFFET_MAX
    assert social.ajustement(bas, 0, 10, -1.0) == -social.EFFET_MAX
    assert social.ajustement(social.Social(moral=50), 0, 0, 0.0) == 0


def test_soutien_public_symetrique_et_aime_les_populaires():
    s = social.soutien_public(80, 40, 3, 4)
    assert s > 0.5 and abs(s + social.soutien_public(40, 80, 4, 3)) < 1e-9
    # à popularité égale, un net outsider est un peu soutenu
    assert social.soutien_public(50, 50, 12, 2) > 0


def test_moral_rendements_decroissants_et_sanctions_couteuses():
    s = social.Social(moral=90)
    gain_haut = social.apres_match(s, "calme", True, 5, 5, []).moral - 90
    gain_bas = social.apres_match(social.Social(moral=30), "calme", True, 5, 5, []).moral - 30
    assert 0 < gain_haut < gain_bas
    puni = social.apres_match(social.Social(), "impulsif", True, 5, 5, ["avertissement", "point"])
    excuse = social.apres_match(social.Social(), "impulsif", True, 5, 5, ["avertissement", "point"], True)
    assert puni.reputation < 50 and puni.popularite < excuse.popularite
    assert puni.avertissements == 1 and puni.penalites == 1


def test_temperament_change_la_frequence_des_incidents():
    s = social.Social()
    assert (social.proba_incident("impulsif et charismatique", s, 2, False, False)
            > 3 * social.proba_incident("calme et méthodique", s, 2, False, False))


def test_point_de_penalite_attribue_a_l_adversaire():
    rng = random.Random(4)

    def arbitre(n, jeux, sets):
        return [(0, "avertissement"), (0, "point")] if n == 1 else []

    r = jouer_match(Force(0.65, 0.35), Force(0.65, 0.35), rng, 0.352, 2, arbitre, 0.01)
    assert [(j, n) for j, n, _ in r.sanctions] == [(0, "avertissement"), (0, "point")]
    deuxieme_set = r.points.split("/")[1]
    assert deuxieme_set[0] == "b"                       # premier point du set 2 offert à B


def test_saison_sociale_complete_et_credible():
    matchs, avert = 0, 0
    for g in (1, 2, 3, 4):
        r = Saison(charger_gabarits(), FauxLLM(), graine=g, semaines=12, social=True).jouer()
        matchs += len(r["matchs"])
        avert += sum(1 for i in r["incidents"] if i["sanction"] == "avertissement")
        assert r["meta"]["social"] and len(r["social"]) == 13          # semaine 0 + 12
        assert all("social" in j and "relations" in j for j in r["joueurs"])
        for m in r["matchs"]:
            assert m["jour"] in JOURS_TOUR[m["tour"]] and "soutien" in m and "moral_apres" in m
        for v in r["vestiaires"]:
            assert v["ton"] in ("respect", "neutre", "tension") and v["jour"] in range(1, 8)
        for f in r["federation"]:
            assert f["decision"] in ("aucune", "rappel", "amende") and 0 <= f["montant"] <= 20000
    assert 0.02 < avert / matchs < 0.15                                 # environ 1 match sur 10


def test_mode_sobre_inchange():
    a = Saison(charger_gabarits(), FauxLLM(), graine=5, semaines=6).jouer()
    assert not a["meta"]["social"] and "incidents" not in a and "social" not in a["joueurs"][0]
    b = Saison(charger_gabarits(), FauxLLM(), graine=5, semaines=6).jouer()
    assert [m["score"] for m in a["matchs"]] == [m["score"] for m in b["matchs"]]
