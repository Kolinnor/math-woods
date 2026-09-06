# Display apostrophes

Reading components apply `displayTypography` to already-sanitized HTML. Only
straight apostrophes between Unicode letters become `’`, including apostrophes
encoded as HTML entities. This also covers previously stored HTML without a
database rewrite. Markdown source, editor fields, exports and citation keys keep
their original characters.

An HTML parser identifies text nodes; tag attributes and protected subtrees
(code, KaTeX, MathML, SVG, graphs and editable fields) remain unchanged. Tokens
containing URLs or email addresses are left alone. This is deliberately limited
to apostrophes within words, not quotation marks or mathematical prime notation.

`npm run test:typography` covers French and English, escaped apostrophes, Unicode,
code, formulas, links, folds and repeat rendering. It runs with `test:core`.
