# Domain hero art

Problem detail heroes are served from Infomaniak Object Storage under:

```text
https://s3.pub2.infomaniak.cloud/object/v1/AUTH_7cc517879b0040959f7d12abb1f0e72d/mathwoods-images/site-art/
```

Most active problem hero images are the `site-art/{domain}.webp` versions. They are 1800x1012 WebP crops rendered with CSS `object-fit: cover`, so the hero is filled by the real painting instead of a blurred panoramic extension. The explicit mapping in `lib/problem-hero-art.ts` is authoritative: new domains reuse existing objects, and enigma uses the bundled `/art/rye.jpg`. Subdomains use their current parent's painting; historical image entries remain available.

The panoramic `site-art-wide/{domain}.webp` files are kept for rollback only. They fill a 3200x800 frame with blurred extensions, which can look artificial on wide desktop heroes.

Images should be uploaded with:

```http
Content-Type: image/webp
Cache-Control: public, max-age=31536000, immutable
```

| Domain | Painting |
| --- | --- |
| logic | The Edge of the Forest |
| category-theory | Forest Distant Views |
| algebra | Oak Grove |
| linear-algebra | The Forest Clearing |
| algebraic-geometry | The Dark Wood |
| geometry | Oaks in Old Peterhof |
| differential-geometry | Mast-Tree Grove |
| general-topology | Forest |
| algebraic-topology | Forest (general-topology.webp) |
| real-analysis | Pine Forest |
| complex-analysis | Pine on Sand |
| functional-analysis | Branches. A Study |
| differential-equations | Birches after Storm |
| probability-statistics | At the Edge of the Pine Forest |
| several-variable-functions | Mixed Forest (combinatorics.webp) |
| graphs-discrete-math | Wind-Fallen Trees |
| computation | Autumn (scientific-computing.webp) |
| history-of-mathematics | Winter (mathematical-physics.webp) |
| applied-mathematics | Forest Landscape with Herons (other.webp) |
| enigma | Rye (/art/rye.jpg) |
| other | Forest Landscape with Herons |
