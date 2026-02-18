export const isString = (v: unknown): v is string => typeof v === "string";
export const isNumber = (v: unknown): v is number => typeof v === "number";
export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
export const isObject = (v: unknown): v is object =>
  typeof v === "object" && v !== null;
export const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

export function hasPropertySatisfying<K extends PropertyKey, V>(
  x: unknown,
  prop: K,
  isV: (v: unknown) => v is V
): x is Record<K, V> {
  return (
    typeof x === "object" &&
    x !== null &&
    prop in x &&
    isV((x as any)[prop])
  );
}