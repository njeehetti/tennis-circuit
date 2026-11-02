// Écran de contrôle du village 3D : les temps forts de la journée, révélés à leur heure pendant la
// lecture et classés par intérêt, avec un bouton pour zoomer sur le lieu ; et la grille de tous les
// agents. Logique d'horaire pure (sans Three.js) ; l'affichage passe par textContent (pas d'injection).
import {TOURS, nomCourt} from "/village3d_jour.js";

// Une journée de tournoi va de 9 h à 22 h ; f (0 à 1) est l'avancée de la journée.
export const heureLib = f => {
  const h = 9 + Math.max(0, Math.min(1, f)) * 13;
  return `${Math.floor(h)} h ${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
};
// Programmation : les courts annexes commencent tôt, le central en fin d'après-midi ;
// un match dure à peu près selon son nombre de sets.
const DEBUT_COURT = {r16a: 0.03, r16b: 0.08, sf: 0.14, qf: 0.22, central: 0.36};
// sets joués (« 6-4 2-1 ab. » : deux sets, le second interrompu)
const nbSets = m => String(m.score || "").split(/\s+/).filter(s => /\d-\d/.test(s)).length || 3;
export function horaire(m) {
  const debut = DEBUT_COURT[m.court] ?? 0.2;
  return {debut, fin: Math.min(0.9, debut + 0.06 + nbSets(m) * 0.085)};
}
const INTERET_TOUR = {R16: 25, QF: 45, SF: 65, F: 90};

// Chaque événement du jour reçoit une heure et un intérêt ; un match donne deux entrées
// (début, puis résultat), pour que l'écran raconte la journée au lieu de tout dire d'un coup.
export function tempsForts(V, rang, nom) {
  const out = [];
  let iSponsor = 0;
  for (const e of V.evenements) {
    const x = {...e, heure: 0.01, interet: 5, etiquette: null};
    if (e.type === "match") {
      const m = e.match, {debut, fin} = horaire(m), sets = nbSets(m);
      const [fav, autre] = rang(m.a) <= rang(m.b) ? [m.a, m.b] : [m.b, m.a];
      out.push({type: "direct", qui: fav, lieu: m.court, heure: debut, interet: INTERET_TOUR[m.tour] - 15, etiquette: "en cours",
                texte: `${TOURS[m.tour].replace(/^./, c => c.toUpperCase())} : ${nom(fav)} (${rang(fav)}e) contre ${nom(autre)} (${rang(autre)}e), ${nomCourt(m.court)}`});
      x.heure = fin; x.interet = INTERET_TOUR[m.tour];
      if (rang(m.a) - rang(m.b) >= 4) { x.interet += 30; x.etiquette = "surprise"; }
      else if (sets === 3 || sets === 5) { x.interet += 10; x.etiquette = "accroché"; }
      if (m.tour === "F") x.etiquette = "titre";
    } else if (e.type === "incident") {
      const h = e.match ? horaire(e.match) : {debut: 0.3, fin: 0.5};
      const n = e.match ? nbSets(e.match) : 3;
      x.heure = h.debut + (h.fin - h.debut) * Math.min(0.95, ((e.set || 1) - 0.5) / n);
      x.interet = e.sanction === "avertissement" ? 50 : 75; x.etiquette = "arbitre";
    } else if (e.type === "tension") { x.heure = 0.94; x.interet = 45; x.etiquette = "vestiaires"; }
    else if (e.type === "vestiaire") { x.heure = 0.94; x.interet = 15; }
    else if (e.type === "sponsor") { x.heure = 0.25 + 0.1 * iSponsor++; x.interet = e.contrat ? 35 : 25; }
    else if (e.type === "presse") { x.heure = 0.96; x.interet = 40; }
    else if (e.type === "federation") { x.heure = 0.98; x.interet = 70; x.etiquette = "sanction"; }
    else if (e.type === "blessure") {
      const h = e.match ? horaire(e.match) : {debut: 0.3, fin: 0.5};
      const n = e.match ? nbSets(e.match) : 3;
      // abandon : juste avant le résultat ; sinon pendant le set concerné, ou à la fin du match
      x.heure = e.abandon ? h.fin - 0.004 : e.set ? h.debut + (h.fin - h.debut) * Math.min(0.9, (e.set - 0.6) / n) : h.fin + 0.003;
      x.interet = e.abandon ? 80 : (e.gravite === "sérieuse" || e.gravite === "modérée" ? 60 : 40) + (e.chronique ? 10 : 0);
      x.etiquette = e.abandon ? "abandon" : "blessure";
    } else if (e.type === "forfait") { x.heure = 0.04; x.interet = 65; x.etiquette = "forfait"; }
    else if (e.type === "gueri") { x.heure = 0.97; x.interet = 30; x.etiquette = "retour"; }
    else if (e.type === "poussee") { x.heure = 0.97; x.interet = 35; x.etiquette = "chronique"; }
    out.push(x);
  }
  return out.sort((a, b) => a.heure - b.heure);
}

// État d'un joueur à l'heure f de la lecture : avant la fin de son match du jour, on montre
// l'état du matin (activité « en cours », jauges d'avant match) ; ensuite le résultat.
export function auMoment(L, f) {
  if (!L || !L.match || !L.avant) return L;
  const {debut, fin} = horaire(L.match);
  if (f >= fin) return {...L, activite: L.activiteApres || L.activite};
  return {...L, ...L.avant, activite: L.avant.activite + (f >= debut ? " (en cours)" : ` (vers ${heureLib(debut)})`)};
}

// blessure en train d'être soignée sur un court : le kiné y est appelé
export function soinsEnCours(liste, f) {
  return liste.filter(x => x.type === "blessure" && x.match && x.heure <= f && f < x.heure + 0.05).pop() || null;
}

export function texteSante(s) {
  if (!s) return "";
  const parts = [];
  if (s.blesse) parts.push(`${s.zone} (${s.gravite})`);
  if (s.chroniques && s.chroniques.length) parts.push(`chronique : ${s.chroniques.join(", ")}`);
  return parts.join(" ; ");
}

// « Entraînement » seul ne dit pas où : on précise service ou retour
const lieuNom = (LIEUX, l) => (LIEUX[l] ? LIEUX[l].titre + (LIEUX[l].titre === "Entraînement" && LIEUX[l].role ? ` ${LIEUX[l].role}` : "") : "");

function el(tag, attrs, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") n.className = v; else if (k === "style") n.style.cssText = v; else n.setAttribute(k, v);
  }
  for (const e of enfants) if (e !== null && e !== undefined && e !== false) n.append(e instanceof Node ? e : String(e));
  return n;
}

// ------------------------------------------------------------------ panneau des temps forts
export function creerControle({LIEUX, voir, REDUIT}) {
  const $ = id => document.getElementById(id);
  const lieuLib = l => lieuNom(LIEUX, l);
  let liste = [], vus = 0, dernierAuto = null, signature = "";

  function bouton(x, texte) {
    const b = el("button", {type: "button", class: "voir"}, texte);
    b.addEventListener("click", ev => { ev.stopPropagation(); voir(x.lieu, x.qui, true); });
    return b;
  }
  function ligne(x, nouveau) {
    return el("li", {class: x.type + (nouveau && !REDUIT ? " nouveau" : "") + (x.interet >= 60 ? " fort" : "")},
      el("div", {class: "tf-meta"}, el("time", {}, heureLib(x.heure)), x.lieu ? el("span", {class: "tf-lieu"}, lieuLib(x.lieu)) : null,
         x.etiquette ? el("span", {class: "tf-tag"}, x.etiquette) : null),
      el("p", {}, x.texte), x.lieu ? bouton(x, "Voir") : null);
  }

  // f : avancée de la journée (1 hors lecture : tout est connu) ; suivre : la caméra va aux temps forts.
  function afficher(f, titre, enLecture, suivre) {
    const connus = liste.filter(x => x.heure <= f);
    $("horloge").textContent = enLecture ? heureLib(f) : "bilan";
    const sig = titre + "|" + connus.length;
    if (sig === signature) return false;
    const nouveaux = Math.max(0, connus.length - vus);
    signature = sig;
    $("journal-titre").textContent = titre;
    // à la une : l'événement connu le plus intéressant (le plus récent en cas d'égalité)
    const une = connus.reduce((b, x) => (!b || x.interet >= b.interet ? x : b), null);
    const zone = $("a-la-une");
    zone.replaceChildren();
    if (une && une.interet >= 25) {
      zone.append(el("small", {}, enLecture ? "Le temps fort du moment" : "Le temps fort du jour"),
                  el("p", {}, une.texte),
                  el("div", {class: "tf-meta"}, el("time", {}, heureLib(une.heure)), une.lieu ? el("span", {class: "tf-lieu"}, lieuLib(une.lieu)) : null),
                  une.lieu ? bouton(une, `Zoomer sur ${lieuLib(une.lieu) || "le lieu"}`) : null);
    } else zone.append(el("small", {}, enLecture ? "La journée commence…" : "Journée calme"));
    const ol = $("evenements");
    ol.replaceChildren(...[...connus].reverse().map((x, i) => ligne(x, enLecture && i < nouveaux)));
    if (!connus.length) ol.append(el("li", {class: "info"}, el("p", {}, enLecture ? "Rien encore : les premiers matchs vont commencer." : "Rien de particulier ce jour-là.")));
    // la caméra suit le dernier temps fort qui vient d'apparaître
    if (suivre && enLecture && nouveaux > 0) {
      const cible = connus.slice(vus).filter(x => x.lieu && x.interet >= 45).pop();
      if (cible && cible !== dernierAuto) { dernierAuto = cible; voir(cible.lieu, cible.qui, false); }
    }
    vus = connus.length;
    return true;
  }
  return {
    nouvelleJournee(l) { liste = l; vus = 0; dernierAuto = null; signature = ""; },
    afficher,
    liste: () => liste,
  };
}

// ------------------------------------------------------------------ grille de tous les agents
const COLONNES = [
  ["rang", "Rang", x => x.rang], ["nom", "Joueur", x => x.nom], ["pilote", "Pilote", x => x.pilote],
  ["activite", "Aujourd'hui", x => x.activite], ["lieu", "Où", x => x.lieuLib],
  ["moral", "Moral", x => x.moral], ["popularite", "Popul.", x => x.popularite], ["reputation", "Répu.", x => x.reputation],
  ["fatigue", "Fatigue", x => x.fatigue], ["sante", "Santé", x => x.santeTri], ["sanctions", "Sanct.", x => x.sanctions],
  ["points", "Points", x => x.points],
];
const GRAVITE_TRI = {"": 0, "gêne": 1, "légère": 2, "modérée": 3, "sérieuse": 4};
export function creerGrille({LIEUX, voir}) {
  const $ = id => document.getElementById(id);
  let tri = {cle: "rang", sens: 1}, lignes = [];
  const cellJauge = (v, inverse, max = 100) => {
    if (v === undefined || v === null) return el("td", {class: "num"}, "–");
    const pc = Math.round(v / max * 100), x = inverse ? 100 - pc : pc;
    const c = x >= 60 ? "#52b788" : x >= 40 ? "#f4a261" : "#e63946";
    return el("td", {class: "num jauge"}, el("i", {style: `width:${pc}%;background:${c}`}), max === 10 ? `${Math.round(v)}/10` : Math.round(v));
  };
  function rendre() {
    const col = COLONNES.find(c => c[0] === tri.cle);
    const tries = [...lignes].sort((a, b) => {
      const u = col[2](a), v = col[2](b);
      return (typeof u === "number" && typeof v === "number" ? u - v : String(u ?? "").localeCompare(String(v ?? ""), "fr")) * tri.sens;
    });
    const tete = el("tr", {}, ...COLONNES.map(([cle, lib]) => {
      const th = el("th", {scope: "col", "aria-sort": tri.cle === cle ? (tri.sens > 0 ? "ascending" : "descending") : "none"});
      const b = el("button", {type: "button"}, lib, tri.cle === cle ? (tri.sens > 0 ? " ▲" : " ▼") : "");
      b.addEventListener("click", () => { tri = {cle, sens: tri.cle === cle ? -tri.sens : (cle === "rang" || cle === "nom" ? 1 : -1)}; rendre(); });
      th.append(b);
      return th;
    }));
    const corps = tries.map(x => {
      const tr = el("tr", {tabindex: 0, title: "Voir ce joueur dans le village"},
        el("td", {class: "num"}, x.rang), el("td", {class: "nom"}, el("i", {class: "pastille", style: `background:${x.couleur}`}), x.nom),
        el("td", {}, el("span", {class: "badge" + (x.ia ? " ia" : "")}, x.pilote)),
        el("td", {class: "act"}, x.activite), el("td", {}, x.lieuLib),
        cellJauge(x.moral), cellJauge(x.popularite), cellJauge(x.reputation), cellJauge(x.fatigue, true, 10),
        el("td", {class: "sante" + (x.blesse ? " blesse" : "")}, x.santeTxt || ""),
        el("td", {class: "num"}, x.sanctions || ""), el("td", {class: "num"}, x.points));
      const go = () => voir(x.lieu, x.id, true);
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      return tr;
    });
    $("grille-table").replaceChildren(el("thead", {}, tete), el("tbody", {}, ...corps));
  }
  return {
    mettreAJour(joueurs, V, rang, couleurCss, incidents, moment = L => L) {
      lignes = joueurs.map(j => {
        const L = moment(V.lieux.get(j.id) || {}) || {};
        const s = L.sante || {};
        return {id: j.id, rang: rang(j.id), nom: j.nom, ia: j.pilote === "llm", pilote: j.pilote === "llm" ? "IA" : "règle",
                activite: L.activite || "", lieu: L.lieu, lieuLib: lieuNom(LIEUX, L.lieu),
                moral: L.moral, popularite: L.popularite, reputation: L.reputation, fatigue: L.fatigue,
                sanctions: incidents.filter(i => i.joueur === j.id).length, points: V.points[j.id] ?? 0, couleur: couleurCss(j),
                blesse: !!s.blesse, santeTxt: texteSante(s),
                santeTri: (GRAVITE_TRI[s.gravite] || 0) * 10 + (s.chroniques ? s.chroniques.length : 0)};
      });
      if (!$("grille").hidden) rendre();
    },
    rendre,
  };
}
