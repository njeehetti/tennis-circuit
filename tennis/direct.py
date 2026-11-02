"""Suivi en direct d'une saison en cours (lecture seule, aucune dépendance).

python -m tennis.direct [--nom saison_v2_g1] [--port 8765]
puis ouvrir http://127.0.0.1:8765

Le serveur ne fait que lire les fichiers que la simulation écrit déjà :
`runs/<nom>/saison.json` (réécrit à chaque fin de semaine), `runs/<nom>/llm.jsonl`
(une ligne par appel au LLM, en temps réel) et, s'il existe, `runs/<nom>.log`.
Il ne touche jamais à la simulation : on peut l'ouvrir, le fermer, le relancer.
Seule écriture : les interviews posées depuis le village 3D, ajoutées à
`runs/<nom>/interviews.jsonl` (voir tennis/interview.py).
"""
from __future__ import annotations

import argparse
import json
import statistics
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import interview
from .donnees import RACINE

DERNIERS_APPELS = 25
APPELS_PAR_SEMAINE = 23   # mesuré sur la saison v1 (182 appels en 8 semaines)

# Ce qu'on affiche de chaque réponse, selon le rôle de l'agent.
CHAMPS = {
    "joueur": ("jouer", "entrainement", "raisonnement"),
    "entraineur": ("tactique", "recommande_jouer", "conseil"),
    "reflexion": ("lecon",),
    "journaliste": ("titre",),
    "conference": ("reponse",),
    "agent": ("montant", "argument"),
    "sponsor": ("decision", "montant"),
}


def _lire_appels(chemin: Path) -> list[dict]:
    """Lit llm.jsonl ; ignore une dernière ligne en cours d'écriture."""
    if not chemin.exists():
        return []
    appels = []
    for ligne in chemin.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            appels.append(json.loads(ligne))
        except json.JSONDecodeError:
            continue
    return appels


def _resume_appel(a: dict) -> dict:
    """Garde le rôle, la durée, l'erreur et les champs utiles de la réponse."""
    try:
        rep = json.loads(a.get("reponse") or "{}")
    except json.JSONDecodeError:
        rep = {}
    if not isinstance(rep, dict):
        rep = {}
    champs = {k: rep[k] for k in CHAMPS.get(a.get("role"), ()) if k in rep}
    return {"role": a.get("role", "?"), "sujet": a.get("sujet", ""),
            "ok": bool(a.get("ok")), "duree": a.get("duree", 0),
            "erreur": a.get("erreur", ""), "champs": champs}


def _lire_saison(chemin: Path) -> dict | None:
    """saison.json peut être en cours de réécriture : None si illisible."""
    try:
        return json.loads(chemin.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _derniere_ligne_semaine(log: Path) -> str:
    if not log.exists():
        return ""
    lignes = [l for l in log.read_text(encoding="utf-8", errors="replace").splitlines()
              if l.startswith("semaine ")]
    return lignes[-1] if lignes else ""


def etat(dossier: Path, cache: dict | None = None) -> dict:
    """Instantané de la saison en cours, prêt à être envoyé en JSON à la page."""
    appels = _lire_appels(dossier / "llm.jsonl")
    saison = _lire_saison(dossier / "saison.json")
    if saison is None and cache is not None:
        saison = cache.get("saison")          # garde la dernière version lisible
    if cache is not None and saison is not None:
        cache["saison"] = saison
    durees = [a.get("duree", 0) for a in appels if a.get("ok")]
    total = (saison or {}).get("meta", {}).get("semaines", 12)
    # la sauvegarde finale n'a ni « partiel » ni « semaine_atteinte »
    faites = (saison or {}).get("semaine_atteinte", len((saison or {}).get("semaines", [])))
    termine = saison is not None and not saison.get("partiel", False) and faites >= total
    moy = statistics.mean(durees) if durees else 0.0
    # Appels faits depuis la dernière sauvegarde = semaine en cours (le compteur
    # meta.llm.appels compte chaque essai, comme les lignes du journal).
    depuis = (saison or {}).get("meta", {}).get("llm", {}).get("appels", 0)
    journal = dossier / "llm.jsonl"
    age = time.time() - journal.stat().st_mtime if journal.exists() else None
    restant = 0 if termine else max(0, (total - faites) * APPELS_PAR_SEMAINE * moy)
    return {
        "dossier": dossier.name,
        "termine": termine,
        "semaines": total,
        "semaines_faites": faites,
        "en_cours": _derniere_ligne_semaine(dossier.parent / f"{dossier.name}.log"),
        "appels": len(appels),
        "echecs": sum(1 for a in appels if not a.get("ok")),
        "duree_moyenne": round(moy, 1),
        "restant_s": round(restant),
        "derniers": [_resume_appel(a) for a in appels[-DERNIERS_APPELS:]][::-1],
        "semaine_courante": [] if termine else [_resume_appel(a) for a in appels[depuis:]],
        "dernier_appel_il_y_a_s": None if age is None else round(age, 1),
        "saison": saison,
        "tableau": (dossier / "tableau_de_bord.html").exists(),
    }


def dossier_le_plus_recent(racine: Path) -> Path:
    candidats = [d for d in racine.iterdir() if d.is_dir() and (d / "llm.jsonl").exists()]
    if not candidats:
        raise SystemExit(f"Aucune saison LLM trouvée dans {racine}")
    return max(candidats, key=lambda d: (d / "llm.jsonl").stat().st_mtime)


# Modules du village 3D servis tels quels (liste fermée : aucun chemin arbitraire).
MODULES_3D = ("/village3d.js", "/village3d_jour.js", "/village3d_public.js", "/village3d_decor.js", "/village3d_controle.js", "/village3d_tableau.js", "/village3d_interview.js", "/village3d_effets.js")
CORPS_MAX = 4096          # taille maximale d'une requête POST (une question d'interview)


def ollama_joignable(llm) -> bool:
    """Ping rapide d'Ollama avant une interview (le faux LLM est toujours « joignable »)."""
    url = getattr(llm, "url", None)
    if not url:
        return True
    try:
        import requests
        return requests.get(f"{url}/api/tags", timeout=2).ok
    except Exception:  # noqa: BLE001 (réseau, import : on répond simplement « indisponible »)
        return False


def _interviews(dossier: Path, joueur: str) -> list:
    f = dossier / "interviews.jsonl"
    if not f.exists():
        return []
    out = []
    for ligne in f.read_text(encoding="utf-8").splitlines():
        try:
            x = json.loads(ligne)
        except json.JSONDecodeError:
            continue
        if x.get("joueur") == joueur:
            out.append(x)
    return out[-20:]


def creer_serveur(dossier: Path, port: int, llm_interview=None) -> ThreadingHTTPServer:
    """`llm_interview` : client LLM des interviews (défaut : Ollama local, créé à la demande)."""
    cache: dict = {}
    llm_box = {"llm": llm_interview}
    ici = Path(__file__).parent      # relus à chaque requête : on peut modifier la page à chaud

    class Gestionnaire(BaseHTTPRequestHandler):
        def _envoyer(self, code: int, corps: bytes, type_: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", type_)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(corps)))
            self.end_headers()
            self.wfile.write(corps)

        def do_GET(self):  # noqa: N802 (nom imposé par http.server)
            chemin = self.path.split("?", 1)[0]
            if chemin in ("/", "/index.html"):
                self._envoyer(200, (ici / "direct.html").read_bytes(), "text/html; charset=utf-8")
            elif chemin == "/scene.js":
                self._envoyer(200, (ici / "scene.js").read_bytes(), "text/javascript; charset=utf-8")
            elif chemin in ("/3d", "/3d/"):
                self._envoyer(200, (ici / "village3d.html").read_bytes(), "text/html; charset=utf-8")
            elif chemin in MODULES_3D:
                self._envoyer(200, (ici / chemin[1:]).read_bytes(), "text/javascript; charset=utf-8")
            elif chemin == "/etat":
                corps = json.dumps(etat(dossier, cache), ensure_ascii=False).encode("utf-8")
                self._envoyer(200, corps, "application/json; charset=utf-8")
            elif chemin == "/interviews":
                jid = self.path.split("joueur=", 1)[1].split("&", 1)[0] if "joueur=" in self.path else ""
                corps = json.dumps(_interviews(dossier, jid), ensure_ascii=False).encode("utf-8")
                self._envoyer(200, corps, "application/json; charset=utf-8")
            elif chemin == "/tableau" and (dossier / "tableau_de_bord.html").exists():
                self._envoyer(200, (dossier / "tableau_de_bord.html").read_bytes(),
                              "text/html; charset=utf-8")
            else:
                self._envoyer(404, b"introuvable", "text/plain; charset=utf-8")

        def do_POST(self):  # noqa: N802
            if self.path.split("?", 1)[0] != "/interview":
                self._envoyer(404, b"introuvable", "text/plain; charset=utf-8")
                return
            def erreur(code, message):
                self._envoyer(code, json.dumps({"erreur": message}, ensure_ascii=False).encode("utf-8"),
                              "application/json; charset=utf-8")
            try:
                n = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                n = -1
            if not 0 < n <= CORPS_MAX:
                erreur(413 if n > CORPS_MAX else 400, "requête vide ou trop longue")
                return
            try:
                demande = json.loads(self.rfile.read(n).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                erreur(400, "JSON invalide")
                return
            saison = etat(dossier, cache)["saison"]
            if not saison:
                erreur(409, "aucune saison lisible pour l'instant")
                return
            if llm_box["llm"] is None:
                from .llm import ClientOllama
                llm_box["llm"] = ClientOllama(timeout=90)
            if not ollama_joignable(llm_box["llm"]):
                erreur(503, "Ollama ne répond pas : lance-le (ollama serve) pour interviewer les joueurs")
                return
            try:
                rep = interview.repondre(dossier, saison, demande, llm_box["llm"])
            except interview.ErreurInterview as e:
                erreur(e.code, str(e))
                return
            self._envoyer(200, json.dumps(rep, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

        def log_message(self, *args):   # pas de bruit dans le terminal
            pass

    # 127.0.0.1 seulement : la page n'est pas exposée au réseau local.
    return ThreadingHTTPServer(("127.0.0.1", port), Gestionnaire)


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="Suivi en direct d'une saison en cours.")
    p.add_argument("--nom", default=None, help="dossier dans runs/ (défaut : le plus récent)")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--faux-interviews", action="store_true",
                   help="interviews par le faux LLM (sans Ollama, pour essayer l'interface)")
    a = p.parse_args(argv)
    racine = RACINE / "runs"
    dossier = racine / a.nom if a.nom else dossier_le_plus_recent(racine)
    if not dossier.is_dir():
        raise SystemExit(f"Dossier introuvable : {dossier}")
    llm = None
    if a.faux_interviews:
        from .llm import FauxLLM
        llm = FauxLLM()
    serveur = creer_serveur(dossier, a.port, llm)
    print(f"Suivi de {dossier.name} : http://127.0.0.1:{a.port}  (Ctrl+C pour arrêter)", flush=True)
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        serveur.server_close()


if __name__ == "__main__":
    main()
