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

from . import agents, social
from . import blessures as bl
from .agents import ENTRAINEURS, SPONSORS
from .joueurs import (RETOUR_MOYEN, Etat, apres_match, creer_joueurs, fin_de_semaine,
                      force_effective, points_initiaux)
from .match import Force, jouer_match
from .memoire import Souvenir, ajouter, en_texte, recuperer
from .tournoi import CALENDRIER, NOMS_SURFACES, TOURS, prochains, tableau, tournoi_de_la_semaine

# Programme d'une semaine de tournoi (1 = lundi … 7 = dimanche) : premier tour lundi et
# mardi, quarts mercredi et jeudi, journée médias vendredi, demies samedi, finale dimanche.
JOURS_TOUR = {"R16": (1, 2), "QF": (3, 4), "SF": (6, 6), "F": (7, 7)}
JOUR_MEDIAS, JOUR_PRESSE = 5, 7
FEDERATION_SEMAINES = 4     # la commission de discipline siège toutes les 4 semaines
VESTIAIRES_PAR_TOURNOI = 2
IMPORTANCE_TOUR = {"R16": 3, "QF": 4, "SF": 5, "F": 7, "V": 9}
NOMS_TOURS = {"R16": "huitième de finale", "QF": "quart de finale", "SF": "demi-finale",
              "F": "finale"}


class Saison:
    def __init__(self, gabarits: list, llm, graine: int = 1, semaines: int = 12,
                 controle: bool = False, progres=None, version_prompts: int = 2,
                 social: bool = False):
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
        # Couche sociale (v3) : moral, popularité, réputation, arbitre, vestiaires, fédération.
        # Désactivée par défaut : les saisons v2 et l'expérience restent reproductibles.
        self.social = social
        self._jour, self._matchs_semaine = 0, []     # positionnés par _tournoi avant chaque match
        if social:
            rangs = {i: k + 1 for k, i in enumerate(self.classement())}
            from . import social as _soc          # le paramètre `social` masque le module ici
            self.sociaux = {j.id: _soc.initial(j.personnalite, rangs[j.id], len(self.joueurs))
                            for j in self.joueurs}
            self.relations: dict = {}
            # blessures détaillées (zone, gravité, chronicité) : tennis/blessures.py
            self.sante = {j.id: bl.Sante() for j in self.joueurs}
            # hygiène de vie tirée par paire de jumeaux (flux à part : le reste ne bouge pas)
            par_paire = {k: list(bl.HYGIENES)[random.Random(f"{graine}-paire{k}-hygiene").choices(
                range(3), weights=(1, 2, 1))[0]] for k in {j.paire for j in self.joueurs}}
            self.hygiene = {j.id: par_paire[j.paire] for j in self.joueurs}
            self.journal.update({"incidents": [], "vestiaires": [], "federation": [], "social": [],
                                 "blessures": []})
            self._instantane(0)

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
        avis_medicaux: dict = {}
        sante_avant = dict(self.sante) if self.social else {}
        sociaux_avant = dict(self.sociaux) if self.social else {}
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
                sante_txt = medecin_txt = ""
                if self.social:
                    sante_txt = (bl.en_texte(self.sante[j.id]) + " ; ton hygiène de vie est "
                                 + bl.HYGIENES_TXT[self.hygiene[j.id]] + " ; ton style : " + j.style())
                    if self._suivi_medical(j.id):
                        avis = agents.avis_medical(self.llm, j, e, sante_txt, tournoi)
                        avis_medicaux[j.id] = avis
                        medecin_txt = f"{avis['avis']}. {avis['message']}".strip()
                d = agents.decision_joueur(self.llm, j, e, semaine, tournoi, a_venir, conseil,
                                           souv, classement.index(j.id) + 1, self.version_prompts,
                                           social.en_texte(self.sociaux[j.id]) if self.social else "",
                                           sante_txt, medecin_txt)
                a = avis_medicaux.get(j.id)
                if a and not a.get("repli") and (a["avis"] == "jouer") != d.jouer and tournoi:
                    self._souvenir(j.id, semaine, f"Le médecin conseillait « {a['avis']} » ; j'ai choisi de "
                                   f"{'jouer' if d.jouer else 'ne pas jouer'} {tournoi.nom}.", 5)
            else:
                d = agents.decision_baseline(e, tournoi, semaine)
                if self.social and e.blessure > 0:          # règle fixe : blessé, on se soigne
                    d = replace(d, entrainement="soins")
                tactiques[j.id] = "equilibre"
            if self.social and d.jouer and self.sante[j.id].gravite == "sérieuse" and bl.blesse(self.sante[j.id]):
                # blessure sérieuse : le médecin du tournoi le déclare inapte, quoi qu'il ait décidé
                d = replace(d, jouer=False, raisonnement=d.raisonnement + " [déclaré inapte par le médecin du tournoi]")
                self._souvenir(j.id, semaine, f"Le médecin du tournoi m'a déclaré inapte ({self.sante[j.id].zone}) : "
                               "je ne peux pas jouer cette semaine.", 6)
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

        if self.social:
            for j in self.joueurs:
                self._sante_fin_de_semaine(semaine, j.id, decisions[j.id].entrainement,
                                           etats_avant[j.id].bonus_service, etats_avant[j.id].bonus_retour)
            for j in self.joueurs:
                s = social.apres_tournoi(self.sociaux[j.id], tours.get(j.id))
                self.sociaux[j.id] = social.fin_de_semaine(s, j.id in tours, decisions[j.id].entrainement,
                                                           etats_avant[j.id].fatigue)
            if semaine % FEDERATION_SEMAINES == 0 or semaine == self.semaines:
                self._federation(semaine)

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
                **({"medecin": avis_medicaux.get(j.id),
                    "sante": {"zone": sante_avant[j.id].zone, "gravite": sante_avant[j.id].gravite,
                              "chroniques": list(sante_avant[j.id].chroniques)}} if self.social else {}),
                **({"moral": round(sociaux_avant[j.id].moral),
                    "popularite": round(sociaux_avant[j.id].popularite),
                    "reputation": round(sociaux_avant[j.id].reputation)} if self.social else {}),
            } for j in self.joueurs],
        })
        if self.social:
            self._instantane(semaine)
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
        self._matchs_semaine = []
        surprises = []
        rangs = {i: k + 1 for k, i in enumerate(self.classement())}
        for tour in TOURS:
            suivants = []
            reels = [k for k in range(0, len(places), 2) if places[k] is not None and places[k + 1] is not None]
            for k in range(0, len(places), 2):
                a, b = places[k], places[k + 1]
                if a is None or b is None:
                    suivants.append(a or b)
                    continue
                # programme jour par jour : moitié haute du tableau le premier jour du tour
                self._jour = JOURS_TOUR[tour][0 if reels.index(k) < (len(reels) + 1) // 2 else 1]
                absent = self._forfait(semaine, t, tour, a, b) if self.social else None
                if absent:
                    gagnant, score = (b if absent == a else a), "forfait"
                else:
                    gagnant, score = self._match(semaine, t, tour, a, b, tactiques)
                perdant = b if gagnant == a else a
                atteint[perdant] = tour
                suivants.append(gagnant)
                if rangs[gagnant] - rangs[perdant] >= 5 and score != "forfait":
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
        if self.social:
            self._vestiaires(semaine, t)
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
        contexte, physique, tirages = None, (), {}
        if self.social:
            fa, fb = self._force_physique(a, fa), self._force_physique(b, fb)
            fa, fb, contexte = self._contexte_social(semaine, tour, a, b, fa, fb, cle_rng)
            physique, tirages = self._risques_physiques(t, a, b, cle_rng, tactiques)
        res = jouer_match(fa, fb, rng, RETOUR_MOYEN, t.sets_gagnants(),
                          apres_set=contexte["apres_set"] if contexte else None,
                          tilt=social.TILT if contexte else 0.0, physique=physique)
        gagnant, perdant = (a, b) if res.vainqueur == 0 else (b, a)
        cinq = t.sets_gagnants() == 3
        sets_g = [(x, y) if gagnant == a else (y, x) for x, y in res.sets]
        # un set interrompu à 0-0 (abandon avant le premier jeu) ne figure pas au score
        score = " ".join(f"{x}-{y}" for x, y in sets_g if x + y > 0) + (" ab." if res.abandon else "")
        for jid in (a, b):
            e, blesse = apres_match(self.etats[jid], jid == gagnant, cinq, tactiques.get(jid, "equilibre"),
                                    rng, risque=not self.social)
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
        self.journal["matchs"].append({"semaine": semaine, "jour": self._jour, "tournoi": t.nom, "tour": tour,
                                       "vainqueur": gagnant, "perdant": perdant, "score": score,
                                       "tactiques": {a: tactiques.get(a, "equilibre"),
                                                     b: tactiques.get(b, "equilibre")},
                                       "fatigue_apres": {a: round(self.etats[a].fatigue, 1),
                                                         b: round(self.etats[b].fatigue, 1)}})
        if self.social:
            self._apres_match_social(semaine, t, tour, (a, b), gagnant, res, score, contexte)
            self._blessures_du_match(semaine, t, tour, (a, b), res, tirages, score)
        if tour == "F":
            self.journal["finales"].append({"semaine": semaine, "tournoi": t.nom, "a": a, "b": b,
                                            "vainqueur": gagnant, "score": score, "points": res.points,
                                            "sets_gagnants": t.sets_gagnants()})
        return gagnant, score

    # --------------------------------------------------------- couche sociale
    def _instantane(self, semaine: int) -> None:
        self.journal["social"].append({"semaine": semaine, "joueurs": {
            i: {"moral": round(s.moral, 1), "popularite": round(s.popularite, 1),
                "reputation": round(s.reputation, 1), "blessure": self.sante[i].semaines,
                "zone": self.sante[i].zone, "gravite": self.sante[i].gravite,
                "chroniques": list(self.sante[i].chroniques)} for i, s in self.sociaux.items()}})

    def _relation(self, a: str, b: str) -> float:
        return self.relations.get(tuple(sorted((a, b))), 0.0)

    def _contexte_social(self, semaine, tour, a, b, fa, fb, cle_rng):
        """Moral, face-à-face et public modifient les forces ; l'arbitre veille au code."""
        rangs = {i: k + 1 for k, i in enumerate(self.classement())}
        sa, sb = self.sociaux[a], self.sociaux[b]
        h2h = self.face_a_face.get(tuple(sorted((a, b))))
        soutien = social.soutien_public(sa.popularite, sb.popularite, rangs[a], rangs[b])
        adj_a = social.ajustement(sa, *social.bilan_face_a_face(h2h, a, b), soutien)
        adj_b = social.ajustement(sb, *social.bilan_face_a_face(h2h, b, a), -soutien)
        # la confiance v2 (-3..+3) est remplacée par le moral : on retire son effet
        fa = Force(fa.service + adj_a + 0.005 * self.etats[a].confiance,
                   fa.retour + adj_a + 0.005 * self.etats[a].confiance)
        fb = Force(fb.service + adj_b + 0.005 * self.etats[b].confiance,
                   fb.retour + adj_b + 0.005 * self.etats[b].confiance)
        rng_arbitre = random.Random(cle_rng + "-arbitre")     # flux séparé : les points ne bougent pas
        tension = self._relation(a, b) <= -0.3
        deja = [0, 0]
        ids = (a, b)

        def apres_set(_n, jeux, _sets):
            perdant = 0 if jeux[0] < jeux[1] else 1
            jid = ids[perdant]
            p = social.proba_incident(self.par_id[jid].personnalite, self.sociaux[jid],
                                      self.etats[jid].fatigue, max(jeux) >= 7, tension)
            if deja[perdant]:
                p = min(0.5, p * social.RECIDIVE)
            if rng_arbitre.random() < p:
                nature = social.sanction(deja[perdant])
                deja[perdant] += 1
                return [(perdant, nature)]
            return []

        arbitre = social.ARBITRES[(semaine * 7 + len(self._matchs_semaine)) % len(social.ARBITRES)]
        return fa, fb, {"apres_set": apres_set, "soutien": soutien, "ajustements": (adj_a, adj_b),
                        "arbitre": arbitre, "rangs": rangs}

    def _apres_match_social(self, semaine, t, tour, ids, gagnant, res, score, ctx):
        a, b = ids
        sanctions = {a: [], b: []}
        excuses = {a: False, b: False}
        for fautif_idx, nature, n_set in res.sanctions:
            jid, adv = ids[fautif_idx], ids[1 - fautif_idx]
            motif = social.MOTIFS[social.trait(self.par_id[jid].personnalite)]
            jeux = " ".join(f"{x}-{y}" if fautif_idx == 0 else f"{y}-{x}" for x, y in res.sets[:n_set])
            reac = agents.reaction_sanction(self.llm, self.par_id[jid], nature, motif, ctx["arbitre"],
                                            self._nom(adv), jeux, t)
            sanctions[jid].append(nature)
            excuses[jid] = excuses[jid] or reac["excuses"]
            quoi = "avertissement" if nature == "avertissement" else "point de pénalité"
            self.journal["incidents"].append({
                "semaine": semaine, "jour": self._jour, "tournoi": t.nom, "tour": tour, "joueur": jid,
                "adversaire": adv,
                "set": n_set, "score": jeux, "sanction": nature, "motif": motif,
                "arbitre": ctx["arbitre"], **reac})
            self._souvenir(jid, semaine, f"L'arbitre {ctx['arbitre']} m'a infligé un {quoi} pour {motif} "
                           f"contre {self._nom(adv)} à {t.nom}. J'ai dit : « {reac['sur_le_court']} »", 6)
            self._souvenir(adv, semaine, f"{self._nom(jid)} a reçu un {quoi} pour {motif} pendant notre "
                           f"match à {t.nom}.", 4)
            self.relations[tuple(sorted(ids))] = max(-1.0, self._relation(a, b) - 0.15)
        rangs = ctx["rangs"]
        for jid, adv in ((a, b), (b, a)):
            self.sociaux[jid] = social.apres_match(self.sociaux[jid], self.par_id[jid].personnalite,
                                                   jid == gagnant, rangs[jid], rangs[adv],
                                                   sanctions[jid], excuses[jid])
        m = self.journal["matchs"][-1]
        m["soutien"] = {a: round(ctx["soutien"], 2), b: round(-ctx["soutien"], 2)}
        m["mental"] = {a: round(ctx["ajustements"][0] * 100, 2), b: round(ctx["ajustements"][1] * 100, 2)}
        m["arbitre"] = ctx["arbitre"]
        m["sanctions"] = [{"joueur": ids[i], "sanction": n, "set": s} for i, n, s in res.sanctions]
        m["moral_apres"] = {i: round(self.sociaux[i].moral, 1) for i in ids}
        m["popularite_apres"] = {i: round(self.sociaux[i].popularite, 1) for i in ids}
        self._matchs_semaine.append({"tour": tour, "jour": self._jour, "vainqueur": gagnant,
                                     "perdant": b if gagnant == a else a, "score": score,
                                     "incidents": len(res.sanctions)})

    def _vestiaires(self, semaine: int, t) -> None:
        """Les matchs les plus chargés (incident, rivalité, finale) donnent un échange aux vestiaires."""
        def poids(m):
            h2h = self.face_a_face.get(tuple(sorted((m["vainqueur"], m["perdant"]))), {})
            return (3 * m["incidents"] + (2 if sum(h2h.values()) >= 3 else 0)
                    + (1 if m["tour"] == "F" else 0) + abs(self._relation(m["vainqueur"], m["perdant"])))
        candidats = sorted((m for m in self._matchs_semaine if poids(m) >= 1), key=poids, reverse=True)
        for m in candidats[:VESTIAIRES_PAR_TOURNOI]:
            g, p_ = m["vainqueur"], m["perdant"]
            h2h = self.face_a_face.get(tuple(sorted((g, p_))), {})
            contexte = [f"{self._nom(g)} bat {self._nom(p_)} {m['score']} en {NOMS_TOURS.get(m['tour'], m['tour'])} "
                        f"à {t.nom}",
                        f"face-à-face cette saison : {self._nom(g)} {h2h.get(g, 0)} - {h2h.get(p_, 0)} {self._nom(p_)}"]
            contexte += [f"incident : {i['joueur'] == g and self._nom(g) or self._nom(p_)} a reçu un "
                         f"{'avertissement' if i['sanction'] == 'avertissement' else 'point de pénalité'} "
                         f"({i['motif']})" for i in self.journal["incidents"]
                         if i["semaine"] == semaine and {i["joueur"], i["adversaire"]} == {g, p_}]
            rel = self._relation(g, p_)
            if rel <= -0.3:
                contexte.append("leurs relations sont tendues depuis plusieurs semaines")
            elif rel >= 0.3:
                contexte.append("ils se respectent beaucoup")
            v = agents.vestiaire(self.llm, self.par_id[g], self.par_id[p_], contexte)
            delta = {"respect": 0.2, "neutre": 0.0, "tension": -0.3}[v["ton"]]
            self.relations[tuple(sorted((g, p_)))] = max(-1.0, min(1.0, rel + delta))
            self.journal["vestiaires"].append({"semaine": semaine, "tournoi": t.nom, "vainqueur": g,
                                               "jour": m["jour"], "perdant": p_,
                                               "relation": round(rel + delta, 2), **v})
            for moi, lui, dit, entendu in ((g, p_, v["replique_vainqueur"], v["replique_perdant"]),
                                           (p_, g, v["replique_perdant"], v["replique_vainqueur"])):
                self._souvenir(moi, semaine, f"Aux vestiaires de {t.nom}, j'ai dit à {self._nom(lui)} : « {dit} » "
                               f"et il m'a répondu : « {entendu} » (ambiance : {v['ton']}).",
                               6 if v["ton"] == "tension" else 3)

    def _federation(self, semaine: int) -> None:
        debut = semaine - FEDERATION_SEMAINES + 1
        par_joueur: dict = {}
        for i in self.journal["incidents"]:
            if i["semaine"] >= debut:
                par_joueur.setdefault(i["joueur"], []).append(i)
        for jid, liste in sorted(par_joueur.items()):
            textes = [f"semaine {i['semaine']}, {i['tournoi']} : "
                      f"{'avertissement' if i['sanction'] == 'avertissement' else 'point de pénalité'} pour "
                      f"{i['motif']} (arbitre {i['arbitre']}) ; il a dit « {i['sur_le_court']} »"
                      + (" puis s'est excusé" if i.get("excuses") else "") for i in liste]
            d = agents.federation(self.llm, self.par_id[jid], textes, self.sociaux[jid].reputation)
            if d["decision"] == "amende":
                self.sociaux[jid] = social.amende(self.sociaux[jid], d["montant"])
                self.etats[jid] = replace(self.etats[jid], gains=self.etats[jid].gains - d["montant"])
            self.journal["federation"].append({"semaine": semaine, "jour": JOUR_PRESSE, "joueur": jid, "incidents": len(liste), **d})
            self._souvenir(jid, semaine, f"La fédération a examiné mes incidents : {d['decision']}"
                           + (f" de {d['montant']} euros" if d["montant"] else "") + f". « {d['communique']} »", 6)

    # --------------------------------------------------------------- blessures
    def _suivi_medical(self, jid: str) -> bool:
        """Le staff médical intervient si le joueur est blessé, fragile ou très fatigué."""
        s = self.sante[jid]
        return bl.blesse(s) or bool(s.chroniques) or self.etats[jid].fatigue >= 6

    def _force_physique(self, jid: str, f: Force) -> Force:
        """Remplace le malus forfaitaire « joue blessé » (3 points) par celui de la zone touchée."""
        e = self.etats[jid]
        ms, mr = bl.malus(self.sante[jid], e.fatigue)
        plat = 0.03 if e.blessure > 0 else 0.0
        return Force(f.service + plat - ms, f.retour + plat - mr)

    def _risques_physiques(self, t, a: str, b: str, cle_rng: str, tactiques: dict) -> tuple:
        """Tire, avant le match, qui se blesse (ou aggrave sa blessure), après quel set, et s'il abandonne."""
        rng_b = random.Random(cle_rng + "-blessure")     # flux dédié : les points ne bougent pas
        max_sets = 2 * t.sets_gagnants() - 1
        # point du match où la blessure survient : au-delà de la fin du match, elle survient après
        dernier_point = 62 * max_sets
        physique, tirages = [], {}
        for idx, jid in enumerate((a, b)):
            s, e = self.sante[jid], self.etats[jid]
            if bl.blesse(s):
                if rng_b.random() >= bl.risque_aggravation(s):
                    continue
                ev = bl.aggraver(rng_b, s)
            else:
                style, tac = self.par_id[jid].style(), tactiques.get(jid, "equilibre")
                p = bl.risque_match(s, e.fatigue, self.par_id[jid].age, t.surface, max_sets == 5, e.endurance,
                                    style, tac, self.hygiene[jid])
                if rng_b.random() >= p:
                    continue
                ev = bl.tirer(rng_b, s, t.surface, style, tac)
            n = rng_b.randint(4, dernier_point)
            abandon = rng_b.random() < bl.proba_abandon(ev)
            ms0, mr0 = bl.malus(s, 0)
            ms1, mr1 = bl.malus(bl.appliquer(s, ev), 0)
            physique.append((idx, n, max(0.0, ms1 - ms0), max(0.0, mr1 - mr0), abandon))
            tirages[jid] = (ev, n)
        return tuple(physique), tirages

    def _blessures_du_match(self, semaine, t, tour, ids, res, tirages, score) -> None:
        a, b = ids
        survenues = {ids[q]: n_set for q, n_set in res.blessures}
        abandonne = ids[1 - res.vainqueur] if res.abandon else None
        for jid, (ev, _point) in tirages.items():
            if res.abandon and jid not in survenues:
                continue                                  # le match s'est arrêté avant
            abandon = jid == abandonne
            n = survenues.get(jid)                        # None : blessure en fin de match
            self.sante[jid] = bl.appliquer(self.sante[jid], ev)
            self.etats[jid] = replace(self.etats[jid], blessure=ev.semaines)
            s = self.sociaux[jid]
            self.sociaux[jid] = replace(s, moral=social.borne(s.moral + bl.delta_moral(ev, abandon)),
                                        popularite=social.borne(s.popularite + (1.5 if abandon else 0)))
            adv = b if jid == a else a
            nature = "aggravation" if ev.aggravation else "rechute" if ev.rechute else "blessure"
            self.journal["blessures"].append({
                "semaine": semaine, "jour": self._jour, "tournoi": t.nom, "tour": tour, "joueur": jid,
                "adversaire": adv, "type": nature, "zone": ev.zone, "gravite": ev.gravite,
                "semaines": ev.semaines, "chronique": ev.chronique, "set": n,
                "abandon": abandon, "score": score})
            quand = (f"au {n}{'er' if n == 1 else 'e'} set") if n else "en fin de match"
            texte = {"aggravation": f"J'ai aggravé ma blessure ({ev.zone}) en jouant blessé",
                     "rechute": f"J'ai rechuté ({ev.zone}, {ev.gravite})",
                     "blessure": f"Je me suis blessé ({ev.zone}, {ev.gravite})"}[nature]
            self._souvenir(jid, semaine, f"{texte} {quand} contre {self._nom(adv)} à {t.nom}"
                           + (" et j'ai dû abandonner" if abandon else "")
                           + (f". Mon {ev.zone} est devenu un point faible chronique" if ev.chronique else "")
                           + f" : {ev.semaines} semaine(s) d'arrêt prévue(s).", 8)
        if abandonne:
            self.journal["matchs"][-1]["abandon"] = abandonne

    def _forfait(self, semaine, t, tour, a, b) -> str | None:
        """Un joueur blessé sérieusement pendant le tournoi déclare forfait (modéré : une fois sur deux)."""
        for jid in (a, b):
            s = self.sante[jid]
            recente = any(x["joueur"] == jid and x["semaine"] == semaine and x["type"] != "forfait"
                          for x in self.journal["blessures"])
            if not (bl.blesse(s) and recente):
                continue
            if s.gravite == "sérieuse" or (s.gravite == "modérée"
                                           and random.Random(f"{self.graine}-{semaine}-{tour}-{jid}-forfait").random() < 0.5):
                adv = b if jid == a else a
                self.journal["matchs"].append({"semaine": semaine, "jour": self._jour, "tournoi": t.nom, "tour": tour,
                                               "vainqueur": adv, "perdant": jid, "score": "forfait", "forfait": jid,
                                               "tactiques": {}, "fatigue_apres": {a: round(self.etats[a].fatigue, 1),
                                                                                  b: round(self.etats[b].fatigue, 1)}})
                self.journal["blessures"].append({
                    "semaine": semaine, "jour": self._jour, "tournoi": t.nom, "tour": tour, "joueur": jid,
                    "adversaire": adv, "type": "forfait", "zone": s.zone, "gravite": s.gravite,
                    "semaines": s.semaines, "chronique": False, "set": None, "abandon": False, "score": "forfait"})
                self._souvenir(jid, semaine, f"J'ai déclaré forfait avant mon {NOMS_TOURS[tour]} à {t.nom} "
                               f"({s.zone}, {s.gravite}).", 7)
                soc = self.sociaux[jid]
                self.sociaux[jid] = replace(soc, moral=social.borne(soc.moral - 3))
                return jid
        return None

    def _sante_fin_de_semaine(self, semaine: int, jid: str, entrainement: str, avant_bs: float,
                              avant_br: float) -> None:
        soins = entrainement == "soins"
        e = self.etats[jid]
        rng = random.Random(f"{self.graine}-{semaine}-{jid}-sante")
        avant = self.sante[jid]
        s, evt = bl.fin_de_semaine(rng, avant, soins, e.fatigue)
        self.sante[jid] = s
        fatigue = max(0.0, e.fatigue - 1.0) if soins and not bl.blesse(avant) else e.fatigue
        _r1, _r2, d_fatigue, part = bl.HYGIENES[self.hygiene[jid]]
        bs, br = e.bonus_service, e.bonus_retour
        if entrainement in ("service", "retour", "physique") and not bl.blesse(avant):
            fatigue = max(0.0, min(10.0, fatigue + d_fatigue))
            # progrès de la semaine (+0,002 dans joueurs.fin_de_semaine) : on en garde la part prévue
            if entrainement == "service":
                bs = max(0.0, min(0.02, avant_bs + (bs - avant_bs) * part))
            elif entrainement == "retour":
                br = max(0.0, min(0.02, avant_br + (br - avant_br) * part))
        self.etats[jid] = replace(e, blessure=s.semaines, fatigue=fatigue, bonus_service=bs, bonus_retour=br)
        soc = self.sociaux[jid]
        if evt == "gueri":
            self.sociaux[jid] = replace(soc, moral=social.borne(soc.moral + bl.MORAL_RETOUR))
            self._souvenir(jid, semaine, f"Ma blessure ({avant.zone}) est guérie : je suis de retour.", 5)
        elif evt == "poussee":
            self.sociaux[jid] = replace(soc, moral=social.borne(soc.moral - 3))
            self._souvenir(jid, semaine, f"Poussée de ma blessure chronique ({s.zone}) : la fatigue la réveille.", 6)
        if evt:
            self.journal["blessures"].append({
                "semaine": semaine, "jour": 7, "tournoi": None, "tour": None, "joueur": jid, "adversaire": None,
                "type": evt, "zone": avant.zone if evt == "gueri" else s.zone, "gravite": s.gravite or avant.gravite,
                "semaines": s.semaines, "chronique": evt == "poussee", "set": None, "abandon": False, "score": None})

    def _presse(self, semaine: int, t, champion: str, atteint: dict, surprises: list, entrants: list):
        finale = next(m for m in reversed(self.journal["matchs"]) if m["tour"] == "F" and m["semaine"] == semaine)
        faits = [f"{self._nom(champion)} remporte le tournoi en battant {self._nom(finale['perdant'])} "
                 f"en finale, {finale['score']}.",
                 f"Titres cette saison : {self._nom(champion)} en compte {self.titres[champion]}."]
        faits += surprises[:3]
        if self.social:
            for i in [i for i in self.journal["incidents"] if i["semaine"] == semaine][:2]:
                faits.append(f"incident : {self._nom(i['joueur'])} a reçu un "
                             f"{'avertissement' if i['sanction'] == 'avertissement' else 'point de pénalité'} "
                             f"pour {i['motif']} contre {self._nom(i['adversaire'])}")
            for b in [b for b in self.journal["blessures"] if b["semaine"] == semaine and (b["abandon"] or b["type"] == "forfait")][:2]:
                faits.append(f"{self._nom(b['joueur'])} a {'abandonné' if b['abandon'] else 'déclaré forfait'} "
                             f"({NOMS_TOURS.get(b['tour'], b['tour'])}), blessé : {b['zone']}")
            for v in [v for v in self.journal["vestiaires"] if v["semaine"] == semaine and v["ton"] == "tension"][:1]:
                faits.append(f"ambiance froide aux vestiaires entre {self._nom(v['vainqueur'])} et "
                             f"{self._nom(v['perdant'])}")
            fin = self.journal["matchs"][-1]
            if "soutien" in fin:
                fav = max(fin["soutien"], key=fin["soutien"].get)
                if abs(fin["soutien"][fav]) >= 0.3:
                    faits.append(f"le public de la finale soutenait nettement {self._nom(fav)}")
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
        self.journal["articles"].append({"semaine": semaine, "jour": JOUR_PRESSE, "tournoi": t.nom, "categorie": t.categorie,
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
            neg["semaine"], neg["jour"] = semaine, JOUR_MEDIAS
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
                **({"social": {"moral": round(self.sociaux[j.id].moral, 1),
                               "popularite": round(self.sociaux[j.id].popularite, 1),
                               "reputation": round(self.sociaux[j.id].reputation, 1),
                               "avertissements": self.sociaux[j.id].avertissements,
                               "penalites": self.sociaux[j.id].penalites,
                               "amendes": self.sociaux[j.id].amendes},
                    "relations": {(k[1] if k[0] == j.id else k[0]): round(v, 2)
                                  for k, v in self.relations.items() if j.id in k},
                    "hygiene": self.hygiene[j.id],
                    "sante": {"blessure": self.sante[j.id].semaines, "zone": self.sante[j.id].zone,
                              "gravite": self.sante[j.id].gravite, "chroniques": list(self.sante[j.id].chroniques),
                              "antecedents": list(self.sante[j.id].antecedents)}} if self.social else {}),
            })
        replis = sum(1 for s in self.journal["semaines"] for d in s["decisions"]
                     if d["repli"] or (d["conseil"] and d["conseil"]["repli"]))
        return {"meta": {"graine": self.graine, "semaines": self.semaines, "controle": self.controle,
                         "llm": dict(self.llm.stats), "replis": replis,
                         "version_prompts": self.version_prompts, "social": self.social},
                "joueurs": joueurs,
                "calendrier": [{"semaine": t.semaine, "nom": t.nom, "surface": t.surface,
                                "categorie": t.categorie} for t in CALENDRIER if t.semaine <= self.semaines],
                **self.journal, "experience": self.experience()}
