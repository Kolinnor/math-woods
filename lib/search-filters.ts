export function combineSearchFilters<T>(filters: Array<T | null | undefined | false>) {
  return {
    AND: filters.filter((filter): filter is T => Boolean(filter))
  };
}

export function searchFilterHref(
  pathname: string,
  currentQuery: string,
  name: string,
  value?: string
) {
  const params = new URLSearchParams(currentQuery);

  if (value) params.set(name, value);
  else params.delete(name);
  params.delete("page");

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
