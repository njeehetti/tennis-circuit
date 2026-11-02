// Village du circuit en 3D (Three.js), à l'échelle réelle. Lit /etat comme le plan 2D, n'écrit rien.
// Modules : village3d_decor.js (le complexe), village3d_public.js (spectateurs, fans, écrans),
// village3d_jour.js (qui est où, jour par jour). Ce fichier : personnages, interface, lecture.
import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {CSS2DRenderer, CSS2DObject} from "three/addons/renderers/CSS2DRenderer.js";
import {JOURS, TOURS, jourNom, nomCourt, semainesFaites, vueJour, vueSemaine} from "/village3d_jour.js";
import {NEUTRE, SURFACES, construireDecor} from "/village3d_decor.js";
import {creerPublic} from "/village3d_public.js";
import {auMoment, creerControle, creerGrille, horaire, soinsEnCours, tempsForts, texteSante} from "/village3d_controle.js";
import {creerTableau} from "/village3d_tableau.js";
import {creerEffets} from "/village3d_effets.js";
import {blocInterview} from "/village3d_interview.js";

const REDUIT = matchMedia("(prefers-reduced-motion: reduce)").matches;
// lecture : durée d'une journée, réglée par le curseur « Vitesse » (de 2 min à 6 s par jour)
const VITESSES = [120, 80, 50, 30, 20, 12, 6];
const TAILLE = 0.62;                // figurines : ~1,83 m
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
const majuscule = t => t.charAt(0).toUpperCase() + t.slice(1);
const ROLES = {joueur: "Joueur", entraineur: "Entraîneur", reflexion: "Réflexion", journaliste: "Journaliste",
               conference: "Conférence de presse", agent: "Agent sportif", sponsor: "Sponsor",
               incident: "Incident", vestiaire: "Vestiaires", federation: "Fédération"};
const MAILLOTS = [0xe4572e, 0x2e86ab, 0xf3a712, 0x7b2cbf, 0x1b998b, 0xd1495b, 0x3a86ff, 0x8c6d46];
const MAILLOTS_CSS = ["#e4572e", "#2e86ab", "#f3a712", "#7b2cbf", "#1b998b", "#d1495b", "#3a86ff", "#8c6d46"];
const PEAUX = [0xf3d2b3, 0xdcaa80, 0xad7a52, 0x7b5236];
const CHEVEUX = [0x2b1b12, 0x5a3a22, 0xc9a15a, 0x1f1f1f, 0x8a4b2a];

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
scene.fog = new THREE.Fog(0xa9d8ee, 380, 900);
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.3, 1400);
const VUE = {pos: new THREE.Vector3(0, 205, 205), cible: new THREE.Vector3(0, 0, 4)};
camera.position.copy(VUE.pos);
const controles = new OrbitControls(camera, rendu.domElement);
controles.target.copy(VUE.cible);
Object.assign(controles, {enableDamping: true, dampingFactor: 0.08, minDistance: 5, maxDistance: 520,
                          maxPolarAngle: Math.PI * 0.46, screenSpacePanning: false});

scene.add(new THREE.HemisphereLight(0xe2f3ff, 0x5f7f3c, 1.2));
const soleil = new THREE.DirectionalLight(0xfff1d6, 2.7);
soleil.castShadow = true;
soleil.shadow.mapSize.set(4096, 4096);
Object.assign(soleil.shadow.camera, {left: -160, right: 160, top: 130, bottom: -130, near: 10, far: 700});
soleil.shadow.bias = -0.0004;
soleil.shadow.normalBias = 0.04;
soleil.target.position.set(0, 0, 5);
scene.add(soleil, soleil.target);

function panneau(texte, role, x, y, z) {
  const d = el("div", {class: "panneau3d"}, texte, role ? el("span", {}, role) : null);
  const o = new CSS2DObject(d);
  o.position.set(x, y, z);
  scene.add(o);
  return d;
}
const D = construireDecor({THREE, scene, panneau});
const {LIEUX, COMPETITION, mat} = D;
const publique = creerPublic({THREE, scene, D, REDUIT, PEAUX});
const effets = creerEffets({THREE, scene, LIEUX, REDUIT});
// sorties des stades (par le tunnel) et des courts annexes (côté tribune)
const SORTIES = {central: {x: 0, z: 19}, sf: {x: -84, z: 11}, qf: {x: 84, z: 11},
                 r16a: {x: -110, z: 41}, r16b: {x: -70, z: 41}, service: {x: 70, z: 41}, retour: {x: 110, z: 41}};

// ------------------------------------------------------------------ personnages
const G = {
  jambe: new THREE.CapsuleGeometry(0.17, 0.62, 3, 8), chaussure: new THREE.BoxGeometry(0.34, 0.2, 0.5),
  short: new THREE.CylinderGeometry(0.38, 0.42, 0.45, 10), torse: new THREE.CapsuleGeometry(0.42, 0.45, 4, 10),
  bras: new THREE.CapsuleGeometry(0.12, 0.55, 3, 6), tete: new THREE.SphereGeometry(0.44, 14, 12),
  cheveux: new THREE.SphereGeometry(0.47, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.1),
  oeil: new THREE.SphereGeometry(0.055, 6, 6), bandeau: new THREE.TorusGeometry(0.45, 0.06, 6, 18),
  manche: new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6), cadre: new THREE.TorusGeometry(0.3, 0.04, 6, 16),
  cordage: new THREE.CircleGeometry(0.28, 14), balleIA: new THREE.SphereGeometry(0.3, 16, 12),
  couture: new THREE.TorusGeometry(0.3, 0.025, 4, 24), anneau: new THREE.RingGeometry(0.75, 1.0, 28),
  choix: new THREE.RingGeometry(0.75, 0.92, 32), zone: new THREE.CylinderGeometry(1.3, 1.3, 3.4, 8),
};
// zone de survol plus large que la silhouette : invisible, mais touchée par le rayon
const MAT_ZONE = new THREE.MeshBasicMaterial({visible: false});
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
  ajoute(G.tete, mat(peau), 0, 2.68, 0);
  ajoute(G.cheveux, mat(cheveux), 0, 2.74, -0.03);
  ajoute(G.oeil, MAT_OEIL, -0.15, 2.7, 0.4);
  ajoute(G.oeil, MAT_OEIL, 0.15, 2.7, 0.4);
  if (bandeau) { const b = ajoute(G.bandeau, mat(0xffffff), 0, 2.8, 0); b.rotation.x = Math.PI / 2; }
  if (casquette) {
    ajoute(G.cheveux, mat(casquette), 0, 2.78, 0);
    ajoute(new THREE.BoxGeometry(0.55, 0.06, 0.4), mat(casquette), 0, 2.86, 0.45).rotation.x = 0.15;
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
  racine.scale.setScalar(TAILLE);
  return {racine, corps, jambes, bras};
}

const persos = new Map();     // id -> perso ; coach = "c:" + id, arbitre = "u:" + court
const cliquables = [];
function css2d(div, y, parent) {
  const o = new CSS2DObject(div);
  o.position.set(0, y, 0);
  parent.add(o);
  return o;
}
function enregistrer(id, f, type, texte, ia) {
  const p = {id, type, ...f, pos: f.racine.position, chemin: [], delai: 0, phase: Math.random() * 6, face: 0, place: false, lieu: null, vitesse: 6};
  const zone = new THREE.Mesh(G.zone, MAT_ZONE);
  zone.position.y = 1.7; f.racine.add(zone);
  f.racine.traverse(o => { if (o.isMesh) { o.userData.perso = id; cliquables.push(o); } });
  p.nom = el("div", {class: "nom3d" + (ia ? " ia" : "") + (type === "coach" || type === "arbitre" ? " coach" : "")}, texte);
  // l'étiquette du nom réagit elle aussi : survol = infobulle, clic = fiche
  p.nom.addEventListener("pointerenter", ev => survoler(id, ev));
  p.nom.addEventListener("pointermove", ev => montrerInfobulle(id, ev.clientX, ev.clientY));
  p.nom.addEventListener("pointerleave", () => survoler(null));
  p.nom.addEventListener("click", ev => { ev.stopPropagation(); montrerFiche(id); });
  css2d(p.nom, ia ? 4.35 : 3.8, f.racine);
  p.carton = el("div", {class: "carton3d", hidden: ""});
  css2d(p.carton, 4.9, f.racine);
  p.bulleDiv = el("div", {class: "bulle3d", hidden: ""});
  p.bulle = css2d(p.bulleDiv, 5.4, f.racine);
  p.bulle.center.set(0.1, 1);
  const anneau = new THREE.Mesh(G.anneau, new THREE.MeshBasicMaterial({color: 0x52b788, transparent: true, opacity: 0.85}));
  anneau.rotation.x = -Math.PI / 2; anneau.position.y = 0.1;
  anneau.visible = type === "joueur";
  f.racine.add(anneau);
  p.anneau = anneau;
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
    b.add(s, c1); b.position.y = 3.35;
    f.racine.add(b);
    p.balleIA = b;
  }
  const bless = new THREE.Mesh(G.bandeau, mat(0xffffff));
  bless.rotation.set(Math.PI / 2 - 0.5, 0, 0.3); bless.position.y = 2.66; bless.visible = false;
  f.corps.add(bless);
  p.blessure = bless;
  const coupe = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.28, 0.02), new THREE.Vector2(0.08, 0.1),
    new THREE.Vector2(0.06, 0.4), new THREE.Vector2(0.35, 0.65), new THREE.Vector2(0.4, 0.95)], 16),
    new THREE.MeshStandardMaterial({color: 0xe8b923, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide}));
  coupe.castShadow = true; coupe.position.set(0, -0.95, 0.1); coupe.visible = false;
  f.bras[0].add(coupe);
  p.coupe = coupe;
  if (j.pilote === "llm") {
    const fc = figurine({maillot: 0x1e4d3a, short: 0x1e4d3a, peau: PEAUX[hachage(j.entraineur) % 4], cheveux: CHEVEUX[hachage(j.entraineur) % 5],
                         casquette: 0x0e3b2c, accessoire: "porte-bloc"});
    enregistrer("c:" + j.id, fc, "coach", j.entraineur.split(" ").pop(), false);
  }
}
for (const [cle, ch] of Object.entries(D.chaises)) {
  const f = figurine({maillot: 0x223a5e, short: 0x223a5e, peau: PEAUX[hachage(cle) % 4], cheveux: CHEVEUX[hachage(cle) % 5]});
  const p = enregistrer("u:" + cle, f, "arbitre", "Arbitre", false);
  p.pos.set(ch.x, ch.y - 1.05 * TAILLE, ch.z); p.racine.rotation.y = ch.face; p.face = ch.face; p.place = true;
  for (const j of f.jambes) j.rotation.x = -1.45;                    // assis
  p.racine.visible = false;
}
{
  const def = [["journaliste", "presse", 0.15, {maillot: 0x5b6b7e, peau: PEAUX[1], cheveux: CHEVEUX[2], short: 0x3a3f47, accessoire: "appareil"}, "Le Filet"],
               ["agent", "sponsors", 0.3, {maillot: 0x2b2d42, short: 0x2b2d42, peau: PEAUX[2], cheveux: CHEVEUX[3], accessoire: "mallette"}, "Agent"],
               ["sponsor", "sponsors", 0.7, {maillot: 0x3d405b, short: 0x3d405b, peau: PEAUX[0], cheveux: CHEVEUX[1], accessoire: "cravate"}, "Sponsor"]];
  for (const [id, lieu, fx, opts, nom] of def) {
    const p = enregistrer(id, figurine(opts), "figurant", nom, false);
    const a = LIEUX[lieu].aire;
    p.pos.set(a.x + a.w * fx, 0.25, a.z + 1); p.place = true;
  }
  const t = LIEUX.federation.table;
  const p = enregistrer("federation", figurine({maillot: 0x7b2cbf, short: 0x2b2d42, peau: PEAUX[3], cheveux: CHEVEUX[3], accessoire: "porte-bloc"}),
                        "figurant", "Commission", false);
  p.pos.set(t.x, 0.4, t.z - 1.2); p.place = true;
}

// ------------------------------------------------------------------ placement et marche
function grille(a, n, face) {
  const pas = 1.7, rang = 2.0;
  let cols = Math.max(1, Math.min(n, Math.floor(a.w / pas)));
  const lignes = Math.ceil(n / cols), z0 = a.z + (a.d - rang * lignes) / 2, out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, l = Math.floor(i / cols), dans = Math.min(cols, n - l * cols);
    out.push({x: a.x + (a.w - dans * pas) / 2 + pas * (c + 0.5), z: z0 + rang * (l + 0.5), face});
  }
  return out;
}
function places(lieu, n) {
  const L = LIEUX[lieu];
  if (COMPETITION.includes(lieu) && n === 2) {            // de part et d'autre du filet, sur la ligne de fond
    return [{x: L.C.cx - 12.6, z: L.C.cz + 0.8, face: Math.PI / 2}, {x: L.C.cx + 12.6, z: L.C.cz - 0.8, face: -Math.PI / 2}];
  }
  if (COMPETITION.includes(lieu) && n > 2) {
    const g = Math.ceil(n / 2);
    return [...grille({x: L.C.cx - 16, z: L.C.cz - 6, w: 13, d: 12}, g, Math.PI / 2),
            ...grille({x: L.C.cx + 3, z: L.C.cz - 6, w: 13, d: 12}, n - g, -Math.PI / 2)];
  }
  return grille(L.aire, n, 0);
}
const solDe = lieu => ["vestiaires", "physique", "infirmerie", "presse", "sponsors"].includes(lieu) ? 0.25
  : lieu === "federation" ? 0.4 : lieu === "repos" ? 0.2 : 0.08;

// itinéraire réaliste : sortir par le tunnel, suivre les allées, entrer par le bon côté
function itineraire(de, vers, lieuDe, lieuVers) {
  const pts = [];
  const nord = z => z < -45;
  if (SORTIES[lieuDe]) pts.push({...SORTIES[lieuDe], y: 0.08});
  const a = pts.length ? pts[pts.length - 1] : de;
  const b = SORTIES[lieuVers] || vers;
  if (nord(a.z) && nord(b.z)) pts.push({x: a.x, z: -50}, {x: b.x, z: -50});
  else if (nord(a.z) !== nord(b.z)) {
    const xv = (a.x + b.x) / 2 < 0 ? -46 : 46;
    if (nord(a.z)) pts.push({x: a.x, z: -50}, {x: xv, z: -50}, {x: xv, z: 26}, {x: b.x, z: 26});
    else pts.push({x: a.x, z: 26}, {x: xv, z: 26}, {x: xv, z: -50}, {x: b.x, z: -50});
  } else if (Math.hypot(a.x - b.x, a.z - b.z) > 12) pts.push({x: a.x, z: 26}, {x: b.x, z: 26});
  if (SORTIES[lieuVers]) pts.push({...SORTIES[lieuVers]});
  pts.push(vers);
  return pts.map(p => ({x: p.x, z: p.z, y: p.y ?? 0.08, face: p.face}));
}
function allerA(p, cible, lieu, immediat) {
  if (immediat || REDUIT || !p.place) {
    p.pos.set(cible.x, cible.y, cible.z); p.face = cible.face; p.racine.rotation.y = cible.face;
    p.chemin = []; p.place = true; p.lieu = lieu;
    return;
  }
  if (Math.hypot(cible.x - p.pos.x, cible.z - p.pos.z) < 0.05) { p.face = cible.face; p.lieu = lieu; return; }
  p.chemin = p.lieu === lieu ? [cible] : itineraire(p.pos, cible, p.lieu, lieu);
  let L = 0, prec = p.pos;
  for (const q of p.chemin) { L += Math.hypot(q.x - prec.x, q.z - prec.z); prec = q; }
  p.vitesse = Math.max(3, L / 3.2);              // arrivé en ~3 s : le temps est compressé
  p.face = cible.face; p.lieu = lieu;
  p.delai = Math.random() * 0.6;
}
function tourner(p, cible, k) {
  let d = cible - p.racine.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  p.racine.rotation.y += d * Math.min(1, k);
}
function marcher(p, dt, t) {
  if (p.type === "arbitre") return;
  if (p.delai > 0) { p.delai -= dt; return; }
  const but = p.chemin[0];
  if (but) {
    const dx = but.x - p.pos.x, dz = but.z - p.pos.z, d = Math.hypot(dx, dz), v = p.vitesse * dt * (p.boite ? 0.6 : 1);
    if (d <= v) { p.pos.set(but.x, but.y, but.z); p.chemin.shift(); }
    else {
      p.pos.x += dx / d * v; p.pos.z += dz / d * v; p.pos.y += (but.y - p.pos.y) * Math.min(1, dt * 6);
      tourner(p, Math.atan2(dx, dz), dt * 10);
    }
    p.phase += dt * Math.min(16, 4 + p.vitesse);
    const a = Math.sin(p.phase) * 0.7;
    p.jambes[0].rotation.x = a; p.jambes[1].rotation.x = -a;
    p.bras[0].rotation.x = -a * 0.8; if (!p.frappe) p.bras[1].rotation.x = a * 0.8;
    p.corps.position.y = Math.abs(Math.cos(p.phase)) * 0.08;
    p.corps.rotation.z = p.boite ? Math.max(0, Math.sin(p.phase)) * 0.16 : 0;
  } else {
    p.corps.rotation.z *= 0.8;
    tourner(p, p.face, dt * 5);
    for (const j of p.jambes) j.rotation.x *= 0.8;
    p.bras[0].rotation.x *= 0.8;
    if (!p.frappe) p.bras[1].rotation.x *= 0.8;
    p.corps.position.y = Math.sin(t * 2 + p.phase) * 0.025;
  }
  if (p.balleIA) { p.balleIA.position.y = 3.35 + Math.sin(t * 2.4 + p.phase) * 0.12; p.balleIA.rotation.y += dt; }
}

// échanges de balle sur chaque court où l'on joue
const balles = COMPETITION.map(() => {
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({color: 0xd9f24a, emissive: 0x6d7f10, emissiveIntensity: 0.5}));
  b.castShadow = true; b.visible = false; scene.add(b);
  return b;
});
let rallyes = [];
function animerRallyes(dt) {
  balles.forEach(b => { b.visible = false; });
  rallyes.forEach((r, i) => {
    const [a, b] = r.joueurs, balle = balles[i];
    if (a.chemin.length || b.chemin.length || a.delai > 0 || b.delai > 0) return;
    if ((lecture.actif || lecture.suspendue) && (lecture.f < r.debut || lecture.f > r.fin)) return;   // pas commencé, ou fini
    balle.visible = true;
    if (REDUIT) { balle.position.set((a.pos.x + b.pos.x) / 2, 1.4, (a.pos.z + b.pos.z) / 2); return; }
    r.u += dt / r.duree;
    if (r.u >= 1) { r.u -= 1; r.sens = !r.sens; }
    const [de, vers] = r.sens ? [a, b] : [b, a], u = r.u;
    balle.position.set(de.pos.x + (vers.pos.x - de.pos.x) * u, 1.0 + Math.sin(Math.PI * u) * 1.6, de.pos.z + (vers.pos.z - de.pos.z) * u);
    for (const p of [a, b]) {
      const frappe = (p === vers && u > 0.85) || (p === de && u < 0.1);
      p.frappe = true;
      p.bras[1].rotation.x += ((frappe ? -1.5 : -0.2) - p.bras[1].rotation.x) * Math.min(1, dt * 14);
    }
  });
}

// ------------------------------------------------------------------ état de l'affichage
let enPause = false, semaineVue = null, jourVu = null, affiche = null, recu = null, appelsAuGel = 0;
let vue = null, V = null, premier = true, selection = null;
const lecture = {actif: false, suspendue: false, f: 0, duree: 30000};
const nomDe = id => { const j = affiche?.saison?.joueurs.find(x => x.id === id); return j ? j.nom.split(" ").pop() : id; };
const joueurDe = id => vue?.joueurs.find(x => x.id === id);
// état d'un joueur à l'heure affichée : pendant la lecture, rien après l'horloge
const heureVue = () => (lecture.actif || lecture.suspendue ? lecture.f : 1);
const etatJ = id => auMoment(V.lieux.get(id), heureVue()) || {};
const rangDe = id => vue ? [...vue.joueurs].sort((a, b) => (V.points[b.id] ?? 0) - (V.points[a.id] ?? 0)).findIndex(x => x.id === id) + 1 : 0;

function decisionsEnDirect(e) {
  const m = new Map();
  for (const a of e.semaine_courante || []) if (a.role === "joueur" && a.sujet && a.ok) m.set(a.sujet, a.champs);
  return m;
}
function montrerBulle(p, b) {
  p.bulleDiv.hidden = !b;
  if (b) p.bulleDiv.replaceChildren(el("b", {}, b.role), String(b.texte).length > 140 ? String(b.texte).slice(0, 140) + "…" : String(b.texte));
}

function placerTout(e, immediat, direct) {
  const S = vue;
  D.habiller(V.tournoi ? SURFACES[V.tournoi.surface] : NEUTRE);
  const parCourt = new Map(V.matchs.map(m => [m.court, m]));
  for (const c of COMPETITION) {
    const m = parCourt.get(c);
    LIEUX[c].panneau.replaceChildren(LIEUX[c].titre, el("span", {}, m ? TOURS[m.tour] : V.tournoi ? "libre" : "pas de tournoi"));
  }
  for (const j of S.joueurs) if (!persos.has(j.id)) creerJoueur(j);
  const parLieu = new Map();
  for (const j of S.joueurs) {
    let lieu = V.semaine === 0 ? "vestiaires" : V.lieux.get(j.id).lieu;
    const dd = direct.get(j.id);
    if (dd) lieu = dd.jouer === true ? "vestiaires" : dd.entrainement === "soins" ? "infirmerie"
      : (LIEUX[dd.entrainement] && !COMPETITION.includes(dd.entrainement) ? dd.entrainement : "repos");
    if (!parLieu.has(lieu)) parLieu.set(lieu, []);
    parLieu.get(lieu).push(j.id);
  }
  rallyes = [];
  for (const [lieu, ids] of parLieu) {
    const m = parCourt.get(lieu);
    if (m) ids.sort((a, b) => (a === m.a ? -1 : b === m.a ? 1 : 0));
    const P = places(lieu, ids.length), y = solDe(lieu);
    ids.forEach((id, i) => {
      const p = persos.get(id), L = V.lieux.get(id);
      allerA(p, {...P[i], y}, lieu, immediat);
      const c = persos.get("c:" + id);
      if (c) {
        // l'entraîneur : au premier rang côté de son joueur pendant un match, à côté de lui sinon
        const cible = COMPETITION.includes(lieu)
          ? {x: LIEUX[lieu].C.cx + (P[i].x < LIEUX[lieu].C.cx ? -7 : 7), y, z: LIEUX[lieu].C.cz - 8.4, face: Math.PI * 0}
          : {x: P[i].x + 0.9, y, z: P[i].z + 0.5, face: P[i].face};
        allerA(c, cible, lieu, immediat);
      }
      const fat = L.fatigue || 0;
      p.anneau.material.color.setHex(fat >= 6 ? 0xe63946 : fat >= 3 ? 0xf4a261 : 0x52b788);
      p.blessure.visible = !!L.blesse;
      p.coupe.visible = !!L.coupe;
      p.carton.hidden = !L.carton;
      p.carton.className = "carton3d" + (L.carton === "point" ? " point" : "");
      p.frappe = false;
      montrerBulle(p, L.bulle);
    });
    if (m) rallyes.push({joueurs: [persos.get(m.a), persos.get(m.b)], u: Math.random(), sens: true, duree: 1.0 + Math.random() * 0.3, ...horaire(m)});
  }
  for (const c of COMPETITION) {
    const u = persos.get("u:" + c), m = parCourt.get(c);
    if (!u) continue;
    u.racine.visible = !!m;
    u.match = m || null;
    u.nom.textContent = m && m.arbitre ? m.arbitre.split(" ").pop() : "Arbitre";
    montrerBulle(u, m && m.sanctionsDuMatch.length ? {role: "Code de conduite", texte: m.sanctionsDuMatch.map(x =>
      `${x.sanction === "avertissement" ? "Avertissement" : "Point de pénalité"}, ${nomDe(x.joueur)}`).join(" ; ")} : null);
  }
  for (const f of ["journaliste", "agent", "sponsor", "federation"]) montrerBulle(persos.get(f), V.figurants[f] || null);
  const couleurs = {}, couleursCss = {};
  S.joueurs.forEach(j => { couleurs[j.id] = MAILLOTS[j.paire % 8]; couleursCss[j.id] = MAILLOTS_CSS[j.paire % 8]; });
  const pop = id => V.lieux.get(id).popularite ?? (100 - rangDe(id) * 5);
  const populaires = [...S.joueurs].sort((a, b) => pop(b.id) - pop(a.id));
  const jourLib = V.tournoi ? `${majuscule(jourNom(V.jour))} : ${JOURS[V.jour - 1].lib}` : `Semaine ${V.semaine}`;
  publique.mettreAJour(V, couleurs, couleursCss, nomDe, jourLib, populaires);
}

// ------------------------------------------------------------------ tableau d'affichage, jours, journal
function rendreTableau(e, k) {
  const S = e.saison, total = e.semaines, max = Math.max(semainesFaites(affiche), semainesFaites(recu));
  const cal = new Map(((S || {}).calendrier || []).map(t => [t.semaine, t]));
  const t = cal.get(k);
  $("num").textContent = S ? String(k) : "–";
  $("total").textContent = `/ ${total}`;
  $("tournoi").textContent = !S ? "En attente de la première semaine" : k === 0 ? "Avant la saison" : t ? t.nom : "Semaine sans tournoi";
  $("detail").textContent = !S || k === 0 ? "" : t ? `${t.categorie === "Majeur" ? "Grand Chelem" : "Catégorie " + t.categorie}, ${SURFACES[t.surface].nom}`
    + (V && V.tournoi ? `, ${jourNom(V.jour)} (${JOURS[V.jour - 1].lib})` : "") : "Les joueurs s'entraînent ou récupèrent";
  const frise = $("frise");
  frise.replaceChildren();
  for (let w = 1; w <= total; w++) {
    const tw = cal.get(w), jouee = w <= max;
    const b = el("button", {type: "button", class: "case" + (w === k ? " vue" : "") + (jouee ? " jouee" : "") + (tw ? " s-" + tw.surface : "")
      + (!jouee && w === max + 1 && !e.termine ? " encours" : ""), "aria-current": w === k ? "true" : "false",
      title: tw ? `Semaine ${w} : ${tw.nom} (${tw.categorie})` : `Semaine ${w} : pas de tournoi`},
      el("b", {}, w), el("span", {}, tw ? (tw.categorie === "Majeur" ? "GC" : tw.categorie) : "repos"));
    b.disabled = !jouee;
    b.addEventListener("click", () => choisir(w, null));
    frise.append(b);
  }
  const jours = $("jours");
  jours.replaceChildren();
  if (t && k >= 1 && k <= semainesFaites(affiche)) {
    for (const J of JOURS) {
      const b = el("button", {type: "button", class: "jour" + (V && V.jour === J.n ? " vu" : ""), "aria-pressed": String(!!(V && V.jour === J.n))},
                   J.court, el("span", {}, J.lib));
      b.addEventListener("click", () => choisir(k, J.n));
      jours.append(b);
    }
  }
}
// écran de contrôle : temps forts du jour et grille des agents
function voir(lieu, qui, ouvrirFiche) {
  const L = LIEUX[lieu];
  if (!L) { if (qui && ouvrirFiche) montrerFiche(qui); return; }
  const c = L.C ? {x: L.C.cx, z: L.C.cz} : {x: L.aire.x + L.aire.w / 2, z: L.aire.z + L.aire.d / 2};
  viseCamera = {cible: new THREE.Vector3(c.x, 0, c.z), pos: new THREE.Vector3(c.x, L.C ? 30 : 24, c.z + (L.C ? 34 : 26)), t: 0};
  if (qui && persos.has(qui) && ouvrirFiche) montrerFiche(qui, false);
}
const controle = creerControle({LIEUX, voir, REDUIT});
const grilleAgents = creerGrille({LIEUX, voir});
const titreJour = () => (V.tournoi ? `Temps forts du ${jourNom(V.jour)}` : `Semaine ${V.semaine}, sans tournoi`);
const tableau = creerTableau({nomDe, couleurDe: id => { const j = joueurDe(id); return j ? MAILLOTS_CSS[j.paire % 8] : "#ccc"; },
                               voir: (court, qui) => voir(court, qui, true)});
const couleurCss = j => MAILLOTS_CSS[j.paire % 8];
function rendreSuivi() {
  if (!vue || !V) return;
  const f = heureVue();
  grilleAgents.mettreAJour(vue.joueurs, V, rangDe, couleurCss, vue.incidents || [], L => auMoment(L, f));
  if (!$("tableau").hidden) tableau.rendre(affiche.saison, V.semaine, V.jour || 7, f, V.tournoi);
  for (const j of vue.joueurs) { const p = persos.get(j.id); if (p) p.boite = !!etatJ(j.id).blesse; }
  effetsDuMoment(f);
}
// kiné et confettis : vérifiés à chaque image de la lecture (les fenêtres sont courtes)
function effetsDuMoment(f) {
  const soin = soinsEnCours(controle.liste(), f);
  effets.soigner(soin ? soin.lieu : null, soin ? persos.get(soin.qui)?.pos : null);
  const finale = V.tournoi && V.jour === 7 ? affiche.saison.matchs.find(m => m.semaine === V.semaine && m.tour === "F") : null;
  if (finale && f >= horaire(finale).fin) effets.feter(`${V.semaine}-${finale.vainqueur}`);
}
function rendreControle() {
  const enCours = lecture.actif || lecture.suspendue;
  if (controle.afficher(enCours ? lecture.f : 1, titreJour(), enCours, $("suivre").checked)) rendreSuivi();
}
// « Tableau » et « Tous les joueurs » se partagent le bas de l'écran : un seul ouvert à la fois
function basculer(nom, ouvrir) {
  $(nom).hidden = !ouvrir;
  $(nom + "-btn").setAttribute("aria-expanded", String(ouvrir));
  $(nom + "-btn").classList.toggle("actif", ouvrir);
}
$("tableau-btn").addEventListener("click", () => {
  const ouvrir = $("tableau").hidden;
  if (ouvrir) basculer("grille", false);
  basculer("tableau", ouvrir);
  if (ouvrir) rendreSuivi();
});
$("tableau-fermer").addEventListener("click", () => basculer("tableau", false));
$("grille-btn").addEventListener("click", () => {
  const ouvrir = $("grille").hidden;
  if (ouvrir) basculer("tableau", false);
  basculer("grille", ouvrir);
  if (ouvrir) grilleAgents.rendre();
});
$("grille-fermer").addEventListener("click", () => $("grille-btn").click());
{
  const curseur = $("vitesse");
  try { const v = localStorage.getItem("village3d.vitesse"); if (v !== null && VITESSES[+v]) curseur.value = v; } catch (e) { /* stockage indisponible */ }
  const maj = () => {
    lecture.duree = VITESSES[+curseur.value] * 1000;
    $("vitesse-val").textContent = `${VITESSES[+curseur.value]} s par jour`;
    try { localStorage.setItem("village3d.vitesse", curseur.value); } catch (e) { /* idem */ }
  };
  curseur.addEventListener("input", maj);
  maj();
}

function afficher(immediat = false) {
  const e = affiche;
  if (!e) return;
  const faites = semainesFaites(e);
  const k = semaineVue === null ? faites : Math.min(semaineVue, faites);
  const figee = enPause || k < faites || lecture.actif;
  $("direct-btn").hidden = !figee;
  $("point").className = "point" + (figee || e.termine ? " fini" : "");
  $("statut").textContent = lecture.actif ? `Lecture : semaine ${k}` : enPause ? "En pause : la vue est figée, la simulation continue"
    : k < faites ? `Archive de la semaine ${k}` : e.termine ? `${e.dossier} : saison terminée` : `${e.dossier} : en direct`;
  if (!e.saison) { rendreTableau(e, k); return; }
  vue = vueSemaine(e.saison, k);
  V = vueJour(e.saison, k, jourVu ?? 7);
  rendreTableau(e, k);
  const enDirect = !figee && k === faites;
  placerTout(e, immediat || premier, enDirect ? decisionsEnDirect(e) : new Map());
  premier = false;
  if (!lecture.actif) heureDuJour(figee || e.termine ? 0.45 : Math.min(1, (e.semaine_courante || []).length / 23));
  controle.nouvelleJournee(tempsForts(V, rangDe, nomDe));
  rendreControle();
  rendreSuivi();
  infobulle.hidden = true;                       // son contenu décrivait le jour précédent
  if (enDirect) bulleEnDirect(e);
  if (selection) montrerFiche(selection, false);
}
function choisir(w, jour) {
  if (recu && semainesFaites(recu) > semainesFaites(affiche)) affiche = recu;
  semaineVue = w; jourVu = jour; lecture.suspendue = false;
  if (w >= semainesFaites(affiche) && jour === null && !enPause && !lecture.actif) semaineVue = null;
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
function arreterLecture() {
  lecture.suspendue = lecture.actif && lecture.f < 1;      // on reprendra à la même heure
  lecture.actif = false;
  $("lecture").classList.remove("actif");
  $("lecture").setAttribute("aria-pressed", "false");
  $("lecture").textContent = "▶ Lecture";
  if (lecture.suspendue) $("statut").textContent = `Lecture arrêtée à ${$("horloge").textContent} : « Lecture » pour reprendre`;
}
function lancerLecture() {
  if (!affiche || !affiche.saison) return;
  const faites = semainesFaites(affiche);
  let k = semaineVue ?? faites, d = jourVu ?? 7;
  const reprise = lecture.suspendue;
  if (!reprise) {
    if (jourVu === null && V && V.tournoi) d = 1;                              // pas de jour choisi : depuis le lundi
    else if (d === 7 || !V || !V.tournoi) { k = k >= faites ? 1 : k + 1; d = 1; }   // sinon le lundi suivant
    lecture.f = 0;                                                             // sinon : ce jour, depuis le matin
  }
  lecture.actif = true; lecture.suspendue = false;
  $("lecture").classList.add("actif");
  $("lecture").setAttribute("aria-pressed", "true");
  $("lecture").textContent = "⏸ Lecture";
  if (!enPause) mettrePause(true);
  semaineVue = k; jourVu = d;
  if (reprise) { $("statut").textContent = `Lecture : semaine ${k}`; rendreControle(); } else afficher();
}
function avancerLecture() {
  const faites = semainesFaites(affiche);
  if (V.tournoi && V.jour < 7) jourVu = V.jour + 1;
  else if (V.semaine < faites) { semaineVue = V.semaine + 1; jourVu = 1; }
  else { lecture.f = 1; arreterLecture(); return; }
  lecture.f = 0;
  afficher();
}
$("lecture").addEventListener("click", () => (lecture.actif ? arreterLecture() : lancerLecture()));
$("pause").addEventListener("click", () => { arreterLecture(); lecture.suspendue = false; mettrePause(!enPause); if (!enPause) { semaineVue = null; jourVu = null; } afficher(); });
$("direct-btn").addEventListener("click", () => { arreterLecture(); lecture.suspendue = false; semaineVue = null; jourVu = null; mettrePause(false); afficher(); });
$("noms").addEventListener("click", () => {
  const oui = document.body.classList.toggle("avec-noms");
  $("noms").classList.toggle("actif", oui); $("noms").setAttribute("aria-pressed", String(oui));
});

async function rafraichir() {
  try {
    const r = await fetch("/etat", {cache: "no-store"});
    if (!r.ok) throw new Error("HTTP " + r.status);
    recu = await r.json();
    if (!enPause && !lecture.actif) { affiche = recu; afficher(); }
    else {
      const n = recu.appels - appelsAuGel;
      $("retard").textContent = n > 0 ? `+${n} décision(s) du LLM depuis la pause` : "";
    }
    if (recu.termine) return;
  } catch (err) {
    $("point").className = "point perdu";
    $("statut").textContent = "Serveur injoignable : relance python -m tennis.direct";
  }
  setTimeout(rafraichir, 3000);
}

// ------------------------------------------------------------------ heure du jour
const CIEL_MATIN = new THREE.Color(0xf6d7b0), CIEL_MIDI = new THREE.Color(0xa9d8ee), CIEL_SOIR = new THREE.Color(0xf0a77a);
function heureDuJour(f) {
  const a = Math.PI * (0.12 + 0.76 * f);
  soleil.position.set(Math.cos(a) * -220, 90 + Math.sin(a) * 140, 110);
  const c = f < 0.5 ? CIEL_MATIN.clone().lerp(CIEL_MIDI, f * 2) : CIEL_MIDI.clone().lerp(CIEL_SOIR, (f - 0.5) * 2);
  scene.background.copy(c); scene.fog.color.copy(c);
}

// ------------------------------------------------------------------ bulle « vient de répondre » (direct)
function bulleEnDirect(e) {
  const a = e.derniers && e.derniers[0];
  if (e.termine || e.dernier_appel_il_y_a_s === null || e.dernier_appel_il_y_a_s >= 25 || !a) return;
  const id = ["journaliste", "agent", "sponsor", "federation"].includes(a.role) ? a.role
    : a.role === "entraineur" ? "c:" + a.sujet : a.sujet;
  const p = persos.get(id) || persos.get(a.sujet);
  const ch = a.champs || {};
  const texte = ch.raisonnement || ch.conseil || ch.lecon || ch.titre || ch.reponse || ch.argument || ch.decision || "réfléchit…";
  if (p) montrerBulle(p, {role: (ROLES[a.role] || a.role) + " (à l'instant)", texte});
}

// ------------------------------------------------------------------ jauges, infobulles, fiches
const couleurJauge = (v, inverse) => { const x = inverse ? 100 - v : v; return x >= 60 ? "#52b788" : x >= 40 ? "#f4a261" : "#e63946"; };
function jauges(L) {
  const lignes = [];
  const ligneJ = (lib, v, max, inverse) => {
    if (v === undefined || v === null) return;
    const pc = Math.round(v / max * 100);
    lignes.push(el("span", {}, lib), el("i", {}, el("b", {style: `width:${pc}%;background:${couleurJauge(pc, inverse)}`})),
                el("em", {}, max === 10 ? `${Math.round(v)}/10` : Math.round(v)));
  };
  ligneJ("Moral", L.moral, 100); ligneJ("Popularité", L.popularite, 100); ligneJ("Réputation", L.reputation, 100);
  ligneJ("Fatigue", L.fatigue, 10, true);
  return el("div", {class: "jauges"}, ...lignes);
}
const ligne = (cle, val) => el("div", {class: "kv"}, el("span", {}, cle), el("b", {}, val));
const stat = (val, lib) => el("div", {class: "stat"}, el("b", {}, val), el("span", {}, lib));
const citation = (qui, texte) => el("blockquote", {}, el("span", {}, qui), texte);
const tete = (gauche, ia, libre) => el("div", {class: "fiche-tete"}, el("span", {class: "pays"}, gauche),
  el("span", {class: "pilote" + (ia ? " ia" : "")}, libre || (ia ? "Piloté par l'IA" : "Règle fixe")));

function contenuInfobulle(id) {
  const p = persos.get(id);
  if (!p || !V) return null;
  if (p.type === "joueur") {
    const j = joueurDe(id), L = etatJ(id), sante = texteSante(L.sante);
    return [MAILLOTS_CSS[j.paire % 8], [
      el("div", {class: "t"}, el("b", {class: "nom"}, j.nom), el("span", {class: "badge" + (j.pilote === "llm" ? " ia" : "")}, j.pilote === "llm" ? "IA" : "règle fixe")),
      el("div", {class: "act"}, `${rangDe(id)}e, ${V.points[id]} pts. ${majuscule(L.activite)}.`),
      jauges(L), sante ? el("div", {class: "act sante"}, `Santé : ${sante}`) : null,
      L.bulle && heureVue() >= 1 ? el("q", {}, L.bulle.texte) : null]];
  }
  if (p.type === "coach") {
    const j = joueurDe(id.slice(2)), d = vue.semaines[vue.semaines.length - 1]?.decisions.find(x => x.joueur === j.id);
    return ["#1e4d3a", [el("div", {class: "t"}, el("b", {class: "nom"}, j.entraineur), el("span", {class: "badge"}, "entraîneur")),
      el("div", {class: "act"}, `Entraîneur de ${j.nom}.`), d && d.conseil && d.conseil.conseil ? el("q", {}, d.conseil.conseil) : null]];
  }
  if (p.type === "arbitre") {
    const m = p.match;
    return ["#223a5e", [el("div", {class: "t"}, el("b", {class: "nom"}, m && m.arbitre ? m.arbitre : "Arbitre de chaise"), el("span", {class: "badge"}, "arbitre")),
      m ? el("div", {class: "act"}, heureVue() >= horaire(m).fin ? `${majuscule(TOURS[m.tour])}, ${nomCourt(m.court)} : ${nomDe(m.vainqueur)} bat ${nomDe(m.perdant)} ${m.score}.`
        : `${majuscule(TOURS[m.tour])}, ${nomCourt(m.court)} : ${nomDe(m.a)} contre ${nomDe(m.b)}, en cours ou à venir.`) : null,
      m && m.sanctionsDuMatch.length ? el("q", {}, m.sanctionsDuMatch.map(x => `${x.sanction === "avertissement" ? "Avertissement" : "Point de pénalité"} à ${nomDe(x.joueur)} (${x.motif})`).join(" ; "))
        : el("div", {class: "act"}, "Aucune sanction dans ce match.")]];
  }
  const noms = {journaliste: "Le Filet, journaliste", agent: "Agent sportif", sponsor: "Partenaires", federation: "Commission de discipline"};
  const b = V.figurants[id];
  return ["#5b6b7e", [el("div", {class: "t"}, el("b", {class: "nom"}, noms[id] || id)),
    b ? el("q", {}, b.texte) : el("div", {class: "act"}, id === "federation" ? "Siège toutes les 4 semaines, le dimanche." : "Rien à signaler aujourd'hui.")]];
}
const infobulle = $("infobulle");
function montrerInfobulle(id, x, y) {
  const c = id ? contenuInfobulle(id) : null;
  if (!c) { infobulle.hidden = true; return; }
  infobulle.style.setProperty("--couleur", c[0]);
  infobulle.replaceChildren(...c[1].filter(Boolean));
  infobulle.hidden = false;
  const w = infobulle.offsetWidth, h = infobulle.offsetHeight;
  infobulle.style.left = Math.min(innerWidth - w - 8, x + 18) + "px";
  infobulle.style.top = Math.max(8, Math.min(innerHeight - h - 8, y + 14)) + "px";
}

function courbe(S, id, k) {
  if (!S.social) return null;
  const pts = S.social.filter(x => x.semaine <= k).map(x => [x.semaine, x.joueurs[id].moral, x.joueurs[id].popularite]);
  if (pts.length < 2) return null;
  const W = 300, H = 56, X = s => 4 + s / Math.max(1, k) * (W - 8), Y = v => H - 4 - v / 100 * (H - 8);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "courbe");
  svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Moral (vert) et popularité (or), semaine par semaine");
  const l50 = document.createElementNS(ns, "line");
  Object.entries({x1: 0, x2: W, y1: Y(50), y2: Y(50), stroke: "#d5dbd7", "stroke-dasharray": "3 3"}).forEach(([a, v]) => l50.setAttribute(a, v));
  svg.append(l50);
  [[1, "#2d8a5f"], [2, "#c9a646"]].forEach(([i, c]) => {
    const pl = document.createElementNS(ns, "polyline");
    pl.setAttribute("points", pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[i]).toFixed(1)}`).join(" "));
    Object.entries({fill: "none", stroke: c, "stroke-width": 2.2, "stroke-linejoin": "round"}).forEach(([a, v]) => pl.setAttribute(a, v));
    svg.append(pl);
  });
  return svg;
}
function ficheJoueur(id) {
  const S = vue, j = joueurDe(id), L = etatJ(id), k = V.semaine;
  const jumeau = S.joueurs.find(x => x.paire === j.paire && x.id !== id);
  const lecons = j.memoire.filter(m => m.type === "reflexion");
  const d = S.semaines.find(w => w.semaine === k)?.decisions.find(x => x.joueur === id);
  const incidents = S.incidents.filter(i => i.joueur === id);
  const relations = new Map();
  S.vestiaires.filter(v => v.vainqueur === id || v.perdant === id).forEach(v => relations.set(v.vainqueur === id ? v.perdant : v.vainqueur, v));
  const fed = S.federation.filter(f => f.joueur === id);
  const social = L.moral !== undefined;
  return [MAILLOTS_CSS[j.paire % 8], [
    tete(j.pays, j.pilote === "llm"), el("h3", {}, j.nom),
    el("p", {class: "perso-txt"}, `${j.age} ans, style ${j.style}. ${majuscule(j.personnalite)}.`),
    el("div", {class: "stats"}, stat(rangDe(id) + "e", "rang"), stat(V.points[id], "points"), stat(j.titres, "titres"), stat(`${j.victoires}-${j.matchs - j.victoires}`, "bilan")),
    ligne(V.tournoi ? majuscule(jourNom(V.jour)) : `Semaine ${k}`, majuscule(L.activite)),
    el("h4", {}, social ? "Mental et image" : "Forme"), jauges(L),
    social ? courbe(affiche.saison, id, k) : el("p", {class: "perso-txt"}, "Saison sans couche sociale (mode sobre ou v2)."),
    ligne("Depuis le début", `${signe(V.points[id] - j.points_depart)} points`),
    d && d.tactique ? ligne("Tactique", d.tactique.replace("_", " ")) : null,
    j.pilote === "llm" ? ligne("Entraîneur", j.entraineur) : null,
    j.sponsor ? ligne("Sponsor", j.sponsor) : null,
    ligne("Son jumeau", `${jumeau.nom} (${jumeau.pilote === "llm" ? "IA" : "règle"}), ${V.points[jumeau.id]} pts`),
    L.bulle ? citation(L.bulle.role, L.bulle.texte) : null,
    d && d.raisonnement ? citation(`Son raisonnement (semaine ${k})`, d.raisonnement) : null,
    d && d.conseil && d.conseil.conseil ? citation(d.conseil.entraineur, d.conseil.conseil) : null,
    incidents.length ? el("h4", {}, `Sanctions (${incidents.length})`) : null,
    incidents.length ? el("ul", {class: "liste"}, ...incidents.slice(-4).map(i => el("li", {},
      `S${i.semaine} ${i.tournoi} : ${i.sanction === "avertissement" ? "avertissement" : "point de pénalité"}, ${i.motif}`))) : null,
    fed.length ? el("ul", {class: "liste"}, ...fed.map(f => el("li", {}, `Fédération, S${f.semaine} : ${f.decision}${f.montant ? ` (${f.montant.toLocaleString("fr-FR")} €)` : ""}`))) : null,
    relations.size ? el("h4", {}, "Relations aux vestiaires") : null,
    relations.size ? el("ul", {class: "liste"}, ...[...relations].map(([adv, v]) => el("li", {},
      `${nomDe(adv)} : ${v.relation <= -0.3 ? "tendue" : v.relation >= 0.3 ? "respect" : "neutre"} (dernier échange ${v.ton}, S${v.semaine})`))) : null,
    lecons.length ? citation("Dernière leçon", lecons[lecons.length - 1].texte.replace(/^Leçon : /, "")) : null,
    social ? el("h4", {}, "Santé") : null,
    social ? ligne("État", texteSante(L.sante) || "aucune blessure") : null,
    j.hygiene ? ligne("Hygiène de vie", j.hygiene) : null,
    d && d.medecin && d.medecin.avis ? citation("Staff médical", `Avis : ${d.medecin.avis}. ${d.medecin.message || ""}`) : null,
    social ? blocInterview(j, k, V.jour || 1, nomDe(id)) : null]];
}
function ficheAutre(id) {
  const c = contenuInfobulle(id);
  return [c[0], [tete("", false, persos.get(id).type), ...c[1]]];
}

const anneauChoix = new THREE.Mesh(G.choix, new THREE.MeshBasicMaterial({color: 0xd9f24a, transparent: true, opacity: 0.95}));
anneauChoix.rotation.x = -Math.PI / 2; anneauChoix.visible = false;
scene.add(anneauChoix);
let viseCamera = null;
function montrerFiche(id, centrer = true) {
  if (!vue || !V) return;
  const p = persos.get(id);
  if (!p) return;
  const [couleur, contenu] = p.type === "joueur" ? ficheJoueur(id) : ficheAutre(id);
  const f = $("fiche");
  const fermer = el("button", {type: "button", class: "fermer", "aria-label": "Fermer la fiche"}, "×");
  fermer.addEventListener("click", fermerFiche);
  f.style.setProperty("--couleur", couleur);
  f.replaceChildren(fermer, ...contenu.filter(Boolean));
  f.hidden = false;
  if (selection && selection !== id) persos.get(selection)?.nom.classList.remove("choisi");
  selection = id;
  p.nom.classList.add("choisi");
  if (centrer) viseCamera = {cible: p.pos.clone(), t: 0};
}
function fermerFiche() {
  $("fiche").hidden = true;
  if (selection) persos.get(selection)?.nom.classList.remove("choisi");
  selection = null;
}
$("vue").addEventListener("click", () => { fermerFiche(); viseCamera = {cible: VUE.cible.clone(), pos: VUE.pos.clone(), t: 0}; });
addEventListener("keydown", e => {
  if (e.key === "Escape") fermerFiche();
  if (e.key === " " && e.target === document.body) { e.preventDefault(); lecture.actif ? arreterLecture() : lancerLecture(); }
});

// ------------------------------------------------------------------ souris : survol (infobulle) et clic (fiche)
const rayon = new THREE.Raycaster(), souris = new THREE.Vector2();
let survol = null, appui = null;
function visibleDe(o) { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; }
function viser(ev) {
  const r = rendu.domElement.getBoundingClientRect();
  souris.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  rayon.setFromCamera(souris, camera);
  const h = rayon.intersectObjects(cliquables.filter(visibleDe), false)[0];
  return h ? h.object.userData.perso : null;
}
// survol commun : rayon sur la scène, ou étiquette du nom
function survoler(id, ev) {
  if (id !== survol) {
    if (survol) persos.get(survol)?.nom.classList.remove("survol");
    survol = id;
    if (id) persos.get(id)?.nom.classList.add("survol");
    rendu.domElement.style.cursor = id ? "pointer" : "";
  }
  if (!id) infobulle.hidden = true;
  else if (ev) montrerInfobulle(id, ev.clientX, ev.clientY);
}
rendu.domElement.addEventListener("pointermove", ev => {
  if (ev.buttons) { infobulle.hidden = true; return; }
  survoler(viser(ev), ev);
});
rendu.domElement.addEventListener("pointerleave", () => { infobulle.hidden = true; });
rendu.domElement.addEventListener("pointerdown", ev => {
  appui = [ev.clientX, ev.clientY];
  document.querySelector(".aide")?.classList.add("vue");
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
  effets.animer(dt, t);
  animerRallyes(dt);
  publique.animer(dt, t);
  if (!REDUIT) {
    D.drapeaux.forEach((d, i) => { d.rotation.y = Math.sin(t * 2 + i) * 0.25; });
    if (D.ondes) D.ondes.material.emissiveIntensity = 0.3 + Math.sin(t * 1.5) * 0.06;
  }
  if (lecture.actif) {
    lecture.f = Math.min(1, lecture.f + dt * 1000 / lecture.duree);
    heureDuJour(0.1 + 0.8 * lecture.f);
    rendreControle();
    if (V) effetsDuMoment(lecture.f);
    if (lecture.f >= 1) avancerLecture();
  }
  if (selection) {
    const p = persos.get(selection);
    anneauChoix.visible = !!p;
    if (p) { anneauChoix.position.set(p.pos.x, p.pos.y + 0.06, p.pos.z); anneauChoix.scale.setScalar(1 + Math.sin(t * 4) * 0.06); }
  } else anneauChoix.visible = false;
  if (viseCamera) {
    viseCamera.t += dt / 0.9;
    const k = Math.min(1, viseCamera.t), e = 1 - Math.pow(1 - k, 3);
    const decal = camera.position.clone().sub(controles.target);
    if (!viseCamera.pos && decal.length() > 32) decal.setLength(32);
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

heureDuJour(0.45);
boucle();
requestAnimationFrame(() => $("voile").classList.add("parti"));
rafraichir();
