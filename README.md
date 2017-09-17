# btp-toolbox
Tools for building and debugging with the Bilateral Transport Protocol (BTP)

# <img src="./assets/spider.svg" width="25px"> Spider

The BTP Spider can be configured to act as one BTP server and/or one or multiple BTP clients.

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
```sh
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
    obj.data.amount++ // pocket the profit! :)
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
