/*

WebSockets Broker
Written by Cliff Rosen

Main application file

TO DO:
error handling
defensive coding
function documentation
refactoring

*/
const sessionManager = require('./sessionManager');

const app = require('express')();
const http = require('http');
const server = http.Server(app);

const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

const fs = require('fs');

wss.on('connection', function connection(ws, req) {
    ws.ID = Date.now();
    console.log('Websocket connected: ' + ws.ID);

    // incoming messages can be either session management or command
    ws.onmessage = function incoming(message) {
        console.log(`************ Message received from: `, ws.ID);

        // Extract object from message.  Bail if message cannot be parsed.
        try {
            data = JSON.parse(message.data);
        } catch(e) {
            data = message.data;
        }
        console.log(`received: ${data}` + ' of type ' + typeof(data));
        if (typeof(data) != 'object') {
            console.log("Message is not an object: " + data);
            return;
        }
        
        // Handle message based on type
        switch(data.type){

            case "SESSION":
                console.log("Received SESSION object.  Updating session.");
                let res = {};
                res = sessionManager.updateSessionTable(ws, data.client, data.target, data.key);
                console.log("Session results: " + res.result);
                if (res.result == 0) {
                    ws.send("SESSION_UP");
                    res.targetWS.send("SESSION_UP");
                } else {
                    ws.send("SESSION_NOT_UP: " + res.result);
                    if (res.result == -2) {
                        res.targetWS.send("SESSION_NOT_UP: -2");
                    }
                }
                break;

            case "COMMAND":
                console.log("Received COMMAND object. Executing command: " + data.command);
                processCommand(ws, data.command);
                break;

            default:
                console.log("Received unknown message type.");
        }
    };
 
    ws.onclose = function incoming(message) {
        console.log(`************ Closing ws `, ws.ID);
        partnerWS = sessionManager.updateSessionClearTargetInfoFromTargetID(ws.ID);
        //console.log("TargetWS: %s", targetWS);
        if (partnerWS != null){
            partnerWS.send("SESSION_NOT_UP: -1");
        }
        sessionManager.deleteSessionFromID(ws.ID);
    };

});

server.listen(8000);

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});

app.get('/trigger1', (req, res) => {
    res.writeHead(200, {'ContentType': 'text/html'});
    res.write("Hey");
    res.end();
});

app.get('/sessions', (req, res) => {
    res.writeHead(200, {'ContentType': 'text/html'});
    res.write(sessionManager.getSessionTable());
    res.end();
});

function processCommand(ws, command){
    wsTarget = sessionManager.getTargetWSFromSession(ws);
    //console.log("getTargetWSFromSession returned %s", wsTarget);
    if (typeof(wsTarget) == 'number'){
        console.log("Invalid session.  Dropping command.")
    } else {
        wsTarget.send(command);
    }
}
