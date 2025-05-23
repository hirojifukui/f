// script.js
const video = document.getElementById('video')

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
  faceapi.nets.faceRecognitionNet.loadFromUri('models'),
  faceapi.nets.faceExpressionNet.loadFromUri('models')
]).then(startVideo)

function startVideo() {
  navigator.getUserMedia(
    { video: {} },
    stream => video.srcObject = stream,
    err => console.error(err)
  )
}

video.addEventListener('play', () => {
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // offscreen canvas for pixel sampling
  const offCanvas = document.createElement('canvas')
  offCanvas.width = video.width
  offCanvas.height = video.height
  const offCtx = offCanvas.getContext('2d')

  faceapi.matchDimensions(canvas, { width: video.width, height: video.height })

  setInterval(async () => {
    // draw current frame offscreen
    offCtx.drawImage(video, 0, 0, video.width, video.height)

    // detect faces + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, {
      width: video.width,
      height: video.height
    })

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    resized.forEach(det => {
      const { detection, landmarks } = det
      const box = detection.box

      // compute jaw‐outline width
      const jaw = landmarks.getJawOutline()
      const xs = jaw.map(p => p.x)
      const minXjaw = Math.min(...xs)
      const maxXjaw = Math.max(...xs)
      const faceWidth = maxXjaw - minXjaw

      // ellipse parameters
      const centerX = minXjaw + faceWidth / 2
      const centerY = box.y + box.height / 2
      const radiusX = faceWidth / 2
      const radiusY = box.height / 2

      fillOvalWithBlend(offCtx, ctx, centerX, centerY, radiusX, radiusY)
    })
  }, 100)
})

/**
 * Samples the **central** 60% of the ellipse to get a cleaner average color,
 * then fills the full ellipse at 20% opacity.
 */
function fillOvalWithBlend(srcCtx, dstCtx, cx, cy, rx, ry) {
  const sampleFactor = 0.6
  const srX = rx * sampleFactor
  const srY = ry * sampleFactor

  // bounding box for the entire ellipse
  const minX = Math.floor(cx - rx)
  const minY = Math.floor(cy - ry)
  const width = Math.ceil(rx * 2)
  const height = Math.ceil(ry * 2)

  const img = srcCtx.getImageData(minX, minY, width, height)
  const data = img.data

  let rSum = 0, gSum = 0, bSum = 0, count = 0

  // only sample pixels inside the inner ellipse
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = minX + x
      const py = minY + y
      const dx = (px - cx) / srX
      const dy = (py - cy) / srY
      if (dx*dx + dy*dy <= 1) {
        const idx = (y * width + x) * 4
        rSum += data[idx]
        gSum += data[idx + 1]
        bSum += data[idx + 2]
        count++
      }
    }
  }
  if (!count) return

  // compute average and set 20% opacity
  const r = Math.round(rSum / count)
  const g = Math.round(gSum / count)
  const b = Math.round(bSum / count)
  dstCtx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`

  // draw full face‐width ellipse
  dstCtx.beginPath()
  dstCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2)
  dstCtx.fill()
}
