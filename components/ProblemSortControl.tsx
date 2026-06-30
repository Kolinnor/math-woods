"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SortOption = {
  value: string;
  label: string;
};

type ProblemSortControlProps = {
  value: string;
  options: SortOption[];
};

export function ProblemSortControl({ value, options }: ProblemSortControlProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateSort(nextValue: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("page");

    if (nextValue === "newest") {
      nextParams.delete("sort");
    } else {
      nextParams.set("sort", nextValue);
    }

    const query = nextParams.toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as never, { scroll: false });
  }

  return (
    <label className="problems-ledger-sort">
      <span>Sort:</span>
      <select aria-label="Sort problems" onChange={(event) => updateSort(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
