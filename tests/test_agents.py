import random

from tennis.agents import booleen, choisir, decision_baseline, decision_joueur, negociation
from tennis.joueurs import ENTRAINEMENTS, TACTIQUES, Etat, creer_joueurs
from tennis.llm import FauxLLM
from tennis.tournoi import CALENDRIER, tableau
from tests.test_joueurs import gab


class LLMFixe:
    def __init__(self, rep):
        self.rep = rep

    def json(self, *a, **k):
        return self.rep


def test_choisir_rapproche_les_options():
    assert choisir("Service agressif", TACTIQUES, "equilibre") == ("service_agressif", True)
    assert choisir("équilibré", TACTIQUES, "x")[0] == "equilibre"
    assert choisir("physical", ENTRAINEMENTS, "repos")[0] == "physique"
    assert choisir("n'importe quoi", ENTRAINEMENTS, "repos") == ("repos", False)


def test_booleen():
    assert booleen("oui", False) and not booleen("Non", True) and booleen(None, True)


def test_baseline_ne_joue_pas_blesse_ni_epuise():
    t = CALENDRIER[0]
    assert decision_baseline(Etat(), t, 1).jouer
    assert not decision_baseline(Etat(blessure=1), t, 1).jouer
    assert not decision_baseline(Etat(fatigue=8), t, 1).jouer
    assert not decision_baseline(Etat(), None, 4).jouer


def test_decision_joueur_repli_si_llm_echoue():
    j = creer_joueurs([gab()] * 20, random.Random(1))[0]
    d = decision_joueur(LLMFixe(None), j, Etat(), 1, CALENDRIER[0], [], "", "", 5)
    assert d.repli and d.jouer


def test_decision_joueur_sans_tournoi_ne_joue_pas():
    j = creer_joueurs([gab()] * 20, random.Random(1))[0]
    llm = LLMFixe({"jouer": True, "entrainement": "retour", "raisonnement": "ok"})
    d = decision_joueur(llm, j, Etat(), 4, None, [], "", "", 5)
    assert not d.jouer and d.entrainement == "retour" and not d.repli


def test_tableau_tetes_de_serie_opposees():
    places = tableau([f"P{i}" for i in range(1, 11)])
    assert places[0] == "P1" and places[15] == "P2"
    assert places.count(None) == 6 and len(places) == 16


def test_negociation_plafonnee_au_budget():
    j = creer_joueurs([gab()] * 20, random.Random(1))[0]
    llm = LLMFixe({"montant": 10**9, "argument": "x", "decision": "accepter", "message": "ok"})
    r = negociation(llm, j, Etat(), 1, 2, ("S", "p", 300000))
    assert r["contrat"] == 300000


def test_faux_llm_repond_aux_cles():
    rep = FauxLLM().json("joueur", "", "fatigue : 2/10", ("jouer",))
    assert set(rep) >= {"jouer", "entrainement", "raisonnement"}


def test_entier_sur_rejette_les_valeurs_aberrantes():
    from tennis.agents import entier_sur
    assert entier_sur(1e999, 7) == 7 and entier_sur(float("nan"), 7) == 7
    assert entier_sur("12.9", 0) == 12 and entier_sur([1], 3) == 3 and entier_sur(None, 4) == 4


def test_negociation_survit_a_un_montant_infini():
    j = creer_joueurs([gab()] * 20, random.Random(1))[0]
    r = negociation(LLMFixe({"montant": float("inf"), "argument": "x", "decision": "accepter"}),
                    j, Etat(), 1, 0, ("S", "p", 300000))
    assert r["contrat"] is None


def test_contrat_au_montant_du_sponsor_si_inferieur():
    j = creer_joueurs([gab()] * 20, random.Random(1))[0]

    class Alterne:
        def json(self, role, *a, **k):
            if role == "agent":
                return {"montant": 250000, "argument": "x"}
            return {"decision": "accepter", "montant": 180000, "message": "ok"}
    assert negociation(Alterne(), j, Etat(), 1, 0, ("S", "p", 300000))["contrat"] == 180000


class Capture:
    def __init__(self, rep):
        self.rep, self.prompts = rep, []

    def json(self, role, systeme, prompt, cles):
        self.prompts.append(prompt)
        return self.rep


def test_prompts_v2_levent_l_ambiguite_du_physique():
    from tennis.agents import conseil_entraineur
    js = creer_joueurs([gab(0.6 + i / 1000, 0.33) for i in range(80)], random.Random(1))
    llm = Capture({"jouer": True, "entrainement": "repos", "raisonnement": "x",
                   "tactique": "equilibre", "conseil": "x"})
    decision_joueur(llm, js[0], Etat(), 1, CALENDRIER[0], [], "", "", 5, version=2)
    assert "SEUL choix qui fait récupérer" in llm.prompts[-1]
    decision_joueur(llm, js[0], Etat(), 1, CALENDRIER[0], [], "", "", 5, version=1)
    assert "réduit durablement" in llm.prompts[-1]
    conseil_entraineur(llm, "C", "p", js[0], Etat(), CALENDRIER[0], js[1:5], version=2)
    assert "4 ont un retour sous la moyenne" in llm.prompts[-1]
