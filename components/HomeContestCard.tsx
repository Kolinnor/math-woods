import { Award, CalendarDays, Trophy } from "lucide-react";
import Link from "next/link";
import { tipImageObjectPosition } from "@/lib/tip-images";

export function HomeContestCard({
  contest,
  labels
}: {
  contest: {
    title: string;
    summary: string;
    imageUrl: string;
    imagePositionX: number;
    imagePositionY: number;
    deadline: string;
    rewardPoints: number;
    isOpen: boolean;
  };
  labels: {
    heading: string;
    deadline: string;
    points: string;
    action: string;
    upcoming: string;
  };
}) {
  return (
    <Link href="/contest" className="home-contest-card">
      <div>
        <p className="mw-kicker">{labels.heading}</p>
        <h2>{contest.title}</h2>
        <p>{contest.summary}</p>
        <div className="home-contest-meta">
          <span><CalendarDays size={17} /> {labels.deadline} {contest.deadline}</span>
          <span><Award size={17} /> {contest.rewardPoints} {labels.points}</span>
        </div>
        <span className="mw-primary-button">{contest.isOpen ? labels.action : labels.upcoming}</span>
      </div>
      <div className="home-contest-art" aria-hidden="true">
        <img
          src={contest.imageUrl}
          alt=""
          style={{ objectPosition: tipImageObjectPosition(contest.imagePositionX, contest.imagePositionY) }}
        />
        <Trophy size={34} />
      </div>
    </Link>
  );
}
