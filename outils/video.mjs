// Enregistre une démo du village 3D pour le README : images JPEG horodatées, que
// outils/assembler_video.py transforme en WebP / GIF animé.
//
//   node outils/video.mjs --url http://127.0.0.1:8765/ --semaine 6 --sortie $TEMP/frames
//
// Le serveur (python -m tennis.direct --nom <saison terminée>) doit tourner. Le script
// utilise playwright-core (installé avec @playwright/cli, ou chemin dans PLAYWRIGHT_CORE)
// et le Chromium de Playwright, en fenêtre visible pour profiter du GPU.
import {createRequire} from "node:module";
import {execSync} from "node:child_process";
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, t) =>
  (a.startsWith("--") ? [...acc, [a.slice(2), t[i + 1]]] : acc), []));
const URL_ = args.url || "http://127.0.0.1:8765/";
const SEMAINE = +(args.semaine || 6);
const SORTIE = args.sortie || "frames";
const LARGEUR = +(args.largeur || 1600), HAUTEUR = +(args.hauteur || 900);

function playwright() {
  const require = createRequire(import.meta.url);
  const essais = [process.env.PLAYWRIGHT_CORE, "playwright-core"];
  try { essais.push(join(execSync("npm root -g").toString().trim(), "@playwright/cli/node_modules/playwright-core")); } catch { /* npm absent */ }
  for (const e of essais.filter(Boolean)) { try { return require(e); } catch { /* suivant */ } }
  throw new Error("playwright-core introuvable : npm i -g @playwright/cli, ou PLAYWRIGHT_CORE=<chemin>");
}

const attendre = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  mkdirSync(SORTIE, {recursive: true});
  const {chromium} = playwright();
  // Chrome installé d'abord (pas de téléchargement), sinon le Chromium de Playwright
  const options = {headless: false, args: ["--window-position=0,0", "--hide-scrollbars"]};
  const navigateur = await chromium.launch({...options, channel: "chrome"}).catch(() => chromium.launch(options));
  const page = await navigateur.newPage({viewport: {width: LARGEUR, height: HAUTEUR}, deviceScaleFactor: 1, reducedMotion: "no-preference"});
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));
  await page.goto(URL_);
  await page.waitForFunction(() => document.getElementById("voile")?.hidden || getComputedStyle(document.getElementById("voile")).display === "none"
    || document.querySelectorAll("#frise button").length > 0, null, {timeout: 60000});
  await attendre(2500);
  console.log("animations réduites :", await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches));
  await page.addStyleTag({content: ".aide{display:none!important}"});

  // flux d'images du navigateur (CDP) : horodaté, sans ralentir le rendu comme des captures
  const cdp = await page.context().newCDPSession(page);
  const images = [];
  cdp.on("Page.screencastFrame", async f => {
    const nom = `f${String(images.length).padStart(5, "0")}.jpg`;
    writeFileSync(join(SORTIE, nom), Buffer.from(f.data, "base64"));
    images.push({nom, t: f.metadata.timestamp});
    await cdp.send("Page.screencastFrameAck", {sessionId: f.sessionId}).catch(() => {});
  });
  // clics dans la page (pas d'attente d'« actionnabilité » : la 3D bouge sans cesse)
  const clic = sel => page.evaluate(s => document.querySelector(s)?.click(), sel);
  const jour = i => page.evaluate(n => document.querySelectorAll("#jours button")[n]?.click(), i);
  const semaine = k => page.evaluate(n => document.querySelectorAll("#frise button")[n - 1]?.click(), k);

  // 1. le samedi de la semaine choisie, vue d'ensemble
  await semaine(SEMAINE); await attendre(400);
  await jour(5); await attendre(1200);
  await page.evaluate(() => {
    const v = document.getElementById("vitesse"); v.value = 5; v.dispatchEvent(new Event("input"));
    document.getElementById("suivre").checked = true;
  });
  await cdp.send("Page.startScreencast", {format: "jpeg", quality: 85, maxWidth: LARGEUR, maxHeight: HAUTEUR, everyNthFrame: 1});
  await attendre(2000);
  // 2. lecture : demies du samedi (grille de tous les agents), puis la finale du dimanche
  const minutes = () => page.evaluate(() => {
    const m = (document.getElementById("horloge").textContent || "").match(/(\d+) h (\d+)/);
    return m ? +m[1] * 60 + +m[2] : -1;
  });
  const dimanche = () => page.evaluate(() => /dimanche/.test(document.getElementById("journal-titre").textContent));
  async function attendreQue(test, maxMs) {
    const fin = Date.now() + maxMs;
    while (Date.now() < fin) { if (await test()) return true; await attendre(150); }
    return false;
  }
  await clic("#lecture");
  await attendre(4000);
  await clic("#grille-btn");
  await attendre(3500);
  await clic("#grille-btn");
  await attendreQue(dimanche, 30000);
  // le dimanche plus lentement : la finale dure quelques secondes à 12 s par jour
  await page.evaluate(() => { const v = document.getElementById("vitesse"); v.value = 3; v.dispatchEvent(new Event("input")); });
  await attendreQue(async () => (await minutes()) >= 13 * 60 + 45, 30000);
  await attendre(3000);                      // la finale sur le central, caméra qui suit
  await clic("#tableau-btn");                // le tableau se remplit à l'heure de la lecture
  await attendreQue(() => page.evaluate(() => !!document.querySelector(".tb-coupe")), 30000);
  await attendre(2500);
  await clic("#tableau-btn");
  await attendre(3500);                      // confettis sur le central
  await page.evaluate(() => document.querySelector("#lecture.actif") && document.getElementById("lecture").click());
  // 3. la fiche d'un joueur
  await page.evaluate(() => document.querySelector("#lecture.actif") && document.getElementById("lecture").click());
  await clic("#grille-btn"); await attendre(300);      // la ligne du n° 1 ouvre sa fiche
  await page.evaluate(() => document.querySelector("#grille-table tbody tr")?.click());
  await attendre(200); await clic("#grille-btn");
  await attendre(4000);
  await cdp.send("Page.stopScreencast");
  await attendre(300);
  writeFileSync(join(SORTIE, "images.json"), JSON.stringify(images));
  await navigateur.close();
  console.log(`${images.length} images dans ${SORTIE}${erreurs.length ? ` ; erreurs de la page : ${erreurs.join(" | ")}` : ""}`);
}
main().catch(e => { console.error(e); process.exit(1); });
