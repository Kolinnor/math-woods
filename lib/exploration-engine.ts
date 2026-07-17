export type ExplorationScalar = string | number | boolean;
export type ExplorationStateValue = ExplorationScalar | ExplorationScalar[];
export type ExplorationState = Record<string, ExplorationStateValue>;

export type ExplorationCondition =
  | { all: ExplorationCondition[] }
  | { any: ExplorationCondition[] }
  | {
      variable: string;
      operator: "equals" | "not_equals" | "truthy" | "falsy" | "gte" | "lte" | "contains";
      value?: ExplorationStateValue;
    };

export type ExplorationEffect = {
  variable: string;
  operation: "set" | "increment" | "append" | "remove";
  value: ExplorationStateValue;
};

export function parseExplorationValue(value: unknown): ExplorationStateValue {
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) {
    return value.filter((item): item is ExplorationScalar =>
      typeof item === "string" || typeof item === "number" || typeof item === "boolean"
    );
  }

  const text = String(value ?? "").trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (text && Number.isFinite(Number(text))) return Number(text);
  return text;
}

export function asExplorationState(value: unknown): ExplorationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (!key.trim()) return [];
      if (["string", "number", "boolean"].includes(typeof item) || Array.isArray(item)) {
        return [[key, parseExplorationValue(item)]];
      }
      return [];
    })
  );
}

function comparable(value: ExplorationStateValue | undefined) {
  if (Array.isArray(value)) return value.map(String).join("\u0000");
  return String(value ?? "");
}

export function conditionMatches(condition: unknown, state: ExplorationState): boolean {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return true;
  const rule = condition as Partial<ExplorationCondition> & Record<string, unknown>;

  if (Array.isArray(rule.all)) return rule.all.every((item) => conditionMatches(item, state));
  if (Array.isArray(rule.any)) return rule.any.some((item) => conditionMatches(item, state));

  const variable = typeof rule.variable === "string" ? rule.variable : "";
  const operator = typeof rule.operator === "string" ? rule.operator : "truthy";
  if (!variable) return true;

  const actual = state[variable];
  const expected = parseExplorationValue(rule.value);
  if (operator === "truthy") return Boolean(actual);
  if (operator === "falsy") return !actual;
  if (operator === "equals") return comparable(actual) === comparable(expected);
  if (operator === "not_equals") return comparable(actual) !== comparable(expected);
  if (operator === "gte") return Number(actual) >= Number(expected);
  if (operator === "lte") return Number(actual) <= Number(expected);
  if (operator === "contains") {
    return Array.isArray(actual) ? actual.some((item) => comparable(item) === comparable(expected)) : comparable(actual).includes(comparable(expected));
  }
  return true;
}

export function applyEffects(state: ExplorationState, effects: unknown): ExplorationState {
  if (!Array.isArray(effects)) return state;
  const next = { ...state };

  for (const rawEffect of effects) {
    if (!rawEffect || typeof rawEffect !== "object" || Array.isArray(rawEffect)) continue;
    const effect = rawEffect as Partial<ExplorationEffect>;
    const variable = typeof effect.variable === "string" ? effect.variable.trim() : "";
    if (!variable) continue;
    const value = parseExplorationValue(effect.value);

    if (effect.operation === "increment") {
      next[variable] = Number(next[variable] ?? 0) + Number(value);
    } else if (effect.operation === "append") {
      const current = Array.isArray(next[variable]) ? [...next[variable]] : [];
      if (!current.some((item) => comparable(item) === comparable(value))) current.push(value as ExplorationScalar);
      next[variable] = current;
    } else if (effect.operation === "remove") {
      const current = Array.isArray(next[variable]) ? next[variable] : [];
      next[variable] = current.filter((item) => comparable(item) !== comparable(value));
    } else {
      next[variable] = value;
    }
  }

  return next;
}

export function conditionFromFields(variable: unknown, operator: unknown, value: unknown): ExplorationCondition | null {
  const cleanVariable = String(variable ?? "").trim();
  if (!cleanVariable) return null;
  const supported = new Set(["equals", "not_equals", "truthy", "falsy", "gte", "lte", "contains"]);
  const cleanOperator = supported.has(String(operator)) ? String(operator) : "equals";
  return {
    variable: cleanVariable,
    operator: cleanOperator as Extract<ExplorationCondition, { variable: string }>["operator"],
    ...(!["truthy", "falsy"].includes(cleanOperator) ? { value: parseExplorationValue(value) } : {})
  };
}

export function effectsFromFields(variable: unknown, operation: unknown, value: unknown): ExplorationEffect[] | null {
  const cleanVariable = String(variable ?? "").trim();
  if (!cleanVariable) return null;
  const supported = new Set(["set", "increment", "append", "remove"]);
  const cleanOperation = supported.has(String(operation)) ? String(operation) : "set";
  return [{ variable: cleanVariable, operation: cleanOperation as ExplorationEffect["operation"], value: parseExplorationValue(value) }];
}

export function normalizedTextAnswer(value: unknown, caseSensitive = false) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return caseSensitive ? text : text.toLocaleLowerCase();
}

export function numericAnswerMatches(actual: unknown, expected: unknown, tolerance: unknown) {
  const actualNumber = Number(String(actual ?? "").replace(",", "."));
  const expectedNumber = Number(String(expected ?? "").replace(",", "."));
  const allowedDifference = Math.max(0, Number(tolerance ?? 0));
  return Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) && Math.abs(actualNumber - expectedNumber) <= allowedDifference;
}
