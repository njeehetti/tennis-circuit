// Le complexe du circuit, à l'échelle réelle (1 unité = 1 mètre).
// Courts réglementaires (23,77 × 10,97 m, bandes de sécurité 36,6 × 18,3 m), cuvettes de gradins,
// courts annexes à bâches brise-vent, centre des joueurs, presse, partenaires, fédération, fan zone.
export const COURT = {long: 23.77, large: 10.97, simple: 8.23, service: 6.40, aireL: 36.6, aireW: 18.3};
export const SURFACES = {
  Hard: {nom: "dur", c: 0x3a6fb0, bord: 0x2f7d5a, ligne: "#ffffff"},
  Clay: {nom: "terre battue", c: 0xc4663f, bord: 0xb85a35, ligne: "#f6efe6"},
  Grass: {nom: "gazon", c: 0x6aa84f, bord: 0x5e9a45, ligne: "#ffffff", rayures: true},
};
export const NEUTRE = {c: 0x8a9a86, bord: 0x7b8b77, ligne: "#ffffff"};

export function outils(THREE) {
  const matieres = new Map();
  const mat = (couleur, opts = {}) => {
    const cle = couleur + JSON.stringify(opts);
    if (!matieres.has(cle)) matieres.set(cle, new THREE.MeshStandardMaterial({color: couleur, roughness: 0.85, ...opts}));
    return matieres.get(cle);
  };
  const boite = (w, h, d, couleur, x, y, z, parent, ombre = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof couleur === "number" ? mat(couleur) : couleur);
    m.position.set(x, y, z);
    m.castShadow = ombre; m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cylindre = (rh, rb, h, couleur, x, y, z, parent, seg = 12) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rh, rb, h, seg), typeof couleur === "number" ? mat(couleur) : couleur);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  return {mat, boite, cylindre};
}

// rectangle aux coins arrondis centré en (0,0) : forme Three.js et échantillonnage du pourtour
function rectArrondi(THREE, hx, hz, r, trou = false) {
  const s = trou ? new THREE.Path() : new THREE.Shape();
  s.moveTo(-hx + r, -hz);
  s.lineTo(hx - r, -hz); s.quadraticCurveTo(hx, -hz, hx, -hz + r);
  s.lineTo(hx, hz - r); s.quadraticCurveTo(hx, hz, hx - r, hz);
  s.lineTo(-hx + r, hz); s.quadraticCurveTo(-hx, hz, -hx, hz - r);
  s.lineTo(-hx, -hz + r); s.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
  return s;
}
function pourtour(hx, hz, r, pas) {
  const pts = [], droit = (x0, z0, x1, z1) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / pas));
    for (let i = 0; i < n; i++) pts.push({x: x0 + (x1 - x0) * i / n, z: z0 + (z1 - z0) * i / n});
  };
  const coin = (cx, cz, a0) => {
    const n = Math.max(1, Math.round(Math.PI / 2 * r / pas));
    for (let i = 0; i < n; i++) { const a = a0 + Math.PI / 2 * i / n; pts.push({x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r}); }
  };
  droit(-hx + r, -hz, hx - r, -hz); coin(hx - r, -hz + r, -Math.PI / 2);
  droit(hx, -hz + r, hx, hz - r); coin(hx - r, hz - r, 0);
  droit(hx - r, hz, -hx + r, hz); coin(-hx + r, hz - r, Math.PI / 2);
  droit(-hx, hz - r, -hx, -hz + r); coin(-hx + r, -hz + r, Math.PI);
  return pts;
}

export function construireDecor(C) {
  const {THREE, scene, panneau} = C;
  const {mat, boite, cylindre} = outils(THREE);
  const courts = [], drapeaux = [], ecrans = [], banderoles = [];
  const LIEUX = {}, sieges = {}, chaises = {}, ramasseurs = {};
  let ondes = null;

  // ---------------------------------------------------------------- sol, allées, mobilier urbain
  {
    const toile = document.createElement("canvas");
    toile.width = 256; toile.height = 256;
    const g = toile.getContext("2d");
    g.fillStyle = "#86b957"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) { g.fillStyle = Math.random() < 0.5 ? "#7cae4f" : "#90c260"; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
    const tex = new THREE.CanvasTexture(toile);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 34);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(460, 380), new THREE.MeshStandardMaterial({map: tex, roughness: 1}));
    p.rotation.x = -Math.PI / 2; p.position.set(0, 0, 5);
    p.receiveShadow = true;
    scene.add(p);
  }
  const PAVE = 0xe2d9c4;
  const allees = [
    {x0: -135, x1: 135, z: 26, w: 8}, {x0: -135, x1: 135, z: -50, w: 6}, {x0: -135, x1: 135, z: 72, w: 6},
  ];
  const verticales = [{x: -46, z0: -50, z1: 26, w: 6}, {x: 46, z0: -50, z1: 26, w: 6},
                      {x: -47, z0: 26, z1: 106, w: 5}, {x: 47, z0: 26, z1: 106, w: 5}, {x: 0, z0: -92, z1: -50, w: 10}];
  for (const a of allees) boite(a.x1 - a.x0, 0.06, a.w, PAVE, (a.x0 + a.x1) / 2, 0.03, a.z, scene, false);
  for (const v of verticales) boite(v.w, 0.06, v.z1 - v.z0, PAVE, v.x, 0.031, (v.z0 + v.z1) / 2, scene, false);
  function arbre(x, z, s = 1) {
    const g = new THREE.Group();
    cylindre(0.18 * s, 0.26 * s, 3.2 * s, 0x6f4f33, 0, 1.6 * s, 0, g, 6);
    const f1 = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6 * s, 1), mat(0x3f7a37, {flatShading: true}));
    f1.position.y = 4.6 * s; f1.castShadow = true; f1.scale.y = 0.85;
    const f2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7 * s, 1), mat(0x4f8f40, {flatShading: true}));
    f2.position.set(0.9 * s, 5.6 * s, 0.5 * s); f2.castShadow = true;
    g.add(f1, f2);
    g.position.set(x, 0, z);
    g.rotation.y = (x * 13 + z * 7) % 6;
    scene.add(g);
  }
  function lampadaire(x, z) {
    cylindre(0.08, 0.1, 5, 0x30363d, x, 2.5, z, scene, 6);
    boite(0.7, 0.15, 0.3, 0x30363d, x + 0.3, 5, z, scene);
    boite(0.5, 0.06, 0.25, new THREE.MeshStandardMaterial({color: 0xfffbe6, emissive: 0xfff3c0, emissiveIntensity: 0.6}), x + 0.4, 4.92, z, scene, false);
  }
  function banc(x, z, rot = 0) {
    const g = new THREE.Group();
    boite(1.8, 0.08, 0.45, 0x9b7a52, 0, 0.45, 0, g);
    boite(1.8, 0.4, 0.06, 0x9b7a52, 0, 0.7, -0.22, g);
    [-0.8, 0.8].forEach(dx => boite(0.06, 0.45, 0.45, 0x30363d, dx, 0.22, 0, g));
    g.position.set(x, 0, z); g.rotation.y = rot;
    scene.add(g);
  }
  for (let x = -126; x <= 126; x += 14) {                     // allée principale bordée de platanes
    if (Math.abs(Math.abs(x) - 46.5) < 5) continue;
    arbre(x, 26 - 6.2, 0.9); arbre(x + 7, 26 + 6.2, 0.9);
  }
  for (let x = -120; x <= 120; x += 20) { lampadaire(x, 26 - 4.6); lampadaire(x + 10, 26 + 4.6); banc(x + 5, 26 - 4.8); }
  for (let x = -120; x <= 120; x += 24) { lampadaire(x, -50 + 3.6); lampadaire(x + 12, 72 + 3.6); }
  [[-140, -40], [-140, 0], [-140, 40], [-140, 90], [140, -40], [140, 0], [140, 40], [140, 90], [-60, 118], [-20, 118],
   [20, 118], [60, 118], [100, 118], [-100, 118], [70, -70], [90, -80], [110, -66], [125, -84], [80, -88], [100, -92],
   [-40, -72], [40, -72], [-40, -86], [40, -86]].forEach(([x, z], i) => arbre(x, z, 0.9 + (i % 3) * 0.15));

  // ---------------------------------------------------------------- un court réglementaire
  function texture(surface) {
    const W = 1464, H = 732, px = W / COURT.aireL;
    const toile = document.createElement("canvas");
    toile.width = W; toile.height = H;
    const tex = new THREE.CanvasTexture(toile);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const dessiner = s => {
      const g = toile.getContext("2d"), hex = c => "#" + c.toString(16).padStart(6, "0");
      g.fillStyle = hex(s.bord); g.fillRect(0, 0, W, H);
      const X = m => W / 2 + m * px, Y = m => H / 2 + m * px;
      g.fillStyle = hex(s.c);
      g.fillRect(X(-COURT.long / 2), Y(-COURT.large / 2), COURT.long * px, COURT.large * px);
      if (s.rayures) {
        g.fillStyle = "rgba(255,255,255,.06)";
        for (let i = 0; i < 14; i += 2) g.fillRect(i * W / 14, 0, W / 14, H);
      }
      g.strokeStyle = s.ligne; g.lineWidth = 0.05 * px * 1.4;
      const L = COURT.long / 2, D = COURT.large / 2, S = COURT.simple / 2, SV = COURT.service;
      g.strokeRect(X(-L), Y(-D), COURT.long * px, COURT.large * px);
      g.beginPath();
      g.moveTo(X(-L), Y(-S)); g.lineTo(X(L), Y(-S));
      g.moveTo(X(-L), Y(S)); g.lineTo(X(L), Y(S));
      g.moveTo(X(-SV), Y(-S)); g.lineTo(X(-SV), Y(S));
      g.moveTo(X(SV), Y(-S)); g.lineTo(X(SV), Y(S));
      g.moveTo(X(-SV), Y(0)); g.lineTo(X(SV), Y(0));
      g.moveTo(X(-L), Y(0)); g.lineTo(X(-L + 0.1), Y(0));
      g.moveTo(X(L), Y(0)); g.lineTo(X(L - 0.1), Y(0));
      g.stroke();
      tex.needsUpdate = true;
    };
    dessiner(surface);
    return {tex, dessiner, actuelle: surface};
  }
  function ramasseur(g, x, z, rot) {
    const r = new THREE.Group();
    cylindre(0.16, 0.2, 0.55, 0x1b4d8c, 0, 0.45, 0, r, 8);
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0xdcaa80)); t.position.y = 0.86; t.castShadow = true; r.add(t);
    r.position.set(x, 0, z); r.rotation.y = rot;
    g.add(r);
  }
  function court(cle, cx, cz, competition) {
    const g = new THREE.Group();
    const t = texture(competition ? NEUTRE : SURFACES.Hard);
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(COURT.aireL, COURT.aireW), new THREE.MeshStandardMaterial({map: t.tex, roughness: 0.9}));
    sol.rotation.x = -Math.PI / 2; sol.position.set(cx, 0.08, cz); sol.receiveShadow = true;
    g.add(sol);
    boite(COURT.aireL + 0.4, 0.07, COURT.aireW + 0.4, 0x3d4a3f, cx, 0.035, cz, g, false);
    if (competition) courts.push(t);
    // filet : 0,914 m au centre, 1,07 m aux poteaux, poteaux à 0,914 m des couloirs
    const zp = COURT.large / 2 + 0.914;
    const filet = new THREE.Mesh(new THREE.PlaneGeometry(2 * zp, 1.0), new THREE.MeshStandardMaterial({color: 0x111111, transparent: true, opacity: 0.55, side: THREE.DoubleSide}));
    filet.rotation.y = Math.PI / 2; filet.position.set(cx, 0.5, cz);
    g.add(filet);
    boite(0.06, 0.07, 2 * zp, 0xffffff, cx, 1.0, cz, g);
    cylindre(0.05, 0.05, 1.07, 0x1f2a24, cx, 0.535, cz - zp, g, 8);
    cylindre(0.05, 0.05, 1.07, 0x1f2a24, cx, 0.535, cz + zp, g, 8);
    if (competition) {
      // chaise d'arbitre côté sud, bancs des joueurs de part et d'autre
      const zc = cz + zp + 1.2;
      [-0.35, 0.35].forEach(dx => boite(0.07, 1.8, 0.07, 0x1f4f3f, cx + dx, 0.9, zc, g));
      boite(0.8, 0.08, 0.7, 0x1f4f3f, cx, 1.82, zc, g);
      boite(0.8, 0.6, 0.06, 0x1f4f3f, cx, 2.15, zc + 0.33, g);
      chaises[cle] = {x: cx, y: 1.85, z: zc, face: Math.PI};
      for (const dx of [-2.6, 2.6]) {
        boite(1.6, 0.45, 0.5, 0x0e3b2c, cx + dx, 0.45, zc + 0.3, g);
        cylindre(0.03, 0.03, 2.2, 0xdddddd, cx + dx, 1.1, zc + 0.9, g, 6);
        const p = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.5, 8), mat(0x0e3b2c)); p.position.set(cx + dx, 2.3, zc + 0.9); p.castShadow = true; g.add(p);
      }
      const rg = new THREE.Group();
      [[-0.6, -zp - 0.5], [0.6, -zp - 0.5], [0.6, zp + 0.5], [-0.6, zp + 0.5]].forEach(([dx, dz]) => ramasseur(rg, cx + dx, cz + dz, 0));
      [[-17, -8], [-17, 8], [17, -8], [17, 8]].forEach(([dx, dz]) => ramasseur(rg, cx + dx, cz + dz, dx < 0 ? Math.PI / 2 : -Math.PI / 2));
      rg.visible = false;
      g.add(rg);
      ramasseurs[cle] = rg;
    }
    scene.add(g);
    return {x: cx - COURT.aireL / 2, z: cz - COURT.aireW / 2, w: COURT.aireL, d: COURT.aireW, cx, cz};
  }

  // ---------------------------------------------------------------- cuvette de gradins
  function cuvette(cle, cx, cz, {hx, hz, rangs, r0 = 3, profondeur = 0.85, montee = 0.42, base = 1.0, couleurs, facade, tunnel = true}) {
    const g = new THREE.Group(), places = [];
    boite(2 * hx, base, 0.4, 0x2b3a33, cx, base / 2, cz - hz, g); boite(2 * hx, base, 0.4, 0x2b3a33, cx, base / 2, cz + hz, g);
    boite(0.4, base, 2 * hz, 0x2b3a33, cx - hx, base / 2, cz, g); boite(0.4, base, 2 * hz, 0x2b3a33, cx + hx, base / 2, cz, g);
    for (let i = 0; i < rangs; i++) {
      const ri = r0 + i * profondeur, ro = ri + profondeur;
      const forme = rectArrondi(THREE, hx + (i + 1) * profondeur, hz + (i + 1) * profondeur, ro);
      forme.holes.push(rectArrondi(THREE, hx + i * profondeur, hz + i * profondeur, ri, true));
      const h = base + (i + 1) * montee;
      const geo = new THREE.ExtrudeGeometry(forme, {depth: h, bevelEnabled: false, curveSegments: 6});
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat(couleurs[i % couleurs.length]));
      m.position.set(cx, 0, cz);
      m.castShadow = i === rangs - 1; m.receiveShadow = true;
      g.add(m);
      const mi = (i + 0.5) * profondeur;
      for (const p of pourtour(hx + mi, hz + mi, ri + profondeur / 2, 0.62)) {
        if (tunnel && Math.abs(p.x) < 2.2 && p.z > 0) continue;            // tunnel des joueurs, côté sud
        places.push({x: cx + p.x, y: h, z: cz + p.z, face: Math.atan2(-p.x, -p.z)});
      }
    }
    const H = base + rangs * montee, ext = rangs * profondeur;
    const mur = rectArrondi(THREE, hx + ext + 0.8, hz + ext + 0.8, r0 + ext + 0.8);
    mur.holes.push(rectArrondi(THREE, hx + ext, hz + ext, r0 + ext, true));
    const geo = new THREE.ExtrudeGeometry(mur, {depth: H + 1.4, bevelEnabled: false, curveSegments: 8});
    geo.rotateX(-Math.PI / 2);
    const f = new THREE.Mesh(geo, mat(facade));
    f.position.set(cx, 0, cz); f.castShadow = true; f.receiveShadow = true;
    g.add(f);
    if (tunnel) boite(4.4, 2.6, ext + 1, 0x1d2622, cx, 1.3, cz + hz + ext / 2, g);
    scene.add(g);
    sieges[cle] = places;
    return {H, ext};
  }

  // ---------------------------------------------------------------- les trois stades
  const VERTS = [0x1f5c46, 0x236a50, 0x1f5c46, 0x236a50, 0x1f5c46, 0x6d7b74];
  {
    const cx = 0, cz = -12;
    LIEUX.central = {titre: "Court central", C: court("central", cx, cz, true)};
    const {H, ext} = cuvette("central", cx, cz, {hx: 21, hz: 12, rangs: 18, couleurs: VERTS, facade: 0xe7e1d2});
    for (const sx of [-1, 1]) {                                            // écrans géants dans deux angles
      const toile = document.createElement("canvas");
      toile.width = 512; toile.height = 256;
      const tex = new THREE.CanvasTexture(toile); tex.colorSpace = THREE.SRGBColorSpace;
      const x = cx + sx * (21 + ext - 4), z = cz - (12 + ext - 3);
      boite(8.4, 4.6, 0.4, 0x14231c, x, H + 4, z - 0.2, scene);
      const e = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.2), new THREE.MeshBasicMaterial({map: tex, toneMapped: false}));
      e.position.set(x, H + 4, z + 0.01); scene.add(e);
      cylindre(0.2, 0.2, 2, 0x30363d, x, H + 1.2, z - 0.2, scene, 8);
      ecrans.push({toile, tex});
    }
    for (let i = 0; i < 10; i++) {
      const x = cx - 27 + i * 6, z = cz - 12 - ext - 0.4;
      cylindre(0.06, 0.06, 6, 0xdddddd, x, H + 4.4, z, scene, 6);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshStandardMaterial({color: [0xe4572e, 0x2e86ab, 0xf3a712, 0x7b2cbf, 0x1b998b][i % 5], side: THREE.DoubleSide}));
      d.position.set(x + 0.9, H + 6.8, z); d.castShadow = true;
      drapeaux.push(d); scene.add(d);
    }
    LIEUX.central.panneau = panneau("Court central", "", cx, H + 2.5, cz + 12 + ext + 1);
    LIEUX.central.aire = {x: cx - 16, z: cz - 7, w: 32, d: 14};
  }
  for (const [cle, titre, cx] of [["sf", "Court 1", -84], ["qf", "Court 2", 84]]) {
    const cz = -12;
    LIEUX[cle] = {titre, C: court(cle, cx, cz, true)};
    const {H, ext} = cuvette(cle, cx, cz, {hx: 20.5, hz: 11.5, rangs: 10, couleurs: [0x2a5d8f, 0x30689c], facade: 0xddd6c6});
    LIEUX[cle].panneau = panneau(titre, "", cx, H + 2, cz + 11.5 + ext + 1);
    LIEUX[cle].aire = {x: cx - 16, z: cz - 7, w: 32, d: 14};
  }

  // ---------------------------------------------------------------- courts annexes et d'entraînement
  function bache(R, g, hauteur, sauf) {
    const m = new THREE.MeshStandardMaterial({color: 0x1d4a36, roughness: 1, side: THREE.DoubleSide});
    const cotes = {n: [R.w, 0.05, R.cx, R.z], s: [R.w, 0.05, R.cx, R.z + R.d], o: [0.05, R.d, R.x, R.cz], e: [0.05, R.d, R.x + R.w, R.cz]};
    for (const [k, [w, d, x, z]] of Object.entries(cotes)) {
      const h = k === sauf ? 1.1 : hauteur;
      boite(w, h, d, m, x, h / 2, z, g);
    }
    for (let x = R.x; x <= R.x + R.w + 0.01; x += R.w / 6) {
      cylindre(0.04, 0.04, hauteur + 0.2, 0x30363d, x, (hauteur + 0.2) / 2, R.z, g, 6);
      cylindre(0.04, 0.04, hauteur + 0.2, 0x30363d, x, (hauteur + 0.2) / 2, R.z + R.d, g, 6);
    }
  }
  for (const [cle, titre, cx] of [["r16a", "Court 3", -110], ["r16b", "Court 4", -70]]) {
    const cz = 52, g = new THREE.Group();
    const Cc = court(cle, cx, cz, true);
    const R = {x: Cc.x - 0.6, z: Cc.z - 0.6, w: Cc.w + 1.2, d: Cc.d + 1.2, cx, cz};
    bache(R, g, 3.6, "n");
    const places = [];
    for (let i = 0; i < 4; i++) {                       // petite tribune côté nord
      const z = R.z - 1 - (i + 0.5) * 0.85, h = 0.45 + i * 0.42;
      boite(R.w - 4, h, 0.85, 0x557089, cx, h / 2, z, g);
      for (let x = R.x + 2.4; x < R.x + R.w - 2; x += 0.62) places.push({x, y: h, z, face: 0});
    }
    sieges[cle] = places;
    scene.add(g);
    LIEUX[cle] = {titre, C: Cc, panneau: panneau(titre, "", cx, 5.2, R.z - 4.5), aire: {x: cx - 16, z: cz - 7, w: 32, d: 14}};
  }
  for (const [cle, role, cx] of [["service", "service", 70], ["retour", "retour", 110]]) {
    const cz = 52, g = new THREE.Group();
    const Cc = court(cle, cx, cz, false);
    bache({x: Cc.x - 0.6, z: Cc.z - 0.6, w: Cc.w + 1.2, d: Cc.d + 1.2, cx, cz}, g, 3.6);
    if (role === "service") {
      for (let i = 0; i < 2; i++) {
        cylindre(0.35, 0.3, 0.8, new THREE.MeshStandardMaterial({color: 0x333333, wireframe: true}), cx + 15 - i * 30, 0.5, cz + 7.5, g, 10);
        cylindre(0.33, 0.33, 0.12, 0xd9f24a, cx + 15 - i * 30, 0.86, cz + 7.5, g, 10);
      }
      [0, 1, 2, 3].forEach(i => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 8), mat(0xff8a3d)); c.position.set(cx + 8 + i * 0.9, 0.23, cz - 3 + i * 1.5); c.castShadow = true; g.add(c); });
    } else {
      boite(0.9, 0.7, 0.7, 0x40464f, cx + 16, 0.45, cz - 7, g);
      cylindre(0.15, 0.15, 0.5, 0x2b2f35, cx + 16, 1.0, cz - 7, g, 8).rotation.z = 1.1;
    }
    for (const dx of [-3, 3]) boite(1.6, 0.45, 0.5, 0x0e3b2c, cx + dx, 0.45, cz + 9.6, g);
    scene.add(g);
    LIEUX[cle] = {titre: "Entraînement", role, C: Cc, panneau: panneau("Entraînement", role, cx, 5.2, Cc.z - 1.5),
                  aire: {x: cx - 15, z: cz - 6.5, w: 30, d: 13}};
  }

  // ---------------------------------------------------------------- bâtiments en coupe (sans toit)
  function salle(x0, z0, w, d, sol, murs, g) {
    boite(w, 0.25, d, sol, x0 + w / 2, 0.125, z0 + d / 2, g, false);
    const e = 0.3, h = 3.6;
    boite(w, h, e, murs, x0 + w / 2, h / 2, z0 + e / 2, g);
    boite(e, h, d, murs, x0 + e / 2, h / 2, z0 + d / 2, g);
    boite(e, h, d, murs, x0 + w - e / 2, h / 2, z0 + d / 2, g);
    boite(w, 1.0, e, murs, x0 + w / 2, 0.5, z0 + d - e / 2, g);
    const verre = new THREE.MeshStandardMaterial({color: 0xbfe3f2, transparent: true, opacity: 0.25, roughness: 0.1, metalness: 0.2});
    boite(w - 4, 2.4, 0.06, verre, x0 + w / 2, 2.2, z0 + d - e / 2, g, false);
    boite(w + 0.3, 0.3, e + 0.3, 0x8c7a62, x0 + w / 2, h, z0 + e / 2, g);
  }
  {
    const g = new THREE.Group(), Z = 36, D = 28;
    salle(-42, Z, 28, D, 0xc9b28a, 0xeee8dc, g);           // vestiaires
    for (let i = 0; i < 18; i++) boite(0.55, 2.0, 0.5, i % 2 ? 0x5f82a6 : 0x6c8fb3, -40.6 + 0.6 * (i + 0.5) + (i >= 9 ? 6 : 0), 1.25, Z + 0.7, g);
    for (let i = 0; i < 3; i++) boite(4, 0.45, 0.45, 0x9b7a52, -36 + i * 7, 0.48, Z + 4, g);
    salle(-14, Z, 28, D, 0x4a5059, 0xeee8dc, g);           // salle de sport
    for (let i = 0; i < 4; i++) { boite(0.8, 0.5, 1.9, 0x2b2f35, -11 + i * 2.2, 0.5, Z + 2.5, g); boite(0.8, 1.2, 0.08, 0x3a4048, -11 + i * 2.2, 1.1, Z + 1.6, g); }
    for (let i = 0; i < 3; i++) {
      cylindre(0.025, 0.025, 1.8, 0x9aa3ad, 4 + i * 2.6, 1.1, Z + 2, g, 6).rotation.z = Math.PI / 2;
      [-0.85, 0.85].forEach(dx => { cylindre(0.22, 0.22, 0.08, 0x1f2328, 4 + i * 2.6 + dx, 1.1, Z + 2, g, 12).rotation.z = Math.PI / 2; });
    }
    boite(6, 0.05, 4, 0x2d79c7, 6, 0.28, Z + 22, g);
    salle(14, Z, 28, D, 0xeef2f4, 0xeee8dc, g);            // infirmerie
    for (let i = 0; i < 3; i++) { boite(0.95, 0.65, 2.0, 0xffffff, 18 + i * 3, 0.55, Z + 2.5, g); boite(0.9, 0.12, 0.5, 0xcfe3f2, 18 + i * 3, 0.95, Z + 1.8, g); }
    boite(1.4, 0.4, 0.08, 0xe63946, 39, 2.6, Z + 0.35, g); boite(0.4, 1.4, 0.08, 0xe63946, 39, 2.6, Z + 0.35, g);
    scene.add(g);
    LIEUX.vestiaires = {titre: "Vestiaires", panneau: panneau("Vestiaires", "", -28, 5.5, Z), aire: {x: -40, z: Z + 8, w: 24, d: 16}};
    LIEUX.physique = {titre: "Salle de sport", panneau: panneau("Salle de sport", "", 0, 5.5, Z), aire: {x: -12, z: Z + 8, w: 24, d: 12}};
    LIEUX.infirmerie = {titre: "Infirmerie", panneau: panneau("Infirmerie", "", 28, 5.5, Z), aire: {x: 16, z: Z + 8, w: 24, d: 16}};
  }
  {
    const g = new THREE.Group(), Z = 78, D = 28;
    salle(-42, Z, 40, D, 0xd9d4c7, 0xeee8dc, g);           // salle de presse
    boite(10, 0.5, 2.5, 0x0e3b2c, -22, 0.5, Z + 3.2, g);
    boite(5, 0.75, 0.8, 0x14231c, -22, 1.12, Z + 3.2, g);
    boite(14, 2.6, 0.12, 0x165a43, -22, 1.6, Z + 0.9, g);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) boite(0.5, 0.45, 0.5, 0x5b6b7e, -33 + c * 2.1, 0.45, Z + 13 + r * 2.4, g);
    for (let i = 0; i < 4; i++) boite(0.4, 0.9, 0.4, 0x222222, -37 + i * 1.2, 1.2, Z + 23, g);
    salle(2, Z, 40, D, 0x6e2e3e, 0xe8dcc3, g);             // salon des partenaires
    boite(12, 1.1, 0.8, 0x2b1d14, 22, 0.8, Z + 2, g);
    [[10, 12], [18, 16], [26, 12], [34, 16], [14, 22], [30, 22]].forEach(([x, z]) => {
      cylindre(0.6, 0.6, 0.06, 0xc9a646, x, 0.95, Z + z, g, 20); cylindre(0.06, 0.08, 0.7, 0x8a6f24, x, 0.55, Z + z, g, 8);
    });
    boite(30, 1.6, 0.1, new THREE.MeshStandardMaterial({color: 0xc9a646, emissive: 0x4a3a08, metalness: 0.5, roughness: 0.35}), 22, 2.6, Z + 0.4, g);
    scene.add(g);
    LIEUX.presse = {titre: "Salle de presse", panneau: panneau("Salle de presse", "", -22, 5.5, Z), aire: {x: -40, z: Z + 11, w: 36, d: 12}};
    LIEUX.sponsors = {titre: "Salon des partenaires", panneau: panneau("Salon des partenaires", "", 22, 5.5, Z), aire: {x: 5, z: Z + 9, w: 34, d: 15}};
  }
  {
    const g = new THREE.Group(), x0 = -128, z0 = 78;     // espace détente : piscine, transats, parasols
    boite(76, 0.2, 28, 0xd8c7a3, x0 + 38, 0.1, z0 + 14, g, false);
    boite(27, 0.3, 12, 0xf2efe6, x0 + 16, 0.15, z0 + 13, g, false);
    const eau = new THREE.Mesh(new THREE.BoxGeometry(25, 0.1, 10), new THREE.MeshStandardMaterial({color: 0x47b8d6, roughness: 0.1, metalness: 0.1, emissive: 0x0b4f63, emissiveIntensity: 0.35}));
    eau.position.set(x0 + 16, 0.28, z0 + 13); g.add(eau); ondes = eau;
    for (let i = 0; i < 6; i++) {
      const x = x0 + 34 + (i % 3) * 12, z = z0 + 6 + Math.floor(i / 3) * 12;
      cylindre(0.04, 0.04, 2.4, 0xeeeeee, x, 1.2, z, g, 6);
      const p = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.6, 10), mat([0xe4572e, 0xf3a712, 0x2e86ab][i % 3])); p.position.set(x, 2.4, z); p.castShadow = true; g.add(p);
      [-0.9, 0.9].forEach(dx => boite(0.7, 0.25, 1.9, 0xffffff, x + dx, 0.32, z + 2, g));
    }
    scene.add(g);
    LIEUX.repos = {titre: "Espace détente", role: "repos", panneau: panneau("Espace détente", "repos", x0 + 38, 3.5, z0),
                   aire: {x: x0 + 32, z: z0 + 4, w: 40, d: 22}};
  }

  // ---------------------------------------------------------------- nord : entrée, fédération ; sud-est : fan zone
  {
    const g = new THREE.Group();
    boite(60, 0.08, 36, PAVE, 0, 0.04, -74, g, false);
    for (const x of [-12, -4, 4, 12]) { boite(0.5, 4.5, 0.5, 0x0e3b2c, x - 2.5, 2.25, -90, g); boite(0.5, 4.5, 0.5, 0x0e3b2c, x + 2.5, 2.25, -90, g); boite(5.5, 0.6, 0.6, 0x0e3b2c, x, 4.5, -90, g); }
    for (const x of [-24, 24]) { boite(4, 2.8, 3, 0xf4f1e8, x, 1.4, -86, g); boite(4.4, 0.25, 3.4, 0x0e3b2c, x, 2.9, -86, g); }
    panneau("Open du circuit", "entrée", 0, 7, -90);
    scene.add(g);
  }
  {
    const g = new THREE.Group(), x0 = -125, z0 = -92, w = 48, d = 30;
    boite(w, 0.4, d, 0xe7e2d6, x0 + w / 2, 0.2, z0 + d / 2, g, false);
    boite(w, 6, 0.5, 0xf4f1e8, x0 + w / 2, 3, z0 + 0.25, g);
    boite(0.5, 6, d, 0xf4f1e8, x0 + 0.25, 3, z0 + d / 2, g);
    boite(0.5, 6, d, 0xf4f1e8, x0 + w - 0.25, 3, z0 + d / 2, g);
    boite(w + 1, 0.7, 3.5, 0xd9d2c0, x0 + w / 2, 6.3, z0 + d - 1.2, g);
    for (let i = 0; i < 7; i++) cylindre(0.35, 0.4, 6, 0xffffff, x0 + 3 + i * (w - 6) / 6, 3, z0 + d - 1.2, g, 14);
    boite(12, 0.8, 1.6, 0x0e3b2c, x0 + w / 2, 0.8, z0 + 6, g);
    for (let i = 0; i < 5; i++) boite(0.5, 0.9, 0.5, 0x2b2d42, x0 + w / 2 - 4.8 + i * 2.4, 0.85, z0 + 4.6, g);
    for (let i = 0; i < 3; i++) {
      cylindre(0.06, 0.06, 8, 0xdddddd, x0 + w / 2 - 4 + i * 4, 4, z0 + d + 2.5, g, 6);
      const dr = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), new THREE.MeshStandardMaterial({color: [0x0e3b2c, 0xd9f24a, 0x0e3b2c][i], side: THREE.DoubleSide}));
      dr.position.set(x0 + w / 2 - 3 + i * 4, 7.3, z0 + d + 2.5); drapeaux.push(dr); g.add(dr);
    }
    scene.add(g);
    LIEUX.federation = {titre: "Fédération", panneau: panneau("Fédération du circuit", "discipline", x0 + w / 2, 8.5, z0 + d),
                        aire: {x: x0 + 6, z: z0 + 10, w: w - 12, d: 12}, table: {x: x0 + w / 2, z: z0 + 4.2}};
  }
  const FZ = {x: 52, z: 78, w: 76, d: 28};
  {
    const g = new THREE.Group();
    boite(FZ.w, 0.1, FZ.d, 0xd9c7a1, FZ.x + FZ.w / 2, 0.05, FZ.z + FZ.d / 2, g, false);
    const toile = document.createElement("canvas");
    toile.width = 512; toile.height = 256;
    const tex = new THREE.CanvasTexture(toile); tex.colorSpace = THREE.SRGBColorSpace;
    const ex = FZ.x + 22, ez = FZ.z + 2;
    [-6.5, 6.5].forEach(dx => boite(0.4, 7.5, 0.4, 0x2b2d42, ex + dx, 3.75, ez, g));
    boite(12.6, 7.2, 0.35, 0x14231c, ex, 5.6, ez - 0.1, g);
    const e = new THREE.Mesh(new THREE.PlaneGeometry(12, 6.75), new THREE.MeshBasicMaterial({map: tex, toneMapped: false}));
    e.position.set(ex, 5.6, ez + 0.09); g.add(e);
    ecrans.push({toile, tex});
    [[0xe4572e, 0], [0x2e86ab, 1], [0xf3a712, 2]].forEach(([c, i]) => {
      const x = FZ.x + FZ.w - 5, z = FZ.z + 5 + i * 8;
      boite(2.4, 2.8, 6, 0xf4f1e8, x, 1.7, z, g);
      boite(0.1, 0.9, 5.4, c, x - 1.25, 2.4, z, g);
      [-2, 2].forEach(dz => { cylindre(0.4, 0.4, 0.25, 0x222222, x, 0.4, z + dz, g, 10).rotation.x = Math.PI / 2; });
    });
    for (let i = 0; i < 6; i++) { boite(2.2, 0.06, 0.8, 0x9b7a52, FZ.x + 8 + i * 6, 0.75, FZ.z + FZ.d - 4, g); boite(2.2, 0.06, 0.3, 0x9b7a52, FZ.x + 8 + i * 6, 0.45, FZ.z + FZ.d - 3.2, g); }
    for (let i = 0; i < 4; i++) {
      const toileB = document.createElement("canvas");
      toileB.width = 128; toileB.height = 384;
      const texB = new THREE.CanvasTexture(toileB); texB.colorSpace = THREE.SRGBColorSpace;
      const x = FZ.x + 40 + i * 5, z = FZ.z + 1.5;
      cylindre(0.05, 0.05, 6, 0xdddddd, x, 3, z, g, 6);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.6), new THREE.MeshStandardMaterial({map: texB, side: THREE.DoubleSide}));
      b.position.set(x + 0.65, 4, z); b.castShadow = true; g.add(b);
      banderoles.push({toile: toileB, tex: texB});
    }
    scene.add(g);
    panneau("Fan zone", "supporters", FZ.x + FZ.w / 2, 4.5, FZ.z);
  }

  return {LIEUX, COMPETITION: ["central", "sf", "qf", "r16a", "r16b"], courts, drapeaux, ondes, sieges, chaises, ramasseurs,
          ecrans, banderoles, FZ, allees, verticales, mat, boite, cylindre,
          habiller(surface) { for (const c of courts) if (c.actuelle !== surface) { c.actuelle = surface; c.dessiner(surface); } }};
}
