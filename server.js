const cluster = require("cluster");

if (cluster.isMaster) {
    const n_cpus = require('os').cpus().length;
    console.log(`Forking ${n_cpus} CPUs`);
    for (let i = 0; i < n_cpus; i++) {
        cluster.fork();
    }

    cluster.on('exit', function (worker) {

        // Replace the dead worker,
        // we're not sentimental
        console.log('Worker %d died :(', worker.id);
        cluster.fork();

    });
} else {
    const cryptoJS = require("crypto-js"); // crypting

    const debug = require("debug");
    const {createLogger, format, transports} = require('winston');
    const debugHTTP = debug("http"); // debugging http
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

    const express = require("express"); // routing
    const session = require("express-session"); // sessions
    const fs = require("fs");
    const ytdl = require('ytdl-core');
    const ffmpeg = require('fluent-ffmpeg');
    const path = require('path');

    // cross-origin-requests
    const cors = require('cors')


    /*****************************************************************************
     ***  Create server with handler function and start it                       *
     *****************************************************************************/
    var router = express();
    const port = process.env.PORT || 1337;


    /*****************************************************************************
     ***  Some functions                                                          *
     *****************************************************************************/
    function cleanString(input) {
        var output = "";
        for (var i = 0; i < input.length; i++) {
            if (input.charCodeAt(i) <= 127) {
                output += input.charAt(i);
            }
        }
        return output;
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


// cors({credentials: true, origin: true})
    router.use(cors({origin: true, exposedHeaders: ['Content-Disposition']}));

    router.listen(port);

//--- parsing json -----------------------------------------------------------
    router.use(express.json());

//static files
    router.use(express.static(__dirname + '/client/'));
    router.use(express.static(__dirname + '/js/'));
    router.use(express.static(__dirname + '/assets/static/'));
    router.use(express.static(__dirname + '/assets/team/'));

// Add headers
    router.use(function (req, res, next) {
        // Website you wish to allow to connect
        res.setHeader('Access-Control-Allow-Origin', "https://braconvert.com");
        // Request methods you wish to allow
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        // Request headers you wish to allow
        //res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
        res.setHeader('Access-Control-Allow-Credentials', "true");
        // Pass to next layer of middleware
        next();
    });

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
        let url = (req.body.url ? req.body.url : "").trim();
        let format = (req.body.format ? req.body.format : "").trim();
        let message = "";
        let regexURL = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/i;

        //--- check Rights -> RETURN if not sufficient ------------------------------
        // if (!checkRights(req,res)) { return; }
        let pattURL = new RegExp(regexURL);


        //-- ok -> convert logic-----------------------------------
        if ((url !== "") && (format !== "") && pattURL.test(url) && format === "audio" || format === "video") {
            ytdl.getInfo(url, (err, info) => {
                if (err) {
                    sendData(400, res, "Can't donwload video. It is restricted");
                } else {
                    req.session.gInfo = info;
                    req.session.gUrl = url;
                    req.session.gFormat = format;
                    req.session.gFilename = info.title;

                    sendData(200, res, "Success", info.title);
                }
            });

        } else {
            logger.warn('URL: ' + url, 'Format: ' + format, 'regex url test: ' + pattURL.test(url));

            message = "Bad Request: not all mandatory parameters provided";
            sendData(400, res, message); // send message and all data
        }
    });


    router.get("/download", function (req, res) {
        if (req.session.gUrl) {
            if (!req.session.id) {
                logger.error('No Session ID!? \n ID is: ' + req.session.uID);
                var message = "No session: Please turn off incognito or private browser mode!";
                sendData(400, res, message); // send message and all data

                return;
            }

            const audioOutput = path.resolve(__dirname, 'sound.mp4');
            const mainOutput = path.resolve(__dirname, req.session.gFilename + ".mp4");

            if (req.session.gFormat === "audio") {
                let filename = cleanString(req.session.gFilename);
                res.header('Content-Disposition', `attachment; filename="${filename}.mp3"`);

                ytdl.downloadFromInfo(req.session.gInfo, {
                    filter: format => {
                        return format.container === 'm4a' && !format.encoding;
                    }
                }).pipe(res);

            } else if (req.session.gFormat === "video") {
                ytdl.downloadFromInfo(req.session.gInfo, {
                    filter: format => {
                        return format.container === 'm4a' && !format.encoding;
                    }
                })
                // Write audio to file since ffmpeg supports only one input stream.
                    .pipe(fs.createWriteStream(audioOutput))
                    .on('finish', () => {
                        ffmpeg()
                            .input(ytdl.downloadFromInfo(req.session.gInfo, {
                                filter: format => {
                                    return format.container === 'mp4' && !format.audioEncoding;
                                }
                            }))
                            .videoCodec('copy')
                            .input(audioOutput)
                            .audioCodec('copy')
                            .save(mainOutput)
                            .on('error', console.error)
                            .on('progress', progress => {
                            }).on('end', () => {

                            var data = fs.readFileSync(mainOutput);
                            let filename = cleanString(req.session.gFilename);
                            res.header('Content-Disposition', `attachment; filename="${filename}.mp4"`);
                            res.end(data, "utf-8");

                            fs.unlink(audioOutput, err => {
                                if (err) console.error(err);
                                else console.log('\nfinished downloading');
                            });
                        });
                    });
            }


        } else {
            logger.error('No URL was defined');

            var message = "Please follow the how to instructions!";
            sendData(400, res, message); // send message and all data
        }
    });
}
//# sourceMappingURL=server.js.map
