import random

from tennis.match import Force, jouer_match, proba_point, P_MAX, P_MIN

R_MOY = 0.35


def test_proba_point_bornee():
    assert proba_point(0.99, 0.0, R_MOY) == P_MAX
    assert proba_point(0.1, 0.9, R_MOY) == P_MIN
    assert abs(proba_point(0.64, 0.35, R_MOY) - 0.64) < 1e-9


def test_score_valide():
    rng = random.Random(1)
    for _ in range(300):
        r = jouer_match(Force(0.64, 0.35), Force(0.63, 0.36), rng, R_MOY, sets_gagnants=2)
        sets_a = sum(1 for a, b in r.sets if a > b)
        sets_b = len(r.sets) - sets_a
        assert max(sets_a, sets_b) == 2 and min(sets_a, sets_b) <= 1
        assert (sets_a > sets_b) == (r.vainqueur == 0)
        for a, b in r.sets:
            haut, bas = max(a, b), min(a, b)
            assert (haut == 6 and bas <= 4) or (haut == 7 and bas in (5, 6))


def test_cinq_sets():
    r = jouer_match(Force(0.64, 0.35), Force(0.64, 0.35), random.Random(3), R_MOY, sets_gagnants=3)
    assert 3 <= len(r.sets) <= 5


def test_meilleur_joueur_gagne_plus_souvent():
    rng = random.Random(7)
    victoires = sum(jouer_match(Force(0.68, 0.40), Force(0.61, 0.33), rng, R_MOY).vainqueur == 0
                    for _ in range(400))
    assert victoires > 300


def test_reproductible_avec_graine():
    r1 = jouer_match(Force(0.64, 0.35), Force(0.63, 0.36), random.Random(42), R_MOY)
    r2 = jouer_match(Force(0.64, 0.35), Force(0.63, 0.36), random.Random(42), R_MOY)
    assert r1 == r2


def test_trace_coherente():
    r = jouer_match(Force(0.64, 0.35), Force(0.63, 0.36), random.Random(5), R_MOY)
    assert r.points.count("a") == r.points_gagnes[0]
    assert r.points.count("b") == r.points_gagnes[1]
    assert r.points.count("/") == len(r.sets)
