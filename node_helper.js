/* node_helper.js */

const NodeHelper = require("node_helper");
const fetch = require("node-fetch");

module.exports = NodeHelper.create({
  start() {
    this.config = null;
    this.timer = null;
    this.backoffMs = 0;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "STRATUX_CONFIG") {
      this.config = payload;
      this.startPolling();
    }
  },

  startPolling() {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      this.pollStratux();
    }, this.config.pollIntervalMs);
  },

  async pollStratux() {
    const base = `http://${this.config.stratuxHost}:${this.config.stratuxPort}`;

    try {
      const [traffic, weather, gps, ahrs, situation] = await Promise.all([
        this.fetchJson(`${base}/getTraffic`),
        this.fetchJson(`${base}/getWeather`),
        this.fetchJson(`${base}/getGPS`),
        this.fetchJson(`${base}/getAHRS`),
        this.fetchJson(`${base}/getSituation`)
      ]);

      const normalizedTraffic = this.normalizeTraffic(traffic || []);
      const normalizedWeather = this.normalizeWeather(weather || {});
      const normalizedGps = this.normalizeGps(gps || {});
      const normalizedAhrs = ahrs || null;
      const normalizedSituation = situation || null;

      this.sendSocketNotification("STRATUX_DATA", {
        traffic: normalizedTraffic,
        weather: normalizedWeather,
        gps: normalizedGps,
        ahrs: normalizedAhrs,
        situation: normalizedSituation
      });

      this.backoffMs = 0;
    } catch (err) {
      console.error("Stratux poll error:", err);

      this.backoffMs = Math.min(
        this.backoffMs === 0 ? 2000 : this.backoffMs * 2,
        60000
      );

      setTimeout(() => this.pollStratux(), this.backoffMs);
    }
  },

  async fetchJson(url) {
    const res = await fetch(url, { timeout: 4000 });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  },

  normalizeTraffic(raw) {
    if (!Array.isArray(raw)) return [];

    return raw
      .map(ac => ({
        Icao_addr: ac.Icao_addr || ac.icao || "",
        Callsign: ac.Callsign || ac.callsign || "",
        Altitude: ac.Altitude || ac.altitude || 0,
        Speed: ac.Speed || ac.speed || 0,
        Lat: ac.Lat || ac.lat || 0,
        Lon: ac.Lon || ac.lon || 0,
        Category: ac.Category || ac.category || ""
      }))
      .filter(ac => {
        if (!ac.Lat || !ac.Lon) return false;
        if (ac.Altitude < this.config.minAltitudeFt) return false;
        return true;
      });
  },

  normalizeWeather(raw) {
    if (!raw) return {};

    return {
      METAR: raw.METAR || raw.metar || null,
      TAF: raw.TAF || raw.taf || null,
      Station: raw.Station || raw.station || null,
      TempC: raw.TempC || raw.tempC || null,
      Wind: raw.Wind || raw.wind || null,
      Visibility: raw.Visibility || raw.visibility || null
    };
  },

  normalizeGps(raw) {
    if (!raw) return null;

    return {
      lat: raw.Lat || raw.lat || 0,
      lon: raw.Lon || raw.lon || 0,
      altitude: raw.Altitude || raw.altitude || 0,
      groundspeed: raw.GroundSpeed || raw.groundspeed || 0
    };
  }
});
