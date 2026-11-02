"""Génère un tableau de bord HTML autonome (aucune dépendance réseau).

python -m tennis.dashboard runs/<nom>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

GABARIT = r"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Circuit fictif</title>
<style>
:root{--fond:#f6f5f1;--carte:#ffffff;--texte:#1d1f22;--doux:#5d636b;--ligne:#e2e0d9;--accent:#1f6f50;--alerte:#b4442f;--puce:#eef0ea}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--fond:#141617;--carte:#1d2022;--texte:#e8e6e1;--doux:#a1a7ad;--ligne:#30353a;--accent:#5cc395;--alerte:#e98b74;--puce:#262a2d}}
:root[data-theme="dark"]{--fond:#141617;--carte:#1d2022;--texte:#e8e6e1;--doux:#a1a7ad;--ligne:#30353a;--accent:#5cc395;--alerte:#e98b74;--puce:#262a2d}
*{box-sizing:border-box}
body{margin:0;background:var(--fond);color:var(--texte);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:0 0 12px}
.sous{color:var(--doux);margin:0 0 20px}
.carte{background:var(--carte);border:1px solid var(--ligne);border-radius:10px;padding:16px;margin:0 0 16px;overflow-x:auto}
.grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
.chiffre{background:var(--carte);border:1px solid var(--ligne);border-radius:10px;padding:12px}
.chiffre b{display:block;font-size:22px}.chiffre span{color:var(--doux);font-size:13px}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--ligne);vertical-align:top}
th{color:var(--doux);font-weight:600}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.puce{display:inline-block;padding:1px 8px;border-radius:999px;background:var(--puce);font-size:12px;color:var(--doux)}
.llm{color:var(--accent);font-weight:600}.neg{color:var(--alerte)}.pos{color:var(--accent)}
.article h3{margin:0 0 6px;font-size:16px}.article p{margin:0 0 8px}
.meta{color:var(--doux);font-size:13px}
select,button{font:inherit;padding:6px 10px;border-radius:8px;border:1px solid var(--ligne);background:var(--carte);color:var(--texte)}
button{cursor:pointer}
.semaine{border-left:3px solid var(--ligne);padding:4px 0 8px 12px;margin:0 0 6px}
.semaine.joue{border-color:var(--accent)}
.barre{display:inline-block;height:8px;border-radius:4px;background:var(--alerte);vertical-align:middle}
.tableau-score{font-variant-numeric:tabular-nums;font-size:18px}
.tableau-score td{padding:8px}
.serveur::after{content:" ●";color:var(--accent)}
.points{display:flex;flex-wrap:wrap;gap:2px;margin-top:10px}
.points i{width:8px;height:8px;border-radius:2px;display:block}
.legende{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;margin-top:8px}
.legende span{cursor:pointer}
svg text{fill:var(--doux);font-size:11px}
.controles{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
</style>
</head>
<body>
<main>
<h1>Circuit fictif : une saison simulée</h1>
<p class="sous" id="sous"></p>
<div class="grille" id="chiffres"></div>
<section class="carte"><h2>Expérience : jumeau piloté par LLM contre jumeau à politique fixe</h2>
<p class="meta">Chaque paire partage exactement le même profil statistique. Seul le pilotage change : décisions du LLM (avec entraîneur, mémoire et réflexion) ou politique fixe. Écart = points gagnés par le jumeau LLM moins ceux du jumeau baseline.</p>
<div id="experience"></div></section>
<section class="carte"><h2>Évolution du classement</h2><div id="courbe"></div><div class="legende" id="legende"></div>
<p class="meta">Même couleur = jumeaux. Trait plein : LLM ; pointillés : baseline. Cliquer sur un nom pour le mettre en avant.</p></section>
<section class="carte"><h2>Classement final</h2><div id="classement"></div></section>
<section class="carte"><h2>Rejeu d'une finale, point par point</h2>
<div class="controles"><select id="choixFinale"></select><button id="lecture">Lecture</button>
<label class="meta">vitesse <select id="vitesse"><option value="400">lente</option><option value="120" selected>normale</option><option value="25">rapide</option></select></label></div>
<input type="range" id="curseur" min="0" value="0" style="width:100%">
<table class="tableau-score" id="score"></table><div class="points" id="bandePoints"></div></section>
<section class="carte"><h2>Les décisions d'un joueur</h2>
<div class="controles"><select id="choixJoueur"></select></div><div id="decisions"></div></section>
<section class="carte"><h2>Le Filet : fil d'actualité</h2><div id="articles"></div></section>
<section class="carte"><h2>Négociations de sponsoring</h2><div id="negos"></div></section>
<p class="meta">Données de calibration : The Tennis Abstract Match Charting Project (Jeff Sackmann), licence CC BY-NC-SA 4.0. Joueurs, tournois, entraîneurs et sponsors sont fictifs.</p>
</main>
<script>
const D = __DONNEES__;
const J = Object.fromEntries(D.joueurs.map(j => [j.id, j]));
const COUL = ["#2a7ab0","#c2582f","#3d9a5b","#8e5bb5","#c79a1e","#2e9c9a","#b8487c","#6b7a2a"];
const SURF = {Hard:"dur", Clay:"terre battue", Grass:"gazon"};
const TOURS = {R16:"8e de finale", QF:"quart", SF:"demie", F:"finale", V:"vainqueur"};
const ENTR = {service:"service", retour:"retour", physique:"physique", repos:"repos", soins:"soins"};
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const nom = id => J[id] ? J[id].nom : id;
const eur = n => new Intl.NumberFormat("fr-FR").format(n) + " €";
const pilote = j => j.pilote === "llm" ? '<span class="llm">LLM</span>' : '<span class="puce">baseline</span>';
const m = D.meta, exp = D.experience;

document.getElementById("sous").textContent =
  `Graine ${m.graine} · ${m.semaines} semaines · modèle ${m.modele || "?"} · ${m.llm.appels} appels LLM, ${m.llm.echecs} échecs, ${m.replis ?? 0} décisions en repli · ${Math.round((m.duree_s||0)/60)} min de calcul` + (m.controle ? " · MODE CONTRÔLE (tout le monde en baseline)" : "");

const tri = [...D.joueurs].sort((a,b) => b.points - a.points);
const champion = tri[0];
const chiffres = [
  [champion.nom, "n°1 en fin de saison"],
  [D.articles.length, "tournois joués"],
  [(exp.ecart_moyen >= 0 ? "+" : "") + Math.round(exp.ecart_moyen), "écart moyen LLM − baseline (points)"],
  [exp.paires.filter(p => p.ecart > 0).length + " / " + exp.paires.length, "paires gagnées par le LLM"],
];
document.getElementById("chiffres").innerHTML = chiffres.map(([v,l]) => `<div class="chiffre"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");

document.getElementById("experience").innerHTML = `<table><tr><th>Paire</th><th>Jumeau LLM</th><th class="n">points</th><th>Jumeau baseline</th><th class="n">points</th><th class="n">écart</th></tr>` +
  exp.paires.map(p => `<tr><td><span style="color:${COUL[p.paire]}">■</span> ${p.paire+1}</td><td>${esc(nom(p.llm))}</td><td class="n">${p.points_llm}</td><td>${esc(nom(p.baseline))}</td><td class="n">${p.points_baseline}</td><td class="n ${p.ecart>=0?"pos":"neg"}">${p.ecart>=0?"+":""}${p.ecart}</td></tr>`).join("") +
  `</table><p class="meta">Écart moyen ${Math.round(exp.ecart_moyen)} points, écart-type ${Math.round(exp.ecart_type)}. Une seule saison est très bruitée : comparez avec le mode contrôle (deux jumeaux baseline) et répétez sur plusieurs graines (outils/experience.py) avant de conclure.</p>`;

// ---- courbe du classement
(function(){
  const W = 820, H = 320, G = 46, B = 26;
  const sem = D.classements.map(c => c.semaine);
  const max = Math.max(...D.classements.flatMap(c => Object.values(c.points)));
  const x = s => G + (W - G - 10) * s / Math.max(1, sem[sem.length-1]);
  const y = v => H - B - (H - B - 10) * v / max;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Points de classement par semaine">`;
  for (let k = 0; k <= 4; k++) { const v = max * k / 4; svg += `<line x1="${G}" x2="${W-10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--ligne)"/><text x="${G-6}" y="${y(v)+4}" text-anchor="end">${Math.round(v)}</text>`; }
  sem.forEach(s => { svg += `<text x="${x(s)}" y="${H-8}" text-anchor="middle">${s}</text>`; });
  D.joueurs.forEach(j => {
    const pts = D.classements.map(c => `${x(c.semaine).toFixed(1)},${y(c.points[j.id]).toFixed(1)}`).join(" ");
    svg += `<polyline class="ligneJ" data-id="${j.id}" points="${pts}" fill="none" stroke="${COUL[j.paire]}" stroke-width="2" ${j.pilote==="llm"?"":'stroke-dasharray="5 4"'} opacity="0.85"><title>${esc(j.nom)} (${j.pilote})</title></polyline>`;
  });
  document.getElementById("courbe").innerHTML = svg + "</svg>";
  const leg = document.getElementById("legende");
  leg.innerHTML = D.joueurs.map(j => `<span data-id="${j.id}" style="color:${COUL[j.paire]}">${j.pilote==="llm"?"━":"┅"} <span style="color:var(--texte)">${esc(j.nom)}</span></span>`).join("");
  let actif = null;
  leg.addEventListener("click", e => {
    const t = e.target.closest("[data-id]"); if (!t) return;
    actif = actif === t.dataset.id ? null : t.dataset.id;
    document.querySelectorAll(".ligneJ").forEach(l => { l.setAttribute("opacity", !actif || l.dataset.id === actif ? "0.9" : "0.12"); l.setAttribute("stroke-width", l.dataset.id === actif ? "3.5" : "2"); });
  });
})();

document.getElementById("classement").innerHTML = `<table><tr><th class="n">#</th><th>Joueur</th><th>Pilotage</th><th>Style</th><th>Entraîneur</th><th class="n">Points</th><th class="n">Titres</th><th class="n">V-D</th><th class="n">Gains</th><th>Sponsor</th></tr>` +
  tri.map((j,k) => `<tr><td class="n">${k+1}</td><td>${esc(j.nom)} <span class="meta">${j.pays}, ${j.age} ans</span></td><td>${pilote(j)}</td><td>${j.style}</td><td>${esc(j.entraineur)}</td><td class="n">${j.points}</td><td class="n">${j.titres}</td><td class="n">${j.victoires}-${j.matchs-j.victoires}</td><td class="n">${eur(j.gains)}</td><td>${esc(j.sponsor||"—")}</td></tr>`).join("") + "</table>";

document.getElementById("articles").innerHTML = [...D.articles].reverse().map(a => `<div class="article carte">
  <p class="meta">Semaine ${a.semaine} · ${esc(a.tournoi)} · ${a.categorie} · ${SURF[a.surface]}</p>
  <h3>${esc(a.titre)}</h3><p>${esc(a.article)}</p>
  <p class="meta"><b>Question :</b> ${esc(a.question)}<br><b>${esc(nom(a.champion))} :</b> « ${esc(a.reponse)} »${a.revele_blessure?' <span class="neg">(révèle une blessure)</span>':""}</p></div>`).join("");

document.getElementById("negos").innerHTML = D.negociations.length ? D.negociations.map(n => `<div class="semaine ${n.contrat?"joue":""}">
  <b>${esc(nom(n.joueur))}</b> × ${esc(n.sponsor)} <span class="meta">semaine ${n.semaine}</span> → ${n.contrat ? `<span class="pos">contrat de ${eur(n.contrat)}</span>` : '<span class="neg">pas d’accord</span>'}
  ${n.echanges.map(e => `<div class="meta">${e.qui === "agent" ? "Agent" : "Sponsor"} : ${eur(e.montant)}${e.decision ? " ("+e.decision+")" : ""} : ${esc(e.texte)}</div>`).join("")}</div>`).join("") : '<p class="meta">Aucune négociation.</p>';

// ---- décisions par joueur
(function(){
  const sel = document.getElementById("choixJoueur");
  const ordre = [...D.joueurs].sort((a,b) => (a.pilote === "llm" ? 0 : 1) - (b.pilote === "llm" ? 0 : 1) || b.points - a.points);
  sel.innerHTML = ordre.map(j => `<option value="${j.id}">${esc(j.nom)} (${j.pilote})</option>`).join("");
  const afficher = id => {
    const j = J[id];
    let h = `<p><b>${esc(j.nom)}</b> · ${pilote(j)} · ${esc(j.personnalite)} · entraîneur ${esc(j.entraineur)}</p>`;
    D.semaines.forEach(s => {
      const d = s.decisions.find(x => x.joueur === id);
      const c = d.conseil;
      h += `<div class="semaine ${d.jouer?"joue":""}"><b>Semaine ${s.semaine}</b> · ${esc(s.tournoi || "pas de tournoi")}
        · ${d.jouer ? "joue" : (s.tournoi ? "<b>ne joue pas</b>" : "s’entraîne")} · entraînement ${ENTR[d.entrainement]}
        ${d.tour ? " · résultat : <b>" + TOURS[d.tour] + "</b>" : ""}
        <div class="meta">fatigue <span class="barre" style="width:${d.fatigue*8}px"></span> ${d.fatigue}/10${d.blessure ? ' · <span class="neg">blessé (secret)</span>' : ""}${d.tactique && s.tournoi && d.jouer ? " · tactique " + d.tactique.replace("_"," ") : ""}${d.repli ? ' · <span class="neg">repli</span>' : ""}</div>
        ${c && c.conseil ? `<div class="meta">${esc(c.entraineur)} : « ${esc(c.conseil)} »${c.recommande_jouer !== d.jouer ? ' <span class="neg">(désaccord)</span>' : ""}</div>` : ""}
        ${j.pilote === "llm" && !D.meta.controle ? `<div>« ${esc(d.raisonnement)} »</div>` : ""}</div>`;
    });
    const lecons = j.memoire.filter(x => x.type === "reflexion");
    if (lecons.length) h += `<h2 style="margin-top:12px">Leçons tirées (réflexion)</h2>` + lecons.map(l => `<div class="meta">Semaine ${l.semaine} (importance ${l.importance}) : ${esc(l.texte.replace(/^Leçon : /,""))}</div>`).join("");
    document.getElementById("decisions").innerHTML = h;
  };
  sel.addEventListener("change", () => afficher(sel.value));
  afficher(sel.value);
})();

// ---- rejeu d'une finale
(function(){
  const sel = document.getElementById("choixFinale"), curseur = document.getElementById("curseur"), bouton = document.getElementById("lecture");
  sel.innerHTML = D.finales.map((f,k) => `<option value="${k}">S${f.semaine} · ${esc(f.tournoi)} : ${esc(nom(f.vainqueur))} ${f.score}</option>`).join("");
  let f, etats, minuteur = null;
  const LIB = ["0","15","30","40"];
  function calculer(trace, setsGagnants) {
    const res = []; let sets = [], jeux = [0,0], pts = [0,0], serveur = 0;
    const etat = () => {
      const tb = jeux[0] === 6 && jeux[1] === 6, n = pts[0] + pts[1];
      // tie-break : le premier serveur sert 1 point, puis alternance tous les 2 points
      const srv = tb ? ((((n + 1) >> 1) % 2 === 0) ? serveur : 1 - serveur) : serveur;
      return {sets: sets.map(s => s.slice()), jeux: jeux.slice(), pts: pts.slice(), serveur: srv, tb};
    };
    res.push(etat());
    for (const c of trace) {
      if (c === "a" || c === "b") { pts[c === "a" ? 0 : 1]++; res.push({...etat(), gagnant: c}); }
      else if (c === "|") { const g = pts[0] > pts[1] ? 0 : 1; jeux[g]++; pts = [0,0]; serveur = 1 - serveur; res[res.length-1] = etat(); }
      else if (c === "/") { sets.push(jeux.slice()); jeux = [0,0]; res[res.length-1] = etat(); }
    }
    return res;
  }
  function libelle(e, i) {
    if (e.tb) return String(e.pts[i]);
    const [a,b] = e.pts;
    if (a >= 3 && b >= 3) { if (a === b) return "40"; return (i === 0 ? a > b : b > a) ? "AV" : "40"; }
    return LIB[Math.min(3, e.pts[i])];
  }
  function dessiner(k) {
    const e = etats[k];
    const ligne = (i, id) => `<tr><td class="${e.serveur === i && k < etats.length-1 ? "serveur" : ""}">${esc(nom(id))}${f.vainqueur === id && k === etats.length-1 ? " 🏆" : ""}</td>` +
      e.sets.map(s => `<td class="n">${s[i]}</td>`).join("") + (k < etats.length-1 ? `<td class="n"><b>${e.jeux[i]}</b></td><td class="n">${libelle(e,i)}</td>` : "") + "</tr>";
    document.getElementById("score").innerHTML = ligne(0, f.a) + ligne(1, f.b);
    const debut = etats.slice(0, k+1).filter(x => x.gagnant).slice(-120);
    document.getElementById("bandePoints").innerHTML = debut.map(x => `<i style="background:${x.gagnant === "a" ? "var(--accent)" : "var(--alerte)"}" title="${esc(nom(x.gagnant === "a" ? f.a : f.b))}"></i>`).join("");
  }
  function charger(k) { arreter(); f = D.finales[k]; etats = calculer(f.points, f.sets_gagnants); curseur.max = etats.length - 1; curseur.value = 0; dessiner(0); }
  function arreter() { if (minuteur) clearInterval(minuteur); minuteur = null; bouton.textContent = "Lecture"; }
  bouton.addEventListener("click", () => {
    if (minuteur) return arreter();
    if (+curseur.value >= etats.length - 1) curseur.value = 0;
    bouton.textContent = "Pause";
    minuteur = setInterval(() => { const v = +curseur.value + 1; if (v >= etats.length) return arreter(); curseur.value = v; dessiner(v); }, +document.getElementById("vitesse").value);
  });
  curseur.addEventListener("input", () => dessiner(+curseur.value));
  sel.addEventListener("change", () => charger(+sel.value));
  if (D.finales.length) charger(0);
})();
</script>
</body>
</html>
"""


def generer(dossier: Path) -> Path:
    dossier = Path(dossier)
    donnees = json.loads((dossier / "saison.json").read_text(encoding="utf-8"))
    # « </ » et « <!-- » venant du LLM ne doivent pas casser la balise <script>
    brut = json.dumps(donnees, ensure_ascii=False).replace("</", "<\\/").replace("<!--", "<\\u0021--")
    sortie = dossier / "tableau_de_bord.html"
    sortie.write_text(GABARIT.replace("__DONNEES__", brut), encoding="utf-8")
    return sortie


if __name__ == "__main__":
    print(generer(Path(sys.argv[1])))
