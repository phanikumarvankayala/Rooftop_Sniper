# 🎯 Rooftop Sniper

A browser sniper game that runs on phones and desktops. You hold a rooftop at dusk while enemy snipers pop up on the buildings across the street, two at a time. Take them out before they take you out.

**▶ Play:** https://phanikumarvankayala.github.io/Rooftop_Sniper/

## Features
- Three levels (Easy, Medium, Hard) that change enemy aim speed, damage and scope sway
- Unlimited ammo, bolt-action reload and a zoom scope that sways like real breathing
- Scoring: **+5** for a body shot, **+10** for a headshot
- Enemies hit about 40% of the time. A glinting scope and a red ring warn you before they fire
- Health packs parachute in now and then: shoot one to get health back
- Off-screen enemies and health packs are marked with arrows
- Each level keeps its own best score (saved in your browser)
- Sound effects are generated in code, so there are no audio files

## ♞ Also on this site: Chess Coach
**▶ Play:** https://phanikumarvankayala.github.io/Rooftop_Sniper/chess.html

Play chess against three training bots or engine opponents styled after 25 world champions and legends (Steinitz to Gukesh, Morphy, Judit Polgar and more). Each one plays its own openings and gambits. After every game you get a review: accuracy, blunders and mistakes drawn on the board with arrows, notes on any gambit you faced, and tips on how to improve. It works on phone and desktop, and the engine runs in your browser.

## Controls
| | Phone | Desktop |
|---|---|---|
| Aim | Drag anywhere | Move mouse (push to the screen edge to pan) |
| Zoom | **SCOPE** button | Right-click / Space / mouse wheel |
| Shoot | **FIRE** button | Left-click or F |
| Pause | ⏸ | Esc |

## Project structure
```
index.html      Rooftop Sniper: page layout, menus and HUD
style.css       Rooftop Sniper styling and mobile layout
game.js         Rooftop Sniper game logic: city, enemies, scope, scoring, health packs, sound
chess.html      Chess Coach (self-contained: engine, opponents, post-game review)
favicon.svg     tab icon
```
Plain HTML, CSS and JavaScript with no build step and no dependencies.

## Run locally
Open `index.html` in a browser, or serve the folder:
```
python3 -m http.server 8000
```
then go to http://localhost:8000.

## Host on GitHub Pages
Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save**. After a minute the game is live at `https://<your-username>.github.io/Rooftop_Sniper/`.
