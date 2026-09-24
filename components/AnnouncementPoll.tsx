import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import { voteAnnouncementPollAction, setAnnouncementPollClosedAction } from "@/lib/actions/announcement-actions";
import { announcementPollCopy } from "@/lib/announcement-polls";

// Server component: neither voter identities nor unrevealed counts go to a client component.
export function AnnouncementPoll({ announcementId, question, closed, options, selectedOptionId, canManage, locale }: {
  announcementId: number;
  question: string;
  closed: boolean;
  options: { id: number; label: string; votes: number }[];
  selectedOptionId: number | null;
  canManage: boolean;
  locale: "fr" | "en";
}) {
  const copy = announcementPollCopy[locale];
  const total = options.reduce((sum, option) => sum + option.votes, 0);
  const showResults = closed || selectedOptionId !== null;
  const ballot = !closed && <ActionFeedbackForm action={voteAnnouncementPollAction.bind(null, announcementId, locale)} className="announcement-poll-ballot">
    <fieldset className="announcement-poll-choices">
      <legend className="sr-only">{question}</legend>
      {options.map(option => <label key={option.id} className="announcement-poll-choice">
        <input type="radio" name="optionId" value={option.id} defaultChecked={selectedOptionId === option.id} required />
        <span>{option.label}</span>
      </label>)}
    </fieldset>
    <button type="submit" className="secondary">{selectedOptionId === null ? copy.vote : copy.save}</button>
  </ActionFeedbackForm>;
  return <section className="announcement-poll" aria-labelledby={`announcement-poll-${announcementId}`}>
    <div className="announcement-poll-heading">
      <h3 id={`announcement-poll-${announcementId}`}>{question}</h3>
      {closed && <span className="content-language-badge">{copy.closed}</span>}
    </div>
    <p className="muted text-xs">{copy.rules}</p>
    {showResults ? <>
      <ul className="announcement-poll-results" aria-label={copy.results}>
        {options.map(option => {
          const percent = total ? Math.round(option.votes / total * 100) : 0;
          return <li key={option.id}>
            <div className="announcement-poll-result-label">
              <span>{option.label}{selectedOptionId === option.id && <strong className="announcement-poll-selected"> · {copy.selected}</strong>}</span>
              <span className="announcement-poll-count">{percent}% · {copy.votes(option.votes)}</span>
            </div>
            <div className="announcement-poll-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
          </li>;
        })}
      </ul>
      <p className="muted text-sm" role="status">{copy.votes(total)}</p>
      {!closed && <details className="announcement-poll-change"><summary>{copy.change}</summary>{ballot}</details>}
    </> : ballot}
    {canManage && <ActionFeedbackForm action={setAnnouncementPollClosedAction.bind(null, announcementId, !closed, locale)} className="announcement-poll-manage">
      <button type="submit" className="secondary">{closed ? copy.reopen : copy.close}</button>
    </ActionFeedbackForm>}
  </section>;
}
