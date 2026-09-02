import * as React from "react";

/** True when a named component (by displayName/name) appears anywhere in the tree. */
export function hasNamedChild(children: React.ReactNode, names: readonly string[]): boolean {
  const wanted = new Set(names);
  const visit = (node: React.ReactNode): boolean => {
    for (const child of React.Children.toArray(node)) {
      if (!React.isValidElement(child)) continue;
      const type = child.type as { displayName?: string; name?: string };
      const name = type?.displayName ?? type?.name;
      if (name && wanted.has(name)) return true;
      const nested = (child.props as { children?: React.ReactNode } | undefined)?.children;
      if (nested && visit(nested)) return true;
    }
    return false;
  };
  return visit(children);
}
