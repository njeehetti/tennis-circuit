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
