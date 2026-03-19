// ─────────────────────────────────────────────────────────────────────────────
// objectUtils.ts — Object manipulation, deep clone, diff, pick/omit,
// flattening, and type-safe helpers used across the app.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Pick / Omit ──────────────────────────────────────────────────────────────

/**
 * Pick specific keys from an object.
 * @example pick(user, ["id", "email"]) → { id: "...", email: "..." }
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  return keys.reduce<Pick<T, K>>((acc, key) => {
    if (key in obj) acc[key] = obj[key];
    return acc;
  }, {} as Pick<T, K>);
}

/**
 * Omit specific keys from an object.
 * @example omit(user, ["password", "salt"])
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const keySet = new Set<string>(keys as string[]);
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !keySet.has(k))
  ) as Omit<T, K>;
}

// ─── Clone ────────────────────────────────────────────────────────────────────

/**
 * Deep clone an object using structuredClone where available,
 * falling back to JSON serialization.
 */
export function deepClone<T>(obj: T): T {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Shallow clone an object.
 */
export function shallowClone<T extends object>(obj: T): T {
  return { ...obj };
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Deep merge multiple objects, with later objects taking precedence.
 */
export function deepMerge<T extends object>(...objects: Partial<T>[]): T {
  return objects.reduce<T>((acc, obj) => {
    if (!obj) return acc;
    Object.entries(obj).forEach(([key, value]) => {
      const accVal = (acc as Record<string, unknown>)[key];
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        accVal !== null &&
        typeof accVal === "object" &&
        !Array.isArray(accVal)
      ) {
        (acc as Record<string, unknown>)[key] = deepMerge(
          accVal as object,
          value as object
        );
      } else {
        (acc as Record<string, unknown>)[key] = value;
      }
    });
    return acc;
  }, {} as T);
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

/**
 * Get the keys that differ between two objects (shallow).
 */
export function shallowDiff<T extends object>(
  a: T,
  b: Partial<T>
): Partial<T> {
  const diff: Partial<T> = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b ?? {})]) as Set<keyof T>;

  keys.forEach((key) => {
    if (a[key] !== b?.[key]) diff[key] = b?.[key];
  });

  return diff;
}

/**
 * Check if two objects are shallowly equal.
 */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

/**
 * Deep equality check.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((k) =>
    deepEqual(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k]
    )
  );
}

// ─── Flatten / Unflatten ──────────────────────────────────────────────────────

/**
 * Flatten a nested object to dot-notation keys.
 * @example flatten({ a: { b: 1 } }) → { "a.b": 1 }
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix = "",
  separator = "."
): Record<string, unknown> {
  return Object.entries(obj).reduce<Record<string, unknown>>((acc, [key, val]) => {
    const fullKey = prefix ? `${prefix}${separator}${key}` : key;

    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(acc, flattenObject(val as Record<string, unknown>, fullKey, separator));
    } else {
      acc[fullKey] = val;
    }

    return acc;
  }, {});
}

/**
 * Unflatten a dot-notation object back to nested.
 * @example unflatten({ "a.b": 1 }) → { a: { b: 1 } }
 */
export function unflattenObject(
  obj: Record<string, unknown>,
  separator = "."
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  Object.entries(obj).forEach(([key, value]) => {
    const keys = key.split(separator);
    let current = result;

    keys.forEach((k, i) => {
      if (i === keys.length - 1) {
        current[k] = value;
      } else {
        current[k] = current[k] ?? {};
        current = current[k] as Record<string, unknown>;
      }
    });
  });

  return result;
}

// ─── Null / Empty Handling ────────────────────────────────────────────────────

/**
 * Remove all keys with null or undefined values from an object.
 */
export function compactObject<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)
  ) as Partial<T>;
}

/**
 * Remove all keys with falsy values.
 */
export function compactFalsy<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => Boolean(v))
  ) as Partial<T>;
}

/**
 * Check if an object has no enumerable keys.
 */
export function isEmpty(obj: object): boolean {
  return Object.keys(obj).length === 0;
}

/**
 * Safely access a nested property by dot-notation path.
 * @example getNestedValue(obj, "user.profile.name") → "John"
 */
export function getNestedValue<T = unknown>(
  obj: Record<string, unknown>,
  path: string,
  defaultValue?: T
): T | undefined {
  const keys   = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) return defaultValue;
    current = (current as Record<string, unknown>)[key];
  }

  return (current as T) ?? defaultValue;
}

/**
 * Safely set a nested value by dot-notation path (immutable).
 */
export function setNestedValue<T extends object>(
  obj: T,
  path: string,
  value: unknown
): T {
  const keys  = path.split(".");
  const clone = deepClone(obj);
  let current = clone as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
  return clone;
}

// ─── Map / Transform ─────────────────────────────────────────────────────────

/**
 * Map over object values.
 */
export function mapValues<T, U>(
  obj: Record<string, T>,
  fn: (value: T, key: string) => U
): Record<string, U> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, fn(v, k)])
  );
}

/**
 * Map over object keys.
 */
export function mapKeys<T>(
  obj: Record<string, T>,
  fn: (key: string, value: T) => string
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [fn(k, v), v])
  );
}

/**
 * Filter object entries by predicate.
 */
export function filterObject<T>(
  obj: Record<string, T>,
  fn: (value: T, key: string) => boolean
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([k, v]) => fn(v, k))
  );
}

/**
 * Invert keys and values of an object.
 * @example invertObject({ a: "1" }) → { "1": "a" }
 */
export function invertObject(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
}
