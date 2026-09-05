type TopologyBlobGlyphProps = {
  fill: string;
};

export function TopologyBlobGlyph({ fill }: TopologyBlobGlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M10.5 2C14 1.3 18.2 3.5 19.6 7c1.1 2.8.4 6.2-1.8 8.3-1.9 1.8-4.7 2.3-7.2 3.3-2.1.9-4.7 1.4-6.5-.1C2.2 17 1.8 14.3 2.9 12c1-2.1 3.1-3.3 4.6-5C8.6 5.7 8.7 2.7 10.5 2Z"
        fill={fill}
        stroke="#fff"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
