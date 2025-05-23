
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
      return video.play()
    })
    .catch(err => console.error('camera error:', err))
}

video.addEventListener('play', () => {
  const W = video.videoWidth
  const H = video.videoHeight

  // onscreen canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  canvas.width = W
  canvas.height = H
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // offscreen for grabbing raw pixels
  const off = document.createElement('canvas')
  off.width  = W
  off.height = H
  const offCtx = off.getContext('2d')

  faceapi.matchDimensions(canvas, { width: W, height: H })

  setInterval(async () => {
    // 1) capture frame
    offCtx.drawImage(video, 0, 0, W, H)
    // 2) draw base frame
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(off, 0, 0, W, H)

    // 3) detect & blur features
    const dets = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const results = faceapi.resizeResults(dets, { width: W, height: H })

    results.forEach(r => {
      const lm = r.landmarks
      const regions = [
        lm.getLeftEye(),
        lm.getRightEye(),
        lm.getNose(),
        lm.getMouth()
      ]

      regions.forEach(poly => {
        // tight bbox + margin
        const xs = poly.map(p => p.x), ys = poly.map(p => p.y)
        const m = 20
        const x0 = Math.max(0, Math.floor(Math.min(...xs) - m))
        const y0 = Math.max(0, Math.floor(Math.min(...ys) - m))
        const x1 = Math.min(W, Math.ceil(Math.max(...xs) + m))
        const y1 = Math.min(H, Math.ceil(Math.max(...ys) + m))
        const w  = x1 - x0, h = y1 - y0
        if (w <= 2 || h <= 2) return

        // manual blur: draw small → stretch back
        const BLUR_SCALE = 0.05   // 5% resolution → stronger blur
        const sw = Math.max(1, Math.floor(w * BLUR_SCALE))
        const sh = Math.max(1, Math.floor(h * BLUR_SCALE))

        const tmp = document.createElement('canvas')
        tmp.width  = sw
        tmp.height = sh
        const tctx = tmp.getContext('2d')

        // down-sample region
        tctx.drawImage(off, x0, y0, w, h, 0, 0, sw, sh)
        // upscale to original, smoothing on
        ctx.save()
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(tmp, 0, 0, sw, sh, x0, y0, w, h)
        ctx.restore()
      })
    })
  }, 100)
})
