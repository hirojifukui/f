// script7.js
const video = document.getElementById('video')

// load all your static assets
const rokuImage = new Image(), faceImage = new Image(), hairImage = new Image()
rokuImage.src = 'roku.png'
faceImage.src = 'face.png'
hairImage.src = 'hair.png'

// iOS detection (if you ever need it)
const isIOS = /iP(hone|od|ad)/.test(navigator.platform)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// wait for models + all images
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
  new Promise(r => { rokuImage.onload = r }),  // fixed here
  new Promise(r => { faceImage.onload = r }),
  new Promise(r => { hairImage.onload = r }),
]).then(startVideo)
  .catch(err => console.error(err))

function startVideo() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return console.error('getUserMedia not supported')
  }
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      video.srcObject = stream
      video.onloadedmetadata = () => video.play()
      video.onplaying      = onVideoPlaying
    })
    .catch(err => console.error(err))
}

function onVideoPlaying() {
  // main display canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // offscreen to grab current frame
  const videoFx = document.createElement('canvas')
  videoFx.width  = video.videoWidth
  videoFx.height = video.videoHeight
  const vctx = videoFx.getContext('2d')

  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  const ROKU_W = rokuImage.width, ROKU_H = rokuImage.height
  const scale = Math.min(
    video.videoWidth  / ROKU_W,
    video.videoHeight / ROKU_H
  )
  const bgW = ROKU_W * scale, bgH = ROKU_H * scale
  const bgX = (video.videoWidth  - bgW) / 2
  const bgY = (video.videoHeight - bgH) / 2

  const origSlot = { x: 420, y: 200, w: 140, h: 134 }
  const slot = {
    x: origSlot.x * scale + bgX,
    y: origSlot.y * scale + bgY,
    w: origSlot.w * scale,
    h: origSlot.h * scale
  }

  const mergeFx = document.createElement('canvas')
  mergeFx.width  = Math.max(faceImage.width, hairImage.width)
  mergeFx.height = Math.max(faceImage.height, hairImage.height)
  const mctx = mergeFx.getContext('2d')

  const headFx = document.createElement('canvas')
  headFx.width  = bgW
  headFx.height = bgH
  const hctx = headFx.getContext('2d')

  setInterval(async () => {
    vctx.drawImage(video, 0, 0)

    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    if (!detections.length) return
    const det = detections[0]
    const { x: fx, y: fy, width: fw, height: fh } = det.detection.box

    // 1) compute eye centers & tilt angle
    const avg = pts => {
      const s = pts.reduce((a,p) => ({ x: a.x+p.x, y: a.y+p.y }), {x:0,y:0})
      return { x: s.x/pts.length, y: s.y/pts.length }
    }
    const L = avg(det.landmarks.getLeftEye())
    const R = avg(det.landmarks.getRightEye())
    const angle = Math.atan2(R.y - L.y, R.x - L.x)

    // 2) deskew face
    const faceFx = document.createElement('canvas')
    faceFx.width  = fw; faceFx.height = fh
    const fctx = faceFx.getContext('2d')
    fctx.translate(fw/2, fh/2)
    fctx.rotate(-angle)
    fctx.translate(-fw/2, -fh/2)
    fctx.drawImage(vctx.canvas, fx, fy, fw, fh, 0, 0, fw, fh)

    // 3) blend onto face.png, resize to width=116
    const targetW = 116, scaleF = targetW / fw, targetH = fh * scaleF
    const posX = 100, posY = 263 - targetH
    mctx.clearRect(0, 0, mergeFx.width, mergeFx.height)
    mctx.drawImage(faceImage, 0, 0)
    mctx.drawImage(faceFx, 0, 0, fw, fh, posX, posY, targetW, targetH)

    // 4) overlay hair.png
    mctx.drawImage(hairImage, 0, 0)

    // 5) headFx gets the merged (straight) head
    hctx.clearRect(0, 0, headFx.width, headFx.height)
    hctx.drawImage(mergeFx, 0, 0)

    // 6) rotate head back by +angle around (100,245)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(rokuImage, 0,0,ROKU_W,ROKU_H, bgX,bgY,bgW,bgH)

    ctx.save()
    const pivotX = bgX + 100 * scale
    const pivotY = bgY + 245 * scale
    ctx.translate(pivotX, pivotY)
    ctx.rotate(angle)
    ctx.translate(-pivotX, -pivotY)

    // draw head so pivot lands at (432,300)
    const targetPivotX = bgX + 432 * scale
    const targetPivotY = bgY + 300 * scale
    const dx = targetPivotX - pivotX, dy = targetPivotY - pivotY
    ctx.drawImage(headFx, dx, dy, bgW, bgH)
    ctx.restore()

  }, 100)
}
