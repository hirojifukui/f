// script3.js
const video = document.getElementById('video')

// 1) Load your Roku frame
const rokuImage = new Image()
rokuImage.src = 'roku.png'

// 2) iOS detection (for potential fallbacks)
const isIOS = (
  /iP(hone|od|ad)/.test(navigator.platform) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)

// 3) Load Face-API models, then wait for Roku image before starting
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
]).then(() => {
  if (rokuImage.complete) startVideo()
  else rokuImage.onload = startVideo
}).catch(err => console.error('Model load error:', err))

function startVideo() {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.error('getUserMedia not supported')
    return
  }
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream
      video.addEventListener('loadedmetadata', () => video.play())
      video.addEventListener('playing', onVideoPlaying)
    })
    .catch(err => console.error('Camera error:', err))
}

function onVideoPlaying() {
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  const offCanvas = document.createElement('canvas')
  offCanvas.width  = video.videoWidth
  offCanvas.height = video.videoHeight
  const offCtx = offCanvas.getContext('2d')

  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  const bgScale  = video.videoWidth / rokuImage.width
  const bgHeight = rokuImage.height * bgScale

  // your adjusted face‐slot
  const faceSlot = {
    x: 420 * bgScale,
    y: 200 * bgScale,
    w: 140 * bgScale,
    h: 134 * bgScale
  }

  setInterval(async () => {
    offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height)

    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, {
      width:  video.videoWidth,
      height: video.videoHeight
    })

    // draw Roku background
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(
      rokuImage,
      0, 0, rokuImage.width, rokuImage.height,
      0, 0, video.videoWidth, bgHeight
    )

    resized.forEach(det => {
      const { x: fx, y: fy, width: fw, height: fh } = det.detection.box
      const scaleX  = faceSlot.w / fw
      const scaleY  = faceSlot.h / fh
      const offsetX = faceSlot.x - fx * scaleX
      const offsetY = faceSlot.y - fy * scaleY

      // map jaw to clip region
      const jaw = det.landmarks.getJawOutline()
      const jawMapped = jaw.map(p => ({
        x: p.x * scaleX + offsetX,
        y: p.y * scaleY + offsetY
      }))

      // find top of face and lift jaw endpoints
      const allPts     = det.landmarks.positions
      const yTopRaw    = Math.min(...allPts.map(p => p.y))
      const yTopMapped = yTopRaw * scaleY + offsetY
      jawMapped[0].y                = yTopMapped
      jawMapped[jawMapped.length-1].y = yTopMapped

      // 1) clip to inside-jaw so only the face itself draws
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(jawMapped[0].x, jawMapped[0].y)
      jawMapped.forEach(pt => ctx.lineTo(pt.x, pt.y))
      ctx.closePath()
      ctx.clip()

      // 2) (optional) feather edges with a tiny blur to avoid hard seams
      //    you can tweak this or remove if you like a crisp outline
      ctx.filter = 'blur(2px)'

      // 3) draw the face with alpha blending
      ctx.globalAlpha = 0.65   // 65% face, 35% Roku base
      ctx.drawImage(
        offCanvas,
        fx, fy, fw, fh,
        faceSlot.x, faceSlot.y,
        faceSlot.w, faceSlot.h
      )

      // 4) restore to default for next iteration
      ctx.restore()
      ctx.filter = 'none'
      ctx.globalAlpha = 1
    })
  }, 100)
}
