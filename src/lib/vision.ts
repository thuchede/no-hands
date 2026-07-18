/**
 * Single inference loop over the shared camera.
 * Components subscribe with the models they need; models are created lazily
 * and the loop only runs the models at least one subscriber asked for.
 */
import {
	FilesetResolver,
	HandLandmarker,
	PoseLandmarker,
	GestureRecognizer,
	type HandLandmarkerResult,
	type PoseLandmarkerResult,
	type GestureRecognizerResult,
} from "@mediapipe/tasks-vision";
import { acquireCamera, getSharedVideo } from "./camera";
import { withBase } from "./paths";

export interface VisionNeeds {
	hands?: boolean;
	pose?: boolean;
	gestures?: boolean;
}

export interface FrameResults {
	hands?: HandLandmarkerResult;
	pose?: PoseLandmarkerResult;
	gestures?: GestureRecognizerResult;
	video: HTMLVideoElement;
	timestamp: number;
	fps: number;
}

type Subscriber = { needs: VisionNeeds; cb: (results: FrameResults) => void };

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
function getFileset() {
	filesetPromise ??= FilesetResolver.forVisionTasks(withBase("wasm"));
	return filesetPromise;
}

// GPU delegate first, CPU fallback (older browsers / drivers).
async function createWithFallback<T>(create: (delegate: "GPU" | "CPU") => Promise<T>): Promise<T> {
	try {
		return await create("GPU");
	} catch (err) {
		console.warn("[vision] GPU delegate failed, falling back to CPU", err);
		return create("CPU");
	}
}

let handLandmarkerPromise: Promise<HandLandmarker> | null = null;
function getHandLandmarker() {
	handLandmarkerPromise ??= getFileset().then((fileset) =>
		createWithFallback((delegate) =>
			HandLandmarker.createFromOptions(fileset, {
				baseOptions: { modelAssetPath: withBase("models/hand_landmarker.task"), delegate },
				runningMode: "VIDEO",
				numHands: 2,
			}),
		),
	);
	return handLandmarkerPromise;
}

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null;
function getPoseLandmarker() {
	poseLandmarkerPromise ??= getFileset().then((fileset) =>
		createWithFallback((delegate) =>
			PoseLandmarker.createFromOptions(fileset, {
				baseOptions: { modelAssetPath: withBase("models/pose_landmarker_lite.task"), delegate },
				runningMode: "VIDEO",
				numPoses: 1,
			}),
		),
	);
	return poseLandmarkerPromise;
}

let gestureRecognizerPromise: Promise<GestureRecognizer> | null = null;
function getGestureRecognizer() {
	gestureRecognizerPromise ??= getFileset().then((fileset) =>
		createWithFallback((delegate) =>
			GestureRecognizer.createFromOptions(fileset, {
				baseOptions: { modelAssetPath: withBase("models/gesture_recognizer.task"), delegate },
				runningMode: "VIDEO",
				numHands: 2,
			}),
		),
	);
	return gestureRecognizerPromise;
}

const subscribers = new Set<Subscriber>();
let running = false;
let cameraRef: { release: () => void } | null = null;
let lastTimestamp = 0;
let fps = 0;
let consecutiveFailures = 0;
const MAX_FAILURES = 10;

/**
 * Subscribe to per-frame inference results. Returns an unsubscribe function.
 * The camera and the loop start with the first subscriber and stop with the last.
 */
export function subscribeVision(needs: VisionNeeds, cb: (results: FrameResults) => void): () => void {
	const sub: Subscriber = { needs, cb };
	subscribers.add(sub);
	if (!cameraRef) cameraRef = acquireCamera();
	if (!running) {
		running = true;
		consecutiveFailures = 0;
		requestAnimationFrame(pump);
	}
	return () => {
		subscribers.delete(sub);
		if (subscribers.size === 0) {
			cameraRef?.release();
			cameraRef = null;
		}
	};
}

function unionNeeds(): VisionNeeds {
	const union: VisionNeeds = {};
	for (const { needs } of subscribers) {
		if (needs.hands) union.hands = true;
		if (needs.pose) union.pose = true;
		if (needs.gestures) union.gestures = true;
	}
	return union;
}

async function pump() {
	if (subscribers.size === 0) {
		running = false;
		return;
	}
	try {
		const video = await getSharedVideo();
		const needs = unionNeeds();
		const timestamp = performance.now();

		if (video.readyState >= 2 && video.videoWidth > 0 && timestamp > lastTimestamp) {
			lastTimestamp = timestamp;

			const results: FrameResults = { video, timestamp, fps };
			if (needs.hands) results.hands = (await getHandLandmarker()).detectForVideo(video, timestamp);
			if (needs.pose) results.pose = (await getPoseLandmarker()).detectForVideo(video, timestamp);
			if (needs.gestures) results.gestures = (await getGestureRecognizer()).recognizeForVideo(video, timestamp);

			const elapsed = performance.now() - timestamp;
			const instantFps = 1000 / Math.max(elapsed, 1000 / 60);
			fps = fps === 0 ? instantFps : fps * 0.9 + instantFps * 0.1;

			for (const sub of [...subscribers]) sub.cb(results);
			consecutiveFailures = 0;
		}
	} catch (err) {
		if (++consecutiveFailures >= MAX_FAILURES) {
			console.error("[vision] stopping after repeated failures (camera denied?)", err);
			running = false;
			return;
		}
	}
	if (subscribers.size > 0) requestAnimationFrame(pump);
	else running = false;
}
