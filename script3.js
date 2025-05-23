// script.js
const video = document.getElementById('video')

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
]).then(startVideo)

function startVideo() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return console.error('getUserMedia not supported')
  }
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream
      return video.play()            // <- ensure it actually plays
    })
    .catch(err => console.error('camera error:', err))
}

video.addEventListener('play', () => {
  // use the ACTUAL video dimensions
  const width  = video.videoWidth
  const height = video.videoHeight

  // create & size the onscreen canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  canvas.width  = width
  canvas.height = height
  canvas.style.top  = video.offsetTop  + 'px'
  canvas.style.left = video.offsetLeft + 'px'
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // offscreen canvas
  const offCanvas = document.createElement('canvas')
  offCanvas.width  = width
  offCanvas.height = height
  const offCtx = offCanvas.getContext('2d')

  faceapi.matchDimensions(canvas, { width, height })

  setInterval(async () => {
    // 1) draw the video into offscreen
    offCtx.drawImage(video, 0, 0, width, height)

    // 2) clear & paint the full frame onto the visible canvas
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(offCanvas, 0, 0, width, height)

    // 3) detect + blur features
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, { width, height })

    resized.forEach(det => {
      const lm = det.landmarks
      const features = [
        lm.getLeftEye(),
        lm.getRightEye(),
        lm.getNose(),
        lm.getMouth()
      ]

      features.forEach(region => {
        const xs = region.map(p => p.x),
              ys = region.map(p => p.y)
        const margin = 20
        const x0 = Math.max(0, Math.floor(Math.min(...xs) - margin))
        const y0 = Math.max(0, Math.floor(Math.min(...ys) - margin))
        const x1 = Math.min(width,  Math.ceil(Math.max(...xs) + margin))
        const y1 = Math.min(height, Math.ceil(Math.max(...ys) + margin))
        const w  = x1 - x0, h = y1 - y0
        if (w <= 0 || h <= 0) return

        // apply heavy blur just to that patch
        ctx.save()
        ctx.filter = 'blur(20px)'
        ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h)
        ctx.restore()
      })
    })
  }, 100)
})
