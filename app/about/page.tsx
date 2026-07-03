import Link from "next/link";

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="faq-item">
      <summary>{question}</summary>
      <div className="faq-answer">{children}</div>
    </details>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <section className="about-promise">
        <p className="about-eyebrow">Math Woods' first promise</p>
        <h1>Free forever. No ads.</h1>
      </section>

      <section className="about-principles">
        <div>
          <h2>Open by design</h2>
          <p>The code, public pages, revisions, and exports should be easy to inspect and reuse.</p>
        </div>
        <div>
          <h2>People remain responsible</h2>
          <p>Tools can help. A person still has to understand, check, source, and stand behind each contribution.</p>
        </div>
        <div>
          <h2>Respect the source</h2>
          <p>Ideas travel. Wording, attribution, and permission still matter.</p>
        </div>
      </section>

      <section className="about-credit">
        <p className="about-eyebrow">How this site was made</p>
        <h2>Built with Codex, under human direction.</h2>
        <p>
          Math Woods was coded with help from Codex, an AI coding agent by OpenAI, under human direction and review.
          The published site remains a human responsibility.
        </p>
      </section>

      <section className="about-section">
        <h2>Mission and funding</h2>
        <Faq question="How can the site be funded without ads or subscriptions?">
          <p>
            The website will work with donations. Thank you for your support, which allows the site to continue existing !
          </p>
        </Faq>
      </section>

      <section className="about-section" id="licensing">
        <h2>Licensing, reuse, and forks</h2>
        <Faq question="What license applies to the Math Woods software?">
          <p>
            The application code is licensed under{" "}
            <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noopener noreferrer">
              GNU AGPL-3.0-or-later
            </a>
            . This means people may study, modify, fork, and host the software, but operators of modified public
            versions must make the corresponding source code available to their users under the same license.
          </p>
        </Faq>
        <Faq question="What license applies to Math Woods educational content?">
          <p>
            Unless otherwise stated, Math Woods educational content, including problems, solutions, explanations, notes,
            and learning resources, is licensed under{" "}
            <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" rel="noopener noreferrer">
              CC BY-NC-SA 4.0
            </a>
            . This allows non-commercial educational reuse with attribution, provided adaptations are shared under the
            same license.
          </p>
        </Faq>
        <Faq question="Can someone make money from Math Woods content?">
          <p>
            Not without permission. The CC BY-NC-SA 4.0 content license does not allow commercial reuse of Math Woods
            educational content. Services mainly intended to generate revenue, advertising income, commercial leads,
            paid tutoring, course sales, subscriptions, or commercial alternatives to Math Woods need written
            permission, even if initial access is free.
          </p>
        </Faq>
        <Faq question="Can teachers, students, or creators use Math Woods problems in lessons or videos?">
          <p>
            Yes. Math Woods gives additional permission for teachers, students, educational creators, and educational
            projects to use a small number of Math Woods problems in classes, videos, streams, notes, or learning
            materials, including on platforms that may be monetized, as long as they credit Math Woods, do not
            republish a substantial part of the problem bank, and do not present the content as their own database.
          </p>
        </Faq>
        <Faq question="Why use the AGPL for the software?">
          <p>
            The AGPL says that a public modified version of the site must make its corresponding source available to
            its users.
          </p>
        </Faq>
        <Faq question="Can someone fork Math Woods?">
          <p>
            Yes. Forks of the software are allowed under the AGPL. Forks must follow the AGPL terms, keep required
            notices, and make the corresponding source code available when they operate a modified public version.
          </p>
        </Faq>
        <Faq question="Can forks use the Math Woods name or logo?">
          <p>
            No. The Math Woods name, logo, domain, and visual identity are protected separately. Unofficial forks or
            services may not use them in a way that suggests they are official or endorsed.
          </p>
        </Faq>
        <Faq question="Who owns user-submitted content?">
          <p>
            Contributors keep responsibility for what they submit. By contributing public content to Math Woods, they
            confirm that they have the right to publish it and agree that it may be distributed under the Math Woods
            content license.
          </p>
        </Faq>
        <Faq question="Can users export their work?">
          <p>
            Yes. Public content and personal work should remain portable through Markdown and other simple formats.
            Personal account data is not public encyclopedia content and should never be included in public exports or datasets.
          </p>
        </Faq>
      </section>

      <section className="about-section">
        <h2>Books, contests, and problem origins</h2>
        <Faq question="Can I copy a problem directly from a book?">
          <p>
            Usually not. Do not copy a book’s wording unless the material is genuinely in the public domain or the
            rights holder has granted suitable permission. Buying or owning a book does not grant republication rights.
          </p>
        </Faq>
        <Faq question="What content should not be copied into Math Woods?">
          <p>
            Users must not copy problem statements, solutions, explanations, books, paid problem sets, contest material,
            or website content unless reuse is clearly permitted. Reports of copied or poorly sourced content should be
            reviewed, and questionable content may be hidden or removed during review.
          </p>
        </Faq>
        <Faq question="Should problems be reformulated?">
          <p>
            Yes. Prefer an independent, clear reformulation written from your own understanding of the mathematical
            idea. If possible, it is good to record the origin of the problem. A
            reformulation should improve clarity and preserve attribution, not disguise copying.
          </p>
        </Faq>
        <Faq question="Is reformulation always enough to avoid copyright issues?">
          <p>
            No. Mathematical ideas and facts are different from a source’s particular expression, but a rewrite that
            remains too close may still be problematic. Some collections also have specific terms of use. When in doubt,
            link to the source, write a genuinely independent problem, or leave it unpublished until permission is clear.
          </p>
        </Faq>
        <Faq question="What about olympiad and competition problems?">
          <p>
            Treat them like any other published material. Check the organizer’s reuse policy before reproducing the
            official wording. When allowed, identify the competition, year, round, and problem number. Otherwise, prefer
            an independently worded variation and keep a transparent origin note.
          </p>
        </Faq>
        <Faq question="What if the origin is unknown?">
          <p>
            Use <strong>Unknown</strong> and explain what is known in the provenance note. 
          </p>
        </Faq>
        <Faq question="Can a problem inspired by another problem be published?">
          <p>
            Yes, when it is a genuinely new expression or variation and the relationship is documented. Mention the
            inspiration and describe important changes.
          </p>
        </Faq>
      </section>

      <section className="about-section" id="creating-problems">
        <h2>Creating problems</h2>
        <Faq question="What kind of problem statement works well here?">
          <p>
            We do not want to restrict the kind of problem statements that can be submitted here. However, we note that sometimes, the best version of a problem is in an "open question" form : <em>does there exist</em> an object with this property?{" "}
            <em>Which examples are possible</em>? "Show that no such function exists" may be equivalent, but it gives
            away the direction too early.
          </p>
        </Faq>
        <Faq question="Does a problem statement have to be the most direct formulation?">
          <p>
            Not always. A good statement can sometimes invite a plausible wrong first idea, as long as the wording is
            honest and mathematically precise. For example, asking when the even number <span>{"$2n$"}</span> is
            divisible by both <span>{"$n$"}</span> and <span>{"$n-1$"}</span> can be more interesting than immediately
            naming the hidden condition. The point is not to trick readers with ambiguity, but to let them discover
            which details matter.
          </p>
        </Faq>
        <Faq question="How should I title a problem?">
          <p>
            Prefer a short, descriptive title. Sentence case usually looks better than capitalizing every word. Avoid
            putting formulas directly in the title; put the mathematics in the statement instead. The title can stay
            plain.
          </p>
        </Faq>
        <Faq question="Do new problems need to be polished?">
          <p>
            Although we value high quality to problems, contrary to websites such as Stack Exchange, there is no hard rule to enforce that new problems are immediately polished. We want people to be able to rely on the community to improve and filter problems over time.
          </p>
        </Faq>
        <Faq question="How should I use the difficulty score?">
          <p>
            The 1-100 score is a rough signal. Difficulty depends heavily on what the reader already knows, how
            recently they saw the topic, and whether the problem uses a familiar trick. As a loose convention:
            1-10 is pre-university or warm-up material; 11-25 is early undergraduate; 26-45 is solid undergraduate;
            46-65 is advanced undergraduate or beginning graduate; 66-85 is graduate or contest-level hard; 86-100 is
            research-flavored, very technical, or even a conjecture that is still open.
          </p>
        </Faq>
      </section>

      <section className="about-section">
        <h2>Creating playlists</h2>
        <Faq question="Should playlist problems be reusable?">
          <p>
            Usually, yes. Listed problems can appear in several paths and keep their discussion in one place.
          </p>
        </Faq>
        <Faq question="When should a problem be specific to one playlist?">
          <p>
            Some steps only make sense inside a particular route: a tiny diagnostic question, a local warm-up, a
            reference to the previous branch, or an exercise whose wording depends on the playlist. In those cases,
            make it playlist-specific. It stays accessible from the playlist and stays out of the general index.
          </p>
        </Faq>
        <Faq question="Can a playlist mix both kinds?">
          <p>
            Yes. A playlist can mix public problems, concepts, notes, and local exercises.
          </p>
        </Faq>
      </section>

      <section className="about-section">
        <h2>Artificial intelligence</h2>
        <Faq question="Is AI allowed on Math Woods?">
          <p>
            AI may help with brainstorming, formatting, translation, code, or cleanup. It is not an authority or a
            substitute for checking the mathematics.
          </p>
        </Faq>
        <Faq question="Was Math Woods itself coded using AI?">
          <p>
            Yes. Math Woods was coded with help from Codex, an AI coding agent by OpenAI, under human direction and
            review. The published site remains a human responsibility.
          </p>
        </Faq>
        <Faq question="Can AI-generated content be published automatically?">
          <p>
            No. Public content needs a responsible human contributor.
          </p>
        </Faq>
        <Faq question="Should meaningful AI assistance be disclosed?">
          <p>
            Yes. If AI substantially shaped a problem, solution, translation, or rewrite, mention it in the edit summary
            or provenance note.
          </p>
        </Faq>
        <Faq question="May users use AI while solving problems?">
          <p>
            Personal learning choices are not policed. Public solutions should be understood and checked by the person
            posting them.
          </p>
        </Faq>
      </section>

      <section className="about-section">
        <h2>Community and governance</h2>
        <Faq question="Should Math Woods feel like Stack Exchange?">
          <p>
            Not really. Math Woods should allow rough pages to appear. Think of a woodland map: clearings opening,
            paths branching, notes getting corrected, useful pages slowly becoming better.
          </p>
        </Faq>
        <Faq question="How should people behave in discussions?">
          <p>
            This place is designed to be welcoming to everyone, especially beginners. We care about the quality of the
            atmosphere as much as the quality of the mathematics. Rude, dismissive, or condescending behavior toward
            other users will not be tolerated. Please also keep discussions on topic: avoid bringing in unrelated
            subjects such as politics, and avoid jokes or remarks that may make people feel uncomfortable or excluded.
          </p>
        </Faq>
        <Faq question="Is it acceptable to publish unfinished material?">
          <p>
            Yes, if it is honest and useful. A problem can be marked <strong>Needs work</strong>; a concept can begin as
            a stub; an origin can be <strong>Unknown</strong>; a conjecture can have no solution.
          </p>
        </Faq>
        <Faq question="Who is responsible for public contributions?">
          <p>
            Contributors remain responsible for what they publish. Revisions, sources, reports, and discussion make
            corrections possible.
          </p>
        </Faq>
        <Faq question="How are disputes handled?">
          <p>
            Prefer sources, clear reasoning, and discussion. Trusted users may mark disputed content, roll back harmful
            changes, or temporarily restrict pages.
          </p>
        </Faq>
        <Faq question="What should I do when I find copied or poorly sourced content?">
          <p>
            Report it with the suspected original source and a short explanation. The content can be hidden during
            review.
          </p>
        </Faq>
      </section>

      <section className="about-links">
        <div>
          <h2>Useful documents</h2>
          <p className="muted">Short references for editing and contributing.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/contributing" className="button secondary">
            Contribution guidelines
          </Link>
          <Link href="/suggestions" className="button secondary">
            Suggest an improvement
          </Link>
        </div>
      </section>
    </div>
  );
}
