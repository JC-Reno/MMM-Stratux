{
  module: "MMM-Stratux",
    position: "top_right",

      config: {
    stratuxHost: "192.168.1.249",   // your Stratux IP
      maxAircraft: 10,                // max rows in table
        staleSeconds: 30,                // dim aircraft after 30s
          pruneSeconds: 60,                // remove aircraft after 60s
            statusPollMs: 5000,              // /getStatus + /getSituation poll
              maxDistanceNm: 0,                 // 0 = show all
                showOnGround: false,             // hide ground targets
                  showSignal: false,             // hide signal column
                    sortBy: "distance",        // distance | altitude | tail
                      distanceUnit: "nm",              // nm or mi
                        altitudeUnit: "ft",              // ft or m

                          // ⭐ Map options (now supported)
                          showMap: true,              // enableNSO map
                            mapZoom: 9                  // default zoom level
  }
},
