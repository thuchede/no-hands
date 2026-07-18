/**
 * Temporal gesture detection on top of MediaPipe's GestureRecognizer:
 * canned per-frame categories (Open_Palm, Closed_Fist, ...) plus landmark
 * trails over time become deck commands, with cooldowns so one physical
 * motion fires exactly one command.
 *
 * Mapping:
 * - open palm swipe left/right -> next / prev
 * - pinch spread / close       -> zoom in / out
 * - fist held ~0.8s            -> escape (reset zoom / exit overview), fist again -> overview
 * - two open palms held ~0.8s  -> fullscreen toggle
 */
import type { GestureRecognizerResult } from "@mediapipe/tasks-vision";
import { subscribeVision } from "./vision";

export type GestureCommand = "next" | "prev" | "zoom-in" | "zoom-out" | "overview" | "fullscreen";

export interface GestureEventMap {
	command: CustomEvent<{ command: GestureCommand }>;
	state: CustomEvent<{ enabled: boolean }>;
	frame: CustomEvent<{ label: string | null }>;
}

const COOLDOWN_MS = 900;
const SWIPE_WINDOW_MS = 500;
const SWIPE_MIN_DX = 0.22; // fraction of frame width
const HOLD_MS = 800;
const PINCH_WINDOW_MS = 450;
const PINCH_IN_RATIO = 1.5;
const PINCH_OUT_RATIO = 0.65;

interface TrailPoint {
	t: number;
	x: number;
}

export class GestureController extends EventTarget {
	private unsubscribe: (() => void) | null = null;
	private cooldownUntil = 0;
	private palmTrail: TrailPoint[] = [];
	private pinchTrail: TrailPoint[] = [];
	private fistSince = 0;
	private twoPalmsSince = 0;

	get enabled() {
		return this.unsubscribe !== null;
	}

	setEnabled(enabled: boolean) {
		if (enabled === this.enabled) return;
		if (enabled) {
			this.unsubscribe = subscribeVision({ gestures: true }, (r) => {
				if (r.gestures) this.onFrame(r.gestures, r.timestamp);
			});
		} else {
			this.unsubscribe?.();
			this.unsubscribe = null;
			this.resetTrails();
		}
		this.dispatchEvent(new CustomEvent("state", { detail: { enabled } }));
	}

	toggle() {
		this.setEnabled(!this.enabled);
	}

	private resetTrails() {
		this.palmTrail = [];
		this.pinchTrail = [];
		this.fistSince = 0;
		this.twoPalmsSince = 0;
	}

	private fire(command: GestureCommand, now: number) {
		this.cooldownUntil = now + COOLDOWN_MS;
		this.resetTrails();
		this.dispatchEvent(new CustomEvent("command", { detail: { command } }));
	}

	private onFrame(result: GestureRecognizerResult, now: number) {
		const labels = result.gestures.map((g) => g[0]?.categoryName ?? "None");
		const primary = labels[0] ?? null;
		this.dispatchEvent(new CustomEvent("frame", { detail: { label: result.landmarks.length ? primary : null } }));

		if (now < this.cooldownUntil) return;
		if (result.landmarks.length === 0) {
			this.resetTrails();
			return;
		}

		// Two open palms held -> fullscreen
		const openPalms = labels.filter((l) => l === "Open_Palm").length;
		if (result.landmarks.length >= 2 && openPalms >= 2) {
			if (this.twoPalmsSince === 0) this.twoPalmsSince = now;
			if (now - this.twoPalmsSince > HOLD_MS) this.fire("fullscreen", now);
			return; // two-hand pose: skip single-hand detection
		}
		this.twoPalmsSince = 0;

		const landmarks = result.landmarks[0];
		const label = labels[0];

		// Open palm horizontal swipe -> next/prev
		if (label === "Open_Palm") {
			const wristX = landmarks[0].x;
			this.palmTrail.push({ t: now, x: wristX });
			this.palmTrail = this.palmTrail.filter((p) => now - p.t <= SWIPE_WINDOW_MS);
			const dx = wristX - this.palmTrail[0].x;
			if (Math.abs(dx) > SWIPE_MIN_DX) {
				// Image coords are mirrored vs. the presenter: hand moving to the
				// presenter's left increases x. Swiping left = "push the slide away" = next.
				this.fire(dx > 0 ? "next" : "prev", now);
			}
			this.fistSince = 0;
			this.pinchTrail = [];
			return;
		}
		this.palmTrail = [];

		// Fist held -> escape/overview
		if (label === "Closed_Fist") {
			if (this.fistSince === 0) this.fistSince = now;
			if (now - this.fistSince > HOLD_MS) this.fire("overview", now);
			this.pinchTrail = [];
			return;
		}
		this.fistSince = 0;

		// Pinch spread/close -> zoom (any non-palm/fist hand shape)
		const thumb = landmarks[4];
		const index = landmarks[8];
		const wrist = landmarks[0];
		const middleMcp = landmarks[9];
		const handSpan = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y) || 1;
		const pinch = Math.hypot(thumb.x - index.x, thumb.y - index.y) / handSpan;
		this.pinchTrail.push({ t: now, x: pinch });
		this.pinchTrail = this.pinchTrail.filter((p) => now - p.t <= PINCH_WINDOW_MS);
		const first = this.pinchTrail[0].x;
		if (first > 0.05) {
			const ratio = pinch / first;
			if (ratio > PINCH_IN_RATIO) this.fire("zoom-in", now);
			else if (ratio < PINCH_OUT_RATIO) this.fire("zoom-out", now);
		}
	}
}

/** Deck-wide singleton, shared by the HUD, the finale slide, and the 'g' key. */
export const gestureController = new GestureController();
