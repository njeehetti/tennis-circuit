import json
import threading
import urllib.request

from tennis.direct import _resume_appel, creer_serveur, etat
from tennis.donnees import charger_gabarits
from tennis.llm import FauxLLM
from tennis.saison import Saison


def _appel(role, reponse, ok=True, duree=5.0):
    return json.dumps({"role": role, "essai": 0, "ok": ok, "duree": duree, "erreur": "" if ok else "x",
                       "prompt": "p", "reponse": json.dumps(reponse) if isinstance(reponse, dict) else reponse})


def test_etat_sans_saison_et_ligne_tronquee(tmp_path):
    d = tmp_path / "s"
    d.mkdir()
    (d / "llm.jsonl").write_text(
        _appel("joueur", {"jouer": True, "entrainement": "repos", "raisonnement": "je souffle"}) + "\n"
        + _appel("entraineur", "pas du json", ok=False) + "\n"
        + '{"role": "jour', encoding="utf-8")          # ligne en cours d'écriture
    e = etat(d)
    assert e["appels"] == 2 and e["echecs"] == 1 and e["saison"] is None
    assert e["derniers"][0]["role"] == "entraineur"        # le plus récent d'abord
    assert e["derniers"][1]["champs"]["raisonnement"] == "je souffle"
    assert not e["termine"] and e["semaines_faites"] == 0


def test_etat_garde_la_derniere_saison_lisible(tmp_path):
    d = tmp_path / "s"
    d.mkdir()
    (d / "saison.json").write_text(json.dumps({"meta": {"semaines": 12}, "partiel": True,
                                               "semaine_atteinte": 3}), encoding="utf-8")
    cache = {}
    assert etat(d, cache)["semaines_faites"] == 3
    (d / "saison.json").write_text('{"meta": {"sem', encoding="utf-8")   # réécriture en cours
    assert etat(d, cache)["semaines_faites"] == 3
    (tmp_path / "s.log").write_text("semaine 3 : X\n  X : a bat b\nsemaine 4 : Y\n", encoding="utf-8")
    assert etat(d, cache)["en_cours"] == "semaine 4 : Y"


def test_resume_appel_robuste():
    assert _resume_appel({"role": "inconnu", "reponse": "[1]"})["champs"] == {}
    assert _resume_appel({"role": "sponsor", "reponse": None})["champs"] == {}
    r = _resume_appel(json.loads(_appel("sponsor", {"decision": "contre", "montant": 5, "autre": 1})))
    assert r["champs"] == {"decision": "contre", "montant": 5}


def test_serveur_sert_page_et_etat_d_une_vraie_saison(tmp_path):
    d = tmp_path / "s"
    d.mkdir()
    res = Saison(charger_gabarits(), FauxLLM(), graine=2, semaines=3).jouer()
    (d / "saison.json").write_text(json.dumps({**res, "partiel": False, "semaine_atteinte": 3}),
                                   encoding="utf-8")
    serveur = creer_serveur(d, 0)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{serveur.server_address[1]}"
    try:
        page = urllib.request.urlopen(base + "/").read().decode("utf-8")
        assert "Circuit en direct" in page and "textContent" in page
        e = json.loads(urllib.request.urlopen(base + "/etat").read())
        assert e["termine"] and len(e["saison"]["joueurs"]) == 16
        try:
            urllib.request.urlopen(base + "/../saison.json")
            assert False, "chemin arbitraire servi"
        except urllib.error.HTTPError as err:
            assert err.code == 404
    finally:
        serveur.shutdown()
        serveur.server_close()


def test_semaine_courante_depuis_la_derniere_sauvegarde(tmp_path):
    d = tmp_path / "s"
    d.mkdir()
    lignes = [json.loads(_appel("joueur", {"jouer": i % 2 == 0, "entrainement": "repos",
                                           "raisonnement": str(i)})) for i in range(5)]
    for i, l in enumerate(lignes):
        l["sujet"] = f"J0{i}"
    (d / "llm.jsonl").write_text("".join(json.dumps(l) + "\n" for l in lignes), encoding="utf-8")
    (d / "saison.json").write_text(json.dumps({"meta": {"semaines": 12, "llm": {"appels": 3}},
                                               "partiel": True, "semaine_atteinte": 1}), encoding="utf-8")
    e = etat(d)
    assert [a["sujet"] for a in e["semaine_courante"]] == ["J03", "J04"]
    assert e["dernier_appel_il_y_a_s"] is not None and e["dernier_appel_il_y_a_s"] < 60


def test_sauvegarde_finale_sans_champ_partiel_est_terminee(tmp_path):
    d = tmp_path / "s"
    d.mkdir()
    (d / "saison.json").write_text(json.dumps({"meta": {"semaines": 2}, "semaines": [{}, {}]}),
                                   encoding="utf-8")
    e = etat(d)
    assert e["termine"] and e["semaines_faites"] == 2 and e["semaine_courante"] == []


def test_scene_servie(tmp_path):
    serveur = creer_serveur(tmp_path, 0)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    try:
        js = urllib.request.urlopen(f"http://127.0.0.1:{serveur.server_address[1]}/scene.js").read()
        assert b"function rendreScene" in js
    finally:
        serveur.shutdown()
        serveur.server_close()

