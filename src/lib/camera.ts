/**
 * Shared webcam access. One getUserMedia stream for the whole deck,
 * refcounted so the camera turns off when no demo needs it.
 */
let streamPromise: Promise<MediaStream> | null = null;
let consumers = 0;

async function openStream(): Promise<MediaStream> {
	return navigator.mediaDevices.getUserMedia({
		video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
		audio: false,
	});
}

/** Acquire the shared camera stream. Call the returned release() when done. */
export function acquireCamera(): { stream: Promise<MediaStream>; release: () => void } {
	consumers++;
	if (!streamPromise) {
		streamPromise = openStream().catch((err) => {
			streamPromise = null;
			throw err;
		});
	}
	const acquired = streamPromise;
	let released = false;
	return {
		stream: acquired,
		release: () => {
			if (released) return;
			released = true;
			consumers--;
			if (consumers <= 0) {
				consumers = 0;
				const toStop = streamPromise;
				streamPromise = null;
				sharedVideoPromise = null;
				toStop?.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
			}
		},
	};
}

let sharedVideoPromise: Promise<HTMLVideoElement> | null = null;

/**
 * Off-DOM <video> used as the single inference source.
 * Callers must hold their own acquireCamera() ref while using it.
 */
export function getSharedVideo(): Promise<HTMLVideoElement> {
	sharedVideoPromise ??= (async () => {
		if (!streamPromise) throw new Error("getSharedVideo() called with no active camera consumer");
		const stream = await streamPromise;
		const video = document.createElement("video");
		video.muted = true;
		video.playsInline = true;
		video.srcObject = stream;
		await video.play();
		return video;
	})();
	return sharedVideoPromise;
}

/** Attach the shared stream to a visible <video> element for display. */
export async function attachPreview(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
	video.muted = true;
	video.playsInline = true;
	video.srcObject = stream;
	await video.play();
}
