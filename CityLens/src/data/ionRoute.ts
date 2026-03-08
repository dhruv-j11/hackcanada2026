export const ionLineGeoJSON: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-80.5416, 43.4980],
          [-80.5384, 43.4919],
          [-80.5350, 43.4833],
          [-80.5283, 43.4731],
          [-80.5222, 43.4673],
          [-80.5190, 43.4630],
          [-80.5155, 43.4565],
          [-80.4980, 43.4510],
          [-80.4908, 43.4472],
          [-80.4860, 43.4430],
          [-80.4750, 43.4340],
        ]
      },
      properties: {}
    }
  ]
};

export const ionStationsGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: 'FeatureCollection',
  features: ionLineGeoJSON.features[0].geometry.coordinates.map(coord => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: coord
    },
    properties: {}
  }))
};

export const highlightZoneGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-80.5220, 43.4685],
          [-80.5190, 43.4685],  
          [-80.5190, 43.4665],
          [-80.5220, 43.4665],
          [-80.5220, 43.4685] // Close the polygon
        ]]
      },
      properties: {}
    }
  ]
};
