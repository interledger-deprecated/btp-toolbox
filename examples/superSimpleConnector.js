const crypto = require('crypto')
const BtpPacket = require('btp-packet')
const BtpSpider = require('../src/spider')
const BtpCat = require('../src/cat')

let peers = []

const spider = new BtpSpider({ listen: 8000 }, (peerId) => {
  console.log('conn', peerId)
  peers.push(peerId)
}, (obj, peerId) => {
  console.log('msg', BtpCat(obj), peerId)
  if (peers.length !== 2) {
    console.error('one-to-one connector needs exactly two peers')
    return
  }
  let otherPeerId = peers[0]
  if (peerId === peers[0]) {
    otherPeerId = peers[1]
  }
  if (obj.type === BtpPacket.TYPE_PREPARE) {
    obj.data.amount = '' + (parseInt(obj.data.amount) + 1) // pocket the profit! :)
  }
  spider.send(obj, otherPeerId)
})

const client1 = new BtpSpider({
  name: 'client1',
  upstreams: [
    {
      url: 'ws://localhost:8000',
      token: 'asdf'
    }
  ]
}, (peerId) => {
  console.log(`connected to ${peerId}`)
}, (obj, peerId) => {
  console.log(`client 1 sees BTP packet from ${peerId}`, BtpCat(obj))
})

const client2 = new BtpSpider({
  name: 'client2',
  upstreams: [
    {
      url: 'ws://localhost:8000',
      token: 'asdf'
    }
  ]
}, (peerId) => {
  console.log(`connected to ${peerId}`)
}, (obj, peerId) => {
  console.log(`client 2 sees BTP packet from ${peerId}`, BtpCat(obj))
})

spider.start().then(() => {
  return client1.start()
}).then(() => {
  return client2.start()
}).then(() => {
  return client1.send({
    type: BtpPacket.TYPE_PREPARE,
    requestId: 1,
    data: {
      transferId: '6c84fb90-12c4-11e1-840d-7b25c5ee775a',
      amount: 123,
      expiresAt: new Date().getTime(),
      executionCondition: crypto.randomBytes(32).toString('base64'),
      protocolData: []
    }
  }, 'ws://localhost:8000/client1/asdf')
})
