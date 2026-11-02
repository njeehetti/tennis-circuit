// Le public : spectateurs assis dans les tribunes (sièges réels du décor), supporters de la fan zone,
// promeneurs dans les allées, écrans géants et banderoles. Échelle réelle (mètres).
const NEUTRES = [0xf1f1f1, 0x9aa5b1, 0x3d4a5c, 0xe9c46a, 0x6c757d, 0xbfd7ea, 0x264653, 0xffffff];
const alea = graine => () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296; };

export function creerPublic(C) {
  const {THREE, scene, D} = C;                       // D : décor (sieges, ecrans, banderoles, FZ, allees)
  const assisCorps = new THREE.CapsuleGeometry(0.2, 0.32, 2, 6);
  const debout = new THREE.CapsuleGeometry(0.21, 0.72, 2, 6);
  const tete = new THREE.SphereGeometry(0.13, 8, 6);
  const tmp = new THREE.Object3D(), couleur = new THREE.Color();

  function foule(geo, n) {
    const corps = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({roughness: 0.9}), n);
    const tetes = new THREE.InstancedMesh(tete, new THREE.MeshStandardMaterial({roughness: 0.8}), n);
    for (let i = 0; i < n; i++) { corps.setColorAt(i, couleur.setHex(0x888888)); tetes.setColorAt(i, couleur.setHex(0xdcaa80)); }
    corps.count = tetes.count = 0;
    corps.receiveShadow = true;
    scene.add(corps, tetes);
    return {corps, tetes};
  }
  function poser(f, k, x, y, z, face, hautCorps, hautTete) {
    tmp.position.set(x, y + hautCorps, z); tmp.rotation.set(0, face, 0); tmp.updateMatrix();
    f.corps.setMatrixAt(k, tmp.matrix);
    tmp.position.y = y + hautTete; tmp.updateMatrix();
    f.tetes.setMatrixAt(k, tmp.matrix);
  }
  function maj(f, n) {
    f.corps.count = f.tetes.count = n;
    f.corps.instanceMatrix.needsUpdate = f.tetes.instanceMatrix.needsUpdate = true;
    f.corps.instanceColor.needsUpdate = f.tetes.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- tribunes
  const tribunes = {};
  for (const [cle, places] of Object.entries(D.sieges)) {
    const r = alea(places.length * 7 + cle.length);
    places.forEach(p => { p.hasard = r(); p.peau = C.PEAUX[Math.floor(r() * C.PEAUX.length)]; p.neutre = NEUTRES[Math.floor(r() * NEUTRES.length)]; });
    const ordre = places.map((_, i) => i).sort(() => r() - 0.5);       // qui s'assoit en premier
    tribunes[cle] = {places, ordre, f: foule(assisCorps, places.length), visibles: 0};
  }
  function remplir(cle, info, couleurs) {
    const T = tribunes[cle];
    const n = info ? Math.round(info.occupation * T.places.length) : 0;
    const pA = info ? 0.5 + 0.3 * info.soutienA : 0.5;
    for (let k = 0; k < n; k++) {
      const p = T.places[T.ordre[k]];
      poser(T.f, k, p.x, p.y, p.z, p.face, 0.36, 0.76);
      // 70 % de partisans aux couleurs de leur joueur (selon le soutien du public), le reste en tenue de ville
      const c = p.hasard < 0.7 ? (p.hasard / 0.7 < pA ? couleurs[info.a] : couleurs[info.b]) : p.neutre;
      T.f.corps.setColorAt(k, couleur.setHex(c));
      T.f.tetes.setColorAt(k, couleur.setHex(p.peau));
    }
    T.visibles = n;
    maj(T.f, n);
  }

  // ---------------------------------------------------------------- fan zone et promeneurs
  const MAX = 260, r = alea(42), FZ = D.FZ;
  const chemins = [...D.allees.map(a => ({type: "h", ...a})), ...D.verticales.map(v => ({type: "v", ...v}))];
  const gens = Array.from({length: MAX}, (_, i) => {
    const marcheur = i % 2 === 0;
    return {marcheur, chemin: chemins[Math.floor(r() * chemins.length)], u: r(), v: 1.2 + r() * 0.5,
            sens: r() < 0.5 ? 1 : -1, voie: (r() - 0.5) * 2.5,
            x: FZ.x + 4 + r() * (FZ.w - 14), z: FZ.z + 9 + r() * (FZ.d - 14),
            peau: C.PEAUX[Math.floor(r() * C.PEAUX.length)], hasard: r(), neutre: NEUTRES[i % NEUTRES.length]};
  });
  const fans = foule(debout, MAX);
  let nGens = 0;
  function placerGens(n, couleursFav) {
    nGens = Math.min(MAX, n);
    for (let i = 0; i < nGens; i++) {
      const g = gens[i];
      const c = g.hasard < 0.6 && couleursFav.length ? couleursFav[Math.floor(g.hasard * 97) % couleursFav.length] : g.neutre;
      fans.corps.setColorAt(i, couleur.setHex(c));
      fans.tetes.setColorAt(i, couleur.setHex(g.peau));
    }
    animerGens(0, 0, true);
  }
  function animerGens(dt, t, force) {
    if (C.REDUIT && !force) return;
    for (let i = 0; i < nGens; i++) {
      const g = gens[i];
      let x = g.x, z = g.z, y = 0, face = Math.PI;
      if (g.marcheur) {                   // aller-retour sur une allée, à 1,2 à 1,7 m/s
        const L = g.chemin.type === "h" ? g.chemin.x1 - g.chemin.x0 : g.chemin.z1 - g.chemin.z0;
        g.u += g.sens * dt * g.v / L;
        if (g.u > 1 || g.u < 0) { g.sens = -g.sens; g.u = Math.min(1, Math.max(0, g.u)); }
        if (g.chemin.type === "h") { x = g.chemin.x0 + g.u * L; z = g.chemin.z + g.voie; face = g.sens > 0 ? Math.PI / 2 : -Math.PI / 2; }
        else { x = g.chemin.x + g.voie; z = g.chemin.z0 + g.u * L; face = g.sens > 0 ? 0 : Math.PI; }
        y = Math.abs(Math.sin(t * 6 + g.hasard * 9)) * 0.04;
      } else {
        y = Math.max(0, Math.sin(t * 2.2 + g.hasard * 20)) * 0.06;     // ça s'agite devant l'écran
        face = Math.PI + (g.hasard - 0.5) * 0.8;
      }
      poser(fans, i, x, y, z, face, 0.79, 1.53);
    }
    maj(fans, nGens);
  }
  function animerTribunes(t) {
    if (C.REDUIT) return;
    const T = tribunes.central;                    // seul le central vibre : le reste reste immobile (coût)
    if (!T || !T.visibles) return;
    for (let k = 0; k < T.visibles; k++) {
      const p = T.places[T.ordre[k]];
      const saut = Math.max(0, Math.sin(t * 3 + p.hasard * 30)) * 0.05;
      poser(T.f, k, p.x, p.y + saut, p.z, p.face, 0.36, 0.76);
    }
    T.f.corps.instanceMatrix.needsUpdate = T.f.tetes.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- écrans et banderoles
  function dessinerEcran(e, m, nomDe, tournoi, jourLib) {
    const g = e.toile.getContext("2d");
    g.fillStyle = "#0e3b2c"; g.fillRect(0, 0, 512, 256);
    g.fillStyle = "#d9f24a"; g.font = "600 30px 'Barlow Condensed', sans-serif"; g.textAlign = "center";
    g.fillText(tournoi ? tournoi.nom : "Semaine d'entraînement", 256, 46);
    g.fillStyle = "#f4f7f2"; g.font = "500 22px Barlow, sans-serif";
    g.fillText(jourLib, 256, 78);
    g.font = "700 40px 'Barlow Condensed', sans-serif";
    if (m) {
      g.fillText(`${nomDe(m.a)}  –  ${nomDe(m.b)}`, 256, 150);
      g.fillStyle = "#d9f24a"; g.font = "700 46px 'Barlow Condensed', sans-serif";
      g.fillText(m.score, 256, 212);
    } else g.fillText("Pas de match sur le central", 256, 160);
    e.tex.needsUpdate = true;
  }
  function dessinerBanderole(b, nom, couleurCss) {
    const g = b.toile.getContext("2d");
    g.fillStyle = couleurCss; g.fillRect(0, 0, 128, 384);
    g.fillStyle = "#fff"; g.font = "700 34px 'Barlow Condensed', sans-serif"; g.textAlign = "center";
    g.save(); g.translate(64, 192); g.rotate(-Math.PI / 2);
    g.fillText("ALLEZ " + nom.toUpperCase(), 0, 12); g.restore();
    b.tex.needsUpdate = true;
  }

  return {
    mettreAJour(V, couleurs, couleursCss, nomDe, jourLib, populaires) {
      for (const cle of Object.keys(tribunes)) remplir(cle, V.publicCourts[cle], couleurs);
      const central = V.matchs.find(m => m.court === "central");
      for (const e of D.ecrans) dessinerEcran(e, central, nomDe, V.tournoi, jourLib);
      populaires.slice(0, D.banderoles.length).forEach((j, i) => dessinerBanderole(D.banderoles[i], nomDe(j.id), couleursCss[j.id]));
      const affluence = V.tournoi ? 90 + (V.jour >= 6 ? 160 : V.jour * 18) : 40;
      placerGens(affluence, populaires.slice(0, 5).map(j => couleurs[j.id]));
      for (const [cle, g] of Object.entries(D.ramasseurs)) g.visible = !!V.matchs.find(m => m.court === cle);
    },
    animer(dt, t) { animerGens(dt, t, false); animerTribunes(t); },
  };
}
