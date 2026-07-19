import { MathDomain, UserMathLevel } from "@prisma/client";
import { Handshake, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { domainLabel } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import {
  filterMathematicians,
  mathematicianContributionCount,
  parseMathematicianDomain,
  parseMathematicianLevel,
  parseMathematicianSort,
  sortMathematicians,
  type MathematicianSort
} from "@/lib/mathematicians";
import { getReputationLeaderboard } from "@/lib/user-reputation";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("") || "M";
}

export default async function MathematiciansPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; domain?: string; level?: string; sort?: string; collaboration?: string }>;
}) {
  const t = await getTranslations();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const domain = parseMathematicianDomain(params.domain);
  const level = parseMathematicianLevel(params.level);
  const sort = parseMathematicianSort(params.sort);
  const collaborationOnly = params.collaboration === "true";
  const mathematicians = sortMathematicians(filterMathematicians(await getReputationLeaderboard(), {
    query,
    domain,
    level,
    collaborationOnly
  }), sort);
  const hasFilters = Boolean(query || domain || level || collaborationOnly || params.sort);
  const sortOptions: Array<{ value: MathematicianSort; label: string }> = [
    { value: "reputation", label: t.mathematicians.sort.reputation },
    { value: "contributions", label: t.mathematicians.sort.contributions },
    { value: "problems", label: t.mathematicians.sort.problems },
    { value: "newest", label: t.mathematicians.sort.newest },
    { value: "name", label: t.mathematicians.sort.name }
  ];

  return (
    <ForestPageLayout
      title={t.mathematicians.title}
      eyebrow={t.mathematicians.community}
      heroImage="/art/users-forest.webp"
      heroAlt="Ivan Shishkin, The Forest Clearing"
      description={t.mathematicians.description}
      meta={<p>{t.mathematicians.results(mathematicians.length)}</p>}
    >
      <form className="mathematician-filters" method="get">
        <label className="mathematician-search-field">
          <span>{t.mathematicians.search}</span>
          <div><Search size={16} aria-hidden="true" /><input name="q" defaultValue={query} placeholder={t.mathematicians.searchPlaceholder} /></div>
        </label>
        <label>
          <span>{t.mathematicians.domain}</span>
          <select name="domain" defaultValue={domain ?? ""}>
            <option value="">{t.mathematicians.allDomains}</option>
            {Object.values(MathDomain).map((value) => <option key={value} value={value}>{t.home.domainLabels[value] ?? domainLabel(value)}</option>)}
          </select>
        </label>
        <label>
          <span>{t.mathematicians.level}</span>
          <select name="level" defaultValue={level ?? ""}>
            <option value="">{t.mathematicians.allLevels}</option>
            {Object.values(UserMathLevel).map((value) => <option key={value} value={value}>{t.auth.mathLevels[value]}</option>)}
          </select>
        </label>
        <label>
          <span>{t.mathematicians.sortLabel}</span>
          <select name="sort" defaultValue={sort}>
            {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="mathematician-collaboration-filter">
          <input type="checkbox" name="collaboration" value="true" defaultChecked={collaborationOnly} />
          <span>{t.mathematicians.collaborationOnly}</span>
        </label>
        <div className="mathematician-filter-actions">
          <button type="submit"><Search size={16} /> {t.common.search}</button>
          {hasFilters && <Link href="/mathematicians" className="button secondary">{t.mathematicians.clear}</Link>}
        </div>
      </form>

      <p className="result-summary">{t.mathematicians.results(mathematicians.length)}</p>
      <div className="mathematician-directory">
        {mathematicians.map((user) => {
          const name = displayNameForUser(user);
          const contributions = mathematicianContributionCount(user);
          return (
            <article className="mathematician-row" key={user.userId}>
              <Link className="mathematician-identity" href={`/profile/${user.username}`}>
                <span className="mathematician-avatar" aria-hidden="true">{initials(name)}</span>
                <span>
                  <strong>{name}</strong>
                  <small>@{user.username}</small>
                </span>
              </Link>
              <div className="mathematician-summary">
                <div className="mathematician-byline">
                  {user.affiliation && <span>{user.affiliation}</span>}
                  {user.role !== "USER" && <span className="mathematician-trusted"><ShieldCheck size={14} /> {t.users.roles[user.role]}</span>}
                  {user.openToCollaboration && <span className="mathematician-collaboration"><Handshake size={14} /> {t.mathematicians.openToCollaboration}</span>}
                </div>
                <p>{user.bio || t.mathematicians.noIntroduction}</p>
                {user.mathematicalDomains.length > 0 && (
                  <div className="mathematician-domains">
                    {user.mathematicalDomains.map((value) => <span className="tag" key={value}>{t.home.domainLabels[value] ?? domainLabel(value)}</span>)}
                  </div>
                )}
              </div>
              <div className="mathematician-stats">
                <span><strong>{contributions}</strong><small>{t.mathematicians.contributions}</small></span>
                <span><strong>{user.reputation}</strong><small>{t.users.stats.reputation}</small></span>
                <span><strong>{user.problemCount}</strong><small>{t.users.stats.problems}</small></span>
              </div>
            </article>
          );
        })}
        {mathematicians.length === 0 && <p className="empty-state">{t.mathematicians.noResults}</p>}
      </div>
    </ForestPageLayout>
  );
}
