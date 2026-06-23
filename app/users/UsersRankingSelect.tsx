"use client";

import { useRouter } from "next/navigation";

type RankingOption = {
  value: string;
  label: string;
};

export function UsersRankingSelect({
  options,
  value
}: {
  options: RankingOption[];
  value: string;
}) {
  const router = useRouter();

  return (
    <label className="users-sort-form">
      <span className="sr-only">Ranking mode</span>
      <select
        name="sort"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          router.push(nextValue === "reputation" ? "/users" : `/users?sort=${encodeURIComponent(nextValue)}`);
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
