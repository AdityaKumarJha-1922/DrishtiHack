// Front-camera distance check. MediaPipe Face Landmarker finds the irises;
// the brain turns iris size into distance (src/brain/phoneTests.ts).
//
// The library and its 13 MB of WebAssembly load only when a near test or the
// camera calibration starts (`import()` below), never at app start.
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { irisDiameterPx, RULES } from "../../brain";

let landmarker: Promise<FaceLandmarker> | null = null;

function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarker) {
    landmarker = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks("/mediapipe"); // bundled, works offline
      return FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate: "CPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    })();
    landmarker.catch(() => { landmarker = null; }); // allow a retry after a failed load
  }
  return landmarker;
}

export type CameraStatus = "starting" | "ready" | "no_face" | "unavailable";

export interface IrisCamera {
  /** Collects iris widths (px) from the next `samples` frames with a face, plus the frame width. */
  read(): Promise<{ samplesPx: number[]; frameW: number } | null>;
  stop(): void;
}

/** Starts the front camera into `video` and keeps reporting a status. Null when no camera can start. */
export async function startIrisCamera(video: HTMLVideoElement, onStatus: (s: CameraStatus) => void): Promise<IrisCamera | null> {
  onStatus("starting");
  if (!navigator.mediaDevices?.getUserMedia) { onStatus("unavailable"); return null; }
  let stream: MediaStream;
  let lm: FaceLandmarker;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    video.srcObject = stream;
    await video.play();
    lm = await getLandmarker();
  } catch {
    onStatus("unavailable");
    return null;
  }

  let running = true;
  let latest: number | null = null;
  const waiting: ((px: number | null) => void)[] = [];

  // One detection per animation frame (about 30 a second).
  const loop = () => {
    if (!running) return;
    if (video.readyState >= 2) {
      const result = lm.detectForVideo(video, performance.now());
      const face = result.faceLandmarks?.[0];
      latest = face ? irisDiameterPx(face, video.videoWidth, video.videoHeight) : null;
      onStatus(latest ? "ready" : "no_face");
      const w = waiting.splice(0);
      w.forEach((resolve) => resolve(latest));
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const nextFrame = () => new Promise<number | null>((resolve) => waiting.push(resolve));

  return {
    async read() {
      const n = RULES.phone_tests.camera.samples;
      const px: number[] = [];
      for (let i = 0; i < n * 3 && px.length < n; i++) {
        const v = await nextFrame();
        if (v) px.push(v);
      }
      if (px.length < n) return null;
      return { samplesPx: px, frameW: video.videoWidth };
    },
    stop() {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
      waiting.splice(0).forEach((resolve) => resolve(null));
    },
  };
}
