import json
import threading
import urllib.error
import urllib.request

import pytest

from tennis import interview
from tennis.direct import creer_serveur
from tennis.donnees import charger_gabarits
from tennis.llm import FauxLLM
from tennis.saison import Saison


@pytest.fixture(scope="module")
def saison():
    r = Saison(charger_gabarits(), FauxLLM(), graine=3, semaines=4, social=True).jouer()
    return {**r, "partiel": False, "semaine_atteinte": 4}


def test_validation(saison):
    j = saison["joueurs"][0]["id"]
    with pytest.raises(interview.ErreurInterview):
        interview.valider({"joueur": "X99", "semaine": 1, "jour": 1, "question": "Ça va ?"}, saison)
    with pytest.raises(interview.ErreurInterview):
        interview.valider({"joueur": j, "semaine": 9, "jour": 1, "question": "Ça va ?"}, saison)
    with pytest.raises(interview.ErreurInterview):
        interview.valider({"joueur": j, "semaine": 1, "jour": 1, "question": "  "}, saison)
    _, _, _, q = interview.valider({"joueur": j, "semaine": 1, "jour": 1, "question": "x" * 1000}, saison)
    assert len(q) == interview.QUESTION_MAX


def test_contexte_sans_le_futur(saison):
    # un joueur qui a joué en semaine 2 : au lundi de la semaine 2, il ne connaît pas encore ses matchs
    m = next(m for m in saison["matchs"] if m["semaine"] == 2 and m["tour"] == "F")
    j = next(x for x in saison["joueurs"] if x["id"] == m["vainqueur"])
    avant = interview.contexte(saison, j, 2, 1)
    apres = interview.contexte(saison, j, 2, 7)
    trace = f"Semaine 2, {m['tournoi']}, finale"
    assert trace not in avant and trace in apres


def test_post_interview_par_le_serveur(tmp_path, saison):
    (tmp_path / "saison.json").write_text(json.dumps(saison), encoding="utf-8")
    serveur = creer_serveur(tmp_path, 0, FauxLLM())
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{serveur.server_address[1]}"

    def poster(corps: bytes):
        req = urllib.request.Request(base + "/interview", data=corps, method="POST",
                                     headers={"Content-Type": "application/json"})
        return urllib.request.urlopen(req)

    try:
        jid = saison["joueurs"][0]["id"]
        r = json.loads(poster(json.dumps({"joueur": jid, "semaine": 2, "jour": 3,
                                          "question": "Comment abordez-vous ce tournoi ?"}).encode()).read())
        assert r["reponse"] and r["joueur"] == jid
        assert (tmp_path / "interviews.jsonl").exists()
        lues = json.loads(urllib.request.urlopen(f"{base}/interviews?joueur={jid}").read())
        assert lues[-1]["question"] == "Comment abordez-vous ce tournoi ?"
        for corps, code in ((b"{pas du json", 400), (json.dumps({"joueur": "X"}).encode(), 400),
                            (b"x" * 5000, 413)):
            with pytest.raises(urllib.error.HTTPError) as e:
                poster(corps)
            assert e.value.code == code
    finally:
        serveur.shutdown()
        serveur.server_close()
