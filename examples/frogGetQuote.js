const BtpPacket = require('btp-packet')
const IlpPacket = require('ilp-packet')
const BtpFrog = require('../src/frog')
const PluginBells = require('ilp-plugin-bells')

const plugin = new PluginBells({
  account: 'https://red.ilpdemo.org/ledger/accounts/alice',
  password: 'alice'
})

const frog = new BtpFrog(plugin, (obj) => {
  obj.data.map(item => {
    if (item.protocolName === 'ilp') {
      console.log(IlpPacket.deserializeIlpPacket(item.data))
    } else {
      console.log(item.protocolName, item.data.toString('utf8'))
    }
  })
  frog.stop()
})
frog.start().then(() => {
  return frog.handleMessage({
    type: BtpPacket.TYPE_MESSAGE,
    requestId: 1,
    data: {
      protocolData: [ {
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
    }
  })
})
