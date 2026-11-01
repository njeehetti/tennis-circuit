"""Clients LLM : Ollama (local) et un faux client déterministe pour les tests.

Leçons du portage Smallville appliquées : sortie JSON forcée, raisonnement
désactivé, validation des clés, une relance, puis repli (None) journalisé.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import requests


class ClientOllama:
    def __init__(self, modele: str = "qwen3:8b", journal: Path | None = None,
                 url: str | None = None, timeout: int = 180):
        self.modele = modele
        self.url = (url or os.environ.get("OLLAMA_URL", "http://localhost:11434")).rstrip("/")
        self.journal = journal
        self.timeout = timeout
        self.stats = {"appels": 0, "echecs": 0, "secondes": 0.0}

    def _log(self, ligne: dict) -> None:
        if self.journal:
            with open(self.journal, "a", encoding="utf-8") as f:
                f.write(json.dumps(ligne, ensure_ascii=False) + "\n")

    def json(self, role: str, systeme: str, utilisateur: str, cles: tuple) -> dict | None:
        for essai in range(2):
            debut = time.time()
            texte, erreur = "", ""
            try:
                r = requests.post(f"{self.url}/api/chat", timeout=self.timeout, json={
                    "model": self.modele, "stream": False, "format": "json", "think": False,
                    "messages": [{"role": "system", "content": systeme},
                                 {"role": "user", "content": utilisateur}],
                    "options": {"temperature": 0.7, "num_predict": 450},
                })
                r.raise_for_status()
                texte = r.json()["message"]["content"]
                donnees = json.loads(texte)
                if not isinstance(donnees, dict):
                    raise ValueError("la réponse n'est pas un objet JSON")
                manquantes = [c for c in cles if c not in donnees]
                if manquantes:
                    raise ValueError(f"clés manquantes : {manquantes}")
            except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
                donnees, erreur = None, str(exc)[:200]
            duree = time.time() - debut
            self.stats["appels"] += 1
            self.stats["secondes"] += duree
            self._log({"role": role, "essai": essai, "ok": donnees is not None,
                       "duree": round(duree, 2), "erreur": erreur,
                       "prompt": utilisateur[-1500:], "reponse": texte[:1500]})
            if donnees is not None:
                return donnees
        self.stats["echecs"] += 1
        return None


class FauxLLM:
    """Réponses déterministes et plausibles, pour tester sans Ollama."""

    def __init__(self):
        self.stats = {"appels": 0, "echecs": 0, "secondes": 0.0}
        self.n = 0

    def json(self, role: str, systeme: str, utilisateur: str, cles: tuple) -> dict | None:
        self.stats["appels"] += 1
        self.n += 1
        fatigue_haute = any(f"fatigue : {k}/10" in utilisateur for k in (7, 8, 9, 10))
        reponses = {
            "joueur": {"jouer": not fatigue_haute,
                       "entrainement": "repos" if fatigue_haute else ("service", "retour", "physique")[self.n % 3],
                       "raisonnement": "Décision du faux LLM."},
            "entraineur": {"tactique": ("service_agressif", "pression_retour", "equilibre")[self.n % 3],
                           "conseil": "Reste concentré sur ton plan de jeu.", "recommande_jouer": True},
            "reflexion": {"lecon": "Je dois mieux gérer ma fatigue.", "importance": 6},
            "journaliste": {"titre": "Un titre de presse", "article": "Article du faux LLM.",
                            "question": "Comment vous sentez-vous ?"},
            "conference": {"reponse": "Je me sens bien, merci.", "revele_blessure": False},
            "agent": {"montant": 200000, "argument": "Mon joueur est en grande forme."},
            "sponsor": {"decision": "accepter", "montant": 200000, "message": "Marché conclu."},
        }
        if self.n % 17 == 0:          # simule un échec de temps en temps
            self.stats["echecs"] += 1
            return None
        return reponses.get(role, {})
