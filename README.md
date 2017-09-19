# btp-toolbox
Tools for building and debugging with the Bilateral Transport Protocol (BTP)

# <img src="./assets/spider.svg" width="25px"> Spider

The BTP Spider sits like a spider in a web, between its BTP peers. It can be configured to act as one BTP
server and/or one or multiple BTP clients. It takes care of reconnecting clients when the server restarts,
and resending BTP packets that were not yet responded to. It can also register a TLS certificate registration
for you, or run on localhost.

You can use BTP Spider on its own, if you want to write your own code to deal with the sub-protocols
on top of BTP, or in combination with BTP Frog and BTP Cat from this same repo, or (in the near future)
in combination with [newer](://github.com/interledgerjs/ilp-plugin-virtual/pull/77)
[versions](https://github.com/interledgerjs/ilp-plugin-payment-channel-framework/pull/21) of ilp-plugin-virtual
and other plugins from the ILP reference stack, as and when they are switching from RPC to BTP.

Its constructor takes three arguments:
* config
  * `listen`: `<Number>` On localhost, port to listen on. You can specify `listen`, or `tls`, or neither, but not both.
  * `tls`: On a server, domain name to register a LetsEncrypt certificate for. You can specify `listen`, or `tls`, or neither, but not both.
  * `upstreams`: `<Array of Object>`
    * `url`: `<String>` The base URL of the server. Should start with either `ws://` or `wss://` and should not end in a `/`.
    * `token`: `<String>` The token for connecting to this upstream.
  * `name`: `<String>` Required if `upstreams` is non-empty; used to determine the WebSocket URL when connecting to upstreams
* connectionCallback
  * @param `peerId`: `<String>` Full URL of the WebSocket connection, e.g. `'ws://localhost:8000/name/token'`
* messageCallback
  * @param `obj`: `<Object>` Result of `BtpPacket.deserialize` of the BTP packet that was received.
  * @param `peerId`: `<String>` Full URL of the WebSocket connection, e.g. `'ws://localhost:8000/name/token'`

There is one method, `send`, to send a BTP packet to one of the Spider's peers:
* @param `obj`: `<Object>` Object that will be passed to `BtpPacket.serialize` to create the BTP packet.
* @param `peerId`: `<String>` URL of the upstream or downstream peer to which the packet should be sent.
* @returns `<Promise>.<null>`

## Creating a local server:

See `examples/localServer.js`

```js
const BtpSpider = require('./src/spider')
localServer = new BtpSpider({
  listen: 8000
}, (peerId) => {
  console.log(`somebody connected on ${peerId}`)
}, (obj, peerId) => {
  console.log(`server sees BTP packet from ${peerId}`, obj)
})
```

## Creating a client:

See `examples/localServer.js`

```js
localClient = new BtpSpider({
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
  console.log(`client sees BTP packet from ${peerId}`, obj)
})
```

## Sending and receiving BTP packets

Start an interactive node REPL,
```sh
$ node
>
```

Now paste the two snippets above into it, and then run:

```js
> localClient.start()
Promise { <pending> }
> localServer.start()
Promise { <pending> }
> somebody connected on ws://localhost:8000/localClient/asdf
connected to ws://localhost:8000/localClient/asdf

> localClient.send({ type: 1, requestId: 1, data: { protocolData: [] } }, 'ws://localhost:8000/localClient/asdf')
undefined
> server sees BTP packet from ws://localhost:8000/localClient/asdf { type: 1, requestId: 1, data: [] }
> localServer.stop()
Promise { <pending> }
> localClient.stop()
Promise { <pending> }
>
```

## Built-in LetsEncrypt registration

If instead of `listen` you specify `tls`, the server will listen for secure WebSockets on port 443.
This will not work on your laptop, or on a PaaS service like Heroku; you need a server (VPS) with
its own IPv4 address, and make sure 'btp.example.com' points to your server and DNS has propagated.

Then, SSH into your server:

```sh
ssh root@btp.example.com
```

Then run this node script:

```js
new BtpSpider({ tls: 'btp.example.com' }, (peerId) => {}, (obj, peerId) => {})
```

## Super-simple connector

This connector forwards all incoming BTP packets from one peer to another,
taking just a tiny profit in the process. It's not meant as something actually
useful, just an example to show you how you can use the connection callback,
the message callback, and the send method.

See `examples/superSimpleConnector.js`

```js
const BtpPacket = require('btp-packet')
const BtpSpider = require('./src/spider')
let peers = []
const spider = new BtpSpider({ listen: 8000 }, (peerId) => {
  console.log('conn', peerId)
  peers.push(peerId)
}, (obj, peerId) => {
  console.log('msg', obj, peerId)
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
spider.start()
```

You can test this super-simple connector by connecting two clients to it:
```js
const BtpPacket = require('btp-packet')
const crypto = require('crypto')
const BtpSpider = require('./src/spider')

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
  console.log(`client sees BTP packet from ${peerId}`, obj)
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
  console.log(`client sees BTP packet from ${peerId}`, obj)
})
client1.start().then(() => {
  return client2.start()
}).then(() => {
  return client2.send({
    type: BtpPacket.TYPE_PREPARE,
    requestId: 1,
    data: {
      transferId: '6c84fb90-12c4-11e1-840d-7b25c5ee775a',
      amount: 123,
      expiresAt: new Date().getTime(),
      executionCondition: crypto.randomBytes(32).toString('base64'),
      protocolData: []
    }
  }, 'ws://localhost:8000/client2/asdf')
})
```

# <img src="./assets/frog.svg" width="25px"> Frog

The BTP Frog can 'swallow' an Interledger plugin, and make it look like a BTP peer.

Example usage (make sure you `npm install ilp-plugin-bells` first, for this example),
see `example/frogGetQuote.js` for the code:

```js
const BtpPacket = require('btp-packet')
const IlpPacket = require('ilp-packet')
const BtpFrog = require('./src/frog')
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
```

This script will output a quote response from the connector on red.ilpdemo.org, like:

```js
from us.usd.red.connie
to us.usd.red.alice
{ type: 7,
  typeString: 'ilqp_by_destination_response',
 data: { sourceAmount: '10782788022', sourceHoldDuration: 5000 } }
```

You can also try the `examples/frogBellsProxy.js` script; wait for it
to say both 'Spider started' and 'Frog started', then run `examples/frogBellsProxyTester.js`
in a separate terminal window. It will do the same ILQP request to connie@red.ilpdemo.org.

# <img src="./assets/cat.svg" width="25px"> Cat

You may already have seen BtpCat being used in the example script; it's used strictly for logging.
It can be used to display BTP packets, and the ILP packets inside them,
in a nice human-readable way. It's a single function that takes a JavaScript object, and
outputs a String so that `eval(BtpCat(obj)) === obj`. Example usage:

```js
const BtpPacket = require('btp-packet')
const IlpPacket = require('ilp-packet')
const BtpCat = require('./src/cat')
const chalk = require('chalk')

// See https://github.com/interledgerjs/ilp-packet/pull/14
IlpPacket.serializeIlpPacket = (json) => {
  switch (json.type) {
    case IlpPacket.Type.TYPE_ILP_PAYMENT: return IlpPacket.serializeIlpPayment(json.data)
    case IlpPacket.Type.TYPE_ILQP_LIQUIDITY_REQUEST: return IlpPacket.serializeIlqpLiquidityRequest(json.data)
    case IlpPacket.Type.TYPE_ILQP_LIQUIDITY_RESPONSE: return IlpPacket.serializeIlqpLiquidityResponse(json.data)
    case IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST: return IlpPacket.serializeIlqpBySourceRequest(json.data)
    case IlpPacket.Type.TYPE_ILQP_BY_SOURCE_RESPONSE: return IlpPacket.serializeIlqpBySourceResponse(json.data)
    case IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_REQUEST: return IlpPacket.serializeIlqpByDestinationRequest(json.data)
    case IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_RESPONSE: return IlpPacket.serializeIlqpByDestinationResponse(json.data)
    case IlpPacket.Type.TYPE_ILP_ERROR: return serializeIlpError(json.data)
    default: throw new Error('JSON object has invalid type')
  }
}

console.log(chalk.bold.green('alice sends:'), chalk.green(BtpCat({
  type: BtpPacket.TYPE_MESSAGE,
  requestId: 4,
  data: [ {
    protocolName: 'ilp',
    contentType: BtpPacket.MIME_APPLICATION_OCTET_STRING,
    data: IlpPacket.serializeIlpPacket({
      "type": 6,
      "typeString": "ilqp_by_destination_request",
      "data": {
        "destinationAccount": "de.eur.blue.bob",
        "destinationAmount": "9000000000",
        "destinationHoldDuration": 3000
      }
    })
  }, {
    protocolName: 'to',
    contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
    data: 'us.usd.red.connie'
  } ]
})))

console.log(chalk.bold.red('alice receives:', BtpCat({
  type: BtpPacket.TYPE_RESPONSE,
  requestId: 4,
  data: [ {
    protocolName: 'from',
    contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
    data: 'us.usd.red.connie'
  }, {
    protocolName: 'to',
    contentType: BtpPacket.MIME_TEXT_PLAIN_UTF8,
    data: 'us.usd.red.alice'
  }, {
    protocolName: 'ilp',
    contentType: BtpPacket.MIME_APPLICATION_OCTET_STRING,
    data: IlpPacket.serializeIlpPacket({
      "type": 7,
      "typeString": "ilqp_by_destination_response",
      "data": {
        "sourceAmount": "10782788022",
        "sourceHoldDuration": 5000
      }
    })
  } ]
})))
```
