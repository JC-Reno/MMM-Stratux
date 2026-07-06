/* MagicMirror²
 * Module: MMM-Stratux — node_helper.js (REST polling)
 * MIT Licensed.
 */

"use strict";

const NodeHelper = require("node_helper");
const fetch = require("node-fetch");

module.exports = NodeHelper.create({

  config: null,
  pollTimer: null,
  statusTimer: null,
  connected: false,

  start() {
    console.log(`[${this.name}] REST helper started.`);
  },

  stop() {
    this._cleanup();
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "STRATUX_CONFIG") {
      this.config = payload;
      this._cleanup();
      this._startPolling();
      this._startStatusPolling();
    }
  },

  _startPolling() {
    if (!this.config) return;
    if (this.pollTimer) clearInterval(this.pollTimer);

    const interval = this.config.pollIntervalMs || 2000;

    const poll = async () => {
      try {
        const base = `http://${this.config.stratuxHost}`;
        const traffic = await this._fetchJson(`${base}/getTraffic`);
        const situation = await this._fetchJson(`${base}/getSituation`);

        this.connected = true;
        this.sendSocketNotification("STRATUX_CONNECTED", {});

        const normalizedTraffic = this._normalizeTraffic(traffic || []);
        const normalizedSituation = situation || null;

        this.sendSocketNotification("STRATUX_TRAFFIC_BULK", {
          traffic: normalizedTraffic,
          situation: normalizedSituation
        });
      } catch (err) {
        console.error(`[${this.name}] Traffic poll error:`, err.message);
        if (this.connected) {
          this.connected = false;
          this.sendSocketNotification("STRATUX_DISCONNECTED", {});
        }
      }
    };

    poll();
    this.pollTimer = setInterval(poll, interval);
  },

  _startStatusPolling() {
    if (!this.config) return;
    if (this.statusTimer) clearInterval(this.statusTimer);

    const interval = this.config.statusPollMs || 5000;

    const pollStatus = async () => {
      try {
        const base = `http://${this.config.stratuxHost}`;
        const status = await this._fetchJson(`${base}/getStatus`);
        this.sendSocketNotification("STRATUX_STATUS", status || null);
      } catch (err) {
        console.error(`[${this.name}] Status poll error:`, err.message);
      }
    };

    pollStatus();
    this.statusTimer = setInterval(pollStatus, interval);
  },

  async _fetchJson(url) {
    const res = await fetch(url, { timeout: 4000 });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  },

  _normalizeTraffic(raw) {
    if (!Array.isArray(raw)) return [];

    return raw.map(ac => ({
      Icao_addr: ac.Icao_addr || ac.icao || null,
      Tail: ac.Tail || ac.tail || "",
      Alt: ac.Alt || ac.alt || 0,
      Vvel: ac.Vvel || ac.vvel || 0,
      Speed: ac.Speed || ac.speed || 0,
      Speed_valid: ac.Speed_valid ?? true,
      Track: ac.Track || ac.track || 0,
      Lat: ac.Lat || ac.lat || null,
      Lon: ac.Lon || ac.lon || null,
      Distance: ac.Distance || ac.distance || null,
      Bearing: ac.Bearing || ac.bearing || null,
      OnGround: ac.OnGround || ac.onGround || false,
      Position_valid: ac.Position_valid ?? (ac.Lat != null && ac.Lon != null),
      Squawk: ac.Squawk || ac.squawk || null,
      SignalLevel: ac.SignalLevel || ac.signalLevel || null
    }));
  },

  _cleanup() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.statusTimer) { clearInterval(this.statusTimer); this.statusTimer = null; }
  }
});
