# Données

`gabarits.json` est dérivé du **Match Charting Project** de Tennis Abstract
(Jeff Sackmann) : <https://github.com/JeffSackmann/tennis_MatchChartingProject>.

Licence : **Creative Commons BY-NC-SA 4.0**. Attribution obligatoire, usage
non commercial, partage dans les mêmes conditions. `gabarits.json` est
redistribué sous cette même licence.

Les gabarits sont anonymes : ils ne contiennent que des taux agrégés
(points gagnés au service et en retour, global et par surface) et un nombre
de matchs, sans aucun nom. Les joueurs de la simulation sont fictifs.

Pour reconstruire `gabarits.json` depuis les données brutes :

```
python outils/telecharger_donnees.py
```
