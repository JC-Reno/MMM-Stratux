{
  module: "MMM-Stratux",
    position: "top_right",
      config: {
    stratuxHost: "192.168.1.249",
      maxAircraft: 10,
        staleSeconds: 30,
          pruneSeconds: 60,
            statusPollMs: 5000,
              maxDistanceNm: 0,        // 0 = show everything
                showOnGround: false,
                  showSignal: false,
                    sortBy: "distance",
                      distanceUnit: "nm",
                        altitudeUnit: "ft",

                          // map options
                          showMap: true,
                            mapZoom: 9,
                              pollIntervalMs: 2000      // REST poll interval for traffic
  }
},
