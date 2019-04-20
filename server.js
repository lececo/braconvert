"use strict";
exports.__esModule = true;

// global variable
var fileid = null;
var filenameID = null;

const cluser = require("cluster");
const os = require("os");
const cryptoJS = require("crypto-js"); // crypting

const debug = require("debug");
const {createLogger, format, transports} = require('winston');
const debugHTTP = debug("http"); // debugging http
//require('winston-daily-rotate-file');
//const logDir = 'log';
const env = process.env.NODE_ENV || 'development';

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
        //          dailyRotateFileTransport
    ]
});

function cleanString(input) {
    var output = "";
    for (var i=0; i<input.length; i++) {
        if (input.charCodeAt(i) <= 127) {
            output += input.charAt(i);
        }
    }
    return output;
}

function getUnicId(url) {
    var r = Math.random().toString(36).substring(7);
    return cryptoJS.AES.encrypt(url, r).toString().replace(/\/|\+|\-|\*/g, "x");
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

/*****************************************************************************
 *** sendData                                                                *
 *** Function that is called by each route to send data                      *
 *** gets userList from database , constructs and send response              *
 *****************************************************************************/
function sendData(status, res, message, filename) {
    /*
      status   : HTTP response state            (provided in any case)
      res      : Response object for responding (provided in any case)
      message  : Message to be returned         (provided in any case)
    */
    //--- Variable declaration with detailed type of response -------------------
    var response;

    if (!filename) {
        response = {message: message};
    } else {
        response = {message: message, filename: filename}
    }

    res.status(status); // set HTTP response state, provided as parameter
    res.json(response); // send HTTP-response
    debugHTTP("\n-----------------------------------------------------------");
    debugHTTP(JSON.stringify(response, null, 2) + "\n");
}


async function executeCommand(execCommand, res) {
    const util = require('util');
    const exec = util.promisify(require('child_process').exec);

    logger.info("start downloading! With command " + execCommand);

    exec(execCommand).then((result) => {
        console.log('stdout:', result.stdout);
        console.log('stderr:', result.stderr);

        var stdout = result.stdout;

        var filenameRegex = "Destination: download\/.*." + "\nDeleting original file download\/";
        var match = stdout.toString().match(filenameRegex);
        if (match) {
            filenameID = match.toString().substring(0, match.toString().length - 33);
            filenameID = filenameID.toString().replace(/.*END/g, "");
        } else {
            filenameRegex = "Merging formats into \"download\/.*." + "\nDeleting original file download\/";
            match = stdout.toString().match(filenameRegex);
            if (match) {
                filenameID = match.toString().substring(0, match.toString().length - 34);
                filenameID = filenameID.toString().replace(/.*END/g, "");
            } else {
                logger.error('Possible REGEX ERROR!!! \n stdout output:' + stdout);
                var message = "Bad Request: not all mandatory parameters provided";
                sendData(400, res, message); // send message and all data
            }
        }

        sendData(200, res, "Success", filenameID);
    })
        .catch(e => {
            logger.error('Error: ' + e);
            var message = "";
            if (e.toString().includes("Unsupported URL")) {
                message = "URL is not correct. Please check the URL!";
            } else if (e.toString().includes("Incomplete YouTube ID")) {
                message = "URL is incomplete. Please check the URL!";
            } else if (e.toString().includes("This video is unavailable")) {
                message = "This video is unavailable. Maybe check the URL."
            } else if (e.toString().includes("caused by URLError")) {
                message = "URL error. Please check the URL!";
            } else {
                message = "Unknown error please try again later!";
            }

            sendData(400, res, message);
        });
}

if (cluser.isMaster) {
    const n_cpus = os.cpus().length;
    console.log(`Forking ${n_cpus} CPUs`);
    for (let i = 0; i < n_cpus; i++) {
        cluser.fork();
    }
} else {
    const express = require("express"); // routing
    const session = require("express-session"); // sessions
    const fs = require("fs");
    //const ytdl = require('ytdl-core');
    //const debugLogin = debug("login"); // debugging login


    // cross-origin-requests
    const cors = require('cors')


    //const unicID = getUnicId();


// Create the log directory if it does not exist

    /*
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
    }

    const dailyRotateFileTransport = new transports.DailyRotateFile({
        filename: `${logDir}/%DATE%-results.log`,
        datePattern: 'YYYY-MM-DD'
    });
    */


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
            var command = null;

            fileid = getUnicId();

            if (format === "audio") {
                command = `youtube-dl -o \"download/${fileid}END%(title)s.%(ext)s\" -x --audio-format mp3 --audio-quality 0 \"${url}\"`;
            } else {
                command = `youtube-dl -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4' -o \"download/${fileid}END%(title)s.%(ext)s\" \"${url}\"`;
            }

            executeCommand(command, res).catch((err) => {
                logger.error(err);
            });
        } else {
            logger.warn('URL: ' + url, 'Format: ' + format, 'regex url test: ' + pattURL.test(url));

            message = "Bad Request: not all mandatory parameters provided";
            sendData(400, res, message); // send message and all data
        }
    });


    router.get("/download", function (req, res) {
        var filename = filenameID;
        var id = fileid;
        if (filename || id || id !== fileid) {
            if (!req.session.id) {
                logger.error('No Session ID!? \n ID is: ' + req.session.uID);
                var message = "No session: Please turn off incognito or private browser mode!";
                sendData(300, res, message); // send message and all data

                return;
            }

            var path = require('path');
            var pathFile = "download\/" + id + 'END' + filename;
            var file = path.join(__dirname, pathFile);

            try {
                fs.readFile(file, function (err, data) {
                    if (err) {
                        logger.error('ERROR in download route: ' + err);

                        var message = "Sorry: Please request your video or audio again!";
                        sendData(500, res, message); // send message and all data

                        return;
                    }

                    filename = cleanString(filename);
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
}
//# sourceMappingURL=server.js.map
