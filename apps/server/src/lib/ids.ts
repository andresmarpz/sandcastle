import { randomUUID } from "node:crypto"
import { SessionId, WorkspaceId } from "@sandcastle/contracts"

export const newWorkspaceId = (): WorkspaceId => WorkspaceId.make(randomUUID())
export const newSessionId = (): SessionId => SessionId.make(randomUUID())

export const shortId = (id: string): string => id.split("-")[0] ?? id.slice(0, 8)
