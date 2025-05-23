// script.js
const video = document.getElementById('video')

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
]).then(startVideo)

function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: {} })
    .then(stream => video.srcObject = stream)
    .catch(err => console.error(err))
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

    // clear previous overlays
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // for each face, blur each feature
    resized.forEach(det => {
      const lm = det.landmarks
      const features = [
        lm.getLeftEye(),
        lm.getRightEye(),
        lm.getNose(),
        lm.getMouth()
      ]

      features.forEach(region => {
        // compute tight bounding box + small margin
        const xs = region.map(p => p.x), ys = region.map(p => p.y)
        const margin = 25
        const x0 = Math.max(0, Math.floor(Math.min(...xs) - margin))
        const y0 = Math.max(0, Math.floor(Math.min(...ys) - margin))
        const x1 = Math.min(video.width,  Math.ceil(Math.max(...xs) + margin))
        const y1 = Math.min(video.height, Math.ceil(Math.max(...ys) + margin))
        const w  = x1 - x0, h = y1 - y0
        if (w <= 0 || h <= 0) return

        // apply blur filter and redraw just that patch
        ctx.save()
        ctx.filter = 'blur(25px)'
        ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h)
        ctx.restore()
        ctx.save()
        ctx.filter = 'blur(20px)'
        ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h)
        ctx.restore()
      })
    })
  }, 100)
})
