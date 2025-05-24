// script3.js
const video = document.getElementById('video')

// detect iOS (iPhone, iPad, iPod)
const isIOS = (
  /iP(hone|od|ad)/.test(navigator.platform) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
]).then(startVideo)
  .catch(err => console.error('Model load error:', err))

function startVideo() {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.error('getUserMedia not supported')
    return
  }

  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream

      video.addEventListener('loadedmetadata', () => {
        video.play()
      })

      video.addEventListener('playing', onVideoPlaying)
    })
    .catch(err => console.error('Camera error:', err))
}

function onVideoPlaying() {
  // overlay canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // offscreen canvas to grab raw pixels
  const offCanvas = document.createElement('canvas')
  offCanvas.width  = video.videoWidth
  offCanvas.height = video.videoHeight
  const offCtx = offCanvas.getContext('2d')

  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  setInterval(async () => {
    offCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)

    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, {
      width:  video.videoWidth,
      height: video.videoHeight
    })

    ctx.clearRect(0, 0, canvas.width, canvas.height)

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
        const x1 = Math.min(video.videoWidth,  Math.ceil(Math.max(...xs) + margin))
        const y1 = Math.min(video.videoHeight, Math.ceil(Math.max(...ys) + margin))
        const w  = x1 - x0, h = y1 - y0
        if (w <= 0 || h <= 0) return

        if (!isIOS && 'filter' in ctx) {
          // desktop/Android: your original face-api blur
          [25,25,25,20].forEach(r => {
            ctx.save()
            ctx.filter = `blur(${r}px)`
            ctx.drawImage(offCanvas, x0, y0, w, h, x0, y0, w, h)
            ctx.restore()
          })
        } else {
          // iOS fallback: down-sample then up-sample to get a blur
          const scale = 0.1
          const tw = Math.max(1, Math.floor(w * scale))
          const th = Math.max(1, Math.floor(h * scale))
          const tmp = document.createElement('canvas')
          tmp.width  = tw
          tmp.height = th
          const tctx = tmp.getContext('2d')

          // draw tiny version
          tctx.drawImage(offCanvas, x0, y0, w, h, 0, 0, tw, th)

          // draw back up to region size with smoothing
          ctx.save()
          ctx.imageSmoothingEnabled = true
          ctx.drawImage(tmp, 0, 0, tw, th, x0, y0, w, h)
          ctx.restore()
        }
      })
    })
  }, 100)
}

