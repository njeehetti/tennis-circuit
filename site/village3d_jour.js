// État du village pour un jour donné d'une semaine (logique pure, sans Three.js).
// Programme d'une semaine de tournoi, identique à tennis/saison.py (JOURS_TOUR).
export const JOURS = [
  {n: 1, court: "Lun", lib: "1er tour"}, {n: 2, court: "Mar", lib: "1er tour"},
  {n: 3, court: "Mer", lib: "quarts"}, {n: 4, court: "Jeu", lib: "quarts"},
  {n: 5, court: "Ven", lib: "médias"}, {n: 6, court: "Sam", lib: "demies"},
  {n: 7, court: "Dim", lib: "finale"},
];
export const TOURS = {V: "titre", F: "finale", SF: "demi-finale", QF: "quart de finale", R16: "premier tour"};
const JOUR_PAR_DEFAUT = {R16: 1, QF: 3, SF: 6, F: 7};            // saisons v2 (sans « jour »)
const COURTS_DU_JOUR = {R16: ["central", "sf", "qf", "r16a", "r16b"], QF: ["central", "sf"],
                        SF: ["central", "sf"], F: ["central"]};
const NOM_COURT = {central: "court central", sf: "Court 1", qf: "Court 2", r16a: "Court 3", r16b: "Court 4"};
const ORDRE_TOUR = {R16: 0, QF: 1, SF: 2, F: 3};
const AFFLUENCE = {"250": 0.45, "500": 0.6, "1000": 0.75, Majeur: 0.95};
const AFFLUENCE_TOUR = {R16: 0.6, QF: 0.8, SF: 0.95, F: 1};
const AFFLUENCE_COURT = {central: 1, sf: 0.85, qf: 0.75, r16a: 0.6, r16b: 0.6};
const ENTRAINEMENT_LIEU = {service: "service", retour: "retour", physique: "physique", repos: "repos", soins: "infirmerie"};

export const jourDe = m => m.jour || JOUR_PAR_DEFAUT[m.tour] || 7;
export const semainesFaites = e => (e && e.saison) ? (e.saison.semaine_atteinte || e.saison.semaines.length) : 0;
export const nomCourt = c => NOM_COURT[c] || c;
const nomCourt2 = id => (id || "").split(" ").pop();

function classementA(S, k) {
  const c = S.classements.filter(x => x.semaine <= k).pop() || S.classements[0];
  return c.points;
}

function socialA(S, k) {
  if (!S.social) return null;
  return (S.social.filter(x => x.semaine <= k).pop() || S.social[0]).joueurs;
}

// Vue cumulée, arrêtée à la fin de la semaine k.
export function vueSemaine(S, k) {
  const pts = classementA(S, k);
  const matchs = S.matchs.filter(m => m.semaine <= k), finales = S.finales.filter(f => f.semaine <= k);
  const negos = (S.negociations || []).filter(n => n.semaine <= k);
  const joueurs = S.joueurs.map(j => {
    const contrat = negos.filter(n => n.joueur === j.id && n.contrat).pop();
    return {...j, points: pts[j.id], titres: finales.filter(f => f.vainqueur === j.id).length,
      matchs: matchs.filter(m => m.vainqueur === j.id || m.perdant === j.id).length,
      victoires: matchs.filter(m => m.vainqueur === j.id).length, sponsor: contrat ? contrat.sponsor : "",
      memoire: j.memoire.filter(m => m.semaine <= k)};
  });
  return {...S, joueurs, matchs, finales, negociations: negos,
          semaines: S.semaines.filter(w => w.semaine <= k), articles: S.articles.filter(a => a.semaine <= k),
          incidents: (S.incidents || []).filter(i => i.semaine <= k),
          vestiaires: (S.vestiaires || []).filter(v => v.semaine <= k),
          federation: (S.federation || []).filter(f => f.semaine <= k),
          blessures: (S.blessures || []).filter(b => b.semaine <= k)};
}

const BLESSURES_MATCH = ["blessure", "rechute", "aggravation"];

// Le cœur : où est chacun, que fait-il, qui joue où, que s'est-il dit, ce jour-là.
export function vueJour(S, k, d) {
  const semaine = S.semaines.find(w => w.semaine === k);
  const tournoi = semaine && semaine.tournoi ? S.calendrier.find(t => t.nom === semaine.tournoi) : null;
  const jour = tournoi ? d : 7;
  const nom = id => (S.joueurs.find(j => j.id === id) || {nom: id}).nom;
  const court = id => nomCourt2(nom(id));
  const decisions = new Map((semaine ? semaine.decisions : []).map(x => [x.joueur, x]));
  const matchsSem = S.matchs.filter(m => m.semaine === k);
  const incidents = (S.incidents || []).filter(i => i.semaine === k);
  const vestiaires = (S.vestiaires || []).filter(v => v.semaine === k);
  const federation = (S.federation || []).filter(f => f.semaine === k);
  const negos = (S.negociations || []).filter(n => n.semaine === k);
  const article = S.articles.find(a => a.semaine === k);
  const blessuresSem = (S.blessures || []).filter(b => b.semaine === k);
  const santeDebut = (socialA(S, k - 1) || {});

  // matchs du jour et attribution des courts
  // les forfaits ne se jouent pas : pas de court, seulement un événement
  const duJour = matchsSem.filter(m => jourDe(m) === jour && !m.forfait).sort((a, b) => ORDRE_TOUR[a.tour] - ORDRE_TOUR[b.tour]);
  const matchs = duJour.map((m, i) => {
    const c = (COURTS_DU_JOUR[m.tour] || COURTS_DU_JOUR.R16)[i] || "r16b";
    const s = m.soutien || {};
    return {...m, court: c, a: m.vainqueur, b: m.perdant, soutienA: s[m.vainqueur] || 0,
            sanctionsDuMatch: incidents.filter(x => jourDe(x) === jour && x.tour === m.tour &&
              [m.vainqueur, m.perdant].includes(x.joueur))};
  });
  const enMatch = new Map();
  matchs.forEach(m => { enMatch.set(m.a, m); enMatch.set(m.b, m); });

  // jauges du jour : départ de semaine, puis après chaque match joué jusqu'à ce jour
  const socFin = jour === 7 ? socialA(S, k) : null;
  // aujourdhui=false : l'état du matin, avant le match du jour (l'horloge de la lecture choisit)
  const etat = (id, aujourdhui = true) => {
    const dec = decisions.get(id) || {};
    let moral = dec.moral, pop = dec.popularite, rep = dec.reputation, fat = dec.fatigue || 0;
    const fini = x => (aujourdhui ? jourDe(x) <= jour : jourDe(x) < jour);
    for (const m of matchsSem.filter(x => fini(x) && (x.vainqueur === id || x.perdant === id))) {
      if (m.moral_apres) { moral = m.moral_apres[id]; pop = m.popularite_apres[id]; }
      if (m.fatigue_apres) fat = m.fatigue_apres[id];
    }
    if (aujourdhui && socFin && socFin[id]) ({moral, popularite: pop, reputation: rep} = socFin[id]);
    return {moral, popularite: pop, reputation: rep, fatigue: fat, sante: santeA(id, aujourdhui)};
  };
  // santé : début de semaine, puis blessures de la semaine jusqu'à ce jour
  const santeA = (id, aujourdhui = true) => {
    const s0 = santeDebut[id] || {};
    let zone = s0.blessure ? s0.zone : "", gravite = s0.blessure ? s0.gravite : "";
    const chroniques = [...(s0.chroniques || [])];
    for (const b of blessuresSem.filter(x => x.joueur === id && BLESSURES_MATCH.includes(x.type)
                                         && (aujourdhui ? jourDe(x) <= jour : jourDe(x) < jour))) {
      zone = b.zone; gravite = b.gravite;
      if (b.chronique && !chroniques.includes(b.zone)) chroniques.push(b.zone);
    }
    if (jour === 7 && aujourdhui) {
      for (const b of blessuresSem.filter(x => x.joueur === id && x.type === "gueri")) { zone = ""; gravite = ""; }
    }
    return {zone, gravite, chroniques, blesse: !!zone};
  };

  const lieux = new Map();
  for (const j of S.joueurs) {
    const dec = decisions.get(j.id) || {entrainement: "repos"};
    const entr = ENTRAINEMENT_LIEU[dec.entrainement] || "repos";
    const sesMatchs = matchsSem.filter(m => m.vainqueur === j.id || m.perdant === j.id)
      .sort((a, b) => jourDe(a) - jourDe(b));
    const elimine = sesMatchs.find(m => m.perdant === j.id && jourDe(m) < jour);
    const prochain = sesMatchs.find(m => jourDe(m) > jour);
    const m = enMatch.get(j.id);
    const sante = santeA(j.id);
    const abandonne = sesMatchs.find(x => x.abandon === j.id && jourDe(x) < jour);
    const forfait = sesMatchs.find(x => x.forfait === j.id && jourDe(x) <= jour);
    let lieu, activite;
    if (!tournoi) {
      lieu = dec.blessure > 0 ? "infirmerie" : entr;
      activite = dec.blessure > 0 ? "soigne sa blessure" : `semaine d'entraînement (${dec.entrainement})`;
    } else if (m) {
      const adv = m.a === j.id ? m.b : m.a;
      lieu = m.court;
      activite = `${TOURS[m.tour]} contre ${nom(adv)}, ${nomCourt(m.court)}`;
    } else if (!dec.jouer || !sesMatchs.length) {
      lieu = dec.blessure > 0 ? "infirmerie" : entr;
      activite = dec.blessure > 0 ? "blessé, ne joue pas cette semaine" : `ne joue pas ${tournoi.nom} (${dec.entrainement})`;
    } else if (forfait || abandonne) {
      lieu = "infirmerie";
      activite = forfait ? `forfait (${sante.zone || "blessure"}), soigné à l'infirmerie`
        : `a abandonné contre ${nom(abandonne.vainqueur)} (${sante.zone || "blessure"}), soigné à l'infirmerie`;
    } else if (elimine) {
      lieu = dec.blessure > 0 || sante.blesse ? "infirmerie" : entr;
      activite = `éliminé par ${nom(elimine.vainqueur)} (${TOURS[elimine.tour]})`;
    } else if (prochain) {
      lieu = jour === 5 ? "presse" : entr === "physique" || entr === "repos" ? entr : entr;
      activite = jour === 5 ? `journée médias avant sa ${TOURS[prochain.tour]}` :
        `prépare sa ${TOURS[prochain.tour]} (${jourNom(jourDe(prochain))})`;
    } else {
      lieu = "central";
      activite = "vainqueur du tournoi";
    }
    // avant / après le match du jour : l'écran de contrôle choisit selon l'heure
    const adv = m ? (m.a === j.id ? m.b : m.a) : null;
    const apres = m ? (m.a === j.id ? `a battu ${nom(adv)} ${m.score}` : `battu par ${nom(adv)} ${m.score}`) : null;
    lieux.set(j.id, {lieu, activite, match: m || null, ...etat(j.id), bulle: null, carton: null,
                     coupe: !!(tournoi && jour === 7 && dec.tour === "V"), blesse: dec.blessure > 0 || sante.blesse,
                     avant: m ? {...etat(j.id, false), activite: `${TOURS[m.tour]} contre ${nom(adv)}, ${nomCourt(m.court)}`} : null,
                     activiteApres: apres});
  }

  // le soir après un match chargé, on se croise aux vestiaires (montré le lendemain matin)
  const evenements = [];
  for (const v of vestiaires) {
    if (jourDe(v) === jour - 1) {
      for (const [id, dit] of [[v.perdant, v.replique_perdant], [v.vainqueur, v.replique_vainqueur]]) {
        const L = lieux.get(id);
        if (L && !L.match && !L.coupe) { L.lieu = "vestiaires"; L.bulle = {role: `Aux vestiaires (${v.ton})`, texte: dit}; }
      }
    }
    if (jourDe(v) === jour) {
      evenements.push({type: v.ton === "tension" ? "tension" : "vestiaire", qui: v.perdant, lieu: "vestiaires",
        texte: `Vestiaires, ambiance ${v.ton} : ${court(v.vainqueur)} « ${v.replique_vainqueur} » ; ${court(v.perdant)} « ${v.replique_perdant} »`});
    }
  }
  for (const i of incidents.filter(x => jourDe(x) === jour)) {
    const L = lieux.get(i.joueur);
    const quoi = i.sanction === "avertissement" ? "Avertissement" : "Point de pénalité";
    if (L) { L.carton = i.sanction; L.bulle = {role: `${quoi} (${i.arbitre})`, texte: i.sur_le_court || i.motif}; }
    evenements.push({type: "incident", qui: i.joueur, lieu: L && L.match ? L.match.court : L ? L.lieu : null,
      match: L ? L.match : null, set: i.set, sanction: i.sanction,
      texte: `${quoi} pour ${court(i.joueur)} (${i.motif}), set ${i.set}, arbitre ${i.arbitre}${i.sur_le_court ? ` : « ${i.sur_le_court} »` : ""}${i.excuses ? ", excuses ensuite" : ""}`});
  }
  for (const m of matchs) {
    const pub = Math.abs(m.soutienA) >= 0.3 ? `, public pour ${court(m.soutienA > 0 ? m.a : m.b)}` : "";
    evenements.unshift({type: "match", qui: m.a, lieu: m.court, match: m,
      texte: `${TOURS[m.tour].replace(/^./, c => c.toUpperCase())}, ${nomCourt(m.court)} : ${court(m.a)} bat ${court(m.b)} ${m.score}${pub}`});
  }
  for (const b of blessuresSem.filter(x => jourDe(x) === jour)) {
    const mm = matchs.find(x => [x.a, x.b].includes(b.joueur) && x.tour === b.tour);
    if (BLESSURES_MATCH.includes(b.type)) {
      const L = lieux.get(b.joueur);
      if (L && b.abandon) L.bulle = {role: "Abandon", texte: `Blessure : ${b.zone}.`};
      evenements.push({type: "blessure", qui: b.joueur, lieu: mm ? mm.court : "infirmerie", match: mm || null,
        set: b.set, abandon: b.abandon, gravite: b.gravite, chronique: b.chronique,
        texte: `${court(b.joueur)} ${b.type === "aggravation" ? "aggrave sa blessure" : b.type === "rechute" ? "rechute" : "se blesse"} `
          + `(${b.zone}, ${b.gravite})${b.set ? ` au ${b.set}${b.set === 1 ? "er" : "e"} set` : " en fin de match"} contre ${court(b.adversaire)}`
          + `${b.abandon ? " et abandonne" : ""}${b.chronique ? " ; la blessure devient chronique" : ""}`});
    } else if (b.type === "forfait") {
      evenements.push({type: "forfait", qui: b.joueur, lieu: "infirmerie",
        texte: `${court(b.joueur)} déclare forfait (${b.zone}, ${b.gravite}) : ${court(b.adversaire)} passe sans jouer (${TOURS[b.tour]})`});
    } else if (b.type === "gueri") {
      evenements.push({type: "gueri", qui: b.joueur, lieu: "infirmerie", texte: `${court(b.joueur)} est guéri (${b.zone}) et reprend l'entraînement`});
    } else if (b.type === "poussee") {
      evenements.push({type: "poussee", qui: b.joueur, lieu: "infirmerie", texte: `Poussée chronique pour ${court(b.joueur)} (${b.zone}) : la fatigue réveille la douleur`});
    }
  }
  const figurants = {};
  if (tournoi && jour === 5) {
    for (const n of negos) {
      const L = lieux.get(n.joueur);
      if (L && !L.match) { L.lieu = "sponsors"; L.activite = `négocie avec ${n.sponsor}`; }
      const fin = n.echanges[n.echanges.length - 1];
      evenements.push({type: "sponsor", qui: n.joueur, lieu: "sponsors", contrat: !!n.contrat, texte: n.contrat
        ? `${court(n.joueur)} signe avec ${n.sponsor} : ${n.contrat.toLocaleString("fr-FR")} €`
        : `${court(n.joueur)} et ${n.sponsor} ne trouvent pas d'accord`});
      if (fin) figurants[fin.qui === "agent" ? "agent" : "sponsor"] = {role: fin.qui === "agent" ? "Agent" : n.sponsor, texte: fin.texte};
    }
  }
  if (jour === 7 && article) {
    figurants.journaliste = {role: "Le Filet", texte: article.titre};
    const L = lieux.get(article.champion);
    if (L) L.bulle = {role: "Conférence de presse", texte: article.reponse};
    evenements.push({type: "presse", qui: article.champion, lieu: "presse", texte: `Le Filet : « ${article.titre} »`});
  }
  if (jour === 7 && federation.length) {
    const f = federation[federation.length - 1];
    figurants.federation = {role: "Fédération", texte: f.communique};
    for (const x of federation) {
      const L = lieux.get(x.joueur);
      if (L && !L.match && !L.coupe) { L.lieu = "federation"; L.activite = "convoqué par la commission de discipline"; }
      evenements.push({type: "federation", qui: x.joueur, lieu: "federation", texte: `Fédération : ${x.decision}${x.montant ? ` de ${x.montant.toLocaleString("fr-FR")} €` : ""} pour ${court(x.joueur)}. « ${x.communique} »`});
    }
  }
  if (!tournoi) evenements.push({type: "info", texte: "Pas de tournoi : les joueurs s'entraînent ou récupèrent."});
  else if (!matchs.length && jour === 5) evenements.push({type: "info", texte: "Journée médias : conférences, sponsors, entraînement léger."});

  // public de chaque court
  const publicCourts = {};
  for (const m of matchs) {
    const pops = [lieux.get(m.a).popularite, lieux.get(m.b).popularite].filter(x => x !== undefined);
    const vedette = pops.length ? (Math.max(...pops) - 50) / 200 : 0;
    publicCourts[m.court] = {a: m.a, b: m.b, soutienA: m.soutienA,
      occupation: Math.max(0.15, Math.min(1, (AFFLUENCE[tournoi.categorie] || 0.5) * AFFLUENCE_TOUR[m.tour]
                                            * AFFLUENCE_COURT[m.court] + vedette))};
  }
  return {semaine: k, jour, tournoi, lieux, matchs, evenements, figurants, publicCourts,
          points: classementA(S, jour === 7 ? k : k - 1), sansDonneesSociales: !S.social};
}

export const jourNom = n => ({1: "lundi", 2: "mardi", 3: "mercredi", 4: "jeudi", 5: "vendredi", 6: "samedi", 7: "dimanche"})[n];
