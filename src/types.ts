export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface RideMeta {
  id: string;                     // same as GPX filename stem
  bbox: BoundingBox;
  paths: {
    full: string;                  // relative URL to full‑resolution GeoJSON
    medium: string;
    coarse: string;
  };
}