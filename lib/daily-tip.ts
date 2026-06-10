const DAILY_TIPS = [
  {
    title: "Work backwards from what you need to prove.",
    body: "Write the desired conclusion first, then ask which simpler statement would be enough to reach it."
  },
  {
    title: "Test the smallest nontrivial cases.",
    body: "Small examples often reveal the right conjecture, an overlooked exception, or the structure of a proof."
  },
  {
    title: "Name the quantity that does not change.",
    body: "When a process repeats, look for an invariant: parity, a sum, a product, an ordering, or a coloring."
  },
  {
    title: "Draw one more line than seems necessary.",
    body: "In geometry, an auxiliary line can expose similar triangles, cyclic quadrilaterals, or a useful symmetry."
  },
  {
    title: "Replace a difficult statement by its contrapositive.",
    body: "A claim of the form “if A, then B” may become much easier when approached as “if not B, then not A.”"
  },
  {
    title: "Separate existence from uniqueness.",
    body: "First show that an object can be constructed. Then use a different argument to show there cannot be two."
  },
  {
    title: "Search for equality cases.",
    body: "In an inequality, understanding when equality holds often points directly to the right transformation."
  },
  {
    title: "Choose notation that exposes structure.",
    body: "Good notation reduces the number of facts you must remember and makes symmetries or recurrences visible."
  },
  {
    title: "Ask what would make the claim false.",
    body: "Trying to build a counterexample is one of the fastest ways to discover which hypotheses actually matter."
  },
  {
    title: "Turn divisibility into an equation.",
    body: "Writing a divides b as b = ak often makes substitutions, bounds, and modular arguments much clearer."
  },
  {
    title: "Use symmetry before computation.",
    body: "Before expanding or calculating, check whether swapping variables or reflecting the configuration changes anything."
  },
  {
    title: "State the induction hypothesis precisely.",
    body: "A strong, explicit hypothesis makes the induction step easier and prevents accidental circular reasoning."
  },
  {
    title: "Change representations.",
    body: "An algebraic expression may become obvious as a geometric picture, a counting argument, or a generating function."
  },
  {
    title: "Pause after finding a solution.",
    body: "Look for a shorter proof, a generalization, and the exact moment where the main idea entered."
  }
] as const;

export function dailyTip(date = new Date()) {
  const dayNumber = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );

  return DAILY_TIPS[dayNumber % DAILY_TIPS.length];
}
