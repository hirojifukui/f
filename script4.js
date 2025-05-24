// script4.js
const video = document.getElementById('video')

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
      video.addEventListener('loadedmetadata', () => video.play())
      video.addEventListener('playing', onVideoPlaying)
    })
    .catch(err => console.error('Camera error:', err))
}

function onVideoPlaying() {
  // set up overlay canvas
  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')
  faceapi.matchDimensions(canvas, {
    width:  video.videoWidth,
    height: video.videoHeight
  })

  setInterval(async () => {
    // clear previous overlay
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // detect faces + landmarks
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
    const resized = faceapi.resizeResults(detections, {
      width:  video.videoWidth,
      height: video.videoHeight
    })

    resized.forEach(det => {
      // grab the 17 jaw-outline points (0 through 16)
      const jaw = det.landmarks.getJawOutline()
      if (jaw.length === 0) return

      // draw & fill the polygon
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(jaw[0].x, jaw[0].y)
      jaw.slice(1).forEach(pt => ctx.lineTo(pt.x, pt.y))
      ctx.closePath()

      // pick any RGBA color/alpha you like
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'
      ctx.fill()
      ctx.restore()
    })
  }, 100)
}
