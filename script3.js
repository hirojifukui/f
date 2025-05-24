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
  // grab the actual video resolution
  const width  = video.videoWidth
  const height = video.videoHeight

  // create & size the visible canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  canvas.width  = width
  canvas.height = height
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // create & size the offscreen canvas for sampling
  const offCanvas = document.createElement('canvas')
  offCanvas.width  = width
  offCanvas.height = height
  const offCtx = offCanvas.getContext('2d')

  // tell face-api about our canvas size
  faceapi.matchDimensions(canvas, { width, height })

  setInterval(async () => {
    // draw the current video frame into the offscreen canvas
    offCtx.drawImage(video, 0, 0, width, height)

    // detect faces + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, { width, height })

    // clear any previous overlays
    ctx.clearRect(0, 0, width, height)

    // for each face, blur each feature region
    resized.forEach(det => {
      const lm = det.landmarks
      const features = [
        lm.getLeftEye(),
        lm.getRightEye(),
        lm.getNose(),
        lm.getMouth()
      ]

      features.forEach(region => {
        // compute tight bounding box + margin
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

        // your existing blur sequence
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
