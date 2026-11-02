// Tableau du tournoi (huitièmes → finale), rempli au fil de la lecture : un résultat n'apparaît
// qu'une fois le match terminé à l'horloge ; un match du jour est « en cours » ou « à venir ».
// Les matchs sont enregistrés dans l'ordre du tableau (moitié haute d'abord) par tennis/saison.py.
import {TOURS, jourDe} from "./village3d_jour.js";
import {heureLib, horaire} from "./village3d_controle.js";

const ORDRE = ["R16", "QF", "SF", "F"];
const COURTS_DU_JOUR = {R16: ["central", "sf", "qf", "r16a", "r16b"], QF: ["central", "sf"], SF: ["central", "sf"], F: ["central"]};

function el(tag, attrs, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") n.className = v; else n.setAttribute(k, v);
  }
  for (const e of enfants) if (e !== null && e !== undefined && e !== false) n.append(e instanceof Node ? e : String(e));
  return n;
}

// État d'un match à (jour, f) : "fini" | "en cours" | "aujourd'hui" | "à venir"
export function etatMatch(m, jour, f, court) {
  const d = jourDe(m);
  if (d < jour) return "fini";
  if (d > jour) return "à venir";
  if (m.forfait) return f >= 0.04 ? "fini" : "aujourd'hui";
  const {debut, fin} = horaire({...m, court});
  return f >= fin ? "fini" : f >= debut ? "en cours" : "aujourd'hui";
}

// Court du match ce jour-là (même règle que village3d_jour.js : ordre des tours puis ordre d'enregistrement).
function courtDe(m, tous) {
  const meme = tous.filter(x => x.semaine === m.semaine && jourDe(x) === jourDe(m) && !x.forfait)
    .sort((a, b) => ORDRE.indexOf(a.tour) - ORDRE.indexOf(b.tour));
  return (COURTS_DU_JOUR[m.tour] || COURTS_DU_JOUR.R16)[meme.indexOf(m)] || "r16b";
}

export function creerTableau({nomDe, couleurDe, voir}) {
  const $ = id => document.getElementById(id);
  function rendre(S, k, jour, f, tournoi) {
    const zone = $("tableau-corps");
    zone.replaceChildren();
    $("tableau-titre").textContent = tournoi ? `Tableau : ${tournoi.nom}` : "Pas de tournoi cette semaine";
    if (!tournoi) return;
    const tous = S.matchs.filter(m => m.semaine === k);
    const qualifies = new Map();            // tour -> vainqueurs des matchs terminés de ce tour, à cette heure
    const colonnes = ORDRE.map(tour => {
      const matchs = tous.filter(m => m.tour === tour);
      const col = el("div", {class: "tb-col"}, el("h3", {}, TOURS[tour].replace(/^./, c => c.toUpperCase())));
      if (!matchs.length) col.append(el("p", {class: "tb-vide"}, "–"));
      for (const m of matchs) {
        const court = courtDe(m, S.matchs);
        const e = etatMatch(m, jour, f, court);
        // au premier tour tout le monde est connu (tirage) ; ensuite il faut avoir gagné, à cette heure,
        // son match du tour précédent (ou ne pas en avoir joué : exempté)
        const prec = ORDRE[ORDRE.indexOf(tour) - 1];
        const visible = id => tour === "R16" || (qualifies.get(prec) || new Set()).has(id)
          || !tous.some(x => x.tour === prec && (x.vainqueur === id || x.perdant === id));
        const nomOuQ = id => (visible(id) ? nomDe(id) : "?");
        const ligne = (id, gagne) => el("div", {class: "tb-j" + (e === "fini" ? (gagne ? " gagne" : " perd") : "")},
          el("i", {class: "pastille", style: `background:${visible(id) ? couleurDe(id) : "#c9cfca"}`}), nomOuQ(id));
        // l'ordre affiché ne trahit pas le vainqueur : ordre alphabétique des identifiants
        const [x, y] = [m.vainqueur, m.perdant].sort();
        const statut = e === "fini" ? (m.forfait ? "forfait" : m.score)
          : e === "en cours" ? "en cours" : e === "aujourd'hui" ? `aujourd'hui, ${heureLib(horaire({...m, court}).debut)}` : "à venir";
        const carte = el("button", {type: "button", class: "tb-match " + e.replace(/[' ]/g, "-")},
          ligne(x, x === m.vainqueur), ligne(y, y === m.vainqueur), el("small", {}, statut));
        carte.addEventListener("click", () => voir(court, e === "fini" ? m.vainqueur : x));
        col.append(carte);
        if (e === "fini") qualifies.set(tour, (qualifies.get(tour) || new Set()).add(m.vainqueur));
      }
      return col;
    });
    const finale = tous.find(m => m.tour === "F");
    const champion = finale && etatMatch(finale, jour, f, "central") === "fini" ? finale.vainqueur : null;
    colonnes.push(el("div", {class: "tb-col tb-champion"}, el("h3", {}, "Vainqueur"),
      champion ? el("div", {class: "tb-coupe"}, "🏆 ", nomDe(champion)) : el("p", {class: "tb-vide"}, "?")));
    zone.append(...colonnes);
  }
  return {rendre};
}
