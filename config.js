{
  module: "MMM-StratuxTrafficWeather",
    position: "top_right",
      config: {
    stratuxHost: "192.168.10.1",
      stratuxPort: 80,
        pollIntervalMs: 5000,
          maxRangeNm: 50,
            minAltitudeFt: 0,
              showOwnship: true,
                units: "imperial", // or "metric"
                  displayMode: "table", // "compact", "table", or "map"
                    showWeather: true,
                      showTraffic: true
  }
}
