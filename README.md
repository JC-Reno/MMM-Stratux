# MMM-Stratux

A MagicMirror2 module that connects directly to a local Stratux receiver and displays live ADS-B traffic. (See Stratux.com for receiver details.)

Data sources used by this module:

- WebSocket traffic stream: `ws://<stratuxHost>/traffic`
- REST status: `http://<stratuxHost>/getStatus`
- REST ownship situation: `http://<stratuxHost>/getSituation`

## Features

- Live air traffic table with sort and range filtering
- Status header with GPS/UAT/ES rates and target count
- Optional Leaflet map with ownship + traffic markers
- Auto reconnect to Stratux if the WebSocket drops
- Stale target dimming and timed pruning
- Dynamic traffic icon colors:
  - Default: cyan
  - Landing/descending: magenta
  - Climbing: neon green

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/JC-Reno/MMM-Stratux.git
cd MMM-Stratux
npm install
```

## MagicMirror Config

Add this block to your MagicMirror config:

```js
{
  module: "MMM-Stratux",
  position: "top_right",
  config: {
    stratuxHost: "192.168.1.249",
    maxAircraft: 10,
    staleSeconds: 30,
    pruneSeconds: 60,
    statusPollMs: 5000,
    maxDistanceNm: 0,
    showOnGround: false,
    showSignal: false,
    sortBy: "distance",
    updateInterval: 1000,
    distanceUnit: "nm",
    altitudeUnit: "ft",
    showMap: true,
    mapZoom: 9
  }
}
```

## Configuration Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `stratuxHost` | string | `"192.168.1.249"` | Stratux host/IP address |
| `maxAircraft` | number | `10` | Max aircraft rows displayed |
| `staleSeconds` | number | `30` | Mark row as stale after this many seconds |
| `pruneSeconds` | number | `60` | Remove unseen aircraft after this many seconds |
| `statusPollMs` | number | `5000` | Poll period for `/getStatus` and `/getSituation` |
| `maxDistanceNm` | number | `0` | Distance filter in NM (`0` disables filter) |
| `showOnGround` | boolean | `false` | Include on-ground traffic |
| `showSignal` | boolean | `false` | Show signal level column |
| `sortBy` | string | `"distance"` | `distance`, `altitude`, or `tail` |
| `updateInterval` | number | `1000` | Frontend refresh interval (ms) |
| `distanceUnit` | string | `"nm"` | Reserved for future unit switching |
| `altitudeUnit` | string | `"ft"` | Reserved for future unit switching |
| `showMap` | boolean | `true` | Show map above the table |
| `mapZoom` | number | `9` | Initial Leaflet zoom |

## Map Behavior

- Map tiles use OpenStreetMap.
- The map container is kept persistent across `updateDom()` cycles to avoid blank-map redraw issues.
- Ownship marker uses `icons/ownship.svg`. A home icon.
- Traffic marker heading follows `Track` when the rotation plugin is available.

Default map height is currently `520px` in `MMM-Stratux.css`.

## Display Rules

- Rows are filtered to `Position_valid` targets.
- Optional on-ground filtering via `showOnGround`.
- Distance filter uses Stratux `Distance` converted to NM.
- Emergency squawks are highlighted:
  - `7700`: emergency
  - `7600`: radio failure
  - `7500`: hijack

## Dependencies

- Runtime: Node.js 18+
- npm package: `ws`
- Bundled frontend libs:
  - `map/leaflet.js`
  - `map/leaflet.css`
  - `map/leaflet.rotatedMarker.js`

## Troubleshooting

If the module stays on connecting:

1. Confirm Stratux is reachable at `stratuxHost`.
1. Verify these endpoints from your MagicMirror host: `http://<stratuxHost>/getStatus` and `http://<stratuxHost>/getSituation`.
1. Check MagicMirror logs for WebSocket or HTTP errors from `node_helper.js`.

If traffic appears but no map:

1. Ensure `showMap: true`.
2. Ensure ownship (`GPSLatitude`/`GPSLongitude`) or at least one traffic target with position exists.

## License

MIT
