"use client";

import dynamic from "next/dynamic";
import { PlatformProvider } from "@/context/platform-context";

const Layout = dynamic(() => import("@sandcastle/ui/features/app/layout"), {
	ssr: false,
});

export default function ClientApp() {
	return (
		<PlatformProvider openDirectory={async () => null}>
			<Layout />
		</PlatformProvider>
	);
}
