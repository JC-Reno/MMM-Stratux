/* MagicMirror²
 * Module: MMM-Stratux
 * Description: Displays live ADS-B traffic data from a local Stratux receiver.
 *
 * Stratux WebSocket: ws://<host>/traffic
 * Stratux REST:      http://<host>/getStatus, http://<host>/getSituation
 *
 * MIT Licensed.
 */

Module.register("MMM-Stratux", {

  defaults: {
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

    // Map options
    showMap: true,
    mapZoom: 9
  },

  start() {
    Log.info(`${this.name}: Starting`);
    this.aircraft = {};
    this.status = null;
    this.situation = null;
    this.connected = false;
    this.lastUpdate = null;

    this.map = null;
    this.mapMarkers = { ownship: null, traffic: {} };

    this.sendSocketNotification("STRATUX_CONNECT", {
      host: this.config.stratuxHost,
      statusPollMs: this.config.statusPollMs,
      pruneSeconds: this.config.pruneSeconds
    });

    setInterval(() => this.updateDom(0), this.config.updateInterval);
  },

  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case "STRATUX_CONNECTED":
        this.connected = true;
        break;

      case "STRATUX_DISCONNECTED":
        this.connected = false;
        break;

      case "STRATUX_TRAFFIC":
        if (payload && payload.Icao_addr != null) {
          const key = payload.Icao_addr.toString(16).toUpperCase().padStart(6, "0");
          payload._key = key;
          payload._receivedAt = Date.now();
          this.aircraft[key] = payload;
          this.lastUpdate = Date.now();
        }
        break;

      case "STRATUX_STATUS":
        this.status = payload;
        break;

      case "STRATUX_SITUATION":
        this.situation = payload;
        break;

      case "STRATUX_PRUNED":
        if (Array.isArray(payload)) {
          payload.forEach(k => {
            delete this.aircraft[k];
            if (this.mapMarkers.traffic[k]) {
              this.map.removeLayer(this.mapMarkers.traffic[k]);
              delete this.mapMarkers.traffic[k];
            }
          });
        }
        break;
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-stratux-wrapper";

    wrapper.appendChild(this._buildHeader());

    if (!this.connected) {
      const msg = document.createElement("div");
      msg.className = "mmm-stratux-offline";
      msg.textContent = `Connecting to Stratux at ${this.config.stratuxHost}`;
      wrapper.appendChild(msg);
      return wrapper;
    }

    const now = Date.now();
    const maxDist = this.config.maxDistanceNm;

    let list = Object.values(this.aircraft).filter(ac => {
      if (!this.config.showOnGround && ac.OnGround) return false;
      if (!ac.Position_valid) return false;
      if (maxDist > 0 && this._distNm(ac) > maxDist) return false;
      return true;
    });

    switch (this.config.sortBy) {
      case "altitude": list.sort((a, b) => (b.Alt || 0) - (a.Alt || 0)); break;
      case "tail": list.sort((a, b) => (a.Tail || "").localeCompare(b.Tail || "")); break;
      default: list.sort((a, b) => (a.Distance || 0) - (b.Distance || 0));
    }

    list = list.slice(0, this.config.maxAircraft);

    // MAP ABOVE TABLE
    const mapDiv = document.createElement("div");
    mapDiv.id = "mmm-stratux-map";
    mapDiv.className = "mmm-stratux-map";
    wrapper.appendChild(mapDiv);

    setTimeout(() => this._renderMap(list), 0);

    if (list.length === 0) {
      const msg = document.createElement("div");
      msg.className = "mmm-stratux-no-traffic";
      msg.textContent = "No traffic in range";
      wrapper.appendChild(msg);
      return wrapper;
    }

    wrapper.appendChild(this._buildTable(list, now));
    return wrapper;
  },

  _buildHeader() {
    const hdr = document.createElement("div");
    hdr.className = "mmm-stratux-header";

    const title = document.createElement("span");
    title.className = "mmm-stratux-title";
    title.textContent = "✈ ADS-B Traffic";
    hdr.appendChild(title);

    const dot = document.createElement("span");
    dot.className = `mmm-stratux-dot ${this.connected ? "connected" : "disconnected"}`;
    hdr.appendChild(dot);

    if (this.status) {
      const meta = document.createElement("span");
      meta.className = "mmm-stratux-meta";
      const gps = this.status.GPS_connected ? "GPS ✓" : "GPS ✗";
      const uat = `UAT ${this.status.UAT_messages_last_minute ?? "?"}/min`;
      const es = `ES ${this.status.ES_messages_last_minute ?? "?"}/min`;
      const acCt = Object.keys(this.aircraft).length;
      meta.textContent = `${gps} • ${uat} • ${es} • ${acCt} targets`;
      hdr.appendChild(meta);
    }

    return hdr;
  },

  _buildTable(list, now) {
    const table = document.createElement("table");
    table.className = "mmm-stratux-table";

    const thead = table.createTHead();
    const hrow = thead.insertRow();
    const cols = ["Tail / ICAO", "Alt (ft)", "VS", "Spd (kt)", "Hdg", "Dist", "Bearing"];
    if (this.config.showSignal) cols.push("Sig");

    cols.forEach(c => {
      const th = document.createElement("th");
      th.textContent = c;
      hrow.appendChild(th);
    });

    const tbody = table.createTBody();

    list.forEach(ac => {
      const row = tbody.insertRow();
      const ageMs = now - (ac._receivedAt || now);

      if (ageMs > this.config.staleSeconds * 1000) row.classList.add("stale");
      if (ac.Squawk === 7700) row.classList.add("emergency");
      else if (ac.Squawk === 7600) row.classList.add("radio-fail");
      else if (ac.Squawk === 7500) row.classList.add("hijack");

      const vvel = ac.Vvel || 0;
      if (vvel > 200) row.classList.add("climbing");
      else if (vvel < -200) row.classList.add("descending");

      const tail = ac.Tail && ac.Tail.trim() ? ac.Tail.trim() : ac._key;
      const tdId = row.insertCell(); tdId.className = "col-tail";
      tdId.textContent = tail;

      const tdAlt = row.insertCell(); tdAlt.className = "col-alt";
      tdAlt.textContent = ac.Alt != null ? ac.Alt.toLocaleString() : "–";

      const tdVs = row.insertCell(); tdVs.className = "col-vs";
      tdVs.textContent = vvel > 200 ? `↑ ${vvel}` : vvel < -200 ? `↓ ${Math.abs(vvel)}` : "–";

      const tdSpd = row.insertCell(); tdSpd.className = "col-spd";
      tdSpd.textContent = ac.Speed_valid && ac.Speed != null ? Math.round(ac.Speed) : "–";

      const tdHdg = row.insertCell(); tdHdg.className = "col-hdg";
      tdHdg.textContent = ac.Track != null ? `${Math.round(ac.Track)}°` : "–";

      const tdDist = row.insertCell(); tdDist.className = "col-dist";
      const nm = this._distNm(ac);
      tdDist.textContent = nm != null ? `${nm.toFixed(1)} nm` : "–";

      const tdBrg = row.insertCell(); tdBrg.className = "col-brg";
      tdBrg.textContent = ac.Bearing != null ? `${Math.round(ac.Bearing)}°` : "–";

      if (this.config.showSignal) {
        const tdSig = row.insertCell(); tdSig.className = "col-sig";
        tdSig.textContent = ac.SignalLevel != null ? `${ac.SignalLevel.toFixed(0)} dB` : "–";
      }
    });

    return table;
  },

  /* ------------------------------------------------------------------------
   * MAP RENDERING (Leaflet)
   * ---------------------------------------------------------------------- */
  _renderMap(list) {
    const mapDiv = document.getElementById("mmm-stratux-map");
    if (!mapDiv) return;

    // If map already exists, update markers only
    if (this.map) {
      this._updateMap(list);
      return;
    }

    // First-time initialization
    let centerLat = null;
    let centerLon = null;

    if (this.situation && this.situation.GPSLatitude && this.situation.GPSLongitude) {
      centerLat = this.situation.GPSLatitude;
      centerLon = this.situation.GPSLongitude;
    } else if (list.length > 0) {
      centerLat = list[0].Lat;
      centerLon = list[0].Lng;
    }

    if (centerLat == null || centerLon == null) return;

    this.map = L.map("mmm-stratux-map").setView([centerLat, centerLon], this.config.mapZoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18
    }).addTo(this.map);

    this.mapMarkers = { ownship: null, traffic: {} };

    this._updateMap(list);
  },

  _updateMap(list) {
    // Ownship
    if (this.situation && this.situation.GPSLatitude && this.situation.GPSLongitude) {
      const pos = [this.situation.GPSLatitude, this.situation.GPSLongitude];

      if (!this.mapMarkers.ownship) {
        const ownIcon = L.icon({
          iconUrl: "modules/MMM-Stratux/icons/ownship.svg",
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        this.mapMarkers.ownship = L.marker(pos, { icon: ownIcon }).addTo(this.map);
      } else {
        this.mapMarkers.ownship.setLatLng(pos);
      }
    }

    // Traffic
    const seen = new Set();

    list.forEach(ac => {
      if (ac.Lat == null || ac.Lng == null) return;

      const key = ac._key;
      const pos = [ac.Lat, ac.Lng];
      const track = ac.Track || 0;

      seen.add(key);

      if (!this.mapMarkers.traffic[key]) {
        const planeIcon = L.icon({
          iconUrl: "modules/MMM-Stratux/icons/plane-up.svg",
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker(pos, {
          icon: planeIcon,
          title: ac.Tail || key
        }).addTo(this.map);

        if (typeof marker.setRotationAngle === "function") {
          marker.setRotationAngle(track);
        }

        this.mapMarkers.traffic[key] = marker;
      } else {
        const marker = this.mapMarkers.traffic[key];
        marker.setLatLng(pos);

        if (typeof marker.setRotationAngle === "function") {
          marker.setRotationAngle(track);
        }
      }
    });

    // Remove stale markers
    Object.keys(this.mapMarkers.traffic).forEach(key => {
      if (!seen.has(key)) {
        this.map.removeLayer(this.mapMarkers.traffic[key]);
        delete this.mapMarkers.traffic[key];
      }
    });
  },

  _distNm(ac) {
    if (ac.Distance == null) return null;
    return ac.Distance / 6076.12;
  },

  _compassRose(deg) {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 45)];
  },

  getStyles() {
    return ["MMM-Stratux.css", "modules/MMM-Stratux/map/leaflet.css"];
  },

  getScripts() {
    return [
      "modules/MMM-Stratux/map/leaflet.js",
      "modules/MMM-Stratux/map/leaflet.rotatedMarker.js"
    ];
  }
});
