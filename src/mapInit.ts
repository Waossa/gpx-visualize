import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export function createMap(containerId: string): maplibregl.Map {
  const map = new maplibregl.Map({
    container: containerId,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
    center: [25.5, 62.0], // Finland
    zoom: 6,
    pitch: 0,
    bearing: 0,
  });

  // Enable smoother zoom transitions
  map.easeTo({ duration: 500 });
  return map;
}
