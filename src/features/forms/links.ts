/** Public form URL path. The route that serves it ships in Phase 3. */
export const publicFormPath = (slug: string) => `/f/${slug}`;
export const publicFormUrl = (slug: string, origin = typeof window !== "undefined" ? window.location.origin : "") => `${origin}${publicFormPath(slug)}`;
