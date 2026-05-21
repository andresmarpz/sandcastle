import { WorkspaceId } from "@sandcastle/contracts";
import {
	createHashHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
} from "@tanstack/react-router";

import Layout from "@/components/Layout";
import ProjectsIndex from "@/components/ProjectsIndex";
import SettingsRoute from "@/components/SettingsRoute";
import WorkspaceRedirect from "@/components/WorkspaceRedirect";
import WorkspaceView from "@/components/WorkspaceView";

const rootRoute = createRootRoute({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: ProjectsIndex,
});

const workspaceRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspaces/$wsId",
	component: function WorkspaceRoute() {
		const { wsId } = workspaceRoute.useParams();
		return <WorkspaceRedirect workspaceId={WorkspaceId.make(wsId)} />;
	},
});

const tabRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspaces/$wsId/tabs/$tabId",
	component: function TabRoute() {
		const { wsId, tabId } = tabRoute.useParams();
		return <WorkspaceView workspaceId={WorkspaceId.make(wsId)} tabId={tabId} />;
	},
});

const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings",
	component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([indexRoute, workspaceRoute, tabRoute, settingsRoute]);

export const router = createRouter({
	routeTree,
	history: createHashHistory(),
	defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
