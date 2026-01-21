import {
	CheckCircle,
	Info,
	Warning,
	WarningOctagon,
} from "@phosphor-icons/react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { Spinner } from "@/components/spinner";
import { useTheme } from "@/context/theme-context";

const Toaster = ({ ...props }: ToasterProps) => {
	const { resolvedTheme } = useTheme();

	return (
		<Sonner
			theme={resolvedTheme as ToasterProps["theme"]}
			className="toaster group"
			closeButton
			icons={{
				success: <CheckCircle className="size-4 text-green-400" />,
				info: <Info className="size-4 text-blue-400" />,
				warning: <Warning className="size-4 text-amber-400" />,
				error: <WarningOctagon className="size-4 text-red-400" />,
				loading: <Spinner className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: "cn-toast",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
