// NOTE: Required by each app, so these will be seperate. Shared resources and events are managed by the Matrix one layer up.
// see lib/services/manager

console.log('Matrix OS Application Library Loading...')

// Globals
require('colors');
_ = require('lodash');

//needs sudo for audio commands disable until we figure this out
var request = require('request');
var lib = require('./lib');

var request = require('request');
var fs = require('fs');
var DataStore = require('nedb');
var events = require('events');
var eventEmitter = new events.EventEmitter();

// console.log('Env Vars:', process.env)


// If forked, send is available.
// Docker means no .send. Lets make a send to forward to stdout
if ( !_.isFunction(process.send)){
  process.send = function(obj){
    try {
      var send = JSON.stringify(obj);
    } catch (e) {
      console.error('App Data Error', e, obj);
    } finally {
      process.stdout.write(`${send}\n`);
    }
  }
  // if forked, stdin is piped to message events
  // Docker needs override
  process.stdin.on('readable', function(msg){
    try {
      var d = JSON.parse(msg)
    } catch (e){
      console.error('App Data In Error:', e, msg)
    } finally {
      process.emit('message', d);
    }
  })
}



process.setMaxListeners(50);

error = function(){
  console.error('[(%s)]⁊', appName);
  console.error.apply(null, arguments);
}

var appName = '';

var storeManager = {
  get: getStore,
  set: setStore,
  delete: deleteStore,
  remove: deleteStore
}

function getStore(key){
  var q = {};
  q[key]= { $exists: true };
  AppStore.findOne(q, function(err, resp){
    if (err) cb(err);
    cb(null, resp);
  });
}

function setStore(key, value){
  var obj = {};
  obj[key] = value;
  AppStore.insert(obj);
}

function deleteStore(key){
  var q = {};
  q[key]= { $exists: true };
  AppStore.remove(q, function(err, resp){
    if (err) cb(err);
    cb(null, resp);
  });
}


var fileManager = {
    save: function(url, filename, cb){
      var assetPath = __dirname + '/' + appName + '.matrix/storage/';
      request.get(url, function(err, resp, body){
        if (err) error(err);
        try {
          fs.accessSync(assetPath)
        } catch (e) {
          fs.mkdirSync(assetPath);
        }
        fs.writeFileSync(assetPath + filename, body);
        cb(null, body);
      });
    },
    stream: function(){
      // are we doing this? yes, for streaming media
    },
    remove: function(filename, cb){
    var assetPath = __dirname + '/' + appName + '.matrix/storage/';
    fs.unlink(assetPath + filename, cb);
  },
  load: function(cb){
    var assetPath = __dirname + '/' + appName + '.matrix/storage/';
    //todo: handle async and sync based on usage
    fs.readFile(assetPath + filename, cb);
  },
  list: function(cb){
    fs.readdir(assetPath, function(err, files){
      if (err) error(err);
      cb(null, files);
    });
  }
}

var matrixDebug = false;

// For sending events to other apps
function interAppNotification( appName, eventName, p ){
  var payload = p;
  var type;
  var event;

  if (arguments.length === 1){
    // global form
    type = 'app-message';
    payload = arguments[0]
  } else if ( arguments.length === 2){
    //app specific
    type = 'app-'+ appName +'-message';
    payload = arguments[1];
  } else {
    // app specific event namespaced
    type = 'app-'+ appName +'-message';
    event = eventName;
  }

  var sendObj = {
    type: type,
    payload: payload
  }

  if ( !_.isUndefined(event)){
    _.extend(sendObj, {event: event});
  }

  process.send(sendObj);
}

// For recieving events from other Apps
function interAppResponse( name, cb ){
  if (_.isUndefined(cb)){
    // for globals
    cb = name;
  }

  process.on('message', function(m){
      console.log('[M]->app'.blue, m, 'app-'+appName+'-message')
      // is global or app-specific
    if (m.type === 'trigger' || m.type === "app-message" || m.type === 'app-'+appName+'-message'){
      console.log('[M]->app(msg)'.blue, m)
      if ( _.isString(name) ){
        // if an event name was specified in the on()
        if ( m.eventName == name ){
          cb(m);
        }
        // no event name match, no fire listener
      } else {
        cb(m);
      }

    }

  });
}


function receiveHandler(cb) {
  console.log('util receive');

  process.on('message', function(m) {
    cb(null, m);
  });

  process.on('error', function(err) {
    if (err) return cb(err);
  });

  process.on('disconnect', function(w) {
    console.log(appName, ': disconnect', w);
  });

  process.on('exit', function() {
    //handle exit
    console.log(appName, ': exit', arguments);
  });
  }

  function setupCVHandlers(cb){
  process.on('message', function(m){
    if(m.type=== 'cv-data'){

    }
  })
}


function sendConfig(config){
  process.send({
    type: 'app-config',
    payload: config || Matrix.config
  });
}

function doTrigger(group, payload){

  // assume if no group, hit all of same group
  process.send({
    type:'trigger',
    group: group,
    payload:payload
  })
}

var Matrix = {
  appName: appName,
  name: function(name){ appName = name; return appName; },
  _: _,
  camera: lib.cv,
  request: request,
  led: require('./lib/led'),
  audio: {
    say: function(msg){
      console.log('say() is not implemented yet')
    },
    play: function(file, volume){
      console.log('play() is not implemented yet' )
      // var assetPath = __dirname + '/' + appName + '.matrix/storage/';
      // var volume = ( !_.isUndefined(volume)) ? volume: 80;
      // require('loudness').setVolume( volume, function(){});
      // var soundPlayer = new player( assetPath + file );
      // soundPlayer.play( function(err, played){
      //   if (err) error(err);
      //   console.log('played');
      // });
      // return soundPlayer;
    }
  },
  send: function(message){
    require('./lib/send.js').apply(Matrix, [message]);
  },
  type: function(type) {
    //set type, return this
    this.dataType = type;
    return this;
  },
  receive: receiveHandler,
  init: require('./lib/init.js'),
  gpio: require('./lib/gpio.js'),
  servo: require('./lib/gpio.js').servo,
  file: fileManager,
  emit: interAppNotification,
  startApp: function(name, config){
    appName = name;

    // Config is written as JSON by MOS -
    try {
      if ( _.isUndefined(config) ){
        Matrix.config = JSON.parse( require('fs').readFileSync( __dirname + '/'+ name +'.matrix/config.json'));
      } else {
        // for testing
        Matrix.config = config;
      }
    } catch(e){
      return error(appName, 'invalid config.json', e);
    }

    if ( Matrix.config.name !== appName ){
      return console.error(appName + '.matrix is not the same as config name:', Matrix.config.name );
    }

    // make configuration available globally `Matrix.services.vehicle.engine`
    _.each( _.keys(Matrix.config.settings), function(k){
        Matrix[k] = Matrix.config.settings[k];
    })

    // generic message handlers
    process.on('message', function(m){
      if (m.type === 'request-config'){
        sendConfig();
      } else if ( m.type === 'container-status'){
        Matrix.pid = m.pid;
      }
    })

    return Matrix;
  },
  store: storeManager,
  debug: matrixDebug,
  notify: interAppNotification,
  on: interAppResponse,
  trigger: doTrigger,
  color: require('tinycolor2'),
  static: function(){
    console.log('static not implmented uyet')
  }
}

module.exports = Matrix;


Matrix.ready = function(cb){
  // handle ready
  process.on('message', function(m){
    if (m.eventType === "container-ready"){
      console.log("Matrix OS Handlers Ready")
      cb();
    }
  })
}
