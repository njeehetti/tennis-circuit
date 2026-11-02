"""Les agents LLM : joueur, entraîneur, journaliste, agent sportif, sponsor.

Chaque fonction construit un prompt, appelle le LLM en JSON, valide la
réponse et applique un repli déterministe si besoin (marqué `repli`).
"""
from __future__ import annotations

import difflib
import math
import random
import unicodedata
from dataclasses import dataclass

from .joueurs import ENTRAINEMENTS, TACTIQUES, RETOUR_MOYEN, SERVICE_MOYEN, Etat, Joueur
from .blessures import REGLES_BLESSURES
from .social import REGLES_SOCIALES
from .tournoi import NOMS_SURFACES, Tournoi

# couche v3 : « soins » (kiné, médecin) guérit plus vite ; proposé seulement avec la couche sociale
ENTRAINEMENTS_V3 = ENTRAINEMENTS + ("soins",)

SYSTEME = ("Tu joues un rôle dans une simulation de circuit de tennis fictif. "
           "Tous les personnages sont inventés. Réponds uniquement par un objet JSON valide, "
           "en français, sans texte autour.")

ENTRAINEURS = (
    ("Hélène Corvisart", "ancienne joueuse de double, prudente, obsédée par la récupération"),
    ("Marek Dvorny", "exigeant et offensif, pousse ses joueurs à prendre des risques"),
    ("Sofiane Lebrec", "analyste vidéo, construit ses plans sur les faiblesses adverses"),
    ("Ingrid Talvik", "pédagogue, mise sur la confiance et la régularité"),
)
SPONSORS = (
    ("Aurora Sport", "équipementier ambitieux, veut des vainqueurs de tournois", 400000),
    ("Banque Meridia", "banque prudente, tient à l'image et à la régularité", 300000),
    ("Kairo Energy", "boisson énergétique, aime les joueurs spectaculaires", 250000),
)


def _sans_accents(txt) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", str(txt).lower())
                   if unicodedata.category(c) != "Mn").strip()


def choisir(valeur, options: tuple, defaut: str) -> tuple:
    """Rapproche une réponse libre d'une option permise. Renvoie (option, exact)."""
    v = _sans_accents(valeur).replace(" ", "_")
    for o in options:
        if v == o:
            return o, True
    candidats = [o for o in options if o.startswith(v[:4])] if len(v) >= 4 else []
    if len(candidats) == 1:
        return candidats[0], False
    proche = difflib.get_close_matches(v, options, n=1, cutoff=0.6)
    return (proche[0], False) if proche else (defaut, False)


def booleen(valeur, defaut: bool) -> bool:
    if isinstance(valeur, bool):
        return valeur
    v = _sans_accents(valeur)
    if v in ("true", "oui", "yes", "1"):
        return True
    if v in ("false", "non", "no", "0"):
        return False
    return defaut


def entier_sur(valeur, defaut: int) -> int:
    """Convertit une réponse LLM en entier ; rejette nan, inf et les types inattendus."""
    try:
        x = float(valeur)
    except (TypeError, ValueError, OverflowError):
        return defaut
    if math.isnan(x) or math.isinf(x):
        return defaut
    return int(x)


def _profil_txt(j: Joueur, surface: str) -> str:
    s = j.profil["surfaces"][surface]
    return (f"{j.nom} ({j.pays}, style {j.style()}) : {s['service']*100:.1f} % de points gagnés "
            f"au service (moyenne du circuit {SERVICE_MOYEN*100:.1f} %), {s['retour']*100:.1f} % "
            f"en retour (moyenne {RETOUR_MOYEN*100:.1f} %)")


def _etat_txt(e: Etat) -> str:
    bless = (f"OUI, il te reste {e.blessure} semaine(s) de blessure (personne d'autre ne le sait)"
             if e.blessure else "non")
    return (f"fatigue : {e.fatigue:.0f}/10 ; confiance : {e.confiance:+d} (de -3 à +3) ; "
            f"blessé : {bless} ; points au classement : {e.points}")


# Version 1 (première saison) : formulation ambiguë de « physique », que le LLM
# a lu comme un moyen de récupérer. Conservée pour reproduire les résultats.
REGLES_V1 = (
    "Règles connues de tous les joueurs : la fatigue baisse ton niveau et, au-dessus de 6/10, "
    "augmente fortement le risque de blessure. Jouer un tournoi fatigue (surtout en 5 sets), "
    "une semaine sans tournoi récupère environ 3 points de fatigue, l'entraînement « repos » "
    "en récupère 1,5 de plus. « service » et « retour » améliorent lentement ces coups ; "
    "« physique » réduit durablement la fatigue accumulée en match. Jouer blessé fait baisser "
    "nettement ton niveau. Le Grand Chelem rapporte 2000 points au vainqueur, un Masters 1000, "
    "un 500 et un 250 en proportion."
)
# Version 2 : effets chiffrés et sans ambiguïté.
REGLES_V2 = (
    "Règles connues de tous les joueurs. Fatigue (0 à 10) : chaque point de fatigue te coûte "
    "0,4 point de pourcentage au service et en retour ; au-dessus de 6/10, chaque match comporte "
    "un risque de blessure (3 % par point au-dessus de 6). Chaque match ajoute environ 1 point "
    "de fatigue (1,5 en 5 sets). En fin de semaine tu récupères 1 point si tu as joué, 3 si tu "
    "n'as pas joué. Entraînement : « repos » est le SEUL choix qui fait récupérer davantage "
    "(1,5 point de plus) ; « physique » est une séance dure qui AJOUTE 0,5 de fatigue cette "
    "semaine, mais te rend plus endurant (tu accumuleras moins de fatigue en match ensuite) ; "
    "« service » et « retour » améliorent ces coups de 0,2 point de pourcentage par semaine "
    "(plafond +2). Jouer blessé coûte 3 points de pourcentage. Points au vainqueur : Grand "
    "Chelem 2000, Masters 1000, 500, 250 ; un premier tour perdu rapporte 0 à 10 points."
)
REGLES = {1: REGLES_V1, 2: REGLES_V2}
TACTIQUES_V2 = {
    "service_agressif": "« service_agressif » : +1,2 point de % au service, −0,8 en retour ; "
                        "+0,8 de plus contre un adversaire dont le retour est sous la moyenne ; "
                        "+0,5 sur gazon ; fatigue un peu plus",
    "pression_retour": "« pression_retour » : +1,2 point de % en retour, −0,8 au service ; "
                       "+0,8 de plus contre un adversaire dont le service est sous la moyenne ; "
                       "+0,5 sur terre battue",
    "equilibre": "« equilibre » : aucun bonus, aucun malus, pas de fatigue supplémentaire",
}


@dataclass(frozen=True)
class Decision:
    jouer: bool
    entrainement: str
    raisonnement: str
    repli: bool = False


def decision_baseline(e: Etat, tournoi: Tournoi | None, semaine: int) -> Decision:
    """Politique fixe : joue tout sauf blessé ou fatigue > 7 ; entraînement en rotation."""
    jouer = tournoi is not None and e.blessure == 0 and e.fatigue <= 7
    entrainement = "repos" if e.fatigue > 5 else ("service", "retour", "physique")[semaine % 3]
    return Decision(jouer, entrainement, "Politique fixe (baseline).")


def decision_joueur(llm, j: Joueur, e: Etat, semaine: int, tournoi: Tournoi | None,
                    a_venir: list, conseil: str, souvenirs: str, rang: int,
                    version: int = 2, social: str = "", sante: str = "", medecin: str = "") -> Decision:
    """`social` : état social en texte (moral, popularité, réputation) ; vide en mode sobre.
    `sante` et `medecin` (couche v3) : état physique détaillé et avis du staff médical."""
    if tournoi:
        semaine_txt = (f"Cette semaine (semaine {semaine}) : {tournoi.nom}, catégorie {tournoi.categorie}, "
                       f"sur {NOMS_SURFACES[tournoi.surface]}, {tournoi.points('V')} points au vainqueur.")
    else:
        semaine_txt = f"Cette semaine (semaine {semaine}) : pas de tournoi, semaine d'entraînement."
    suite = "; ".join(f"semaine {t.semaine} : {t.nom} ({t.categorie}, {NOMS_SURFACES[t.surface]})"
                      for t in a_venir) or "fin de saison"
    prompt = (
        f"Tu es {j.nom}, {j.age} ans, joueur de tennis professionnel fictif, {rang}e au classement. "
        f"Personnalité : {j.personnalite}.\n"
        f"Ton profil : {_profil_txt(j, tournoi.surface if tournoi else 'Hard')}.\n"
        f"Ton état : {_etat_txt(e)}.\n"
        + (f"Ton état mental et social : {social}.\n{REGLES_SOCIALES}\n" if social else "")
        + (f"Ton état physique : {sante}.\n{REGLES_BLESSURES}\n" if sante else "")
        + (f"Avis de ton staff médical : {medecin}\n" if medecin else "")
        + f"{REGLES[version]}\n\n{semaine_txt}\nProchains tournois : {suite}.\n"
        f"Conseil de ton entraîneur : {conseil or 'aucun cette semaine'}\n"
        f"Tes souvenirs importants :\n{souvenirs}\n\n"
        "Décide pour cette semaine. Réponds en JSON : "
        '{"jouer": true ou false (jouer le tournoi de la semaine, false s\'il n\'y en a pas), '
        + ('"entrainement": "service" | "retour" | "physique" | "repos" | "soins", ' if social else
           '"entrainement": "service" | "retour" | "physique" | "repos", ') +
        '"raisonnement": "une ou deux phrases à la première personne"}'
    )
    rep = llm.json("joueur", SYSTEME, prompt, ("jouer", "entrainement", "raisonnement"), sujet=j.id)
    if rep is None:
        base = decision_baseline(e, tournoi, semaine)
        return Decision(base.jouer, base.entrainement, "(repli : réponse LLM invalide)", True)
    entr, exact = choisir(rep.get("entrainement"), ENTRAINEMENTS_V3 if social else ENTRAINEMENTS, "repos")
    jouer = booleen(rep.get("jouer"), False) and tournoi is not None
    return Decision(jouer, entr, str(rep.get("raisonnement", ""))[:400], not exact)


def _tactiques_txt(version: int, j: Joueur, tournoi: Tournoi, adversaires: list) -> str:
    if version == 1:
        return ("Tactiques possibles : « service_agressif » (plus de points au service, moins en retour, "
                "fatigue un peu plus, efficace contre les mauvais retourneurs et sur gazon), "
                "« pression_retour » (l'inverse, efficace contre les serveurs faibles et sur terre), "
                "« equilibre » (neutre). Tu peux être en désaccord avec ton joueur.\n")
    # v2 : effets chiffrés, ordre variable (contre le biais de position), faits sur le tableau
    ordre = list(TACTIQUES_V2)
    random.Random(f"{j.id}-{tournoi.semaine}").shuffle(ordre)
    n_r = sum(1 for a in adversaires if a.profil["surfaces"][tournoi.surface]["retour"] < RETOUR_MOYEN)
    n_s = sum(1 for a in adversaires if a.profil["surfaces"][tournoi.surface]["service"] < SERVICE_MOYEN)
    return ("Tactiques possibles (effets sur les chances de gagner chaque point) :\n"
            + "\n".join(f"- {TACTIQUES_V2[t]}" for t in ordre)
            + f"\nParmi ces {len(adversaires)} adversaires, {n_r} ont un retour sous la moyenne du "
              f"circuit et {n_s} un service sous la moyenne. Tu peux être en désaccord avec ton joueur.\n")


def conseil_entraineur(llm, nom_coach: str, perso_coach: str, j: Joueur, e: Etat,
                       tournoi: Tournoi, adversaires: list, version: int = 2) -> tuple:
    """Renvoie (tactique, conseil, recommande_jouer, repli)."""
    adv_txt = "\n".join(f"- {_profil_txt(a, tournoi.surface)}" for a in adversaires) or "- inconnus"
    prompt = (
        f"Tu es {nom_coach}, entraîneur de tennis ({perso_coach}). Ton joueur : "
        f"{_profil_txt(j, tournoi.surface)}. Personnalité du joueur : {j.personnalite}.\n"
        f"Son état (tu le connais) : {_etat_txt(e)}.\n"
        f"Tournoi : {tournoi.nom} ({tournoi.categorie}, {NOMS_SURFACES[tournoi.surface]}).\n"
        f"Principaux adversaires possibles :\n{adv_txt}\n\n"
        + _tactiques_txt(version, j, tournoi, adversaires) +
        'Réponds en JSON : {"tactique": "...", "recommande_jouer": true ou false, '
        '"conseil": "une ou deux phrases adressées au joueur"}'
    )
    rep = llm.json("entraineur", SYSTEME, prompt, ("tactique", "conseil"), sujet=j.id)
    if rep is None:
        return "equilibre", "", True, True
    tac, exact = choisir(rep.get("tactique"), TACTIQUES, "equilibre")
    return tac, str(rep.get("conseil", ""))[:400], booleen(rep.get("recommande_jouer"), True), not exact


def reflexion(llm, j: Joueur, souvenirs: str, semaine: int) -> tuple:
    """Le joueur tire une leçon de sa semaine. Renvoie (leçon, importance) ou (None, 0)."""
    prompt = (
        f"Tu es {j.nom}, joueur de tennis fictif ({j.personnalite}). Voici tes souvenirs récents "
        f"(nous sommes en semaine {semaine}) :\n{souvenirs}\n\n"
        "Tire UNE leçon concrète pour la suite de ta saison (calendrier, fatigue, tactique, "
        "adversaires, mental). Réponds en JSON : "
        '{"lecon": "une phrase à la première personne", "importance": entier de 1 à 10}'
    )
    rep = llm.json("reflexion", SYSTEME, prompt, ("lecon",), sujet=j.id)
    if rep is None:
        return None, 0
    imp = max(1, min(10, entier_sur(rep.get("importance"), 5)))
    return str(rep["lecon"])[:300], imp


def article(llm, tournoi: Tournoi, faits: list, vainqueur: Joueur) -> dict:
    prompt = (
        f"Tu es journaliste sportif pour « Le Filet », un journal de tennis fictif. "
        f"Le tournoi {tournoi.nom} ({tournoi.categorie}, {NOMS_SURFACES[tournoi.surface]}) "
        f"vient de se terminer. Faits (n'invente aucun résultat) :\n"
        + "\n".join(f"- {f}" for f in faits) +
        f"\n\nÉcris un titre accrocheur, un article de 3 à 4 phrases qui souligne les rivalités ou "
        f"les surprises, et une question piquante pour la conférence de presse de {vainqueur.nom}. "
        'Réponds en JSON : {"titre": "...", "article": "...", "question": "..."}'
    )
    rep = llm.json("journaliste", SYSTEME, prompt, ("titre", "article", "question"),
                   sujet=vainqueur.id)
    if rep is None:
        return {"titre": f"{vainqueur.nom} remporte {tournoi.nom}", "article": " ".join(faits[:3]),
                "question": "Comment abordez-vous la suite de la saison ?", "repli": True}
    return {k: str(rep[k])[:900] for k in ("titre", "article", "question")}


def conference(llm, j: Joueur, e: Etat, question: str) -> dict:
    prompt = (
        f"Tu es {j.nom}, joueur de tennis fictif ({j.personnalite}), en conférence de presse. "
        f"Ton état réel : {_etat_txt(e)}. Le journaliste demande : « {question} »\n"
        "Réponds comme le personnage. Si tu es blessé, tu choisis de le révéler ou de le cacher. "
        'Réponds en JSON : {"reponse": "deux phrases maximum", "revele_blessure": true ou false}'
    )
    rep = llm.json("conference", SYSTEME, prompt, ("reponse",), sujet=j.id)
    if rep is None:
        return {"reponse": "Pas de commentaire.", "revele_blessure": False, "repli": True}
    return {"reponse": str(rep["reponse"])[:400],
            "revele_blessure": booleen(rep.get("revele_blessure"), False) and e.blessure > 0}


def negociation(llm, j: Joueur, e: Etat, rang: int, titres: int, sponsor: tuple,
                tours: int = 3) -> dict:
    """Agent sportif contre sponsor, au plus `tours` allers-retours."""
    nom_s, perso_s, budget = sponsor
    bilan = (f"{rang}e mondial, {e.points} points, {titres} titre(s) cette saison, "
             f"{e.victoires} victoires en {e.matchs} matchs")
    echanges, contrat = [], None
    for _ in range(tours):
        hist = "\n".join(f"- {x['qui']} : {x['montant']} euros ; {x['texte']}" for x in echanges) or "- (début)"
        p_agent = (
            f"Tu es l'agent sportif de {j.nom} ({j.personnalite}). Bilan : {bilan}. "
            f"Tu négocies un contrat de sponsoring annuel avec {nom_s} ({perso_s}). "
            f"Historique :\n{hist}\nFais ta proposition (en euros). "
            'Réponds en JSON : {"montant": entier, "argument": "une phrase"}'
        )
        rep_a = llm.json("agent", SYSTEME, p_agent, ("montant", "argument"), sujet=j.id)
        if rep_a is None:
            break
        demande = entier_sur(rep_a["montant"], -1)
        if demande <= 0:
            break
        demande = max(10000, demande)
        echanges.append({"qui": "agent", "montant": demande, "texte": str(rep_a["argument"])[:300]})
        hist = "\n".join(f"- {x['qui']} : {x['montant']} euros ; {x['texte']}" for x in echanges)
        p_sponsor = (
            f"Tu es responsable partenariats chez {nom_s} ({perso_s}). Budget maximum : {budget} euros. "
            f"Joueur : {j.nom}, {bilan}. Historique :\n{hist}\nDécide. Réponds en JSON : "
            '{"decision": "accepter" | "contre" | "refuser", "montant": entier, "message": "une phrase"}'
        )
        rep_s = llm.json("sponsor", SYSTEME, p_sponsor, ("decision", "montant"), sujet=j.id)
        if rep_s is None:
            break
        decision, _ = choisir(rep_s.get("decision"), ("accepter", "contre", "refuser"), "refuser")
        montant = min(max(0, entier_sur(rep_s.get("montant"), demande)), budget)
        echanges.append({"qui": "sponsor", "montant": montant, "decision": decision,
                         "texte": str(rep_s.get("message", ""))[:300]})
        if decision == "accepter":
            # le sponsor peut accepter à un montant inférieur à la demande
            contrat = min(demande, montant) if montant > 0 else min(demande, budget)
            break
        if decision == "refuser":
            break
    return {"joueur": j.id, "sponsor": nom_s, "echanges": echanges, "contrat": contrat}


# ---------------------------------------------------------------- couche sociale (v3)
def reaction_sanction(llm, j: Joueur, nature: str, motif: str, arbitre: str, adversaire: str,
                      score: str, tournoi: Tournoi) -> dict:
    """Le joueur sanctionné réagit (sur le court puis devant la presse)."""
    quoi = "un avertissement" if nature == "avertissement" else "un point de pénalité"
    prompt = (
        f"Tu es {j.nom}, joueur de tennis fictif ({j.personnalite}). À {tournoi.nom}, contre "
        f"{adversaire}, à {score}, l'arbitre {arbitre} vient de t'infliger {quoi} pour {motif}.\n"
        "Réagis comme le personnage, en restant crédible (pas de violence). Réponds en JSON : "
        '{"sur_le_court": "ce que tu dis à l\'arbitre, une phrase", '
        '"apres_match": "ce que tu dis ensuite à la presse, une phrase", '
        '"excuses": true ou false (reconnais-tu ta faute ?)}'
    )
    rep = llm.json("incident", SYSTEME, prompt, ("sur_le_court", "apres_match"), sujet=j.id)
    if rep is None:
        return {"sur_le_court": "", "apres_match": "Pas de commentaire.", "excuses": False, "repli": True}
    return {"sur_le_court": str(rep["sur_le_court"])[:250], "apres_match": str(rep["apres_match"])[:300],
            "excuses": booleen(rep.get("excuses"), False)}


TONS = ("respect", "neutre", "tension")


def vestiaire(llm, a: Joueur, b: Joueur, contexte: list) -> dict:
    """Deux joueurs se croisent aux vestiaires après leur match (a a gagné)."""
    prompt = (
        f"Vestiaires d'un tournoi de tennis fictif. {a.nom} ({a.personnalite}) vient de battre "
        f"{b.nom} ({b.personnalite}). Contexte réel (n'invente aucun fait) :\n"
        + "\n".join(f"- {c}" for c in contexte) +
        "\n\nÉcris leur bref échange, crédible pour des professionnels (le plus souvent poli, "
        "parfois froid ; jamais d'insulte). Réponds en JSON : "
        '{"replique_vainqueur": "une phrase", "replique_perdant": "une phrase", '
        '"ton": "respect" | "neutre" | "tension"}'
    )
    rep = llm.json("vestiaire", SYSTEME, prompt, ("replique_vainqueur", "replique_perdant", "ton"),
                   sujet=b.id)
    if rep is None:
        return {"replique_vainqueur": "", "replique_perdant": "", "ton": "neutre", "repli": True}
    ton, _ = choisir(rep.get("ton"), TONS, "neutre")
    return {"replique_vainqueur": str(rep["replique_vainqueur"])[:250],
            "replique_perdant": str(rep["replique_perdant"])[:250], "ton": ton}


DECISIONS_FEDERATION = ("aucune", "rappel", "amende")
AMENDE_MAX = 20000


def federation(llm, j: Joueur, incidents: list, reputation: float) -> dict:
    """La commission de discipline examine les incidents d'un joueur sur la période."""
    prompt = (
        "Tu es la commission de discipline de la Fédération du circuit fictif. Tu appliques le "
        "code de conduite avec mesure : un avertissement isolé ne mérite en général qu'un rappel ; "
        "les récidives ou un point de pénalité justifient une amende (au plus "
        f"{AMENDE_MAX} euros).\nJoueur : {j.nom}, réputation {reputation:.0f}/100.\n"
        "Incidents de la période :\n" + "\n".join(f"- {i}" for i in incidents) +
        '\n\nRéponds en JSON : {"decision": "aucune" | "rappel" | "amende", "montant": entier en '
        'euros (0 sauf amende), "communique": "une phrase publique"}'
    )
    rep = llm.json("federation", SYSTEME, prompt, ("decision", "communique"), sujet=j.id)
    if rep is None:
        return {"decision": "rappel", "montant": 0, "communique": "La fédération rappelle le joueur au "
                "respect du code de conduite.", "repli": True}
    dec, _ = choisir(rep.get("decision"), DECISIONS_FEDERATION, "rappel")
    montant = max(0, min(AMENDE_MAX, entier_sur(rep.get("montant"), 0))) if dec == "amende" else 0
    if dec == "amende" and montant == 0:
        dec = "rappel"
    return {"decision": dec, "montant": montant, "communique": str(rep["communique"])[:300]}


AVIS_MEDICAUX = ("jouer", "repos", "soins")


def avis_medical(llm, j: Joueur, e: Etat, sante: str, tournoi: Tournoi | None) -> dict:
    """Le staff médical (médecin et kiné) donne son avis avant la décision du joueur."""
    prompt = (
        f"Tu es le médecin du circuit fictif, avec le kiné de {j.nom} ({j.age} ans). "
        f"Fatigue : {e.fatigue:.0f}/10. État physique : {sante}.\n{REGLES_BLESSURES}\n"
        + (f"Cette semaine : {tournoi.nom} ({tournoi.categorie}).\n" if tournoi else "Pas de tournoi cette semaine.\n")
        + "Ta priorité est la santé du joueur sur toute la saison, pas le résultat de la semaine. "
        'Réponds en JSON : {"avis": "jouer" | "repos" | "soins", "message": "une ou deux phrases '
        'adressées au joueur"}'
    )
    rep = llm.json("medecin", SYSTEME, prompt, ("avis", "message"), sujet=j.id)
    if rep is None:
        avis = "soins" if e.blessure else "repos"
        return {"avis": avis, "message": "", "repli": True}
    avis, _ = choisir(rep.get("avis"), AVIS_MEDICAUX, "soins" if e.blessure else "repos")
    return {"avis": avis, "message": str(rep.get("message", ""))[:300]}


def interview(llm, j: Joueur, contexte: str, question: str) -> dict:
    """Question libre posée depuis le village 3D : le joueur répond, dans son personnage."""
    prompt = (
        f"Tu es {j.nom}, joueur de tennis professionnel fictif ({j.personnalite}). "
        f"Voici ce que tu sais de ta situation, au jour de l'interview (n'invente aucun fait au-delà) :\n"
        f"{contexte}\n\nUn journaliste te pose cette question : « {question} »\n"
        "Réponds comme le personnage, avec naturel, en trois phrases au plus. Si la question sort du "
        "tennis ou de ta vie de joueur, recentre poliment. "
        'Réponds en JSON : {"reponse": "ta réponse", "humeur": "un mot qui décrit ton ton"}'
    )
    rep = llm.json("interview", SYSTEME, prompt, ("reponse",), sujet=j.id)
    if rep is None:
        return {"reponse": "Désolé, je préfère ne pas répondre maintenant.", "humeur": "réservé", "repli": True}
    return {"reponse": str(rep["reponse"])[:600], "humeur": str(rep.get("humeur", ""))[:40]}
