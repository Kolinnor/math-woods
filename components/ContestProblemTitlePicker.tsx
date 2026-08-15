"use client";

import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { MarkdownInline } from "@/components/MarkdownInline";

type ContestProblemTitlePickerProps = {
  defaultValue?: number | null;
  items: Array<{ id: number; titleHtml: string }>;
  placeholder: string;
};

export function ContestProblemTitlePicker({
  defaultValue,
  items,
  placeholder
}: ContestProblemTitlePickerProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [selectedId, setSelectedId] = useState(defaultValue ?? null);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  return (
    <details ref={detailsRef} className="contest-problem-title-picker">
      <select
        className="contest-problem-title-native-select"
        aria-label={placeholder}
        name="problemId"
        required
        value={selectedId ?? ""}
        onChange={(event) => setSelectedId(Number(event.target.value) || null)}
        onInvalid={() => detailsRef.current?.setAttribute("open", "")}
      >
        <option value="" />
        {items.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
      </select>
      <summary>
        <span>{selected ? <MarkdownInline html={selected.titleHtml} /> : placeholder}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </summary>
      <div className="contest-problem-title-options">
        {items.map((item) => (
          <label key={item.id} className={item.id === selectedId ? "is-selected" : undefined}>
            <input
              type="radio"
              value={item.id}
              checked={item.id === selectedId}
              onChange={() => {
                setSelectedId(item.id);
                detailsRef.current?.removeAttribute("open");
              }}
            />
            <MarkdownInline html={item.titleHtml} />
          </label>
        ))}
      </div>
    </details>
  );
}
