/* MagicMirror�
 * Module: MMM-Stratux � node_helper.js
 * MIT Licensed.
 */

"use strict";

const NodeHelper = require("node_helper");
const WebSocket = require("ws");
const http = require("http");

module.exports = NodeHelper.create({

  ws: null, config: null,
  reconnectTimer: null, statusTimer: null, pruneTimer: null,
  aircraft: {},
  reconnectDelay: 2000,
  MAX_RECONNECT: 30000,

  start() { console.log(`[${this.name}] Helper started.`); },
  stop() { this._cleanup(); },

  socketNotificationReceived(notification, payload) {
    if (notification === "STRATUX_CONNECT") {
      this.config = payload;
      this._cleanup();
      this._connect();
      this._startStatusPoller();
      this._startPruner();
    }
  },

  _connect() {
    const url = `ws://${this.config.host}/traffic`;
    console.log(`[${this.name}] Connecting to ${url}`);

    try { this.ws = new WebSocket(url, { handshakeTimeout: 6000 }); }
    catch (err) { console.error(`[${this.name}] WS error:`, err.message); this._scheduleReconnect(); return; }

    this.ws.on("open", () => {
      console.log(`[${this.name}] Connected.`);
      this.reconnectDelay = 2000;
      this.sendSocketNotification("STRATUX_CONNECTED", {});
    });

    this.ws.on("message", (data) => {
      let ac;
      try { ac = JSON.parse(data.toString()); } catch { return; }
      if (ac && ac.Icao_addr != null) {
        const key = ac.Icao_addr.toString(16).toUpperCase().padStart(6, "0");
        this.aircraft[key] = { _receivedAt: Date.now() };
        this.sendSocketNotification("STRATUX_TRAFFIC", ac);
      }
    });

    this.ws.on("error", err => console.error(`[${this.name}] WS error:`, err.message));
    this.ws.on("close", () => {
      this.sendSocketNotification("STRATUX_DISCONNECTED", {});
      this._scheduleReconnect();
    });
  },

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this._connect(); }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.MAX_RECONNECT);
  },

  _startStatusPoller() {
    if (this.statusTimer) clearInterval(this.statusTimer);
    const poll = () => {
      this._fetchJson("/getStatus", "STRATUX_STATUS");
      this._fetchJson("/getSituation", "STRATUX_SITUATION");
    };
    poll();
    this.statusTimer = setInterval(poll, this.config.statusPollMs || 5000);
  },

  _fetchJson(path, notification) {
    const req = http.request(
      { hostname: this.config.host, port: 80, path, method: "GET", timeout: 4000 },
      res => {
        let body = "";
        res.on("data", c => { body += c; });
        res.on("end", () => {
          try { this.sendSocketNotification(notification, JSON.parse(body)); }
          catch { console.warn(`[${this.name}] Bad JSON from ${path}`); }
        });
      }
    );
    req.on("error", err => console.debug(`[${this.name}] HTTP ${path}: ${err.message}`));
    req.on("timeout", () => req.destroy());
    req.end();
  },

  _startPruner() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    const pruneMs = (this.config.pruneSeconds || 60) * 1000;
    this.pruneTimer = setInterval(() => {
      const now = Date.now(), pruned = [];
      for (const [key, meta] of Object.entries(this.aircraft)) {
        if (now - meta._receivedAt > pruneMs) { delete this.aircraft[key]; pruned.push(key); }
      }
      if (pruned.length) this.sendSocketNotification("STRATUX_PRUNED", pruned);
    }, 10000);
  },

  _cleanup() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.statusTimer) { clearInterval(this.statusTimer); this.statusTimer = null; }
    if (this.pruneTimer) { clearInterval(this.pruneTimer); this.pruneTimer = null; }
    if (this.ws) { this.ws.removeAllListeners(); try { this.ws.terminate(); } catch { } this.ws = null; }
    this.aircraft = {}; this.reconnectDelay = 2000;
  },
});

