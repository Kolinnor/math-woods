import { prisma } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";

export type FaqItemContent = {
  id?: number;
  position: number;
  question: string;
  answerMarkdown: string;
};

export type FaqSectionContent = {
  id?: number;
  position: number;
  title: string;
  anchorId: string;
  items: FaqItemContent[];
};

export type RenderedFaqItem = FaqItemContent & {
  answerHtml: string;
};

export type RenderedFaqSection = Omit<FaqSectionContent, "items"> & {
  items: RenderedFaqItem[];
};

export const DEFAULT_FAQ_SECTIONS: FaqSectionContent[] = [
  {
    position: 0,
    title: "Mission and funding",
    anchorId: "",
    items: [
      {
        position: 0,
        question: "How can the site be funded without ads or subscriptions?",
        answerMarkdown:
          "The website will work with donations. Thank you for your support, which allows the site to continue existing !"
      }
    ]
  },
  {
    position: 1,
    title: "Licensing, reuse, and forks",
    anchorId: "licensing",
    items: [
      {
        position: 0,
        question: "What license applies to the Math Woods software?",
        answerMarkdown:
          "The application code is licensed under [GNU AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html). This means people may study, modify, fork, and host the software, but operators of modified public versions must make the corresponding source code available to their users under the same license."
      },
      {
        position: 1,
        question: "What license applies to Math Woods educational content?",
        answerMarkdown:
          "Unless otherwise stated, Math Woods educational content, including problems, solutions, explanations, notes, and learning resources, is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). This allows non-commercial educational reuse with attribution, provided adaptations are shared under the same license."
      },
      {
        position: 2,
        question: "Can someone make money from Math Woods content?",
        answerMarkdown:
          "Not without permission. The CC BY-NC-SA 4.0 content license does not allow commercial reuse of Math Woods educational content. Services mainly intended to generate revenue, advertising income, commercial leads, paid tutoring, course sales, subscriptions, or commercial alternatives to Math Woods need written permission, even if initial access is free."
      },
      {
        position: 3,
        question: "Can teachers, students, or creators use Math Woods problems in lessons or videos?",
        answerMarkdown:
          "Yes. Math Woods gives additional permission for teachers, students, educational creators, and educational projects to use a small number of Math Woods problems in classes, videos, streams, notes, or learning materials, including on platforms that may be monetized, as long as they credit Math Woods, do not republish a substantial part of the problem bank, and do not present the content as their own database."
      },
      {
        position: 4,
        question: "Why use the AGPL for the software?",
        answerMarkdown:
          "The AGPL says that a public modified version of the site must make its corresponding source available to its users."
      },
      {
        position: 5,
        question: "Can someone fork Math Woods?",
        answerMarkdown:
          "Yes. Forks of the software are allowed under the AGPL. Forks must follow the AGPL terms, keep required notices, and make the corresponding source code available when they operate a modified public version."
      },
      {
        position: 6,
        question: "Can forks use the Math Woods name or logo?",
        answerMarkdown:
          "No. The Math Woods name, logo, domain, and visual identity are protected separately. Unofficial forks or services may not use them in a way that suggests they are official or endorsed."
      },
      {
        position: 7,
        question: "Who owns user-submitted content?",
        answerMarkdown:
          "Contributors keep responsibility for what they submit. By contributing public content to Math Woods, they confirm that they have the right to publish it and agree that it may be distributed under the Math Woods content license."
      },
      {
        position: 8,
        question: "Can users export their work?",
        answerMarkdown:
          "Yes. Public content and personal work should remain portable through Markdown and other simple formats. Personal account data is not public encyclopedia content and should never be included in public exports or datasets."
      }
    ]
  },
  {
    position: 2,
    title: "Books, contests, and problem origins",
    anchorId: "",
    items: [
      {
        position: 0,
        question: "Can I copy a problem directly from a book?",
        answerMarkdown:
          "Usually not. Do not copy a book's wording unless the material is genuinely in the public domain or the rights holder has granted suitable permission. Buying or owning a book does not grant republication rights."
      },
      {
        position: 1,
        question: "What content should not be copied into Math Woods?",
        answerMarkdown:
          "Users must not copy problem statements, solutions, explanations, books, paid problem sets, contest material, or website content unless reuse is clearly permitted. Reports of copied or poorly sourced content should be reviewed, and questionable content may be hidden or removed during review."
      },
      {
        position: 2,
        question: "Should problems be reformulated?",
        answerMarkdown:
          "Yes. Prefer an independent, clear reformulation written from your own understanding of the mathematical idea. If possible, it is good to record the origin of the problem. A reformulation should improve clarity and preserve attribution, not disguise copying."
      },
      {
        position: 3,
        question: "Is reformulation always enough to avoid copyright issues?",
        answerMarkdown:
          "No. Mathematical ideas and facts are different from a source's particular expression, but a rewrite that remains too close may still be problematic. Some collections also have specific terms of use. When in doubt, link to the source, write a genuinely independent problem, or leave it unpublished until permission is clear."
      },
      {
        position: 4,
        question: "What about olympiad and competition problems?",
        answerMarkdown:
          "Treat them like any other published material. Check the organizer's reuse policy before reproducing the official wording. When allowed, identify the competition, year, round, and problem number. Otherwise, prefer an independently worded variation and keep a transparent origin note."
      },
      {
        position: 5,
        question: "What if the origin is unknown?",
        answerMarkdown: "Use **Unknown** and explain what is known in the provenance note."
      },
      {
        position: 6,
        question: "Can a problem inspired by another problem be published?",
        answerMarkdown:
          "Yes, when it is a genuinely new expression or variation and the relationship is documented. Mention the inspiration and describe important changes."
      }
    ]
  },
  {
    position: 3,
    title: "Creating problems",
    anchorId: "creating-problems",
    items: [
      {
        position: 0,
        question: "What kind of problem statement works well here?",
        answerMarkdown:
          'We do not want to restrict the kind of problem statements that can be submitted here. However, we note that sometimes, the best version of a problem is in an "open question" form: _does there exist_ an object with this property? _Which examples are possible_? "Show that no such function exists" may be equivalent, but it gives away the direction too early.'
      },
      {
        position: 1,
        question: "Does a problem statement have to be the most direct formulation?",
        answerMarkdown:
          "Not always. A good statement can sometimes invite a plausible wrong first idea, as long as the wording is honest and mathematically precise. For example, asking when the even number $2n$ is divisible by both $n$ and $n-1$ can be more interesting than immediately naming the hidden condition. The point is not to trick readers with ambiguity, but to let them discover which details matter."
      },
      {
        position: 2,
        question: "How should I title a problem?",
        answerMarkdown:
          "Prefer a short, descriptive title. Sentence case usually looks better than capitalizing every word. Avoid putting formulas directly in the title; put the mathematics in the statement instead. The title can stay plain."
      },
      {
        position: 3,
        question: "Is it a problem if some pages overlap?",
        answerMarkdown:
          "No. A little repetition is fine. Mathematics cannot be divided perfectly into one exact page for every problem or concept: formulations, audiences, and useful levels of detail naturally overlap. Search first and avoid exact duplicates, but do not let partial overlap stop you from creating a useful page. Related pages can be linked, clarified, or merged later."
      },
      {
        position: 4,
        question: "Do new problems need to be polished?",
        answerMarkdown:
          "Although we value high quality to problems, contrary to websites such as Stack Exchange, there is no hard rule to enforce that new problems are immediately polished. We want people to be able to rely on the community to improve and filter problems over time."
      },
      {
        position: 5,
        question: "How should I use the difficulty score?",
        answerMarkdown:
          "The 1-100 score is a rough signal. Difficulty depends heavily on what the reader already knows, how recently they saw the topic, and whether the problem uses a familiar trick. As a loose convention: 1-10 is pre-university or warm-up material; 11-25 is early undergraduate; 26-45 is solid undergraduate; 46-65 is advanced undergraduate or beginning graduate; 66-85 is graduate or contest-level hard; 86-100 is research-flavored, very technical, or even a conjecture that is still open."
      }
    ]
  },
  {
    position: 4,
    title: "Creating explorations",
    anchorId: "",
    items: [
      {
        position: 0,
        question: "Should exploration problems be reusable?",
        answerMarkdown: "Usually, yes. Listed problems can appear in several paths and keep their discussion in one place."
      },
      {
        position: 1,
        question: "When should a problem be specific to one exploration?",
        answerMarkdown:
          "Some steps only make sense inside a particular route: a tiny diagnostic question, a local warm-up, a reference to the previous branch, or an exercise whose wording depends on the exploration. In those cases, make it exploration-specific. It stays accessible from the exploration and stays out of the general index."
      },
      {
        position: 2,
        question: "Can an exploration mix both kinds?",
        answerMarkdown: "Yes. An exploration can mix public problems, concepts, notes, and local exercises."
      }
    ]
  },
  {
    position: 5,
    title: "Artificial intelligence",
    anchorId: "",
    items: [
      {
        position: 0,
        question: "Is AI allowed on Math Woods?",
        answerMarkdown:
          "AI may help with brainstorming, formatting, translation, code, or cleanup. It is not an authority or a substitute for checking the mathematics."
      },
      {
        position: 1,
        question: "Was Math Woods itself coded using AI?",
        answerMarkdown:
          "Yes. Math Woods was coded with help from Codex, an AI coding agent by OpenAI, under human direction and review. The published site remains a human responsibility."
      },
      {
        position: 2,
        question: "Can AI-generated content be published automatically?",
        answerMarkdown: "No. Public content needs a responsible human contributor."
      },
      {
        position: 3,
        question: "Should meaningful AI assistance be disclosed?",
        answerMarkdown:
          "Yes. If AI substantially shaped a problem, solution, translation, or rewrite, mention it in the edit summary or provenance note."
      },
      {
        position: 4,
        question: "May users use AI while solving problems?",
        answerMarkdown:
          "Personal learning choices are not policed. Public solutions should be understood and checked by the person posting them."
      }
    ]
  },
  {
    position: 6,
    title: "Community and governance",
    anchorId: "",
    items: [
      {
        position: 0,
        question: "Should Math Woods feel like Stack Exchange?",
        answerMarkdown:
          "Not really. Math Woods should allow rough pages to appear. Think of a woodland map: clearings opening, paths branching, notes getting corrected, useful pages slowly becoming better."
      },
      {
        position: 1,
        question: "How should people behave in discussions?",
        answerMarkdown:
          "This place is designed to be welcoming to everyone, especially beginners. We care about the quality of the atmosphere as much as the quality of the mathematics. Rude, dismissive, or condescending behavior toward other users will not be tolerated. Please also keep discussions on topic: avoid bringing in unrelated subjects such as politics, and avoid jokes or remarks that may make people feel uncomfortable or excluded."
      },
      {
        position: 2,
        question: "Is it acceptable to publish unfinished material?",
        answerMarkdown:
          "Yes, if it is honest and useful. A problem can be marked **Needs work**; a concept can begin as a stub; an origin can be **Unknown**; a conjecture can have no solution."
      },
      {
        position: 3,
        question: "Who is responsible for public contributions?",
        answerMarkdown:
          "Contributors remain responsible for what they publish. Revisions, sources, reports, and discussion make corrections possible."
      },
      {
        position: 4,
        question: "How are disputes handled?",
        answerMarkdown:
          "Prefer sources, clear reasoning, and discussion. Trusted users may mark disputed content, roll back harmful changes, or temporarily restrict pages."
      },
      {
        position: 5,
        question: "What should I do when I find copied or poorly sourced content?",
        answerMarkdown:
          "Report it with the suspected original source and a short explanation. The content can be hidden during review."
      }
    ]
  }
];

export async function loadFaqSections(): Promise<FaqSectionContent[]> {
  const sections = await prisma.faqSection.findMany({
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: {
      items: {
        orderBy: [{ position: "asc" }, { id: "asc" }]
      }
    }
  });

  if (sections.length === 0) return DEFAULT_FAQ_SECTIONS;
  return sections;
}

export async function loadRenderedFaqSections(): Promise<RenderedFaqSection[]> {
  const sections = await loadFaqSections();

  return Promise.all(
    sections.map(async (section) => ({
      ...section,
      items: await Promise.all(
        section.items.map(async (item) => ({
          ...item,
          answerHtml: await renderMarkdown(item.answerMarkdown)
        }))
      )
    }))
  );
}

export async function ensureEditableFaqSections() {
  const count = await prisma.faqSection.count();
  if (count > 0) return;

  await prisma.$transaction(
    DEFAULT_FAQ_SECTIONS.map((section) =>
      prisma.faqSection.create({
        data: {
          position: section.position,
          title: section.title,
          anchorId: section.anchorId,
          items: {
            create: section.items.map((item) => ({
              position: item.position,
              question: item.question,
              answerMarkdown: item.answerMarkdown
            }))
          }
        }
      })
    )
  );
}

export async function loadEditableFaqSections() {
  await ensureEditableFaqSections();
  return prisma.faqSection.findMany({
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: {
      items: {
        orderBy: [{ position: "asc" }, { id: "asc" }]
      }
    }
  });
}
