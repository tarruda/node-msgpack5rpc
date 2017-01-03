
import * as msgpack5 from "msgpack5"
import { EventEmitter } from "events"
import * as assign from "lodash/assign"
import * as net from "net"

class Response {

  _sent = false
  _encoder
  _request_id: number

  constructor(encoder, request_id) {
    this._encoder = encoder
    this._request_id = request_id 
  }

  send(resp, isError) {
    if (this._sent)
      throw new Error(`Respnse to id ${this._request_id} already sent.`)
    if (isError) {
      this._encoder.write([1, this._request_id, resp, null])
    } else {
      this._encoder.write([1, this._request_id, null, resp])
    }
    
    this._sent = true
  }

}

const MSGPACK_OPTS = {
  header: false
}

class Session extends EventEmitter {

  _pending_requests = {}
  _next_request_id = 1
  _encoder 
  _decoder 
  _writer
  _reader

  constructor(types = []) { 

    super()
    
    const msgpack = msgpack5(types)

    for (const type of types) {
      msgpack.register(type.code, type.constructor, type.encode, type.decode)
    }

    this._encoder = msgpack.encoder(MSGPACK_OPTS)
    this._decoder = msgpack.decoder(MSGPACK_OPTS)

    this._decoder.on('data', this._parse_message.bind(this))

    this._decoder.on('end', () => {
      this.detach()
      this.emit('detach')
    })

  }

  attach(writer, reader) {
    this._encoder.pipe(writer)
    reader.pipe(this._decoder)
    this._writer = writer
    this._reader = reader
  }

  detach() {
    this._encoder.unpipe(this._writer);
    this._reader.unpipe(this._decoder);
  }
  
  request(method, args) {
    return new Promise((accept, reject) => {
      const request_id = this._next_request_id++
      this._pending_requests[request_id] = { accept, reject }
      this._encoder.write([0, request_id, method, args])
    })
  }

  notify(method, args) {
    this._encoder.write([2, method, args])
  }

  _parse_message([msg_type, ...msg_rest]) {
     switch (msg_type) {
     case 0: {
       const [id, method, args] = msg_rest
       this.emit('request', method.toString(), args
                , new Response(this._encoder, id))
       break
     } case 1: {
       const [id, err, result] = msg_rest
       const p = this._pending_requests[id]
       delete this._pending_requests[id]
       if (err) p.reject(err)
       else p.accept(result)
       break
     } case 2: {
       const [event_name, args] = msg_rest
       this.emit('notification', event_name.toString(), args)
       break
     } default:
       this._encoder.write([1, 0, 'Invalid message type', null])
     }
  }

}

export = Session

