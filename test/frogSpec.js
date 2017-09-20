const BtpFrog = require('../src/frog')
const BtpPacket = require('btp-packet')
const DummyPlugin = require('./helpers/dummyPlugin')
const assert = require('chai').assert

describe('Frog', () => {
  beforeEach(function () {
    this.whenFrogSends = []

    this.plugin = new DummyPlugin({
      prefix: 'bla.'
    })
    this.frog = new BtpFrog(this.plugin, (obj) => {
      this.whenFrogSends.map(f => f(obj))
    })
    this.request = function (protocolName, data, to) {
      const responsePromise = new Promise(resolve => {
        this.whenFrogSends.push(obj => {
          resolve(obj.data)
        })
      })
      let obj = {
        type: BtpPacket.TYPE_MESSAGE,
        requestId: 1,
        data: [ {
          protocolName,
          contentType: BtpPacket.MIME_APPLICATION_OCTET_STRING,
          data
        } ]
      }
      if (to) {
        obj.data.push({
          protocolName: 'to',
          contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
          data: to
        })
      }
      this.frog.handleMessage(obj)
      return responsePromise
    }
    return this.frog.start()
  })

  afterEach(function () {
    return this.frog.stop()
  })

  it('should connect the plugin', function () {
    assert.equal(this.plugin.connected, true)
  })

  it('should relay getAccount to the plugin', function () {
    return this.request('info', Buffer.from([ 0 ])).then(response => {
      assert.deepEqual(response[0].data.toString('utf-8'), 'bla.dummy-account')
    })
  })

  it('should relay getBalance to the plugin', function () {
    return this.request('balance', Buffer.from([ 0 ])).then(response => {
      assert.deepEqual(response[0].data, Buffer.from([ 0, 0, 0, 0, 0, 0, 1, 4 ]))
    })
  })

  it('should relay getInfo to the plugin', function () {
    return this.request('info', Buffer.from([ 2 ])).then(response => {
      assert.deepEqual(response[0].data.toString('utf-8'), JSON.stringify({ prefix: 'bla.' }))
    })
  })

  it('should relay sendRequest to the plugin', function () {
    return this.request('ilp', Buffer.from('Is your name connie?', 'ascii'), 'bla.connie').then(response => {
      assert.deepEqual(response, [
        {
          protocolName: 'from',
          contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
          data: Buffer.from('bla.connie', 'ascii')
        },
        {
          protocolName: 'to',
          contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
          data: Buffer.from('bla.dummy-account', 'ascii')
        },
        {
          protocolName: 'ilp',
          contentType: BtpPacket.MIME_APPLICATION_OCTET_STRING,
          data: Buffer.from('011c000000000754d4c00e672e75732e6e657875732e626f620304104100', 'hex')
        }
      ])
    })
  })

  it('should relay sendTransfer to the plugin', function (done) {
    this.whenFrogSends.push(obj => {
      assert.deepEqual(obj, {
        type: BtpPacket.TYPE_ACK,
        requestId: obj.requestId,
        data: []
      })
      done()
    })
    const obj = {
      type: BtpPacket.TYPE_PREPARE,
      requestId: 1,
      data: {
        transferId: '123e4567-e89b-12d3-a456-426655440000',
        amount: 155,
        executionCondition: Buffer.from('011c00000880000754d4c00e672e75732e6e657875732e626f620304104100', 'hex'),
        expiresAt: new Date('2000-01-01 00:00Z'),
        protocolData: [ {
          protocolName: 'ilp',
          contentType: BtpPacket.MIME_APPLICATION_OCTET_STRING,
          data: Buffer.from('011c000000000754d4c00e672e75732e6e657875732e626f620304104100', 'hex')
        }, {
          protocolName: 'to',
          contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
          data: Buffer.from('bla.connie', 'ascii')
        } ]
      }
    }
    this.frog.handleMessage(obj)
  })

  it.skip('should relay fulfillCondition to the plugin', function (done) {
  })

  it.skip('should relay rejectIncomingTransfer to the plugin', function (done) {
  })

  it('should relay incoming_prepare from the plugin', function (done) {
    this.whenFrogSends.push(obj => {
      assert.deepEqual(obj, {
        type: BtpPacket.TYPE_PREPARE,
        requestId: obj.requestId,
        data: {
          transferId: '123e4567-e89b-12d3-a456-426655440000',
          expiresAt: new Date('2000-01-01 00:00Z'),
          amount: '5234',
          executionCondition: Buffer.from([1, 28, 0, 0, 0, 0, 7, 84, 212, 192, 14, 103, 46, 117, 115, 46, 110, 101, 120, 117, 115, 46, 98, 111, 98, 3, 4, 16, 119, 119]).toString('base64'),
          protocolData: [ {
            protocolName: 'from',
            contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
            data: Buffer.from('bla.alice', 'ascii')
          }, {
            protocolName: 'to',
            contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
            data: Buffer.from('bla.dummy-account', 'ascii')
          }, {
            protocolName: 'ilp',
            contentType: BtpPacket.MIME_APPLICATION_OCTET_STRING,
            data: Buffer.from('011c000000000754d4c00e672e75732e6e657875732e626f620304104100', 'hex')
          } ]
        }
      })
      done()
    })
    this.plugin.handlers.incoming_prepare({
      id: '123e4567-e89b-12d3-a456-426655440000',
      from: 'bla.alice',
      to: 'bla.dummy-account',
      ledger: 'bla.',
      amount: '5234',
      ilp: Buffer.from('011c000000000754d4c00e672e75732e6e657875732e626f620304104100', 'hex').toString('base64'),
      noteToSelf: {},
      executionCondition: Buffer.from([1, 28, 0, 0, 0, 0, 7, 84, 212, 192, 14, 103, 46, 117, 115, 46, 110, 101, 120, 117, 115, 46, 98, 111, 98, 3, 4, 16, 119, 119]).toString('base64'),
      expiresAt: new Date('2000-01-01 00:00Z'),
      custom: {}
    })
  })

  it('should relay outgoing_fulfill from the plugin', function (done) {
    const fulfillment = Buffer.from('011c000000000754d4c00e672e75732e6e657875732e626f620304107777', 'hex')
    this.whenFrogSends.push(obj => {
      assert.deepEqual(obj, {
        type: BtpPacket.TYPE_FULFILL,
        requestId: obj.requestId,
        data: {
          transferId: '123e4567-e89b-12d3-a456-426655440000',
          fulfillment: fulfillment.toString('base64'),
          protocolData: []
        }
      })
      done()
    })
    this.plugin.handlers.outgoing_fulfill({ id: '123e4567-e89b-12d3-a456-426655440000' }, fulfillment.toString('base64'))
  })

  it.skip('should relay outgoing_reject from the plugin', function (done) {
  })
})
