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
const LARGEUR = +(args.largeur || 1280), HAUTEUR = +(args.hauteur || 720);

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
  const navigateur = await chromium.launch({headless: false, args: ["--window-position=0,0", "--hide-scrollbars"]});
  const page = await navigateur.newPage({viewport: {width: LARGEUR, height: HAUTEUR}, deviceScaleFactor: 1});
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));
  await page.goto(URL_);
  await page.waitForFunction(() => document.getElementById("voile")?.hidden || getComputedStyle(document.getElementById("voile")).display === "none"
    || document.querySelectorAll("#frise button").length > 0, null, {timeout: 60000});
  await attendre(2500);
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
  const clic = sel => page.click(sel);
  const jour = async i => page.locator("#jours button").nth(i).click();
  const semaine = async k => page.locator("#frise button").nth(k - 1).click();

  // 1. vue d'ensemble du complexe, la semaine choisie, au dimanche
  await semaine(SEMAINE); await attendre(400);
  await jour(6); await attendre(800);
  await cdp.send("Page.startScreencast", {format: "jpeg", quality: 85, maxWidth: LARGEUR, maxHeight: HAUTEUR, everyNthFrame: 1});
  await attendre(3000);
  // 2. la finale en lecture rapide, caméra qui suit les temps forts, tableau ouvert
  await page.evaluate(() => {
    const v = document.getElementById("vitesse"); v.value = 5; v.dispatchEvent(new Event("input"));
    document.getElementById("suivre").checked = true;
  });
  await jour(5); await attendre(300);        // samedi : les demies
  await clic("#lecture");
  await attendre(5000);
  await clic("#tableau-btn");
  await attendre(9000);                       // dimanche : finale, confettis
  await clic("#tableau-btn");
  await clic("#grille-btn");
  await attendre(3500);
  await clic("#grille-btn");
  // 3. la fiche du vainqueur
  await page.evaluate(() => document.querySelector("#lecture.actif") && document.getElementById("lecture").click());
  await page.locator("#evenements li[data-qui]").first().click().catch(() => {});
  await attendre(3500);
  await cdp.send("Page.stopScreencast");
  await attendre(300);
  writeFileSync(join(SORTIE, "images.json"), JSON.stringify(images));
  await navigateur.close();
  console.log(`${images.length} images dans ${SORTIE}${erreurs.length ? ` ; erreurs de la page : ${erreurs.join(" | ")}` : ""}`);
}
main().catch(e => { console.error(e); process.exit(1); });
