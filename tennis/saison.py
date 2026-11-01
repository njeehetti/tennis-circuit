"""Une saison complète, semaine par semaine.

Chaque semaine : l'entraîneur conseille (si tournoi), le joueur décide
(jouer ou non, axe d'entraînement), le tournoi se joue sur le moteur
statistique, le journaliste écrit, le vainqueur répond en conférence de
presse, les joueurs LLM tirent une leçon (réflexion). Négociations de
sponsoring à mi-saison et en fin de saison.
"""
from __future__ import annotations

import copy
import random
import statistics
from dataclasses import replace

from . import agents
from .agents import ENTRAINEURS, SPONSORS
from .joueurs import (RETOUR_MOYEN, Etat, apres_match, creer_joueurs, fin_de_semaine,
                      force_effective, points_initiaux)
from .match import jouer_match
from .memoire import Souvenir, ajouter, en_texte, recuperer
from .tournoi import CALENDRIER, NOMS_SURFACES, TOURS, prochains, tableau, tournoi_de_la_semaine

IMPORTANCE_TOUR = {"R16": 3, "QF": 4, "SF": 5, "F": 7, "V": 9}
NOMS_TOURS = {"R16": "huitième de finale", "QF": "quart de finale", "SF": "demi-finale",
              "F": "finale"}


class Saison:
    def __init__(self, gabarits: list, llm, graine: int = 1, semaines: int = 12,
                 controle: bool = False, progres=None, version_prompts: int = 2):
        self.rng = random.Random(graine)
        self.graine = graine
        self.llm = llm
        self.semaines = semaines
        # controle=True : les joueurs « llm » suivent aussi la baseline (mesure du bruit)
        self.controle = controle
        self.version_prompts = version_prompts
        self.progres = progres or (lambda msg: None)
        self.joueurs = creer_joueurs(gabarits, self.rng)
        self.par_id = {j.id: j for j in self.joueurs}
        self.etats = {j.id: Etat(points=points_initiaux(j)) for j in self.joueurs}
        self.points_depart = {i: e.points for i, e in self.etats.items()}
        self.memoires = {j.id: () for j in self.joueurs}
        self.coachs = {j.id: ENTRAINEURS[k % len(ENTRAINEURS)] for k, j in enumerate(self.joueurs)}
        self.titres = {j.id: 0 for j in self.joueurs}
        self.face_a_face: dict = {}
        self.journal = {"semaines": [], "matchs": [], "articles": [], "negociations": [],
                        "classements": [], "finales": []}

    # ----------------------------------------------------------------- outils
    def classement(self) -> list:
        return sorted(self.par_id, key=lambda i: (-self.etats[i].points, i))

    def _llm_actif(self, j) -> bool:
        return j.pilote == "llm" and not self.controle

    def _souvenir(self, jid: str, semaine: int, texte: str, importance: int, type_: str = "evenement"):
        self.memoires[jid] = ajouter(self.memoires[jid], Souvenir(semaine, texte, importance, type_))

    def _nom(self, jid: str) -> str:
        return self.par_id[jid].nom

    # ---------------------------------------------------------------- saison
    def jouer(self, apres_semaine=None) -> dict:
        """Joue la saison. `apres_semaine(resultats_partiels)` permet une sauvegarde
        à chaque semaine : un arrêt brutal (mémoire, coupure) ne perd plus tout."""
        self.journal["classements"].append({"semaine": 0, "points": dict(self.points_depart)})
        for semaine in range(1, self.semaines + 1):
            self._semaine(semaine)
            if apres_semaine:
                apres_semaine({**copy.deepcopy(self.resultats()), "partiel": semaine < self.semaines,
                               "semaine_atteinte": semaine})
        return self.resultats()

    def _semaine(self, semaine: int) -> None:
        tournoi = tournoi_de_la_semaine(semaine)
        a_venir = prochains(semaine)
        classement = self.classement()
        self.progres(f"semaine {semaine} : {tournoi.nom if tournoi else 'pas de tournoi'}")
        decisions, tactiques, conseils, etats_avant = {}, {}, {}, dict(self.etats)
        for j in self.joueurs:
            e = self.etats[j.id]
            if self._llm_actif(j):
                conseil = ""
                if tournoi:
                    tops = [self.par_id[i] for i in classement if i != j.id][:4]
                    nom_c, perso_c = self.coachs[j.id]
                    tac, conseil, reco, repli = agents.conseil_entraineur(
                        self.llm, nom_c, perso_c, j, e, tournoi, tops, self.version_prompts)
                    tactiques[j.id] = tac
                    conseils[j.id] = {"entraineur": nom_c, "tactique": tac, "conseil": conseil,
                                      "recommande_jouer": reco, "repli": repli}
                souv = en_texte(recuperer(self.memoires[j.id], semaine))
                d = agents.decision_joueur(self.llm, j, e, semaine, tournoi, a_venir, conseil,
                                           souv, classement.index(j.id) + 1, self.version_prompts)
            else:
                d = agents.decision_baseline(e, tournoi, semaine)
                tactiques[j.id] = "equilibre"
            decisions[j.id] = d
            c = conseils.get(j.id)
            if tournoi and c and not c["repli"] and c["recommande_jouer"] != d.jouer:
                avis = "jouer" if c["recommande_jouer"] else "me reposer"
                self._souvenir(j.id, semaine, f"Je n'ai pas suivi {c['entraineur']}, qui voulait que je "
                               f"{avis} pour {tournoi.nom}.", 5)

        tours = self._tournoi(semaine, tournoi, [i for i in classement if decisions[i].jouer],
                              tactiques) if tournoi else {}

        for j in self.joueurs:
            self.etats[j.id] = fin_de_semaine(self.etats[j.id], j.id in tours,
                                              decisions[j.id].entrainement, tours.get(j.id))
            if tournoi and self._llm_actif(j) and j.id in tours:
                lecon, imp = agents.reflexion(self.llm, j, en_texte(recuperer(self.memoires[j.id], semaine, 6)),
                                              semaine)
                if lecon:
                    self._souvenir(j.id, semaine, f"Leçon : {lecon}", imp, "reflexion")

        if semaine in (6, self.semaines):
            self._negociations(semaine)

        self.journal["semaines"].append({
            "semaine": semaine, "tournoi": tournoi.nom if tournoi else None,
            "decisions": [{
                "joueur": j.id, "pilote": j.pilote if not self.controle else "baseline",
                "jouer": decisions[j.id].jouer, "entrainement": decisions[j.id].entrainement,
                "raisonnement": decisions[j.id].raisonnement, "repli": decisions[j.id].repli,
                "tactique": tactiques.get(j.id), "conseil": conseils.get(j.id),
                "fatigue": round(etats_avant[j.id].fatigue, 1), "blessure": etats_avant[j.id].blessure,
                "tour": tours.get(j.id),
            } for j in self.joueurs],
        })
        self.journal["classements"].append(
            {"semaine": semaine, "points": {i: e.points for i, e in self.etats.items()}})

    # --------------------------------------------------------------- tournoi
    def _tournoi(self, semaine: int, t, entrants: list, tactiques: dict) -> dict:
        if len(entrants) < 2:
            self.progres(f"  {t.nom} annulé : {len(entrants)} inscrit(s)")
            self.journal.setdefault("annulations", []).append({"semaine": semaine, "tournoi": t.nom,
                                                                "inscrits": list(entrants)})
            return {}
        places = tableau(entrants)
        atteint = {i: "R16" for i in entrants}
        surprises = []
        rangs = {i: k + 1 for k, i in enumerate(self.classement())}
        for tour in TOURS:
            suivants = []
            for k in range(0, len(places), 2):
                a, b = places[k], places[k + 1]
                if a is None or b is None:
                    suivants.append(a or b)
                    continue
                gagnant, score = self._match(semaine, t, tour, a, b, tactiques)
                perdant = b if gagnant == a else a
                atteint[perdant] = tour
                suivants.append(gagnant)
                if rangs[gagnant] - rangs[perdant] >= 5:
                    surprises.append(f"surprise : {self._nom(gagnant)} ({rangs[gagnant]}e) bat "
                                     f"{self._nom(perdant)} ({rangs[perdant]}e) en {NOMS_TOURS[tour]}, {score}")
            places = suivants
        champion = places[0]
        if champion is None:
            return {}
        atteint[champion] = "V"
        self.titres[champion] += 1
        for i, tour in atteint.items():
            e = self.etats[i]
            self.etats[i] = replace(e, points=e.points + t.points(tour), gains=e.gains + t.prix(tour))
        self._presse(semaine, t, champion, atteint, surprises, entrants)
        return atteint

    def _match(self, semaine: int, t, tour: str, a: str, b: str, tactiques: dict) -> tuple:
        ja, jb = self.par_id[a], self.par_id[b]
        # Un générateur par match, dérivé de (graine, semaine, tour, joueurs) : deux
        # jumeaux face au même adversaire au même tour ont les mêmes tirages, et les
        # décisions des autres joueurs ne décalent pas le flux aléatoire.
        cle_rng = "-".join((str(self.graine), str(semaine), tour, *sorted((a, b))))
        rng = random.Random(cle_rng)
        if rng.random() < 0.5:                           # qui sert en premier
            ja, jb, a, b = jb, ja, b, a
        fa = force_effective(ja, self.etats[a], t.surface, tactiques.get(a, "equilibre"), jb)
        fb = force_effective(jb, self.etats[b], t.surface, tactiques.get(b, "equilibre"), ja)
        res = jouer_match(fa, fb, rng, RETOUR_MOYEN, t.sets_gagnants())
        gagnant, perdant = (a, b) if res.vainqueur == 0 else (b, a)
        cinq = t.sets_gagnants() == 3
        sets_g = [(x, y) if gagnant == a else (y, x) for x, y in res.sets]
        score = " ".join(f"{x}-{y}" for x, y in sets_g)
        for jid in (a, b):
            e, blesse = apres_match(self.etats[jid], jid == gagnant, cinq, tactiques.get(jid, "equilibre"),
                                    rng)
            self.etats[jid] = e
            if blesse:
                self._souvenir(jid, semaine, f"Je me suis blessé pendant mon {NOMS_TOURS[tour]} à {t.nom} "
                               "(personne d'autre ne le sait).", 8)
        imp = IMPORTANCE_TOUR[tour]
        self._souvenir(gagnant, semaine, f"J'ai battu {self._nom(perdant)} {score} en {NOMS_TOURS[tour]} "
                       f"à {t.nom} ({NOMS_SURFACES[t.surface]}).", imp)
        self._souvenir(perdant, semaine, f"J'ai perdu contre {self._nom(gagnant)} {score} en "
                       f"{NOMS_TOURS[tour]} à {t.nom} ({NOMS_SURFACES[t.surface]}).", imp + 1)
        cle = tuple(sorted((gagnant, perdant)))
        h2h = self.face_a_face.get(cle, {cle[0]: 0, cle[1]: 0})
        self.face_a_face[cle] = {**h2h, gagnant: h2h[gagnant] + 1}
        self.journal["matchs"].append({"semaine": semaine, "tournoi": t.nom, "tour": tour,
                                       "vainqueur": gagnant, "perdant": perdant, "score": score,
                                       "tactiques": {a: tactiques.get(a, "equilibre"),
                                                     b: tactiques.get(b, "equilibre")}})
        if tour == "F":
            self.journal["finales"].append({"semaine": semaine, "tournoi": t.nom, "a": a, "b": b,
                                            "vainqueur": gagnant, "score": score, "points": res.points,
                                            "sets_gagnants": t.sets_gagnants()})
        return gagnant, score

    def _presse(self, semaine: int, t, champion: str, atteint: dict, surprises: list, entrants: list):
        finale = next(m for m in reversed(self.journal["matchs"]) if m["tour"] == "F" and m["semaine"] == semaine)
        faits = [f"{self._nom(champion)} remporte le tournoi en battant {self._nom(finale['perdant'])} "
                 f"en finale, {finale['score']}.",
                 f"Titres cette saison : {self._nom(champion)} en compte {self.titres[champion]}."]
        faits += surprises[:3]
        absents = [self._nom(i) for i in self.classement()[:4] if i not in entrants]
        if absents:
            faits.append("forfaits ou absents parmi le top 4 : " + ", ".join(absents))
        cle = tuple(sorted((champion, finale["perdant"])))
        h2h = self.face_a_face.get(cle)
        if h2h and sum(h2h.values()) > 1:
            faits.append(f"face-à-face cette saison : {self._nom(champion)} {h2h[champion]} - "
                         f"{h2h[finale['perdant']]} {self._nom(finale['perdant'])}")
        art = agents.article(self.llm, t, faits, self.par_id[champion])
        rep = agents.conference(self.llm, self.par_id[champion], self.etats[champion], art["question"])
        self._souvenir(champion, semaine, f"En conférence de presse, on m'a demandé « {art['question']} » "
                       f"et j'ai répondu : « {rep['reponse']} »", 4, "presse")
        self.journal["articles"].append({"semaine": semaine, "tournoi": t.nom, "categorie": t.categorie,
                                         "surface": t.surface, "champion": champion, "faits": faits,
                                         **art, "reponse": rep["reponse"],
                                         "revele_blessure": rep.get("revele_blessure", False)})
        self.progres(f"  {t.nom} : {self._nom(champion)} bat {self._nom(finale['perdant'])} {finale['score']}")

    def _negociations(self, semaine: int):
        libres = [i for i in self.classement() if not self.etats[i].sponsor][:3]
        for k, jid in enumerate(libres):
            j, e = self.par_id[jid], self.etats[jid]
            sponsor = SPONSORS[(k + semaine) % len(SPONSORS)]
            neg = agents.negociation(self.llm, j, e, self.classement().index(jid) + 1, self.titres[jid], sponsor)
            neg["semaine"] = semaine
            self.journal["negociations"].append(neg)
            if neg["contrat"]:
                self.etats[jid] = replace(e, sponsor=sponsor[0], gains=e.gains + neg["contrat"])
                self._souvenir(jid, semaine, f"J'ai signé avec {sponsor[0]} pour {neg['contrat']} euros.", 6)
            else:
                self._souvenir(jid, semaine, f"Les négociations avec {sponsor[0]} ont échoué.", 5)

    # ------------------------------------------------------------- résultats
    def experience(self) -> dict:
        """Écart de points gagnés entre le jumeau LLM et le jumeau baseline de chaque paire."""
        gains = {i: self.etats[i].points - self.points_depart[i] for i in self.par_id}
        ecarts = []
        for k in sorted({j.paire for j in self.joueurs}):
            paire = {j.pilote: j.id for j in self.joueurs if j.paire == k}
            ecarts.append({"paire": k, "llm": paire["llm"], "baseline": paire["baseline"],
                           "points_llm": gains[paire["llm"]], "points_baseline": gains[paire["baseline"]],
                           "ecart": gains[paire["llm"]] - gains[paire["baseline"]]})
        valeurs = [x["ecart"] for x in ecarts]
        return {"paires": ecarts, "ecart_moyen": statistics.mean(valeurs),
                "ecart_type": statistics.stdev(valeurs) if len(valeurs) > 1 else 0.0}

    def resultats(self) -> dict:
        joueurs = []
        for j in self.joueurs:
            e = self.etats[j.id]
            joueurs.append({
                "id": j.id, "nom": j.nom, "pays": j.pays, "age": j.age, "personnalite": j.personnalite,
                "pilote": j.pilote, "paire": j.paire, "style": j.style(),
                "service": j.profil["service"], "retour": j.profil["retour"],
                "entraineur": self.coachs[j.id][0],
                "points_depart": self.points_depart[j.id], "points": e.points, "titres": self.titres[j.id],
                "gains": e.gains, "sponsor": e.sponsor, "matchs": e.matchs, "victoires": e.victoires,
                "memoire": [{"semaine": s.semaine, "texte": s.texte, "importance": s.importance,
                             "type": s.type} for s in self.memoires[j.id]],
            })
        replis = sum(1 for s in self.journal["semaines"] for d in s["decisions"]
                     if d["repli"] or (d["conseil"] and d["conseil"]["repli"]))
        return {"meta": {"graine": self.graine, "semaines": self.semaines, "controle": self.controle,
                         "llm": dict(self.llm.stats), "replis": replis,
                         "version_prompts": self.version_prompts},
                "joueurs": joueurs,
                "calendrier": [{"semaine": t.semaine, "nom": t.nom, "surface": t.surface,
                                "categorie": t.categorie} for t in CALENDRIER if t.semaine <= self.semaines],
                **self.journal, "experience": self.experience()}
