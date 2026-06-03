// SQL files imported with `import x from "./foo.sql" with { type: "text" }`
// resolve to their raw text contents. Bun's bundler embeds them into the
// `bun build --compile` binary, so migrations ship inside the executable
// instead of being read from disk at runtime (which breaks under --compile,
// where import.meta.url points into the virtual `/$bunfs` root).
declare module "*.sql" {
	const content: string;
	export default content;
}
