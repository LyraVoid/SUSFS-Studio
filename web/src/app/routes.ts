export const routes = [
  "/",
  "/rules/overview",
  "/rules/paths",
  "/rules/disguise",
  "/rules/redirect",
  "/rules/basic",
  "/rules/extensions",
  "/settings",
] as const;
export type Route = (typeof routes)[number];
export type RuleRoute = Extract<Route, `/rules/${string}`>;
export function resolveRoute(hash: string): Route | undefined {
  const path = hash.slice(1);
  if (path === "/rules") return "/rules/overview";
  if (path === "/extensions") return "/rules/extensions";
  return routes.find((route) => route === (path || "/"));
}
