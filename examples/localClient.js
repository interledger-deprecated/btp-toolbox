const BtpSpider = require('../src/spider')
const BtpCat = require('../src/cat')

const localClient = new BtpSpider({
  name: 'localClient',
  upstreams: [
    {
      url: 'ws://localhost:8000',
      token: 'asdf'
    }
  ]
}, (peerId) => {
  console.log(`connected to ${peerId}`)
}, (obj, peerId) => {
  console.log(`client sees BTP packet from ${peerId}`, BtpCat(obj))
})

localClient.start()
setTimeout(() => {
  console.log('5 seconds passed, closing client again!')
  localClient.stop()
}, 5000)
