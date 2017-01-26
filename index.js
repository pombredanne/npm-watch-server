'use strict';

const ChangesStream = require('changes-stream');
const fetch = require('node-fetch');
const WebSocketServer = require('ws').Server;
const {EventEmitter} = require('events');

const PORT = process.argv[2] || process.env.PORT || 8080;

const changes = new ChangesStream({
    db: 'https://replicate.npmjs.com',
    since: 'now',
});

const ee = new EventEmitter();

ee.setMaxListeners(Infinity);

function request(id, retry) {
    return fetch(`https://registry.npmjs.com/${id}`)
    .then((res) => {
        if (res.status !== 200) {
            throw new Error(`${id} HttpError #${res.status}: ${res.statusText}`);
        }
        
        return res.json();
    })
    .then((json) => {
        ee.emit('change', json);
    });
}

changes.on('data', (change) => {
    request(change.id, 0)
    .catch((error) => {
        console.error(error);
    });
});

changes.on('error', onError);

const wss = new WebSocketServer({
    port: PORT,
}, () => {
    console.log('Listening port %s', PORT);
});

wss.on('connection', (conn) => {
    console.log('Connected %s', conn.upgradeReq.socket.remoteAddress);
    
    function onChange(pack) {
       conn.send(JSON.stringify({event: 'npm:update', data: pack}, null));
    }
    
    ee.on('change', onChange);
   
    conn.on('close', () => {
        console.log('Disconnected %s', conn.upgradeReq.socket.remoteAddress);
        ee.removeListener('change', onChange);
    });
});

wss.on('error', onError);

function onError(error) {
    console.error(error.message);
    process.exit(1);
}
