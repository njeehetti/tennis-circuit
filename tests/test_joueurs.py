import random

from tennis.joueurs import (Etat, apres_match, creer_joueurs, fin_de_semaine,
                            force_effective, points_initiaux)
from tennis.memoire import Souvenir, ajouter, recuperer


def gab(s=0.65, r=0.36):
    surf = {k: {"service": s, "retour": r} for k in ("Hard", "Clay", "Grass")}
    return {"service": s, "retour": r, "surfaces": surf, "matchs": 50}


def test_paires_de_jumeaux():
    js = creer_joueurs([gab(0.6 + i / 1000) for i in range(80)], random.Random(1))
    assert len(js) == 16 and len({j.nom for j in js}) == 16
    for k in range(8):
        paire = [j for j in js if j.paire == k]
        assert sorted(j.pilote for j in paire) == ["baseline", "llm"]
        assert paire[0].profil == paire[1].profil
        assert points_initiaux(paire[0]) == points_initiaux(paire[1])


def test_fatigue_et_blessure_penalisent():
    j = creer_joueurs([gab()] * 20, random.Random(2))[0]
    frais = force_effective(j, Etat(), "Hard", "equilibre", j)
    las = force_effective(j, Etat(fatigue=8, blessure=1), "Hard", "equilibre", j)
    assert las.service < frais.service and las.retour < frais.retour


def test_tactique_contre_faiblesse():
    j = creer_joueurs([gab()] * 20, random.Random(2))[0]
    adv = creer_joueurs([gab(0.65, 0.30)] * 20, random.Random(3))[0]
    agressif = force_effective(j, Etat(), "Hard", "service_agressif", adv)
    neutre = force_effective(j, Etat(), "Hard", "equilibre", adv)
    assert agressif.service > neutre.service + 0.015


def test_etat_immuable_et_recuperation():
    e = Etat(fatigue=5)
    e2, _ = apres_match(e, True, False, "equilibre", random.Random(0))
    assert e.fatigue == 5 and e2.fatigue > 5 and e2.victoires == 1
    repos = fin_de_semaine(e2, a_joue=False, entrainement="repos", resultat_tour=None)
    assert repos.fatigue < e2.fatigue - 3


def test_entrainement_plafonne():
    e = Etat()
    for _ in range(30):
        e = fin_de_semaine(e, False, "service", None)
    assert abs(e.bonus_service - 0.02) < 1e-9


def test_memoire_recupere_important_et_recent():
    m = ()
    m = ajouter(m, Souvenir(1, "vieux détail", 1))
    m = ajouter(m, Souvenir(1, "titre au Majeur", 10))
    m = ajouter(m, Souvenir(9, "entraînement banal", 2))
    textes = [s.texte for s in recuperer(m, 10, k=2)]
    assert "titre au Majeur" in textes and "vieux détail" not in textes


class _RngZero(random.Random):
    def random(self):
        return 0.0


def test_blessure_dure_au_moins_une_semaine_visible():
    e, nouvelle = apres_match(Etat(fatigue=10), False, False, "equilibre", _RngZero(1))
    assert nouvelle
    apres = fin_de_semaine(e, True, "service", "R16")
    assert apres.blessure >= 1
