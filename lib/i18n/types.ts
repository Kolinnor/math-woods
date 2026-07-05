import type { en } from "./dictionaries/en.ts";

type Widen<T> = T extends (...args: infer Args) => infer Return
  ? (...args: Args) => Return
  : T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends readonly (infer Item)[]
          ? readonly Widen<Item>[]
          : T extends object
            ? { [Key in keyof T]: Widen<T[Key]> }
            : T;

export type Dictionary = Widen<typeof en>;

export type DeepPartial<T> = {
  [Key in keyof T]?: T[Key] extends (...args: never[]) => unknown
    ? T[Key]
    : T[Key] extends readonly unknown[]
      ? T[Key]
      : T[Key] extends object
        ? DeepPartial<T[Key]>
        : T[Key];
};

export type InterfaceLocale = "en" | "fr";
