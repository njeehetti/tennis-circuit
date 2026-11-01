import json

from tennis.dashboard import generer
from tennis.llm import FauxLLM
from tennis.saison import Saison
from tennis.donnees import charger_gabarits


def test_tableau_de_bord_autonome(tmp_path):
    res = Saison(charger_gabarits(), FauxLLM(), graine=4, semaines=6).jouer()
    res["meta"].update({"modele": "faux", "duree_s": 0})
    res["articles"][0]["article"] = "texte avec </script> dedans"
    (tmp_path / "saison.json").write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    html = generer(tmp_path).read_text(encoding="utf-8")
    assert "__DONNEES__" not in html
    assert html.count("</script>") == 1          # le texte injecté est échappé
    assert "http://" not in html and "https://" not in html   # aucune ressource externe
