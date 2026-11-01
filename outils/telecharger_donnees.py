"""Télécharge les CSV du Match Charting Project et reconstruit data/gabarits.json."""
from __future__ import annotations

import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tennis import donnees  # noqa: E402

BASE = "https://raw.githubusercontent.com/JeffSackmann/tennis_MatchChartingProject/master/"
FICHIERS = ("charting-m-stats-Overview.csv", "charting-m-matches.csv")


def main() -> None:
    donnees.BRUT.mkdir(parents=True, exist_ok=True)
    for nom in FICHIERS:
        r = requests.get(BASE + nom, timeout=120)
        r.raise_for_status()
        (donnees.BRUT / nom).write_bytes(r.content)
        print(f"téléchargé : {nom} ({len(r.content) // 1024} Ko)")
    if donnees.GABARITS.exists():
        donnees.GABARITS.unlink()
    g = donnees.charger_gabarits()
    print(f"{len(g)} gabarits écrits dans {donnees.GABARITS}")


if __name__ == "__main__":
    main()
