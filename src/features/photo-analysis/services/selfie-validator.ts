/**
 * Client-Side Selfie & Portrait Quality Validator
 * ------------------------------------------------
 * Validates in real time that captured selfies are:
 * 1. Not blurry or out of focus (via discrete Laplacian variance)
 * 2. Properly illuminated (not severely under- or over-exposed)
 * 3. Containing a complete, centered face from forehead to chin without being cut off
 */

export interface SelfieValidationResult {
  valid: boolean;
  code?: 'blurry' | 'no_face' | 'face_cut_off' | 'face_too_far' | 'too_dark' | 'overexposed';
  title?: string;
  message?: string;
}

export async function validateSelfieImage(
  canvas: HTMLCanvasElement,
  mode: 'face' | 'body' = 'face'
): Promise<SelfieValidationResult> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { valid: true };

  const width = canvas.width;
  const height = canvas.height;

  // 1. Luminance & Exposure Check via downscaled sample
  const sampleW = 200;
  const sampleH = Math.round((height / width) * 200);
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleW;
  sampleCanvas.height = sampleH;
  const sCtx = sampleCanvas.getContext('2d');
  if (!sCtx) return { valid: true };

  sCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
  const imgData = sCtx.getImageData(0, 0, sampleW, sampleH);
  const d = imgData.data;

  let totalLuma = 0;
  const pixelCount = sampleW * sampleH;
  const gray = new Float32Array(pixelCount);

  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLuma += luma;
    gray[j] = luma;
  }

  const avgLuma = totalLuma / pixelCount;
  if (avgLuma < 30) {
    return {
      valid: false,
      code: 'too_dark',
      title: 'Lighting is too dark',
      message: 'Your face is in deep shadow. Please face towards a bright window or soft front light.',
    };
  }
  if (avgLuma > 246) {
    return {
      valid: false,
      code: 'overexposed',
      title: 'Photo is overexposed',
      message: 'Too much direct blinding light. Please adjust your angle so facial features are clearly visible.',
    };
  }

  // 2. Blur & Focus Sharpness Check (Discrete Laplacian Variance)
  let sumLap = 0;
  let sumLapSq = 0;
  let lapCount = 0;

  for (let y = 1; y < sampleH - 1; y++) {
    const row = y * sampleW;
    for (let x = 1; x < sampleW - 1; x++) {
      const idx = row + x;
      const lap =
        gray[idx - sampleW] +
        gray[idx + sampleW] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];
      sumLap += lap;
      sumLapSq += lap * lap;
      lapCount++;
    }
  }

  const meanLap = lapCount > 0 ? sumLap / lapCount : 0;
  const blurVariance = lapCount > 0 ? sumLapSq / lapCount - meanLap * meanLap : 100;

  // Sharp selfies on 200px downsample have variance >= 45. Blurry/defocused images drop below 32.
  if (blurVariance < 32) {
    return {
      valid: false,
      code: 'blurry',
      title: 'Selfie is blurry',
      message: 'Your photo is out of focus or motion-blurred. Please hold your phone steady at eye level and retake.',
    };
  }

  // 3. Full Face Presence & Framing Check
  if (mode === 'face') {
    // Check browser standard FaceDetector API if available
    if (typeof window !== 'undefined' && 'FaceDetector' in window) {
      try {
        const detector = new (window as unknown as { FaceDetector: new (opts: { fastMode: boolean; maxDetectedFaces: number }) => { detect: (canvas: HTMLCanvasElement) => Promise<Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>> } }).FaceDetector({
          fastMode: true,
          maxDetectedFaces: 2,
        });
        const faces = await detector.detect(canvas);

        if (!faces || faces.length === 0) {
          return {
            valid: false,
            code: 'no_face',
            title: 'No face detected',
            message: 'We could not detect a face. Please look directly into the camera inside the oval guide.',
          };
        }

        const face = faces[0].boundingBox;
        // Check if cut off at borders
        const edgeX = canvas.width * 0.03;
        const edgeY = canvas.height * 0.03;
        const isCutOff =
          face.x <= edgeX ||
          face.y <= edgeY ||
          face.x + face.width >= canvas.width - edgeX ||
          face.y + face.height >= canvas.height - edgeY;

        if (isCutOff) {
          return {
            valid: false,
            code: 'face_cut_off',
            title: 'Full face not in frame',
            message: 'Your face is cut off at the edge. Please ensure your complete face (forehead to chin) is clearly visible without being cut off.',
          };
        }

        // Check if face is too small
        if (face.height < canvas.height * 0.25 || face.width < canvas.width * 0.22) {
          return {
            valid: false,
            code: 'face_too_far',
            title: 'Face is too far away',
            message: 'Please hold the phone closer to fill the guide oval.',
          };
        }

        return { valid: true };
      } catch {
        // Fallback to skin & facial geometry heuristic below
      }
    }

    // Heuristic Fallback: Skin tone & facial region distribution in central oval
    let centerSkinPixels = 0;
    let centerTotalPixels = 0;
    let topEdgeSkinPixels = 0;
    let bottomEdgeSkinPixels = 0;

    const startX = Math.floor(sampleW * 0.22);
    const endX = Math.floor(sampleW * 0.78);
    const startY = Math.floor(sampleH * 0.18);
    const endY = Math.floor(sampleH * 0.82);

    for (let y = 0; y < sampleH; y++) {
      for (let x = 0; x < sampleW; x++) {
        const idx = (y * sampleW + x) * 4;
        const r = d[idx];
        const g = d[idx + 1];
        const b = d[idx + 2];

        // Standard YCbCr skin tone detection
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const isSkin = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;

        if (x >= startX && x <= endX && y >= startY && y <= endY) {
          centerTotalPixels++;
          if (isSkin) centerSkinPixels++;
        }

        if (y < sampleH * 0.04 && isSkin) topEdgeSkinPixels++;
        if (y > sampleH * 0.96 && isSkin) bottomEdgeSkinPixels++;
      }
    }

    const skinRatio = centerTotalPixels > 0 ? centerSkinPixels / centerTotalPixels : 0;

    if (skinRatio < 0.12) {
      return {
        valid: false,
        code: 'no_face',
        title: 'Full face not detected',
        message: 'Please align your full face clearly inside the center oval guide.',
      };
    }

    // If skin pixels touch both extreme top and bottom, face is badly cut off
    if (topEdgeSkinPixels > sampleW * 0.40 && bottomEdgeSkinPixels > sampleW * 0.40) {
      return {
        valid: false,
        code: 'face_cut_off',
        title: 'Full face cut off',
        message: 'Your forehead or chin is cut off. Please step back slightly so your entire face fits inside the guide.',
      };
    }
  }

  return { valid: true };
}
