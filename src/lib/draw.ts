/**
 * Skeleton overlay rendering on a <canvas> sized to the video frame.
 * The canvas is expected to be CSS-mirrored together with the video preview,
 * so drawing happens in raw (unmirrored) video coordinates.
 */
import {
	DrawingUtils,
	HandLandmarker,
	PoseLandmarker,
	type HandLandmarkerResult,
	type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

const utilsCache = new WeakMap<HTMLCanvasElement, { ctx: CanvasRenderingContext2D; utils: DrawingUtils }>();

function getUtils(canvas: HTMLCanvasElement) {
	let entry = utilsCache.get(canvas);
	if (!entry) {
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("2d context unavailable");
		entry = { ctx, utils: new DrawingUtils(ctx) };
		utilsCache.set(canvas, entry);
	}
	return entry;
}

export function syncCanvasSize(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
	if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
	if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
}

export function clearCanvas(canvas: HTMLCanvasElement) {
	const { ctx } = getUtils(canvas);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function drawHands(canvas: HTMLCanvasElement, result: HandLandmarkerResult) {
	const { utils } = getUtils(canvas);
	for (const landmarks of result.landmarks) {
		utils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: "#4ade80", lineWidth: 4 });
		utils.drawLandmarks(landmarks, { color: "#f0fdf4", fillColor: "#22c55e", radius: 5 });
	}
}

export function drawPose(canvas: HTMLCanvasElement, result: PoseLandmarkerResult) {
	const { utils } = getUtils(canvas);
	for (const landmarks of result.landmarks) {
		utils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: "#38bdf8", lineWidth: 4 });
		utils.drawLandmarks(landmarks, { color: "#f0f9ff", fillColor: "#0ea5e9", radius: 4 });
	}
}
