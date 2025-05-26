// script10.js
const video = document.getElementById('video')

// load static assets
const rokuImage = new Image(), faceImage = new Image(), hairImage = new Image()
rokuImage.src = 'roku.png'
faceImage.src = 'face.png'
hairImage.src = 'hair.png'

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
    .catch(err => console.error('Camera error:', err))
}

function onVideoPlaying() {
  // main canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')

  // offscreen: raw video frame
  const videoFx = document.createElement('canvas')
  videoFx.width  = video.videoWidth
  videoFx.height = video.videoHeight
  const vctx = videoFx.getContext('2d')

  // offscreen: rotated full frame
  const rotatedVideo = document.createElement('canvas')
  rotatedVideo.width  = video.videoWidth
  rotatedVideo.height = video.videoHeight
  const rctx = rotatedVideo.getContext('2d')

  // offscreen: extracted face
  const faceFx = document.createElement('canvas')
  const fctx = faceFx.getContext('2d')

  // offscreen: merged head (face.png + face + hair.png)
  const mergeFx = document.createElement('canvas')
  mergeFx.width  = Math.max(faceImage.width, hairImage.width)
  mergeFx.height = Math.max(faceImage.height, hairImage.height)
  const mctx = mergeFx.getContext('2d')

  // compute Roku scale & bg dims
  const ROKU_W = rokuImage.width, ROKU_H = rokuImage.height
  const scale = Math.min(
    video.videoWidth  / ROKU_W,
    video.videoHeight / ROKU_H
  )
  const bgW = ROKU_W * scale, bgH = ROKU_H * scale
  const bgX = (video.videoWidth  - bgW) / 2
  const bgY = (video.videoHeight - bgH) / 2

  // match dimensions
  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  // offscreen: final head before tilt-back, sized to mergeFx * scale
  const headFx = document.createElement('canvas')
  headFx.width  = mergeFx.width * scale
  headFx.height = mergeFx.height * scale
  const hctx = headFx.getContext('2d')

  setInterval(async () => {
    // 1) capture raw frame
    vctx.drawImage(video, 0, 0)

    // 2) initial detect for tilt
    const dets1 = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    if (!dets1.length) return
    const det1 = dets1[0]
    const avg = pts => {
      const s = pts.reduce((a,p) => ({ x: a.x+p.x, y: a.y+p.y }), {x:0,y:0})
      return { x: s.x/pts.length, y: s.y/pts.length }
    }
    const L = avg(det1.landmarks.getLeftEye())
    const R = avg(det1.landmarks.getRightEye())
    const angle = Math.atan2(R.y - L.y, R.x - L.x)

    // 3) rotate entire frame to deskew
    rctx.save()
    rctx.clearRect(0,0, rotatedVideo.width, rotatedVideo.height)
    rctx.translate(rotatedVideo.width/2, rotatedVideo.height/2)
    rctx.rotate(-angle)
    rctx.translate(-rotatedVideo.width/2, -rotatedVideo.height/2)
    rctx.drawImage(videoFx, 0, 0)
    rctx.restore()

    // 4) detect on rotated frame
    const dets2 = await faceapi
      .detectAllFaces(rotatedVideo, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    if (!dets2.length) return
    const det2 = dets2[0]
    const { x: fx, y: fy, width: fw, height: fh } = det2.detection.box

    // 5) build adjusted jaw polygon
    const jawRaw = det2.landmarks.getJawOutline()
    const allPts = det2.landmarks.positions
    const yTopRaw = Math.min(...allPts.map(p=>p.y))
    const jawLocal = jawRaw.map(p=>({ x: p.x - fx, y: p.y - fy }))
    const yTopLocal = yTopRaw - fy
    jawLocal[0].y = yTopLocal
    jawLocal[jawLocal.length-1].y = yTopLocal

    // 6) extract face following jaw
    faceFx.width  = fw
    faceFx.height = fh
    fctx.save()
    fctx.clearRect(0,0,fw,fh)
    fctx.beginPath()
    jawLocal.forEach((pt,i)=> i===0 ? fctx.moveTo(pt.x,pt.y) : fctx.lineTo(pt.x,pt.y))
    fctx.closePath()
    fctx.clip()
    fctx.drawImage(rotatedVideo, fx, fy, fw, fh, 0, 0, fw, fh)
    fctx.restore()

    // 7) merge with face.png & hair.png at original size in mergeFx
    const targetW = 130  // ← change this to whatever width you want
    const scaleF  = targetW / fw  // fw = width of the extracted face box
    const targetH = fh * scaleF // fh = height of the extracted face box
    const posX = 100 - targetW/2
    const posY = 265 - targetH

    mctx.clearRect(0,0,mergeFx.width,mergeFx.height)
    // draw face base
    mctx.drawImage(faceImage, 0, 0)
    // overlay extracted face
    mctx.drawImage(faceFx, 0, 0, fw, fh, posX, posY, targetW, targetH)
    // overlay hair
    mctx.drawImage(hairImage, 0, 0)

    // 8) draw merged head into headFx scaled by same Roku scale
    hctx.clearRect(0,0, headFx.width, headFx.height)
    hctx.drawImage(
      mergeFx,
      0, 0, mergeFx.width, mergeFx.height,
      0, 0, headFx.width, headFx.height
    )

    // 9) draw Roku background
    ctx.clearRect(0,0,canvas.width,canvas.height)
    ctx.drawImage(rokuImage,
      0,0,ROKU_W,ROKU_H,
      bgX,bgY,bgW,bgH
    )

    // 10) rotate head back around pivot (100,245), then place pivot to (432,300)
    // your pivot in face.png space:
    const pivotFaceX = 100
    const pivotFaceY = 263

    // where that pivot should land on Roku:
    const destFaceX = 493
    const destFaceY = 326

    // map both through the same scale + bg offset
    const pivotHeadX = pivotFaceX * scale
    const pivotHeadY = pivotFaceY * scale
    const destX = bgX + destFaceX * scale
    const destY = bgY + destFaceY * scale

    // now rotate *only* headFx around its own pivot
    ctx.save()
    ctx.translate(destX, destY)      // move origin to destination pivot
    ctx.rotate(angle)                // apply tilt
    // draw headFx so that its (pivotHeadX,pivotHeadY) sits exactly at the origin
    ctx.drawImage(
    headFx,
    -pivotHeadX,
    -pivotHeadY,
    headFx.width,
    headFx.height
    )
    ctx.restore()

  }, 100)
}
