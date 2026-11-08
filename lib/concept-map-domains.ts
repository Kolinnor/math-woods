export type MapDomainMembership = { domain: number[]; secondaryDomains?: Record<number, number[]> };

/** A concept stays visible whenever at least one of its domains is selected. */
export function conceptMapDomainHidden(data: MapDomainMembership, index: number, hidden: ReadonlySet<number>) {
  return hidden.has(data.domain[index]) && (data.secondaryDomains?.[index] ?? []).every(domain => hidden.has(domain));
}
