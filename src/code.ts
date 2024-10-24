const LOGS = true

import { FilledNode } from './types'

// Constants
const confirmMsgs = ["Done!", "You got it!", "Aye!", "Is that all?", "My job here is done.", "Gotcha!", "It wasn't hard."]
const renameMsgs = ["Optimized", "Affected", "Made it with", "Fixed"]
const idleMsgs = ["All great, already", "Nothing to do, everything's good", "Any layers to affect? Can't see it", "Nothing to do, your layers are great"]
// Variables
let notification: NotificationHandler
let selection: ReadonlyArray<SceneNode>
let working: boolean
let nodeCount: number = 0
let imageCount: number = 0

figma.on("currentpagechange", cancel)

// Main + Elements Check
working = true
selection = figma.currentPage.selection
run()

async function run() {
  // Anything selected?
  c(`Running`)

  figma.showUI(__html__, { visible: false })

  if (selection.length)
    for (const node of selection) {
      await optimize(node)
      finish()
    }
  else {
    working = false
    figma.notify('No layers selected')
    figma.closePlugin()
  }
}

// Action for selected nodes
async function optimize(node: SceneNode | PageNode) {
  if ("fills" in node && node.fills !== figma.mixed) {
    c(`Leaf ${node.name}`)
    leaveOneImage(node)
    await compressImage(node)
  }
  if ("children" in node) {
    c(`Got children`)
    for (const child of node.children)
      await optimize(child)
  }
}

function leaveOneImage(node: FilledNode) {
  c(`Leaving one image`)
  let nodeAffected = false

  const paints = node.fills as ReadonlyArray<Paint>
  const newPaints: Array<Paint> = []
  let foundImage = false
  for (let i = paints.length - 1; i >= 0; i--) {
    if (paints[i].type !== 'IMAGE') {
      c(`Not image`)
      newPaints.push(paints[i])
    }
    else if (!foundImage) {
      c(`First image`)
      foundImage = true
      newPaints.push(paints[i])
      imageCount++
      nodeAffected = true
    } else {
      imageCount++
    }
  }
  if (nodeAffected) nodeCount++
  node.fills = newPaints
  return newPaints
}

async function compressImage(node: FilledNode) {
  c(`Compressing`)

  const paints = node.fills as ReadonlyArray<Paint>
  const newPaints: Array<Paint> = []
  for (const paint of paints) {
    if (paint.type !== 'IMAGE') {
      c(`Not image`)
      newPaints.push(paint)
    }
    else {
      c(`Image!`)
      const buffer = await figma.getImageByHash(paint.imageHash).getBytesAsync()
      c(`Got bytes`)
      figma.ui.postMessage({ bytes: buffer, node: node })
      const message = await new Promise((resolve, reject) => {
        figma.ui.onmessage = value => {
          c(`Got message from browser`)
          return resolve(value)
        }
      })

      c(message)
      const newBuffer = (message as any).buffer as Uint8Array

      const newPaint: Paint = {
        type: 'IMAGE',
        imageHash: figma.createImage(newBuffer).hash,
        scaleMode: paint.scaleMode
      }
      c(`To paint`)

      newPaints.push(newPaint)
    }
  }
  node.fills = newPaints
  return newPaints
}

// Ending the work
function finish() {
  working = false
  figma.root.setRelaunchData({ relaunch: '' })
  if (imageCount > 0) {
    notify(confirmMsgs[Math.floor(Math.random() * confirmMsgs.length)] +
      " " + renameMsgs[Math.floor(Math.random() * renameMsgs.length)] +
      " " + ((imageCount === 1) ? "only one image" : (imageCount + " images") +
        " in " + ((nodeCount === 1) ? "one layer" : (nodeCount + " layers"))))
  }
  else notify(idleMsgs[Math.floor(Math.random() * idleMsgs.length)])
  setTimeout(() => { console.log("Timeouted"), figma.closePlugin() }, 3000)
}

// Show new notification
function notify(text: string) {
  if (notification != null)
    notification.cancel()
  notification = figma.notify(text)
}

// Showing interruption notification
function cancel() {
  if (notification != null)
    notification.cancel()
  if (working) {
    notify("Plugin work have been interrupted")
  }
}

function c(str, error = false) {
  if (LOGS) {
    if (error)
      console.error(str)
    else
      console.log(str)
  }
}