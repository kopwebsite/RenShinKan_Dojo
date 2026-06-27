# Mobile performance audit

Audit date: 2026-06-27
Test profile: 390Ã—844 viewport, DPR 3, Slow 4G, 4Ã— CPU slowdown, empty browser context
Before target: `https://renshinkandojo.org/`
After target: local production preview of this commit

The timing figures are medians from three isolated cold loads. Production uses Cloudflare HTTP/3 while the local preview uses HTTP/1.1, so server-sensitive timing values (especially TTFB and FCP) must be rechecked after deployment. Payload and request totals are deterministic for the tested page state.

## Before and after

| Metric | Production before | Local build after | Change |
| --- | ---: | ---: | ---: |
| LCP | 5.85 s | 2.83 s | -52% |
| FCP | 2.60 s | 2.84 s | +0.24 s; recheck on Cloudflare |
| TTFB | 63 ms | 7 ms | Not directly comparable across servers |
| Total compressed JS | 151.4 KiB | 90.0 KiB | -41% |
| Initial image weight | 1.20 MiB | 140.2 KiB | -89% |
| Initial encoded payload | 1.37 MiB | 329.8 KiB | -76% |
| Request count | 29 | 10 | -66% |
| CLS | 0.01 | 0.01 | Unchanged |
| Forced reflow time | 51 ms | 4 ms | -92% |
| Initial DOM elements | 823 | 108 | -87% |

Lighthouse mobile category audit:

| Category | Before | After |
| --- | ---: | ---: |
| Accessibility | 95 | 100 |
| Best Practices | 100 | 100 |
| SEO | 92 | 100 |

## Findings and fixes

1. The homepage hero had one 1672 px AVIF, no responsive source set, and was 205 KiB on every phone. It now has 640/1280/max AVIF and WebP candidates, a mobile-specific 640 px source, an accurate preload, `fetchpriority="high"`, eager loading, async decoding, dimensions, and `sizes`.
2. Most other images had no HTML dimensions or responsive candidates. The image build now generates 640/1280/1920-or-source-width variants, records dimensions, and supplies `srcset`, `sizes`, `width`, `height`, lazy loading, and async decoding through `ResponsiveImage`.
3. The 432 KiB logo PNG and 126 KiB favicon were on the initial path. They are now a 32 KiB responsive WebP logo and a 4 KiB 96 px palette PNG favicon.
4. The entire homepage below-fold component tree, content API request, gallery images, and Framer Motion chunk loaded immediately. The section tree is now loaded at the viewport boundary. Initial DOM size fell from 823 to 108 elements.
5. Framer Motion contributed 38.9 KiB compressed and was used only for reveal/crossfade effects. It was removed and replaced with small CSS animations that preserve reduced-motion behavior.
6. Google Fonts required an extra origin and stylesheet. Inter and Cormorant Garamond are now self-hosted as one variable WOFF2 file each with `font-display: swap` and limited weight ranges.
7. Google Maps, YouTube/Vimeo, Office document viewers, and the Brevo form now create their iframe only after a user clicks the placeholder. Same-origin PDF viewers remain lazy.
8. Four Community images hotlinked from Squarespace are now local responsive assets.
9. Galleries render only the active large item. Grid/preview images use the 640 px responsive candidate and larger versions are requested only when selected or required by layout.
10. Cloudflare Pages headers now give hashed bundles and fonts a one-year immutable lifetime, responsive images a seven-day lifetime with stale-while-revalidate, and HTML revalidation semantics.

The platform-injected Cloudflare analytics beacon remains outside the application bundle. Its measured main-thread cost was 15 ms before the change.

## Image inventory

The exhaustive static image list, dimensions, responsive widths, and route coverage are in [IMAGE_INVENTORY.md](./IMAGE_INVENTORY.md). Content-managed admin uploads are dynamic and are reported by the content API rather than the repository inventory.
