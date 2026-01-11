export const LoadingScreen = () => {
	return (
		<div id="loading-screen">
			<h1>Sandcastle</h1>
			<div className="loading-spinner">
				<span className="pixel"></span>
				<span className="pixel"></span>
				<span className="pixel"></span>
				<span className="pixel"></span>
				<span className="pixel-center"></span>
				<span className="pixel"></span>
				<span className="pixel"></span>
				<span className="pixel"></span>
				<span className="pixel"></span>
			</div>
			<style>
				{`
      #loading-screen {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: oklch(1 0 0);
        z-index: 9999;
        font-family: Inter, system-ui, sans-serif;
      }
      .dark #loading-screen {
        background: oklch(0.145 0 0);
      }
      #loading-screen h1 {
        font-size: 1.5rem;
        font-weight: 500;
        margin-bottom: 1.5rem;
        color: oklch(0.145 0 0);
      }
      .dark #loading-screen h1 {
        color: oklch(0.985 0 0);
      }
      /* CSS-only pixel spinner */
      .loading-spinner {
        --pixel-size: 8px;
        --gap: 2px;
        --active-color: oklch(0.145 0 0);
        --inactive-color: oklch(0.145 0 0 / 0.05);
        display: grid;
        grid-template-columns: repeat(3, var(--pixel-size));
        gap: var(--gap);
      }
      .dark .loading-spinner {
        --active-color: oklch(0.985 0 0);
        --inactive-color: oklch(0.985 0 0 / 0.05);
      }
      .loading-spinner .pixel {
        width: var(--pixel-size);
        height: var(--pixel-size);
        border-radius: 1px;
        background: var(--inactive-color);
      }
      .loading-spinner .pixel-center {
        width: var(--pixel-size);
        height: var(--pixel-size);
        background: transparent;
      }
      /* Clockwise animation: positions 0,1,2,3,5,6,7,8 map to ring 0-7 */
      .loading-spinner .pixel:nth-child(1) {
        animation: pixel-fade 640ms ease-in-out infinite 0ms;
      }
      .loading-spinner .pixel:nth-child(2) {
        animation: pixel-fade 640ms ease-in-out infinite 80ms;
      }
      .loading-spinner .pixel:nth-child(3) {
        animation: pixel-fade 640ms ease-in-out infinite 160ms;
      }
      .loading-spinner .pixel:nth-child(6) {
        animation: pixel-fade 640ms ease-in-out infinite 240ms;
      }
      .loading-spinner .pixel:nth-child(9) {
        animation: pixel-fade 640ms ease-in-out infinite 320ms;
      }
      .loading-spinner .pixel:nth-child(8) {
        animation: pixel-fade 640ms ease-in-out infinite 400ms;
      }
      .loading-spinner .pixel:nth-child(7) {
        animation: pixel-fade 640ms ease-in-out infinite 480ms;
      }
      .loading-spinner .pixel:nth-child(4) {
        animation: pixel-fade 640ms ease-in-out infinite 560ms;
      }
      @keyframes pixel-fade {
        0%,
        100% {
          background: var(--inactive-color);
        }
        12.5%,
        50% {
          background: var(--active-color);
        }
      }
`}
			</style>
		</div>
	);
};
