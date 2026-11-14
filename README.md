# 🎯 Rooftop Sniper

A browser sniper game that runs on phones and desktops. You hold a rooftop at dusk while enemy snipers pop up on the buildings across the street, two at a time. Take them out before they take you out.

**▶ Play:** https://phanikumarvankayala.github.io/Rooftop_Sniper/ (opens the home page, where you pick Rooftop Sniper or Chess)

## Features
- Three levels (Easy, Medium, Hard) that change enemy aim speed, damage and scope sway
- Unlimited ammo, bolt-action reload and a zoom scope that sways like real breathing
- Scoring: **+5** for a body shot, **+10** for a headshot
- Enemies hit about 40% of the time. A glinting scope and a red ring warn you before they fire
- Health packs parachute in now and then: shoot one to get health back
- Off-screen enemies and health packs are marked with arrows
- Each level keeps its own best score (saved in your browser)
- Sound effects are generated in code, so there are no audio files

## 🎮 All games on this site
Home page: https://phanikumarvankayala.github.io/Rooftop_Sniper/

| Game | File | What it is |
|---|---|---|
| 🎯 Rooftop Sniper | `sniper.html` | Sniper shooter with health packs and three levels |
| ♞ Chess | `chess.html` | Play bots or 25 champion-styled engines, with a post-game coaching review |
| 🟢 Glow Maze | `glowmaze.html` | Arcade maze chase: eat the sparks, dodge the beetles, power orbs turn the tables |
| ✕◯ Tic-Tac-Toe | `tictactoe.html` | vs computer (Easy, Medium, Unbeatable) or vs a friend on the same device |
| 🔢 Mini Sudoku | `sudoku.html` | 6×6 Sudoku with Hint, Clear, Reset, Undo and three difficulty levels |
| ☀️ Sun & Moon | `sunmoon.html` | Balance suns and moons with = / × clues (binary logic puzzle) |
| 👑 Crowns | `crowns.html` | One crown per row, column and color region, none touching (6×6 to 8×8) |
| 🧩 Patchwork | `patchwork.html` | Split the grid into rectangles that match their numbers (5×5 to 7×7) |

Every puzzle is generated fresh with exactly one solution, and best times are saved in your browser.

## Rooftop Sniper controls
| | Phone | Desktop |
|---|---|---|
| Aim | Drag anywhere | Move mouse (push to the screen edge to pan) |
| Zoom | **SCOPE** button | Right-click / Space / mouse wheel |
| Shoot | **FIRE** button | Left-click or F |
| Pause | ⏸ | Esc |

## Project structure
```
index.html      home page: pick a game
bg.jpg          home page background photo
sniper.html     Rooftop Sniper: page layout, menus and HUD
style.css       Rooftop Sniper styling and mobile layout
game.js         Rooftop Sniper game logic: city, enemies, scope, scoring, health packs, sound
chess.html      Chess Coach (self-contained: engine, opponents, post-game review)
glowmaze.html   Glow Maze
tictactoe.html  Tic-Tac-Toe
sudoku.html     Mini Sudoku
sunmoon.html    Sun & Moon
crowns.html     Crowns
patchwork.html  Patchwork
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
