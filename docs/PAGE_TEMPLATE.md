# Page template

Use this layout for every authenticated app page.

## Structure

```
PageHeader  →  PageContent  →  state branch  →  content
```

1. **PageHeader** — title, optional description, breadcrumbs, actions.
2. **PageContent** — animated wrapper (`fade-in`) around the body.
3. **State branch** — pick exactly one:
   - **Loading** — `PageStateLoading` or `PageStateSkeleton`
   - **Error** — `InlineErrorRetry` with `onRetry`
   - **Empty** — `EmptyState` with primary action
   - **Content** — cards, tables, forms

## Minimal example

```tsx
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { PageStateSkeleton } from "@/components/common/PageStateLoading";

export default function ExamplePage() {
  const { data, isLoading, error, refetch } = useExample();

  return (
    <>
      <PageHeader
        title="Example"
        description="One-line purpose for this page."
        actions={<Button>New item</Button>}
      />

      <PageContent>
        {isLoading && <PageStateSkeleton count={3} />}

        {!isLoading && error && (
          <InlineErrorRetry message={error.message} onRetry={refetch} />
        )}

        {!isLoading && !error && data.length === 0 && (
          <EmptyState
            title="Nothing here yet"
            description="Create your first item to get started."
            action={{ label: "Create item", onClick: () => {} }}
          />
        )}

        {!isLoading && !error && data.length > 0 && (
          <div className="page-section space-y-4">
            {/* main content */}
          </div>
        )}
      </PageContent>
    </>
  );
}
```

## Rules

- Put **PageHeader outside PageContent** when the header should not animate with the body (most pages).
- Use **`page-section`** for horizontal padding that respects density settings.
- Wrap tabular data in **`DataTable`** for overflow, loading skeletons, and empty slots.
- Never show loading and error at the same time — branch in order: loading → error → empty → content.
