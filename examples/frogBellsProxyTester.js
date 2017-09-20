const BtpPacket = require('btp-packet')
const IlpPacket = require('ilp-packet')
const BtpSpider = require('../src/spider')
const BtpCat = require('../src/cat')

const spider = new BtpSpider({
  name: '',
  upstreams: [ {
    url: 'ws://localhost:8000',
    token: ''
  } ]
}, (peerId) => {
  console.log('connected as ' + peerId)
  spider.send({
    type: BtpPacket.TYPE_MESSAGE,
    requestId: 1,
    data: [ {
      protocolName: 'ilp',
      contentType: BtpPacket.MIME_APPLICATION_OCTET_STREAM,
      data: IlpPacket.serializeIlqpByDestinationRequest({
        destinationAccount: 'de.eur.blue.bob',
        destinationAmount: '9000000000',
        destinationHoldDuration: 3000
      })
    }, {
      protocolName: 'to',
      contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
      data: Buffer.from('us.usd.red.connie', 'ascii')
    } ]
  }, peerId)
}, (obj, peerId) => {
  console.log('Got message back from Spider', BtpCat(obj, BtpPacket.BTP_VERSION_ALPHA))
  spider.stop()
})

spider.start().then(() => {
  console.log('Spider started')
})
