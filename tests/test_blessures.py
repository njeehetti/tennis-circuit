import random

from tennis import blessures as bl
from tennis.donnees import charger_gabarits
from tennis.llm import FauxLLM
from tennis.match import Force, jouer_match
from tennis.saison import Saison


def test_risque_monte_avec_fatigue_age_et_antecedents():
    s = bl.Sante()
    frais = bl.risque_match(s, 2, 24, "Clay", False, 0.0)
    assert frais < 0.01
    assert bl.risque_match(s, 8, 24, "Clay", False, 0.0) > 3 * frais
    assert bl.risque_match(s, 2, 33, "Clay", False, 0.0) > frais
    assert bl.risque_match(bl.Sante(chroniques=("dos",)), 2, 24, "Clay", False, 0.0) > frais
    assert bl.risque_match(s, 2, 24, "Hard", True, 0.0) > frais
    assert bl.risque_match(s, 2, 24, "Clay", False, 0.3) <= frais


def test_zone_et_chronicite():
    epaule = bl.Sante(zone="épaule", gravite="modérée", semaines=2)
    ms, mr = bl.malus(epaule, 0)
    assert ms > mr                                      # l'épaule touche surtout le service
    ms, mr = bl.malus(bl.Sante(zone="cheville", gravite="modérée", semaines=2), 0)
    assert mr > ms
    chron = bl.Sante(chroniques=("dos",))
    assert bl.malus(chron, 3) == (0.0, 0.0)            # la zone chronique ne gêne que fatigué
    assert bl.malus(chron, 6)[0] > 0
    # une première blessure n'est jamais chronique ; elle entre dans les antécédents
    rng = random.Random(1)
    for _ in range(50):
        ev = bl.tirer(rng, bl.Sante(), "Hard")
        assert not ev.chronique and not ev.rechute
    s = bl.appliquer(bl.Sante(), bl.Evenement("genou", "légère", 2))
    assert s.antecedents == ("genou",) and s.semaines == 2


def test_guerison_plus_rapide_avec_soins_et_retour():
    s = bl.Sante(zone="dos", gravite="modérée", semaines=4)
    rng = random.Random(0)
    assert bl.fin_de_semaine(rng, s, False, 3)[0].semaines == 3
    s2, evt = bl.fin_de_semaine(rng, s, True, 3)
    assert s2.semaines == 2 and evt is None
    gueri, evt = bl.fin_de_semaine(rng, bl.replace(s, semaines=1), False, 3)
    assert evt == "gueri" and gueri.zone == "" and not bl.blesse(gueri)


def test_abandon_en_plein_match():
    f = Force(0.64, 0.36)
    res = jouer_match(f, f, random.Random(3), 0.36, 2, physique=((0, 30, 0.03, 0.01, True),))
    assert res.abandon and res.vainqueur == 1
    assert res.blessures == ((0, len(res.sets)),)
    assert sum(res.points_gagnes) == 30
    # sans abandon : le joueur continue, la blessure est enregistrée avec son set
    res = jouer_match(f, f, random.Random(3), 0.36, 2, physique=((1, 10, 0.05, 0.0, False),))
    assert not res.abandon and res.blessures == ((1, 1),)
    # une blessure prévue après la fin du match ne survient pas pendant le match
    res = jouer_match(f, f, random.Random(3), 0.36, 2, physique=((1, 10_000, 0.05, 0.0, True),))
    assert not res.abandon and res.blessures == ()


def test_saison_avec_blessures_coherente():
    g = charger_gabarits()
    vus, soins = set(), False
    for graine in (1, 2, 3, 4):
        r = Saison(g, FauxLLM(), graine=graine, social=True).jouer()
        for b in r["blessures"]:
            vus.add(b["type"])
            assert b["zone"] in bl.ZONES
            if b["abandon"]:
                m = next(m for m in r["matchs"] if m["semaine"] == b["semaine"] and m.get("abandon") == b["joueur"])
                assert m["score"].endswith("ab.") and m["perdant"] == b["joueur"]
        for j in r["joueurs"]:
            assert j["sante"]["blessure"] >= 0
        soins = soins or any(d["entrainement"] == "soins" for s in r["semaines"] for d in s["decisions"])
    assert "blessure" in vus and "gueri" in vus and soins


def test_mode_sobre_sans_blessures_detaillees():
    r = Saison(charger_gabarits(), FauxLLM(), graine=1, semaines=4).jouer()
    assert "blessures" not in r
    assert all(d["entrainement"] != "soins" for s in r["semaines"] for d in s["decisions"])


def test_style_tactique_et_hygiene_de_vie():
    s = bl.Sante()
    base = bl.risque_match(s, 5, 25, "Hard", False, 0.0)
    assert bl.risque_match(s, 5, 25, "Hard", False, 0.0, "serveur", "service_agressif") > base
    assert bl.risque_match(s, 6, 25, "Hard", False, 0.0, hygiene="acharné") > bl.risque_match(s, 6, 25, "Hard", False, 0.0)
    assert bl.risque_match(s, 2, 25, "Hard", False, 0.0, hygiene="acharné") < bl.risque_match(s, 2, 25, "Hard", False, 0.0)
    # un serveur agressif se blesse plus souvent à l'épaule qu'un relanceur
    epaules = {st: sum(bl.tirer(random.Random(i), s, "Clay", st, tac).zone == "épaule" for i in range(400))
               for st, tac in (("serveur", "service_agressif"), ("relanceur", "pression_retour"))}
    assert epaules["serveur"] > epaules["relanceur"]


def test_hygiene_identique_dans_une_paire():
    r = Saison(charger_gabarits(), FauxLLM(), graine=5, semaines=2, social=True).jouer()
    par_paire = {}
    for j in r["joueurs"]:
        par_paire.setdefault(j["paire"], set()).add(j["hygiene"])
    assert all(len(h) == 1 for h in par_paire.values())
