/**
 * ASL fingerspelling from hand landmarks:
 * - normalize 21 landmarks into a position/scale-invariant 63-dim vector
 * - classify with a small kNN over recorded samples (see /calibrate)
 * - debounce stable letters into words ("subtitles")
 *
 * Static poses only: letters J and Z involve motion and are not supported.
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { withBase } from "./paths";

export interface Sample {
	label: string;
	vec: number[];
}

export const SAMPLES_STORAGE_KEY = "nohands.asl-samples";
export const SUPPORTED_LETTERS = "ABCDEFGHIKLMNOPQRSTUVWXY".split(""); // no J/Z (motion letters)

/**
 * Translate to wrist origin, scale by hand size, flip left hands so one
 * sample set covers both hands. Returns a flat [x0,y0,z0, x1,y1,z1, ...].
 */
export function normalizeLandmarks(landmarks: NormalizedLandmark[], isLeftHand: boolean): number[] {
	const wrist = landmarks[0];
	let scale = 0;
	for (const lm of landmarks) {
		const d = Math.hypot(lm.x - wrist.x, lm.y - wrist.y, lm.z - wrist.z);
		if (d > scale) scale = d;
	}
	if (scale === 0) scale = 1;
	const vec: number[] = [];
	for (const lm of landmarks) {
		const x = (lm.x - wrist.x) / scale;
		vec.push(isLeftHand ? -x : x, (lm.y - wrist.y) / scale, (lm.z - wrist.z) / scale);
	}
	return vec;
}

function distance(a: number[], b: number[]): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const d = a[i] - b[i];
		sum += d * d;
	}
	return Math.sqrt(sum);
}

export interface Prediction {
	label: string;
	/** 0..1, share of the k nearest neighbors agreeing on the label */
	confidence: number;
}

export class KnnClassifier {
	constructor(
		public samples: Sample[] = [],
		private k = 5,
		/** reject predictions whose nearest agreeing neighbor is farther than this */
		private maxDistance = 0.9,
	) {}

	classify(vec: number[]): Prediction | null {
		if (this.samples.length === 0) return null;
		const k = Math.min(this.k, this.samples.length);
		const nearest = this.samples
			.map((s) => ({ label: s.label, dist: distance(vec, s.vec) }))
			.sort((a, b) => a.dist - b.dist)
			.slice(0, k);
		const votes = new Map<string, { count: number; best: number }>();
		for (const n of nearest) {
			const v = votes.get(n.label) ?? { count: 0, best: Infinity };
			v.count++;
			v.best = Math.min(v.best, n.dist);
			votes.set(n.label, v);
		}
		const [label, v] = [...votes.entries()].sort((a, b) => b[1].count - a[1].count)[0];
		if (v.best > this.maxDistance) return null;
		return { label, confidence: v.count / k };
	}
}

/** Load samples recorded on /calibrate (localStorage), else the bundled set. */
export async function loadSamples(): Promise<Sample[]> {
	try {
		const stored = localStorage.getItem(SAMPLES_STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored) as Sample[];
			if (Array.isArray(parsed) && parsed.length > 0) return parsed;
		}
	} catch {
		// fall through to bundled set
	}
	try {
		const res = await fetch(withBase("samples/asl-samples.json"));
		if (res.ok) {
			const parsed = (await res.json()) as Sample[];
			if (Array.isArray(parsed)) return parsed;
		}
	} catch {
		// no bundled samples
	}
	return [];
}

export function saveSamples(samples: Sample[]) {
	localStorage.setItem(SAMPLES_STORAGE_KEY, JSON.stringify(samples));
}

export interface TyperState {
	/** committed text, including the word in progress */
	text: string;
	/** letter currently being held, if any */
	candidate: string | null;
	/** 0..1 progress toward committing the candidate */
	progress: number;
}

/**
 * Turns a per-frame stream of predictions into typed text.
 * A letter must stay stable for `stableFrames` to be committed; committing
 * the same letter twice requires losing the hand (or another letter) in between.
 * A hand absence longer than `wordGapMs` ends the word.
 */
export class LetterTyper {
	private stableLabel: string | null = null;
	private stableCount = 0;
	private lastCommitted: string | null = null;
	private lastSeen = 0;
	private wordOpen = false;
	text = "";

	constructor(
		private onChange: (state: TyperState) => void,
		private stableFrames = 12,
		private wordGapMs = 1500,
	) {}

	feed(prediction: Prediction | null, now: number) {
		if (prediction) {
			this.lastSeen = now;
			if (prediction.label === this.stableLabel) {
				this.stableCount++;
			} else {
				this.stableLabel = prediction.label;
				this.stableCount = 1;
				// a different letter re-arms repetition of the previous one
				if (prediction.label !== this.lastCommitted) this.lastCommitted = null;
			}
			if (this.stableCount >= this.stableFrames && this.stableLabel !== this.lastCommitted) {
				this.text += this.stableLabel;
				this.lastCommitted = this.stableLabel;
				this.wordOpen = true;
				this.stableCount = 0;
			}
		} else {
			this.stableLabel = null;
			this.stableCount = 0;
			this.lastCommitted = null; // hand lost: same letter may be typed again
			if (this.wordOpen && this.lastSeen > 0 && now - this.lastSeen > this.wordGapMs) {
				this.text += " ";
				this.wordOpen = false;
			}
		}
		this.onChange({
			text: this.text,
			candidate: this.stableLabel,
			progress: this.stableLabel ? Math.min(this.stableCount / this.stableFrames, 1) : 0,
		});
	}

	clear() {
		this.text = "";
		this.stableLabel = null;
		this.stableCount = 0;
		this.lastCommitted = null;
		this.wordOpen = false;
		this.onChange({ text: "", candidate: null, progress: 0 });
	}
}
