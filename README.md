# MMM-StratuxTrafficWeather

A MagicMirror² module that connects directly to a Stratux ADS‑B receiver and displays:

- Nearby air traffic
- Weather (METAR/TAF + Stratux weather fields)
- Optional GPS/AHRS/ownship map view

Uses Stratux’s built‑in JSON API — no SBS/Beast conversion required.

---

## Installation

```bash
cd ~/MagicMirror/modules
git clone <your-repo-or-copy> MMM-StratuxTrafficWeather
cd MMM-StratuxTrafficWeather
npm install
