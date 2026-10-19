# Table and form diagnostic slice

The hash route `/diagnostics/data` is a technical fixture, not a delivered platform feature. It is enabled only in development with MSW enabled; production and MSW-disabled environments do not issue sample reads or writes.

TanStack Table receives only the current server page. Pagination, sorting and filtering are all manual: MSW applies filtering and name ordering to the full twelve-item collection before slicing a page. Query keys include each request parameter and forward cancellation. Selection uses stable sample IDs and survives page changes. Sorting and filtering reset pagination to page one.

TanStack Form owns the editor values, including dynamic nested `metadata.aliases` fields. Zod validates submission, and parsed values are sent through the shared fetch client. The mock-only reserved name `保留名称` produces a 422 field error; a successful save invalidates the sample Query family. The reset action restores the deterministic collection and clears selection and editor state. No mutation retries are configured.

The UI primitives follow the shadcn/ui source-component convention: locally owned button, input and table components, `data-slot` attributes, CVA variants and `cn` merging, with Tailwind v4 utilities. The component registry configuration and `@/` alias are prepared for subsequent additions. Existing styles live in the base layer so utility styles remain effective.

Registry metadata was checked for Table 8.21.3, Form 1.33.5, Zod 4.6.7 and Tailwind/Vite integration 4.3.3. Table v8 is intentional: its manual server operations are sufficient and its peer range includes React 19, without adopting the v9 Store dependency. Form supports React 19 and the Tailwind Vite plugin supports Vite 8. Exact manifest versions still require installation and lockfile verification before this slice is considered complete.

Behavior tests exercise the rendered page through DOM controls and MSW: globally sorted pagination, server filtering, stable selection, nested field validation, server field errors, write/read refresh and reset. The agreed initialization spec makes the browser UI the primary boundary; these deterministic DOM tests supplement the Playwright flow.
