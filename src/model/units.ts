export type Units = 'metric' | 'imperial';

export function formatHeight(metres: number, units: Units): string {
  if (units === 'metric') return `${Math.round(metres * 100)} cm`;
  const inches = Math.round(metres / 0.0254);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}

export function formatDistance(metres: number, units: Units): string {
  if (units === 'metric') return `${metres.toFixed(2)} m`;
  const inches = Math.round(Math.abs(metres) / 0.0254);
  return `${metres < 0 ? '−' : ''}${Math.floor(inches / 12)}′ ${inches % 12}″`;
}
