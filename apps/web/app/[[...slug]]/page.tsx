"use client";

import dynamic from "next/dynamic";

const ClientOnly = dynamic(() => import("./client-only"), { ssr: false });

export default function ClientApp() {
	return <ClientOnly />;
}
