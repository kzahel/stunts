# Browser remake reference spec: **Stunts** (aka **4D Sports Driving**, 1990)

This document is a build-focused reference for recreating the *feel* and feature set of the original DOS game: driving, track editor, terrain/horizon, opponents, replay system, UI affordances, and the canonical content library (cars + track pieces).

Primary references used:

* Original manual (Mindscape “4D Sports Driving”) ([RetroGames.cz][1])
* Stunts Wiki: track file format + element catalog + horizon codes ([wiki.stunts.hu][2])
* Stunts Wiki: in-game editor notes (extra hotkeys: **C** check, **Shift+F1** terrain) ([wiki.stunts.hu][3])
* Reception/legacy context ([Wikipedia][4])

---

## 1) High-level goals for a faithful browser remake

### 1.1 Core pillars to preserve

* **Simple-but-demanding stunt driving** (loops, corkscrews, pipe, ramps).
* **Tile-based track editor** with **palette categories**, quick placement, validation, and terrain/horizon selection.
* **Replay system** with rewind/fast-forward, multiple camera modes, and “continue driving” from a rewind point.
* **Time + penalties + best times**, plus **opponent personalities** (AI racers with distinct difficulty/“attitude”).

### 1.2 Modern additions that still “fit”

* **Split-screen local multiplayer** (time attack vs ghost, head-to-head, or simultaneous race).
* **Online asynchronous multiplayer** via ghost/replay upload (deterministic replay format).
* **Quality-of-life**: undo/redo in editor, searchable piece palette, export/share links.

---

## 2) Simulation and data model

### 2.1 Track & terrain grid (canonical)

* Track is **30×30 tiles**. ([wiki.stunts.hu][2])
* Track files are **binary .TRK** of **1802 bytes** when produced by the original game:

  * 900 bytes: track layout (30×30)
  * 1 byte: **horizon**
  * 900 bytes: terrain
  * 1 byte: extra/unused padding ([wiki.stunts.hu][2])

**Implementation recommendation (remake):**

* Keep an internal representation:

  ```text
  Track {
    tiles[30][30]: TrackTile (type + orientation + multi-tile metadata)
    terrain[30][30]: TerrainTile (water/hill/slope/coast)
    horizon: enum
    name, author, notes
  }
  ```

### 2.2 Multi-tile pieces and “filler” behavior (important quirk)

Many stunt elements are multi-tile. In the original file format:

* The “main” tile holds the element code; adjacent tiles are **filler tiles** (FE/FD/FF patterns) that must be placed correctly for proper behavior. ([wiki.stunts.hu][2])
* External editors sometimes exploit fillers to create **illusion tracks** (rendering vs collision mismatches at distance). ([wiki.stunts.hu][2])

**Remake decision point:**

* For faithful compatibility: model multi-tile pieces explicitly and auto-place hidden fillers.
* For “classic feel” without file-compat: still enforce multi-tile footprint occupancy and placement rules.

### 2.3 Terrain constraints and crashy edge cases

* The original engine is strict: terrain byte values above certain ranges can crash when loading. ([wiki.stunts.hu][2])
* The in-game editor disallowed building on **water** (except bridges) and had plateau edge restrictions (manual). ([RetroGames.cz][1])

**Remake recommendation:** enforce rules in-editor (with optional “unsafe mode” toggle for creative/bug tracks).

---

## 3) Horizon / scenery themes (canonical list)

The track “horizon” byte maps to themes: ([wiki.stunts.hu][2])

* 00 **Desert**
* 01 **Tropical**
* 02 **Alpine**
* 03 **City**
* 04 **Country**
* 05 **Chaotic scenery** (can make the original behave weird)

**Remake:** implement these as skybox + ground palette + prop set; keep “chaotic” as an intentionally glitchy/easter-egg theme.

---

## 4) Cars (original set of 11)

The manual’s car roster includes **3 race cars**, **5 road sports cars**, **3 off-road**. ([RetroGames.cz][5])

### 4.1 Race cars

* **Porsche March Indy**
* **Jaguar IMSA**
* **Porsche 962 IMSA** ([RetroGames.cz][5])

### 4.2 Road cars

* **Acura NSX**
* **Lamborghini Countach**
* **Ferrari GTO**
* **Porsche Carrera 4**
* **Corvette ZR-1** ([RetroGames.cz][5])

### 4.3 Off-road

* **Lancia Delta Integrale**
* **Audi Quattro**
* **Lamborghini LM-002** ([RetroGames.cz][5])

**Notes to preserve:**

* Handling differences mattered (especially on **dirt/ice**). Contemporary writeups and community commentary highlight surface-dependent car behavior. ([ibiblio.org][6])

**Remake recommendation:** reproduce the “arcade sim” vibe:

* Simple drivetrain model + per-car params:

  * top speed, acceleration curve, grip by surface, brake strength, steering response, weight/inertia
* Deterministic fixed timestep so replays/ghosts are stable.

---

## 5) Opponents (AI personalities)

The manual lists six opponents (in increasing difficulty): ([RetroGames.cz][5])

1. **Alfredo**
2. **Zack**
3. **Dieter**
4. **Svetlana**
5. **Spike**
6. **Duke**

The manual also describes an opponent “radar” display. ([RetroGames.cz][5])

**Remake AI approach:**

* Drive a precomputed “ideal line” with adjustable:

  * target speed per tile
  * braking aggressiveness
  * error rate (under/oversteer mistakes)
  * recovery skill after collisions
* Keep their *personality* mostly in pacing + consistency.

---

## 6) Track piece library (content catalog)

This section is split into:

* **Editor palette view** (how the player thinks about pieces)
* **Canonical piece taxonomy** (how you implement it)

### 6.1 Editor palettes (original concept)

The in-game editor uses category palettes typically addressed by **F1–F10**, per community documentation. ([wiki.stunts.hu][3])

From the manual: palettes include **basic roads**, **ramps**, **stunts**, **dirt/ice**, **tunnels/highways**, **forks**, **boulevards**, **elevated**, **spirals**, etc. ([RetroGames.cz][1])

Also:

* **Shift+F1**: edit terrain (hills/water) (not in the original manual, but documented on the wiki). ([wiki.stunts.hu][3])
* **C**: validate/check track validity; cursor moves to the failing element. ([wiki.stunts.hu][3])

### 6.2 Canonical track elements (implementer taxonomy)

The Stunts Wiki “Track file” page gives a comprehensive list of track/terrain/scenery elements, including multi-tile rules and horizon codes. ([wiki.stunts.hu][2])

#### 6.2.1 Road surfaces

Implement each with distinct friction + sound + visual:

* **Paved road** (straight, corners, intersections, start/finish) ([wiki.stunts.hu][2])
* **Dirt road** (same shapes) ([wiki.stunts.hu][2])
* **Icy road** (same shapes; low grip) ([wiki.stunts.hu][2])

#### 6.2.2 Core linear pieces

* Straight road (paved/dirt/ice)
* Start/finish line (paved/dirt/ice variants) ([wiki.stunts.hu][2])

#### 6.2.3 Intersections and crossings

* Crossroad (4-way)
* Elevated span over road / bridges that cross without connecting ([wiki.stunts.hu][2])

#### 6.2.4 Elevation system

* Elevated road
* Elevated ramp (ascending/descending)
* Bridge ramp
* Solid ramp / solid elevated segments ([wiki.stunts.hu][2])

#### 6.2.5 Signature stunts

* **Loop** (2×1 footprint) ([wiki.stunts.hu][2])
* **Corkscrew left/right** (“Cork l/r”, 2×1 footprint) ([wiki.stunts.hu][2])
* **Corkscrew up/down** (“cork u/d”, handedness matters) ([wiki.stunts.hu][2])
* **Pipe** + pipe start/end ([wiki.stunts.hu][2])
* **Half-pipe obstacle** ([wiki.stunts.hu][2])
* **Slalom road** ([wiki.stunts.hu][2])

Manual restrictions to preserve:

* Pipe must be placed with required flat/compatible approaches; ramps have placement constraints. ([RetroGames.cz][1])

#### 6.2.6 Tunnels and highways

* Tunnel segment (enter/exit behavior via regular orientation)
* Highway + highway start/end ([wiki.stunts.hu][2])

#### 6.2.7 Banked road

* Banked road pieces (directional banking) ([wiki.stunts.hu][2])

#### 6.2.8 Scenery props (placeable objects)

From the track file catalog: ([wiki.stunts.hu][2])

* Palm tree, cactus, pine tree
* Tennis court
* Gas station, barn, office building, windmill, ship, “Joe’s Dinner”

**Remake:** keep scenery non-colliding by default (or emulate original collision behavior if known/desired).

---

## 7) Track editor UX (faithful behaviors)

### 7.1 Layout and navigation

* The manual describes the editor as a **windowed view** over the full 30×30 grid (not showing entire track at once). ([RetroGames.cz][1])
* Joystick/editor controls describe toggling between palette and track window; mouse uses scrollbars. ([RetroGames.cz][5])

### 7.2 Validation

* Press **C** to check validity and explain errors (documented in manual reference card + wiki). ([RetroGames.cz][5])

### 7.3 Terrain editing

* **Shift+F1** toggles terrain editing mode (hills/water) per Stunts Wiki. ([wiki.stunts.hu][3])

### 7.4 Track I/O

The manual describes editor Load/Save workflows and file naming for tracks/replays (tracks: .TRK, replays: .RPL). ([RetroGames.cz][1])

**Remake recommendation:**

* Internal JSON for web; optional import/export of canonical .TRK/.RPL for preservation tooling (if you choose to implement those formats).

---

## 8) Replay system (feature-complete target)

This is a key differentiator; implement it early and design the whole game around deterministic playback.

### 8.1 Recording limits and overwrite behavior

* Replay buffer records up to **10 minutes**. If you exceed it:

  * you’re prompted to review or continue
  * continuing overwrites the earliest replay data in chunks (manual describes 20-second erasures). ([RetroGames.cz][1])

### 8.2 Core replay transport controls

From the manual: ([RetroGames.cz][1])

* Rewind / Fast Forward: seek within recorded run (with a small delay while it locates the exact time)
* Play
* Fast Play (faster playback while still rendering)
* Pause/Stop
* Continue Driving (take control from a rewind point; invalidates best-time submission for that “edited” run)

### 8.3 Camera modes in replay

Manual lists: ([RetroGames.cz][1])

* **Inside the car** (driving perspective)
* **Overhead camera**
* **Track cams** (auto-placed spectator cameras)
* **Manual settings** (pan/zoom freely)

### 8.4 Replay menu options (must replicate)

From the manual’s replay menu: ([RetroGames.cz][1])

* Return to Replay
* Save Replay (.RPL)
* Load Replay (and delete)
* Drive Again (same track/car/opponent)
* Return to Evaluation (time, penalty, speed, opponent judgment)
* Continue Race (enabled only after rewinding to a point)
* Toggle Car View (player vs opponent)
* Display Options:

  * Hide/Show Dashboard
  * Hide/Show Replay Panel
  * Change Camera Angle
* Main Menu

### 8.5 Replay hotkeys / UI toggles

From the reference card section: ([RetroGames.cz][5])

* **D**: show/hide dashboard
* **R**: show/hide replay panel
* **C** (during replay): cycle camera modes
* **F1–F4**: camera angles (and/or “change camera angle”)

**Manual camera controls (keyboard):**

* Hold **Ctrl** and press cursor keys to pan, **+ / -** to zoom. ([RetroGames.cz][5])

---

## 9) Controls (complete mapping targets)

### 9.1 Keyboard driving controls

From a preserved “reference card” transcription: ([oldgames.sk][7])

* **Left Arrow**: turn left
* **Right Arrow**: turn right
* **Up Arrow**: accelerate
* **Down Arrow**: brake
* **A**: shift up
* **Z**: shift down

Other key functions (manual reference card area): ([RetroGames.cz][5])

* **Ctrl+J**: joystick mode
* **Ctrl+K**: keyboard mode
* **Ctrl+Q**: quit to DOS
* **Ctrl+M**: music on/off
* **Ctrl+S**: sound on/off
* **P**: pause
* **Esc**: back / stop calculating opponent time
* **Ctrl+G**: set graphics level
* **M** (while driving): drive using the mouse
* **D**: toggle dashboard
* **R**: toggle replay panel
* **C**: change camera (or use F1–F4)

### 9.2 Mouse / joystick behaviors to emulate

* Mouse is “always available” except while driving; press **M** while driving to activate mouse steering. ([RetroGames.cz][5])
* Joystick is handled more like a digital cursor selector than a continuous analog input. ([RetroGames.cz][5])

**Remake recommendation:**

* Provide modern input defaults (gamepad analog steering), but include a “classic digital steering” option for authenticity and deterministic replays.

---

## 10) Graphics, camera, draw distance: faithful interpretations

### 10.1 Graphics level toggle

* The original supports **Ctrl+G** “Set graphics level.” ([RetroGames.cz][5])
  The manual reference card doesn’t enumerate each level; for a faithful remake you’ll likely want 3–5 discrete presets that adjust:
* draw distance (clip plane)
* world detail (props on/off)
* framerate cap / fixed timestep decimation (if you want to emulate “jerkiness” cited in reviews) ([Wikipedia][4])

### 10.2 Camera system (driving + replay)

Driving:

* in-car view (primary)
  Replay:
* in-car, overhead, track cams, manual pan/zoom ([RetroGames.cz][1])

**Implementation recommendation:**

* All cameras derived from the same deterministic vehicle pose stream.
* Track cams: auto-place camera nodes at “strategic points” (tile-based heuristics: near stunts, intersections, high curvature). ([RetroGames.cz][1])

---

## 11) Evaluation, timing, penalties, best times

The manual repeatedly references:

* **time**
* **penalty**
* **speed**
* **opponent judgment**
* and “Best Times” lists, with a rule that **edited** runs (continue-from-rewind) cannot be submitted. ([RetroGames.cz][1])

**Remake recommendation (faithful scoring model):**

* Base time = elapsed time start→finish
* Penalties:

  * off-track
  * collisions/crashes (original often ended the run; if you emulate this, keep it strict)
* Best times per track+car+transmission+ruleset

---

## 12) Notable engine quirks worth emulating (or explicitly choosing not to)

From the Stunts Wiki internals and track format notes: ([wiki.stunts.hu][2])

* Strict terrain code ranges; invalid values can crash.
* Multi-tile stunt pieces depend on filler placement; missing fillers enable “illusion” effects.
* Some unused codes display oddly in preview then normalize during race (suggesting a pre-render conversion step).
* Community accounts and reviews mention “bugs that launch the car” as part of the charm. ([MobyGames][8])

**Remake stance options:**

* **Classic mode:** preserve a small set of “benign” physics oddities (launches on weird edge hits).
* **Clean mode:** stable physics for multiplayer fairness.

---

## 13) Browser remake feature checklist (implementation-oriented)

### 13.1 Minimum viable faithful slice (recommended order)

1. Deterministic vehicle sim + one surface (paved)
2. Tile track system + start/finish + curves
3. Replay record/playback (input log → state)
4. Track editor with palettes + validation
5. Stunts: loop + cork l/r + ramps
6. Terrain + horizon themes
7. AI opponent (one personality)
8. Best times + export/share

### 13.2 Multiplayer-ready architecture (browser)

* Lockstep deterministic sim (same tick rate, same math)
* Inputs are the replay format (authoritative)
* Split-screen just renders two cameras from two vehicles; online sends only inputs.

---

## 14) References (copy/paste URLs)

```text
Manual (PDF): https://www.retrogames.cz/manualy/DOS/4D_Sports_Driving_-_DOS_-_Manual.pdf
Stunts Wiki – Track file format + element catalog + horizon codes: https://wiki.stunts.hu/wiki/Track_file
Stunts Wiki – In-game editor tips (Shift+F1 terrain, C validate): https://wiki.stunts.hu/wiki/In-game_editor
Wikipedia – Reception notes: https://en.wikipedia.org/wiki/Stunts_(video_game)
MobyGames – Reviews + screenshots section entry point: https://www.mobygames.com/game/329/stunts/reviews/
Stunts community portal (modern scene/tools): https://stunts.hu/
Ultimate Stunts documentation (open-source remake reference): https://ultimatestunts.nl/documentation/en/gamesession.htm
```

---

If you want the document extended further, the most impactful additions would be:

* A per-piece **collision/trigger contract** (what constitutes “on track” for each tile, how stunts transition).
* A per-car **parameter sheet** (top speed/0–60/etc from the manual, plus inferred handling params), and a deterministic replay schema (binary or JSON) designed for online ghost racing.

[1]: https://www.retrogames.cz/manualy/DOS/4D_Sports_Driving_-_DOS_-_Manual.pdf?utm_source=chatgpt.com "4D Sports Driving Manual"
[2]: https://wiki.stunts.hu/wiki/Track_file "Track file - Stunts Wiki"
[3]: https://wiki.stunts.hu/wiki/In-game_editor "In-game editor - Stunts Wiki"
[4]: https://en.wikipedia.org/wiki/Stunts_%28video_game%29 "Stunts (video game) - Wikipedia"
[5]: https://www.retrogames.cz/manualy/DOS/4D_Sports_Driving_-_DOS_-_Manual.pdf "4D Sports Driving Manual"
[6]: https://www.ibiblio.org/GameBytes/issue20/misc/stunts.html?utm_source=chatgpt.com "STUNTS from Broderbund / 4D SPORTS DRIVING ..."
[7]: https://www.oldgames.sk/game/stunts/download/3870/?utm_source=chatgpt.com "Stunts Reference Card (txt)"
[8]: https://www.mobygames.com/game/329/stunts/reviews/ "
      Stunts reviews - MobyGames
    "

