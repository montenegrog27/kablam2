// lib/calculateShippingCost.ts

interface DeliverySettings {
  enabled: boolean;
  base_delivery_cost: number;
  price_per_km: number;
  free_shipping_radius: number;
  max_distance_km: number;
}

export function calculateShippingCost({
  distanceKm,
  settings,
}: {
  distanceKm: number;
  settings: DeliverySettings;
}) {
  if (!settings.enabled) return 0;

  if (
    settings.max_distance_km &&
    distanceKm > settings.max_distance_km
  ) {
    return null; // fuera de zona
  }

  if (
    settings.free_shipping_radius &&
    distanceKm <= settings.free_shipping_radius
  ) {
    return 0;
  }

return Math.ceil(
  settings.base_delivery_cost +
  distanceKm * settings.price_per_km
);
}