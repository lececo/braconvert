"use strict";
exports.__esModule = true;
const express = require("express"); // routing
const session = require("express-session"); // sessions
const cryptoJS = require("crypto-js"); // crypting
const fs = require("fs");
const ytdl = require('ytdl-core');
const debug = require("debug");
const debugLogin = debug("login"); // debugging login
const debugHTTP = debug("http"); // debugging http

// cross-origin-requests
const cors = require('cors')

const {createLogger, format, transports} = require('winston');
require('winston-daily-rotate-file');
const env = process.env.NODE_ENV || 'development';
const logDir = 'log';

const unicID = getUnicId();


// Create the log directory if it does not exist
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

const dailyRotateFileTransport = new transports.DailyRotateFile({
    filename: `${logDir}/%DATE%-results.log`,
    datePattern: 'YYYY-MM-DD'
});

const logger = createLogger({
    // change level if in dev environment versus production
    level: env === 'development' ? 'verbose' : 'info',
    format: format.combine(
        format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
    ),
    transports: [
        new transports.Console({
            level: 'info',
            format: format.combine(
                format.colorize(),
                format.printf(
                    info => `${info.timestamp} ${info.level}: ${info.message}`
                )
            )
        }),
        dailyRotateFileTransport
    ]
});


/*****************************************************************************
 ***  Create server with handler function and start it                       *
 *****************************************************************************/
var router = express();

const port = process.env.PORT || 1337;

// cors({credentials: true, origin: true})
router.use(cors({origin: true, exposedHeaders: ['Content-Disposition']}));

router.listen(port);

//--- parsing json -----------------------------------------------------------
router.use(express.json());


// Add headers
router.use(function (req, res, next) {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', "*");
    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    // Request headers you wish to allow
    //res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    res.setHeader('Access-Control-Allow-Credentials', "true");
    // Pass to next layer of middleware
    next();
});

//static files
router.use(express.static(__dirname + '/client/'));
router.use(express.static(__dirname + '/js/'));
router.use(express.static(__dirname + '/assets/static/'));
router.use(express.static(__dirname + '/assets/team/'));

/*****************************************************************************
 ***  Middleware Routers for Parsing, Session- and Rights-Management         *
 *****************************************************************************/
//--- session management -----------------------------------------------------
router.use(session({
    // save session even if not modified
    resave: true,
    // save session even if not used
    saveUninitialized: true,
    // forces cookie set on every response needed to set expiration (maxAge)
    rolling: true,
    // name of the cookie set is set by the server
    name: "sessionCookie",
    // encrypt session-id in cookie using "secret" as modifier
    secret: "geheim",
    // set some cookie-attributes. Here expiration-date (offset in ms)
    cookie: {maxAge: 3 * 60 * 10000}
}));


/*****************************************************************************
 *** sendData                                                                *
 *** Function that is called by each route to send data                      *
 *** gets userList from database , constructs and send response              *
 *****************************************************************************/
function sendData(status, res, message, id, filename) {
    /*
      status   : HTTP response state            (provided in any case)
      res      : Response object for responding (provided in any case)
      message  : Message to be returned         (provided in any case)
    */
    //--- Variable declaration with detailed type of response -------------------
    var response;

    if (!filename && !id) {
        response = {message: message};
    } else if (id && filename) {
        response = {message: message, id: id, filename: filename}
    } else if (filename) {
        response = {message: message, filename: filename}
    } else if (id) {
        response = {message: message, id: id}
    }

    res.status(status); // set HTTP response state, provided as parameter
    res.json(response); // send HTTP-response
    debugHTTP("\n-----------------------------------------------------------");
    debugHTTP(JSON.stringify(response, null, 2) + "\n");
}


function checkRights(req, res) {
    var response;
    if (!req.session.rights) {
        response = {message: "No session: Please turn off incognito or private browser mode!"};
        res.status(401); // set HTTP response state
        res.json(response); // send HTTP-response
        debugHTTP("\n-----------------------------------------------------------");
        debugHTTP(JSON.stringify(response, null, 2) + "\n");
        return false;
    }
    return true;
}


function getUnicId(url) {
    var r = Math.random().toString(36).substring(7);
    return cryptoJS.AES.encrypt(url, r).toString().replace(/\/|\+|\-|\*/g, "x");
}


router.use(function (req, res, next) {
    var message = ""; // To be set
    var username = "";
    try {
        if (req.sessionID.toString() !== "" ||
            req.cookies.toString() !== null ||
            !req.cookies.toString()) {
            next(); // call subsequent routers (only if logged in)
        } else {
            message = "Session expired: Please turn off incognito or private browser mode!";
            res.status(401);
            res.json({"message": message, "username": username});
        }
    } catch (e) {
        logger.error('ERROR in session check route: ' + e);
    }
});


router.get('/', function (req, res) {
    res.sendfile(__dirname + '/client/index.html');
});


router.post("/convert", function (req, res) {
    var url = (req.body.url ? req.body.url : "").trim();
    var format = (req.body.format ? req.body.format : "").trim();
    var message = "";
    var status = 500; // Initial HTTP response status
    var regexURL = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/i;

    //--- check Rights -> RETURN if not sufficient ------------------------------
    // if (!checkRights(req,res)) { return; }
    var pattURL = new RegExp(regexURL);

    //-- ok -> convert logic-----------------------------------
    if ((url !== "") && (format !== "") && pattURL.test(url) && format === "audio" || format === "video") {
        //const unicID = getUnicId();
        //const unicID = req.session.id;
        const util = require('util');
        const exec = util.promisify(require('child_process').exec);
        var command = null;
        var gFilename = null;

        if (format === "audio") {
            command = `youtube-dl -o \"download/${unicID}END%(title)s.%(ext)s\" -x --audio-format mp3 --audio-quality 0 \"${url}\"`;
        } else {
            command = `youtube-dl -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4' -o \"download/${unicID}END%(title)s.%(ext)s\" \"${url}\"`;
        }

        async function executeCommand(execCommand) {
            logger.info("start downloading " + url + "\n" +
                "With command " + execCommand);

            const {stdout, stderr} = await exec(execCommand);
            console.log('stdout:', stdout);
            console.log('stderr:', stderr);

            var filenameRegex = "Destination: download\/.*." + "\nDeleting original file download\/";
            var match = stdout.toString().match(filenameRegex);
            if (match) {
                gFilename = match.toString().substring(0, match.toString().length - 33);
                gFilename = gFilename.toString().replace(/.*END/g, "");
            } else {
                filenameRegex = "Merging formats into \"download\/.*." + "\nDeleting original file download\/";
                match = stdout.toString().match(filenameRegex);
                if (match) {
                    gFilename = match.toString().substring(0, match.toString().length - 34);
                    gFilename = gFilename.toString().replace(/.*END/g, "");
                } else {
                    logger.error('Possible REGEX ERROR!!! \n stdout output:' + stdout);
                    message = "Bad Request: not all mandatory parameters provided";
                    sendData(400, res, message); // send message and all data
                }
            }

            sendData(200, res, "Success", unicID, gFilename);
        }

        executeCommand(command).catch((err) => {
            logger.error(err);
        });
    } else {
        logger.warn('URL: ' + url, 'Format: ' + format, 'regex url test: ' + pattURL.test(url));

        message = "Bad Request: not all mandatory parameters provided";
        sendData(400, res, message); // send message and all data
    }
});


router.get("/download:id?", function (req, res) {
    var filename = req.query.name;
    var id = req.query.id;
    if (filename || id || id !== unicID) {
        if (!req.session.id) {
            logger.error('No Session ID!? \n ID is: ' + req.session.uID);
            var message = "No session: Please turn off incognito or private browser mode!";
            sendData(300, res, message); // send message and all data

            return;
        }


        var file = null;
        var path = require('path');
        var pathFile = "download\/" + id + 'END' + filename;
        var file = path.join(__dirname, pathFile);

        try {
            fs.readFile(file, function (err, data) {
                if (err) {
                    logger.error('ERROR in download route: ' + err);

                    var message = "Sorry: Please request your video or audio again!";
                    sendData(500, res, message); // send message and all data
                }

                res.header('Content-Disposition', `attachment; filename="${filename}"`);
                res.end(data, "utf-8");

                fs.unlink(file, function (err) {
                    if (err) {
                        logger.error('ERROR in deleting file: ' + err);
                    } else {
                        logger.info('Deleted file successfully.');
                    }
                });
            });
        } catch (e) {
            logger.error('ERROR in download route: ' + e);

            var message = "Sorry: Please request your video or audio again!";
            sendData(500, res, message); // send message and all data
        }
    } else {
        logger.error('filename or id not defined: filename=' + filename + ' id=' + id);

        var message = "Follow the how to use instructions!";
        sendData(500, res, message); // send message and all data
    }
});

//# sourceMappingURL=server.js.map
