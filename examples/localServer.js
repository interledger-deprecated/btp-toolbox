const BtpSpider = require('../src/spider')
const BtpCat = require('../src/cat')

const localServer = new BtpSpider({
  listen: 8000
}, (peerId) => {
  console.log(`somebody connected on ${peerId}`)
}, (obj, peerId) => {
  console.log(`server sees BTP packet from ${peerId}`, BtpCat(obj))
})

localServer.start()
setTimeout(() => {
  console.log('10 seconds passed, closing server again!')
  localServer.stop()
}, 10000)
