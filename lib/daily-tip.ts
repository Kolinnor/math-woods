export const DAILY_TIPS = [
  {
    level: 0,
    title: "Use all the hypotheses of the problem.",
    description: "The first thing to do is to understand every word of the problem.",
    body: "List the assumptions one by one and ask what each of them prevents, allows, or forces. A hypothesis that looks decorative is often the key."
  },
  {
    level: 0,
    title: "Try to solve a simpler problem.",
    description: "The most important skill in problem solving.",
    body: "Lower the dimension, shrink the numbers, remove a condition, or look at a toy version. A good simpler problem keeps the same soul with fewer moving parts."
  },
  {
    level: 1,
    title: "Work backwards from what you need to prove.",
    description: "Start from the desired conclusion and ask what would be enough.",
    body: "Write the desired conclusion first, then ask which simpler statement would be enough to reach it."
  },
  {
    level: 1,
    title: "Test the smallest nontrivial cases.",
    description: "Small examples reveal the shape of the problem before the proof is visible.",
    body: "Small examples often reveal the right conjecture, an overlooked exception, or the structure of a proof."
  },
  {
    level: 2,
    title: "Name the quantity that does not change.",
    description: "Repeated processes often hide an invariant.",
    body: "When a process repeats, look for an invariant: parity, a sum, a product, an ordering, or a coloring."
  },
  {
    level: 3,
    title: "Draw one more line than seems necessary.",
    description: "In geometry, the right auxiliary object can make the configuration speak.",
    body: "In geometry, an auxiliary line can expose similar triangles, cyclic quadrilaterals, or a useful symmetry."
  },
  {
    level: 2,
    title: "Replace a difficult statement by its contrapositive.",
    description: "Negating the conclusion can make the hidden structure easier to see.",
    body: "A claim of the form \"if A, then B\" may become much easier when approached as \"if not B, then not A.\""
  },
  {
    level: 2,
    title: "Separate existence from uniqueness.",
    description: "Finding an object and proving it is the only one are often different problems.",
    body: "First show that an object can be constructed. Then use a different argument to show there cannot be two."
  },
  {
    level: 2,
    title: "Search for equality cases.",
    description: "Extremal behavior often points toward the right transformation.",
    body: "In an inequality, understanding when equality holds often points directly to the right transformation."
  },
  {
    level: 1,
    title: "Choose notation that exposes structure.",
    description: "Good notation makes the important pattern hard to miss.",
    body: "Good notation reduces the number of facts you must remember and makes symmetries or recurrences visible."
  },
  {
    level: 1,
    title: "Ask what would make the claim false.",
    description: "Counterexample hunting clarifies which hypotheses matter.",
    body: "Trying to build a counterexample is one of the fastest ways to discover which hypotheses actually matter."
  },
  {
    level: 2,
    title: "Turn divisibility into an equation.",
    description: "Equations make divisibility constraints easier to combine with bounds or substitutions.",
    body: "Writing a divides b as b = ak often makes substitutions, bounds, and modular arguments much clearer."
  },
  {
    level: 2,
    title: "Use symmetry before computation.",
    description: "Symmetry can erase work before it begins.",
    body: "Before expanding or calculating, check whether swapping variables or reflecting the configuration changes anything."
  },
  {
    level: 2,
    title: "State the induction hypothesis precisely.",
    description: "A vague induction hypothesis usually creates a vague proof.",
    body: "A strong, explicit hypothesis makes the induction step easier and prevents accidental circular reasoning."
  },
  {
    level: 3,
    title: "Change representations.",
    description: "The same object may become simple in another language.",
    body: "An algebraic expression may become obvious as a geometric picture, a counting argument, or a generating function."
  },
  {
    level: 4,
    title: "Pause after finding a solution.",
    description: "The first proof is often only the entrance to the idea.",
    body: "Look for a shorter proof, a generalization, and the exact moment where the main idea entered."
  }
] as const;

export function dailyTip(date = new Date()) {
  const dayNumber = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );

  return DAILY_TIPS[dayNumber % DAILY_TIPS.length];
}
