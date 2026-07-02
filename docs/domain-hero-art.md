# Domain hero art

Problem detail heroes are served from Infomaniak Object Storage under:

```text
https://s3.pub2.infomaniak.cloud/object/v1/AUTH_7cc517879b0040959f7d12abb1f0e72d/mathwoods-images/site-art-wide/
```

The active problem hero images are the panoramic `site-art-wide/{domain}.webp` versions. They are 3200x800 WebP files, with the full artwork centered over a blurred extension of the same painting so the hero can be as zoomed-out as possible without distortion. They were converted from public-domain Ivan Shishkin works available on Wikimedia Commons.

Earlier 1800x1012 crops are kept under `site-art/{domain}.webp` for cache stability and possible rollback.

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
| number-theory | Birch Forest |
| representation-theory | Pine Forest |
| algebraic-geometry | The Dark Wood |
| geometry | Oaks in Old Peterhof |
| differential-geometry | Mast-Tree Grove |
| general-topology | Forest |
| algebraic-topology | Forest Lodge |
| real-analysis | Pine Forest |
| complex-analysis | Pine on Sand |
| functional-analysis | Branches. A Study |
| differential-equations | Birches after Storm |
| probability-statistics | At the Edge of the Pine Forest |
| combinatorics | Mixed Forest |
| graphs-discrete-math | Wind-Fallen Trees |
| scientific-computing | Autumn |
| mathematical-physics | Winter |
| other | Forest Landscape with Herons |
