// Vue « complexe de tennis » : un bonhomme par agent, placé selon ce qu'il fait,
// cliquable pour voir son état. Utilise el() et ROLES définis dans direct.html.
"use strict";

const SVGNS = "http://www.w3.org/2000/svg";
const LARGEUR = 1200, HAUTEUR = 660;
const SURFACES = {Hard: ["dur", "#3d6fa6"], Clay: ["terre battue", "#c0673d"], Grass: ["gazon", "#4c8c44"]};
const MAILLOTS = ["#e4572e", "#2e86ab", "#f3a712", "#7b2cbf", "#29a36a", "#d1495b", "#00a6a6", "#8c6d46"];
const PEAUX = ["#f2d0b1", "#d9a77c", "#a8754f", "#7a5236"];

// Zones du complexe (coordonnées du viewBox).
const ZONES = {
  central:    {x: 390, y: 30,  w: 420, h: 250, titre: "Court central · finale", court: true},
  sf:         {x: 30,  y: 30,  w: 330, h: 120, titre: "Court 1 · demi-finales", court: true},
  qf:         {x: 30,  y: 165, w: 330, h: 115, titre: "Court 2 · quarts de finale", court: true},
  r16a:       {x: 840, y: 30,  w: 330, h: 120, titre: "Court 3 · premier tour", court: true},
  r16b:       {x: 840, y: 165, w: 330, h: 115, titre: "Court 4 · premier tour", court: true},
  vestiaires: {x: 30,  y: 310, w: 270, h: 150, titre: "Vestiaires · inscrits cette semaine"},
  service:    {x: 320, y: 310, w: 320, h: 150, titre: "Entraînement · service"},
  retour:     {x: 660, y: 310, w: 320, h: 150, titre: "Entraînement · retour"},
  physique:   {x: 1000, y: 310, w: 170, h: 150, titre: "Musculation · physique"},
  repos:      {x: 30,  y: 480, w: 330, h: 150, titre: "Salon de récupération · repos"},
  infirmerie: {x: 380, y: 480, w: 180, h: 150, titre: "Infirmerie"},
  presse:     {x: 580, y: 480, w: 280, h: 150, titre: "Salle de presse"},
  sponsors:   {x: 880, y: 480, w: 290, h: 150, titre: "Salon des sponsors"},
};
const TOUR_ZONE = {V: "central", F: "central", SF: "sf", QF: "qf"};
const PLACE = 62;       // largeur idéale d'une place (joueur + entraîneur)
const RANG = 58;        // hauteur d'un personnage (antenne → nom)

function s(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  return n;
}
function hachage(txt) { let h = 0; for (const c of txt) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

// ------------------------------------------------------------- décor
function dessinerDecor(svg) {
  svg.append(s("rect", {x: 0, y: 0, width: LARGEUR, height: HAUTEUR, class: "sol"}));
  for (const [id, z] of Object.entries(ZONES)) {
    const g = s("g", {id: "zone-" + id});
    if (z.court) {
      g.append(s("rect", {x: z.x, y: z.y, width: z.w, height: z.h, rx: 6, class: "court"}));
      const m = 14;   // lignes du court
      g.append(s("rect", {x: z.x + m, y: z.y + 22, width: z.w - 2 * m, height: z.h - 22 - m, class: "lignes"}));
      g.append(s("line", {x1: z.x + z.w / 2, y1: z.y + 18, x2: z.x + z.w / 2, y2: z.y + z.h - 8, class: "filet"}));
    } else {
      g.append(s("rect", {x: z.x, y: z.y, width: z.w, height: z.h, rx: 10, class: "salle salle-" + id}));
    }
    const t = s("text", {x: z.x + 10, y: z.y + 15, class: "titre-zone" + (z.court ? " titre-court" : "")});
    t.textContent = z.titre;
    g.append(t);
    svg.append(g);
  }
}

// ------------------------------------------------------------- bonshommes
function bonhomme({maillot, peau, antenne, casquette, petit}) {
  const k = petit ? 0.78 : 1;
  const g = s("g", {class: "corps"});
  g.append(s("ellipse", {cx: 0, cy: 2, rx: 11 * k, ry: 3.5 * k, class: "ombre"}));
  g.append(s("line", {x1: -4 * k, y1: -10 * k, x2: -5 * k, y2: 0, class: "jambe"}));
  g.append(s("line", {x1: 4 * k, y1: -10 * k, x2: 5 * k, y2: 0, class: "jambe"}));
  g.append(s("rect", {x: -8 * k, y: -27 * k, width: 16 * k, height: 18 * k, rx: 5 * k, fill: maillot, class: "buste"}));
  g.append(s("circle", {cx: 0, cy: -34 * k, r: 7.5 * k, fill: peau, class: "tete"}));
  if (casquette) g.append(s("path", {d: `M${-8 * k} ${-36 * k} q${8 * k} ${-9 * k} ${16 * k} 0 l${4 * k} 0`, class: "casquette"}));
  if (antenne) {
    g.append(s("line", {x1: 0, y1: -41 * k, x2: 0, y2: -49 * k, class: "tige"}));
    g.append(s("circle", {cx: 0, cy: -51 * k, r: 3, class: "antenne"}));
  }
  return g;
}

const persos = new Map();   // id → {g, ...}

function creerJoueur(svg, j, coach) {
  const g = s("g", {class: "perso", "data-id": j.id, tabindex: 0, role: "button",
                    "aria-label": `${j.nom}, ${j.pilote === "llm" ? "piloté par le LLM" : "règle fixe"}`});
  g.append(bonhomme({maillot: MAILLOTS[j.paire % MAILLOTS.length], peau: PEAUX[hachage(j.nom) % PEAUX.length],
                     antenne: j.pilote === "llm"}));
  const blessure = s("g", {class: "blessure", visibility: "hidden"});
  blessure.append(s("rect", {x: -2, y: -24, width: 4, height: 11, class: "croix"}));
  blessure.append(s("rect", {x: -5.5, y: -20.5, width: 11, height: 4, class: "croix"}));
  g.append(blessure);
  g.append(s("rect", {x: -12, y: 6, width: 24, height: 3.5, rx: 1.5, class: "jauge-fond"}));
  const jauge = s("rect", {x: -12, y: 6, width: 0, height: 3.5, rx: 1.5, class: "jauge"});
  g.append(jauge);
  const trophee = s("text", {x: 9, y: -40, class: "trophee", visibility: "hidden"});
  trophee.textContent = "🏆";
  g.append(trophee);
  const nom = s("text", {x: 0, y: 20, class: "nom"});
  nom.textContent = j.nom.split(" ").pop();
  g.append(nom);
  let gc = null;
  if (coach) {
    gc = s("g", {class: "perso coach", "data-coach": j.id, tabindex: 0, role: "button",
                 "aria-label": `${coach}, entraîneur de ${j.nom}`});
    gc.append(bonhomme({maillot: "#4a4f57", peau: PEAUX[hachage(coach) % PEAUX.length], casquette: true, petit: true}));
    svg.append(gc);
  }
  svg.append(g);
  persos.set(j.id, {g, gc, jauge, blessure, trophee});
}

function creerFigurant(svg, id, zone, dx, maillot, libelle) {
  const z = ZONES[zone];
  const g = s("g", {class: "perso figurant", "data-figurant": id, tabindex: 0, role: "button", "aria-label": libelle,
                    style: `transform:translate(${z.x + dx}px,${z.y + z.h - 40}px)`});
  g.append(bonhomme({maillot, peau: PEAUX[hachage(id) % PEAUX.length]}));
  const t = s("text", {x: 0, y: 20, class: "nom"});
  t.textContent = libelle;
  g.append(t);
  svg.append(g);
  persos.set(id, {g});
}

// ------------------------------------------------------------- placement
function placesDans(zone, n) {
  // Autant de rangées que la hauteur le permet, puis on resserre en largeur si besoin.
  const z = ZONES[zone], utile = z.w - 24;
  const maxLignes = Math.max(1, Math.floor((z.h - 26) / RANG));
  let cols = Math.max(1, Math.floor(utile / PLACE));
  if (Math.ceil(n / cols) > maxLignes) cols = Math.ceil(n / maxLignes);
  const pas = Math.min(PLACE, utile / cols);
  const lignes = Math.max(1, Math.ceil(n / cols)), hauteur = (z.h - 26) / lignes;
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, l = Math.floor(i / cols), dansLigne = Math.min(cols, n - l * cols);
    const x0 = z.x + (z.w - dansLigne * pas) / 2 + pas / 2 - 8;
    out.push([x0 + c * pas, z.y + 26 + hauteur * (l + 0.5) + 22]);
  }
  return out;
}

function decisionEnDirect(e) {
  const m = new Map();
  for (const a of e.semaine_courante || []) {
    if (a.role === "joueur" && a.sujet && a.ok) m.set(a.sujet, a.champs);
  }
  return m;
}

function zoneDe(j, d, direct) {
  if (direct) return direct.jouer === true ? "vestiaires" : (ZONES[direct.entrainement] ? direct.entrainement : "repos");
  if (!d) return "vestiaires";
  if (d.blessure > 0 && !d.tour) return "infirmerie";
  if (d.tour) return TOUR_ZONE[d.tour] || null;   // R16 : réparti plus bas
  return ZONES[d.entrainement] ? d.entrainement : "repos";
}

let decorPret = false, figurantsPrets = false, selection = null, dernierEtat = null;

function rendreScene(e) {
  dernierEtat = e;
  const svg = document.getElementById("scene");
  if (!decorPret) { dessinerDecor(svg); decorPret = true; }
  const S = e.saison;
  const info = document.getElementById("scene-info");
  if (!S) { info.textContent = "Le circuit se remplira à la fin de la première semaine."; return; }
  if (!figurantsPrets) {
    creerFigurant(svg, "journaliste", "presse", 60, "#6b4f9e", "Le Filet");
    creerFigurant(svg, "agent", "sponsors", 70, "#24303f", "agent");
    creerFigurant(svg, "sponsor", "sponsors", 190, "#9e7b2f", "sponsor");
    figurantsPrets = true;
  }
  const derniere = S.semaines[S.semaines.length - 1];
  const D = new Map((derniere ? derniere.decisions : []).map(d => [d.joueur, d]));
  const direct = decisionEnDirect(e);
  const tournoi = derniere && derniere.tournoi ? S.calendrier.find(t => t.nom === derniere.tournoi) : null;

  // couleur des courts = surface du dernier tournoi joué
  const surf = tournoi ? SURFACES[tournoi.surface] : null;
  svg.querySelectorAll(".court").forEach(r => r.setAttribute("fill", surf ? surf[1] : "#5b7f5b"));
  const titreCentral = svg.querySelector("#zone-central .titre-zone");
  titreCentral.textContent = tournoi ? `Court central · finale · ${tournoi.nom} (${surf[0]})` : "Court central · pas de tournoi";

  for (const j of S.joueurs) {
    if (!persos.has(j.id)) creerJoueur(svg, j, j.pilote === "llm" ? j.entraineur : null);
  }
  // répartition dans les zones
  const parZone = new Map();
  let r16 = 0;
  for (const j of S.joueurs) {
    let z = zoneDe(j, D.get(j.id), direct.get(j.id));
    if (z === null) z = (r16++ % 2 === 0) ? "r16a" : "r16b";
    if (!parZone.has(z)) parZone.set(z, []);
    parZone.get(z).push(j);
  }
  for (const [z, liste] of parZone) {
    if (z === "central") liste.sort((a, b) => (D.get(b.id)?.tour === "V") - (D.get(a.id)?.tour === "V"));
    const places = placesDans(z, liste.length);
    liste.forEach((j, i) => {
      const p = persos.get(j.id), [x, y] = places[i], d = D.get(j.id), dd = direct.get(j.id);
      p.g.style.transform = `translate(${x}px,${y}px)`;
      if (p.gc) p.gc.style.transform = `translate(${x + 24}px,${y + 2}px)`;
      const fatigue = d ? d.fatigue : 0;
      p.jauge.setAttribute("width", Math.max(0.5, 24 * Math.min(10, fatigue) / 10));
      p.jauge.setAttribute("fill", fatigue >= 6 ? "var(--alerte)" : fatigue >= 3 ? "#e0a030" : "var(--accent)");
      p.blessure.setAttribute("visibility", d && d.blessure > 0 ? "visible" : "hidden");
      p.trophee.setAttribute("visibility", d && d.tour === "V" ? "visible" : "hidden");
      p.g.classList.toggle("decide", !!dd);
    });
  }
  const nDirect = direct.size;
  info.textContent = (derniere ? `Positions de la semaine ${derniere.semaine}${derniere.tournoi ? " (" + derniere.tournoi + ")" : " (pas de tournoi)"}` : "")
    + (nDirect ? ` · ${nDirect} joueur(s) LLM ont déjà décidé pour la semaine suivante (contour vert).` : "")
    + " Clique sur un personnage.";
  rendreBulle(e);
  if (selection) montrerFiche(selection.type, selection.id, null);
}

// ------------------------------------------------------------- bulle « le LLM pense »
function acteur(a) {
  if (!a) return null;
  if (["journaliste"].includes(a.role)) return persos.get("journaliste")?.g;
  if (a.role === "agent") return persos.get("agent")?.g;
  if (a.role === "sponsor") return persos.get("sponsor")?.g;
  const p = a.sujet ? persos.get(a.sujet) : null;
  if (!p) return null;
  return a.role === "entraineur" && p.gc ? p.gc : p.g;
}

function versEcran(g) {
  const svg = document.getElementById("scene"), r = svg.getBoundingClientRect();
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(g.style.transform || "");
  if (!m) return null;
  const k = r.width / LARGEUR;
  return [parseFloat(m[1]) * k, parseFloat(m[2]) * k];
}

function rendreBulle(e) {
  const b = document.getElementById("bulle");
  const a = e.derniers && e.derniers[0];
  const actif = !e.termine && e.dernier_appel_il_y_a_s !== null && e.dernier_appel_il_y_a_s < 25;
  const g = actif ? acteur(a) : null;
  document.querySelectorAll(".perso.parle").forEach(n => n.classList.remove("parle"));
  if (!actif || !a) { b.hidden = true; return; }
  const ch = a.champs || {};
  const texte = ch.raisonnement || ch.conseil || ch.lecon || ch.titre || ch.reponse || ch.argument || ch.decision || "";
  b.replaceChildren(el("b", {}, ROLES[a.role] || a.role), " vient de répondre",
    texte ? el("div", {}, "« " + (texte.length > 110 ? texte.slice(0, 110) + "…" : texte) + " »") : null);
  const pos = g ? versEcran(g) : null;
  if (pos) {
    g.classList.add("parle");
    b.style.left = Math.max(4, pos[0] - 20) + "px";
    b.style.top = Math.max(4, pos[1] - 120) + "px";
    b.classList.remove("libre");
  } else {             // journal sans « sujet » (saisons lancées avant le suivi) : bulle en haut
    b.style.left = "8px"; b.style.top = "8px";
    b.classList.add("libre");
  }
  b.hidden = false;
}

// ------------------------------------------------------------- fiche (info-bulle au clic)
function ligne(cle, val) { return el("div", {class: "kv"}, el("span", {}, cle), el("b", {}, val)); }

function ficheJoueur(id) {
  const e = dernierEtat, S = e.saison, j = S.joueurs.find(x => x.id === id);
  const derniere = S.semaines[S.semaines.length - 1];
  const d = derniere ? derniere.decisions.find(x => x.joueur === id) : null;
  const rang = [...S.joueurs].sort((a, b) => b.points - a.points).findIndex(x => x.id === id) + 1;
  const jumeau = S.joueurs.find(x => x.paire === j.paire && x.id !== id);
  const dd = decisionEnDirect(e).get(id);
  const lecons = j.memoire.filter(m => m.type === "reflexion");
  const delta = j.points - j.points_depart;
  const tour = !derniere ? "—" : !derniere.tournoi ? "pas de tournoi"
    : d && d.tour ? (TOURS[d.tour] || d.tour) : (d && !d.jouer ? "forfait" : "non inscrit");
  return [
    el("h3", {}, j.nom, " ", el("span", {class: "puce" + (j.pilote === "llm" ? " llm" : "")}, j.pilote === "llm" ? "piloté par le LLM" : "règle fixe")),
    el("p", {class: "doux"}, `${j.pays} · ${j.age} ans · style ${j.style} · ${j.personnalite}`),
    ligne("Classement", `${rang}e · ${j.points} pts (${signe(delta)} depuis le début)`),
    ligne("Bilan", `${j.titres} titre(s) · ${j.victoires} V - ${j.matchs - j.victoires} D`),
    ligne("Fatigue / santé", d ? `${d.fatigue}/10${d.blessure ? " · blessé" : " · en forme"}` : "—"),
    ligne(`Semaine ${derniere ? derniere.semaine : "—"}`, `${tour} · entraînement ${d ? d.entrainement : "—"}${d && d.tactique ? " · tactique " + d.tactique : ""}`),
    j.pilote === "llm" ? ligne("Entraîneur", j.entraineur) : null,
    j.sponsor ? ligne("Sponsor", j.sponsor) : null,
    ligne("Jumeau", `${jumeau.nom} (${jumeau.pilote === "llm" ? "LLM" : "règle"}) · ${jumeau.points} pts`),
    d && d.raisonnement ? el("p", {}, el("span", {class: "doux"}, "Son raisonnement : "), "« " + d.raisonnement + " »") : null,
    d && d.conseil && d.conseil.conseil ? el("p", {}, el("span", {class: "doux"}, `${d.conseil.entraineur} lui a dit : `), "« " + d.conseil.conseil + " »") : null,
    dd ? el("p", {class: "pos"}, `Décision pour la semaine en cours : ${dd.jouer ? "il joue" : "il ne joue pas"}, entraînement « ${dd.entrainement} »`
      + (dd.raisonnement ? ` : « ${dd.raisonnement} »` : "")) : null,
    lecons.length ? el("p", {}, el("span", {class: "doux"}, "Dernière leçon : "), "« " + lecons[lecons.length - 1].texte.replace(/^Leçon : /, "") + " »") : null,
  ];
}

function ficheCoach(id) {
  const S = dernierEtat.saison, j = S.joueurs.find(x => x.id === id);
  const conseils = S.semaines.flatMap(w => w.decisions.filter(d => d.joueur === id && d.conseil && d.conseil.conseil)
    .map(d => ({semaine: w.semaine, ...d.conseil, suivi: d.conseil.recommande_jouer === d.jouer})));
  const dernier = conseils[conseils.length - 1];
  const tacts = {};
  conseils.forEach(c => { tacts[c.tactique] = (tacts[c.tactique] || 0) + 1; });
  return [
    el("h3", {}, j.entraineur, " ", el("span", {class: "puce"}, "entraîneur (LLM)")),
    el("p", {class: "doux"}, `Entraîne ${j.nom}`),
    ligne("Conseils donnés", String(conseils.length)),
    ligne("Tactiques choisies", Object.entries(tacts).map(([t, n]) => `${t} ×${n}`).join(", ") || "—"),
    ligne("Écouté par son joueur", conseils.length ? `${conseils.filter(c => c.suivi).length} / ${conseils.length}` : "—"),
    dernier ? el("p", {}, el("span", {class: "doux"}, `Semaine ${dernier.semaine} : `), "« " + dernier.conseil + " »") : null,
  ];
}

function ficheFigurant(id) {
  const S = dernierEtat.saison;
  if (id === "journaliste") {
    const a = S.articles[S.articles.length - 1];
    return [el("h3", {}, "Journaliste du « Filet » ", el("span", {class: "puce"}, "LLM")),
      ligne("Articles écrits", String(S.articles.length)),
      a ? el("p", {}, el("b", {}, a.titre), el("br"), a.article) : el("p", {class: "doux"}, "Aucun article encore.")];
  }
  const negos = S.negociations || [];
  const signes = negos.filter(n => n.contrat);
  return [el("h3", {}, id === "agent" ? "Agent sportif " : "Sponsors ", el("span", {class: "puce"}, "LLM")),
    ligne("Négociations", String(negos.length)), ligne("Contrats signés", String(signes.length)),
    ...signes.slice(-4).map(n => el("p", {}, `${S.joueurs.find(x => x.id === n.joueur).nom} × ${n.sponsor} : ${n.contrat.toLocaleString("fr-FR")} €`)),
    negos.length ? null : el("p", {class: "doux"}, "Les négociations ont lieu en semaines 6 et 12.")];
}

function montrerFiche(type, id, evt) {
  const f = document.getElementById("fiche");
  const contenu = type === "coach" ? ficheCoach(id) : type === "figurant" ? ficheFigurant(id) : ficheJoueur(id);
  const fermer = el("button", {type: "button", class: "fermer", "aria-label": "fermer"}, "×");
  fermer.addEventListener("click", ev => { ev.stopPropagation(); selection = null; f.hidden = true; });
  f.replaceChildren(fermer, ...contenu.filter(Boolean));
  selection = {type, id};
  if (evt) {
    const boite = document.getElementById("scene-boite").getBoundingClientRect();
    const x = evt.clientX - boite.left, y = evt.clientY - boite.top;
    f.style.left = Math.max(4, Math.min(x + 14, boite.width - f.offsetWidth - 4, boite.width - 330)) + "px";
    f.dataset.y = y;
  }
  f.hidden = false;
  // une fois affichée, on la garde entière dans la scène
  const hb = document.getElementById("scene-boite").clientHeight;
  f.style.top = Math.max(4, Math.min(Number(f.dataset.y || 0) - 20, hb - f.offsetHeight - 4)) + "px";
}

document.addEventListener("click", evt => {
  const g = evt.target.closest && evt.target.closest(".perso");
  if (g && dernierEtat && dernierEtat.saison) {
    if (g.dataset.coach) montrerFiche("coach", g.dataset.coach, evt);
    else if (g.dataset.figurant) montrerFiche("figurant", g.dataset.figurant, evt);
    else montrerFiche("joueur", g.dataset.id, evt);
  } else if (!evt.target.closest("#fiche")) {
    selection = null;
    document.getElementById("fiche").hidden = true;
  }
});
document.addEventListener("keydown", evt => {
  if ((evt.key === "Enter" || evt.key === " ") && evt.target.classList && evt.target.classList.contains("perso")) {
    evt.preventDefault();
    evt.target.dispatchEvent(new MouseEvent("click", {bubbles: true, clientX: 200, clientY: 200}));
  }
  if (evt.key === "Escape") { selection = null; document.getElementById("fiche").hidden = true; }
});
