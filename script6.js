// script6.js
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
  // overlay canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // offscreen canvas
  const offCanvas = document.createElement('canvas')
  offCanvas.width  = video.videoWidth
  offCanvas.height = video.videoHeight
  const offCtx = offCanvas.getContext('2d')

  // match dimensions for face-api
  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  // original Roku dimensions
  const origW = rokuImage.width   // 726
  const origH = rokuImage.height  // 730

  // compute uniform scale to fit within video while preserving aspect ratio
  const scale = Math.min(
    video.videoWidth  / origW,
    video.videoHeight / origH
  )
  const bgW = origW * scale
  const bgH = origH * scale

  // center the Roku frame on the video canvas
  const bgX = (video.videoWidth  - bgW) / 2
  const bgY = (video.videoHeight - bgH) / 2

  // define your face-slot relative to the **original** Roku image,
  // then map it through scale + offset
  const origSlot = { x: 420, y: 200, w: 140, h: 134 }
  const faceSlot = {
    x: origSlot.x * scale + bgX,
    y: origSlot.y * scale + bgY,
    w: origSlot.w * scale,
    h: origSlot.h * scale
  }

  setInterval(async () => {
    // capture frame
    offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height)

    // detect faces + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, {
      width:  video.videoWidth,
      height: video.videoHeight
    })

    // draw the centered, aspect-correct Roku background
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(
      rokuImage,
      0, 0, origW, origH,      // source
      bgX, bgY, bgW, bgH       // destination
    )

    resized.forEach(det => {
      // map raw face box → faceSlot
      const { x: fx, y: fy, width: fw, height: fh } = det.detection.box
      const scaleX  = faceSlot.w / fw
      const scaleY  = faceSlot.h / fh
      const offsetX = faceSlot.x - fx * scaleX
      const offsetY = faceSlot.y - fy * scaleY

      // get & map jaw outline
      const jaw = det.landmarks.getJawOutline()
      const jawMapped = jaw.map(p => ({
        x: p.x * scaleX + offsetX,
        y: p.y * scaleY + offsetY
      }))

      // find top of face & lift jaw endpoints
      const allPts     = det.landmarks.positions
      const yTopRaw    = Math.min(...allPts.map(p => p.y))
      const yTopMapped = yTopRaw * scaleY + offsetY
      jawMapped[0].y = yTopMapped
      jawMapped[jawMapped.length - 1].y = yTopMapped

      // clip to inside jaw
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(jawMapped[0].x, jawMapped[0].y)
      jawMapped.forEach(pt => ctx.lineTo(pt.x, pt.y))
      ctx.closePath()
      ctx.clip()

      // draw face in grayscale
      ctx.save()
      ctx.filter = 'grayscale(100%)'
      ctx.drawImage(
        offCanvas,
        fx, fy, fw, fh,
        faceSlot.x, faceSlot.y,
        faceSlot.w, faceSlot.h
      )

      // tint to target RGB via 'color' blend mode
      ctx.filter = 'none'
      ctx.globalCompositeOperation = 'color'
      ctx.fillStyle = 'rgb(158,132,117)'
      ctx.fillRect(
        faceSlot.x, faceSlot.y,
        faceSlot.w, faceSlot.h
      )

      // restore composite & filters
      ctx.globalCompositeOperation = 'source-over'
      ctx.restore()

      // restore clipping
      ctx.restore()
    })
  }, 100)
}
