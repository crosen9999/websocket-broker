/*
sessionManager.js provides session management functions

Session management works as follows:

Each client wishing to use the service must provide 3 pieces of information

    ClientID        globally unique identifier of client system
    TargetID        globally unique identifier of system that client wishes to communicate with
    Shared Key      string that client and target agree on to authenticate communication

A session object contains the following properties:

    PROPERTY        DESCRIPTION
    ==============  ====================================================
    ID              unique identifier generated when session is created
    clientSystemID  identifier for system connected to service
    targetSystemID  identifier for system that client wants to control
    sharedKey       validation string
    clientWebSocket Web socket connecting service to client system
    targetWebSocket Web socket connecting service to target system
    
The standard sequence of operations related to session management is as follows:

1. Client system requests session connecting it to target system.  That request includes:

    ID of client system
    ID of target system
    shared key

2. The system sees that there are no records for the pair of systems, and so a new record is 
inserted into the sessions table with that info.  The session ID is returned to the client.

3. Partner client system provides a likewise request.  System performs lookup and sees that
a record already exists for the pair of systems and that the shared key matches. As a result,
    a. that record is updated to store its WebSocket in the targetWebSocket property
    b. another record is added for the partner client
    c. the session ID is returned to the partner client

4. Now either system can request a command to be sent to the other system.  This request is
accompanied by the session ID and the shared key.  When such a request is received, the following
logic is performed:

    sendCommandToPartner(sessionID, sharedKey, command, commParameters)

    a. System sees that a command message has been sent from system A to system B and checks
    for existing session record that matches session ID and shared key

    b. Assuming a match is found, the WebSocket of the target system is retrieved from the
    session table and the command is sent through the socket.

*/

let sessions = [];

/*
FUNCTION updateSession(ws, clientID, targetID, key)
    ws      WebSocket of client
    client  ID of client system
    target  ID of system that client wants to communicate with
    key     shared key value proposed by client

RETURNS
    {
        "result": [see below]
        "clientWS": clientWS,
        "targetWS": targetWS | null
    }

    result:
        0     Session setup is complete. {'clientWS' = clientWS, 'targetWS' = targetWS}
        -1    Partner has not provided permission
        -2    Invalid shared key
        -100  Invalid input
    
This function is called to update the session table.  The session table:
    a. Tracks which target system each client system wants to communicate with
    b. Keeps a reference to the WebSockets setup by each system
    
Session properties:

    sessionID
    clientID
    targetID
    clientKey
    targetKey
    clientSocket
    targetSocket

If client/target is found in session table, the clientKey and clientSocket are updated
If target/client is found in session table, targetKey and targetSocket are updated
If client/target is not found in session table, a new record is added
*/
function updateSessionTable(ws, clientID, targetID, key) {
    console.log("Updating session.");

    if (clientID == undefined || targetID == undefined || key == undefined ){
        console.log("updateSessionTable: Invalid input");
        return -100;
    }

    let clientRecordIndex = -1;
    let targetRecordIndex = -1;

    // locate client/target and target/client records
    let i;
    for (i = 0; i < sessions.length; i++) {
        // cleanup if current socket is already used for another client/target pair
        if (sessions[i].ID == ws.ID) {
            if (sessions[i].clientID != clientID || sessions[i].targetID != targetID) {
                console.log('WebSocket changing system IDs.  Cleaning up session records.')
                if (sessions[i].targetWS != null){
                   updateSessionClearTargetInfo(sessions[i].targetWS.ID);
                }
                sessions.splice(i,1);
                if (i >= sessions.length){
                    break;
                }
            }
        } 
        // if we have a match then set index variables
        if (sessions[i].clientID == clientID && sessions[i].targetID == targetID) {
            clientRecordIndex = i;
        } else if (sessions[i].clientID == targetID && sessions[i].targetID == clientID) {
            targetRecordIndex = i;
        }
    }

    // if neither record is found, add client record
    if (clientRecordIndex == -1 && targetRecordIndex == -1){
        console.log('Neither record found.  Adding client/target.')
        clientSID = addSession(clientID, targetID, key, null, ws, null);
        //ws.send(clientSID);
        return {"result": -1, "clientWS": ws, "targetWS": null};
    }

    // if client/target only is found, update client/target
    if (clientRecordIndex > -1 && targetRecordIndex == -1){
        console.log('client/target found.  Updating record.')
        updateSessionFromIndex(clientRecordIndex, ws.ID, clientID, targetID, key, null, ws, null);
        return {"result": -1, "clientWS": ws, "targetWS": null};
    }

    // if target/client only is found, update target/client and add client/target
    if (clientRecordIndex == -1 && targetRecordIndex > -1){
        console.log('target/client found.  Updating target/client and adding client/target.')
        //update target key and target WS in target/client record with new values
        updateSessionFromIndex( targetRecordIndex, 
                                sessions[targetRecordIndex].ID,
                                targetID, clientID,
                                sessions[targetRecordIndex].clientKey,
                                key,
                                sessions[targetRecordIndex].clientWS,
                                ws);
        //add new client/target record with new client values and retrieved target values
        targetSID = addSession( clientID, targetID,
                                key, sessions[targetRecordIndex].clientKey,
                                ws, sessions[targetRecordIndex].clientWS);
        if (key == sessions[targetRecordIndex].clientKey){
            return {"result": 0, "clientWS": ws, "targetWS": sessions[targetRecordIndex].clientWS};
        } else {
            return {"result": -2, "clientWS": ws, "targetWS": sessions[targetRecordIndex].clientWS};
        }

    }

    // if client/target and target/client is found, update both records with new key and ws
    if (clientRecordIndex > -1 && targetRecordIndex > -1){
        console.log('Both records found.  Updating both records.')
        //update client ID, key and ws of client/target record
        updateSessionFromIndex( 
            clientRecordIndex, 
            ws.ID,
            clientID,targetID,
            key, 
            sessions[targetRecordIndex].clientKey,
            ws,
            sessions[targetRecordIndex].clientWS
            );

        //update target key and WS of target/client record
        updateSessionFromIndex( 
            targetRecordIndex, 
            sessions[targetRecordIndex].ID,
            targetID, clientID,
            sessions[targetRecordIndex].clientKey,  
            key,
            sessions[targetRecordIndex].clientWS,
            ws);

        if (key == sessions[targetRecordIndex].clientKey){
            return {"result":0, "clientWS": ws, "targetWS": sessions[targetRecordIndex].clientWS};
        } else {
            return {"result": -2, "clientWS": ws, "targetWS": sessions[targetRecordIndex].clientWS};
        }
    }
}

function addSession(clientID, targetID, clientKey, targetKey, clientWS, targetWS) {
    let newSession = {};
    newSession.ID = clientWS.ID;
    newSession.clientID = clientID;
    newSession.targetID = targetID;
    newSession.clientKey = clientKey;
    newSession.targetKey = targetKey;
    newSession.clientWS = clientWS;
    newSession.targetWS = targetWS;
    sessions.push(newSession);

    console.log('Adding new session: ' + newSession.ID);

    return newSession.ID;
}

function updateSessionFromIndex(i, sessionID, clientID, targetID, clientKey, targetKey, clientWS, targetWS) {

    console.log('Updating session from index: ' + i);

    sessions[i].ID = sessionID;
    sessions[i].clientID = clientID;
    sessions[i].targetID = targetID;
    sessions[i].clientKey = clientKey;
    sessions[i].targetKey = targetKey;
    sessions[i].clientWS = clientWS;
    sessions[i].targetWS = targetWS;

}

function updateSessionClearTargetInfo(ID){
    console.log("Updating session: " + ID);
    let i;
    for (i = 0; i < sessions.length; i++) {
        //console.log('socket.ID: ' + sessions[i].socket.ID);
        if (sessions[i].ID == ID) {
            sessions[i].targetKey = null;
            sessions[i].targetWS = null;
        }
    }
}

/*
FUNCTION updateSessionClearTargetInfoFromTargetID(ID)

Returns:
    partnerWS    partner WS, if one exists. otherwise null

Behavior:
    Locates session record where targetWS.ID matches the input and
    clears the target key and target WS from that record.
    Returns the clientWS from that record

*/
function updateSessionClearTargetInfoFromTargetID(ID){
    console.log("Updating session with target ID: " + ID);
    let partnerWS = null;
    let i;
    i = sessions.findIndex( session => {return (session.targetWS != null && session.targetWS.ID == ID);});
    console.log("Update index = " + i);
    if (i >= 0) {
        partnerWS = sessions[i].clientWS;
        sessions[i].targetKey = null;
        sessions[i].targetWS = null;
    }
    // for (i = 0; i < sessions.length; i++) {
    //     if (sessions[i].targetWS != null && sessions[i].targetWS.ID == ID) {
    //         partnerWS = sessions[i].clientWS;
    //         sessions[i].targetKey = null;
    //         sessions[i].targetWS = null;
    //     }
    // }
    return partnerWS;
}

/*
FUNCTION deleteSessionFromID(ID)
    ID  ID of session to be deleted

Behavior:
    Deletes sessions array element with specified ID

*/
function deleteSessionFromID(ID) {
    console.log('Deleting session: ' + ID);
    i = sessions.findIndex( session => {return session.ID == ID});
    console.log("Delete index = " + i);
    if (i >= 0) {sessions.splice(i,1)};
}

/*
FUNCTION getSessionTable()

    sessionID
    clientID
    targetID
    clientKey
    targetKey
    clientSocket
    targetSocket
*/
function getSessionTable() {
    console.log('Session table length: ' + sessions.length);
    let res = '<table border=1><tr><td>ID</td><td>clientID</td><td>targetID</td><td>client key</td><td>target key</td><td>client WS</td><td>target WS</td></tr>';
    sessions.forEach( (item)=> {
        console.log('Session ID: ' + item.ID);
        targetWSID = (item.targetWS == null) ? 'null' : item.targetWS.ID;
        res += '<tr><td>' + item.ID + '</td>';
        res += '<td>' + item.clientID + '</td>'; 
        res += '<td>' + item.targetID + '</td>'; 
        res += '<td>' + item.clientKey + '</td>'; 
        res += '<td>' + item.targetKey + '</td>'; 
        res += '<td>' + item.clientWS.ID + '</td>'; 
        res += '<td>' + targetWSID + '</td></tr>'; 
    }
    );
    res += '</table>';
    return res;
}

/*
FUNCTION getTargetFromSession

Checks if there is a valid session for ws.
If so, return targetWS
If not, return:

    -1  no targetWS found
    -2  shared key does not match

*/
function getTargetWSFromSession(ws){
    let i;
    for (i = 0; i < sessions.length; i++) {
        if (sessions[i].clientWS != null && sessions[i].clientWS.ID == ws.ID) {
            if (sessions[i].clientKey == sessions[i].targetKey){
                return sessions[i].targetWS;
            }
            return -2;
        }
    }
    return -1;
}

module.exports.sessions = sessions;
module.exports.updateSessionTable = updateSessionTable;
module.exports.addSession = addSession;
module.exports.deleteSessionFromID = deleteSessionFromID;
module.exports.getSessionTable = getSessionTable;
module.exports.updateSessionClearTargetInfo = updateSessionClearTargetInfo;
module.exports.updateSessionClearTargetInfoFromTargetID = updateSessionClearTargetInfoFromTargetID;
module.exports.getTargetWSFromSession = getTargetWSFromSession;
