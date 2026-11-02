// Village du circuit en 3D (Three.js). Lit /etat comme le plan 2D, n'écrit rien.
import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {CSS2DRenderer, CSS2DObject} from "three/addons/renderers/CSS2DRenderer.js";

const REDUIT = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = id => document.getElementById(id);
function el(tag, attrs, ...enfants) {            // texte via textContent : pas d'injection
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") n.className = v; else if (k === "style") n.style.cssText = v; else n.setAttribute(k, v);
  }
  for (const e of enfants) if (e !== null && e !== undefined && e !== false) n.append(e instanceof Node ? e : String(e));
  return n;
}
const signe = x => (x > 0 ? "+" : "") + Math.round(x);
const hachage = t => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const ROLES = {joueur: "Joueur", entraineur: "Entraîneur", reflexion: "Réflexion", journaliste: "Journaliste",
               conference: "Conférence de presse", agent: "Agent sportif", sponsor: "Sponsor"};
const TOURS = {V: "titre", F: "finale", SF: "demi-finale", QF: "quart de finale", R16: "premier tour"};
const SURFACES = {Hard: {nom: "dur", c: 0x2f6cb0, bord: 0x255a95}, Clay: {nom: "terre battue", c: 0xc4663f, bord: 0xa9532f},
                  Grass: {nom: "gazon", c: 0x5d9b47, bord: 0x4c843a}};
const SANS_TOURNOI = {c: 0x7d977a, bord: 0x6c8569};
const MAILLOTS = [0xe4572e, 0x2e86ab, 0xf3a712, 0x7b2cbf, 0x1b998b, 0xd1495b, 0x3a86ff, 0x8c6d46];
const MAILLOTS_CSS = ["#e4572e", "#2e86ab", "#f3a712", "#7b2cbf", "#1b998b", "#d1495b", "#3a86ff", "#8c6d46"];
const PEAUX = [0xf3d2b3, 0xdcaa80, 0xad7a52, 0x7b5236];
const CHEVEUX = [0x2b1b12, 0x5a3a22, 0xc9a15a, 0x1f1f1f, 0x8a4b2a];

// ------------------------------------------------------------------ plan (mêmes lieux que le plan 2D)
const K = 0.1, wx = x => (x - 800) * K, wz = y => (y - 570) * K;
const LIEUX = {
  central:    {type: "stade", r: [470, 40, 660, 500], court: [612, 188, 376, 196], titre: "Stade central", role: "finale"},
  sf:         {type: "arene", r: [60, 60, 360, 225], court: [92, 113, 296, 120], titre: "Court 1", role: "demi-finales"},
  qf:         {type: "arene", r: [60, 310, 360, 225], court: [92, 363, 296, 120], titre: "Court 2", role: "quarts de finale"},
  r16a:       {type: "annexe", r: [1180, 60, 360, 225], court: [1205, 92, 310, 160], titre: "Court 3", role: "premier tour"},
  r16b:       {type: "annexe", r: [1180, 310, 360, 225], court: [1205, 342, 310, 160], titre: "Court 4", role: "premier tour"},
  vestiaires: {type: "batiment", sol: "vestiaires", r: [60, 630, 270, 262], titre: "Vestiaires", role: "inscrits de la semaine"},
  service:    {type: "entrainement", r: [350, 630, 315, 262], court: [368, 660, 279, 214], titre: "Entraînement", role: "service"},
  retour:     {type: "entrainement", r: [680, 630, 315, 262], court: [698, 660, 279, 214], titre: "Entraînement", role: "retour"},
  physique:   {type: "batiment", sol: "gym", r: [1015, 630, 255, 262], titre: "Salle de sport"},
  infirmerie: {type: "batiment", sol: "infirmerie", r: [1290, 630, 250, 262], titre: "Infirmerie"},
  repos:      {type: "detente", r: [60, 915, 605, 200], titre: "Espace détente", role: "repos"},
  presse:     {type: "batiment", sol: "presse", r: [680, 915, 380, 200], titre: "Salle de presse"},
  sponsors:   {type: "batiment", sol: "sponsors", r: [1075, 915, 465, 200], titre: "Salon des sponsors"},
};
const COMPETITION = ["central", "sf", "qf", "r16a", "r16b"];
const TOUR_LIEU = {V: "central", F: "central", SF: "sf", QF: "qf"};
const ALLEE_Z = wz(586);
function rect([x, y, w, h], marge = 0) {
  return {x: wx(x + marge), z: wz(y + marge), w: (w - 2 * marge) * K, d: (h - 2 * marge) * K,
          cx: wx(x + w / 2), cz: wz(y + h / 2)};
}
for (const L of Object.values(LIEUX)) {
  L.R = rect(L.r);
  if (L.court) L.C = rect(L.court);
  if (L.type === "detente") L.aire = {x: L.R.x + 28, z: L.R.z + 5, w: L.R.w - 30, d: L.R.d - 7};
  else if (L.C) L.aire = {x: L.C.x + 1.5, z: L.C.z + 2, w: L.C.w - 3, d: L.C.d - 3};
  else L.aire = {x: L.R.x + 2, z: L.R.z + 6, w: L.R.w - 4, d: L.R.d - 7.5};
}

// ------------------------------------------------------------------ moteur
const conteneur = $("monde");
let rendu;
try {
  rendu = new THREE.WebGLRenderer({antialias: true});
} catch (e) {
  $("voile").replaceChildren("Ce navigateur n'affiche pas la 3D (WebGL indisponible).",
    el("small", {}, el("a", {href: "/"}, "Ouvrir le plan 2D")));
  throw e;
}
rendu.setPixelRatio(Math.min(devicePixelRatio, 2));
rendu.setSize(innerWidth, innerHeight);
rendu.shadowMap.enabled = true;
rendu.shadowMap.type = THREE.PCFSoftShadowMap;
rendu.toneMapping = THREE.ACESFilmicToneMapping;
rendu.toneMappingExposure = 1.05;
conteneur.append(rendu.domElement);
const etiquettes = new CSS2DRenderer({element: $("etiquettes")});
etiquettes.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9d8ee);
scene.fog = new THREE.Fog(0xa9d8ee, 190, 420);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 900);
const VUE = {pos: new THREE.Vector3(14, 128, 122), cible: new THREE.Vector3(0, 0, -6)};
camera.position.copy(VUE.pos);
const controles = new OrbitControls(camera, rendu.domElement);
controles.target.copy(VUE.cible);
controles.enableDamping = true;
controles.dampingFactor = 0.08;
controles.minDistance = 18;
controles.maxDistance = 260;
controles.maxPolarAngle = Math.PI * 0.45;
controles.screenSpacePanning = false;

const ciel = new THREE.HemisphereLight(0xe2f3ff, 0x5f7f3c, 1.25);
scene.add(ciel);
const soleil = new THREE.DirectionalLight(0xfff1d6, 2.6);
soleil.castShadow = true;
soleil.shadow.mapSize.set(2048, 2048);
Object.assign(soleil.shadow.camera, {left: -115, right: 115, top: 95, bottom: -95, near: 10, far: 400});
soleil.shadow.bias = -0.0006;
scene.add(soleil, soleil.target);

// ------------------------------------------------------------------ matières et formes partagées
const matieres = new Map();
function mat(couleur, opts = {}) {
  const cle = couleur + JSON.stringify(opts);
  if (!matieres.has(cle)) matieres.set(cle, new THREE.MeshStandardMaterial({color: couleur, roughness: 0.85, flatShading: true, ...opts}));
  return matieres.get(cle);
}
function boite(w, h, d, couleur, x, y, z, parent, ombre = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof couleur === "number" ? mat(couleur) : couleur);
  m.position.set(x, y, z);
  m.castShadow = ombre; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cylindre(rh, rb, h, couleur, x, y, z, parent, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rh, rb, h, seg), typeof couleur === "number" ? mat(couleur) : couleur);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function panneau(texte, role, x, y, z) {
  const d = el("div", {class: "panneau3d"}, texte, role ? el("span", {}, role) : null);
  const o = new CSS2DObject(d);
  o.position.set(x, y, z);
  scene.add(o);
  return d;
}

// ------------------------------------------------------------------ courts (texture dessinée)
const courtsCompetition = [];
function texteCourt(couleur, w, d) {
  const toile = document.createElement("canvas");
  toile.width = 1024; toile.height = Math.round(1024 * d / w);
  const tex = new THREE.CanvasTexture(toile);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const dessiner = c => {
    const g = toile.getContext("2d"), W = toile.width, H = toile.height;
    g.fillStyle = "#" + c.toString(16).padStart(6, "0");
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#ffffff"; g.lineWidth = Math.max(4, W / 160);
    const m = W * 0.05, mh = H * 0.08, sd = (H - 2 * mh) * 0.125;
    g.strokeRect(m, mh, W - 2 * m, H - 2 * mh);
    g.beginPath();
    g.moveTo(m, mh + sd); g.lineTo(W - m, mh + sd);
    g.moveTo(m, H - mh - sd); g.lineTo(W - m, H - mh - sd);
    g.moveTo(W * 0.28, mh + sd); g.lineTo(W * 0.28, H - mh - sd);
    g.moveTo(W * 0.72, mh + sd); g.lineTo(W * 0.72, H - mh - sd);
    g.moveTo(W * 0.28, H / 2); g.lineTo(W * 0.72, H / 2);
    g.moveTo(m, H / 2); g.lineTo(m + W * 0.012, H / 2);
    g.moveTo(W - m, H / 2); g.lineTo(W - m - W * 0.012, H / 2);
    g.stroke();
    tex.needsUpdate = true;
  };
  dessiner(couleur);
  return {tex, dessiner};
}

function court(C, parent, fixe) {
  const t = texteCourt(fixe ? 0x2f6cb0 : SANS_TOURNOI.c, C.w, C.d);
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(C.w, C.d), new THREE.MeshStandardMaterial({map: t.tex, roughness: 0.9}));
  sol.rotation.x = -Math.PI / 2;
  sol.position.set(C.cx, 0.12, C.cz);
  sol.receiveShadow = true;
  parent.add(sol);
  if (!fixe) courtsCompetition.push(t);
  // filet
  const filet = boite(0.12, 0.9, C.d * 0.9, new THREE.MeshStandardMaterial({color: 0x1d1d1d, transparent: true, opacity: 0.55}), C.cx, 0.57, C.cz, parent);
  filet.castShadow = false;
  boite(0.16, 0.12, C.d * 0.9, 0xffffff, C.cx, 1.04, C.cz, parent);
  cylindre(0.12, 0.12, 1.1, 0x333333, C.cx, 0.6, C.cz - C.d * 0.46, parent, 8);
  cylindre(0.12, 0.12, 1.1, 0x333333, C.cx, 0.6, C.cz + C.d * 0.46, parent, 8);
}

const abords = [];   // surfaces autour des courts, teintées selon la surface du tournoi
function abord(w, d, x, z, parent) {
  const m = boite(w, 0.1, d, new THREE.MeshStandardMaterial({color: SANS_TOURNOI.bord, roughness: 0.95}), x, 0.06, z, parent, false);
  abords.push(m.material);
  return m;
}

// ------------------------------------------------------------------ décor
function arbre(x, z, s = 1) {
  const g = new THREE.Group();
  cylindre(0.35 * s, 0.5 * s, 2.6 * s, 0x7a5232, 0, 1.3 * s, 0, g, 6);
  const f1 = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 * s, 0), mat(0x3f7a37));
  f1.position.y = 3.8 * s; f1.castShadow = true;
  const f2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 * s, 0), mat(0x5a9c48));
  f2.position.set(0.6 * s, 5.2 * s, 0.4 * s); f2.castShadow = true;
  g.add(f1, f2);
  g.position.set(x, 0, z);
  g.rotation.y = hachage(`${x}${z}`) % 6;
  scene.add(g);
}

function sol() {
  const toile = document.createElement("canvas");
  toile.width = 64; toile.height = 64;
  const g = toile.getContext("2d");
  g.fillStyle = "#8cbf5b"; g.fillRect(0, 0, 64, 32);
  g.fillStyle = "#82b552"; g.fillRect(0, 32, 64, 32);
  const tex = new THREE.CanvasTexture(toile);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 60);
  tex.magFilter = THREE.NearestFilter;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(520, 420), new THREE.MeshStandardMaterial({map: tex, roughness: 1}));
  p.rotation.x = -Math.PI / 2;
  p.receiveShadow = true;
  scene.add(p);
  // allées
  const sable = 0xe9dcb5;
  boite(156, 0.08, 4.6, sable, 0, 0.04, ALLEE_Z, scene, false);
  boite(3, 0.08, 51, sable, wx(35), 0.04, wz(860), scene, false);
  [[240, 548], [1370, 548], [800, 548], [510, 618], [1160, 618], [1520, 618], [382, 905], [870, 905]].forEach(([x, y]) =>
    boite(4, 0.08, 3.4, sable, wx(x), 0.04, wz(y), scene, false));
}

function stade(L) {
  const g = new THREE.Group(), cx = L.R.cx, cz = wz(290);
  const anneaux = [[26, 17], [29, 19.5], [32, 22], [35, 24.5], [37.5, 26.5]];
  const couleurs = [0x3d5468, 0x557089, 0x4a6379, 0x557089];
  for (let i = 0; i < 4; i++) {
    const [ri, rzi] = anneaux[i], [ro, rzo] = anneaux[i + 1];
    const forme = new THREE.Shape(); forme.absellipse(0, 0, ro, rzo, 0, Math.PI * 2);
    const trou = new THREE.Path(); trou.absellipse(0, 0, ri, rzi, 0, Math.PI * 2, true);
    forme.holes.push(trou);
    const geo = new THREE.ExtrudeGeometry(forme, {depth: 1.4 + i * 1.5, bevelEnabled: false, curveSegments: 48});
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat(couleurs[i]));
    m.position.set(cx, 0, cz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  // fond intérieur teinté et court
  const fond = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({color: SANS_TOURNOI.bord, roughness: 0.95}));
  fond.scale.set(26, 17, 1); fond.rotation.x = -Math.PI / 2; fond.position.set(cx, 0.08, cz);
  fond.receiveShadow = true;
  abords.push(fond.material);
  g.add(fond);
  court(L.C, g, false);
  // mâts d'éclairage
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const x = cx + sx * 31, z = cz + sz * 21;
    cylindre(0.35, 0.5, 18, 0x9aa3ad, x, 9, z, g, 8);
    boite(3.2, 1.8, 0.5, new THREE.MeshStandardMaterial({color: 0xfffbe6, emissive: 0xfff3c0, emissiveIntensity: 0.9}), x, 18.4, z, g);
  });
  // drapeaux sur l'anneau nord
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (1.15 + i * 0.117), x = cx + Math.cos(a) * 37, z = cz + Math.sin(a) * 26.5;
    cylindre(0.08, 0.08, 5, 0xdddddd, x, 8.3, z, g, 6);
    const d = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshStandardMaterial({color: MAILLOTS[i], side: THREE.DoubleSide}));
    d.position.set(x + 1.1, 10.1, z);
    d.castShadow = true;
    drapeaux.push(d);
    g.add(d);
  }
  // tunnel d'entrée
  boite(6, 3.2, 4, 0x2c3e50, cx, 1.6, cz + 26, g);
  scene.add(g);
  L.panneau = panneau(L.titre, L.role, cx, 7.5, cz + 23.5);
}
const drapeaux = [];

function arene(L) {
  const g = new THREE.Group(), R = L.R, C = L.C;
  abord(R.w - 1, R.d - 9, R.cx, R.cz, g);
  for (let i = 0; i < 3; i++) {              // gradins nord et sud
    boite(R.w, 1 + i * 1.1, 1.6, i % 2 ? 0x557089 : 0x4a6379, R.cx, (1 + i * 1.1) / 2, R.z + 0.8 + (2 - i) * 1.6, g);
    boite(R.w, 1 + i * 1.1, 1.6, i % 2 ? 0x557089 : 0x4a6379, R.cx, (1 + i * 1.1) / 2, R.z + R.d - 0.8 - (2 - i) * 1.6, g);
  }
  court(C, g, false);
  scene.add(g);
  L.panneau = panneau(L.titre, L.role, R.cx, 6.2, R.z);
}

function grillage(R, g) {
  const m = new THREE.MeshStandardMaterial({color: 0x1e4d34, transparent: true, opacity: 0.8, roughness: 1});
  boite(R.w, 2.4, 0.15, m, R.cx, 1.2, R.z, g);
  boite(R.w, 2.4, 0.15, m, R.cx, 1.2, R.z + R.d, g);
  boite(0.15, 2.4, R.d, m, R.x, 1.2, R.cz, g);
  boite(0.15, 2.4, R.d, m, R.x + R.w, 1.2, R.cz, g);
}

function annexe(L, fixe) {
  const g = new THREE.Group(), R = L.R;
  if (fixe) boite(R.w - 1, 0.1, R.d - 1, 0x255a95, R.cx, 0.06, R.cz, g, false);
  else abord(R.w - 1, R.d - 1, R.cx, R.cz, g);
  court(L.C, g, fixe);
  grillage({x: R.x + 0.5, z: R.z + 0.5, w: R.w - 1, d: R.d - 1, cx: R.cx, cz: R.cz}, g);
  boite(4.4, 0.5, 0.9, 0x8a6a48, R.cx, 0.6, R.z + R.d - 1.5, g);
  scene.add(g);
  L.panneau = panneau(L.titre, L.role, R.x + 6, 4.2, R.z + 0.5);
  return g;
}

function entrainement(L) {
  const g = annexe(L, true), C = L.C;
  if (L.role === "service") {
    cylindre(0.9, 0.7, 1.1, new THREE.MeshStandardMaterial({color: 0x333333, wireframe: true}), C.x + C.w - 2, 0.7, C.z + 2, g, 10);
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(geoBalle, mat(0xd9f24a, {emissive: 0x4a5a00}));
      b.position.set(C.x + C.w - 2 + Math.cos(i) * 0.45, 1.25 + (i % 3) * 0.12, C.z + 2 + Math.sin(i * 1.7) * 0.45);
      g.add(b);
    }
    [0, 1, 2].forEach(i => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 8), mat(0xff8a3d)); c.position.set(C.x + 4 + i * 3, 0.5, C.z + C.d - 2); c.castShadow = true; g.add(c); });
  } else {
    boite(1.8, 1.2, 1.4, 0x40464f, C.x + C.w - 2.4, 0.75, C.z + 2.2, g);
    cylindre(0.5, 0.5, 0.6, 0xd9f24a, C.x + C.w - 2.4, 1.6, C.z + 2.2, g, 10);
  }
}

function batiment(L) {
  const g = new THREE.Group(), R = L.R;
  const sols = {vestiaires: 0xd8b98a, gym: 0x4a5059, infirmerie: 0xeef2f4, presse: 0xd9d4c7, sponsors: 0x6e2e3e};
  boite(R.w, 0.3, R.d, sols[L.sol], R.cx, 0.15, R.cz, g, false);
  const murC = L.sol === "sponsors" ? 0xe8dcc3 : 0xeae3d6, e = 0.6, h = 3.2;
  boite(R.w, h, e, murC, R.cx, h / 2, R.z + e / 2, g);                 // nord
  boite(e, h, R.d, murC, R.x + e / 2, h / 2, R.cz, g);                 // ouest
  boite(e, h, R.d, murC, R.x + R.w - e / 2, h / 2, R.cz, g);           // est
  boite(R.w, 0.9, e, murC, R.cx, 0.45, R.z + R.d - e / 2, g);          // sud, bas : on voit dedans
  boite(R.w + 0.2, 0.25, e + 0.2, 0x6b5442, R.cx, h, R.z + e / 2, g);
  const X = R.x, Z = R.z, W = R.w, D = R.d;
  if (L.sol === "vestiaires") {
    for (let i = 0; i < 8; i++) boite(W / 8 - 0.4, 2.5, 1, i % 2 ? 0x6c8fb3 : 0x5f82a6, X + 1 + (i + 0.5) * (W - 2) / 8, 1.55, Z + 1.3, g);
    boite(W - 8, 0.5, 1, 0x9b7a52, X + W / 2, 0.55, Z + D - 3.5, g);
  } else if (L.sol === "gym") {
    boite(6, 0.15, 4.5, 0x2d79c7, X + 4.5, 0.38, Z + D - 4.5, g);
    [0, 1].forEach(i => { boite(2, 0.6, 4, 0x2b2f35, X + W - 3 - i * 3, 0.6, Z + 4, g); boite(2, 1.6, 0.3, 0x3a4048, X + W - 3 - i * 3, 1.6, Z + 2.2, g); });
    for (let i = 0; i < 3; i++) {
      const hx = X + 3 + i * 3, hz = Z + 2.2;
      cylindre(0.07, 0.07, 2, 0x9aa3ad, hx, 1.2, hz, g, 6).rotation.z = Math.PI / 2;
      cylindre(0.4, 0.4, 0.3, 0x1f2328, hx - 0.9, 1.2, hz, g, 10).rotation.z = Math.PI / 2;
      cylindre(0.4, 0.4, 0.3, 0x1f2328, hx + 0.9, 1.2, hz, g, 10).rotation.z = Math.PI / 2;
    }
  } else if (L.sol === "infirmerie") {
    [0, 1].forEach(i => {
      boite(3, 0.8, 5.4, 0xffffff, X + W - 2.6, 0.7, Z + 4 + i * 7, g);
      boite(2.4, 0.3, 1.2, 0xcfe3f2, X + W - 2.6, 1.2, Z + 2 + i * 7, g);
    });
    boite(2.4, 0.7, 0.2, 0xe63946, X + 4, 2.1, Z + 0.7, g);
    boite(0.7, 2.4, 0.2, 0xe63946, X + 4, 2.1, Z + 0.7, g);
  } else if (L.sol === "presse") {
    boite(14, 1, 1.6, 0x0e3b2c, X + W / 2, 0.8, Z + 2.2, g);
    [-4.5, -1.5, 1.5, 4.5].forEach(d => { cylindre(0.05, 0.05, 0.8, 0x222222, X + W / 2 + d, 1.7, Z + 2.2, g, 6); cylindre(0.15, 0.15, 0.3, 0xd9f24a, X + W / 2 + d, 2.15, Z + 2.2, g, 8); });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 9; c++) boite(1.8, 0.8, 1.2, 0x8b8f9a, X + 3 + c * ((W - 6) / 8.5), 0.6, Z + D - 4.5 + r * 2, g);
    const parabole = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.5), mat(0xf5f5f5, {side: THREE.DoubleSide}));
    parabole.position.set(X + W - 2.5, 3.6, Z + 1.5); parabole.rotation.x = -0.9; parabole.castShadow = true;
    g.add(parabole);
  } else if (L.sol === "sponsors") {
    [[0.22, 0.62], [0.5, 0.75], [0.78, 0.6]].forEach(([fx, fz]) => {
      cylindre(1.8, 1.8, 0.2, 0xc9a646, X + W * fx, 1.1, Z + D * fz, g, 20);
      cylindre(0.2, 0.3, 1, 0x8a6f24, X + W * fx, 0.55, Z + D * fz, g, 8);
    });
    boite(W - 6, 1.6, 0.2, new THREE.MeshStandardMaterial({color: 0xc9a646, emissive: 0x4a3a08, metalness: 0.4, roughness: 0.4}), X + W / 2, 2.2, Z + 0.75, g);
  }
  scene.add(g);
  L.panneau = panneau(L.titre, L.role, R.x + 6, 5, R.z + 0.5);
}

function detente(L) {
  const g = new THREE.Group(), R = L.R;
  boite(R.w, 0.35, R.d, 0xcfae80, R.cx, 0.17, R.cz, g, false);
  const px = R.x + 13, pz = R.cz + 1.5;
  boite(23, 0.5, 15, 0xf2efe6, px, 0.25, pz, g, false);
  const eau = new THREE.Mesh(new THREE.BoxGeometry(21, 0.2, 13),
    new THREE.MeshStandardMaterial({color: 0x47b8d6, roughness: 0.15, metalness: 0.1, emissive: 0x0b4f63, emissiveIntensity: 0.35}));
  eau.position.set(px, 0.45, pz);
  eau.receiveShadow = true;
  g.add(eau);
  ondes = eau;
  [[0.6, 0.35], [0.88, 0.32]].forEach(([fx, fz]) => {
    const x = R.x + R.w * fx, z = R.z + R.d * fz;
    cylindre(0.08, 0.08, 3.4, 0xeeeeee, x, 1.9, z, g, 6);
    const toit = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1, 8), mat(0xe4572e));
    toit.position.set(x, 3.6, z); toit.castShadow = true; g.add(toit);
    const toit2 = new THREE.Mesh(new THREE.ConeGeometry(2.62, 1.01, 8, 1, true, Math.PI / 8, Math.PI / 4), mat(0xffffff, {side: THREE.DoubleSide}));
    toit2.position.copy(toit.position); g.add(toit2);
    [-1.4, 1.4].forEach(d => boite(1.2, 0.35, 3, 0xffffff, x + d, 0.55, z + 3, g));
  });
  scene.add(g);
  L.panneau = panneau(L.titre, L.role, R.x + 8, 3.6, R.z + 0.5);
}
let ondes = null;

const geoBalle = new THREE.SphereGeometry(0.16, 10, 8);

// ------------------------------------------------------------------ personnages
const G = {
  jambe: new THREE.CapsuleGeometry(0.17, 0.62, 3, 8),
  chaussure: new THREE.BoxGeometry(0.34, 0.2, 0.5),
  short: new THREE.CylinderGeometry(0.38, 0.42, 0.45, 10),
  torse: new THREE.CapsuleGeometry(0.42, 0.45, 4, 10),
  bras: new THREE.CapsuleGeometry(0.12, 0.55, 3, 6),
  tete: new THREE.SphereGeometry(0.44, 14, 12),
  cheveux: new THREE.SphereGeometry(0.47, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.1),
  oeil: new THREE.SphereGeometry(0.055, 6, 6),
  bandeau: new THREE.TorusGeometry(0.45, 0.06, 6, 18),
  manche: new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6),
  cadre: new THREE.TorusGeometry(0.3, 0.04, 6, 16),
  cordage: new THREE.CircleGeometry(0.28, 14),
  balleIA: new THREE.SphereGeometry(0.3, 16, 12),
  couture: new THREE.TorusGeometry(0.3, 0.025, 4, 24),
  anneau: new THREE.RingGeometry(0.75, 1.0, 28),
  choix: new THREE.RingGeometry(1.1, 1.35, 32),
};
const MAT_OEIL = new THREE.MeshBasicMaterial({color: 0x1d1d1d});
const MAT_IA = new THREE.MeshStandardMaterial({color: 0xd9f24a, emissive: 0xb7d82a, emissiveIntensity: 0.6, roughness: 0.5});
const MAT_COUTURE = new THREE.MeshBasicMaterial({color: 0xffffff});

function figurine({maillot, peau, cheveux, short = 0xffffff, raquette, casquette, bandeau, accessoire}) {
  const racine = new THREE.Group(), corps = new THREE.Group();
  racine.add(corps);
  const ajoute = (geo, m, x, y, z, parent = corps) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o;
  };
  const jambes = [-0.2, 0.2].map(x => {
    const p = new THREE.Group(); p.position.set(x, 1.05, 0); corps.add(p);
    ajoute(G.jambe, mat(peau), 0, -0.48, 0, p);
    ajoute(G.chaussure, mat(0xffffff), 0, -0.95, 0.07, p);
    return p;
  });
  ajoute(G.short, mat(short), 0, 1.12, 0);
  ajoute(G.torse, mat(maillot), 0, 1.75, 0);
  const bras = [-0.56, 0.56].map(x => {
    const p = new THREE.Group(); p.position.set(x, 2.08, 0); corps.add(p);
    ajoute(G.bras, mat(peau), 0, -0.36, 0, p);
    return p;
  });
  const tete = ajoute(G.tete, mat(peau), 0, 2.68, 0);
  ajoute(G.cheveux, mat(cheveux), 0, 2.74, -0.03);
  ajoute(G.oeil, MAT_OEIL, -0.15, 2.7, 0.4);
  ajoute(G.oeil, MAT_OEIL, 0.15, 2.7, 0.4);
  if (bandeau) { const b = ajoute(G.bandeau, mat(0xffffff), 0, 2.8, 0); b.rotation.x = Math.PI / 2; }
  if (casquette) {
    ajoute(G.cheveux, mat(casquette), 0, 2.78, 0);
    const v = ajoute(new THREE.BoxGeometry(0.55, 0.06, 0.4), mat(casquette), 0, 2.86, 0.45);
    v.rotation.x = 0.15;
  }
  if (raquette) {
    const r = new THREE.Group(); r.position.set(0, -0.72, 0.1); r.rotation.x = 0.6; bras[1].add(r);
    ajoute(G.manche, mat(0x2a2a2a), 0, -0.2, 0, r);
    const cadre = ajoute(G.cadre, mat(0x222222), 0, -0.72, 0, r); cadre.rotation.y = Math.PI / 2; cadre.scale.set(1, 1.25, 1);
    const cord = ajoute(G.cordage, new THREE.MeshStandardMaterial({color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide}), 0, -0.72, 0, r);
    cord.rotation.y = Math.PI / 2; cord.scale.set(1, 1.25, 1);
  }
  if (accessoire === "porte-bloc") ajoute(new THREE.BoxGeometry(0.45, 0.6, 0.06), mat(0xf4e7c5), 0, -0.7, 0.18, bras[0]);
  else if (accessoire === "appareil") { ajoute(new THREE.BoxGeometry(0.55, 0.38, 0.3), mat(0x222222), 0.2, 2.45, 0.5); ajoute(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10), mat(0x5b6b7e), 0.2, 2.45, 0.7).rotation.x = Math.PI / 2; }
  else if (accessoire === "mallette") ajoute(new THREE.BoxGeometry(0.6, 0.45, 0.18), mat(0x6b4423), 0, -0.85, 0, bras[1]);
  else if (accessoire === "cravate") ajoute(new THREE.BoxGeometry(0.12, 0.6, 0.05), mat(0xc9a646), 0, 1.85, 0.43);
  racine.scale.setScalar(1.3);
  return {racine, corps, jambes, bras, tete};
}

const persos = new Map();     // id -> perso ; id coach = "c:" + id joueur
const cliquables = [];

function etiquette(texte, ia, type) {
  const d = el("div", {class: "nom3d" + (ia ? " ia" : "") + (type === "coach" ? " coach" : "")}, texte);
  const o = new CSS2DObject(d);
  o.position.set(0, ia ? 4.35 : 3.8, 0);
  return {o, d};
}

function enregistrer(id, f, type, texte, ia) {
  const p = {id, type, ...f, pos: f.racine.position, chemin: [], delai: 0, phase: Math.random() * 6, face: 0, place: false};
  f.racine.traverse(o => { if (o.isMesh) { o.userData.perso = id; cliquables.push(o); } });
  const e = etiquette(texte, ia, type);
  f.racine.add(e.o);
  p.nom = e.d;
  const sol = new THREE.Mesh(G.anneau, new THREE.MeshBasicMaterial({color: 0x52b788, transparent: true, opacity: 0.85}));
  sol.rotation.x = -Math.PI / 2; sol.position.y = 0.16 / 1.3;
  f.racine.add(sol);
  p.anneau = sol;
  if (type !== "joueur") sol.visible = false;
  scene.add(f.racine);
  persos.set(id, p);
  return p;
}

function creerJoueur(j) {
  const f = figurine({maillot: MAILLOTS[j.paire % 8], peau: PEAUX[hachage(j.nom) % 4], cheveux: CHEVEUX[hachage(j.pays + j.nom) % 5],
                      raquette: true, bandeau: true});
  const p = enregistrer(j.id, f, "joueur", j.nom.split(" ").pop(), j.pilote === "llm");
  if (j.pilote === "llm") {
    const b = new THREE.Group();
    const s = new THREE.Mesh(G.balleIA, MAT_IA); s.castShadow = true;
    const c1 = new THREE.Mesh(G.couture, MAT_COUTURE); c1.rotation.y = 0.5;
    b.add(s, c1);
    b.position.y = 3.35;
    f.racine.add(b);
    p.balleIA = b;
  }
  const bless = new THREE.Mesh(G.bandeau, mat(0xffffff));
  bless.rotation.set(Math.PI / 2 - 0.5, 0, 0.3); bless.position.y = 2.66; bless.visible = false;
  f.corps.add(bless);
  p.blessure = bless;
  const coupe = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.28, 0.02), new THREE.Vector2(0.08, 0.1),
    new THREE.Vector2(0.06, 0.4), new THREE.Vector2(0.35, 0.65), new THREE.Vector2(0.4, 0.95)], 16),
    new THREE.MeshStandardMaterial({color: 0xe8b923, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide}));
  cup.castShadow = true;
  coupe.add(cup); coupe.position.set(0, -0.95, 0.1); coupe.visible = false;
  f.bras[0].add(coupe);
  p.coupe = coupe;
  if (j.pilote === "llm") {
    const fc = figurine({maillot: 0x1e4d3a, short: 0x1e4d3a, peau: PEAUX[hachage(j.entraineur) % 4], cheveux: CHEVEUX[hachage(j.entraineur) % 5],
                         casquette: 0x0e3b2c, accessoire: "porte-bloc"});
    fc.racine.scale.setScalar(1.12);
    enregistrer("c:" + j.id, fc, "coach", j.entraineur.split(" ").pop(), false);
  }
}

function creerFigurants() {
  const def = [["journaliste", "presse", 0.18, {maillot: 0x5b6b7e, peau: PEAUX[1], cheveux: CHEVEUX[2], short: 0x3a3f47, accessoire: "appareil"}, "Le Filet"],
               ["agent", "sponsors", 0.3, {maillot: 0x2b2d42, short: 0x2b2d42, peau: PEAUX[2], cheveux: CHEVEUX[3], accessoire: "mallette"}, "Agent"],
               ["sponsor", "sponsors", 0.66, {maillot: 0x3d405b, short: 0x3d405b, peau: PEAUX[0], cheveux: CHEVEUX[1], accessoire: "cravate"}, "Sponsor"]];
  for (const [id, lieu, fx, opts, nom] of def) {
    const p = enregistrer(id, figurine(opts), "figurant", nom, false);
    const a = LIEUX[lieu].aire;
    p.pos.set(a.x + a.w * fx, 0.3, a.z + a.d * 0.45);
    p.place = true;
  }
}

// ------------------------------------------------------------------ placement et marche
const PLACE = 4.6, RANG = 5.6;
function grille(a, n, face) {
  const maxL = Math.max(1, Math.floor(a.d / 4.2));
  let cols = Math.max(1, Math.min(n, Math.floor(a.w / PLACE)));
  if (Math.ceil(n / cols) > maxL) cols = Math.ceil(n / maxL);
  const pas = Math.min(PLACE, a.w / cols), lignes = Math.ceil(n / cols), h = Math.min(RANG, a.d / lignes);
  const z0 = a.z + (a.d - h * lignes) / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, l = Math.floor(i / cols), dans = Math.min(cols, n - l * cols);
    out.push({x: a.x + (a.w - dans * pas) / 2 + pas * (c + 0.35), z: z0 + h * (l + 0.6), face});
  }
  return out;
}
function places(lieu, n) {
  const L = LIEUX[lieu], a = L.aire;
  if (lieu === "central" && n === 2) return [{x: L.C.x + L.C.w * 0.2, z: L.C.cz, face: Math.PI / 2}, {x: L.C.x + L.C.w * 0.8, z: L.C.cz, face: -Math.PI / 2}];
  if (COMPETITION.includes(lieu) && n >= 2) {
    const g = Math.ceil(n / 2), demi = a.w / 2;
    return [...grille({x: a.x, z: a.z, w: demi - 1.5, d: a.d}, g, Math.PI / 2),
            ...grille({x: a.x + demi + 1.5, z: a.z, w: demi - 1.5, d: a.d}, n - g, -Math.PI / 2)];
  }
  return grille(a, n, 0);
}
const solDe = lieu => ["vestiaires", "physique", "infirmerie", "presse", "sponsors"].includes(lieu) ? 0.3 : lieu === "repos" ? 0.35 : 0.12;

function allerA(p, cible, immediat) {
  const dans = z => z < ALLEE_Z - 3 ? "haut" : z > ALLEE_Z + 3 ? "bas" : "allee";
  if (immediat || REDUIT || !p.place) {
    p.pos.set(cible.x, cible.y, cible.z); p.face = cible.face; p.racine.rotation.y = cible.face;
    p.chemin = []; p.place = true;
    return;
  }
  const d = Math.hypot(cible.x - p.pos.x, cible.z - p.pos.z);
  if (d < 0.05) { p.face = cible.face; return; }
  // on passe par la grande allée quand on change de partie du village
  p.chemin = dans(p.pos.z) !== dans(cible.z) || d > 30
    ? [{x: p.pos.x, y: 0.1, z: ALLEE_Z}, {x: cible.x, y: 0.1, z: ALLEE_Z}, cible] : [cible];
  p.face = cible.face;
  p.delai = Math.random() * 0.8;
}

function marcher(p, dt, t) {
  const f = p;
  if (p.delai > 0) { p.delai -= dt; return; }
  const but = p.chemin[0];
  if (but) {
    const dx = but.x - p.pos.x, dz = but.z - p.pos.z, d = Math.hypot(dx, dz);
    const v = 9 * dt;
    if (d <= v) { p.pos.set(but.x, but.y, but.z); p.chemin.shift(); }
    else {
      p.pos.x += dx / d * v; p.pos.z += dz / d * v; p.pos.y += (but.y - p.pos.y) * Math.min(1, dt * 6);
      tourner(p, Math.atan2(dx, dz), dt * 10);
    }
    p.phase += dt * 11;
    const a = Math.sin(p.phase) * 0.7;
    f.jambes[0].rotation.x = a; f.jambes[1].rotation.x = -a;
    f.bras[0].rotation.x = -a * 0.8; if (!p.frappe) f.bras[1].rotation.x = a * 0.8;
    f.corps.position.y = Math.abs(Math.cos(p.phase)) * 0.08;
  } else {
    tourner(p, p.face, dt * 5);
    for (const j of f.jambes) j.rotation.x *= 0.8;
    f.bras[0].rotation.x *= 0.8;
    if (!p.frappe) f.bras[1].rotation.x *= 0.8;
    f.corps.position.y = Math.sin(t * 2 + p.phase) * 0.025;
  }
  if (p.balleIA) { p.balleIA.position.y = 3.35 + Math.sin(t * 2.4 + p.phase) * 0.12; p.balleIA.rotation.y += dt; }
}
function tourner(p, cible, k) {
  let d = cible - p.racine.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  p.racine.rotation.y += d * Math.min(1, k);
}

// échange de balle entre les deux finalistes
const balle = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({color: 0xd9f24a, emissive: 0x6d7f10, emissiveIntensity: 0.4}));
balle.castShadow = true; balle.visible = false;
scene.add(balle);
let rallye = null;
function animerRallye(dt) {
  if (!rallye) { balle.visible = false; return; }
  const [a, b] = rallye.joueurs;
  if (a.chemin.length || b.chemin.length || a.delai > 0 || b.delai > 0) { balle.visible = false; return; }
  balle.visible = true;
  if (REDUIT) { balle.position.set((a.pos.x + b.pos.x) / 2, 3, (a.pos.z + b.pos.z) / 2); return; }
  rallye.u += dt / 1.15;
  if (rallye.u >= 1) { rallye.u -= 1; rallye.sens = !rallye.sens; }
  const [de, vers] = rallye.sens ? [a, b] : [b, a];
  const u = rallye.u;
  balle.position.set(de.pos.x + (vers.pos.x - de.pos.x) * u, 2.3 + Math.sin(Math.PI * u) * 3.2, de.pos.z + (vers.pos.z - de.pos.z) * u);
  // coup droit : le bras de la raquette part au moment de frapper
  for (const p of [a, b]) {
    const frappe = (p === vers && u > 0.82) || (p === de && u < 0.12);
    p.frappe = true;
    p.bras[1].rotation.x += ((frappe ? -1.5 : -0.2) - p.bras[1].rotation.x) * Math.min(1, dt * 14);
  }
}

// ------------------------------------------------------------------ données de la saison
function vueSemaine(S, k) {
  const pts = (S.classements.find(c => c.semaine === k) || S.classements[0]).points;
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
          semaines: S.semaines.filter(w => w.semaine <= k), articles: S.articles.filter(a => a.semaine <= k)};
}
const semainesFaites = e => (e && e.saison) ? (e.saison.semaine_atteinte || e.saison.semaines.length) : 0;
function decisionsEnDirect(e) {
  const m = new Map();
  for (const a of e.semaine_courante || []) if (a.role === "joueur" && a.sujet && a.ok) m.set(a.sujet, a.champs);
  return m;
}
function lieuDe(d, direct) {
  if (direct) return direct.jouer === true ? "vestiaires" : (LIEUX[direct.entrainement] && !COMPETITION.includes(direct.entrainement) ? direct.entrainement : "repos");
  if (!d) return "vestiaires";
  if (d.blessure > 0 && !d.tour) return "infirmerie";
  if (d.tour) return TOUR_LIEU[d.tour] || null;
  return LIEUX[d.entrainement] ? d.entrainement : "repos";
}

let enPause = false, semaineVue = null, affiche = null, recu = null, appelsAuGel = 0, vue = null, premier = true, selection = null;

function placerTout(e, immediat) {
  const S = vue, derniere = S.semaines[S.semaines.length - 1];
  const D = new Map((derniere ? derniere.decisions : []).map(d => [d.joueur, d]));
  const direct = decisionsEnDirect(e);
  const tournoi = derniere && derniere.tournoi ? S.calendrier.find(t => t.nom === derniere.tournoi) : null;
  const surf = tournoi ? SURFACES[tournoi.surface] : SANS_TOURNOI;
  courtsCompetition.forEach(c => c.dessiner(surf.c));
  abords.forEach(m => m.color.setHex(surf.bord));
  const pc = LIEUX.central.panneau;
  pc.replaceChildren(tournoi ? tournoi.nom : "Stade central", el("span", {}, tournoi ? "finale" : "pas de tournoi"));
  for (const j of S.joueurs) if (!persos.has(j.id)) creerJoueur(j);
  const parLieu = new Map();
  let r16 = 0;
  for (const j of S.joueurs) {
    let l = lieuDe(D.get(j.id), direct.get(j.id));
    if (l === null) l = r16++ % 2 ? "r16b" : "r16a";
    if (!parLieu.has(l)) parLieu.set(l, []);
    parLieu.get(l).push(j);
  }
  const finalistes = [];
  for (const [l, liste] of parLieu) {
    if (l === "central") liste.sort((a, b) => (D.get(b.id)?.tour === "V") - (D.get(a.id)?.tour === "V"));
    const P = places(l, liste.length), y = solDe(l);
    liste.forEach((j, i) => {
      const p = persos.get(j.id), d = D.get(j.id);
      allerA(p, {...P[i], y}, immediat);
      const c = persos.get("c:" + j.id);
      if (c) {
        const ox = Math.cos(P[i].face) * 1.6 + 0.9 * Math.sin(P[i].face), oz = -Math.sin(P[i].face) * 1.6 + 1.2;
        allerA(c, {x: P[i].x + (COMPETITION.includes(l) ? -Math.sin(P[i].face) * 2.4 : 2.1), y,
                   z: P[i].z + (COMPETITION.includes(l) ? 2.6 : 0.9), face: P[i].face}, immediat);
      }
      const fat = d ? d.fatigue : 0;
      p.anneau.material.color.setHex(fat >= 6 ? 0xe63946 : fat >= 3 ? 0xf4a261 : 0x52b788);
      p.blessure.visible = !!(d && d.blessure > 0);
      p.coupe.visible = !!(d && d.tour === "V");
      p.decide = direct.has(j.id);
      p.frappe = false;
      if (l === "central") finalistes.push(p);
    });
  }
  rallye = finalistes.length === 2 ? {joueurs: finalistes, u: 0, sens: true} : null;
  const n = direct.size;
  $("info").textContent = n ? `${n} joueur(s) IA ont déjà choisi leur programme de la semaine suivante.` : "";
}

function rendreTableau(e, k) {
  const S = e.saison, total = e.semaines, max = Math.max(semainesFaites(affiche), semainesFaites(recu));
  const cal = new Map(((S || {}).calendrier || []).map(t => [t.semaine, t]));
  const t = cal.get(k);
  $("num").textContent = S ? String(k) : "–";
  $("total").textContent = `/ ${total}`;
  $("tournoi").textContent = !S ? "En attente de la première semaine" : k === 0 ? "Avant la saison" : t ? t.nom : "Semaine sans tournoi";
  $("detail").textContent = !S || k === 0 ? "" : t ? `${t.categorie === "Majeur" ? "Grand Chelem" : "Catégorie " + t.categorie}, ${SURFACES[t.surface].nom}`
    : "Les joueurs s'entraînent ou récupèrent";
  const frise = $("frise");
  frise.replaceChildren();
  for (let w = 1; w <= total; w++) {
    const tw = cal.get(w), jouee = w <= max;
    const b = el("button", {type: "button", class: "case" + (w === k ? " vue" : "") + (jouee ? " jouee" : "") + (tw ? " s-" + tw.surface : "")
      + (!jouee && w === max + 1 && !e.termine ? " encours" : ""), "aria-current": w === k ? "true" : "false",
      title: tw ? `Semaine ${w} : ${tw.nom} (${tw.categorie})` : `Semaine ${w} : pas de tournoi`},
      el("b", {}, w), el("span", {}, tw ? (tw.categorie === "Majeur" ? "GC" : tw.categorie) : "repos"));
    b.disabled = !jouee;
    b.addEventListener("click", () => choisirSemaine(w));
    frise.append(b);
  }
}

function afficher(immediat = false) {
  const e = affiche;
  if (!e) return;
  const faites = semainesFaites(e);
  const k = semaineVue === null ? faites : Math.min(semaineVue, faites);
  const figee = enPause || k < faites;
  $("direct-btn").hidden = !figee;
  rendreTableau(e, k);
  $("point").className = "point" + (figee || e.termine ? " fini" : "");
  $("statut").textContent = enPause ? "En pause : la vue est figée, la simulation continue"
    : k < faites ? `Archive de la semaine ${k}` : e.termine ? `${e.dossier} : saison terminée` : `${e.dossier} : en direct`;
  if (!e.saison) return;
  vue = vueSemaine(e.saison, k);
  const ev = figee ? {...e, semaine_courante: [], dernier_appel_il_y_a_s: null} : e;
  placerTout(ev, immediat || premier);
  premier = false;
  heureDuJour(figee || e.termine ? 0.42 : Math.min(1, (e.semaine_courante || []).length / 23));
  rendreBulle(ev);
  if (selection) montrerFiche(selection, false);
}

function choisirSemaine(w) {
  if (recu && semainesFaites(recu) > semainesFaites(affiche)) affiche = recu;
  semaineVue = w;
  if (w >= semainesFaites(affiche) && !enPause) semaineVue = null;
  else if (!enPause) mettrePause(true);
  afficher();
}
function mettrePause(oui) {
  enPause = oui;
  $("pause").classList.toggle("actif", oui);
  $("pause").setAttribute("aria-pressed", String(oui));
  $("pause").textContent = oui ? "▶ Reprendre" : "⏸ Pause";
  if (oui) appelsAuGel = affiche ? affiche.appels : 0;
  else { if (recu) affiche = recu; $("retard").textContent = ""; }
}
$("pause").addEventListener("click", () => { mettrePause(!enPause); if (!enPause) semaineVue = null; afficher(); });
$("direct-btn").addEventListener("click", () => { semaineVue = null; mettrePause(false); afficher(); });
$("noms").addEventListener("click", () => {
  const oui = document.body.classList.toggle("avec-noms");
  $("noms").classList.toggle("actif", oui); $("noms").setAttribute("aria-pressed", String(oui));
});

async function rafraichir() {
  try {
    const r = await fetch("/etat", {cache: "no-store"});
    if (!r.ok) throw new Error("HTTP " + r.status);
    recu = await r.json();
    if (!enPause) { affiche = recu; afficher(); }
    else {
      const n = recu.appels - appelsAuGel;
      $("retard").textContent = n > 0 ? `+${n} décision(s) du LLM depuis la pause` : "";
      rendreTableau({...affiche, saison: affiche.saison}, semaineVue ?? semainesFaites(affiche));
    }
    if (recu.termine) return;
  } catch (err) {
    $("point").className = "point perdu";
    $("statut").textContent = "Serveur injoignable : relance python -m tennis.direct";
  }
  setTimeout(rafraichir, 3000);
}

// ------------------------------------------------------------------ heure du jour (avance pendant une semaine en direct)
const CIEL_MATIN = new THREE.Color(0xf6d7b0), CIEL_MIDI = new THREE.Color(0xa9d8ee), CIEL_SOIR = new THREE.Color(0xf0a77a);
function heureDuJour(f) {
  const a = Math.PI * (0.12 + 0.76 * f);                 // de l'est (matin) à l'ouest (soir)
  soleil.position.set(Math.cos(a) * -140, 60 + Math.sin(a) * 90, 70);
  const c = f < 0.5 ? CIEL_MATIN.clone().lerp(CIEL_MIDI, f * 2) : CIEL_MIDI.clone().lerp(CIEL_SOIR, (f - 0.5) * 2);
  scene.background.copy(c); scene.fog.color.copy(c);
  soleil.color.setHSL(0.1, 0.6, 0.62 + 0.3 * Math.sin(a) * 0.5);
}

// ------------------------------------------------------------------ bulle « vient de répondre »
const bulleDiv = el("div", {class: "bulle3d"});
const bulle = new CSS2DObject(bulleDiv);
bulle.center.set(0.1, 1);
function rendreBulle(e) {
  const a = e.derniers && e.derniers[0];
  const actif = !e.termine && e.dernier_appel_il_y_a_s !== null && e.dernier_appel_il_y_a_s < 25 && a;
  bulle.removeFromParent();
  if (!actif) return;
  const id = a.role === "journaliste" ? "journaliste" : a.role === "agent" ? "agent" : a.role === "sponsor" ? "sponsor"
    : a.role === "entraineur" ? "c:" + a.sujet : a.sujet;
  const p = persos.get(id) || persos.get(a.sujet);
  const ch = a.champs || {};
  const texte = ch.raisonnement || ch.conseil || ch.lecon || ch.titre || ch.reponse || ch.argument || ch.decision || "réfléchit…";
  bulleDiv.replaceChildren(el("b", {}, ROLES[a.role] || a.role), String(texte).length > 130 ? String(texte).slice(0, 130) + "…" : String(texte));
  if (p) { bulle.position.set(0, 4.6, 0); p.racine.add(bulle); }
  else $("info").textContent = `${ROLES[a.role] || a.role} : ${texte}`;
}

// ------------------------------------------------------------------ fiches
const ligne = (cle, val) => el("div", {class: "kv"}, el("span", {}, cle), el("b", {}, val));
const stat = (val, lib) => el("div", {class: "stat"}, el("b", {}, val), el("span", {}, lib));
const citation = (qui, texte) => el("blockquote", {}, el("span", {}, qui), texte);
const tete = (gauche, ia) => el("div", {class: "fiche-tete"}, el("span", {class: "pays"}, gauche),
  el("span", {class: "pilote" + (ia ? " ia" : "")}, ia ? "Piloté par l'IA" : "Règle fixe"));

function ficheJoueur(id) {
  const S = vue, j = S.joueurs.find(x => x.id === id), derniere = S.semaines[S.semaines.length - 1];
  const d = derniere ? derniere.decisions.find(x => x.joueur === id) : null;
  const rang = [...S.joueurs].sort((a, b) => b.points - a.points).findIndex(x => x.id === id) + 1;
  const jumeau = S.joueurs.find(x => x.paire === j.paire && x.id !== id);
  const lecons = j.memoire.filter(m => m.type === "reflexion");
  const tour = !derniere ? "–" : !derniere.tournoi ? "pas de tournoi" : d && d.tour ? TOURS[d.tour] : (d && !d.jouer ? "forfait" : "non inscrit");
  const fat = d ? d.fatigue : 0, dd = decisionsEnDirect(enPause ? {} : affiche || {}).get(id);
  return [MAILLOTS_CSS[j.paire % 8], [
    tete(j.pays, j.pilote === "llm"), el("h3", {}, j.nom),
    el("p", {class: "perso-txt"}, `${j.age} ans, style ${j.style}. ${j.personnalite.charAt(0).toUpperCase() + j.personnalite.slice(1)}.`),
    el("div", {class: "stats"}, stat(rang + "e", "rang"), stat(j.points, "points"), stat(j.titres, "titres"), stat(`${j.victoires}-${j.matchs - j.victoires}`, "bilan")),
    el("div", {class: "fatigue"}, `Fatigue ${fat}/10${d && d.blessure ? ", blessé" : ""}`,
      el("i", {style: `width:${fat * 10}%;background:${fat >= 6 ? "#e63946" : fat >= 3 ? "#f4a261" : "#52b788"}`})),
    ligne("Depuis le début", `${signe(j.points - j.points_depart)} points`),
    ligne(`Semaine ${derniere ? derniere.semaine : "–"}`, `${tour}, entraînement ${d ? d.entrainement : "–"}`),
    d && d.tactique ? ligne("Tactique", d.tactique.replace("_", " ")) : null,
    j.pilote === "llm" ? ligne("Entraîneur", j.entraineur) : null,
    j.sponsor ? ligne("Sponsor", j.sponsor) : null,
    ligne("Son jumeau", `${jumeau.nom} (${jumeau.pilote === "llm" ? "IA" : "règle"}), ${jumeau.points} pts`),
    d && d.raisonnement ? citation("Son raisonnement", d.raisonnement) : null,
    d && d.conseil && d.conseil.conseil ? citation(d.conseil.entraineur, d.conseil.conseil) : null,
    dd ? citation("Programme de la semaine suivante", `${dd.jouer ? "Il joue" : "Il ne joue pas"}, entraînement ${dd.entrainement}. ${dd.raisonnement || ""}`) : null,
    lecons.length ? citation("Dernière leçon", lecons[lecons.length - 1].texte.replace(/^Leçon : /, "")) : null]];
}
function ficheCoach(id) {
  const S = vue, j = S.joueurs.find(x => x.id === id);
  const conseils = S.semaines.flatMap(w => w.decisions.filter(d => d.joueur === id && d.conseil && d.conseil.conseil)
    .map(d => ({semaine: w.semaine, ...d.conseil, suivi: d.conseil.recommande_jouer === d.jouer})));
  const tacts = {};
  conseils.forEach(c => { tacts[c.tactique] = (tacts[c.tactique] || 0) + 1; });
  const dernier = conseils[conseils.length - 1];
  return ["#1e4d3a", [tete("Staff", true), el("h3", {}, j.entraineur), el("p", {class: "perso-txt"}, `Entraîneur de ${j.nom}.`),
    el("div", {class: "stats"}, stat(conseils.length, "conseils"), stat(conseils.length ? `${conseils.filter(c => c.suivi).length}/${conseils.length}` : "–", "écouté")),
    ligne("Tactiques choisies", Object.entries(tacts).map(([t, n]) => `${t.replace("_", " ")} ×${n}`).join(", ") || "–"),
    dernier ? citation(`Semaine ${dernier.semaine}`, dernier.conseil) : null]];
}
function ficheFigurant(id) {
  const S = vue;
  if (id === "journaliste") {
    const a = S.articles[S.articles.length - 1];
    return ["#5b6b7e", [tete("Presse", true), el("h3", {}, "Le Filet"), el("p", {class: "perso-txt"}, `${S.articles.length} article(s) publiés cette saison.`),
      a ? citation(a.titre, a.article) : el("p", {class: "perso-txt"}, "Le premier article paraît après le premier tournoi.")]];
  }
  const negos = S.negociations || [], signes = negos.filter(n => n.contrat);
  return ["#6e2e3e", [tete(id === "agent" ? "Agent" : "Sponsors", true), el("h3", {}, id === "agent" ? "Agent sportif" : "Sponsors"),
    el("div", {class: "stats"}, stat(negos.length, "négociations"), stat(signes.length, "contrats")),
    ...signes.slice(-4).map(n => ligne(S.joueurs.find(x => x.id === n.joueur).nom, `${n.contrat.toLocaleString("fr-FR")} € (${n.sponsor})`)),
    negos.length ? null : el("p", {class: "perso-txt"}, "Les négociations ont lieu en semaines 6 et 12.")]];
}

const anneauChoix = new THREE.Mesh(G.choix, new THREE.MeshBasicMaterial({color: 0xd9f24a, transparent: true, opacity: 0.95}));
anneauChoix.rotation.x = -Math.PI / 2; anneauChoix.visible = false;
scene.add(anneauChoix);
let viseCamera = null;

function montrerFiche(id, centrer = true) {
  if (!vue) return;
  const p = persos.get(id);
  const [couleur, contenu] = id.startsWith("c:") ? ficheCoach(id.slice(2)) : p && p.type === "figurant" ? ficheFigurant(id) : ficheJoueur(id);
  const f = $("fiche");
  const fermer = el("button", {type: "button", class: "fermer", "aria-label": "Fermer la fiche"}, "×");
  fermer.addEventListener("click", fermerFiche);
  f.style.setProperty("--couleur", couleur);
  f.replaceChildren(fermer, ...contenu.filter(Boolean));
  f.hidden = false;
  if (selection && selection !== id) persos.get(selection)?.nom.classList.remove("choisi");
  selection = id;
  p?.nom.classList.add("choisi");
  if (centrer && p) viseCamera = {cible: p.pos.clone(), t: 0};
}
function fermerFiche() {
  $("fiche").hidden = true;
  if (selection) persos.get(selection)?.nom.classList.remove("choisi");
  selection = null;
}
$("vue").addEventListener("click", () => { fermerFiche(); viseCamera = {cible: VUE.cible.clone(), pos: VUE.pos.clone(), t: 0}; });
addEventListener("keydown", e => { if (e.key === "Escape") fermerFiche(); });

// ------------------------------------------------------------------ souris : survol et clic
const rayon = new THREE.Raycaster(), souris = new THREE.Vector2();
let survol = null, appui = null;
function viser(ev) {
  const r = rendu.domElement.getBoundingClientRect();
  souris.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  rayon.setFromCamera(souris, camera);
  const h = rayon.intersectObjects(cliquables, false)[0];
  return h ? h.object.userData.perso : null;
}
rendu.domElement.addEventListener("pointermove", ev => {
  const id = viser(ev);
  if (id === survol) return;
  if (survol) persos.get(survol)?.nom.classList.remove("survol");
  survol = id;
  if (id) persos.get(id)?.nom.classList.add("survol");
  rendu.domElement.style.cursor = id ? "pointer" : "";
});
rendu.domElement.addEventListener("pointerdown", ev => {
  appui = [ev.clientX, ev.clientY];
  document.querySelector(".aide")?.classList.add("vue");   // l'aide s'efface au premier geste
});
rendu.domElement.addEventListener("pointerup", ev => {
  if (!appui || Math.hypot(ev.clientX - appui[0], ev.clientY - appui[1]) > 6) return;
  const id = viser(ev);
  if (id) montrerFiche(id); else fermerFiche();
});

// ------------------------------------------------------------------ boucle d'animation
const horloge = new THREE.Clock();
function boucle() {
  const dt = Math.min(0.05, horloge.getDelta()), t = horloge.elapsedTime;
  for (const p of persos.values()) marcher(p, dt, t);
  animerRallye(dt);
  if (!REDUIT) {
    drapeaux.forEach((d, i) => { d.rotation.y = Math.sin(t * 2 + i) * 0.25; });
    if (ondes) ondes.material.emissiveIntensity = 0.3 + Math.sin(t * 1.5) * 0.06;
  }
  if (selection) {
    const p = persos.get(selection);
    anneauChoix.visible = !!p;
    if (p) { anneauChoix.position.set(p.pos.x, p.pos.y + 0.05, p.pos.z); anneauChoix.scale.setScalar(1.3 + Math.sin(t * 4) * 0.06); }
  } else anneauChoix.visible = false;
  if (viseCamera) {
    viseCamera.t += dt / 0.9;
    const k = Math.min(1, viseCamera.t), e = 1 - Math.pow(1 - k, 3);
    const decal = camera.position.clone().sub(controles.target);
    if (!viseCamera.pos && decal.length() > 70) decal.setLength(70);
    controles.target.lerp(viseCamera.cible, e * 0.25);
    if (viseCamera.pos) camera.position.lerp(viseCamera.pos, e * 0.25);
    else camera.position.copy(controles.target).add(decal);
    if (k >= 1) viseCamera = null;
  }
  controles.update();
  rendu.render(scene, camera);
  etiquettes.render(scene, camera);
  requestAnimationFrame(boucle);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  rendu.setSize(innerWidth, innerHeight); etiquettes.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------------ construction
sol();
for (const L of Object.values(LIEUX)) {
  if (L.type === "stade") stade(L);
  else if (L.type === "arene") arene(L);
  else if (L.type === "annexe") annexe(L, false);
  else if (L.type === "entrainement") entrainement(L);
  else if (L.type === "detente") detente(L);
  else batiment(L);
}
[[-35, -52], [-35, -28], [-35, -3], [35, -52], [35, -28], [35, -3], [-77, 2], [77, 2], [-78, -55], [78, -55],
 [-78, 54], [78, 54], [0, 1.2], [-95, -20], [95, -20], [-95, 30], [95, 30], [-60, 62], [60, 62], [0, 64],
 [-100, -60], [100, -60], [-30, -66], [30, -66]].forEach(([x, z], i) => arbre(x, z, 0.8 + (i % 3) * 0.2));
creerFigurants();
heureDuJour(0.42);
boucle();
requestAnimationFrame(() => $("voile").classList.add("parti"));
rafraichir();
