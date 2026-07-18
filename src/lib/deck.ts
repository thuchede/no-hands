/**
 * Thin wrapper around the Reveal.js singleton: deck registration,
 * slide-visibility lifecycle for demo components, and the commands
 * the gesture controller can trigger.
 */
import type Reveal from "reveal.js";

type DeckApi = typeof Reveal;

let deck: DeckApi | null = null;
const readyCallbacks: Array<(deck: DeckApi) => void> = [];

/** Called once from the layout after Reveal.initialize() resolves. */
export function registerDeck(instance: DeckApi) {
	deck = instance;
	for (const cb of readyCallbacks.splice(0)) cb(instance);
}

export function onDeckReady(cb: (deck: DeckApi) => void) {
	if (deck) cb(deck);
	else readyCallbacks.push(cb);
}

/**
 * Run show/hide when the <section> containing `el` becomes the current
 * slide (or stops being it). Fires immediately for the initial slide.
 */
export function onSlideVisible(el: HTMLElement, show: () => void, hide: () => void) {
	onDeckReady((deck) => {
		const section = el.closest("section");
		if (!section) return;
		let visible = false;
		const check = () => {
			const current = deck.getCurrentSlide() as HTMLElement | null;
			const nowVisible = !!current && (current === section || section.contains(current) || current.contains(section));
			if (nowVisible && !visible) {
				visible = true;
				show();
			} else if (!nowVisible && visible) {
				visible = false;
				hide();
			}
		};
		deck.on("slidechanged", check);
		check();
	});
}

// --- Deck commands (keyboard and gesture controller both end up here) ---

let zoomLevel = 1;

function applyZoom() {
	const viewport = document.querySelector<HTMLElement>(".reveal");
	if (!viewport) return;
	viewport.style.transition = "transform 0.3s ease";
	viewport.style.transformOrigin = "50% 50%";
	viewport.style.transform = zoomLevel === 1 ? "" : `scale(${zoomLevel})`;
}

export const deckCommands = {
	next: () => deck?.next(),
	prev: () => deck?.prev(),
	overview: () => deck?.toggleOverview(),
	zoomIn: () => {
		zoomLevel = Math.min(2, zoomLevel + 0.25);
		applyZoom();
	},
	zoomOut: () => {
		zoomLevel = Math.max(1, zoomLevel - 0.25);
		applyZoom();
	},
	escape: () => {
		zoomLevel = 1;
		applyZoom();
		if (deck?.isOverview()) deck.toggleOverview();
	},
	fullscreen: () => {
		// Note: browsers require user activation for requestFullscreen();
		// gesture-triggered calls may be rejected in some browsers ('f' key is the reliable path).
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		} else {
			document.documentElement.requestFullscreen().catch((err) => {
				console.warn("[deck] fullscreen rejected (needs user activation?)", err);
			});
		}
	},
};
