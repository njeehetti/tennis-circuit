// Le village du circuit : plan illustré vu du ciel, un personnage par agent,
// placé selon ce qu'il fait la semaine affichée, cliquable pour voir sa fiche.
// Utilise el(), ROLES, TOURS et signe() définis dans direct.html.
"use strict";

const SVGNS = "http://www.w3.org/2000/svg";
const LARGEUR = 1600, HAUTEUR = 1140;
const SURFACES = {Hard: ["dur", "#2f6cb0", "#255a95"], Clay: ["terre battue", "#c4663f", "#a9532f"],
                  Grass: ["gazon", "#5d9b47", "#4c843a"]};
const SANS_TOURNOI = ["", "#7d977a", "#6c8569"];
const MAILLOTS = ["#e4572e", "#2e86ab", "#f3a712", "#7b2cbf", "#1b998b", "#d1495b", "#3a86ff", "#8c6d46"];
const PEAUX = ["#f3d2b3", "#dcaa80", "#ad7a52", "#7b5236"];
const CHEVEUX = ["#2b1b12", "#5a3a22", "#c9a15a", "#1f1f1f", "#8a4b2a"];
const REDUIT = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Lieux du village. « aire » = rectangle où se tiennent les personnages.
const ZONES = {
  central:    {type: "stade",  x: 470,  y: 40,  w: 660, h: 500, titre: "Stade central", role: "finale",
               aire: {x: 640, y: 214, w: 320, h: 156}},
  sf:         {type: "arene",  x: 60,   y: 60,  w: 360, h: 225, titre: "Court 1", role: "demi-finales"},
  qf:         {type: "arene",  x: 60,   y: 310, w: 360, h: 225, titre: "Court 2", role: "quarts de finale"},
  r16a:       {type: "annexe", x: 1180, y: 60,  w: 360, h: 225, titre: "Court 3", role: "premier tour"},
  r16b:       {type: "annexe", x: 1180, y: 310, w: 360, h: 225, titre: "Court 4", role: "premier tour"},
  vestiaires: {type: "salle", sol: "vestiaires", x: 60,  y: 630, w: 270, h: 262, titre: "Vestiaires", role: "inscrits de la semaine"},
  service:    {type: "entrainement", x: 350, y: 630, w: 315, h: 262, titre: "Entraînement", role: "service"},
  retour:     {type: "entrainement", x: 680, y: 630, w: 315, h: 262, titre: "Entraînement", role: "retour"},
  physique:   {type: "salle", sol: "gym", x: 1015, y: 630, w: 255, h: 262, titre: "Salle de sport"},
  infirmerie: {type: "salle", sol: "infirmerie", x: 1290, y: 630, w: 250, h: 262, titre: "Infirmerie"},
  repos:      {type: "detente", x: 60,  y: 915, w: 605, h: 200, titre: "Espace détente", role: "repos"},
  presse:     {type: "salle", sol: "presse", x: 680, y: 915, w: 380, h: 200, titre: "Salle de presse"},
  sponsors:   {type: "salle", sol: "sponsors", x: 1075, y: 915, w: 465, h: 200, titre: "Salon des sponsors"},
};
const COMPETITION = ["central", "sf", "qf", "r16a", "r16b"];
const TOUR_ZONE = {V: "central", F: "central", SF: "sf", QF: "qf"};
const PLACE = 74, RANG = 100, RANG_MIN = 58;

function s(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  if (parent) parent.append(n);
  return n;
}
function hachage(txt) { let h = 0; for (const c of txt) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

// Aire utile de chaque lieu (calculée une fois)
for (const z of Object.values(ZONES)) {
  if (z.aire) continue;
  if (z.type === "arene") z.aire = {x: z.x + 40, y: z.y + 64, w: z.w - 80, h: z.h - 110};
  else if (z.type === "annexe") z.aire = {x: z.x + 34, y: z.y + 50, w: z.w - 68, h: z.h - 70};
  else if (z.type === "entrainement") z.aire = {x: z.x + 14, y: z.y + 44, w: z.w - 28, h: z.h - 58};
  else if (z.type === "detente") z.aire = {x: z.x + 270, y: z.y + 46, w: z.w - 290, h: z.h - 56};
  else z.aire = {x: z.x + 18, y: z.y + 50, w: z.w - 36, h: z.h - 60};
}

// =============================================================== décor
function arbre(g, x, y, r) {
  s("ellipse", {cx: x + 6, cy: y + r * 0.75, rx: r * 1.05, ry: r * 0.45, fill: "rgba(20,50,20,.25)"}, g);
  s("circle", {cx: x, cy: y, r, fill: "#3f7a37"}, g);
  s("circle", {cx: x - r * 0.3, cy: y - r * 0.3, r: r * 0.62, fill: "#4f9443"}, g);
  s("circle", {cx: x - r * 0.42, cy: y - r * 0.45, r: r * 0.25, fill: "#6db35a"}, g);
}

function lignesCourt(g, x, y, w, h) {
  s("rect", {x, y, width: w, height: h, class: "surface", rx: 2}, g);
  const L = {fill: "none", stroke: "#fff", "stroke-width": 2.5, opacity: 0.9};
  s("rect", {x: x + 10, y: y + 10, width: w - 20, height: h - 20, ...L}, g);
  s("line", {x1: x + 10, y1: y + 10 + (h - 20) * 0.125, x2: x + w - 10, y2: y + 10 + (h - 20) * 0.125, ...L}, g);
  s("line", {x1: x + 10, y1: y + h - 10 - (h - 20) * 0.125, x2: x + w - 10, y2: y + h - 10 - (h - 20) * 0.125, ...L}, g);
  const cx = x + w / 2;
  s("line", {x1: x + w * 0.27, y1: y + 10 + (h - 20) * 0.125, x2: x + w * 0.27, y2: y + h - 10 - (h - 20) * 0.125, ...L}, g);
  s("line", {x1: x + w * 0.73, y1: y + 10 + (h - 20) * 0.125, x2: x + w * 0.73, y2: y + h - 10 - (h - 20) * 0.125, ...L}, g);
  s("line", {x1: x + w * 0.27, y1: y + h / 2, x2: x + w * 0.73, y2: y + h / 2, ...L}, g);
  s("line", {x1: cx, y1: y + 2, x2: cx, y2: y + h - 2, stroke: "#f2f2f2", "stroke-width": 4, "stroke-dasharray": "2 2"}, g);
  s("circle", {cx, cy: y + 3, r: 3, fill: "#333"}, g);
  s("circle", {cx, cy: y + h - 3, r: 3, fill: "#333"}, g);
}

function panneau(svg, x, y, titre, sousTitre, centre) {
  const g = s("g", {class: "panneau"}, svg);
  const fond = s("rect", {x, y, height: 30, rx: 15, class: "panneau-fond"}, g);
  const t = s("text", {x: x + 14, y: y + 21, class: "panneau-titre"}, g);
  t.textContent = titre;
  let largeur = t.getComputedTextLength() + 28;
  let st = null;
  if (sousTitre) {
    st = s("text", {x: x + largeur - 4, y: y + 21, class: "panneau-role"}, g);
    st.textContent = sousTitre;
    largeur += st.getComputedTextLength() + 10;
  }
  if (centre) {
    const dx = -largeur / 2;
    fond.setAttribute("x", x + dx); t.setAttribute("x", x + 14 + dx);
    if (st) st.setAttribute("x", parseFloat(st.getAttribute("x")) + dx);
  }
  fond.setAttribute("width", largeur);
  return {g, t, st, fond};
}

function ajusterPanneaux() {
  for (const z of Object.values(ZONES)) {
    if (!z.panneau || z.type === "stade") continue;
    const {t, st, fond} = z.panneau, x = parseFloat(fond.getAttribute("x"));
    const lt = t.getComputedTextLength();
    let largeur = lt + 28;
    if (st) { st.setAttribute("x", x + lt + 24); largeur += st.getComputedTextLength() + 10; }
    fond.setAttribute("width", largeur);
  }
}

function stade(svg, z) {
  const g = s("g", {}, svg), cx = z.x + z.w / 2, cy = z.y + z.h / 2 + 10;
  s("ellipse", {cx: cx + 10, cy: cy + 16, rx: z.w / 2, ry: z.h / 2 - 8, fill: "rgba(20,40,20,.28)"}, g);
  s("ellipse", {cx, cy, rx: z.w / 2, ry: z.h / 2 - 10, fill: "#2c3e50"}, g);
  [[0.96, "#3d5468"], [0.88, "#4a6379"], [0.80, "#557089"], [0.72, "#4a6379"]].forEach(([k, c]) => {
    s("ellipse", {cx, cy, rx: z.w / 2 * k, ry: (z.h / 2 - 10) * k, fill: c}, g);
    s("ellipse", {cx, cy, rx: z.w / 2 * k - 6, ry: (z.h / 2 - 10) * k - 6, fill: "none", stroke: "rgba(255,255,255,.18)",
                  "stroke-width": 3, "stroke-dasharray": "5 7"}, g);
  });
  s("ellipse", {cx, cy, rx: z.w / 2 * 0.64, ry: (z.h / 2 - 10) * 0.64, class: "surface-sombre"}, g);
  const a = z.aire;
  lignesCourt(g, a.x - 30, a.y - 26, a.w + 60, a.h + 52);
  // entrée vers l'allée
  s("rect", {x: cx - 26, y: z.y + z.h - 46, width: 52, height: 56, fill: "#e9dcb5"}, g);
  // drapeaux sur l'anneau
  for (let i = 0; i < 7; i++) {
    const ang = Math.PI * (1.12 + i * 0.127), fx = cx + Math.cos(ang) * z.w / 2 * 0.98, fy = cy + Math.sin(ang) * (z.h / 2 - 10) * 0.98;
    s("line", {x1: fx, y1: fy, x2: fx, y2: fy - 26, stroke: "#ddd", "stroke-width": 2}, g);
    s("path", {d: `M${fx} ${fy - 26} l16 5 l-16 5 z`, fill: MAILLOTS[i % MAILLOTS.length], class: REDUIT ? "" : "drapeau"}, g);
  }
}

function arene(svg, z) {
  const g = s("g", {}, svg);
  s("rect", {x: z.x + 8, y: z.y + 10, width: z.w, height: z.h, rx: 14, fill: "rgba(20,40,20,.25)"}, g);
  s("rect", {x: z.x, y: z.y, width: z.w, height: z.h, rx: 14, fill: "#3d5468"}, g);
  for (let i = 0; i < 3; i++) {
    s("rect", {x: z.x + 10, y: z.y + 8 + i * 10, width: z.w - 20, height: 6, rx: 3, fill: i % 2 ? "#557089" : "#4a6379"}, g);
    s("rect", {x: z.x + 10, y: z.y + z.h - 14 - i * 10, width: z.w - 20, height: 6, rx: 3, fill: i % 2 ? "#557089" : "#4a6379"}, g);
  }
  s("rect", {x: z.x + 10, y: z.y + 40, width: z.w - 20, height: z.h - 80, class: "surface-sombre"}, g);
  lignesCourt(g, z.x + 26, z.y + 48, z.w - 52, z.h - 96);
}

function annexe(svg, z, fixe) {
  const g = s("g", {}, svg);
  s("rect", {x: z.x, y: z.y, width: z.w, height: z.h, rx: 6, class: fixe ? "" : "surface-sombre", fill: fixe ? "#255a95" : ""}, g);
  const c = s("g", {}, g);
  lignesCourt(c, z.x + 22, z.y + 34, z.w - 44, z.h - 52);
  if (fixe) c.querySelector(".surface").setAttribute("class", "surface-fixe");
  // grillage (pare-vent vert)
  s("rect", {x: z.x + 3, y: z.y + 3, width: z.w - 6, height: z.h - 6, rx: 6, fill: "none", stroke: "#1e4d34", "stroke-width": 6}, g);
  // banc
  s("rect", {x: z.x + z.w / 2 - 22, y: z.y + z.h - 14, width: 44, height: 8, rx: 3, fill: "#8a6a48"}, g);
  return g;
}

function entrainement(svg, z) {
  const g = annexe(svg, z, true);
  if (z.role === "service") {           // panier de balles + plots
    for (let i = 0; i < 9; i++) s("circle", {cx: z.x + z.w - 42 + (i % 3) * 7, cy: z.y + 44 + Math.floor(i / 3) * 7, r: 3.4, fill: "#d9f24a", stroke: "#8aa02a"}, g);
    [0, 1, 2].forEach(i => s("path", {d: `M${z.x + 50 + i * 26} ${z.y + z.h - 30} l6 -12 l6 12 z`, fill: "#ff8a3d"}, g));
  } else {                              // lance-balles
    s("rect", {x: z.x + z.w - 56, y: z.y + 40, width: 30, height: 20, rx: 4, fill: "#40464f"}, g);
    s("circle", {cx: z.x + z.w - 41, cy: z.y + 40, r: 9, fill: "#d9f24a", stroke: "#40464f", "stroke-width": 3}, g);
  }
}

function mur(g, z, sol) {
  s("rect", {x: z.x + 7, y: z.y + 9, width: z.w, height: z.h, rx: 10, fill: "rgba(20,40,20,.25)"}, g);
  s("rect", {x: z.x, y: z.y, width: z.w, height: z.h, rx: 10, fill: sol, stroke: "#6b5442", "stroke-width": 9}, g);
}

function salle(svg, z) {
  const g = s("g", {}, svg), X = z.x, Y = z.y, W = z.w, H = z.h;
  if (z.sol === "vestiaires") {
    mur(g, z, "#d8b98a");
    for (let i = 1; i < 9; i++) s("line", {x1: X + 6, y1: Y + i * H / 9, x2: X + W - 6, y2: Y + i * H / 9, stroke: "#c9a874", "stroke-width": 2}, g);
    for (let i = 0; i < 8; i++) s("rect", {x: X + 14 + i * ((W - 28) / 8), y: Y + 10, width: (W - 28) / 8 - 3, height: 26, rx: 2, fill: i % 2 ? "#6c8fb3" : "#5f82a6"}, g);
    s("rect", {x: X + 30, y: Y + H - 30, width: W - 60, height: 10, rx: 4, fill: "#9b7a52"}, g);
  } else if (z.sol === "gym") {
    mur(g, z, "#4a5059");
    s("rect", {x: X + 16, y: Y + H - 70, width: 70, height: 46, rx: 4, fill: "#2d79c7", opacity: 0.85}, g);
    s("rect", {x: X + W - 60, y: Y + 46, width: 40, height: 64, rx: 6, fill: "#2b2f35"}, g);
    s("rect", {x: X + W - 54, y: Y + 52, width: 28, height: 40, rx: 3, fill: "#3a4048"}, g);
    for (let i = 0; i < 3; i++) {
      const hx = X + 26 + i * 40, hy = Y + 26;
      s("rect", {x: hx, y: hy, width: 24, height: 4, fill: "#9aa3ad"}, g);
      s("rect", {x: hx - 4, y: hy - 4, width: 6, height: 12, rx: 2, fill: "#1f2328"}, g);
      s("rect", {x: hx + 22, y: hy - 4, width: 6, height: 12, rx: 2, fill: "#1f2328"}, g);
    }
  } else if (z.sol === "infirmerie") {
    mur(g, z, "#eef2f4");
    for (let i = 1; i < 7; i++) s("line", {x1: X + i * W / 7, y1: Y + 5, x2: X + i * W / 7, y2: Y + H - 5, stroke: "#dde4e8"}, g);
    for (let i = 1; i < 6; i++) s("line", {x1: X + 5, y1: Y + i * H / 6, x2: X + W - 5, y2: Y + i * H / 6, stroke: "#dde4e8"}, g);
    [0, 1].forEach(i => {
      s("rect", {x: X + W - 70, y: Y + 44 + i * 78, width: 52, height: 64, rx: 6, fill: "#fff", stroke: "#b9c4cc", "stroke-width": 2}, g);
      s("rect", {x: X + W - 64, y: Y + 48 + i * 78, width: 40, height: 14, rx: 5, fill: "#cfe3f2"}, g);
    });
    s("rect", {x: X + 22, y: Y + H - 46, width: 34, height: 10, fill: "#e63946"}, g);
    s("rect", {x: X + 34, y: Y + H - 58, width: 10, height: 34, fill: "#e63946"}, g);
  } else if (z.sol === "presse") {
    mur(g, z, "#d9d4c7");
    s("rect", {x: X + W / 2 - 80, y: Y + 14, width: 160, height: 22, rx: 4, fill: "#0e3b2c"}, g);
    [-50, -18, 18, 50].forEach(d => s("circle", {cx: X + W / 2 + d, cy: Y + 25, r: 4, fill: "#d9f24a"}, g));
    for (let r = 0; r < 2; r++) for (let c = 0; c < 9; c++)
      s("rect", {x: X + 22 + c * ((W - 44) / 9), y: Y + H - 56 + r * 24, width: (W - 44) / 9 - 8, height: 14, rx: 3, fill: "#8b8f9a"}, g);
    // antenne satellite
    s("circle", {cx: X + W - 26, cy: Y + 26, r: 14, fill: "#f5f5f5", stroke: "#aaa", "stroke-width": 2}, g);
  } else if (z.sol === "sponsors") {
    mur(g, z, "#6e2e3e");
    s("rect", {x: X + 12, y: Y + 12, width: W - 24, height: H - 24, rx: 6, fill: "none", stroke: "#c9a646", "stroke-width": 2, "stroke-dasharray": "8 5"}, g);
    [[0.2, 0.62], [0.5, 0.75], [0.8, 0.6]].forEach(([fx, fy]) => {
      s("circle", {cx: X + W * fx, cy: Y + H * fy, r: 20, fill: "#c9a646"}, g);
      s("circle", {cx: X + W * fx, cy: Y + H * fy, r: 13, fill: "#e8cf7a"}, g);
    });
  }
}

function detente(svg, z) {
  const g = s("g", {}, svg);
  s("rect", {x: z.x + 7, y: z.y + 9, width: z.w, height: z.h, rx: 18, fill: "rgba(20,40,20,.25)"}, g);
  s("rect", {x: z.x, y: z.y, width: z.w, height: z.h, rx: 18, fill: "#cfae80"}, g);
  for (let i = 1; i < 12; i++) s("line", {x1: z.x + i * z.w / 12, y1: z.y + 4, x2: z.x + i * z.w / 12, y2: z.y + z.h - 4, stroke: "#bf9d70", "stroke-width": 2}, g);
  const px = z.x + 20, py = z.y + 46, pw = 230, ph = z.h - 66;
  s("rect", {x: px - 6, y: py - 6, width: pw + 12, height: ph + 12, rx: 22, fill: "#f2efe6"}, g);
  s("rect", {x: px, y: py, width: pw, height: ph, rx: 18, fill: "#47b8d6"}, g);
  for (let i = 0; i < 4; i++)
    s("path", {d: `M${px + 20} ${py + 24 + i * 28} q20 -8 40 0 t40 0 t40 0 t40 0 t40 0`, fill: "none", stroke: "#8ddcf0", "stroke-width": 3, opacity: 0.8}, g);
  // parasols et transats sur la terrasse
  [[0.62, 0.2], [0.93, 0.22]].forEach(([fx, fy]) => {
    const cx = z.x + z.w * fx, cy = z.y + z.h * fy + 14;
    for (let k = 0; k < 8; k++) {
      const a1 = k * Math.PI / 4, a2 = (k + 1) * Math.PI / 4;
      s("path", {d: `M${cx} ${cy} L${cx + 24 * Math.cos(a1)} ${cy + 24 * Math.sin(a1)} A24 24 0 0 1 ${cx + 24 * Math.cos(a2)} ${cy + 24 * Math.sin(a2)} z`,
                 fill: k % 2 ? "#fff" : "#e4572e"}, g);
    }
  });
}

function dessinerVillage(svg) {
  const defs = s("defs", {}, svg);
  const motif = s("pattern", {id: "tonte", width: 80, height: 80, patternUnits: "userSpaceOnUse", patternTransform: "rotate(0)"}, defs);
  s("rect", {width: 80, height: 40, fill: "#8cbf5b"}, motif);
  s("rect", {y: 40, width: 80, height: 40, fill: "#83b552"}, motif);
  s("rect", {x: 0, y: 0, width: LARGEUR, height: HAUTEUR, fill: "url(#tonte)"}, svg);
  // allées
  const allee = {fill: "#e9dcb5", stroke: "#d8c897", "stroke-width": 3};
  s("rect", {x: 30, y: 563, width: LARGEUR - 60, height: 46, rx: 23, ...allee}, svg);
  [[220, 535, 30], [1350, 535, 30], [490, 605, 25], [1135, 605, 25], [1500, 605, 25], [362, 894, 24]].forEach(([x, y, h]) =>
    s("rect", {x, y, width: 40, height: h, ...allee}, svg));
  s("rect", {x: 20, y: 600, width: 30, height: 510, rx: 15, ...allee}, svg);
  // arbres
  const vege = s("g", {}, svg);
  [[445, 70, 20], [445, 300, 16], [448, 520, 22], [1155, 75, 20], [1152, 300, 15], [1152, 520, 22],
   [800, 590, 0], [1575, 620, 18], [1575, 1095, 20], [25, 40, 16], [1580, 300, 14]].forEach(([x, y, r]) => r && arbre(vege, x, y, r));
  for (const [id, z] of Object.entries(ZONES)) {
    if (z.type === "stade") stade(svg, z);
    else if (z.type === "arene") arene(svg, z);
    else if (z.type === "annexe") annexe(svg, z, false);
    else if (z.type === "entrainement") entrainement(svg, z);
    else if (z.type === "detente") detente(svg, z);
    else salle(svg, z);
  }
  for (const [id, z] of Object.entries(ZONES)) {
    const p = z.type === "stade" ? panneau(svg, z.x + z.w / 2, 6, z.titre, z.role, true)
                                 : panneau(svg, z.x + 12, z.y - 15, z.titre, z.role);
    z.panneau = p;
  }
  // balle animée entre les deux finalistes
  const balle = s("g", {id: "balle", visibility: "hidden"}, svg);
  s("circle", {r: 6, fill: "#d9f24a", stroke: "#8aa02a", "stroke-width": 1.5}, balle);
  calques.persos = s("g", {id: "calque-persos"}, svg);
}

// =============================================================== personnages
function figurine({maillot, peau, cheveux, short = "#fff", raquette, casquette, bandeau, accessoire, k = 1}) {
  const g = s("g", {class: "figurine", transform: `scale(${k})`});
  s("ellipse", {cx: 0, cy: 0, rx: 14, ry: 5, fill: "rgba(0,0,0,.25)"}, g);
  s("rect", {x: -7.5, y: -17, width: 6, height: 15, rx: 2.5, fill: peau}, g);
  s("rect", {x: 1.5, y: -17, width: 6, height: 15, rx: 2.5, fill: peau}, g);
  s("ellipse", {cx: -4.5, cy: -2, rx: 5, ry: 3, fill: "#fff", stroke: "#3b3b3b", "stroke-width": 1.2}, g);
  s("ellipse", {cx: 4.5, cy: -2, rx: 5, ry: 3, fill: "#fff", stroke: "#3b3b3b", "stroke-width": 1.2}, g);
  s("rect", {x: -10, y: -26, width: 20, height: 11, rx: 3, fill: short}, g);
  s("rect", {x: -15, y: -44, width: 6, height: 17, rx: 3, fill: peau}, g);
  s("rect", {x: 9, y: -44, width: 6, height: 17, rx: 3, fill: peau}, g);
  s("rect", {x: -11, y: -46, width: 22, height: 22, rx: 7, fill: maillot, class: "maillot"}, g);
  s("path", {d: "M-5 -46 l5 6 l5 -6", fill: "none", stroke: "rgba(255,255,255,.7)", "stroke-width": 2}, g);
  if (raquette) {
    const r = s("g", {transform: "translate(14,-28) rotate(28)"}, g);
    s("line", {x1: 0, y1: 0, x2: 0, y2: -10, stroke: "#2a2a2a", "stroke-width": 3.2, "stroke-linecap": "round"}, r);
    s("ellipse", {cx: 0, cy: -19, rx: 7, ry: 9.5, fill: "rgba(255,255,255,.35)", stroke: "#222", "stroke-width": 2.4}, r);
  }
  s("circle", {cx: 0, cy: -58, r: 12, fill: peau, stroke: "rgba(0,0,0,.18)"}, g);
  s("path", {d: "M-12 -59 a12 12 0 0 1 24 0 q-6 -4 -12 -3 q-7 0 -12 3 z", fill: cheveux}, g);
  if (bandeau) s("rect", {x: -12, y: -62, width: 24, height: 4, rx: 1.5, fill: "#fff"}, g);
  if (casquette) {
    s("path", {d: "M-12 -60 a12 11 0 0 1 24 0 z", fill: casquette}, g);
    s("rect", {x: 4, y: -62, width: 14, height: 4, rx: 2, fill: casquette}, g);
  }
  s("circle", {cx: -4, cy: -56, r: 1.6, fill: "#222"}, g);
  s("circle", {cx: 4, cy: -56, r: 1.6, fill: "#222"}, g);
  if (accessoire === "porte-bloc") {
    s("rect", {x: 8, y: -42, width: 11, height: 14, rx: 1.5, fill: "#f4e7c5", stroke: "#7a6542", "stroke-width": 1.5}, g);
    s("line", {x1: 10, y1: -37, x2: 17, y2: -37, stroke: "#7a6542"}, g);
  } else if (accessoire === "appareil") {
    s("rect", {x: 6, y: -44, width: 16, height: 11, rx: 2, fill: "#222"}, g);
    s("circle", {cx: 14, cy: -38.5, r: 3.5, fill: "#5b6b7e", stroke: "#999"}, g);
  } else if (accessoire === "mallette") {
    s("rect", {x: 9, y: -24, width: 15, height: 11, rx: 2, fill: "#6b4423"}, g);
  } else if (accessoire === "cravate") {
    s("path", {d: "M-2 -45 l2 15 l2 -15 z", fill: "#c9a646"}, g);
  }
  return g;
}

const persos = new Map();
const calques = {persos: null};

function pastille(g, texte, y) {
  const p = s("g", {class: "etiquette", transform: `translate(0,${y})`}, g);
  const fond = s("rect", {x: -20, y: -9, width: 40, height: 17, rx: 8.5}, p);
  const t = s("text", {x: 0, y: 4}, p);
  t.textContent = texte;
  const l = Math.max(30, texte.length * 6.6 + 14);
  fond.setAttribute("x", -l / 2); fond.setAttribute("width", l);
  return p;
}

function creerJoueur(j, coach) {
  const couche = calques.persos;
  let gc = null;
  if (coach) {
    gc = s("g", {class: "perso coach", "data-coach": j.id, tabindex: 0, role: "button",
                 "aria-label": `${coach}, entraîneur de ${j.nom}`}, couche);
    gc.append(figurine({maillot: "#1e4d3a", short: "#1e4d3a", peau: PEAUX[hachage(coach) % PEAUX.length],
                        cheveux: CHEVEUX[hachage(coach) % CHEVEUX.length], casquette: "#0e3b2c", accessoire: "porte-bloc", k: 0.82}));
  }
  const g = s("g", {class: "perso joueur", "data-id": j.id, tabindex: 0, role: "button",
                    "aria-label": `${j.nom}, ${j.pilote === "llm" ? "piloté par le LLM" : "règle fixe"}`}, couche);
  g.append(figurine({maillot: MAILLOTS[j.paire % MAILLOTS.length], peau: PEAUX[hachage(j.nom) % PEAUX.length],
                     cheveux: CHEVEUX[hachage(j.pays + j.nom) % CHEVEUX.length], raquette: true, bandeau: true}));
  if (j.pilote === "llm") {
    const b = s("g", {class: "badge-ia", transform: "translate(0,-84)"}, g);
    s("rect", {x: -14, y: -9, width: 28, height: 16, rx: 8}, b);
    s("path", {d: "M-3 7 l3 5 l3 -5 z"}, b);
    const t = s("text", {x: 0, y: 3.5}, b);
    t.textContent = "IA";
  }
  const blessure = s("g", {visibility: "hidden"}, g);
  s("rect", {x: -13, y: -67, width: 26, height: 6, rx: 2, fill: "#fff", stroke: "#ccc"}, blessure);
  s("rect", {x: -2, y: -68, width: 4, height: 8, fill: "#e63946"}, blessure);
  s("rect", {x: -4, y: -66, width: 8, height: 4, fill: "#e63946"}, blessure);
  const trophee = s("g", {visibility: "hidden", transform: "translate(-24,-40)"}, g);
  s("path", {d: "M-8 -14 h16 v5 a8 8 0 0 1 -16 0 z", fill: "#e8b923", stroke: "#a8800f", "stroke-width": 1.2}, trophee);
  s("rect", {x: -2, y: -1, width: 4, height: 6, fill: "#c99a14"}, trophee);
  s("rect", {x: -6, y: 5, width: 12, height: 3.5, rx: 1, fill: "#a8800f"}, trophee);
  pastille(g, j.nom.split(" ").pop(), 16);
  s("rect", {x: -14, y: 28, width: 28, height: 4, rx: 2, fill: "rgba(0,0,0,.28)"}, g);
  const jauge = s("rect", {x: -14, y: 28, width: 0, height: 4, rx: 2}, g);
  persos.set(j.id, {g, gc, jauge, blessure, trophee});
}

function creerFigurant(id, zone, fx, opts, libelle) {
  const z = ZONES[zone], a = z.aire;
  const x = a.x + a.w * fx, y = a.y + a.h * 0.55;
  const g = s("g", {class: "perso figurant", "data-figurant": id, tabindex: 0, role: "button", "aria-label": libelle,
                    style: `transform:translate(${x}px,${y}px)`}, calques.persos);
  g.append(figurine(opts));
  pastille(g, libelle, 16);
  persos.set(id, {g});
}

// =============================================================== placement
function placesDans(zone, n) {
  const z = ZONES[zone], a = z.aire;
  // sur un court, les joueurs se répartissent de part et d'autre du filet
  if (COMPETITION.includes(zone) && n >= 2) {
    const g = Math.ceil(n / 2), demi = a.w / 2;
    const gauche = placesDansAire({x: a.x, y: a.y, w: demi - 8, h: a.h}, g);
    const droite = placesDansAire({x: a.x + demi + 8, y: a.y, w: demi - 8, h: a.h}, n - g);
    const tout = [...gauche, ...droite];
    tout.k = Math.min(gauche.k, droite.k);
    return tout;
  }
  return placesDansAire(a, n);
}

function placesDansAire(a, n) {
  const maxLignes = Math.max(1, Math.floor(a.h / RANG_MIN));
  let cols = Math.max(1, Math.min(n, Math.floor(a.w / 62)));
  if (Math.ceil(n / cols) > maxLignes) cols = Math.ceil(n / maxLignes);
  const pas = Math.min(PLACE, a.w / cols), lignes = Math.max(1, Math.ceil(n / cols));
  const hauteur = Math.min(RANG, a.h / lignes);
  const y0 = a.y + (a.h - hauteur * lignes) / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, l = Math.floor(i / cols), dansLigne = Math.min(cols, n - l * cols);
    const x0 = a.x + (a.w - dansLigne * pas) / 2 + pas / 2 - 10;
    out.push([x0 + c * pas, y0 + hauteur * (l + 1) - 6]);
  }
  out.k = lignes > 1 || pas < 66 ? 0.8 : 1;   // lieu bondé : personnages un peu plus petits
  return out;
}

function decisionEnDirect(e) {
  const m = new Map();
  for (const a of e.semaine_courante || []) if (a.role === "joueur" && a.sujet && a.ok) m.set(a.sujet, a.champs);
  return m;
}

function zoneDe(d, direct) {
  if (direct) return direct.jouer === true ? "vestiaires" : (ZONES[direct.entrainement] && !COMPETITION.includes(direct.entrainement) ? direct.entrainement : "repos");
  if (!d) return "vestiaires";
  if (d.blessure > 0 && !d.tour) return "infirmerie";
  if (d.tour) return TOUR_ZONE[d.tour] || null;
  return ZONES[d.entrainement] ? d.entrainement : "repos";
}

let villagePret = false, figurantsPrets = false, selection = null, dernierEtat = null;

function rendreTableau(e) {
  const S = e.saison, k = e.semaines_faites, total = e.semaines, max = Number(document.getElementById("curseur").max);
  const cal = new Map(((S || {}).calendrier || []).map(t => [t.semaine, t]));
  const t = cal.get(k);
  document.getElementById("curseur-txt").textContent = S ? (k === 0 ? "0" : String(k)) : "–";
  document.getElementById("aff-total").textContent = `/ ${total}`;
  document.getElementById("aff-tournoi").textContent = !S ? "En attente de la première semaine" : k === 0 ? "Avant la saison"
    : t ? t.nom : "Semaine sans tournoi";
  document.getElementById("aff-detail").textContent = !S || k === 0 ? "" : t
    ? `${t.categorie === "Majeur" ? "Grand Chelem" : "Catégorie " + t.categorie}, ${SURFACES[t.surface][0]}`
    : "Les joueurs s'entraînent ou récupèrent";
  const frise = document.getElementById("frise");
  frise.replaceChildren();
  for (let w = 1; w <= total; w++) {
    const tw = cal.get(w), jouee = w <= max;
    const b = el("button", {type: "button", class: "case" + (w === k ? " vue" : "") + (jouee ? " jouee" : "")
      + (tw ? " s-" + tw.surface : " s-aucun") + (!jouee && w === max + 1 && !e.termine ? " encours" : ""),
      title: tw ? `Semaine ${w} : ${tw.nom} (${tw.categorie})` : `Semaine ${w} : pas de tournoi`,
      "aria-label": `Semaine ${w}` + (tw ? `, ${tw.nom}` : ", pas de tournoi") + (jouee ? "" : ", pas encore jouée"),
      "aria-current": w === k ? "true" : "false"},
      el("b", {}, w), el("span", {}, tw ? (tw.categorie === "Majeur" ? "GC" : tw.categorie) : "repos"));
    if (!jouee) b.disabled = true;
    b.addEventListener("click", () => {
      const c = document.getElementById("curseur");
      c.value = w;
      c.dispatchEvent(new Event("input", {bubbles: true}));
    });
    frise.append(b);
  }
}

function rendreScene(e) {
  dernierEtat = e;
  const svg = document.getElementById("scene");
  if (!villagePret) {
    dessinerVillage(svg);
    villagePret = true;
    // la largeur des panneaux dépend de la police : on la recalcule une fois Barlow chargée
    document.fonts?.ready.then(() => { ajusterPanneaux(); if (dernierEtat) rendreScene(dernierEtat); });
  }
  rendreTableau(e);
  const S = e.saison;
  const info = document.getElementById("scene-info");
  if (!S) { info.textContent = "Le village se remplit à la fin de la première semaine."; return; }
  if (!figurantsPrets) {
    creerFigurant("journaliste", "presse", 0.18, {maillot: "#5b6b7e", peau: PEAUX[1], cheveux: CHEVEUX[2], short: "#3a3f47", accessoire: "appareil"}, "Le Filet");
    creerFigurant("agent", "sponsors", 0.32, {maillot: "#2b2d42", short: "#2b2d42", peau: PEAUX[2], cheveux: CHEVEUX[3], accessoire: "mallette"}, "Agent");
    creerFigurant("sponsor", "sponsors", 0.66, {maillot: "#3d405b", short: "#3d405b", peau: PEAUX[0], cheveux: CHEVEUX[1], accessoire: "cravate"}, "Sponsor");
    figurantsPrets = true;
  }
  const derniere = S.semaines[S.semaines.length - 1];
  const D = new Map((derniere ? derniere.decisions : []).map(d => [d.joueur, d]));
  const direct = decisionEnDirect(e);
  const tournoi = derniere && derniere.tournoi ? S.calendrier.find(t => t.nom === derniere.tournoi) : null;
  const surf = tournoi ? SURFACES[tournoi.surface] : SANS_TOURNOI;
  svg.querySelectorAll(".surface").forEach(r => r.setAttribute("fill", surf[1]));
  svg.querySelectorAll(".surface-sombre").forEach(r => r.setAttribute("fill", surf[2]));
  svg.querySelectorAll(".surface-fixe").forEach(r => r.setAttribute("fill", "#2f6cb0"));
  const pc = ZONES.central.panneau;
  pc.t.textContent = tournoi ? tournoi.nom : "Stade central";
  pc.st.textContent = tournoi ? "finale" : "pas de tournoi cette semaine";
  // recentre le panneau du stade
  const lt = pc.t.getComputedTextLength(), ls = pc.st.getComputedTextLength(), L = lt + ls + 38, x0 = 800 - L / 2;
  pc.fond.setAttribute("x", x0); pc.fond.setAttribute("width", L);
  pc.t.setAttribute("x", x0 + 14); pc.st.setAttribute("x", x0 + 24 + lt);

  for (const j of S.joueurs) if (!persos.has(j.id)) creerJoueur(j, j.pilote === "llm" ? j.entraineur : null);

  const parZone = new Map();
  let r16 = 0;
  for (const j of S.joueurs) {
    let z = zoneDe(D.get(j.id), direct.get(j.id));
    if (z === null) z = (r16++ % 2 === 0) ? "r16a" : "r16b";
    if (!parZone.has(z)) parZone.set(z, []);
    parZone.get(z).push(j);
  }
  const finalistes = [];
  for (const [z, liste] of parZone) {
    if (z === "central") liste.sort((a, b) => (D.get(b.id)?.tour === "V") - (D.get(a.id)?.tour === "V"));
    let places = placesDans(z, liste.length);
    if (z === "central" && liste.length === 2) {         // un de chaque côté du filet
      const a = ZONES.central.aire;
      places = [[a.x + a.w * 0.2, a.y + a.h * 0.68], [a.x + a.w * 0.74, a.y + a.h * 0.68]];
      places.k = 1.1;
    }
    liste.forEach((j, i) => {
      const p = persos.get(j.id), [x, y] = places[i], d = D.get(j.id), dd = direct.get(j.id);
      const k = places.k || 1;
      p.g.style.transform = `translate(${x}px,${y}px) scale(${k})`;
      if (p.gc) p.gc.style.transform = `translate(${x + 30 * k}px,${y + 4 * k}px) scale(${k})`;
      const fatigue = d ? d.fatigue : 0;
      p.jauge.setAttribute("width", Math.max(0.5, 28 * Math.min(10, fatigue) / 10));
      p.jauge.setAttribute("fill", fatigue >= 6 ? "#e63946" : fatigue >= 3 ? "#f4a261" : "#52b788");
      p.blessure.setAttribute("visibility", d && d.blessure > 0 ? "visible" : "hidden");
      p.trophee.setAttribute("visibility", d && d.tour === "V" ? "visible" : "hidden");
      p.g.classList.toggle("decide", !!dd);
      if (z === "central") finalistes.push([x, y]);
    });
  }
  animerBalle(finalistes);
  const nDirect = direct.size;
  info.textContent = nDirect ? `${nDirect} joueur(s) IA ont déjà choisi leur programme de la semaine suivante (contour jaune).` : "";
  rendreBulle(e);
  if (selection) montrerFiche(selection.type, selection.id, null);
}

function animerBalle(f) {
  const b = document.getElementById("balle");
  b.querySelector("animateMotion")?.remove();
  if (f.length !== 2) { b.setAttribute("visibility", "hidden"); return; }
  const [[x1, y1], [x2, y2]] = f, h1 = y1 - 40, h2 = y2 - 40;
  if (REDUIT) {
    b.setAttribute("transform", `translate(${(x1 + x2) / 2},${h1 - 20})`);
    b.setAttribute("visibility", "visible");
    return;
  }
  b.removeAttribute("transform");
  const m = s("animateMotion", {dur: "1.8s", repeatCount: "indefinite", keyPoints: "0;1;0", keyTimes: "0;0.5;1",
    calcMode: "spline", keySplines: "0.4 0 0.6 1;0.4 0 0.6 1",
    path: `M${x1 + 16} ${h1} Q${(x1 + x2) / 2} ${Math.min(h1, h2) - 90} ${x2 - 16} ${h2}`}, b);
  b.setAttribute("visibility", "visible");
  m.beginElement?.();
}

// =============================================================== bulle « vient de répondre »
function acteur(a) {
  if (!a) return null;
  if (a.role === "journaliste") return persos.get("journaliste")?.g;
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
  b.replaceChildren(el("b", {}, (ROLES[a.role] || a.role)),
    texte ? el("div", {}, texte.length > 120 ? texte.slice(0, 120) + "…" : texte) : el("div", {}, "réfléchit…"));
  const pos = g ? versEcran(g) : null;
  if (pos) {
    g.classList.add("parle");
    b.style.left = Math.max(4, pos[0] - 24) + "px";
    b.style.top = Math.max(4, pos[1] - 150) + "px";
    b.classList.remove("libre");
  } else {
    b.style.left = "12px"; b.style.top = "12px";
    b.classList.add("libre");
  }
  b.hidden = false;
}

// =============================================================== fiches (badge d'accréditation)
function ligne(cle, val) { return el("div", {class: "kv"}, el("span", {}, cle), el("b", {}, val)); }
function stat(val, lib) { return el("div", {class: "stat"}, el("b", {}, val), el("span", {}, lib)); }
function citation(qui, texte) { return el("blockquote", {}, el("span", {}, qui), texte); }

function ficheJoueur(id) {
  const e = dernierEtat, S = e.saison, j = S.joueurs.find(x => x.id === id);
  const derniere = S.semaines[S.semaines.length - 1];
  const d = derniere ? derniere.decisions.find(x => x.joueur === id) : null;
  const rang = [...S.joueurs].sort((a, b) => b.points - a.points).findIndex(x => x.id === id) + 1;
  const jumeau = S.joueurs.find(x => x.paire === j.paire && x.id !== id);
  const dd = decisionEnDirect(e).get(id);
  const lecons = j.memoire.filter(m => m.type === "reflexion");
  const delta = j.points - j.points_depart;
  const tour = !derniere ? "–" : !derniere.tournoi ? "pas de tournoi"
    : d && d.tour ? (TOURS[d.tour] || d.tour) : (d && !d.jouer ? "forfait" : "non inscrit");
  const fatigue = d ? d.fatigue : 0;
  return {couleur: MAILLOTS[j.paire % MAILLOTS.length], contenu: [
    el("div", {class: "fiche-tete"}, el("span", {class: "pays"}, j.pays),
      el("span", {class: "pilote" + (j.pilote === "llm" ? " ia" : "")}, j.pilote === "llm" ? "Piloté par l'IA" : "Règle fixe")),
    el("h3", {}, j.nom),
    el("p", {class: "perso-txt"}, `${j.age} ans, style ${j.style}. ${j.personnalite.charAt(0).toUpperCase() + j.personnalite.slice(1)}.`),
    el("div", {class: "stats"}, stat(rang + "e", "rang"), stat(j.points, "points"),
      stat(j.titres, "titres"), stat(`${j.victoires}-${j.matchs - j.victoires}`, "bilan")),
    ligne("Depuis le début", `${signe(delta)} points`),
    el("div", {class: "fatigue"}, el("span", {}, `Fatigue ${fatigue}/10${d && d.blessure ? ", blessé" : ""}`),
      el("i", {style: `width:${fatigue * 10}%;background:${fatigue >= 6 ? "#e63946" : fatigue >= 3 ? "#f4a261" : "#52b788"}`})),
    ligne(`Semaine ${derniere ? derniere.semaine : "–"}`, `${tour}, entraînement ${d ? d.entrainement : "–"}`),
    d && d.tactique ? ligne("Tactique", d.tactique.replace("_", " ")) : null,
    j.pilote === "llm" ? ligne("Entraîneur", j.entraineur) : null,
    j.sponsor ? ligne("Sponsor", j.sponsor) : null,
    ligne("Son jumeau", `${jumeau.nom} (${jumeau.pilote === "llm" ? "IA" : "règle"}), ${jumeau.points} pts`),
    d && d.raisonnement ? citation("Son raisonnement", d.raisonnement) : null,
    d && d.conseil && d.conseil.conseil ? citation(d.conseil.entraineur, d.conseil.conseil) : null,
    dd ? citation("Programme de la semaine suivante", `${dd.jouer ? "Il joue" : "Il ne joue pas"}, entraînement ${dd.entrainement}. ${dd.raisonnement || ""}`) : null,
    lecons.length ? citation("Dernière leçon", lecons[lecons.length - 1].texte.replace(/^Leçon : /, "")) : null,
  ]};
}

function ficheCoach(id) {
  const S = dernierEtat.saison, j = S.joueurs.find(x => x.id === id);
  const conseils = S.semaines.flatMap(w => w.decisions.filter(d => d.joueur === id && d.conseil && d.conseil.conseil)
    .map(d => ({semaine: w.semaine, ...d.conseil, suivi: d.conseil.recommande_jouer === d.jouer})));
  const dernier = conseils[conseils.length - 1];
  const tacts = {};
  conseils.forEach(c => { tacts[c.tactique] = (tacts[c.tactique] || 0) + 1; });
  return {couleur: "#1e4d3a", contenu: [
    el("div", {class: "fiche-tete"}, el("span", {class: "pays"}, "Staff"), el("span", {class: "pilote ia"}, "Piloté par l'IA")),
    el("h3", {}, j.entraineur),
    el("p", {class: "perso-txt"}, `Entraîneur de ${j.nom}.`),
    el("div", {class: "stats"}, stat(conseils.length, "conseils"),
      stat(conseils.length ? `${conseils.filter(c => c.suivi).length}/${conseils.length}` : "–", "écouté")),
    ligne("Tactiques choisies", Object.entries(tacts).map(([t, n]) => `${t.replace("_", " ")} ×${n}`).join(", ") || "–"),
    dernier ? citation(`Semaine ${dernier.semaine}`, dernier.conseil) : null,
  ]};
}

function ficheFigurant(id) {
  const S = dernierEtat.saison;
  if (id === "journaliste") {
    const a = S.articles[S.articles.length - 1];
    return {couleur: "#5b6b7e", contenu: [
      el("div", {class: "fiche-tete"}, el("span", {class: "pays"}, "Presse"), el("span", {class: "pilote ia"}, "Piloté par l'IA")),
      el("h3", {}, "Le Filet"), el("p", {class: "perso-txt"}, `${S.articles.length} article(s) publiés cette saison.`),
      a ? citation(a.titre, a.article) : el("p", {class: "perso-txt"}, "Le premier article paraît après le premier tournoi.")]};
  }
  const negos = S.negociations || [], signes = negos.filter(n => n.contrat);
  return {couleur: "#6e2e3e", contenu: [
    el("div", {class: "fiche-tete"}, el("span", {class: "pays"}, id === "agent" ? "Agent" : "Sponsors"), el("span", {class: "pilote ia"}, "Piloté par l'IA")),
    el("h3", {}, id === "agent" ? "Agent sportif" : "Sponsors"),
    el("div", {class: "stats"}, stat(negos.length, "négociations"), stat(signes.length, "contrats signés")),
    ...signes.slice(-4).map(n => ligne(S.joueurs.find(x => x.id === n.joueur).nom, `${n.contrat.toLocaleString("fr-FR")} € (${n.sponsor})`)),
    negos.length ? null : el("p", {class: "perso-txt"}, "Les négociations ont lieu en semaines 6 et 12.")]};
}

function montrerFiche(type, id, evt) {
  const f = document.getElementById("fiche");
  const {couleur, contenu} = type === "coach" ? ficheCoach(id) : type === "figurant" ? ficheFigurant(id) : ficheJoueur(id);
  const fermer = el("button", {type: "button", class: "fermer", "aria-label": "Fermer la fiche"}, "×");
  fermer.addEventListener("click", ev => { ev.stopPropagation(); selection = null; f.hidden = true; });
  f.style.setProperty("--couleur", couleur);
  f.replaceChildren(fermer, ...contenu.filter(Boolean));
  selection = {type, id};
  const boite = document.getElementById("scene-boite").getBoundingClientRect();
  if (evt) {
    const x = evt.clientX - boite.left, y = evt.clientY - boite.top;
    f.hidden = false;
    f.style.left = Math.max(6, Math.min(x + 18, boite.width - f.offsetWidth - 6)) + "px";
    f.dataset.y = y;
  }
  f.hidden = false;
  f.style.top = Math.max(6, Math.min(Number(f.dataset.y || 0) - 30, boite.height - f.offsetHeight - 6)) + "px";
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
    const r = evt.target.getBoundingClientRect();
    evt.target.dispatchEvent(new MouseEvent("click", {bubbles: true, clientX: r.x + r.width / 2, clientY: r.y}));
  }
  if (evt.key === "Escape") { selection = null; document.getElementById("fiche").hidden = true; }
});
