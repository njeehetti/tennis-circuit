"""Interviews depuis le village 3D : on pose une question à un joueur, à un jour donné de la saison.

Le contexte ne contient que ce que le joueur sait à ce moment-là (souvenirs et
résultats antérieurs, état mental et physique) : pas de fuite du futur. Les
questions et réponses sont ajoutées à `interviews.jsonl` dans le dossier de la
saison (la simulation elle-même n'est jamais modifiée).
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path

from . import agents
from .joueurs import Joueur

QUESTION_MAX = 300
TOURS_FR = {"R16": "premier tour", "QF": "quart de finale", "SF": "demi-finale", "F": "finale"}
JOUR_DEFAUT = {"R16": 1, "QF": 3, "SF": 6, "F": 7}
_verrou = threading.Lock()          # une interview à la fois (le LLM local est partagé)


class ErreurInterview(ValueError):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


def valider(demande: dict, saison: dict) -> tuple:
    """Renvoie (joueur, semaine, jour, question) ou lève ErreurInterview(400)."""
    if not isinstance(demande, dict):
        raise ErreurInterview(400, "demande invalide")
    ids = {j["id"]: j for j in saison.get("joueurs", [])}
    jid = demande.get("joueur")
    if jid not in ids:
        raise ErreurInterview(400, "joueur inconnu")
    try:
        semaine, jour = int(demande.get("semaine", 0)), int(demande.get("jour", 7))
    except (TypeError, ValueError):
        raise ErreurInterview(400, "semaine ou jour invalide") from None
    faites = saison.get("semaine_atteinte") or len(saison.get("semaines", []))
    if not 0 <= semaine <= faites or not 1 <= jour <= 7:
        raise ErreurInterview(400, "semaine ou jour hors de la saison")
    question = " ".join(str(demande.get("question", "")).split())[:QUESTION_MAX]
    if len(question) < 3:
        raise ErreurInterview(400, "question vide")
    return ids[jid], semaine, jour, question


def _avant(x: dict, semaine: int, jour: int) -> bool:
    """L'événement x (semaine, jour) a-t-il eu lieu avant la fin du jour donné ?"""
    j = x.get("jour") or JOUR_DEFAUT.get(x.get("tour"), 7)
    return x["semaine"] < semaine or (x["semaine"] == semaine and j <= jour)


def contexte(saison: dict, j: dict, semaine: int, jour: int) -> str:
    """Ce que le joueur sait au soir du jour donné, en texte."""
    jid, nom = j["id"], lambda i: next((x["nom"] for x in saison["joueurs"] if x["id"] == i), i)
    cls = [c for c in saison.get("classements", []) if c["semaine"] < semaine] or saison.get("classements", [])[:1]
    pts = cls[-1]["points"] if cls else {}
    rang = sorted(pts, key=lambda i: -pts[i]).index(jid) + 1 if jid in pts else "?"
    lignes = [f"Classement : {rang}e avec {pts.get(jid, '?')} points (au début de la semaine {semaine}).",
              f"Style {j.get('style', '')}, {j.get('age', '?')} ans, entraîneur {j.get('entraineur', '')}."]
    titres = [f for f in saison.get("finales", []) if f["vainqueur"] == jid and _avant({**f, "tour": "F"}, semaine, jour)]
    if titres:
        lignes.append("Titres cette saison : " + ", ".join(f["tournoi"] for f in titres) + ".")
    soc = [s for s in saison.get("social", []) if s["semaine"] < semaine]
    if soc and jid in soc[-1]["joueurs"]:
        s = soc[-1]["joueurs"][jid]
        lignes.append(f"Moral {s['moral']:.0f}/100, popularité {s['popularite']:.0f}/100, réputation {s['reputation']:.0f}/100.")
        if s.get("blessure"):
            lignes.append(f"Blessé : {s['zone']} ({s['gravite']}), encore {s['blessure']} semaine(s) (le public l'ignore peut-être).")
        if s.get("chroniques"):
            lignes.append("Point faible chronique : " + ", ".join(s["chroniques"]) + ".")
    cal = {t["semaine"]: t for t in saison.get("calendrier", [])}
    if semaine in cal:
        lignes.append(f"Cette semaine : {cal[semaine]['nom']} ({cal[semaine]['categorie']}, {cal[semaine]['surface']}).")
    recents = [m for m in saison.get("matchs", []) if jid in (m["vainqueur"], m["perdant"]) and _avant(m, semaine, jour)][-4:]
    for m in recents:
        g = m["vainqueur"] == jid
        lignes.append(f"Semaine {m['semaine']}, {m['tournoi']}, {TOURS_FR.get(m['tour'], m['tour'])} : "
                      f"{'victoire contre' if g else 'défaite contre'} {nom(m['perdant'] if g else m['vainqueur'])} {m['score']}.")
    for b in [b for b in saison.get("blessures", []) if b["joueur"] == jid and _avant(b, semaine, jour)][-2:]:
        lignes.append(f"Semaine {b['semaine']} : {b['type']} ({b['zone']})" + (", abandon" if b.get("abandon") else "") + ".")
    souvenirs = sorted((m for m in j.get("memoire", []) if m["semaine"] < semaine),
                       key=lambda m: (m["importance"], m["semaine"]), reverse=True)[:6]
    if souvenirs:
        lignes.append("Souvenirs marquants : " + " | ".join(m["texte"] for m in souvenirs))
    return "\n".join(lignes)


def repondre(dossier: Path, saison: dict, demande: dict, llm) -> dict:
    j, semaine, jour, question = valider(demande, saison)
    if not _verrou.acquire(blocking=False):
        raise ErreurInterview(429, "une interview est déjà en cours, réessaie dans un instant")
    try:
        joueur = Joueur(id=j["id"], nom=j["nom"], pays=j.get("pays", ""), age=j.get("age", 25),
                        personnalite=j.get("personnalite", ""), pilote=j.get("pilote", ""),
                        paire=j.get("paire", 0), profil={})
        debut = time.time()
        rep = agents.interview(llm, joueur, contexte(saison, j, semaine, jour), question)
        ligne = {"joueur": j["id"], "semaine": semaine, "jour": jour, "question": question, **rep,
                 "duree": round(time.time() - debut, 1), "horodatage": time.strftime("%Y-%m-%d %H:%M:%S")}
        with open(dossier / "interviews.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(ligne, ensure_ascii=False) + "\n")
        return ligne
    finally:
        _verrou.release()
