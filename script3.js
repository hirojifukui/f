// script.js
const video = document.getElementById('video')

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
]).then(startVideo)

function startVideo() {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.error('getUserMedia not supported')
    return
  }
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream
      return video.play()
    })
    .catch(err => console.error('camera error:', err))
}

video.addEventListener('play', () => {
  // 1) create & append the overlay canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // 2) read its real size (matches the video element)
  const width  = canvas.width
  const height = canvas.height

  // 3) size an offscreen canvas to the same dimensions
  const offCanvas = document.createElement('canvas')
  offCanvas.width  = width
  offCanvas.height = height
  const offCtx = offCanvas.getContext('2d')

  // 4) tell face-api to use these dims
  faceapi.matchDimensions(canvas, { width, height })

  setInterval(async () => {
    // draw video frame into offscreen
    offCtx.drawImage(video, 0, 0, width, height)

    // detect faces + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, { width, height })

    // clear previous overlays using the correct size
    ctx.clearRect(0, 0, width, height)

    // for each face, blur each feature region—**your blur code is untouched**:
    resized.forEach(det => {
      const lm = det.landmarks
      const features = [
        lm.getLeftEye(),
        lm.getRightEye(),
        lm.getNose(),
        lm.getMouth()
      ]

      features.forEach(region => {
        const xs = region.map(p => p.x)
        const ys = region.map(p => p.y)
        const margin = 25
        const x0 = Math.max(0, Math.floor(Math.min(...xs) - margin))
        const y0 = Math.max(0, Math.floor(Math.min(...ys) - margin))
        const x1 = Math.min(width,  Math.ceil(Math.max(...xs) + margin))
        const y1 = Math.min(height, Math.ceil(Math.max(...ys) + margin))
        const w  = x1 - x0
        const h  = y1 - y0
        if (w <= 0 || h <= 0) return

        // — your blur sequence —
        ctx.save()
        ctx.filter = 'blur(25px)'
        ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h)
        ctx.restore()

        ctx.save()
        ctx.filter = 'blur(25px)'
        ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h)
        ctx.restore()

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
