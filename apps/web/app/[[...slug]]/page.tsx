"use client";

import dynamic from "next/dynamic";

// Dynamically import the entire app with SSR disabled
// BrowserRouter requires document/window which don't exist during SSR
const ClientApp = dynamic(() => import("./client-app"), { ssr: false });

export default function Page() {
	return <ClientApp />;
}
