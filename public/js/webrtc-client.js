'use strict';


navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia 
							|| navigator.mozGetUserMedia;


window.onbeforeunload = function(e){
	hangup();
}

// Data channel information
var sendChannel, receiveChannel;
var sendButton = document.getElementById("sendButton");
var sendTextarea = document.getElementById("dataChannelSend");
var receiveTextarea = document.getElementById("dataChannelReceive");
var chatChannel = document.getElementById("chatChannel");

// HTML5 <video> elements
var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');
var remoteVideo3p = document.querySelector('#remoteVideo3p');

// Handler associated with 'Send' button
sendButton.onclick = sendData;

// Flags...
var isChannelReady = false;
var isInitiator = false;
var isStarted = false;

// WebRTC data structures
// Streams
var localStream;
var remoteStream;
var remoteStream3p;
// Peer Connection
var pc1;
var pc2;

var peer_connections=0;

// Peer Connection ICE protocol configuration (either Firefox or Chrome)
var pc_config = webrtcDetectedBrowser === 'firefox' ?
  {'iceServers':[{'url':'stun:23.21.150.121'}]} : // IP address
  {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};
  
var pc_constraints = {
  'optional': [
    {'DtlsSrtpKeyAgreement': true}
  ]};

// Session Description Protocol constraints:
var sdpConstraints = {};
/////////////////////////////////////////////

// Let's get started: prompt user for input (room name)
var room = prompt('Enter room name:');
var name = prompt('Enter your name');


var socket = io();

// Send 'Create or join' message to singnalling server
if (room !== '') {
  console.log('Create or join room', room);
  socket.emit('create or join', room);
}


var constraints = {video: true, audio: true};
// Handle the mediaType
function handleUserMedia(stream) {
	localStream = stream;
	attachMediaStream(localVideo, stream);
	console.log('Adding local stream.');
	sendMessage('got user media');
}

function handleUserMediaError(error){
	console.log('navigator.getUserMedia error: ', error);
}

// Handle 'created' message coming back from server:
// this peer is the initiator
socket.on('created', function (room,tc){
  console.log('Created room ' + room);
  isInitiator = true;
  
  // Call getUserMedia()
  navigator.getUserMedia(constraints, handleUserMedia, handleUserMediaError);
  console.log('Getting user media with constraints', constraints);
  console.log('tc***************',tc);
  
  checkAndStart();
});

socket.on('join', function (room, tc){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  console.log('totalClients', tc);
  peer_connections=tc;
  isChannelReady = true;
});

// Handle 'joined' message coming back from server:
// this is the second peer joining the channel
socket.on('joined', function (room, tc){
  console.log('This peer has joined room ' + room);
  isChannelReady = true;
  
  // Call getUserMedia()
  navigator.getUserMedia(constraints, handleUserMedia, handleUserMediaError);
  console.log('Getting user media with constraints', constraints);
  console.log('tc***************',tc)
  peer_connections=tc;
});

// Server-sent log message...
socket.on('log', function (array){
  console.log.apply(console, array);
});

// Receive message from the other peer via the signalling server 
socket.on('message', function (message){
  console.log('Received message:', message);
  console.log('answer-------------------------')
  if (message === 'got user media') {
      console.log('Peer connections', peer_connections);
      // Try changing the code from here
      checkAndStart(peer_connections);
  } else if (message.type === 'offer') {
    
    if (!isInitiator && !isStarted) {
      checkAndStart(peer_connections);
    }
    if(peer_connections==3){
      pc2.setRemoteDescription(new RTCSessionDescription(message));
      doAnswer3p();
    }else{
      pc1.setRemoteDescription(new RTCSessionDescription(message));
      doAnswer();
    }    
    
  } else if (message.type === 'answer' && isStarted) {
    console.log('I am up here');
    console.log(peer_connections);
    //pc.setRemoteDescription(new RTCSessionDescription(message));
    if(peer_connections==3){
      console.log('I am here');
      pc2.setRemoteDescription(new RTCSessionDescription(message));
    }else{
      console.log('I am here');
      pc1.setRemoteDescription(new RTCSessionDescription(message));
    } 
  } else if (message.type === 'candidate' && isStarted) {
    
      if(peer_connections==3){
        var candidate2 = new RTCIceCandidate({sdpMLineIndex:message.label,
          candidate:message.candidate});
        //pc2.setRemoteDescription(new RTCSessionDescription(message));
        pc2.addIceCandidate(candidate2);
      }else{
        var candidate1 = new RTCIceCandidate({sdpMLineIndex:message.label,
          candidate:message.candidate});
        //pc1.setRemoteDescription(new RTCSessionDescription(message));
        pc1.addIceCandidate(candidate1);
      }
    //pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

// Send message to socket.io server to be sent to peer2. peer1 -> server -> peer2 and vice-versa
function sendMessage(message){
  console.log('Sending message: ', message);
  socket.emit('message', message);
}

// Initiate a video-chat session
function checkAndStart(peer_connections) { 
  console.log(peer_connections); 
  if (!isStarted && typeof localStream != 'undefined' && isChannelReady) {  
    if(peer_connections==3){
      console.log('creating connection to peer 3');
      createPeerConnection3p();
      isStarted = true;
      if (isInitiator) {
        doCall3p();
      }
    }else{
      createPeerConnection();
      isStarted = true;
      if (isInitiator) {
        doCall();
      }
      //console.log(peer_connections);
    }
  }
}

// Manage connections
function createPeerConnection() {
  try {
    pc1 = new RTCPeerConnection(pc_config, pc_constraints);  
    console.log("Calling pc.addStream(localStream)! Initiator: " + isInitiator);
    pc1.addStream(localStream);
    pc1.onicecandidate = handleIceCandidate;
    console.log('Created RTCPeerConnnection with:\n' +
      '  config: \'' + JSON.stringify(pc_config) + '\';\n' +
      '  constraints: \'' + JSON.stringify(pc_constraints) + '\'.'); 
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
      return;
  }
  //pc1.onaddstream = handleRemoteStreamAdded;
  pc1.onaddstream = handleRemoteStreamAdded;
  pc1.onremovestream = handleRemoteStreamRemoved;
  // if (isInitiator) {
  //   try {
  //     // Create a reliable data channel
  //     sendChannel = pc.createDataChannel("sendDataChannel",
  //       {reliable: true});
  //     trace('Created send data channel');
  //   } catch (e) {
  //     alert('Failed to create data channel. ');
  //     trace('createDataChannel() failed with exception: ' + e.message);
  //   }
  //   sendChannel.onopen = handleSendChannelStateChange; // When send channel opens change html for text box 1
  //   sendChannel.onmessage = handleMessage;
  //   sendChannel.onclose = handleSendChannelStateChange;
  // } else { // Joiner    
  //   pc1.ondatachannel = gotReceiveChannel;
  // }
}

function createPeerConnection3p() {
  try {
    pc2 = new RTCPeerConnection(pc_config, pc_constraints);  
    console.log("Calling pc.addStream(localStream)! Initiator: " + isInitiator);
    pc2.addStream(localStream);
    pc2.onicecandidate = handleIceCandidate;
    console.log('Created RTCPeerConnnection with:\n' +
      '  config: \'' + JSON.stringify(pc_config) + '\';\n' +
      '  constraints: \'' + JSON.stringify(pc_constraints) + '\'.'); 
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
      return;
  }
  pc2.onaddstream = handleRemoteStream3pAdded;
  pc2.onremovestream = handleRemoteStreamRemoved;
  // if (isInitiator) {
  //   try {
  //     // Create a reliable data channel
  //     sendChannel = pc.createDataChannel("sendDataChannel",
  //       {reliable: true});
  //     trace('Created send data channel');
  //   } catch (e) {
  //     alert('Failed to create data channel. ');
  //     trace('createDataChannel() failed with exception: ' + e.message);
  //   }
  //   sendChannel.onopen = handleSendChannelStateChange; // When send channel opens change html for text box 1
  //   sendChannel.onmessage = handleMessage;
  //   sendChannel.onclose = handleSendChannelStateChange;
  // } else { // Joiner    
  //   pc2.ondatachannel = gotReceiveChannel;
  // }
}

// Data channel management
function sendData() {
  var data = name+ ': '+sendTextarea.value;
  sendTextarea.value = '';
  chatChannel.value += data + '\n';
  if(isInitiator) sendChannel.send(data);
  else receiveChannel.send(data);
  trace('Sent data: ' + data);
}

// Handlers...

function gotReceiveChannel(event) {
  trace('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = handleMessage;
  receiveChannel.onopen = handleReceiveChannelStateChange;
  receiveChannel.onclose = handleReceiveChannelStateChange;
}

function handleMessage(event) {
  trace('Received message: ' + event.data);
  receiveTextarea.value += event.data + '\n';
  chatChannel.value += event.data + '\n'; // Update main channel
}

function handleSendChannelStateChange() {  // Handles the state of the initial html
  var readyState = sendChannel.readyState;
  trace('Send channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

function handleReceiveChannelStateChange() {// Change html
  var readyState = receiveChannel.readyState;
  trace('Receive channel state is: ' + readyState);
  // If channel ready, enable user's input
  if (readyState == "open") {
	    dataChannelSend.disabled = false;
	    dataChannelSend.focus();
	    dataChannelSend.placeholder = "";
	    sendButton.disabled = false;
	  } else {
	    dataChannelSend.disabled = true;
	    sendButton.disabled = true;
	  }
}

// ICE candidates management
function handleIceCandidate(event) {
  console.log('handleIceCandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate});
  } else {
    console.log('End of candidates.');
  }
}

// Create Offer
function doCall() {
  console.log('Creating Offer...');
  pc1.createOffer(setLocalAndSendMessage, onSignalingError, sdpConstraints);
}

function doCall3p() {
  console.log('Creating Offer...');
  pc2.createOffer(setLocalAndSendMessage3p, onSignalingError, sdpConstraints);
}

// Signalling error handler
function onSignalingError(error) {
	console.log('Failed to create signaling message : ' + error.name);
}

// Create Answer
function doAnswer() {
  console.log('Sending answer to peer.');
  pc1.createAnswer(setLocalAndSendMessage, onSignalingError, sdpConstraints);  
}

function doAnswer3p() {
  console.log('Sending answer to peer.');
  pc2.createAnswer(setLocalAndSendMessage3p, onSignalingError, sdpConstraints);  
}

// Success handler for both createOffer()
// and createAnswer()
function setLocalAndSendMessage(sessionDescription) {
  pc1.setLocalDescription(sessionDescription);
  sendMessage(sessionDescription);
}

function setLocalAndSendMessage3p(sessionDescription) {
  pc2.setLocalDescription(sessionDescription);
  sendMessage(sessionDescription);
}

/////////////////////////////////////////////////////////
// Remote stream handlers...

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  attachMediaStream(remoteVideo, event.stream);
  console.log('Remote stream attached!!.');
  remoteStream = event.stream;
}

function handleRemoteStream3pAdded(event) {
  console.log('Remote stream added.');
  attachMediaStream(remoteVideo3p, event.stream);
  console.log('Remote stream attached!!.');
  remoteStream3p = event.stream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}
/////////////////////////////////////////////////////////

/////////////////////////////////////////////////////////
// Clean-up functions...

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
}

function hangup3p() {
  console.log('Hanging up.');
  stop3p();
  sendMessage('bye');
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

function handleRemoteHangup3p() {
  console.log('Session terminated.');
  stop3p();
  isInitiator = false;
}

function stop() {
  isStarted = false;
  if (sendChannel) sendChannel.close();
  if (receiveChannel) receiveChannel.close();
  if (pc1) pc1.close();  
  pc1 = null;
  sendButton.disabled=true;
}

function stop3p() {
  isStarted = false;
  if (sendChannel) sendChannel.close();
  if (receiveChannel) receiveChannel.close();
  if (pc2) pc2.close();  
  pc2 = null;
  sendButton.disabled=true;
}

///////////////////////////////////////////