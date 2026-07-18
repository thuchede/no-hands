/**
 * Join a public asset path with the configured Astro base path.
 * Works both in .astro frontmatter and in client scripts.
 */
export function withBase(path: string): string {
	const base = import.meta.env.BASE_URL ?? "/";
	const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
	const cleanPath = path.startsWith("/") ? path.slice(1) : path;
	return `${cleanBase}/${cleanPath}`;
}
