"""Assemble les images de outils/video.mjs en animation pour le README.

  python outils/assembler_video.py --images $TEMP/frames --sortie docs/demo.webp
  python outils/assembler_video.py --images $TEMP/frames --sortie docs/demo.gif --largeur 720

Les images du navigateur arrivent à intervalles irréguliers : on rééchantillonne à
cadence fixe en prenant, pour chaque instant, la dernière image reçue. WebP (léger,
affiché par GitHub) ou GIF (compatible partout, plus lourd) selon l'extension.
Demande Pillow (requirements-dev.txt).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def instants(horodatages: list[float], fps: float) -> list[int]:
    """Indice de l'image à montrer à chaque pas de 1/fps (dernière image reçue)."""
    if not horodatages:
        return []
    t0, fin = horodatages[0], horodatages[-1]
    out, i, t = [], 0, t0
    while t <= fin + 1e-9:
        while i + 1 < len(horodatages) and horodatages[i + 1] <= t:
            i += 1
        out.append(i)
        t += 1 / fps
    return out


def assembler(dossier: Path, sortie: Path, fps: float, largeur: int, qualite: int) -> dict:
    liste = json.loads((dossier / "images.json").read_text(encoding="utf-8"))
    if not liste:
        raise SystemExit("aucune image enregistrée")
    choix = instants([x["t"] for x in liste], fps)
    cache: dict[int, Image.Image] = {}

    def image(i: int) -> Image.Image:
        if i not in cache:
            im = Image.open(dossier / liste[i]["nom"]).convert("RGB")
            if im.width > largeur:
                im = im.resize((largeur, round(im.height * largeur / im.width)), Image.LANCZOS)
            cache.clear()                 # mémoire bornée : les indices sont croissants
            cache[i] = im
        return cache[i]

    images = [image(i) for i in choix]
    duree = round(1000 / fps)
    sortie.parent.mkdir(parents=True, exist_ok=True)
    if sortie.suffix.lower() == ".gif":
        palette = [im.quantize(colors=128, method=Image.Quantize.MEDIANCUT) for im in images]
        palette[0].save(sortie, save_all=True, append_images=palette[1:], duration=duree, loop=0, optimize=True)
    else:
        images[0].save(sortie, save_all=True, append_images=images[1:], duration=duree, loop=0,
                       quality=qualite, method=4)
    return {"images": len(images), "secondes": round(len(images) / fps, 1),
            "mo": round(sortie.stat().st_size / 1e6, 1)}


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="Assemble une animation pour le README.")
    p.add_argument("--images", required=True)
    p.add_argument("--sortie", required=True)
    p.add_argument("--fps", type=float, default=12)
    p.add_argument("--largeur", type=int, default=960)
    p.add_argument("--qualite", type=int, default=70)
    a = p.parse_args(argv)
    r = assembler(Path(a.images), Path(a.sortie), a.fps, a.largeur, a.qualite)
    print(f"{a.sortie} : {r['images']} images, {r['secondes']} s, {r['mo']} Mo")


if __name__ == "__main__":
    main()
