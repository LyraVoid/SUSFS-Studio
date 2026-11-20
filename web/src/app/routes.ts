export const routes = [
  "/",
  "/rules/paths",
  "/rules/disguise",
  "/rules/redirect",
  "/rules/basic",
  "/extensions",
  "/settings",
] as const;
export type Route = (typeof routes)[number];
export type RuleRoute = Extract<Route, `/rules/${string}`>;
export function resolveRoute(hash: string): Route | undefined {
  const path = hash.slice(1);
  if (path === "/rules") return "/rules/paths";
  return routes.find((route) => route === (path || "/"));
}
