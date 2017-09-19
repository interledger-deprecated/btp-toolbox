const BtpPacket = require('btp-packet')
const IlpPacket = require('ilp-packet')
const BtpFrog = require('../src/frog')
const BtpCat = require('../src/cat')
const PluginBells = require('ilp-plugin-bells')

const plugin = new PluginBells({
  account: 'https://red.ilpdemo.org/ledger/accounts/alice',
  password: 'alice'
})

const frog = new BtpFrog(plugin, (obj) => {
  console.log('Response from Frog:', BtpCat(obj))
  frog.stop()
})

frog.start().then(() => {
  const request = {
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
  }
  console.log('Request to Frog:', BtpCat(request))
  return frog.handleMessage(request)
})
