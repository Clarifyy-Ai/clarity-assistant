// index.ts

// Barrel export file for layout components

export { default as AppLayout } from './AppLayout';
export { default as AppSidebar } from './AppSidebar';
export { default as AppTopBar } from './AppTopBar';
export { default as MobileNav } from './MobileNav';
export { default as NetworkBanner } from './NetworkBanner';
export { default as PageHeader } from './PageHeader';
export { default as ProtectedRoute } from './ProtectedRoute';
export { default as SetupChecklist } from './SetupChecklist';
export { default as PlanGate } from './PlanGate';
export { default as ErrorBoundary } from './ErrorBoundary';

// Usage Example:
// import { AppLayout, AppSidebar } from 'src/components/layout';
// <AppLayout><AppSidebar /></AppLayout>
