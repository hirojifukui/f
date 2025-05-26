// script8.js
const video = document.getElementById('video')

// load all your static assets
const rokuImage = new Image(), faceImage = new Image(), hairImage = new Image()
rokuImage.src = 'roku.png'
faceImage.src = 'face.png'
hairImage.src = 'hair.png'

// iOS detection (if needed)
const isIOS = /iP(hone|od|ad)/.test(navigator.platform)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// wait for models + images
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
  new Promise(r => { rokuImage.onload = r }),
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

  // original Roku dimensions
  const ROKU_W = rokuImage.width, ROKU_H = rokuImage.height

  // compute uniform scale so Roku fits in the video
  const scale = Math.min(
    video.videoWidth  / ROKU_W,
    video.videoHeight / ROKU_H
  )
  const bgW = ROKU_W * scale, bgH = ROKU_H * scale
  const bgX = (video.videoWidth  - bgW) / 2
  const bgY = (video.videoHeight - bgH) / 2

  // original face-slot in Roku coords
  const origSlot = { x: 420, y: 200, w: 140, h: 134 }
  // scaled slot on canvas
  const slot = {
    x: origSlot.x * scale + bgX,
    y: origSlot.y * scale + bgY,
    w: origSlot.w * scale,
    h: origSlot.h * scale
  }

  // offscreen for merging face + hair
  const mergeFx = document.createElement('canvas')
  mergeFx.width  = Math.max(faceImage.width, hairImage.width)
  mergeFx.height = Math.max(faceImage.height, hairImage.height)
  const mctx = mergeFx.getContext('2d')

  // offscreen for final head before tilt
  const headFx = document.createElement('canvas')
  headFx.width  = bgW
  headFx.height = bgH
  const hctx = headFx.getContext('2d')

  setInterval(async () => {
    // 0) grab current video frame
    vctx.drawImage(video, 0, 0)

    // 1) detect face + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    if (!detections.length) return
    const det = detections[0]
    const { x: fx, y: fy, width: fw, height: fh } = det.detection.box

    // 2) eye centers & tilt
    const avg = pts => {
      const s = pts.reduce((a,p) => ({ x: a.x+p.x, y: a.y+p.y }), {x:0,y:0})
      return { x: s.x/pts.length, y: s.y/pts.length }
    }
    const L = avg(det.landmarks.getLeftEye())
    const R = avg(det.landmarks.getRightEye())
    const angle = Math.atan2(R.y - L.y, R.x - L.x)

    // 3) prepare jaw polygon in local coords, adjust top
    const jawRaw = det.landmarks.getJawOutline()
    const allPts = det.landmarks.positions
    const yTopRaw = Math.min(...allPts.map(p => p.y))
    const jawLocal = jawRaw.map(p => ({
      x: p.x - fx,
      y: p.y - fy
    }))
    // lift endpoints to yTopRaw
    const yTopLocal = yTopRaw - fy
    jawLocal[0].y = yTopLocal
    jawLocal[jawLocal.length - 1].y = yTopLocal

    // // 4) extract & deskew face following jaw-line
    // const faceFx = document.createElement('canvas')
    // faceFx.width  = fw; faceFx.height = fh
    // const fctx = faceFx.getContext('2d')
    // fctx.translate(fw/2, fh/2)
    // fctx.rotate(-angle)
    // fctx.translate(-fw/2, -fh/2)
    // // clip to jaw shape
    // fctx.beginPath()
    // jawLocal.forEach((pt,i) =>
    //   i === 0 ? fctx.moveTo(pt.x, pt.y) : fctx.lineTo(pt.x, pt.y)
    // )
    // fctx.closePath()
    // fctx.clip()
    // // draw the rotated video region
    // fctx.drawImage(vctx.canvas, fx, fy, fw, fh, 0, 0, fw, fh)

    // // 5) blend onto face.png, resize to width=116, center X=100
    // const targetW = 116
    // const scaleF = targetW / fw
    // const targetH = fh * scaleF
    // // center at x=100 → x0 = 100 - targetW/2
    // const posX = 100 - targetW/2
    // // bottom at y=263 → y0 = 263 - targetH
    // const posY = 263 - targetH

    // mctx.clearRect(0, 0, mergeFx.width, mergeFx.height)
    // mctx.drawImage(faceImage, 0, 0)
    // mctx.drawImage(faceFx, 0, 0, fw, fh, posX, posY, targetW, targetH)

// … inside your setInterval(async () => { … }) loop, replace step 4 & 5 …

// 4) extract & deskew face following jaw-line **with padding**
const padding = 20  // 20px margin on each side
const extW = fw + padding * 2
const extH = fh + padding * 2

const faceFx = document.createElement('canvas')
faceFx.width  = extW
faceFx.height = extH
const fctx = faceFx.getContext('2d')

// center & rotate around the padded canvas center
fctx.translate(extW/2, extH/2)
fctx.rotate(-angle)
fctx.translate(-extW/2, -extH/2)

// map jawLocal (relative to fx,fy) into padded coords
const jawPadded = jawLocal.map(pt => ({
  x: pt.x + padding,
  y: pt.y + padding
}))

// clip to the padded jaw shape
fctx.beginPath()
jawPadded.forEach((pt,i) => i===0 ? fctx.moveTo(pt.x,pt.y) : fctx.lineTo(pt.x,pt.y))
fctx.closePath()
fctx.clip()

// draw the rotated video region into the padded canvas
fctx.drawImage(
  vctx.canvas,
  fx, fy, fw, fh,           // source
  padding, padding, fw, fh  // dest (inside padding)
)

// 5) blend **only** the actual face region (no padding) onto face.png
const targetW = 116
const scaleF  = targetW / fw
const targetH = fh * scaleF

// center X at 100 → x0 = 100 - targetW/2
const posX = 100 - targetW/2
// bottom at y=263 → y0 = 263 - targetH
const posY = 263 - targetH

mctx.clearRect(0, 0, mergeFx.width, mergeFx.height)
mctx.drawImage(faceImage, 0, 0)
// draw from faceFx’s inner fw×fh region (skipping padding)
mctx.drawImage(
  faceFx,
  padding, padding, fw, fh,  // source
  posX, posY,                // dest
  targetW, targetH           // size
)

// 6) overlay hair.png as before
mctx.drawImage(hairImage, 0, 0)


    // 6) overlay hair.png
    mctx.drawImage(hairImage, 0, 0)

    // 7) resize merged head into headFx using same Roku scale
    hctx.clearRect(0, 0, headFx.width, headFx.height)
    hctx.drawImage(
      mergeFx,
      0, 0, mergeFx.width, mergeFx.height,
      0, 0, bgW, bgH
    )

    // 8) draw Roku background
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(rokuImage,
      0, 0, ROKU_W, ROKU_H,
      bgX, bgY, bgW, bgH
    )

    // 9) rotate final head back by +angle around pivot=(100,245)
    const pivotX = bgX + 100 * scale
    const pivotY = bgY + 245 * scale
    ctx.save()
    ctx.translate(pivotX, pivotY)
    ctx.rotate(angle)
    ctx.translate(-pivotX, -pivotY)

    // 10) draw headFx so its pivot moves to (432,300)
    const targetPivotX = bgX + 432 * scale
    const targetPivotY = bgY + 300 * scale
    const dx = targetPivotX - pivotX
    const dy = targetPivotY - pivotY
    ctx.drawImage(headFx, dx, dy, bgW, bgH)

    ctx.restore()

  }, 100)
}
