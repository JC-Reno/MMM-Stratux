/* MagicMirror²
 * Module: MMM-Stratux
 * Description: Displays live ADS-B traffic data from a local Stratux receiver.
 *
 * Stratux WebSocket: ws://<host>/traffic  (one JSON frame per aircraft update)
 * Stratux REST:      http://<host>/getStatus, http://<host>/getSituation
 *
 * MIT Licensed.
 */

Module.register("MMM-Stratux", {

  /* -- Default configuration ----------------------------------------------- */
  defaults: {
    stratuxHost: "192.168.1.249",   // IP / hostname of the Stratux device
    maxAircraft: 10,               // Max rows shown in the table
    staleSeconds: 30,               // Grey-out aircraft older than this
    pruneSeconds: 60,               // Remove aircraft older than this
    statusPollMs: 5000,             // How often to poll /getStatus
    maxDistanceNm: 0,                // 0 = show all; otherwise filter by NM
    showOnGround: false,            // Include aircraft flagged OnGround
    showSignal: false,            // Show signal-strength column
    sortBy: "distance",       // "distance" | "altitude" | "tail"
    updateInterval: 1000,             // DOM refresh interval (ms)
    distanceUnit: "nm",             // "nm" (nautical miles) or "mi" (statute)
    altitudeUnit: "ft",             // "ft" or "m"

    // Map options
    showMap: true,
    mapZoom: 9
  },

  /* -- Module lifecycle ---------------------------------------------------- */
  start() {
    Log.info(`${this.name}: Starting…`);
    this.aircraft = {};   // keyed by ICAO hex string
    this.status = null; // /getStatus payload
    this.situation = null; // /getSituation payload
    this.connected = false;
    this.lastUpdate = null;

    // Map state
    this.map = null;
    this.mapMarkers = { ownship: null, traffic: {} };

    this.sendSocketNotification("STRATUX_CONNECT", {
      host: this.config.stratuxHost,
      statusPollMs: this.config.statusPollMs,
      pruneSeconds: this.config.pruneSeconds,
    });

    // Trigger a DOM refresh on a fixed cadence so elapsed-time indicators stay live.
    setInterval(() => this.updateDom(0), this.config.updateInterval);
  },

  /* -- Socket messages from node_helper ------------------------------------ */
  socketNotificationReceived(notification, payload) {
    switch (notification) {
      case "STRATUX_CONNECTED":
        this.connected = true;
        this.updateDom();
        break;

      case "STRATUX_DISCONNECTED":
        this.connected = false;
        this.updateDom();
        break;

      case "STRATUX_TRAFFIC":
        // payload is a single aircraft object from the WebSocket frame
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
        // node_helper removed stale keys; mirror the removal
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

  /* -- DOM builder ---------------------------------------------------------- */
  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-stratux-wrapper";

    wrapper.appendChild(this._buildHeader());

    if (!this.connected) {
      const msg = document.createElement("div");
      msg.className = "mmm-stratux-offline";
      msg.textContent = `Connecting to Stratux at ${this.config.stratuxHost}…`;
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

    // Map ABOVE the table
    if (this.config.showMap) {
      const mapDiv = document.createElement("div");
      mapDiv.id = "mmm-stratux-map";
      mapDiv.className = "mmm-stratux-map";
      wrapper.appendChild(mapDiv);
      setTimeout(() => this._renderMap(list), 0);
    }

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
      meta.textContent = `${gps} • ${uat} • ${es} • ${acCt} target${acCt !== 1 ? "s" : ""}`;
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

      // Tail / ICAO
      const tail = ac.Tail && ac.Tail.trim() ? ac.Tail.trim() : ac._key;
      const tdId = row.insertCell(); tdId.className = "col-tail";
      tdId.textContent = tail;

      // Altitude
      const tdAlt = row.insertCell(); tdAlt.className = "col-alt";
      tdAlt.textContent = this.config.altitudeUnit === "m"
        ? (ac.Alt != null ? `${Math.round(ac.Alt * 0.3048).toLocaleString()} m` : "–")
        : (ac.Alt != null ? ac
