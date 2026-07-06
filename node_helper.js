/* MagicMirror²
 * Module: MMM-Stratux — node_helper.js (WebSocket)
 */

"use strict";

const NodeHelper = require("node_helper");
const WebSocket = require("ws");
const fetch = require("node-fetch");

module.exports = NodeHelper.create({

  ws: null,
  statusTimer: null,
  pruneTimer: null,
  aircraft: {},

  start() {
    console.log("[MMM-Stratux] node_helper started.");
  },

  stop() {
    this._cleanup();
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "STRATUX_CONNECT") {
      this.host = payload.host;
      this.statusPollMs = payload.statusPollMs;
      this.pruneSeconds = payload.pruneSeconds;

      this._cleanup();
      this._connectWebSocket();
      this._startStatusPolling();
      this._startPruneTimer();
    }
  },

  _connectWebSocket() {
    const url = `ws://${this.host}/traffic`;
    console.log("[MMM-Stratux] Connecting WebSocket:", url);

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[MMM-Stratux] WebSocket connected.");
      this.sendSocketNotification("STRATUX_CONNECTED", {});
    });

    this.ws.on("message", msg => {
      try {
        const ac = JSON.parse(msg);
        this.sendSocketNotification("STRATUX_TRAFFIC", ac);
      } catch (err) {
        console.error("[MMM-Stratux] WS JSON error:", err);
      }
    });

    this.ws.on("close", () => {
      console.log("[MMM-Stratux] WebSocket closed.");
      this.sendSocketNotification("STRATUX_DISCONNECTED", {});
      setTimeout(() => this._connectWebSocket(), 3000);
    });

    this.ws.on("error", err => {
      console.error("[MMM-Stratux] WebSocket error:", err);
    });
  },

  _startStatusPolling() {
    if (this.statusTimer) clearInterval(this.statusTimer);

    const poll = async () => {
      try {
        const url = `http://${this.host}/getStatus`;
        const res = await fetch(url);
        const json = await res.json();
        this.sendSocketNotification("STRATUX_STATUS", json);
      } catch (err) {
        console.error("[MMM-Stratux] Status poll error:", err);
      }
    };

    poll();
    this.statusTimer = setInterval(poll, this.statusPollMs);
  },

  _startPruneTimer() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);

    this.pruneTimer = setInterval(() => {
      const now = Date.now();
      const removed = [];

      Object.keys(this.aircraft).forEach(key => {
        const ac = this.aircraft[key];
        if (now - (ac._receivedAt || 0) > this.pruneSeconds * 1000) {
          removed.push(key);
          delete this.aircraft[key];
        }
      });

      if (removed.length > 0) {
        this.sendSocketNotification("STRATUX_PRUNED", removed);
      }
    }, 5000);
  },

  _cleanup() {
    if (this.ws) {
      try { this.ws.close(); } catch { }
      this.ws = null;
    }
    if (this.statusTimer) clearInterval(this.statusTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
  }
});
