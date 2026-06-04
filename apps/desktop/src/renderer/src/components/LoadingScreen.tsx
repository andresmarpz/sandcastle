import logo from "@/assets/logo.png";

function LoadingScreen(): React.JSX.Element {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
			<img src={logo} alt="Sandcastle" className="h-36 w-36 grayscale" />
		</div>
	);
}

export default LoadingScreen;
