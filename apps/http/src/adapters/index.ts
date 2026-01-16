export {
	ClaudeCodeAgentAdapter,
	createMessageAccumulator,
	type DualProcessResult,
	processMessageDual,
	type SessionMetadata,
} from "./claude";

export { AdapterTransformError, UnsupportedMessageError } from "./errors";
export type {
	AccumulatorConfig,
	AdapterConfig,
	AgentAdapter,
	MessageAccumulator,
} from "./types";
