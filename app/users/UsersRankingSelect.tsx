"use client";

import { useRouter, useSearchParams } from "next/navigation";

type RankingOption = {
  value: string;
  label: string;
};

export function UsersRankingSelect({
  options,
  value,
  label
}: {
  options: RankingOption[];
  value: string;
  label: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <label className="users-sort-form">
      <span className="sr-only">{label}</span>
      <select
        name="sort"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          const nextParams = new URLSearchParams(searchParams.toString());
          nextParams.delete("page");
          if (nextValue === "reputation") nextParams.delete("sort");
          else nextParams.set("sort", nextValue);
          const query = nextParams.toString();
          router.push(query ? `/users?${query}` : "/users");
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
