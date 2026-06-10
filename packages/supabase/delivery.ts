// Ray-casting algorithm to check if a point is inside a polygon
export function isPointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > lng) !== (yj > lng) && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function findDeliveryZone(zones: any[], lat: number, lng: number): any | null {
  return zones.find((zone) => isPointInPolygon(lat, lng, zone.coordinates || [])) || null;
}
