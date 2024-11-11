export const LOGS = false

import { FilledNode } from './types'

// Constants
const renameMsgs = ["Optimized", "Affected", "Made it with", "Fixed"]
const idleMsgs = ["All great, already", "Everything's good", "All good", "Your images are great"]
// Variables
let notification: NotificationHandler
let selection: ReadonlyArray<SceneNode>

let prevProgressNotification: NotificationHandler
let progressNotification: NotificationHandler
let progressNotificationTimeout: number

let working = false
let showProgress = false

let nodesProcessed = 0
let imageProcessed = 0
let imageDeleted = 0
let imageAmount = 0
let bytesSaved = 0

figma.on("currentpagechange", cancel)

// Main + Elements Check
working = true
selection = figma.currentPage.selection
run()

async function run() {
  try {
    figma.showUI(__html__, { visible: false })

    if (selection.length) {
      const startTime = Date.now()
      initProgressNotification(selection)
      await optimize(selection)
      console.log(`Time: ${Math.round(Date.now() - startTime)} ms`)
      finish()
    }
    else {
      working = false
      figma.notify('No layers selected')
      figma.closePlugin()
    }
  }
  catch ({ name, message }) {
    const errorMsg = message.length > 120 ? message.slice(0, 120) + '…' : message
    stopProgressNotification()
    figma.notify(errorMsg, {
      error: true,
    })
  }
}

// Count imagaes in selected nodes
function countImages(nodes: readonly SceneNode[]) {
  for (const node of nodes) {
    if ("fills" in node && node.fills !== figma.mixed) {
      imageAmount += node.fills.filter(fill => fill.type === 'IMAGE').length
    }
    if ("children" in node) {
      countImages(node.children)
    }
  }
}

// Action for selected nodes
async function optimize(nodes: readonly SceneNode[]) {
  for (const node of nodes) {
    if ("fills" in node && node.fills !== figma.mixed && node.fills.some(fill => fill.type === 'IMAGE')) {
    // c(`Optimizing ${node.name}`)
      leaveOneImage(node)
      await compressImage(node)
    }
    if ("children" in node) {
      // c(`Checking children of ${node.name}`)
      await optimize(node.children)
    }
  }
}

async function leaveOneImage(node: FilledNode) {
  c(`Leaving one image`)
  let nodeAffected = false

  const paints = node.fills as ReadonlyArray<Paint>
  const newPaints: Array<Paint> = []
  let foundImage = false
  for (let i = paints.length - 1; i >= 0; i--) {
    if (paints[i].type !== 'IMAGE') {
      c(`Not image`)
      newPaints.unshift(paints[i])
    }
    else if (!foundImage) {
      c(`Adding first image`)
      foundImage = true
      newPaints.unshift(paints[i])
      nodeAffected = true
    } else {
      c(`Skipping next image`);
      imageProcessed++
      imageDeleted++
    }
  }
  if (nodeAffected) nodesProcessed++
  node.fills = newPaints
  return newPaints
}

async function compressImage(node: FilledNode) {
  c(`Compressing`)

  const paints = node.fills as ReadonlyArray<Paint>
  const newPaints: Array<Paint> = []
  for (const paint of paints) {
    if (paint.type !== 'IMAGE') {
      newPaints.push(paint)
    }
    else {
      const buffer = await figma.getImageByHash(paint.imageHash).getBytesAsync()
      c(`Sending bytes`)
      figma.ui.postMessage({
        bytes: buffer,
        node: {
          id: 'id' in node ? node.id : null,
          width: 'width' in node ? node.width : null,
          height: 'height' in node ? node.height : null,
        },
        scaleMode: paint.scaleMode,
        transform: paint.imageTransform,
      })
      const message = await new Promise((resolve, reject) => {
        figma.ui.onmessage = value => {
          c(`Got message from browser`)
          return resolve(value)
        }
      })

      c(message)
      const newBuffer = (message as any).buffer as Uint8Array
      bytesSaved += buffer.length - newBuffer.length

      const newPaint: ImagePaint = {
        ...paint,
        imageHash: figma.createImage(newBuffer).hash,
      }
      newPaints.push(newPaint)
      imageProcessed++
    }
  }
  node.fills = newPaints
  return newPaints
}

function initProgressNotification(nodes) {
  imageProcessed = 0
  countImages(nodes)
  showProgress = true
  showProgressNotification()
}

function showProgressNotification() {
  const timeout = 150;
  (function loop() {
    if (showProgress) {
      const message = `Image ${imageProcessed + 1} of ${imageAmount}`
      prevProgressNotification = progressNotification
      progressNotification = figma.notify(message, { timeout: timeout + 50 })
      setTimeout(() => prevProgressNotification?.cancel(), 50)
      progressNotificationTimeout = setTimeout(() => { loop() }, timeout);
    }
    else {
      prevProgressNotification?.cancel()
      progressNotification?.cancel()
    }
  })()
}

function stopProgressNotification() {
  showProgress = false
  prevProgressNotification?.cancel()
  progressNotification?.cancel()
  if (progressNotificationTimeout)
    clearTimeout(progressNotificationTimeout)
}

// Ending the work
function finish() {
  working = false
  if (imageProcessed > 0) {
    notify(
      displayCount('Checked', nodesProcessed, 'node') +
      displayCount(' Deleted', imageDeleted, 'fill') +
      ((bytesSaved > 0) ? ` Compresed ${readableBytes(bytesSaved)}.` : ''))
  }
  else notify(idleMsgs[Math.floor(Math.random() * idleMsgs.length)])
  figma.closePlugin()
}

function displayCount(prefix: string, count: number, plural: string, dot = true) {
  if (count === 0)
    return ''
  return `${prefix} ${count} ${plural}${count > 1 ? 's' : ''}${dot ? '.' : ''}`
}

// Show new notification
function notify(text: string, clearProgress = true) {
  if (clearProgress) {
    stopProgressNotification()
  }
  if (notification != null)
    notification.cancel()
  notification = figma.notify(text)
}

// Showing interruption notification
function cancel() {
  if (notification != null)
    notification.cancel()
  stopProgressNotification()
  if (working) {
    notify("Plugin work have been interrupted")
  }
}

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function readableBytes(bytes: number) {
  const mibFactor = 1024 * 1024
  const kibFactor = 1024
  if (bytes > mibFactor)
    return `${(bytes / mibFactor).toFixed(2)} MiB`
  if (bytes > kibFactor)
    return `${(bytes / kibFactor).toFixed(2)} KiB`
  return `${bytes.toFixed(2)} bytes`
}

function c(str, error = false) {
  if (LOGS) {
    if (error)
      console.error(str)
    else
      console.log(str)
  }
}