"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var msgpack5 = require("msgpack5");
var events_1 = require("events");
var Response = (function () {
    function Response(encoder, request_id) {
        this._sent = false;
        this._encoder = encoder;
        this._request_id = request_id;
    }
    Response.prototype.send = function (resp, isError) {
        if (this._sent)
            throw new Error("Respnse to id " + this._request_id + " already sent.");
        if (isError) {
            this._encoder.write([1, this._request_id, resp, null]);
        }
        else {
            this._encoder.write([1, this._request_id, null, resp]);
        }
        this._sent = true;
    };
    return Response;
}());
var MSGPACK_OPTS = {
    header: false
};
var Session = (function (_super) {
    __extends(Session, _super);
    function Session(types) {
        if (types === void 0) { types = []; }
        var _this = _super.call(this) || this;
        _this._pending_requests = {};
        _this._next_request_id = 1;
        var msgpack = msgpack5(types);
        for (var _i = 0, types_1 = types; _i < types_1.length; _i++) {
            var type = types_1[_i];
            msgpack.register(type.code, type.constructor, type.encode, type.decode);
        }
        _this._encoder = msgpack.encoder(MSGPACK_OPTS);
        _this._decoder = msgpack.decoder(MSGPACK_OPTS);
        _this._decoder.on('data', _this._parse_message.bind(_this));
        _this._decoder.on('end', function () {
            _this.detach();
            _this.emit('detach');
        });
        return _this;
    }
    Session.prototype.attach = function (writer, reader) {
        this._encoder.pipe(writer);
        reader.pipe(this._decoder);
        this._writer = writer;
        this._reader = reader;
    };
    Session.prototype.detach = function () {
        this._encoder.unpipe(this._writer);
        this._reader.unpipe(this._decoder);
    };
    Session.prototype.request = function (method, args) {
        var _this = this;
        return new Promise(function (accept, reject) {
            var request_id = _this._next_request_id++;
            _this._pending_requests[request_id] = { accept: accept, reject: reject };
            _this._encoder.write([0, request_id, method, args]);
        });
    };
    Session.prototype.notify = function (method, args) {
        this._encoder.write([2, method, args]);
    };
    Session.prototype._parse_message = function (_a) {
        var msg_type = _a[0], msg_rest = _a.slice(1);
        switch (msg_type) {
            case 0: {
                var id = msg_rest[0], method = msg_rest[1], args = msg_rest[2];
                this.emit('request', method.toString(), args, new Response(this._encoder, id));
                break;
            }
            case 1: {
                var id = msg_rest[0], err = msg_rest[1], result = msg_rest[2];
                var p = this._pending_requests[id];
                delete this._pending_requests[id];
                if (err)
                    p.reject(err);
                else
                    p.accept(result);
                break;
            }
            case 2: {
                var event_name = msg_rest[0], args = msg_rest[1];
                this.emit('notification', event_name.toString(), args);
                break;
            }
            default:
                this._encoder.write([1, 0, 'Invalid message type', null]);
        }
    };
    return Session;
}(events_1.EventEmitter));
module.exports = Session;
