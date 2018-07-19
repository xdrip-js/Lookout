#!/usr/bin/env node

const express = require('express');
const socketIO = require('socket.io');
const LoopIO = require('./loopIO');
const PumpIO = require('./pumpIO');

const PORT = process.env.PORT || 3000;

const server = express()
  .use(express.static(__dirname + '/public'))
  .use('/node_modules', express.static(__dirname + '/node_modules'))
  // prevent error message on reloads as per https://stackoverflow.com/a/35284602
  .get('/*', function(req, res){
    res.sendFile(__dirname + '/public/index.html');
  })
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));

const io = socketIO(server);

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
});

const argv = require('yargs').argv;
const TransmitterIO = argv.sim ? require('./transmitterIO-simulated') : require('./transmitterIO');

TransmitterIO(io.of('/cgm'), argv.extend_sensor, argv.expired_cal);
LoopIO(io.of('/loop'));
PumpIO(io.of('/pump'));
