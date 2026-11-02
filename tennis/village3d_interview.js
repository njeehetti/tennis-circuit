// Interview d'un joueur depuis sa fiche : la question part au serveur (POST /interview), qui fait
// répondre le LLM local dans la peau du joueur, avec ce qu'il sait au jour affiché.
// Texte via textContent uniquement (la réponse du LLM n'est jamais interprétée comme du HTML).
function el(tag, attrs, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k === "class" ? "class" : k, v);
  for (const e of enfants) if (e !== null && e !== undefined && e !== false) n.append(e instanceof Node ? e : String(e));
  return n;
}
const IDEES = ["Comment vous sentez-vous physiquement ?", "Que pensez-vous de votre prochain adversaire ?",
               "Qu'avez-vous retenu de votre dernier match ?", "Le public vous porte-t-il ?"];
const QUESTION_MAX = 300;

function echange(x) {
  return el("li", {}, el("p", {class: "iv-q"}, x.question),
            el("p", {class: "iv-r"}, x.reponse, x.humeur ? el("span", {class: "iv-humeur"}, ` (${x.humeur})`) : null),
            el("small", {}, `semaine ${x.semaine}, jour ${x.jour}${x.repli ? ", sans réponse du LLM" : ""}`));
}

// Bloc d'interview pour la fiche d'un joueur, au jour (semaine, jour) affiché.
export function blocInterview(joueur, semaine, jour, nomCourt) {
  const liste = el("ol", {class: "iv-liste"});
  const champ = el("textarea", {id: "iv-question", rows: "2", maxlength: String(QUESTION_MAX),
                                placeholder: `Votre question à ${nomCourt}…`, "aria-label": `Question à ${joueur.nom}`});
  const bouton = el("button", {type: "button", class: "voir iv-envoyer"}, "Poser la question");
  const etat = el("p", {class: "iv-etat", role: "status"});
  const idees = el("div", {class: "iv-idees"}, ...IDEES.map(q => {
    const b = el("button", {type: "button", class: "iv-idee"}, q);
    b.addEventListener("click", () => { champ.value = q; champ.focus(); });
    return b;
  }));

  fetch(`/interviews?joueur=${encodeURIComponent(joueur.id)}`, {cache: "no-store"})
    .then(r => (r.ok ? r.json() : []))
    .then(xs => liste.replaceChildren(...xs.map(echange)))
    .catch(() => {});

  async function envoyer() {
    const question = champ.value.trim();
    if (question.length < 3) { etat.textContent = "Écris une question d'au moins quelques mots."; return; }
    bouton.disabled = true;
    etat.textContent = `${nomCourt} réfléchit… (le LLM local peut prendre 10 à 30 s)`;
    try {
      const r = await fetch("/interview", {method: "POST", headers: {"Content-Type": "application/json"},
                                           body: JSON.stringify({joueur: joueur.id, semaine, jour, question})});
      const x = await r.json().catch(() => ({erreur: `réponse illisible (HTTP ${r.status})`}));
      if (!r.ok) { etat.textContent = x.erreur || `Échec (HTTP ${r.status}).`; return; }
      liste.append(echange(x));
      champ.value = "";
      etat.textContent = "";
    } catch (e) {
      etat.textContent = "Serveur injoignable : relance python -m tennis.direct.";
    } finally {
      bouton.disabled = false;
    }
  }
  bouton.addEventListener("click", envoyer);
  champ.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) envoyer(); });
  return el("section", {class: "interview", "aria-label": `Interview de ${joueur.nom}`},
            el("h4", {}, "Interview"),
            el("p", {class: "perso-txt"}, `Il répond avec ce qu'il sait au jour affiché (semaine ${semaine}, jour ${jour}).`),
            liste, idees, champ, bouton, etat);
}
