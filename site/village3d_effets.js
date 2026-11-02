// Effets visuels liés aux événements du jour : le kiné qui court soigner un joueur sur le court,
// et les confettis au-dessus du central quand le résultat de la finale tombe.
export function creerEffets({THREE, scene, LIEUX, REDUIT}) {
  // kiné : silhouette blanche à croix rouge, mallette à la main
  const kine = new THREE.Group();
  const blanc = new THREE.MeshStandardMaterial({color: 0xf7f7f2, roughness: 0.7});
  const rouge = new THREE.MeshBasicMaterial({color: 0xd62828});
  const corps = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 1.1, 10), blanc);
  corps.position.y = 1.0;
  const tete = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), new THREE.MeshStandardMaterial({color: 0xdcaa80}));
  tete.position.y = 1.85;
  const croixH = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.02), rouge);
  const croixV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.02), rouge);
  croixH.position.set(0, 1.15, 0.36); croixV.position.set(0, 1.15, 0.36);
  const mallette = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.16), rouge);
  mallette.position.set(0.48, 0.55, 0);
  kine.add(corps, tete, croixH, croixV, mallette);
  kine.scale.setScalar(0.62);
  kine.visible = false;
  scene.add(kine);
  let cible = null, phase = 0;

  // confettis : quelques centaines de petits carrés colorés, en un seul InstancedMesh
  const N = REDUIT ? 0 : 260;
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.32),
    new THREE.MeshBasicMaterial({side: THREE.DoubleSide, vertexColors: false}), Math.max(1, N));
  conf.visible = false;
  conf.frustumCulled = false;      // sa sphère englobante, calculée une fois, ne suit pas les confettis
  const couleurs = [0xd9f24a, 0xe4572e, 0x2e86ab, 0xf3a712, 0xffffff, 0x7b2cbf];
  const parts = [];
  const tmp = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    conf.setColorAt(i, col.setHex(couleurs[i % couleurs.length]));
    parts.push({p: new THREE.Vector3(), v: new THREE.Vector3(), r: Math.random() * 6});
  }
  scene.add(conf);
  let confActifs = false, confFini = "";

  function centreCourt(court) {
    const L = LIEUX[court];
    return L && L.C ? new THREE.Vector3(L.C.cx, 0.25, L.C.cz) : null;
  }
  return {
    // court où un joueur est soigné (null : le kiné rentre) ; pres : position du blessé
    soigner(court, pres) {
      const c = court ? centreCourt(court) : null;
      if (!c) { kine.visible = false; cible = null; return; }
      if (!kine.visible || !cible || cible.distanceTo(c) > 1) {
        kine.position.set(c.x + 14, c.y, c.z + 9);  // arrive du bord du court
        kine.visible = true;
      }
      cible = (pres ? new THREE.Vector3(pres.x, c.y, pres.z) : c.clone()).add(new THREE.Vector3(0.9, 0, 0.7));
    },
    // cle : identifiant de la finale ; déclenche la pluie une seule fois par finale
    feter(cle) {
      if (!cle || cle === confFini || !N) return;
      confFini = cle;
      const c = centreCourt("central") || new THREE.Vector3();
      for (const x of parts) {
        // au-dessus du court, assez bas pour rester dans le champ de la caméra zoomée
        x.p.set(c.x + (Math.random() - 0.5) * 34, 10 + Math.random() * 12, c.z + (Math.random() - 0.5) * 22);
        x.v.set((Math.random() - 0.5) * 1.5, -1.6 - Math.random() * 1.8, (Math.random() - 0.5) * 1.5);
      }
      conf.visible = confActifs = true;
    },
    rearmer() { confFini = ""; },
    reinitialiser() { confFini = ""; conf.visible = confActifs = false; kine.visible = false; cible = null; },
    animer(dt, t) {
      if (kine.visible && cible) {
        const d = cible.clone().sub(kine.position); d.y = 0;
        const l = d.length();
        if (l > 0.15) {
          kine.position.addScaledVector(d.normalize(), Math.min(l, dt * 9));
          kine.rotation.y = Math.atan2(d.x, d.z);
          phase += dt * 14;
          kine.position.y = cible.y + Math.abs(Math.sin(phase)) * 0.15;
        } else kine.position.y = cible.y;
      }
      if (confActifs) {
        let vivants = 0;
        parts.forEach((x, i) => {
          x.p.addScaledVector(x.v, dt);
          x.p.x += Math.sin(t * 3 + i) * dt * 0.8;
          x.r += dt * 4;
          if (x.p.y > 0.2) vivants++;
          tmp.position.copy(x.p); tmp.rotation.set(x.r, x.r * 0.7, 0); tmp.updateMatrix();
          conf.setMatrixAt(i, tmp.matrix);
        });
        conf.instanceMatrix.needsUpdate = true;
        if (!vivants) conf.visible = confActifs = false;
      }
    },
  };
}
