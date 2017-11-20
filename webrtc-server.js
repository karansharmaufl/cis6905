var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);


app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

app.use(express.static('public'));

var port = process.env.PORT || 3000;

http.listen(port, function(){
        console.log('listening on ', port);
      });


// Let's start managing connections...
io.on('connection', function(socket){
	
    	// Handle 'message' messages
        socket.on('message', function (message) {
                log('S --> got message: ', message);
                // channel-only broadcast...
                io.emit('message', message);
        });
      
        // Handle 'create or join' messages
        socket.on('create or join', function (room) {
                var clients = io.sockets.adapter.rooms[room];
                var numClients = (typeof clients !== 'undefined') ? Object.keys(clients).length : 0;
                if (numClients == 0){ // peer1 joins
                        socket.join(room);
                        socket.emit('created', room);
                } else  {             // peer2 joins
                        io.sockets.in(room).emit('join', room);
                        socket.join(room);
                        socket.emit('joined', room);
                 }
        });       
        
        function log(){
            var array = [">>> "];
            for (var i = 0; i < arguments.length; i++) {
            	array.push(arguments[i]);
            }
            socket.emit('log', array);
        }
        
});

